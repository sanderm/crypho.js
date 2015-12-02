/* global sjcl, self */
importScripts('../../static/libs/sjcl.js');

var encryptBinary = function (password, plaintext, params) {
    params = params || {};
    var j = sjcl.json, p = j._add(j.defaults, {iv: sjcl.random.randomWords(4,0)}), tmp, prp, adata, ct;
    j._add(p, params);
    adata = p.adata;
    if (typeof p.salt === "string") {
        p.salt = sjcl.codec.base64.toBits(p.salt);
    }
    if (typeof p.iv === "string") {
        p.iv = sjcl.codec.base64.toBits(p.iv);
    }

    if (!sjcl.mode[p.mode] ||
        !sjcl.cipher[p.cipher] ||
        (typeof password === "string" && p.iter <= 100) ||
        (p.ts !== 64 && p.ts !== 96 && p.ts !== 128) ||
        (p.ks !== 128 && p.ks !== 192 && p.ks !== 256) ||
        (p.iv.length < 2 || p.iv.length > 4)) {
        throw new sjcl.exception.invalid("json encrypt: invalid parameters");
    }

    if (typeof password === "string") {
        tmp = sjcl.misc.cachedPbkdf2(password, p);
        password = tmp.key.slice(0,p.ks/32);
        p.salt = tmp.salt;
    }

    plaintext = sjcl.codec.bytes.toBits(plaintext);

    if (typeof adata === "string") {
        adata = sjcl.codec.utf8String.toBits(adata);
    }

    prp = new sjcl.cipher[p.cipher](password);

    /* return the json data */
    j._add(p);

    /* do the encryption */
    ct = sjcl.mode[p.mode].encrypt(prp, plaintext, p.iv, adata, p.ts);
    ct = sjcl.codec.bytes.fromBits(ct);
    return {params: j.encode(p), ct: ct};
};

var decryptBinary = function (password, ciphertext, params) {
    var j = sjcl.json, p = params, ct, tmp, prp, adata=p.adata;

    if (typeof p.salt === "string") {
        p.salt = sjcl.codec.base64.toBits(p.salt);
    }

    if (typeof p.iv === "string") {
        p.iv = sjcl.codec.base64.toBits(p.iv);
    }

    if (!sjcl.mode[p.mode] ||
        !sjcl.cipher[p.cipher] ||
        (typeof password === "string" && p.iter <= 100) ||
        (p.ts !== 64 && p.ts !== 96 && p.ts !== 128) ||
        (p.ks !== 128 && p.ks !== 192 && p.ks !== 256) ||
        (!p.iv) ||
        (p.iv.length < 2 || p.iv.length > 4)) {
        throw new sjcl.exception.invalid("json decrypt: invalid parameters");
    }

    if (typeof password === "string") {
        tmp = sjcl.misc.cachedPbkdf2(password, p);
        password = tmp.key.slice(0,p.ks/32);
        p.salt  = tmp.salt;
    }

    if (typeof adata === "string") {
        adata = sjcl.codec.utf8String.toBits(adata);
    }

    prp = new sjcl.cipher[p.cipher](password);

    ciphertext = sjcl.codec.bytes.toBits(ciphertext);

    /* do the decryption */
    ct = sjcl.mode[p.mode].decrypt(prp, ciphertext, p.iv, adata, p.ts);
    return sjcl.codec.bytes.fromBits(ct);
};

var scrypt = function (passwd, options) {
  return sjcl.misc.scrypt(passwd, options.salt, options.N, options.r, options.p, options.dkLen);
};

self.addEventListener('message', function (ev) {

    var data = ev.data;
    switch (data.cmd) {
        case 'encryptBinary':
            self.postMessage(encryptBinary.apply(self, data.args));
            break;
        case 'decryptBinary':
            self.postMessage(decryptBinary.apply(self, data.args));
            break;
        case 'scrypt':
            self.postMessage(scrypt.apply(self, data.args));
            break;
        default:
            break;
    }

}, false);
