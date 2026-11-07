const { param } = require('express/lib/router');
const request = require('request');



module.exports.sendTemplate = async function (number, template,locale,params, next){
    let body = {
        "messaging_product": "whatsapp", 
        "to": number, 
        "type": "template", 
        "template": { 
            "name": template, 
            "components": [
                {
                "type": "body",
                "parameters": [
                      {
                        "type": "text",
                        "text": params.name
                }]},{
                    "type": "button",
                    "sub_type": "url",
                    "index": "0",
                    "parameters": [
                      {
                        "type": "text",
                        "text": `s?document=${params.document}&gender=${params.gender}&name=${encodeURI(params.name)}`
                      }]}
                 ],
            "language": { "code": locale
           } } }
           

    return new Promise((resolve, reject) => { 
        request.post('https://graph.facebook.com/v13.0/110478498339287/messages',{
            headers: {
                Authorization: CONFIG.get('whatsapp.authorization')
            },
            json: body 
        }, function(err, res, body){
            if (err) return reject(err);
            resolve(body);
        })
        
      });
    
    
    
}

module.exports.send = async function (number, message, next){

    request.post('https://graph.facebook.com/v13.0/110478498339287/messages',{
        headers: {
            Authorization: CONFIG.get('whatsapp.authorization')
        },
        json: {
             "messaging_product": "whatsapp", 
             "to": number, 
             "type": "text", 
            "text": {
                    "body": message
                }
            }
    }, function(err, res, body){
       
    })
}



module.exports.sendTemplateBot = async function (number, template,locale,params, next){
    let body = {
        "messaging_product": "whatsapp", 
        "to": number, 
        "type": "template", 
        "template": { 
            "name": template, 
            "components": params,
            "language": { "code": locale} } 
        }
           

    return new Promise((resolve, reject) => { 
        request.post('https://graph.facebook.com/v13.0/110478498339287/messages',{
            headers: {
                Authorization: CONFIG.get('whatsapp.authorization')
            },
            json: body 
        }, function(err, res, body){
            if (err) return reject(err);
            resolve(body);
        })
        
      });
    
    
    
}