const bucket = require('../../utils/bucket');
const slack = require('../../utils/slack');
const lodash = require('lodash');
const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const { result, create } = require('lodash');
const rekognition = new AWS.Rekognition();
const tuidVidaConfig = CONFIG.get('vida');
const resources = require('../../startup/resources');
const person = require('../padron/person');
var dbr = require('dynamsoft-javascript-barcode');
dbr.BarcodeReader.productKeys = CONFIG.get('dynamsoft.productKeys');

const sms = require('./../../utils/sms');
const { captureRejectionSymbol } = require('ftp');

function cleanDoc(document){
    return document.replace(/[^.\d]/g, '').replace(/^0+/, '');
}


let manualQueries = {
    "E" : "Select empresa, cuil from usuario_empresa where dni = ?",
    "R" : "Select * from usuario where dni = ? and sexo = ?"
}

    /* EX.
    {
        
        phone: {
            country: +54
            area: 11
            phone: 61053363
        }
        idDevice: wwwww,
        front: zzzz
        back: yyyy
        selfie: xxx
        os: ososos
        version: vvvv
        id_device: rrrr
    }*/
module.exports.validatePhone = async (req,res,next) => {
     // validate phone
     let phone = resources.validatePhone(req.body.phone);
     if (!phone){
         res.response.message = "El teléfono celular ingresado es invalido.";
         return res.status(res.response.status).json(res.response); 
     } 
     req.body.telephone = {};
     req.body.telephone.phone = phone;
     req.body.telephone.code = rand();
     req.body.telephone.verified = false;
     req.body.telephone.created = new Date();
     next();
}

module.exports.validatePdf = async (req,res,next) => {
        var documentData = await fetch(`${req.body.front}`);
        if (!documentData) documentData = await fetch(`${req.body.back}`);
        console.log(documentData);
        if (documentData){
            req.body.similitud = 0;
            req.body.idDocument.pdf = true;
            req.body.idDocument.number = cleanDoc(documentData.dni);
            req.body.idDocument.gender = documentData.sexo;
            req.body.idDocument.nombre = documentData.nombre;
            req.body.idDocument.apellido = documentData.apellido;
            req.body.idDocument.nacimiento = documentData.fechaNac;
            req.body.idDocument.tramite = documentData.tramite;
            next();
        }else{

            let namefile =  req.body.telephone.phone.replace('+','')+'_';
            let uploaded = lodash.after(3, function(){
                res.response.message = "No pudimos leer el documento. Pruebe con imagenes más nitidas o contacte a soporte.";
                if (errorDiscovery){
                    return res.status(res.response.status).json(res.response); 
                }else{
                    req.body.urls = {
                        front : s3.getSignedUrl('getObject', { Bucket: tuidVidaConfig.bucketName , Key: "manual/" + namefile + 'F.jpeg',Expires: 10000000}),
                        back : s3.getSignedUrl('getObject', { Bucket: tuidVidaConfig.bucketName , Key: "manual/" + namefile + 'B.jpeg',Expires: 10000000}),
                        selfie : s3.getSignedUrl('getObject', { Bucket: tuidVidaConfig.bucketName , Key: "manual/" + namefile + 'S.jpeg',Expires: 10000000})
                    }
                    createTicketBody(req,res,next);
                }
            });
            var errorDiscovery = null;
            bucket.base64toBucket(req.body.front, namefile + 'F.jpeg',tuidVidaConfig.bucketName + '/manual',function(err, result){
                if (err) errorDiscovery = true; uploaded();
            });
            bucket.base64toBucket(req.body.back, namefile + 'B.jpeg',tuidVidaConfig.bucketName + '/manual',function(err, result){
                if (err) errorDiscovery = true; uploaded();
            });
            bucket.base64toBucket(req.body.selfie, namefile + 'S.jpeg',tuidVidaConfig.bucketName + '/manual',function(err, result){
                if (err) errorDiscovery = true; uploaded();
            });
        }
}

module.exports.validatePdfNew = async (req,res,next) => {
    var documentData = await fetch(`${req.body.front}`);
    if (!documentData) documentData = await fetch(`${req.body.back}`);
    console.log(documentData);
    if (documentData){
        req.body.similitud = 0;
        req.body.idDocument.pdf = true;
        req.body.idDocument.number = cleanDoc(documentData.dni);
        req.body.idDocument.gender = documentData.sexo;
        req.body.idDocument.nombre = documentData.nombre;
        req.body.idDocument.apellido = documentData.apellido;
        req.body.idDocument.nacimiento = documentData.fechaNac;
        req.body.idDocument.tramite = documentData.tramite;
        next();
    }else{
        let namefile =  req.body.telephone.phone.replace('+','')+'_';
        req.body.similitud = 0;
        req.body.idDocument.pdf = false;
        req.body.idDocument.number = cleanDoc(namefile);
        req.body.idDocument.gender = "X";
        req.body.idDocument.nombre = "NN";
        req.body.idDocument.apellido = "NN";
        req.body.idDocument.nacimiento = "1970-01-01";
        req.body.idDocument.tramite = null;
        req.body.master.cuil = "20000000009";
        req.body.similitud = 0;
        req.body.idDocument.empresa.nombre = "Sin información";
        let uploaded = lodash.after(3, function(){
           
                create(req, req,next);
        
        });
        var errorDiscovery = null;
        bucket.base64toBucket(req.body.front, namefile + 'F.jpeg',tuidVidaConfig.bucketName + '/manual',function(err, result){
            if (err) errorDiscovery = true; uploaded();
        });
        bucket.base64toBucket(req.body.back, namefile + 'B.jpeg',tuidVidaConfig.bucketName + '/manual',function(err, result){
            if (err) errorDiscovery = true; uploaded();
        });
        bucket.base64toBucket(req.body.selfie, namefile + 'S.jpeg',tuidVidaConfig.bucketName + '/manual',function(err, result){
            if (err) errorDiscovery = true; uploaded();
        });


    }
}

module.exports.prepareBody = async (req,res, next) => {
    res.response = {
        res: 'error',
        status: 200,
        url : `${tuidVidaConfig.supportUrl}?text=${encodeURI(`Hola TuID.`)}`
               
    };
    req.body.idDocument = {};
    req.body.idDocument.master = null;
    req.body.idDocument.empresa = null;
    req.body.idDocument.pdf = false;
    req.body.idDocument.empresa = null;
    req.body.idDocument.exists = false;
    next();

}

module.exports.uploadPhotos = async (req,res, next) => {
    var errorDiscovery = false;
    var namefile = req.body.idDocument.number + req.body.idDocument.gender + '_';
    var uploaded = lodash.after(6, async function () { 
        if (errorDiscovery){
            if (!req.body.idDocument.empresa){
                res.response.message = "El beneficiario no se encuentra asociado a ninguna entidad";
            }else if (!req.body.idDocument.master){
                res.response.message = "El beneficiario no se encuentra en nuestros registros. Contacte a soporte";
            }else if (req.body.idDocument.exists){
                res.response.message = "El beneficiario ya se encuentra registrado";
            }else{
                res.response.message = "Error subiendo las imágenes. Contacte a soporte";
            }
            return res.status(res.response.status).json(res.response);
        }
        req.body.urls = {
            front : s3.getSignedUrl('getObject', { Bucket: tuidVidaConfig.bucketName , Key: "manual/" + namefile + 'F.jpeg',Expires: 10000000}),
            back : s3.getSignedUrl('getObject', { Bucket: tuidVidaConfig.bucketName , Key: "manual/" + namefile + 'B.jpeg',Expires: 10000000}),
            selfie : s3.getSignedUrl('getObject', { Bucket: tuidVidaConfig.bucketName , Key: "manual/" + namefile + 'S.jpeg',Expires: 10000000})
        }

        req.body.front = null;
        req.body.back = null;
        req.body.selfie = null;
        next();
    });
    // validate empresa
    VIDA_DB.query(manualQueries["E"],[req.body.idDocument.number], function(err, doc){
        if(err || doc.length == 0 ){
            errorDiscovery = true;
        }else  if(doc.length > 0){
            var empresa = {};
            empresa.nombre = doc[0].empresa;
            empresa.cuil = doc[0].cuil;
            empresa.cantidad = doc.length;
            req.body.idDocument.empresa = empresa;
        }
        uploaded();
    });

    VIDA_DB.query(manualQueries["R"],[req.body.idDocument.number, req.body.idDocument.gender], function(err, doc){
        if(err || doc.length > 0 ){
            errorDiscovery = true;
            req.body.idDocument.exists = true;
        }
        uploaded();
    });

    // validate master
    person.findPerson(req.body.idDocument.number, req.body.idDocument.gender)
        .then((found) => {
            if (!found) {
                errorDiscovery = true;
            } else {
                req.body.idDocument.master = {
                    cuil: found.legacy.CUIL,
                    nombre: found.legacy.Nombres.toUpperCase(),
                    apellido: found.legacy.Apellidos.toUpperCase(),
                };
            }
        })
        .catch((err) => {
            errorDiscovery = true;
            console.log(err);
        })
        .finally(() => uploaded());

    // upload images
    bucket.base64toBucket(req.body.front, namefile + 'F.jpeg',tuidVidaConfig.bucketName + '/manual',function(err, result){
        if (err) errorDiscovery = true; uploaded();
    });
    bucket.base64toBucket(req.body.back, namefile + 'B.jpeg',tuidVidaConfig.bucketName + '/manual',function(err, result){
        if (err) errorDiscovery = true; uploaded();
    });
    bucket.base64toBucket(req.body.selfie, namefile + 'S.jpeg',tuidVidaConfig.bucketName + '/manual',function(err, result){
        if (err) errorDiscovery = true; uploaded();
    });
}

module.exports.validateSimilarity = async(req,res,next)=>{

    var params = {
        SimilarityThreshold: 1,
        SourceImage: {
            S3Object: {
                Bucket: "validador-de-id",
                Name: "manual/" + req.body.idDocument.number + req.body.idDocument.gender + "_S.jpeg"
            }
        },
        TargetImage: {
            S3Object: {
                Bucket: "validador-de-id",
                Name: "manual/" +  req.body.idDocument.number + req.body.idDocument.gender+ "_F.jpeg"
            }
        }
     };

     rekognition.compareFaces(params, function (err, data) {
        if (err) {
           res.response.message = 'Error en la comparacion';
           res.response.details = err;
           return res.status(400).json(res.response); 
        }else if (data.FaceMatches.length > 0 ) {
            req.body.similitud = data.FaceMatches[0].Similarity;
            next();
        }
    });
        
}

module.exports.create = async(req,res,next) => {
    console.log(req.body);
    let q = `INSERT INTO manuales 
    (nombre,apellido,dni, sexo, tramite, nacimiento, cuil, telefono, telefonoVrf,
    empresa, tokenCel, id_device,fecha, similitud, os, version ) values
    (?,?,?,?,?,?,?,?,0,?,?,?,NOW(),?,?,?) on duplicate key update  fecha = values(fecha), similitud = values(similitud), telefono = values(telefono), tokenCel = values(tokenCel)`
    VIDA_DB.query(q, 
        [req.body.idDocument.nombre, req.body.idDocument.apellido, req.body.idDocument.number, req.body.idDocument.gender,req.body.idDocument.tramite,req.body.idDocument.nacimiento,
        req.body.idDocument.master.cuil, req.body.telephone.phone.replace('+',''), req.body.idDocument.empresa.nombre, req.body.telephone.code,
        req.body.id_device, req.body.similitud, req.body.os, req.body.version
         ], function(err, doc){
            if(err){
                console.log(err);
                res.response.message = "Error creando registro";
                return res.status(res.response.status).json(res.response);
            }
            console.log(doc);
            sms.send(req.body.telephone.phone,`El código de validacion TUID Vida es ${req.body.telephone.code}`, function(err,res){});
            res.response.res = "ok";
            res.response.status = 200;
            res.response.message = "Registro actualizado";
            res.response.id = doc.insertId;
            req.body.id = doc.insertId;
            console.log(res.response);
            return res.status(res.response.status).json(res.response);
         })
}

async function createTicketBody(req,res,next){

    var mensaje = `
        Frente : ${req.body.urls.front}
        Dorso :  ${req.body.urls.back}
        Selfie :  ${req.body.urls.selfie}
    `;
    
   var data = {
        cuil : '20000000009',
        asunto: "Registración Manual Fallida",
        mensaje: mensaje,
        nombre: `No observado`,
        email: 'registraciones@tuid.ar',
        phone : req.body.telephone.phone,
        code: null
   }
   let date = new Date();
   let ticketId = date.getTime();
   let provider = 'RM';
   let query = 'INSERT INTO comentarios (cuil,email,asunto,mensaje,nombre,telefono, autoresponse, proveedor, external_id, fecha, prioridad, estado, nombre_ticket, procesando) VALUES(?,?,?,?,?,?,?,?,?, NOW(),?,?, ?, 0)';
   VIDA_DB.query(query, [data.cuil, data.email, data.asunto, data.mensaje,data.nombre,req.body.telephone.phone, 0, provider, ticketId, 'HIGH', 'O', 'Registración Manual'], function (err) {
        if (err) {
            console.log(err);
            res.response.message = "No se pudo crear ticket. contacte a soporte";
            res.response.details = err;
            return res.status(res.response.status).json(res.response);
        } else {
            res.response.res = "ok";
            res.response.status = 200;
            res.response.ticketId = ticketId;
            res.response.provider = provider;
            slack.debug(`Contacto a soporte ${data.cuil}: ${data.asunto} Ticket: ${provider}${ticketId}`);
            res.response.url = `${tuidVidaConfig.supportUrl}?text=${encodeURI(`Hola TuID. Los contacto por el Ticket: ${provider}${ticketId} Asunto: ${data.asunto}. Podrian ayudarme?`)}`;
            return res.status(res.response.status).json(res.response);
        }
    })
}

function rand () {
    return Math.floor(Math.random() * (9999 - 1000)) + 1000 // remove `0.`
};

async function fetch(base64Img){
    var buf = Buffer.from(base64Img, 'base64'); // Ta-da
    return new Promise((resolve, reject) => {
        dbr.BarcodeReader.createInstance().then(reader => {
            let settings = reader.getRuntimeSettings();
            settings.localizationModes = [2,0,0,0,0,0,0,0];
            settings.deblurLevel = 9;
            reader.updateRuntimeSettings(settings);
            reader.decode(buf)
            .then(results => {
                console.log('results',results);
                if (results.length > 0){
                   resolve(decodePDFArray(results[0].BarcodeText)); 
                }else{
                    resolve(null);
                }
            })
            .catch( error =>{
                console.log('error decoding',error);
                reject(error);
            });
        }).catch( error =>{
                console.log('error Instance', error);
                reject(error);
            
            });
    });
   
}

module.exports.validateCode = async (req,res,next) => {
    res.response = {
        res: 'error',
        status: 200,
        message: "Unknown error"
               
    };
    if (!req.body.usuario_id || !req.body.code){
        res.response.message = "Faltan parametros";
        return res.status(200).json(res.response);
    }
    try {
        var user = null;
        let result = await  VIDA_DB.sync_query('select * from manuales where id_usuario = ?',[req.body.usuario_id]);
        if (result.length == 0 ){
            res.response.message = "Usuario Inválido";
            return res.status(200).json(res.response);
        }
        user = result[0];
        if (result[0].tokenCel != req.body.code ){
            res.response.message = "El código ingresado es incorrecto.";
            return res.status(200).json(res.response);
        }else{
            let update = await  VIDA_DB.sync_query("update manuales set telefonoVrf = 1 where id_usuario = ?", [req.body.usuario_id]);
            console.log(update);
            let date = new Date();
            let msg = `El usuario ${user.nombre} ${user.apellido} | CUIL : ${user.cuil} creó un registro manual | ID ${user.usuario_id}`
            let ticketId = date.getTime();
            let provider = 'RM';
            let asunto = 'Registración Manual'
            let query = 'INSERT INTO comentarios (cuil,email,asunto,mensaje,nombre,telefono, autoresponse, proveedor, external_id, fecha, prioridad, estado, nombre_ticket, procesando) VALUES(?,?,?,?,?,?,?,?,?, NOW(),?,?, ?, 0)';
            let ticket = await VIDA_DB.sync_query(query, 
                [user.cuil, 'registraciones@tuid.ar', asunto, msg ,`${user.nombre} ${user.apellido}`,user.telefono, 0, provider, ticketId, 'HIGH', 'O', 'Registración Manual']);
            console.log(ticket);
            res.response.res = "ok";
            res.response.message = "ok";

            res.response.status = 200;
            res.response.ticketId = ticketId;
            res.response.provider = provider;
            slack.debug(`Contacto a soporte ${user.cuil}: ${asunto} Ticket: ${provider}${ticketId}`);
            res.response.url = `${tuidVidaConfig.supportUrl}?text=${encodeURI(`Hola TuID. Los contacto por el Ticket: ${provider}${ticketId} Asunto: ${asunto}. Podrian ayudarme?`)}`;
            return res.status(res.response.status).json(res.response);
        }
    }catch(err){
        console.log(err);
        res.response.message = "Error conectando con base de datos";
        return res.status(200).json(res.response);
    }

}


function decodePDFArray(data) {
    var documento = null;
    pdf417 = data.replace(/\uFFFD/g, '').split('@');
    if (pdf417.length < 8) return documento;
    if(pdf417[0].length > 0){
        documento = {
            tramite: pdf417[0],
            apellido:pdf417[1],
            nombre:  pdf417[2],
            sexo:    pdf417[3],
            dni:     cleanDoc(pdf417[4]),
            tipo:    pdf417[5],
            fechaNac:pdf417[6],
            fechaexp:pdf417[7]
        };
    }else{
        documento = {
            tramite: pdf417[10],
            apellido:pdf417[4],
            nombre:  pdf417[5],
            sexo:    pdf417[8],
            dni:      cleanDoc(pdf417[1]),
            tipo:    pdf417[2],
            fechaNac:pdf417[7],
            fechaexp:pdf417[9]
        };
    }
    return documento;  
}
//
// envio sms arg y afuera
// registrode usuario
// registro manual con dni nuevo y dni viejo





