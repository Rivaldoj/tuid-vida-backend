const request = require('request');

module.exports.error = function (msg, callback) {
    const text = String(msg || '').slice(0, 2500);
    request.post(CONFIG.get("slack").error, {
        json: {
            text: text
        }
    }, (error, res, body) => {
        if (error) {
            console.error(error);
        }
        if (callback) callback(error);
    });
}

module.exports.debug = function (msg) {
    
        request.post(CONFIG.get("slack").debug, {
            json: {
                text: msg
            }
        }, (error, res, body) => {
            if (error) {
                console.error(error)
                return
            }
        })}


module.exports.autenticador = function (msg) {

    request.post(CONFIG.get("slack").autenticador3, {
        json: {
            text: msg
        }
    }, (error, res, body) => {
        if (error) {
            console.error(error)
            return
        }
    })}


        