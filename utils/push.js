const request = require('request');

let headersOpt = {
    "content-type": "application/json",
    "Authorization": "***REMOVED***"
};

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