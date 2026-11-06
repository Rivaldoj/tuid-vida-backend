
const AWS = require('aws-sdk');
const levenshtein = require('fast-levenshtein');
const slack = require('../../utils/slack');
const lodash = require("lodash");
const fs = require('fs');
const path = require('path');
const s3 = new AWS.S3();
const rekognition = new AWS.Rekognition();
const tokenizer = require('../../utils/tokenizer');
const webhook = require('../../utils/webhooks');

const reports = require('../../utils/report');
const person = require('../padron/person');
const questions = require('../padron/questions');

function decode_base64(base64str , filename, next){
    var buf = Buffer.from(base64str,'base64');
    let dir = path.join(APP_PATH,'./uploads/',filename);
    console.log(dir);
    fs.writeFile(dir, buf, function(error){
        if(error){
            console.log(error);
            next(error) ;
        }else{
            //console.log('File created from base64 string!');
            next();
        }
    });
}

function moveimg(dni,sexo,appBucket, next){
    const mainBucket = CONFIG.get('authenticator').bucketName;
    let finish = lodash.after(4, function () {
        var params = {
            Bucket: mainBucket,
            Delete: { // required
                Objects: [ // required
                    {Key: 'temp/'+ appBucket + '/' + dni + sexo +'_S.jpeg'},
                    {Key: 'temp/' + appBucket + '/' + dni + sexo +'_F.jpeg'},
                    {Key: 'temp/' + appBucket + '/' + dni + sexo +'_B.jpeg'},
                    {Key: 'temp/' + appBucket + '/' + dni + sexo +'_P.jpeg'}
                ],
            },
        };
        s3.deleteObjects(params, function(err, data) {
            if (err) next(err); // an error occurred
            else next();           // successful response
        });

    });
    var params1 = {
        CopySource: mainBucket + '/temp/' + appBucket + '/' + dni + sexo +'_S.jpeg',
        Bucket: mainBucket+ '/usuarios/'+ appBucket ,
        Key: dni + sexo +'_S.jpeg'
    };
    s3.copyObject(params1, function(err, data) {
        if (err) next(err); // an error occurred
        else finish();           // successful response
    });
    var params2 = {
        CopySource: mainBucket + '/temp/'+ appBucket + '/'  + dni + sexo +'_F.jpeg',
        Bucket: mainBucket+ '/usuarios/'+ appBucket ,
        Key: dni + sexo +'_F.jpeg'
    };
    s3.copyObject(params2, function(err, data) {
        if (err) next(err); // an error occurred
        else finish();           // successful response
    });
    var params3 = {
        CopySource: mainBucket + '/temp/' + appBucket + '/' + dni + sexo +'_B.jpeg',
        Bucket: mainBucket+ '/usuarios/'+ appBucket ,
        Key: dni + sexo +'_B.jpeg'
    };
    s3.copyObject(params3, function(err, data) {
        if (err) next(err); // an error occurred
        else finish();           // successful response
    });
    var params4 = {
        CopySource: mainBucket + '/temp/' + appBucket + '/' + dni + sexo +'_P.jpeg',
        Bucket: mainBucket+ '/usuarios/'+ appBucket ,
        Key: dni + sexo +'_P.jpeg'
    };
    s3.copyObject(params4, function(err, data) {
        if (err) next(err); // an error occurred
        else finish();           // successful response
    });
}


function upload (base64,filename,bucket,next){
    var ruta = APP_PATH + '/uploads/'+filename;
    decode_base64(base64,filename, function (err) {
        if(err){
           next(err);
        };
        const mainBucket = CONFIG.get('authenticator').bucketName + '/temp/' + bucket;
        fs.readFile(ruta, function (err, data) {
            if (err) throw err;
            var params = {Bucket: mainBucket, Key: filename, Body: data};
            s3.putObject(params, function (err, data) {

                if (err) {
                    fs.unlink(ruta, (err) => {
                        if (err) throw err;
                    });
                    next(err);
                } else {
                    fs.unlink(ruta, (err) => {
                        if (err) throw err;
                    });
                    next();
                }
            });
        });
    });
}

module.exports.checkBlacklist = async (req, res, next) => { 
    console.log("checking blacklist");
    let query = "SELECT dni FROM lista_negra WHERE dni=? and sexo=? and activo=1 and  (aplicacion ='' or aplicacion = ? )";
    AUTHENTICATOR_DB.query(query, [req.body.idDocument.number, req.body.idDocument.gender, req.client.id], function (err, rows) {
        if(err){
            res.response.message = "Error de conexion con base de datos";
            res.response.details = err;
            return res.status(200).json(res.response);
        }else if (rows.length > 0) {
            res.response.message = 'Este DNI se encuentra en la lista negra';
            res.response.details = 'Este DNI se encuentra en la lista negra';
            return res.status(200).json(res.response);  
        } else {
            next();
        }
    });
}

module.exports.cleanBody = async (req, res, next) => {
    console.log("cleaning body");
    req.body.idDocument.number = req.body.idDocument.number.replace(/ /g,"");
    if(req.body.idDocument.number.substr(0,1) === 'M'|| req.body.idDocument.number.substr(0,1) === 'F'){
        req.body.idDocument.number = req.body.idDocument.number.substr(1);
    }
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

module.exports.checkMaster = async (req, res, next) => {
    console.log("check master");
    let found;
    try {
        found = await person.findPerson(req.body.idDocument.number, req.body.idDocument.gender);
    } catch (err) {
        res.response.message = "Error de conexión a la base de datos";
        res.response.details = err;
        return res.status(200).json(res.response); 
    }
    if (!found){
        res.response.message = "No se encontraron datos en el BCRA";
        if (req.client && req.client.id == 'sancristauth') res.response.message = "No se encontró a la persona en base de datos";
        slack.error(req.body.idDocument.number + " "+ req.body.idDocument.gender+" No pudo registrarse por que no figura en los registros");
        return res.status(200).json(res.response); 
    }
    const master = found.legacy;
    var fecha_hoy = new Date();
    var ahora_ano = fecha_hoy.getYear();
    var ahora_mes = fecha_hoy.getMonth()+1;                
    var ahora_dia = fecha_hoy.getDate();
    // realizamos el calculo
    var edad = (ahora_ano + 1900) - master.ano;
    if (ahora_mes < master.mes) edad--;
    if ((master.mes === ahora_mes) && (ahora_dia < master.dia)) edad--;
    if (edad > 1900) edad -= 1900;
    if (edad <18){
        res.response.message = "Menor de edad";
        return res.status(200).json(res.response); 
    }
    req.masterData = master;
    req.padronRow = found.row;
    next();
}; 

module.exports.validateData = async (req, res, next) => {
    console.log("validation data");
   
    var name = req.body.idDocument.name;
    var lastname = req.body.idDocument.lastname;
    var nombres = req.masterData['Nombres'];


    var count = (nombres.match(/�/g) || []).length;

    console.log('validacion con master', req.body.idDocument, req.masterData);

    if (count !== 0){
        count = count + (nombres.match(/,/g) || []).length + 1;
    }
    var nameOnBody = lastname + ' ' + name;
    nameOnBody = nameOnBody.replace(/\'/g," ");
    nombres = nombres.replace(/\'/g," ");
    var distance = levenshtein.get(nombres, nameOnBody);
    if ((nombres.toUpperCase().indexOf(lastname) !== -1) || distance < count) {
        next();
    }else{
        res.response.message = "Los datos del DNI no coinciden con nuestra base de datos";
        return res.status(200).json(res.response); 
    }
}

module.exports.uploadImages = async (req, res, next) => {
    console.log("uploading images");
    var error = false;
    var compare = lodash.after(4, function () {
        if (error){
            return res.status(200).json(res.response);
        }else{
            next()
        } 
    }); //luego de 4 activaciones ejecuta el siguiente método del middleware que es la comparacion (primero tiene que subir 4 imagens)
    var namefile = req.body.idDocument.number + req.body.idDocument.gender + '_';
    upload(req.body.idDocument.front, namefile + 'F.jpeg',req.client.bucketFolder, function (err, result) {
        if (err) {
            res.response.message = 'No pudo subir la imagen del frente del dni';
            res.response.details = err;
            error = true;
        }
        compare();
    });
    upload(req.body.idDocument.back, namefile + 'B.jpeg',req.client.bucketFolder, function (err, result) {
        if (err) {
            res.response.message = 'No pudo subir la imagen del dorso del dni';
            res.response.details = err;
            error = true;
        }
        compare();
    });
    upload(req.body.selfie, namefile + 'S.jpeg',req.client.bucketFolder, function (err, result) {
        if (err) {
            res.response.message = 'No pudo subir la imagen del selfie';
            res.response.details = err;
            error = true;
        } 
        compare();
    });
    upload(req.body.idDocument.photo, namefile + 'P.jpeg',req.client.bucketFolder, function (err, result) {
        if (err) {
            res.response.message = 'No pudo subir la imagen del selfie';
            res.response.details = err;
            error = true;
        } 
        compare();
    });
}

module.exports.validateUser = async (req, res, next) => {
    console.log("validating user");
    let bucket = req.client.bucketFolder;
    var params = {
        SimilarityThreshold: 1,
        SourceImage: {
            S3Object: {
                Bucket: "autenticartuid",
                Name: "temp/" + bucket + '/' + req.body.idDocument.number + req.body.idDocument.gender + "_P.jpeg"
            }
        },
        TargetImage: {
            S3Object: {
                Bucket: "autenticartuid",
                Name: "temp/" + bucket + '/' + req.body.idDocument.number + req.body.idDocument.gender + "_S.jpeg"
            }
        }
    };
    rekognition.compareFaces(params, function (err, data) {
        if (err) {
            console.log(err);
            res.response.message = "Error en la comparacion";
            res.response.details = err;
            return res.status(200).json(res.response); 
        } else {
            console.log(data);
            if (data.FaceMatches.length > 0) {
                req.body.similitud = data.FaceMatches[0].Similarity;
                res.response.similarity = req.body.similitud;
                if (req.body.similitud < CONFIG.get('authenticator').revengePercentage) {
                    res.response.message = 'No nos fue posible realizar la Autenticación.\n Su información Personal y los datos Biométricos obtenidos no son coincidentes.\nPor favor verifique el encuadre e iluminación e intente nuevamente.\nPruebe encender el Flash. \n';
                    req.body.estado = 'Error'; 
                    console.log(res.response);
                    return res.status(200).json(res.response); 
                } else if (req.body.similitud < CONFIG.get('authenticator').approvePercentage) {
                    res.response.message =  'chance';
                    req.body.estado = 'Revancha';
                    addQuestion(req,res,next); // antes de continuar debe ir por el flujo de agregar pregunta
                } else {
                    res.response.message = 'ok';
                    moveimg(req.body.idDocument.number, req.body.idDocument.gender,req.client.bucketFolder, function (err) {
                        if (err) {
                            res.response.message =  "Error al subir imagen"; 
                            return res.status(200).json(res.response); 
                        } else {
                            req.body.estado = 'Verificar';
                            next()
                        }
                    });
                }
            } else {
                res.response.message = 'No se reconoce ningun rostro en la foto, porfavor verifique la calidad de la misma';
                return res.status(200).json(res.response); 
            }
        }
    });
}

async function addQuestion(req,res,next){
    let generated;
    try {
        generated = await questions.generateQuestion(req.padronRow);
    } catch (err) {
        console.log(err);
    }
    if (!generated) {
        res.response.message = "No data found";
        return res.status(200).json(res.response);
    }
    req.body.pregunta = generated.pregunta;
    req.body.ArrayPreguntas[generated.pregunta] = generated.respuesta;
    req.body.json = { question: generated.question };
    res.response.question = generated.question;
    next();
}

module.exports.createUser = async (req, res, next) => {
    console.log("creating user");
    var paramsArray = [];

    if (req.body.estado == 'Verificar' && !req.client.settings.mailValidationMandatory && !req.client.settings.phoneValidationMandatory){
        req.body.estado = "Ok";
    }
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
    paramsArray.push(req.body.idDocument.issue);
    paramsArray.push(req.client.id);
    paramsArray.push(req.body.os);

    let query = `insert into usuarios 
    (dni, sexo, nombre, apellido, tramite, nacimiento, vencimiento, direccion, id_pregunta, id_respuesta, estado, similitud, id_device, cuil, fecha, emision, aplicacion, os) 
    values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP(),?,?,?) on duplicate key update nombre = values(nombre), apellido= values(apellido),
    tramite = values(tramite),nacimiento = values(nacimiento),vencimiento = values(vencimiento),direccion = values(direccion),
    id_pregunta = values(id_pregunta),id_respuesta = values(id_respuesta),estado = values(estado),similitud = values(similitud),

    id_device = values(id_device),cuil = values(cuil),fecha = values(fecha),emision = values(emision), os = values(os)
    `;
    AUTHENTICATOR_DB.query(query, paramsArray, function(err,result) {
        if (err) {
            console.log(err);
            res.response.message = 'No se pudo crear el registro de usuario, es probable que el usuario ya exista. Contacte a soporte';
            res.response.details = err;
            return res.status(200).json(res.response);
        } else {
            reports.authenticatorConsume(req.client.id, "R");
            res.response.res = "ok";
            let authData = {};
            authData.idUsuario = result.insertId;
            authData.flow = "SIGNUP";
            authData.estado =  req.body.estado;
            authData.dni = req.body.idDocument.number;
            authData.sexo = req.body.idDocument.gender;
            authData.cuil = req.masterData['CUIL'];
            authData.nacimiento = req.body.idDocument.birth;
            authData.tramite = req.body.idDocument.tramit;
            authData.nombre = req.body.idDocument.name;
            authData.apellido = req.body.idDocument.lastname;

            authData.id_respuesta = tokenizer.encrypt(req.body.ArrayPreguntas[req.body.pregunta] + ""); // si es distinta de null encriptar
            authData.id_pregunta = req.body.pregunta;
            res.response.requireData = req.client.settings; //  como continuar los flujos.
            res.response.iduser = result.insertId;
            res.response.telefonoVrf = false;
            res.response.emailVrf = false;
            res.response.authToken = tokenizer.tokenize(authData); 
        }

    
        if (req.body.estado == "Ok" && req.client.webhook != null){
            var pars = {
                "text" : "Nueva alta",
                "data": {
                    "nombre": req.body.idDocument.name, //
                    "apellido":req.body.idDocument.lastname, //
                    "dni":  req.body.idDocument.number, //
                    "cuil" :  req.masterData['CUIL'], //
                    "email" : null, //
                    "telefono": null, //
                    "sexo" : req.body.idDocument.gender, //
                    "tramite": req.body.idDocument.tramit, 
                    "nacimiento": req.body.idDocument.birth,
                    "front" : s3.getSignedUrl('getObject', {
                        Bucket: "autenticartuid",
                        Key: "usuarios/" + req.client.id + "/" + req.body.user.dni + req.body.user.sexo + "_F.jpeg",
                        Expires: 10000000
                    }),
                
                    "back" : s3.getSignedUrl('getObject', {
                        Bucket: "autenticartuid",
                        Key: "usuarios/" + req.client.id + "/" + req.body.user.dni + req.body.user.sexo + "_B.jpeg",
                        Expires: 10000000
                    }),
                    "docPhoto" : s3.getSignedUrl('getObject', {
                        Bucket: "autenticartuid",
                        Key: "usuarios/" + req.client.id + "/" + req.body.user.dni + req.body.user.sexo + "_P.jpeg",
                       Expires: 10000000
                    }),
                    "selfie" : s3.getSignedUrl('getObject', {
                        Bucket: "autenticartuid",
                        Key: "usuarios/" + req.client.id + "/" + req.body.user.dni + req.body.user.sexo + "_S.jpeg",
                        Expires: 10000000
                    })
                }
            }
            pars['meta'] = require('./pepInformationService').getPepDataFromBodyRequest(req);
            webhook.notify(req.client.webhook,pars,function(err, res){}, req.client.id);
        } 
        console.log(res.response);
        return res.status(200).json(res.response); 
    });

}
module.exports.checkIfExists = async function (req, res, next){

    AUTHENTICATOR_DB.query(`select * from usuarios where dni = ? and sexo = ? and aplicacion =?`,[req.body.idDocument.number, req.body.idDocument.gender, req.client.id], function(err,doc){
        if (err){
            res.response.message = 'Error de conexion a la base de datos';
            res.response.details = err;
            return res.status(200).json(res.response); 
        }else if (doc.length > 0 && doc[0].estado == "Desaprobado" ){
            res.response.message = 'El usuario ya se encuentra registrado, y no se pudo validar la identidad. Por favor consulte a soporte.';
            res.response.details = err;
            return res.status(200).json(res.response); 
        }else{
            next();
        }
    });
}

//TESTING
//PROBAR CHANCE CON TELEFONO RELACION LAB Y
//LOGICA DE BUCKET POR APP