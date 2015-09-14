define(['sjcl', 'underscore' , 'backbone', 'jquery', './sweatshop'], function (sjcl, _, Backbone, $, Sweatshop) {

    var husher = {

        _CURVE: sjcl.ecc.curves.c384,
        _b64: sjcl.codec.base64,
        _hex: sjcl.codec.hex,
        _bytes: sjcl.codec.bytes,
        _hash: sjcl.hash.sha256.hash,

        _versions: {
            1: {
                v: 1,
                iter: 1000,
                ks: 256,
                ts: 128,
                mode: 'ccm',
                cipher: 'aes'
            }
        },

        sweatshop: new Sweatshop(),

        _currVersion: 1,

        Husher: function (options) {
            this.encryptionKey = null;  // El Gamal ECC keypair
            this.signingKey = null;     // ECDSA keypair
            this.macKey = null;         // a key form which the AES keys that encrypt the private keys are generated
            this.authKey = null;        // the key used (hashed) for authentication
            this.scryptSalt = null;     // the salt used by the scrypt KDF, only applicable for version 1
            this.pN = null;             // scrypt N
            this.pr = null;             // scrypt r
            this.pp = null;             // scrypt p
        },

        _getRandomWords: function (count) {
            return sjcl.random.randomWords(count);
        },

        _generateKeyPair: function () {
            return sjcl.ecc.elGamal.generateKeys(husher._CURVE);
        },

        _generateSigningKeyPair: function () {
            return sjcl.ecc.ecdsa.generateKeys(husher._CURVE);
        },

        // Memoize scrypt so that if we request again the same thing we don't spend time on it.
        // We also provide a hasher for the memoize as by default underscore uses only the first argument.
        _strengthenScrypt: _.memoize(function (passwd, options) {
            var d = $.Deferred();
            options = options || {};
            options = _.extend({N: 16384, r: 8, p: 1, dkLen: 64, salt: husher._getRandomWords(2)}, options);

            this.sweatshop.queue('sjcl', 'scrypt', [passwd, options])
                .done(function (key) {
                    options.key = key.splice(0,8);
                    options.key2 =  key;
                    d.resolve(options);
                })
                .fail(d.reject);
            return d.promise();
        }, function (passwd, options) {     // The memoize hasher
            return husher._b64.fromBits(husher._hash(passwd + JSON.stringify(options)));
        }),

        randomKey: function () {
            // 8 words, for a 256 bit key.
            return sjcl.codec.base64.fromBits(husher._getRandomWords(8));
        },

        randomId: function () {
            return sjcl.codec.hex.fromBits(husher._getRandomWords(2));
        },

        buildPublicKey: function (key, family) {
            if (family === 'ecdsa') {
                return new sjcl.ecc.ecdsa.publicKey(husher._CURVE, husher._b64.toBits(key));
            }
            return new sjcl.ecc.elGamal.publicKey(husher._CURVE, husher._b64.toBits(key));
        },

        progress: function () {
            return sjcl.random.getProgress();
        },

        ready: $.Deferred()
    };

    // Entropy event aggregator
    husher.entropyNotifier = _.extend(Backbone.Events, {

        _throttledChange: _.throttle(function (p) {
            husher.entropyNotifier.trigger('change', p);
        }, 300),

        onProgressChange: function (p) {
            husher.entropyNotifier._throttledChange(p);
        },

        onSeedStateChange: function (s) {
            husher.entropyNotifier.trigger('ready', s);
            husher.ready.resolve();
        }

    });

    husher.Husher.prototype = {

        encrypt: function (pt, key, adata) {
            var defaultParams = husher._versions[husher._currVersion], params, ct;
            params = _.clone(defaultParams);
            if (key && !(key instanceof sjcl.ecc.elGamal.publicKey) && !adata) {
                throw new Error("Only authenticated CCM supported");
            }
            key = key || this.encryptionKey.pub;
            if (adata) {
                params.adata = adata;
            }
            ct = JSON.parse(sjcl.encrypt(key, pt, params));
            ct = _.omit(ct, _.keys(defaultParams));
            ct.v = husher._currVersion;
            return JSON.stringify(ct);
        },

        decrypt: function (ct, key) {
            key = key || this.encryptionKey.sec;
            ct = JSON.parse(ct);
            if (ct.v) {
                ct = _.defaults(ct, husher._versions[ct.v]);
            }
            ct = JSON.stringify(ct);
            return sjcl.decrypt(key, ct);
        },

        encryptBinary: function (pt, key, adata) {
            var params = _.clone(husher._versions[husher._currVersion]);
            if (adata) {
                params.adata = adata;
            }
            var p = husher.sweatshop.queue('sjcl', 'encryptBinary',
                [key, pt, params]);
            return p;
        },

        decryptBinary: function (ct, key, params) {
            var p = husher.sweatshop.queue('sjcl', 'decryptBinary',
                [key, ct, _.extend(params, husher._versions[params.v])]);
            return p;
        },

        sign: function (data) {
            var hash = husher._hash(data);
            return husher._b64.fromBits(this.signingKey.sec.sign(hash));
        },

        verify: function (data, signature, publicKey) {
            var hash = husher._hash(data);
            signature = husher._b64.toBits(signature);
            publicKey = publicKey || this.signingKey.pub
            try {
                return publicKey.verify(hash, signature);
            } catch (e) {
                return false;
            }
        },

        authHash: function () {
            return husher._b64.fromBits(husher._hash(this.authKey || ''));
        },

        generate: function (password, email) {
            var d = $.Deferred(),
                self = this,
                scryptSalt;

            email = email.trim().toLowerCase();

            // Use an email-derived salt
            scryptSalt = husher._hash(email + '-crypho.com').slice(0,2);

            husher._strengthenScrypt(password, {salt: scryptSalt}).done(function (strengthened) {
                self.encryptionKey = sjcl.ecc.elGamal.generateKeys(husher._CURVE);
                self.signingKey = sjcl.ecc.ecdsa.generateKeys(husher._CURVE);
                self.macKey = strengthened.key;     // The strengthened key used to encrypt the private El Gamal keys
                self.authKey = strengthened.key2;   // The strengthened key used (hashed) for authentication
                self.scryptSalt = strengthened.salt;
                self.pN = strengthened.N;
                self.pr = strengthened.r;
                self.pp = strengthened.p;
                d.resolve(self);
            }).fail(d.reject);
            return d.promise();
        },

        // Return the user's public fingerprint, which is derived by hashing together the two public keys,
        // then using the first 16 hexadecimal characters.
        fingerprint: function () {
            var encryptionPublic = this.encryptionKey.pub._point.toBits(),
                signingPublic = this.signingKey.pub._point.toBits();
            return husher._hash(encryptionPublic.concat(signingPublic));
        },

        // toJSON from the time when we did not have a sign key.
        _legacyToJSON: function (email) {
            email = email.trim().toLowerCase();
            var encsec = JSON.parse(
                sjcl.encrypt(
                    this.macKey,
                    husher._b64.fromBits(this.encryptionKey.sec._exponent.toBits()),
                    { iter: 1000,
                      ks: 256,
                      ts: 128,
                      mode: 'ccm',
                      cipher: 'aes',
                      adata: email}
                ));
            return {
                pub: husher._b64.fromBits(this.encryptionKey.pub._point.toBits()),
                sec: {
                    scryptSalt: husher._b64.fromBits(this.scryptSalt),
                    pN: this.pN,
                    pr: this.pr,
                    pp: this.pp,
                    iv: encsec.iv,
                    ct: encsec.ct,
                    adata: email
                }
            };
        },

        // fromJSON from the time when we did not have a sign key.
        _legacyFromJSON: function (passwd, json) {
            var d = $.Deferred(),
                self = this,
                exp, strengthen;
            // Regenerate key from password
            this.scryptSalt = husher._b64.toBits(json.sec.scryptSalt);

            strengthen = husher._strengthenScrypt(passwd, {salt: this.scryptSalt});

            strengthen.done(function (strengthened) {

                self.macKey = strengthened.key;
                json.sec = _.defaults(json.sec, {
                    iter: 1000,
                    ks: 256,
                    ts: 128,
                    mode: 'ccm',
                    cipher: 'aes'
                });

                try {
                    // Calculate the curve's exponent
                    exp = sjcl.bn.fromBits(husher._b64.toBits(sjcl.decrypt(
                        self.macKey,
                        JSON.stringify(json.sec)
                    )));

                    self.encryptionKey = {
                        sec: new sjcl.ecc.elGamal.secretKey(husher._CURVE, exp),
                        pub: husher.buildPublicKey(json.pub)
                    };
                    d.resolve();
                } catch (e) {
                    self.encryptionKey = null;
                    self.macKey = null;
                    self.scryptSalt = null;
                    d.reject();
                }


            });

            return d.promise();
        },

        toJSON: function (email) {
            var aesOptions,
                encryptedEncryptionPrivate,
                encryptedSigningPrivate,
                encrKey, encrSalt,
                signingKey, signSalt,
                mac;

            email = email.trim().toLowerCase();
            aesOptions =  _.defaults({adata: email}, husher._versions['1']);

            // If we do not have a sign key use the legacy toJSON
            if (!this.signingKey) {
                return this._legacyToJSON(email);
            }

            mac = new sjcl.misc.hmac(this.macKey);
            encrSalt = husher.randomKey();
            signSalt = husher.randomKey();
            encrKey = mac.mac(husher._b64.toBits(encrSalt));
            signingKey = mac.mac(husher._b64.toBits(signSalt));

            encryptedEncryptionPrivate = JSON.parse(
                sjcl.encrypt(
                    encrKey,
                    husher._b64.fromBits(this.encryptionKey.sec._exponent.toBits()),
                    aesOptions
                )
            );

            encryptedSigningPrivate = JSON.parse(
               sjcl.encrypt(
                   signingKey,
                   husher._b64.fromBits(this.signingKey.sec._exponent.toBits()),
                   aesOptions
            ));

            return {
                scrypt: {
                    scryptSalt: husher._b64.fromBits(this.scryptSalt),
                    pN: this.pN,
                    pr: this.pr,
                    pp: this.pp,
                },

                encKey: {
                    macSalt: encrSalt,
                    pub: husher._b64.fromBits(this.encryptionKey.pub._point.toBits()),
                    sec: {
                        macSalt: encrSalt,
                        iv: encryptedEncryptionPrivate.iv,
                        ct: encryptedEncryptionPrivate.ct,
                        adata: email
                    }
                },

                signingKey: {
                    pub: husher._b64.fromBits(this.signingKey.pub._point.toBits()),
                    sec: {
                        macSalt: signSalt,
                        iv: encryptedSigningPrivate.iv,
                        ct: encryptedSigningPrivate.ct,
                        adata: email
                    }
                },

                authHash: this.authHash(),

                version: 2
            };
        },

        fromJSON: function (passwd, json) {
            var d = $.Deferred(),
                self = this,
                exp, data;

            if (!(json.version && json.version === 2)) {
                return this._legacyFromJSON(passwd, json);
            }

            // Regenerate key from password
            this.scryptSalt = husher._b64.toBits(json.scrypt.scryptSalt);

            husher._strengthenScrypt(passwd, {salt: this.scryptSalt})
            .done(function (strengthened) {
                var mac, macSalt, encKey;
                self.macKey = strengthened.key;
                self.authKey = strengthened.key2;

                try {
                    mac = new sjcl.misc.hmac(self.macKey);

                    // First decrypt the private encryption key
                    data = _.defaults(json.encKey.sec, husher._versions['1']);
                    macSalt = json.encKey.sec.macSalt;
                    encKey = mac.mac(husher._b64.toBits(macSalt));

                    // Calculate the curve's exponent
                    exp = sjcl.bn.fromBits(
                        husher._b64.toBits(
                            sjcl.decrypt(
                                encKey,
                                JSON.stringify(data)
                            )
                        )
                    );

                    self.encryptionKey = {
                        sec: new sjcl.ecc.elGamal.secretKey(husher._CURVE, exp),
                        pub: husher.buildPublicKey(json.encKey.pub)
                    };

                    // Then decrypt the private signing key
                    data = _.defaults(json.signingKey.sec, husher._versions['1']);
                    macSalt = json.signingKey.sec.macSalt;
                    encKey = mac.mac(husher._b64.toBits(macSalt));

                    // Calculate the curve's exponent
                    exp = sjcl.bn.fromBits(husher._b64.toBits(sjcl.decrypt(
                        encKey,
                        JSON.stringify(data)
                    )));

                    self.signingKey = {
                        sec: new sjcl.ecc.ecdsa.secretKey(husher._CURVE, exp),
                        pub: husher.buildPublicKey(json.signingKey.pub, 'ecdsa')
                    };

                    d.resolve();

                } catch (e) {
                    console.log(e);
                    self.encryptionKey = null;
                    self.macKey = null;
                    self.scryptSalt = null;
                    d.reject();
                }
            })
            .fail(d.reject);

            return d.promise();
        },

        toSession: function () {
            return {
                encryptionKey: {
                    pub: husher._b64.fromBits(this.encryptionKey.pub._point.toBits()),
                    sec: husher._b64.fromBits(this.encryptionKey.sec._exponent.toBits())
                },

                signingKey: {
                    pub: husher._b64.fromBits(this.signingKey.pub._point.toBits()),
                    sec: husher._b64.fromBits(this.signingKey.sec._exponent.toBits())
                },

                authKey: this.authKey
            };
        },

        fromSession: function (json) {
            var exp = sjcl.bn.fromBits(husher._b64.toBits(json.encryptionKey.sec));
            this.encryptionKey = {
                sec: new sjcl.ecc.elGamal.secretKey(husher._CURVE, exp),
                pub: husher.buildPublicKey(json.encryptionKey.pub)
            };

            exp = sjcl.bn.fromBits(husher._b64.toBits(json.signingKey.sec));
            this.signingKey = {
                sec: new sjcl.ecc.ecdsa.secretKey(husher._CURVE, exp),
                pub: husher.buildPublicKey(json.signingKey.pub, 'ecdsa')
            };

            this.authKey = json.authKey;
        }
    };


    // Set default paranoia
    sjcl.random.setDefaultParanoia(8);
    // Start entropy collection
    sjcl.random.startCollectors();

    // Register entropy event handlers
    sjcl.random.addEventListener('progress', husher.entropyNotifier.onProgressChange);
    sjcl.random.addEventListener('seeded', husher.entropyNotifier.onSeedStateChange);

    // Resolve the entropy deferred if it's already seeded
    if (sjcl.random.isReady()) {
        husher.ready.resolve();
    }


    return husher;
});