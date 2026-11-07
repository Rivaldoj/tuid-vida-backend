const bucket = require('../../../utils/bucket');
const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const reports = require('../../../utils/report');
const lodash = require('lodash');
const path = require('path');
const fs = require('fs');
var rekognition = new AWS.Rekognition();
const authConfig = CONFIG.get('authenticator');
const webhook = require('./../../../utils/webhooks');
var dbr = require('dynamsoft-javascript-barcode');
var Bucket = authConfig.bucketName;
var levenshtein = require('fast-levenshtein');
const person = require('../../padron/person');

const { Parser } = require('json2csv');
module.exports.validateCode = (req, res, next) => {
    var whiteBrand = CONFIG.get('authenticator').whitebrands.find(e=>{return e.id == req.user.aplicacion && e.token != null});
    if (!whiteBrand) whiteBrand = CONFIG.get('authenticator').whitebrands.find(e => {return e.id == "tuidauth"});
    let query = `select nombre, apellido, dni, sexo, cuil, usuarios.fecha, tramite, nacimiento, vencimiento, 
    email, emailVrf, telefono, telefonoVrf, usuarios.similitud, auth.token, auth.latitud, auth.longitud, auth.similitud,
    if (auth.fecha_expiracion < NOW(), 1, 0 ) as expirado
    from usuarios, auth where auth.idUsuario = usuarios.idUsuario and aplicacion = ? and usuarios.dni = ? order by auth.fecha desc`
    let app = whiteBrand.id;
    AUTHENTICATOR_DB.query(query,[app, req.query.dni], function(err, docs){
        if (err){
            res.response.details = err;
            res.response.res = "error";
            res.response.status = 400; 
            res.response.message = "Error de servidor";
            return res.status(400).json(res.response);
        }else if (docs.length < 1 ){
            res.response.res = "error";
            res.response.status = 400; 
            res.response.message = "Usuario no encontrado";
            return res.status(400).json(res.response);
        }else{
            if (docs[0].token != req.query.authtoken){
                res.response.res = "error";
                res.response.status = 400; 
                res.response.message = "Codigo  incorrecto";
                return res.status(400).json(res.response);
            }else if (docs[0].expirado){
                res.response.res = "error";
                res.response.status = 400; 
                res.response.message = "Codigo expirado o ya utilizado";
                return res.status(400).json(res.response);
            }else{
                res.response = docs[0];
                res.response.res = "ok";
                res.response.status = 200; 
                res.response.frente = s3.getSignedUrl('getObject', {
                    Bucket: "autenticartuid",
                    Key: "usuarios/" + app + "/" + docs[0].dni + docs[0].sexo + "_F.jpeg",
                    Expires: 10000000
                });
                res.response.dorso = s3.getSignedUrl('getObject', {
                    Bucket: "autenticartuid",
                    Key: "usuarios/" + app + "/" + docs[0].dni + docs[0].sexo + "_B.jpeg",
                    Expires: 10000000
                });
                res.response.selfie = s3.getSignedUrl('getObject', {
                    Bucket: "autenticartuid",
                    Key: "usuarios/" + app + "/" + docs[0].dni + docs[0].sexo + "_S.jpeg",
                    Expires: 10000000
                });
                reports.authenticatorConsume(req.user.aplicacion, "C");
                return res.status(200).json(res.response);
            }
           
        }
    })
    
}


module.exports.filter = (req, res,next) => { 
    req.body.params = [];
    req.body.query = "select nombre, dni, sexo, apellido, cuil, fecha, aplicacion, estado, similitud, idUsuario from  usuarios u where (u.aplicacion = ? or 'S' = ?)";
    req.body.params.push(req.user.aplicacion);
    req.body.params.push(req.user.rol);
    if ( req.query.aplicacion ){
        req.body.query = req.body.query + " and aplicacion = ?"
        req.body.params.push(req.query.aplicacion);
    }
    if ( req.query.text ){
        req.body.query = req.body.query +" and (dni = ? or cuil =? or nombre like ? or apellido like ?)" 
        req.body.params.push(req.query.text);
        req.body.params.push(req.query.text);
        req.body.params.push('%'+req.query.text+'%');
        req.body.params.push('%'+req.query.text+'%');
    }
    if ( req.query.gender ){
        req.body.query = req.body.query + " and sexo = ? "
        req.body.params.push(req.query.gender);
    }
    next();

}

module.exports.list = (req, res,next) => {
    res.response.error = 1;
    res.response.data = "Error desconocido";
    req.body.query = req.body.query + "order by fecha desc limit 500";
    AUTHENTICATOR_DB.query(req.body.query, req.body.params,
    function(err,rows){
        if (err){
            res.response.data = "Error conectando con la base de datos";
            return res.status(400).json(res.response);
        }else{
            res.response.error = 0;
            res.response.data = rows;
            return res.status(200).json(res.response);
        }
    })
}


module.exports.download = (req, res,next) => {
    res.response.error = 1;
    res.response.data = "Error desconocido";

    req.body.query = req.body.query + " order by fecha desc";
    AUTHENTICATOR_DB.query(req.body.query, req.body.params, function(err,rows){
        if (err){
            res.response.data = "Error conectando con la base de datos";
            return res.status(400).json(res.response);
        }else{
            const json2csv = new Parser();
            const csv = json2csv.parse(rows);
            res.header('Content-Type', 'text/csv');
            res.attachment('registrations.csv');
            return res.send(csv);
        }
    })
}

module.exports.cleanBody = async (req, res, next) => {
    console.log("cleaning body");

    res.response.error = 1;
    res.response.data = "Error desconocido";

    req.body.dni = req.body.dni.replace(/ /g,"");
    if(req.body.dni.substr(0,1) === 'M'|| req.body.dni.substr(0,1) === 'F'){
        req.body.dni = req.body.dni.substr(1);
    }
    req.body.cuil = req.body.cuil.replace("-","");
    req.body.nombre =  req.body.nombre.replace(/nxx/gi,"n");
    req.body.apellido =  req.body.apellido.replace(/nxx/gi,"n");
    req.body.nombre  =  req.body.nombre.replace("'"," ");
    req.body.apellido = req.body.apellido.replace("'"," ");
    req.body.nombre = req.body.nombre.replace(/ñ/gi,"n");
    req.body.apellido = req.body.apellido.replace(/ñ/gi,"n");
    req.body.nombre = req.body.nombre.toUpperCase();
    req.body.apellido = req.body.apellido.toUpperCase();
    req.body.nombre = req.body.nombre.replace(/  /g," ");
    req.body.apellido = req.body.apellido.replace(/  /g," ");
    next();
}


module.exports.create = (req, res,next) => {
    var front = req.body.front;
    var back = req.body.back;
    var selfie = req.body.selfie;
    var dni = req.body.dni;
    var sexo = req.body.sexo;
    var nacimiento = req.body.nacimiento;
    var cuil = req.body.cuil;
    var nombre = req.body.nombre;
    var tramite = req.body.nombre;
    var apellido = req.body.apellido;
    var email = req.body.email;
    var telefono = req.body.telefono;
    var aplicacion = req.body.aplicacion;

    if (req.user.rol != "S"){
        res.response.data = "No tienes permisos para ejecutar este método";
        return res.status(400).json(res.response);
    }

    let finish = lodash.after(4, function(){
        let insert = `insert into usuarios(dni, sexo, nombre, apellido,email,telefono,tramite,cuil,nacimiento,similitud,fecha,estado) 
        values(?,?,?,?,?,?,?,?,?,100,now(),'Verificar') on duplicate key update telefono= values(telefono), email=values(email), estado = values(estado),fecha= values(fecha)`
        AUTHENTICATOR_DB.query(insert,[dni,sexo,nombre,apellido,email,telefono,tramite,cuil,nacimiento], function(err, doc){
            if (err){
                res.response.data = "Error conectando con la base de datos";
                return res.status(400).json(res.response);
            }else{
                res.error = 0;
                res.data = "Usuario generado con éxito";
                return res.status(200).json(res.response);
            }
        })
    });

    let fnf = dni + sexo + '_F.jpeg';
    let fnb = dni + sexo + '_B.jpeg';
    let fns = dni + sexo + '_S.jpeg';
    let fnp = dni + sexo + '_P.jpeg';
    let bucketName = CONFIG.get('authenticator').bucketName + '/usuarios/' + aplicacion;
    bucket.base64toBucket(front,fnf,bucketName, function(err, ok){
        if (err){
            res.response.data = "Error almacenando las imágenes";
            return res.status(400).json(res.response);
        }else{
            finish();
        }
    });
    bucket.base64toBucket(back,fnb,bucketName, function(err, ok){
        if (err){
            res.response.data = "Error almacenando las imágenes";
            return res.status(400).json(res.response);
        }else{
            finish();
        }
    });
    bucket.base64toBucket(selfie,fns,bucketName, function(err, ok){
        if (err){
            res.response.data = "Error almacenando las imágenes";
            return res.status(400).json(res.response);
        }else{
            finish();
        }
    });
    bucket.base64toBucket(front,fnp,bucketName, function(err, ok){
        if (err){
            res.response.data = "Error almacenando las imágenes";
            return res.status(400).json(res.response);
        }else{
            finish();
        }
    });
}


module.exports.searchUser = (req, res, next) => {

    res.response.error = 1;
    res.response.data = "";
    console.log(req.params);
    console.log(req.user);
    AUTHENTICATOR_DB.query("select * from usuarios where idUsuario = ?  and (aplicacion = ? or 'S'= ?)",[req.params.idUser, req.user.aplicacion, req.user.rol],
    function(err, doc){
        if (err || doc.length == 0){
            console.log(err);
            res.response.data = "Validacion no encontrada";
            return res.status(400).json(res.response);
        }else{
            req.usuario = doc[0];
            next();
        }
    } )
}


module.exports.searchUserByDocumentAndGender = (req, res, next) => {

    res.response.error = 1;
    res.response.data = "";
    console.log(req.params);
    console.log(req.user);
    AUTHENTICATOR_DB.query("select * from usuarios where dni = ? and sexo = ?  and (aplicacion = ? or 'S'= ?)",[req.params.document, req.params.gender, req.user.aplicacion, req.user.rol],
    function(err, doc){
        if (err || doc.length == 0){
            console.log(err);
            res.response.data = "Validacion no encontrada";
            return res.status(400).json(res.response);
        }else{
            req.usuario = doc[0];
            next();
        }
    } )
}

module.exports.data = (req, res, next) => {

    res.response.front = s3.getSignedUrl('getObject', {
        Bucket: "autenticartuid",
        Key: "usuarios/" + req.usuario.aplicacion + "/" + req.usuario.dni + req.usuario.sexo + "_F.jpeg",
        Expires: 10000000
    });

    res.response.back = s3.getSignedUrl('getObject', {
        Bucket: "autenticartuid",
        Key: "usuarios/" + req.usuario.aplicacion + "/" + req.usuario.dni + req.usuario.sexo + "_B.jpeg",
        Expires: 10000000
    });

    res.response.docPhoto = s3.getSignedUrl('getObject', {
        Bucket: "autenticartuid",
        Key: "usuarios/" + req.usuario.aplicacion + "/" + req.usuario.dni + req.usuario.sexo + "_P.jpeg",
       Expires: 10000000
    });
    res.response.selfie = s3.getSignedUrl('getObject', {
        Bucket: "autenticartuid",
        Key: "usuarios/" + req.usuario.aplicacion + "/" + req.usuario.dni + req.usuario.sexo + "_S.jpeg",
        Expires: 10000000
    });
    res.response.error = 0;
    res.response.user = req.usuario;
    return res.status(200).json(res.response);

   
}



module.exports.validateCompany = async (req,res,next)=>{
    res.response = {
        res: 'error',
        status: 200,
        message: 'La empresa seleccionada no esta dada de alta',
        details: ""
    };
    if (!req.body.company) return res.json(res.response);

    if (!req.body.telefono){
        res.response.message = "El teléfono es necesario";
        return res.json(res.response);
    }
    if (!req.body.email) {
        res.response.message = "El email es necesario";
        return res.json(res.response);
    }
    AUTHENTICATOR_DB.query('select * from whitebrands where id = ?',[req.body.company], function(err,result){
        if (err || result.length == 0) return res.json(res.response);
        next();
    })

}


module.exports.manuallyRegister = async (req,res,next)=>{

    var info = req.body;
    var front = info.front;
    var back = info.back;
    var selfie = info.selfie;
    var email = info.email;
    var aplicacion = info.company;
    var docForced = false;
    var telefono = null;
    var datos = [];
    if (info.telefono && info.telefono.substring(0,3)=='TID'){
        datos = info.telefono.replace('TID','').split('@');
        if (datos.length > 3) docForced = true;
    }else{
        telefono = info.telefono;
    }
    
    var documento;
    res.response = {
        "res": "ok",
        "data": ""
    };
    var pdf417;
    var facedetect;
    var dni;
    var sexo;
    var name;
    var last_name;
    var similitud;
    
    decode_base64(front,"front.jpg", function (err) {
        if (err){
            console.log(err);
            throw err;
        }
    });
    dbr.BarcodeReader.productKeys = CONFIG.get('dynamsoft.productKeys');
    var ruta = './uploads/front.jpg';

    var done = lodash.after(1, function () {
        var textback;
        var comprobacion;
        var compare = lodash.after(3, function () {
            var fin = lodash.after(4, function () {
                if(res.response.res === 'error'){
                    return res.json(res.response);
                }else{
                    var params = {
                        CollectionId: "tuidvida",
                        DetectionAttributes: [],
                        ExternalImageId: dni + sexo,
                        Image: {
                            S3Object: {
                                Bucket: "autenticartuid",
                                Name: `temp/${aplicacion}/` + dni + sexo + "_S.jpeg"
                            }
                        }
                    };
                    console.log(params);
                    rekognition.indexFaces(params, function (err, data) {
                        if (err) {
                            res.response.res = 'error';
                            res.response.message = 'No se pudo finalizar el registro';
                            res.response.details = err;
                            return res.status(res.response.status).json(res.response);
                        }
                        else {
                            moveimg(dni,sexo,aplicacion, function () {});
                            putResult(documento, sexo, name, last_name,cuil,similitud,direccion,req.user,email,telefono,aplicacion, function (err, result) {
                                if (err) {
                                    res.response.res = 'error';
                                    res.response.message = 'No se pudo crear el registro de usuario';
                                    res.response.details = err;
                                    return res.json(res.response);
                                }else{
                                    res.response = {
                                        res: 'ok',
                                        status: 200,
                                        message: 'Aprobado',
                                        documento: documento
                                    };
                                    webhook.validateAndSend(documento.dni, documento.sexo, aplicacion);
                                    return res.json(res.response);
                                }
                            });
                        }
                    });
                }
            });
            var params1 = {
                Image: { /* required */
                    S3Object: {
                        Bucket: Bucket,
                        Name: `temp/${aplicacion}/` + facedetect
                    }
                }
            };
            
            rekognition.detectText(params1, function (err, data) {
                if (err) {
                    return res.json(err);
                } else {
                    console.log('Comienzo escaneo dorso del dni');
                    data.TextDetections.forEach(function (textdetection) {
                        textback = textback + ' ' + textdetection.DetectedText;
                    });
                    var apellido = documento.apellido.replace(/ /g,"<");
                    comprobacion = comprobacion * textback.search(apellido);
                    comprobacion = comprobacion * textback.search(documento.dni);

                    if (comprobacion < 0) {
                        res.response.res = 'error';
                        res.response.message = 'No se puede comprobar la integridad del documento';
                        res.response.documento = documento;
                        fin();
                    } else {
                        res.response.res = 'ok';
                        direccion = data.TextDetections[0].DetectedText + data.TextDetections[1].DetectedText + data.TextDetections[3].DetectedText;
                        fin();
                    }
                }        // successful response
            });
            var params2 = {
                SimilarityThreshold: 1,
                SourceImage: {
                    S3Object: {
                        Bucket: Bucket,
                        Name: `temp/${aplicacion}/` + documento.dni + documento.sexo + "_F.jpeg"
                    }
                },
                TargetImage: {
                    S3Object: {
                        Bucket: Bucket,
                        Name: `temp/${aplicacion}/` + documento.dni + documento.sexo + "_S.jpeg"
                    }
                }
            };
            rekognition.compareFaces(params2, function (err, data) {
                if (err) {
                    res.response = {
                        res: 'error',
                        status: 200,
                        message: 'Error en la comparacion',
                        details: err,
                    };
                    return res.json(res.response);
                } // an error occurred
                else {
                    if (data.FaceMatches.length > 0) {
                        similitud = data.FaceMatches[0].Similarity;
                        if (similitud < authConfig.manuallyPercentage) {
                            res.response = {
                                res: 'error',
                                status: 200,
                                message: `Los datos biometricos no coinciden. Coincidencia : ${similitud}`
                            };
                            return res.status(res.response.status).json(res.response);
                        } else {
                            console.log('Comparacion Biometrica');
                            fin();
                        }
                    }
                }
            });
            Clientehabilitado (dni,sexo,aplicacion, function (err, result) {
                if (err) {
                    res.response = {
                        res: 'error',
                        status: 200,
                        message: err,
                    };
                    return res.status(res.response.status).json(res.response);
                } else {
                    fin();
                }
            });
            getData(dni, sexo, function (err, result) {
                if (err) {
                    res.response = {
                        res: 'error',
                        status: 200,
                        message: err.message,
                        details : err.details
                    };
                    fin();
                } else  {
                    cuil = result['CUIL'];
                    nombre = result['Nombres'];

                    name = name.replace(/nxx/gi, "n");
                    last_name = last_name.replace(/nxx/gi, "n");
                    name = name.replace("'", " ");
                    last_name = last_name.replace("'", " ");
                    name = name.replace(/ñ/gi, "n");
                    last_name = last_name.replace(/ñ/gi, "n");
                    name = name.toUpperCase();
                    last_name = last_name.toUpperCase();
                    name = name.replace(/  /g, " ");
                    last_name = last_name.replace(/  /g, " ");

                    var count = (nombre.match(/�/g) || []).length;
                    if (count !== 0) count = count + (nombre.match(/,/g) || []).length + 1;
                    var distance = levenshtein.get(nombre, last_name + ' ' + name);

                    if ((nombre.toUpperCase().indexOf(last_name) !== -1) || distance < count) {
                        fin();
                    }else{
                        res.response = {
                            res: 'error',
                            status: 200,
                            message: 'Los datos del DNI no coinciden con nuestra base de datos'
                        };
                        fin();
                    }
                }
            });
        });
        upload(front, documento.dni + documento.sexo + '_F.jpeg', aplicacion,function (err, result) {
            if (err) {
                res.response.res = 'error';
                res.response.message = 'No pudo subir la imagen del selfie';
                res.response.details = err;
                return res.json(res.response);
            } else {
                compare();
            }
        });
        upload(back, documento.dni + documento.sexo + '_B.jpeg',aplicacion, function (err, result) {
            if (err) {
                res.response.res = 'error';
                res.response.message = 'No pudo subir la imagen del dorso del dni';
                res.response.details = err;
                return res.json(res.response);
            } else {
                compare();
            }
        });
        upload(selfie, documento.dni + documento.sexo + '_S.jpeg',aplicacion, function (err, result) {
            if (err) {
                res.response.res = 'error';
                res.response.message = 'No pudo subir la selfie';
                res.response.details = err;
                return res.json(res.response);
            } else {
                compare();
            }
        });
    });
    fs.readFile(ruta, function (err, data) {
        dbr.BarcodeReader.createInstance().then(reader => {
            let settings = reader.getRuntimeSettings();
            settings.localizationModes = [2,0,0,0,0,0,0,0];
            settings.deblurLevel = 9;
            reader.updateRuntimeSettings(settings);
            reader.decode(data).then(results => {
                if (results.length > 0){
                    pdf417 = results[0].BarcodeText.replace(/\uFFFD/g, '').split('@');
                    reader.destroy();
                    if (docForced){
                        documento.dni = datos[0];
                        documento.sexo = datos[1];
                        documento.apellido = datos[2];
                        documento.nombre = datos[3];
                        documento.tramite = null;
                        documento.fechaNac = null;
                        documento.fechaexp = null;
                        documento.tipo = null;
                        
                    }else{
                        documento = {
                            tramite: pdf417[0],
                            apellido:pdf417[1],
                            nombre:  pdf417[2],
                            sexo:    pdf417[3],
                            dni:     pdf417[4],
                            tipo:    pdf417[5],
                            fechaNac:pdf417[6],
                            fechaexp:pdf417[7]
                        };
                    }
                    
                    
                    documento.dni = cleanDoc(documento.dni);
                    dni=documento.dni;
                    sexo=documento.sexo;
                    name= documento.nombre;
                    last_name= documento.apellido;
                    facedetect = dni + sexo + '_B.jpeg';
                    console.log('Escaneo frente del dni');
                    done();
                } else {
                    decode_base64(back,"back.jpg", function (err) {
                        if (err) throw error;
                    });
                    ruta = './uploads/back.jpg';
                    fs.readFile(ruta, function (err, data) {
                        dbr.BarcodeReader.createInstance().then(reader => {
                            /*let settings = reader.getRuntimeSettings();
                            settings.localizationModes = [2,0,0,0,0,0,0,0];
                            settings.deblurLevel = 9;
                            reader.updateRuntimeSettings(settings);
                            */reader.decode(data).then(results => {
                                if (results.length > 0) {
                                    pdf417 = results[0].BarcodeText.replace(/\uFFFD/g, '').split('@');
                                    reader.destroy();
                                    if (docForced){
                                        documento.dni = datos[0];
                                        documento.sexo = datos[1];
                                        documento.apellido = datos[2];
                                        documento.nombre = datos[3];
                                        documento.tramite = null;
                                        documento.fechaNac = null;
                                        documento.fechaexp = null;
                                        documento.tipo = null;
                                    }else{
                                        documento = {
                                            tramite: pdf417[10],
                                            apellido:pdf417[4],
                                            nombre:  pdf417[5],
                                            sexo:    pdf417[8],
                                            dni:     pdf417[1],
                                            tipo:    pdf417[2],
                                            fechaNac:pdf417[7],
                                            fechaexp:pdf417[9],
                                            cuil:    pdf417[3]
                                        };
                                    }
                                    
                                    documento.dni = cleanDoc(documento.dni);
                                    dni=documento.dni;
                                    sexo=documento.sexo;
                                    name= documento.nombre;
                                    last_name=documento.apellido;
                                    facedetect = dni + sexo + '_F.jpeg';
                                    console.log('Escaneo frente del dni');
                                    done();
                                }else{
                                    appData = {
                                        res: 'error',
                                        status: 200,
                                        message: 'No se reconoce el documento, pruebe subir una foto de mayor calidad'
                                    };
                                    return res.json(appData);
                                }
                            });
                        });
                    });
                }
            }).catch(E=>{
                console.log(E);
                appData = {
                    res: 'error',
                    status: 200,
                    message: `Error en la lectura del PDF, asegurese que la imagen no sea muy pesada. ${JSON.stringify(E)}`
                };
                return res.json(appData);
            });
        }).catch(e=>{
            appData = {
                res: 'error',
                status: 200,
                message: 'Error en la lectura del PDF, asegurese que la imagen no sea muy pesada'
            };
            return res.json(appData);
        });
    });
    function upload (base64,filename,aplicacion,next){
        var ruta = './uploads/'+filename;
        decode_base64(base64,filename, function (err) {
            if(err) throw err;
            
            var myBucket = Bucket + `/temp/${aplicacion}`;
            console.log(myBucket);
            fs.readFile(ruta, function (err, data) {
                if (err) {
                    throw err;
                }
                var params = {Bucket: myBucket, Key: filename, Body: data};
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
}

function decode_base64(base64str , filename, next){

    var buf = Buffer.from(base64str,'base64');
    let pt = path.join(APP_PATH,'/uploads/',filename);
    console.log(pt);
    fs.writeFile(pt, buf, function(error){
        if(error){
            next(error) ;
        }else{
            console.log('File created from base64 string!');
            next();
        }
    });
}

function Clientehabilitado (dni,sexo,aplicacion, next){
   
    let query = 'SELECT * FROM lista_negra WHERE dni=? and sexo=? and activo=1';
    AUTHENTICATOR_DB.query(query, [dni, sexo], function (err, rows) {
        if(err){
            return next(err);
        } else {
            if (rows.length > 0) {
                let error =  "Este DNI se encuentra en la lista negra";
                return next(error);
            } else {
                let query = 'SELECT estado FROM usuarios WHERE dni=? and sexo=? and aplicacion = ?';
                AUTHENTICATOR_DB.query(query, [dni, sexo, aplicacion], function (err, rows) {
                    console.log(err);
                    if (rows.length > 0) {
                        if(rows[0].estado === "Ok" || rows[0].estado === "Confirmacion"){
                            let error = `Ya existe un usuario con ese DNI registrado en ${aplicacion}`;
                            return next(error);
                        }else{
                            let query2 = 'DELETE FROM usuarios WHERE dni=? and sexo=? and aplicacion = ?';
                            AUTHENTICATOR_DB.query(query2, [dni, sexo, aplicacion], function (err, rows) {
                                if (err) {
                                    let error =  "Internal Server Error";
                                    return next(error);
                                }else{
                                    next();
                                }
                            });
                        }
                    } else {
                        next();
                    }
                });
            }
        }

    });
}

function getData(dni,sex,next){
    person.findPerson(dni, sex)
        .then((found) => {
            if (!found){
                let error={
                    "res":'error',
                    "status":204,
                    "message":"No se encuentran datos de la persona en nuestros registros",
                    "details":null
                };
                return next(error);
            }
            return next(null, found.legacy);
        })
        .catch((err) => {
            let error = {
                "res":'error',
                "status": 400,
                "message": "Error Occured!",
                "details":err
            };
            return next(error);
        });
}


function putResult(documento,sexo, nombre,apellido,cuil,similitud,address,usuario,email,telefono,aplicacion, next){
    var empresa;
    address = '';
    documento.fechaexp = '';
    
    let query = 'INSERT INTO usuarios SET dni=?,sexo=?, nombre=?,apellido=?,tramite=?,nacimiento=?,vencimiento=?,direccion=?,estado="Ok",similitud=?,cuil=?,aplicacion=?,fecha=now(),os=?,email=?,telefono=?, telefonoVrf = 1, emailVrf = 1';
    AUTHENTICATOR_DB.query(query, [documento.dni,sexo, nombre,apellido,documento.tramite,documento.fechaNac,documento.fechaexp,address,similitud,cuil,aplicacion,usuario.email,email,telefono], function(err,result) {
        if (err) {
            let error={
                "res":'error',
                "status":400,
                "message":"Error Occured!",
                "details":err
            };
            return next(error);
        } else {
            return next(null, result.insertId);
        }
    });
   
            
}

function moveimg(dni,sexo,aplicacion, next){
    let finish = lodash.after(4, function () {
        var params = {
            Bucket: 'autenticartuid',
            Delete: { // required
                Objects: [ // required
                    {
                        Key: `temp/${aplicacion}/` + dni + sexo +'_S.jpeg' // required
                    },
                    {
                        Key: `temp/${aplicacion}/` + dni + sexo +'_F.jpeg'
                    },
                    {
                        Key: `temp/${aplicacion}/`+ dni + sexo +'_B.jpeg'
                    },
                ],
            },
        };

        s3.deleteObjects(params, function(err, data) {
            if (err) next(err); // an error occurred
            else     next();           // successful response
        });

    });
    var params1 = {
        CopySource: `autenticartuid/temp/${aplicacion}/` + dni + sexo +'_S.jpeg',
        Bucket: 'autenticartuid/usuarios/'+ aplicacion,
        Key: dni + sexo +'_S.jpeg'
    };

    s3.copyObject(params1, function(err, data) {
        if (err) next(err); // an error occurred
        else     finish();           // successful response
    });
    var params2 = {
        CopySource: `autenticartuid/temp/${aplicacion}/` + dni + sexo +'_F.jpeg',
        Bucket: 'autenticartuid/usuarios/'+ aplicacion,
        Key: dni + sexo +'_F.jpeg'
    };

    s3.copyObject(params2, function(err, data) {
        if (err) next(err); // an error occurred
        else     finish();           // successful response
    });
    var params3 = {
        CopySource: `autenticartuid/temp/${aplicacion}/` + dni + sexo +'_B.jpeg',
        Bucket: 'autenticartuid/usuarios/'+ aplicacion,
        Key: dni + sexo +'_B.jpeg'
    };

    s3.copyObject(params3, function(err, data) {
        if (err) next(err); // an error occurred
        else     finish();           // successful response
    });
}


function cleanDoc(document){
    return document.replace(/[^.\d]/g, '').replace(/^0+/, '');;

}
