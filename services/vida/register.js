const bucket = require('../../utils/bucket');
const slack = require('../../utils/slack');
const lodash = require('lodash');
const AWS = require('aws-sdk');
const rekognition = new AWS.Rekognition();
const tuidVidaConfig = CONFIG.get('vida');
const mail = require('./../../utils/mail');
const person = require('../padron/person');
const questions = require('../padron/questions');
module.exports.cleanData = async (req,res,next) => {
    console.log("cleaning body");
    req.body.idDocument.number = req.body.idDocument.number.replace(/ /g,"");
    if(req.body.idDocument.number.substr(0,1) === 'M'|| req.body.idDocument.number.substr(0,1) === 'F'){
        req.body.idDocument.number = req.body.idDocument.number.substr(1);
    }
    if(req.body.idDocument.number.substr(0,1) === '0'){
        req.body.idDocument.number = req.body.idDocument.number.substr(1);
    }
    req.body.idDocument.number = cleanDoc(req.body.idDocument.number);

    req.body.idDocument.name =  req.body.idDocument.name.replace(/nxx/gi,"n");
    req.body.idDocument.lastname =  req.body.idDocument.lastname.replace(/nxx/gi,"n");
    req.body.idDocument.name =  req.body.idDocument.name.replace("'"," ");
    req.body.idDocument.lastname = req.body.idDocument.lastname.replace("'"," ");
    req.body.idDocument.name = req.body.idDocument.name.replace(/ñ/gi,"n");
    req.body.idDocument.lastname = req.body.idDocument.lastname.replace(/ñ/gi,"n");
    req.body.idDocument.name = req.body.idDocument.name.toUpperCase();
    req.body.idDocument.lastname = req.body.idDocument.lastname.toUpperCase();
    req.body.idDocument.name = req.body.idDocument.name.replace(/  /g," ");
    req.body.idDocument.lastname = req.body.idDocument.lastname.replace(/  /g," ");
    res.response = {
        res: 'error',
        status: 200
    };
    req.body.json = {
        'question':Array(5)
    };
    req.body.ArrayPreguntas = [];
    next();
}

module.exports.checkBlacklist = async (req, res, next) => { 
    console.log("checking blacklist");
    let query = "SELECT CUIL FROM lista_negra WHERE dni=? and sexo=? and activo=1";
    VIDA_DB.query(query, [req.body.idDocument.number, req.body.idDocument.gender], function (err, rows) {
        if(err){
            res.response.message = "Error de conexion con base de datos";
            res.response.details = "Error de conexion con base de datos";
            saveError(req,res);
            return res.status(200).json(res.response);
        }else if (rows.length > 0) {
            res.response.message = 'Este DNI se encuentra en la lista negra';
            res.response.details = 'Este DNI se encuentra en la lista negra';
            saveError(req,res);
            return res.status(200).json(res.response);  //FUNCIONA
        } else {
            next();
        }
    });
}


module.exports.verifyRecords = async (req, res, next) => {
    console.log("verifing records");
    let query = 'SELECT estado FROM usuario WHERE dni=? and sexo=?';
    VIDA_DB.query(query, [req.body.idDocument.number, req.body.idDocument.gender], function (err, rows) {
        if (err) {
            res.response.status = 200;
            res.response.message = "Problema de conexion, vuelva a intentarlo mas tarde";
            saveError(req,res);
            return res.status(200).json(res.response); 
        }
        if (rows.length > 0) {
            if(rows[0].estado === "Ok" || rows[0].estado === "Confirmacion"){
                res.response.message = 'Usted ya se encuentra registrado. Para concluir el trámite ingrese a la opción Fe de vida';
                saveError(req,res);
                return res.status(200).json(res.response); //FUNCIONA
            }else{
                let query2 = 'DELETE FROM usuario WHERE dni=? and sexo=?';
                VIDA_DB.query(query2, [req.body.idDocument.number, req.body.idDocument.gender], function (err, rows) {
                    if (err) {
                        res.response.status = 200;
                        res.response.message = "Problema de conexion, vuelva a intentarlo mas tarde";
                        saveError(req,res);
                        return res.status(200).json(res.response); 
                    }else next();
                });
            }
        } else next();
    });
}



module.exports.checkMaster = async (req, res, next) => {
    console.log("check master");
    let found;
    try {
        found = await person.findPerson(req.body.idDocument.number, req.body.idDocument.gender);
    } catch (err) {
        console.log(err);
        res.response.message = "Error de conexión a la base de datos master";
        res.response.details = "Error de conexión a la base de datos master";
        saveError(req,res);
        return res.status(200).json(res.response); 
    }
    if (!found){
        res.response.status = 204;
        res.response.message = "No se encontraron datos en nuestros registros. Comuniquese mediante el formulario de contacto para que podamos resolver su inconveniente.";
        slack.error(req.body.idDocument.number + " "+ req.body.idDocument.gender+" No pudo registrarse por que no figura en los registros");
        saveError(req,res);
        return res.status(200).json(res.response); 
    }
    req.masterData = found.legacy;
    req.padronRow = found.row;
    next();
}; 


module.exports.uploadImages = async (req, res, next) => {
    console.log("uploading images");
    var errorDiscovery = false;
    var compare = lodash.after(4, function () { 
        if (errorDiscovery){
            console.log("No se pudieron subir las imagenes a AWS S3");
            res.response.message = 'No pudo subir la imagen del frente del dni. Intente nuevamente o comuniquese a través del formulario de contacto';
            saveError(req,res);
            return res.status(200).json(res.response); 
        }else{
            next();  
        }
    });
    var namefile = req.body.idDocument.number + req.body.idDocument.gender + '_';
    bucket.base64toBucket(req.body.idDocument.front, namefile + 'F.jpeg',tuidVidaConfig.bucketName + '/temp',function(err, result){
        if (err) errorDiscovery = true;
        compare();
    } );
    bucket.base64toBucket(req.body.idDocument.back, namefile + 'B.jpeg',tuidVidaConfig.bucketName + '/temp',function(err, result){
        if (err) errorDiscovery = true;
        compare();
    } );
    bucket.base64toBucket(req.body.selfie, namefile + 'S.jpeg',tuidVidaConfig.bucketName + '/temp',function(err, result){
        if (err) errorDiscovery = true;
        compare();
    } );
    bucket.base64toBucket(req.body.idDocument.photo, namefile + 'P.jpeg',tuidVidaConfig.bucketName + '/temp',function(err, result){
        if (err) errorDiscovery = true;
        compare();
    } );
}


module.exports.validateUser = async (req, res, next) => {
    console.log("validating user");
    var params = {
        SimilarityThreshold: 1,
        SourceImage: {
            S3Object: {
                Bucket: tuidVidaConfig.bucketName,
                Name: "temp/" + req.body.idDocument.number + req.body.idDocument.gender + "_P.jpeg"
            }
        },
        TargetImage: {
            S3Object: {
                Bucket: tuidVidaConfig.bucketName,
                Name: "temp/" + req.body.idDocument.number + req.body.idDocument.gender + "_S.jpeg"
            }
        }
    };
    rekognition.compareFaces(params, function (err, data) {
     
        if (err ) {
            res.response.message = "No hemos podido detectar un rostro en las imagenes provistas. Esto es muy frecuente en documentos poco legibles. Comuniquese con nosotros a través del formulario de contacto y resolveremos el inconveniente.";
            res.response.details = "No hemos podido detectar un rostro en las imagenes provistas. Esto es muy frecuente en documentos poco legibles. Comuniquese con nosotros a través del formulario de contacto y resolveremos el inconveniente.";
            console.log(res.response);
            saveError(req,res);
            return res.status(200).json(res.response); 
        } else {
            console.log(data);
            if (data.FaceMatches.length > 0) {
                req.body.similitud = data.FaceMatches[0].Similarity;
                res.response.similarity = req.body.similitud;
                if (req.body.similitud < tuidVidaConfig.revengePercentage) {
                    res.response.message = 'No nos fue posible realizar la Autenticación.\n Su información Personal y los datos Biométricos obtenidos no son coincidentes.\nPor favor verifique el encuadre e iluminación e intente nuevamente.\nPruebe encender el Flash. \n';
                    req.body.estado = 'Error'; 
                    saveError(req,res);
                    return res.status(200).json(res.response); 
                } else if (req.body.similitud < tuidVidaConfig.approvePercentage) { 
                    res.response.message =  'chance';
                    req.body.estado = 'Revancha';
                    addQuestion(req,res,next);
                } else {
                    res.response.message = 'ok';
                    bucket.moveUserFiles(req.body.idDocument.number + req.body.idDocument.gender,tuidVidaConfig.bucketName, '/temp', '/usuarios' , function (err) {
                        if (err) {
                            res.response.message =  "Error al subir imagen"; 
                            saveError(req,res);
                            return res.status(200).json(res.response); 
                        } else {
                            req.body.estado = 'Verificar';
                            next()
                        }
                    });
                }
            } else {
                res.response.message = 'No se reconoce ningun rostro en la foto, por favor verifique la calidad de la misma';
                saveError(req,res);
                return res.status(200).json(res.response); 
            }
        }
    });
/*
    const paramsS2 = {
        Image: {
        S3Object: {
            Bucket: tuidVidaConfig.bucketName,
            Name: "temp/" + req.body.idDocument.number + req.body.idDocument.gender + "_S.jpeg"
        },
        },
        Attributes: ['ALL']
    }
    
    rekognition.detectFaces(paramsS2, function(err,data){
        console.log("detecting Faces", err, JSON.stringify(data), req.body);
   
        if (!data.FaceDetails || !Array.isArray(data.FaceDetails)){
            console.log('no hay facedeDeatails');
        }else if (data.FaceDetails.length > 1){
            console.log('más de una cara');
        }else if (data.FaceDetails.length == 0){
            console.log('no hay caras');
        }else{
            if (data.FaceDetails[0].AgeRange && data.FaceDetails[0].AgeRange.Low && data.FaceDetails[0].AgeRange.High ){
                let edad = calculateAge(req.body.idDocument.birth); // nos da la edad del usuario en base a su fecha de nacimiento
                if (edad < data.FaceDetails[0].AgeRange.Low || edad > data.FaceDetails[0].AgeRange.High){
                    alertAdmin(req.masterData['CUIL'],req.masterData['DNI'],req.masterData['Sexo'],`Rango etario no coincide EDAD: ${edad} MAX: ${data.FaceDetails[0].AgeRange.High} MIN: ${data.FaceDetails[0].AgeRange.Low}| CUIT : ${req.masterData['CUIL']} DNI : ${req.masterData['DNI']} SEXO : ${req.masterData['Sexo']}`);
                }
                if (data.FaceDetails[0].Sunglasses.Value){
                    alertAdmin(req.masterData['CUIL'],req.masterData['DNI'],req.masterData['Sexo'],`Usa lentes de sol Confianza: ${data.FaceDetails[0].Eyeglasses.Confidence} | CUIT : ${req.masterData['CUIL']} DNI : ${req.masterData['DNI']} SEXO : ${req.masterData['Sexo']}`);
                }
                if (data.FaceDetails[0].Eyeglasses.Value){
                    alertAdmin(req.masterData['CUIL'],req.masterData['DNI'],req.masterData['Sexo'],`Usa anteojos Confianza: ${data.FaceDetails[0].Eyeglasses.Confidence} | CUIT : ${req.masterData['CUIL']} DNI : ${req.masterData['DNI']} SEXO : ${req.masterData['Sexo']}`);
                }
                if (data.FaceDetails[0].Gender.Value.substr(0,1) != req.masterData['Sexo'] ){
                    alertAdmin(req.masterData['CUIL'],req.masterData['DNI'],req.masterData['Sexo'],`Sexo Erroneo DETECTADO : ${data.FaceDetails[0].Gender.Value} Confianza: ${data.FaceDetails[0].Eyeglasses.Confidence} | CUIT : ${req.masterData['CUIL']} DNI : ${req.masterData['DNI']} SEXO : ${req.masterData['Sexo']}`);
                }

            }else{  
                console.log('no hay ageRange'); 
            }
        }
    });
*/
}

function calculateAge(date){
    let anonacimiento = date.substr(0,4);
    let anoactual = new Date().getFullYear();
    return anoactual - anonacimiento
}

async function alertAdmin ( cuil,dni, gender, comment)  {
        VIDA_DB.query("insert into alertas (cuil,comentarios, fecha) values (?,?,UTC_TIMESTAMP())", [cuil, comment],function(err,doc){
            console.log(err);
        });
        slack.debug(comment);
        let params = {
            title: comment,
            dni: dni, 
            gender: gender,
            cuil: cuil
        }
        mail.send('alert', params, tuidVidaConfig.supportContact ,  tuidVidaConfig.supportContact , null);
}


async function addQuestion(req,res,next){
    let generated;
    try {
        generated = await questions.generateQuestion(req.padronRow);
    } catch (err) {
        console.log(err);
    }
    if (!generated) {
        res.response.message = "No hay datos para generar la pregunta de validación";
        saveError(req,res);
        return res.status(200).json(res.response);
    }
    req.body.pregunta = generated.pregunta;
    req.body.ArrayPreguntas[generated.pregunta] = generated.respuesta;
    req.body.json = { question: generated.question };
    res.response.question = generated.question;
    next();
}

module.exports.createUser = async (req,res, next) => {
    if(req.body.similitud<60 && req.body.similitud>55){
        req.body.similitud = req.body.similitud + 5;
    }
    let query1 = 'SELECT empresa FROM usuario_empresa WHERE cuil=? ';
    VIDA_DB.query(query1, [req.masterData['CUIL']], function(err, rows) {
        if (rows.length > 0) {
            req.body.empresa = rows[0].empresa;
        } else {
            req.body.empresa = 'Sin informacion';
        }
        var paramsArray = [];
        paramsArray.push(req.masterData['DNI']);
        paramsArray.push(req.masterData['Sexo']);
        paramsArray.push(req.body.idDocument.name);
        paramsArray.push(req.body.idDocument.lastname);
        paramsArray.push(req.body.idDocument.tramit);
        paramsArray.push(req.body.idDocument.birth);
        paramsArray.push(req.body.idDocument.expires);
        paramsArray.push(req.body.idDocument.address);
        paramsArray.push(req.body.pregunta); 
        paramsArray.push(req.body.ArrayPreguntas[req.body.pregunta]); 
        paramsArray.push(req.body.estado); 
        paramsArray.push(req.body.similitud);
        paramsArray.push(req.body.idDevice);
        paramsArray.push(req.masterData['CUIL']);
        paramsArray.push(req.body.empresa);
       // paramsArray.push(req.body.idDocument.issue);
        paramsArray.push(req.body.os);
        paramsArray.push(req.body.version);
        VIDA_DB.query("INSERT INTO usuario SET dni=?,sexo=?, nombre=?,apellido=?,tramite=?,nacimiento=?,vencimiento=?,direccion=?,id_pregunta=?,id_respuesta=?,estado=?,similitud=?,id_device=?,cuil=?,valback=null,valfront=null,empresa=?,fecha=now(),os=?,version=?",paramsArray,function (err, result){
            if (err){
                res.response = {
                    message: 'No se pudo crear el registro de usuario',
                    details :'No se pudo crear el registro de usuario',
                    res: "error",
                    status: 400
                }
                return res.status(200).json(res.response);
            } else {
                res.response.res = "ok";
                res.response.iduser = result.insertId;
                console.log("sleeping");
               return res.status(200).json(res.response);              
            }
        } )
    });
}

async function saveError(req,res){
    try {
        let query = "insert into errors (dni, sexo, message, nombre) values(?,?,?,?);";
        let dni = req.body.idDocument.number;
        let sexo = req.body.idDocument.gender;
        let nombre = `${req.body.idDocument.name} ${req.body.idDocument.lastname}`; 
        let message = res.response.message;
        let result = await VIDA_DB.sync_query(query, [dni,sexo,message, nombre]);
    }
    catch(err){
console.log(err);
    }
    
}

function cleanDoc(document){
    return document.replace(/[^.\d]/g, '').replace(/^0+/, '');;

}
