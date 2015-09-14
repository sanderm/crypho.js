define(['crypho/husher', 'sjcl'], function (husher, sjcl) {

    husher.sweatshop.registerWorker('sjcl', 'sjcl.worker.js');

    describe('Husher Crypto helper', function () {
        var h;

        beforeAll(function(done){
            h = new husher.Husher();
            h.generate('secret', 'foo@bar.com').done(function(){done();});
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

        it('generates a 256 bit AES from the provided passphrase using scrypt when calling generate()', function (done) {
            expect(h.macKey.length).toEqual(8); // 8 words = 256 bit
            expect(h.authKey.length).toEqual(8); // 8 words = 256 bit
            expect(h.scryptSalt.length).toEqual(2); // 2 words = 64 bit

            // The scrypt salt should be generated from the email address
            expect(h.scryptSalt).toEqual(husher._hash('foo@bar.com-crypho.com').slice(0,2));

            husher._strengthenScrypt('secret', {salt: h.scryptSalt})
            .done(function (res) {
                expect(res.key).toEqual(h.macKey);
                expect(res.key2).toEqual(h.authKey);
                expect(sjcl.codec.base64.fromBits(sjcl.hash.sha256.hash(res.key2))).toEqual(h.authHash());
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
            var h2 = new husher.Husher();
            expect(h2.verify('foo', sig, h.signingKey.pub)).toBeTruthy();
        });


        it('calculates the correct fingerprint of the keys', function (done) {
            var h2 = new husher.Husher(),
                json = '{"scrypt":{"scryptSalt":"MUkhdycPtis=","pN":16384,"pr":8,"pp":1},"encKey":{"macSalt":"OiuQ/DD/kc1/Oz89wcd+CIk+bzMHpnRbrwK3DPixF8s=","pub":"VpaLnle5yBAaWKUPIf6j4uBGkh6Yc3xpHwgptuFkEjvXkWlsS9b7epZRNK4PC9dWStvdHKbM7BjeVb5UsTtK1OuAJKlJk/HO14Cv7BKST60e6FJAsK59s4ELa6PWLwLb","sec":{"macSalt":"OiuQ/DD/kc1/Oz89wcd+CIk+bzMHpnRbrwK3DPixF8s=","iv":"Mv8i3RShJbObmB6y6Lnd7Q==","ct":"fJw28td7y+RtxJrWUdalXSIfoXOMr04EIbEocN45AuieGdvHWjEDX4pFnir5k3ZLHcYNhudeZsGFHR8jXgEgsVGfLhI2/INp9uOfyQwMI2o=","adata":"foo@bar.com"}},"signingKey":{"pub":"VfBxd8akQWuqhbL/qbXiGuPy5ku5mOtVmcGwngS4UXWAwjxeYBWopuCPWhTWM+doZDy4xtyUzkaR07l5USGwQBPElLpONKC1+IRdmz+dzRjLBd4Iqrwgk3biNq5viakK","sec":{"macSalt":"BED1rretn06sq9k4qThzw9tY0nemyPtf+b+mD+gTbYg=","iv":"tWG9Wr3kx182hIgWOMIIvg==","ct":"sjPmo3EF93DH7sytqXZhJMw6PpiODImfVccZodRxHblMENBmRZm6qX4hkkgAfF1kP8F1TqXGoENbT/LlOIdKPc9rD9FE6fMCVBc6bvkbjSM=","adata":"foo@bar.com"}},"authHash":"d+XnaY7zS3ytE46kOdUDnvb1gVWFz1IAR1lAeVyRgjg=","version":2}';
            h2.fromJSON('secret', JSON.parse(json))
            .done(function () {
                expect(h2.fingerprint()).toEqual([ -1335594577, 220561193, -509001404, 842612495, -1283032269, 258428455, -856053441, -796156258 ]);
                done();
            });

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

        it('will use the legacy JSON formatter when appropriate', function (done) {

            var h = new husher.Husher(),
                h2 = new husher.Husher(),
                json;

            spyOn(h, '_legacyToJSON').and.callThrough();
            spyOn(h2, '_legacyFromJSON').and.callThrough();

            h.generate('secret', 'foo@bar.com').done(function () {
                delete h.signingKey;
                json = h.toJSON('foo@bar.com');
                expect(h._legacyToJSON).toHaveBeenCalled();
                h2.fromJSON('secret', json).done(function () {
                    expect(h2._legacyFromJSON).toHaveBeenCalled();
                    done();
                });
            });

        });

        it('can save and load a session in JSON format', function () {
            var session = h.toSession();
            var h2 = new husher.Husher();
            var ct = h.encrypt('foo');
            var sig = h.sign('foo');
            h2.fromSession(session);
            expect(h2.decrypt(ct)).toEqual('foo');
            expect(h2.verify('foo', sig)).toBeTruthy();
            expect(h2.authHash).toEqual(h.authHash);
        });

    });
});