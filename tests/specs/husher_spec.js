define(['crypho/husher', 'sjcl'], function (husher, sjcl) {

    husher.sweatshop.registerWorker('sjcl', 'sjcl.worker.js');

    describe('Husher Crypto helper', function () {
        var h;

        beforeAll(function(done){
            h = new husher.Husher();
            h.generate('secret').done(function(){done();});
        });

        it('generates elGamal public/private keys of the NIST 384 family when calling _generateKeyPair()', function () {
            var kp = husher._generateKeyPair();
            expect(kp.pub instanceof sjcl.ecc.elGamal.publicKey).toBeTruthy();
            expect(kp.sec instanceof sjcl.ecc.elGamal.secretKey).toBeTruthy();
            expect(kp.pub._curve).toEqual(sjcl.ecc.curves.c384);
            expect(kp.sec._curve).toEqual(sjcl.ecc.curves.c384);
        });

        it('strengthens a key with scrypt when calling _strengthenScrypt()', function (done) {
            husher._strengthenScrypt('secret')
            .done(function (res) {
                expect(res.key.length).toEqual(8); // 8 words = 256 bit
                expect(res.key2.length).toEqual(8); // 8 words = 256 bit
                expect(res.salt.length).toEqual(2); // 2 words = 64 bit
                done();
            });
        });

        it('generates random 256 bit keys suitable for AES encryption', function () {
            var key = husher.randomKey();
            var bits = sjcl.codec.base64.toBits(key);
            expect(bits.length).toEqual(8);
        });

        it('generates elGamal public/private keys of the NIST 384 family when calling generate()', function () {
            expect(h.encryptionKey.pub instanceof sjcl.ecc.elGamal.publicKey).toBeTruthy();
            expect(h.encryptionKey.sec instanceof sjcl.ecc.elGamal.secretKey).toBeTruthy();
            expect(h.signingKey.pub instanceof sjcl.ecc.ecdsa.publicKey).toBeTruthy();
            expect(h.signingKey.sec instanceof sjcl.ecc.ecdsa.secretKey).toBeTruthy();
            expect(h.encryptionKey.pub._curve).toEqual(sjcl.ecc.curves.c384);
            expect(h.encryptionKey.sec._curve).toEqual(sjcl.ecc.curves.c384);
        });

        it('generates an 256 bit AES from the provided passphrase using scrypt when calling generate()', function (done) {
            expect(h.keyGene.length).toEqual(8); // 8 words = 256 bit
            expect(h.skey.length).toEqual(8); // 8 words = 256 bit
            expect(h.scryptSalt.length).toEqual(2); // 2 words = 64 bit
            husher._strengthenScrypt('secret', {salt: h.scryptSalt})
            .done(function (res) {
                expect(res.key).toEqual(h.keyGene);
                expect(res.key2).toEqual(h.skey);
                done();
            });
        });

        it('can encrypt/decrypt using elGamal Public-Private cryptosystem', function () {
            var ct = h.encrypt('foo');
            expect(h.decrypt(ct)).toEqual('foo');
        });

        it('can encrypt/decrypt using AES symmetric cryptosystem in CCM mode', function () {
            var ct = h.encrypt('foo', 's3cr1t', 'auth_data');
            expect(h.decrypt(ct, 's3cr1t')).toEqual('foo');
        });

        it('will not encrypt using AES in CCM mode without auth data', function () {
            expect(function () { h.encrypt('foo', 's3cr1t'); }).toThrow(new Error('Only authenticated CCM supported'));
        });

        it('can sign/verify using ECDSA Public-Private cryptosystem', function () {
            var sig = h.sign('foo');
            expect(h.verify('foo', sig)).toBeTruthy();
        });

        it('can serialize the cryptosystem to JSON and back with the legacy JSON formatter', function (done) {
            var h2, json, res;
            json = h._legacyToJSON('foo@bar.com');

            h2 = new husher.Husher();
            h2._legacyFromJSON('secret', json)
            .done(function () {
                res = h.encrypt('foo', h.encryptionKey.pub);
                expect(h2.decrypt(res, h2.encryptionKey.sec)).toEqual('foo');
                res = h2.encrypt('foo', h2.encryptionKey.pub);
                expect(h.decrypt(res, h.encryptionKey.sec)).toEqual('foo');
                done();
            });
        });

        it('can serialize the cryptosystem to JSON and back with the JSON formatter', function (done) {
            var h2, json, res;
            json = h.toJSON('foo@bar.com');

            h2 = new husher.Husher();
            h2.fromJSON('secret', json)
            .done(function () {
                res = h.encrypt('foo', h.encryptionKey.pub);
                expect(h2.decrypt(res, h2.encryptionKey.sec)).toEqual('foo');
                res = h2.encrypt('foo', h2.encryptionKey.pub);
                expect(h.decrypt(res, h.encryptionKey.sec)).toEqual('foo');

                res = h.sign('foo');
                expect(h2.verify('foo', res)).toBeTruthy();
                res = h2.sign('foo');
                expect(h.verify('foo', res)).toBeTruthy();

                done();
            });
        });

        it('will use the legacy version when appropriate', function (done) {

            var h = new husher.Husher(),
                h2 = new husher.Husher(),
                json;

            spyOn(h, '_legacyToJSON').and.callThrough();
            spyOn(h2, '_legacyFromJSON').and.callThrough();

            h.generate('secret').done(function () {
                delete h.signingKey;
                json = h.toJSON('foo@bar.com');
                expect(h._legacyToJSON).toHaveBeenCalled();
                h2.fromJSON('secret', json).done(function () {
                    expect(h2._legacyFromJSON).toHaveBeenCalled();
                    done();
                });
            });

        });

    });
});