

const moment = require("moment");
const jwt = require("jwt-simple");
const jwtData = CONFIG.get('jwt');
const crypto = require('crypto');

const algorithm = 'aes-256-ctr';
// La clave de cifrado AES sale de la configuracion (`security.aesKey`, 32 caracteres). Ya no hay una clave escrita en el codigo:
// si falta, el servidor no arranca (mejor que cifrar con una clave que todos conocen). Al rotarla hay que re-cifrar los datos
// existentes cifrados con la clave anterior (por ejemplo `id_respuesta` del servicio authenticator).
if (!CONFIG.has('security.aesKey') || String(CONFIG.get('security.aesKey')).length !== 32) {
    throw new Error('Falta security.aesKey (32 caracteres) en la configuracion');
}
const secretKey = CONFIG.get('security.aesKey');

module.exports.encrypt  = (text) => {

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, secretKey, iv);
    const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
    return {
        iv: iv.toString('hex'),
        content: encrypted.toString('hex')
    };
};

module.exports.decrypt = function(hash){
    const decipher = crypto.createDecipheriv(algorithm, secretKey, Buffer.from(hash.iv, 'hex'));
    const decrpyted = Buffer.concat([decipher.update(Buffer.from(hash.content, 'hex')), decipher.final()]);
    return decrpyted.toString();
};


module.exports.tokenize = function(objectPayload){
    const payload = {
        sub: objectPayload,
        iat: moment().unix(),
        exp: moment().add(jwtData.time, jwtData.units).unix(),
    };
    return jwt.encode(payload, jwtData.key, "HS256");
}

module.exports.detokenize = function(token,next){
    try {
        const payload = jwt.decode(token, jwtData.key, false, "HS256");
        return next(null, payload.sub);
      } catch (err) {
        return next(err);
      }
}


module.exports.tokenizeAuthenticatorAdmin = function(objectPayload){
    const payload = {
        sub: objectPayload,
        iat: moment().unix(),
        exp: moment().add(jwtData.authenticatorAdmin.time, jwtData.authenticatorAdmin.units).unix(),
    };
    return jwt.encode(payload, jwtData.authenticatorAdmin.key, "HS256");
}



module.exports.detokenizeAuthenticatorAdmin = function(token,next){
    try {
        const payload = jwt.decode(token, jwtData.authenticatorAdmin.key, false, "HS256");
        return next(null, payload.sub);
      } catch (err) {
        return next(err);
      }
}



module.exports.tokenizeVidaAdmin = function(objectPayload){
    const payload = {
        sub: objectPayload,
        iat: moment().unix(),
        exp: moment().add(jwtData.vidaAdmin.time, jwtData.vidaAdmin.units).unix(),
    };
    return jwt.encode(payload, jwtData.authenticatorAdmin.key, "HS256");
}


module.exports.detokenizeVidaAdmin = function(token,next){
    try {
        const payload = jwt.decode(token, jwtData.vidaAdmin.key, false, "HS256");
        return next(null, payload.sub);
      } catch (err) {
        return next(err);
      }
}