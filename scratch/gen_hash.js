const crypto = require('node:crypto');

const password = "o9~^>!:U{i3Y6,o";
const salt = crypto.randomBytes(16).toString('hex');
crypto.scrypt(password, salt, 64, (err, derivedKey) => {
    if (err) throw err;
    console.log(salt + ":" + derivedKey.toString('hex'));
});
