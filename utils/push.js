const request = require('request');

// La key de FCM debe venir de la configuracion (`fcm.serverKey`). OJO: esta API (fcm/send, "legacy") fue dada de baja por
// Google en 2024; hay que migrar a FCM HTTP v1 (cuenta de servicio de Firebase). Ver PLAN_BACKEND.md.
const LEGACY_FCM_KEY = "***REMOVED***";
const fcmKey = CONFIG.has('fcm.serverKey') ? CONFIG.get('fcm.serverKey') : (console.warn('[SEGURIDAD] fcm.serverKey no configurada: se usa la key historica.'), LEGACY_FCM_KEY);
let headersOpt = {
    "content-type": "application/json",
    "Authorization": "key=" + fcmKey
};

module.exports.authorizationHeader = () => headersOpt.Authorization;

module.exports.send = async(to, title, text, data) => {
    var body =  {
        "to": to,
        "notification": {
            "title": title,
            "body": text
        }
    };
    if(data) body.data = data;
    request(
        {
            method: 'POST',
            uri: 'https://fcm.googleapis.com/fcm/send',
            headers: headersOpt,
            json: true,
            body: body
        }, function (error, response, body) {
           console.log(body);
        });
}