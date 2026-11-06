

const moment = require("moment");
const jwt = require("jwt-simple");
const jwtData = CONFIG.get('jwt');
const crypto = require('crypto');

const algorithm = 'aes-256-ctr';
const secretKey = '***REMOVED***';

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