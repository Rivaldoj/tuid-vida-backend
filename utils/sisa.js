const request = require('request');

const xmljson = require('xml-js');


module.exports.getDoctor = (document) => {
    return new Promise((resolve, reject) => { 
        request.get(`https://sisa.msal.gov.ar/sisa/services/rest/profesional/obtener?usuario=jmrivaldo&clave=TuId202301%23&nrodoc=${document}`,function(err,res,body){
            if (err) return reject(err);
            var json = xmljson.xml2json(body, {compact: true, spaces: 4})
            return resolve(json);
        })
    })
   
}