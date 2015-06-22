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
            this.key = null;
            this.pkey = null;
            this.psalt = null;
            this.pN = null;
            this.pr = null;
            this.pp = null;
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

        _strengthenScrypt: function (passwd, options) {
            var d = $.Deferred();
            options = options || {};
            options = _.extend({N: 16384, r: 8, p: 1, dkLen: 32, salt: husher._getRandomWords(2)}, options);
            this.sweatshop.queue('sjcl', 'scrypt', [passwd, options])
                .done(function (key) {
                    options.key = key;
                    d.resolve(options);
                })
                .fail(d.reject);
            return d.promise();
        },

        randomKey: function () {
            // 8 words, for a 256 bit key.
            return sjcl.codec.base64.fromBits(husher._getRandomWords(8));
        },

        randomId: function () {
            return sjcl.codec.hex.fromBits(husher._getRandomWords(2));
        },

        buildPublicKey: function (key) {
            return new sjcl.ecc.elGamal.publicKey(husher._CURVE, husher._b64.toBits(key));
        },

        randomize: function () {
            var p = $.getJSON('/random');
            p.done(function (rndarr) {
                var ab = new Uint32Array(32);
                ab.set(rndarr);
                sjcl.random.addEntropy(ab, 1024, "crypho.com");
            });
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
            key = key || this.key.pub;
            if (adata) {
                params.adata = adata;
            }
            ct = JSON.parse(sjcl.encrypt(key, pt, params));
            ct = _.omit(ct, _.keys(defaultParams));
            ct.v = husher._currVersion;
            return JSON.stringify(ct);
        },

        decrypt: function (ct, key) {
            key = key || this.key.sec;
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
            return husher._b64.fromBits(this.signKey.sec.sign(hash));
        },

        verify: function (data, signature) {
            var hash = husher._hash(data);
            signature = husher._b64.toBits(signature);
            try {
                return this.signKey.pub.verify(hash, signature);
            } catch (e) {
                return false;
            }
        },

        generate: function (password) {
            var d = $.Deferred(),
                self = this;
            husher._strengthenScrypt(password).done(function (strengthened) {
                self.key = sjcl.ecc.elGamal.generateKeys(husher._CURVE);
                self.signKey = sjcl.ecc.ecdsa.generateKeys(husher._CURVE);
                self.pkey = strengthened.key;
                self.psalt = strengthened.salt;
                self.pN = strengthened.N;
                self.pr = strengthened.r;
                self.pp = strengthened.p;
                d.resolve(self);
            }).fail(d.reject);
            return d.promise();
        },

        toJSON: function (email) {
            var encsec = JSON.parse(
                sjcl.encrypt(
                    this.pkey,
                    husher._b64.fromBits(this.key.sec._exponent.toBits()),
                    { iter: 1000,
                      ks: 256,
                      ts: 128,
                      mode: 'ccm',
                      cipher: 'aes',
                      adata: email}
                ));
            return {
                pub: husher._b64.fromBits(this.key.pub._point.toBits()),
                sec: {
                    psalt: husher._b64.fromBits(this.psalt),
                    pN: this.pN,
                    pr: this.pr,
                    pp: this.pp,
                    iv: encsec.iv,
                    ct: encsec.ct,
                    adata: email
                }
            };
        },

        fromJSON: function (passwd, json) {
            var d = $.Deferred(),
                self = this,
                exp, strengthen;
            // Regenerate key from password
            this.psalt = husher._b64.toBits(json.sec.psalt);

            strengthen = husher._strengthenScrypt(passwd, {salt: this.psalt});

            strengthen.done(function (strengthened) {

                self.pkey = strengthened.key;
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
                        self.pkey,
                        JSON.stringify(json.sec)
                    )));

                    self.key = {
                        sec: new sjcl.ecc.elGamal.secretKey(husher._CURVE, exp),
                        pub: husher.buildPublicKey(json.pub)
                    };
                    d.resolve();
                } catch (e) {
                    self.key = null;
                    self.pkey = null;
                    self.psalt = null;
                    d.reject();
                }


            });

            return d.promise();
        },

        toSession: function () {
            return {
                pub: husher._b64.fromBits(this.key.pub._point.toBits()),
                sec: husher._b64.fromBits(this.key.sec._exponent.toBits())
            };
        },

        fromSession: function (json) {
            var exp = sjcl.bn.fromBits(husher._b64.toBits(json.sec));
            this.key = {
                sec: new sjcl.ecc.elGamal.secretKey(husher._CURVE, exp),
                pub: husher.buildPublicKey(json.pub)
            };
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