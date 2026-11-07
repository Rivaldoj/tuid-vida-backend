const request = require('request');

const xmljson = require('xml-js');


module.exports.getDoctor = (document) => {
    return new Promise((resolve, reject) => { 
        request.get(CONFIG.get('sisa.url').replace('{document}', encodeURIComponent(document)),function(err,res,body){
            if (err) return reject(err);
            var json = xmljson.xml2json(body, {compact: true, spaces: 4})
            return resolve(json);
        })
    })
   
}