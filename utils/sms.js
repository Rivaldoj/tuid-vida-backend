const AWS = require('aws-sdk');
const { replace } = require('lodash');
const request =  require('request');
const slack = require('./slack');

const sms = CONFIG.get("sms");
const send = async function (phone, message, callback) {

    var isArg = phone.substr(0,2) == '54';
    var tel = phone.replace("+","");

    if (sms.defaultProvider == "AWS") {
        tel = "+" + phone;
        sendAWS(tel, message, callback);
    }else if (sms.defaultProvider == "TELEPROM"){
        tel = tel.replace(/^(549)/,"");
        tel = tel.replace(/^(540)/,"");
        tel = tel.replace(/^(54)/,"");
        tel = tel.replace("-","");
        sendTeleprom(tel,message, callback);
    }else{
        sendStartPlus(tel,message, callback);
    }
}

const sendStartPlus = async function(phone, message, callback){
    let msg = encodeURI(message);
    var options = {
        url: "http://www.smstartplus.com/api_sc_simple.php/?usuario="+sms.smstartplus.user+"&clave="+sms.smstartplus.pass+"&celulares=" + phone + "&mensaje="+ msg
    };
    
    console.log(options.url);
    request(options, function(error, response, body) {
        if (!error && response.statusCode === 200) {
            console.log(body);
            callback(null, body);
        } else {
            if ( error ){
                callback(error, null);
            }else{
                callback(Error, null);
            }
        }
    });

}

// Credenciales del servicio de SMS: salen de la configuracion (sms.username / sms.password), no del codigo
function credenciales() {
    return { username: CONFIG.get('sms.username'), password: CONFIG.get('sms.password') };
}
var headers = {
    'accept': 'application/json',
    'content-type': 'application/json'
};

const sendTeleprom = async function(phone, message, callback){
   
    var options = {
        headers: headers,
        json: credenciales()
    };
    var tel = phone.replace(/ˆ9/,'');
    request.post("https://mayten.cloud/auth", options, (error, response, body) => {
        console.log('Teleprm', error, response.statusCode);
        if (error || response.statusCode != 200) {
            slack.error("Error en autenticación con proveedor teleprom");
            callback("error", null);
            return
        }
        if (body.token){
            options.headers.Authorization = "Bearer "+body.token;
            options.json = {
                "origen": "SMS_CORTO",
                "mensajes": [
                 {
                    "mensaje": message,
                    "telefono": tel,
                    "identificador": "123_123"
                  }
                ]
              }
              request.post("https://mayten.cloud/api/Mensajes/Transaccional",options, (error, response, body) => {
                if (error || response.statusCode != 200 ){
                    callback("error", null);
                    slack.error("Error envio de sms proveedor teleprom");
                }
                callback(null, {});
              })
        }else{
            callback("error", null);
            slack.error("Error envio de sms proveedor teleprom");
        }
       
    });
}


const getTelepromCredit = async function( callback){
    var options = {
        headers: headers,
        json: credenciales()
    };
    request.post("https://mayten.cloud/auth", options, (error, response, body) => {
        
        if (error || response.statusCode != 200) {
            let msg = "Error en autenticación con proveedor teleprom";
            slack.error(msg);
            callback(msg, null);
            return
        }
        if (body.token){
            console.log(body.token);
            options.headers.Authorization = "Bearer "+body.token;
            options.url = "http://core.teleprom.com/api/Creditos/CreditosByCliente/1812";
            request.get(options, (error, response, body) => {
            if (error || response.statusCode != 200 ){
                    let msg = "Error recuperando saldo teleprom";
                    callback(msg, null);
                    slack.error(msg);
                    return;
                }
                callback(null, body);
              })
        }else{
            callback("Error en autenticación con proveedor teleprom: auth token not received", null);
        }
       
    });
}

const sendAWS = async function(phone, message, callback){
    var params = {
        Message: message, 
        PhoneNumber: phone,
        MessageAttributes: {
            'AWS.SNS.SMS.SMSType': {
               DataType: 'String',
               StringValue: 'Transactional'
            }
        }
    };
    // Create promise and SNS service object
    
    var publishTextPromise = new AWS.SNS({apiVersion: '2010-03-31'}).publish(params).promise();
    publishTextPromise.then(
    function(data) {
        console.log(data);
        if (callback) callback(null, data);
    }).catch(
        function(err) {
            console.log(err);
        if (callback) callback(err, null);
    });
}


module.exports = {
    send,
    getTelepromCredit
}