let liveness = require('../../../utils/liveness');
let slack = require('../../../utils/slack');
const AWS = require('aws-sdk');
const lodash = require("lodash");
const fs = require('fs');
const path = require('path');
const tokenizer = require('../../../utils/tokenizer');
const webhook = require('../../../utils/webhooks');
const reports = require('../../../utils/report');
const pep = require('../pepInformationService');
const attest = require('./attest');
const person = require('../../padron/person');
const questions = require('../../padron/questions');
const rekognition = new AWS.Rekognition();
const s3 = new AWS.S3();

// Guarda el body del request de signup en un archivo JSON (para auditoria/debug)
module.exports.saveBody = (req, res, next) => {
    try {
        const dir = path.join(APP_PATH, 'logs', 'signup');
        fs.mkdirSync(dir, { recursive: true });

        const dni = (req.body && req.body.idDocument && req.body.idDocument.number) || 'unknown';
        const filename = `${Date.now()}_${dni}.json`;

        fs.writeFile(path.join(dir, filename), JSON.stringify(req.body, null, 2), (err) => {
            if (err) console.log("No se pudo guardar el body del signup", err);
        });
    } catch (error) {
        console.log("Error guardando el body del signup", error);
    }
    next();
};

// Carga un body previamente guardado (logs/signup/<idJson>.json) en req.body para reprocesar el signup
module.exports.loadTestBody = (req, res, next) => {
    try {
        const file = path.join(APP_PATH, 'logs', 'signup', req.params.idJson + '.json');
        if (!fs.existsSync(file)) {
            res.response.message = 'No se encontró el JSON de prueba: ' + req.params.idJson;
            return res.status(200).json(res.response);
        }
        req.body = JSON.parse(fs.readFileSync(file, 'utf8'));
        next();
    } catch (error) {
        console.log("Error cargando el body de prueba", error);
        res.response.message = 'Error al cargar el JSON de prueba';
        res.response.details = error.message || error;
        return res.status(200).json(res.response);
    }
};

// Mueve a usuarios/ las imagenes del DNI (_F/_B/_P desde temp) y la imagen de
// referencia del liveness (livenessRef = {Bucket, Name}) como _S.jpeg
function moveimg(dni, sexo, appBucket, livenessRef, next) {
    const mainBucket = CONFIG.get('authenticator').bucketName;
    let finish = lodash.after(4, function () {
        var params = {
            Bucket: mainBucket,
            Delete: {
                Objects: [
                    { Key: 'temp/' + appBucket + '/' + dni + sexo + '_F.jpeg' },
                    { Key: 'temp/' + appBucket + '/' + dni + sexo + '_B.jpeg' },
                    { Key: 'temp/' + appBucket + '/' + dni + sexo + '_P.jpeg' }
                ],
            },
        };
        s3.deleteObjects(params, function (err, data) {
            if (err) next(err);
            else next();
        });
    });
    // Imagen de referencia del liveness -> _S.jpeg (la "selfie" en v2)
    if (!livenessRef || !livenessRef.Bucket || !livenessRef.Name) {
        return next(new Error('No hay imagen de referencia del liveness para mover'));
    }
    var paramsLiveness = {
        CopySource: encodeURI(livenessRef.Bucket + '/' + livenessRef.Name),
        Bucket: mainBucket + '/usuarios/' + appBucket,
        Key: dni + sexo + '_S.jpeg'
    };
    s3.copyObject(paramsLiveness, function (err, data) {
        if (err) next(err);
        else finish();
    });
    var params2 = {
        CopySource: mainBucket + '/temp/' + appBucket + '/' + dni + sexo + '_F.jpeg',
        Bucket: mainBucket + '/usuarios/' + appBucket,
        Key: dni + sexo + '_F.jpeg'
    };
    s3.copyObject(params2, function (err, data) {
        if (err) next(err);
        else finish();
    });
    var params3 = {
        CopySource: mainBucket + '/temp/' + appBucket + '/' + dni + sexo + '_B.jpeg',
        Bucket: mainBucket + '/usuarios/' + appBucket,
        Key: dni + sexo + '_B.jpeg'
    };
    s3.copyObject(params3, function (err, data) {
        if (err) next(err);
        else finish();
    });
    var params4 = {
        CopySource: mainBucket + '/temp/' + appBucket + '/' + dni + sexo + '_P.jpeg',
        Bucket: mainBucket + '/usuarios/' + appBucket,
        Key: dni + sexo + '_P.jpeg'
    };
    s3.copyObject(params4, function (err, data) {
        if (err) next(err);
        else finish();
    });
}

// Deja la imagen de referencia del liveness como temp/<app>/<dni><sexo>_S.jpeg,
// donde la busca el moveimg de chance.js al aprobar la revancha
function stageLivenessRef(dni, sexo, appBucket, referenceImage, next) {
    const mainBucket = CONFIG.get('authenticator').bucketName;
    const Key = 'temp/' + appBucket + '/' + dni + sexo + '_S.jpeg';
    if (referenceImage.S3Object) {
        const ref = referenceImage.S3Object;
        return s3.copyObject({ CopySource: encodeURI(ref.Bucket + '/' + ref.Name), Bucket: mainBucket, Key: Key }, next);
    }
    s3.putObject({ Bucket: mainBucket, Key: Key, Body: referenceImage.Bytes }, next);
}

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


let searchQuery = 'SELECT idUsuario, cuil, nombre, apellido, emailVrf, telefonoVrf, estado from usuarios  WHERE dni = ? and sexo = ? and aplicacion = ? ';
let blacklistQuery = "SELECT dni FROM lista_negra WHERE dni=? and sexo=? and activo=1 and  (aplicacion ='' or aplicacion = ? )";
let checkQuery = 'select * from usuarios where dni = ? and sexo = ? and aplicacion =?';

// Devuelve un sessionId de Face Liveness (uso interno / pruebas)
module.exports.session = async (req, res, next) => {
    try {
        let sessionId = await liveness.createSession();
        await new Promise(function (resolve) {
            attest.saveChallenge(sessionId, req.client, resolve);
        });
        return res.status(200).json({ sessionId });
    } catch (error) {
        console.log("Error creando la sesión de liveness", error);
        res.response.message = 'Error creando la sesión de liveness';
        res.response.details = error.message || error;
        return res.status(200).json(res.response);
    }
}

module.exports.search = async (req, res, next) => {

    let document = req.body.document;
    let gender = req.body.gender;
    res.response.liveness = false;
    if (!req.client) {
        res.response.res = 'error';
        res.response.status = 400;
        res.response.message = 'Cliente no encontrado';
        return res.status(200).json(res.response);
    }
    try {
        if (req.client.alwayRegister) {
            res.response.status = 200;
            res.response.message = 'Registrar siempre';
        } else {
            let user = await AUTHENTICATOR_DB.query(searchQuery, [document, gender, req.client.id]);
            if (user.length > 0) {
                let user = user[0];
                if (user.estado == 'Ok') {
                    res.response.status = 201;
                    res.response.message = 'Usuario encontrado';
                } else {
                    res.response.status = 200;
                    res.response.message = 'Usuario no finalizo el registro - Continuar con el registro';
                }
            } else {
                res.response.status = 200;
                res.response.message = 'Usuario no encontrado - Continuar con el registro';
            }
        }
        if (res.response.status == 200) {
            res.response.res = "GoToSignup";
            let sessionId = await liveness.createSession();
            res.response.sessionId = sessionId;
            res.response.liveness = true;
            await new Promise(function (resolve) {
                attest.saveChallenge(sessionId, req.client, resolve);
            });
        }else if (res.response.status == 201) {
            res.response.liveness = false;
            res.response.res = "GoToLogin";
        }

    } catch (error) {
        res.response.res = 'error';
        res.response.status = 400;
        res.response.message = 'Error al buscar el usuario';
        res.response.details = error;
    }

    return res.status(200).json(res.response);
}

module.exports.validateUser = async (req, res, next) => {
   
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
    try {
        let user = await AUTHENTICATOR_DB.sync_query(checkQuery,[req.body.idDocument.number, req.body.idDocument.gender, req.client.id]);
        console.log("user", user, req.body.idDocument.number, req.body.idDocument.gender, req.client.id);
        if (user.length > 0 && user[0].estado == "Desaprobado" ){
            res.response.message = 'El usuario ya se encuentra registrado, y no se pudo validar la identidad. Por favor consulte a soporte.';
            res.response.details = err;
            return res.status(200).json(res.response); 
        }else{ //si no existe o fue aprobado, continua con el registro
            let rows = await AUTHENTICATOR_DB.sync_query(blacklistQuery, [req.body.idDocument.number, req.body.idDocument.gender, req.client.id]);
            if (rows.length > 0) { //si existe en la lista negra, devuelve error
                res.response.message = 'Este DNI se encuentra en la lista negra';
                res.response.details = 'Este DNI se encuentra en la lista negra';
                return res.status(200).json(res.response);  
            } 
        }
        const found = await person.findPerson(req.body.idDocument.number, req.body.idDocument.gender);
        if (found) {
            req.masterData = found.legacy;
            req.padronRow = found.row;
            var fecha_hoy = new Date();
            var ahora_ano = fecha_hoy.getYear();
            var ahora_mes = fecha_hoy.getMonth()+1;                
            var ahora_dia = fecha_hoy.getDate();
            // realizamos el calculo
            var edad = (ahora_ano + 1900) - req.masterData.ano;
            if (ahora_mes < req.masterData.mes) edad--;
            if ((req.masterData.mes === ahora_mes) && (ahora_dia < req.masterData.dia)) edad--;
            if (edad > 1900) edad -= 1900;
            if (edad <18){
                res.response.message = "Menor de edad";
                return res.status(200).json(res.response); 
            } else {
                next();
            }
        } else {
            res.response.message = 'No se encontraron datos en el BCRA';
            if (req.client && req.client.id == 'sancristauth') res.response.message = "No se encontró a la persona en base de datos";
            res.response.details = 'No se encontraron datos en el BCRA';
            slack.error(req.body.idDocument.number + " "+ req.body.idDocument.gender+" No pudo registrarse por que no figura en los registros");
            return res.status(200).json(res.response); 
        }
    } catch (error) {
        console.log("error", error);
        res.response.message = 'Error de conexion a la base de datos';
        res.response.details = error;
        return res.status(200).json(res.response); 
    }
    
}

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
    var compare = lodash.after(3, function () {
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
    upload(req.body.idDocument.photo, namefile + 'P.jpeg',req.client.bucketFolder, function (err, result) {
        if (err) {
            res.response.message = 'No pudo subir la imagen del selfie';
            res.response.details = err;
            error = true;
        } 
        compare();
    });
}

module.exports.validateImages = async (req, res, next) => {
    console.log("validating images");

    const authConfig = CONFIG.get('authenticator');

    try {
        let sessionId = req.body.sessionId;
        if (!sessionId) {
            res.response.message = 'Falta el sessionId de la verificación de vida';
            return res.status(200).json(res.response);
        }

        // 1) Resultado de la prueba de vida (liveness) asociada al sessionId
        let session = await liveness.getSessionResults(sessionId);
        console.log("session", session);
        if (session.Status !== 'SUCCEEDED' || session.Confidence < authConfig.livenessThreshold) {
            res.response.message = 'No se pudo confirmar la prueba de vida. Por favor intente nuevamente.';
            res.response.confidence = session.Confidence;
            req.body.estado = 'Error';
            return res.status(200).json(res.response);
        }

        if (!session.ReferenceImage || (!session.ReferenceImage.S3Object && !session.ReferenceImage.Bytes)) {
            res.response.message = 'No se obtuvo la imagen de referencia de la verificación de vida';
            return res.status(200).json(res.response);
        }

        // Con OutputConfig activo, la imagen de referencia viene como S3Object; si no, como Bytes
        let referenceSource = session.ReferenceImage.S3Object
            ? { S3Object: { Bucket: session.ReferenceImage.S3Object.Bucket, Name: session.ReferenceImage.S3Object.Name } }
            : { Bytes: session.ReferenceImage.Bytes };

        // 2) Comparar la imagen de referencia del liveness contra la foto del documento (_P.jpeg)
        let docPhotoKey = 'temp/' + req.client.bucketFolder + '/' +
            req.body.idDocument.number + req.body.idDocument.gender + '_P.jpeg';

        let params = {
            SimilarityThreshold: 1,
            SourceImage: referenceSource,
            TargetImage: { S3Object: { Bucket: authConfig.bucketName, Name: docPhotoKey } }
        };

        let data = await rekognition.compareFaces(params).promise();

        if (!data.FaceMatches || data.FaceMatches.length === 0) {
            res.response.message = 'No se reconoce ningún rostro coincidente, por favor verifique la calidad de la foto';
            req.body.estado = 'Error';
            return res.status(200).json(res.response);
        }

        let similarity = data.FaceMatches[0].Similarity;
        req.body.similitud = similarity;
        res.response.similarity = similarity;

        if (similarity < authConfig.revengePercentage) {
            // Por debajo del minimo: rechazo directo
            res.response.message = 'No nos fue posible realizar la Autenticación. Su información personal y los datos biométricos obtenidos no son coincidentes.';
            req.body.estado = 'Error';
            return res.status(200).json(res.response);
        } else if (similarity < authConfig.approvePercentage) {
            // Banda intermedia: revancha con pregunta de conocimiento
            res.response.message = 'chance';
            req.body.estado = 'Revancha';
            return stageLivenessRef(req.body.idDocument.number, req.body.idDocument.gender, req.client.bucketFolder, session.ReferenceImage, function (err) {
                if (err) {
                    console.log(err);
                    res.response.message = "Error al subir imagen";
                    return res.status(200).json(res.response);
                }
                addQuestion(req, res, next);
            });
        }

        // Por encima del umbral de aprobacion: mover imagenes y continuar
        req.body.estado = 'Verificar';
        moveimg(req.body.idDocument.number, req.body.idDocument.gender, req.client.bucketFolder, session.ReferenceImage.S3Object, function (err) {
            if (err) {
                res.response.message = "Error al subir imagen";
                return res.status(200).json(res.response);
            }
            next();
        });
    } catch (error) {
        console.log(error);
        res.response.message = 'Error en la validación de imágenes';
        res.response.details = error.message || error;
        return res.status(200).json(res.response);
    }
}

async function addQuestion(req, res, next) {
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

module.exports.loadTestBody = async (req, res, next) => {
    console.log("loading test body");
    const dir = path.join(APP_PATH, 'logs', 'signup');
    const filename = req.params.idJson + '.json';
    const filePath = path.join(dir, filename);
    const fileContent = fs.readFileSync(filePath, 'utf8');
    req.body = JSON.parse(fileContent);
    next();
}

module.exports.createUser = async (req, res, next) => {
    console.log("creating user");
    var paramsArray = [];

    if (req.body.estado == 'Verificar'
        && !req.client.settings.mailValidationMandatory
        && !req.client.settings.phoneValidationMandatory
        && !req.client.settings.addressValidationMandatory) {
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
    paramsArray.push(req.body.ArrayPreguntas ? req.body.ArrayPreguntas[req.body.pregunta] : null);
    paramsArray.push(req.body.estado);
    paramsArray.push(req.body.similitud);
    paramsArray.push(req.body.idDevice);
    paramsArray.push(req.masterData['CUIL']);
    paramsArray.push(req.body.idDocument.issue);
    paramsArray.push(req.client.id);
    paramsArray.push(req.body.os);
    paramsArray.push(req.body.version  );
    paramsArray.push(req.body.idDocument.type);
    paramsArray.push(req.body.idDocument.nfc);
    paramsArray.push(req.body.idDocument.nfcCode);
    paramsArray.push(req.body.idDocument.example || null);
    const attestVrf = !!(req.appAttest && req.appAttest.verified);
    paramsArray.push(attestVrf ? 1 : 0);

    let query = `insert into usuarios 
    (dni, sexo, nombre, apellido, tramite, nacimiento, vencimiento, direccion, id_pregunta, id_respuesta, estado, similitud, id_device, cuil, fecha, emision, aplicacion, os, version, tipo, nfc, nfc_opencode, ejemplar, attestVrf) 
    values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP(),?,?,?,?,?,?,?,?,?) on duplicate key update nombre = values(nombre), apellido= values(apellido),
    tramite = values(tramite),nacimiento = values(nacimiento),vencimiento = values(vencimiento),direccion = values(direccion),
    id_pregunta = values(id_pregunta),id_respuesta = values(id_respuesta),estado = values(estado),similitud = values(similitud),
    id_device = values(id_device),cuil = values(cuil),fecha = values(fecha),emision = values(emision), os = values(os), email = null, telefono = null, telefonoVrf = 0, emailVrf = 0, addressVrf = 0, tipo = values(tipo), nfc = values(nfc), nfc_opencode = values(nfc_opencode), version = values(version), ejemplar = values(ejemplar), attestVrf = values(attestVrf)
    `;
    AUTHENTICATOR_DB.query(query, paramsArray, function (err, result) {
        if (err) {
            console.log(err);
            res.response.message = 'No se pudo crear el registro de usuario, es probable que el usuario ya exista. Contacte a soporte';
            res.response.details = err;
            return res.status(200).json(res.response);
        } else {
            reports.authenticatorConsume(req.client.id, "R");
            res.response.res = "ok";
            res.response.message = res.response.message || req.body.estado; // "Ok"/"Verificar"; preserva "chance" en revancha
            let authData = {};
            authData.idUsuario = result.insertId;
            authData.flow = "SIGNUP";
            authData.estado = req.body.estado;
            authData.dni = req.body.idDocument.number;
            authData.sexo = req.body.idDocument.gender;
            authData.cuil = req.masterData['CUIL'];
            authData.nacimiento = req.body.idDocument.birth;
            authData.tramite = req.body.idDocument.tramit;
            authData.nombre = req.body.idDocument.name;
            authData.apellido = req.body.idDocument.lastname;
            authData.id_respuesta = tokenizer.encrypt((req.body.ArrayPreguntas ? req.body.ArrayPreguntas[req.body.pregunta] : null) + "");
            authData.id_pregunta = req.body.pregunta;
            authData.attestVrf = attestVrf;
            res.response.requireData = req.client.settings;
            res.response.iduser = result.insertId;
            res.response.telefonoVrf = false;
            res.response.emailVrf = false;
            res.response.addressVrf = false;
            res.response.attestVrf = attestVrf;
            res.response.authToken = tokenizer.tokenize(authData);
            if (attestVrf && req.appAttest.keyId && result.insertId) {
                attest.bindKeyToUser(req.appAttest.keyId, result.insertId).catch(function (err) {
                    console.log('App Attest: error asociando key al usuario', err);
                });
            }
        }

        if (req.body.estado == "Ok" && req.client.webhook != null) {
            var pars = {
                "text": "Nueva alta",
                "data": {
                    "nombre": req.body.idDocument.name,
                    "apellido": req.body.idDocument.lastname,
                    "dni": req.body.idDocument.number,
                    "cuil": req.masterData['CUIL'],
                    "email": null,
                    "telefono": null,
"address": null,
"nfc": req.body.idDocument.nfc ? req.body.idDocument.nfc : false,
"tipo": req.body.idDocument.type,
"ejemplar": req.body.idDocument.example,

                    "sexo": req.body.idDocument.gender,
                    "tramite": req.body.idDocument.tramit,
                    "nacimiento": req.body.idDocument.birth,
                    "front": s3.getSignedUrl('getObject', {
                        Bucket: CONFIG.get('authenticator').bucketName,
                        Key: "usuarios/" + req.client.bucketFolder + "/" + req.masterData['DNI'] + req.masterData['Sexo'] + "_F.jpeg",
                        Expires: 10000000
                    }),
                    "back": s3.getSignedUrl('getObject', {
                        Bucket: CONFIG.get('authenticator').bucketName,
                        Key: "usuarios/" + req.client.bucketFolder + "/" + req.masterData['DNI'] + req.masterData['Sexo'] + "_B.jpeg",
                        Expires: 10000000
                    }),
                    "docPhoto": s3.getSignedUrl('getObject', {
                        Bucket: CONFIG.get('authenticator').bucketName,
                        Key: "usuarios/" + req.client.bucketFolder + "/" + req.masterData['DNI'] + req.masterData['Sexo'] + "_P.jpeg",
                        Expires: 10000000
                    }),
                    "selfie": s3.getSignedUrl('getObject', {
                        Bucket: CONFIG.get('authenticator').bucketName,
                        Key: "usuarios/" + req.client.bucketFolder + "/" + req.masterData['DNI'] + req.masterData['Sexo'] + "_S.jpeg",
                        Expires: 10000000
                    })
                }
            }
            pars['meta'] = pep.getPepDataFromBodyRequest(req);
            webhook.notify(req.client.webhook, pars, function (err, res) { }, req.client.id);
        }
        return res.status(200).json(res.response);
    });
}

