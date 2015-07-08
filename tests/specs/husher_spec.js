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
            expect(h.key.pub instanceof sjcl.ecc.elGamal.publicKey).toBeTruthy();
            expect(h.key.sec instanceof sjcl.ecc.elGamal.secretKey).toBeTruthy();
            expect(h.key.pub._curve).toEqual(sjcl.ecc.curves.c384);
            expect(h.key.sec._curve).toEqual(sjcl.ecc.curves.c384);
        });

        it('generates an 256 bit AES from the provided passphrase using scrypt when calling generate()', function (done) {
            expect(h.pkey.length).toEqual(8); // 8 words = 256 bit
            expect(h.psalt.length).toEqual(2); // 2 words = 64 bit
            husher._strengthenScrypt('secret', {salt: h.psalt})
            .done(function (res) {
                expect(res.key).toEqual(h.pkey);
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

        it('can serialize the cryptosystem to JSON and back', function (done) {
            var h2, json, res;
            json = h.toJSON('foo@bar.com');

            h2 = new husher.Husher();
            h2.fromJSON('secret', json)
            .done(function () {
                res = sjcl.encrypt(h.key.pub, 'foo');
                expect(sjcl.decrypt(h2.key.sec, res)).toEqual('foo');
                res = sjcl.encrypt(h2.key.pub, 'foo');
                expect(sjcl.decrypt(h.key.sec, res)).toEqual('foo');
                done();
            });
        });

    });
});