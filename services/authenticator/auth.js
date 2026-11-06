var fs = require('fs');
const AWS = require('aws-sdk');
const rekognition = new AWS.Rekognition();
const tokenizer = require('../../utils/tokenizer');
const s3 = new AWS.S3();
const reports = require('../../utils/report');

var rand = function () {
    return Math.floor(Math.random() * (999999 - 100000)) + 100000 // remove `0.`
};

module.exports.decodeToken = async function(req,res,next){
    console.log("decoding");
        res.response.status = 400;
        res.response.res = "error";
        req.body.user = {};
        req.body.user.dni = req.body.dni;
        req.body.user.sexo = req.body.sexo;
        next();
}

module.exports.searchUser = async function(req,res,next){
    console.log("searching User");
    
    let query = 'SELECT idUsuario, cuil, nombre, apellido, dni, sexo, id_device, email, telefono, estado,emailVrf,telefonoVrf from usuarios WHERE dni = ? and sexo = ? and aplicacion = ?';
    AUTHENTICATOR_DB.query(query,[req.body.user.dni,req.body.user.sexo, req.client.id], function(err,row) {
        if (err) {
            res.response.message = "Error de conexion a la base de datos";
            res.response.datails =  err;
            return res.status(res.response.status).json(res.response);
        } else if (row.length === 0) {
            res.response.message =  'No hemos podido autenticar su identidad.\n Previamente debe registrarse. \n Si ya lo ha hecho comuníquese mediante el formulario de contacto';
            return res.status(res.response.status).json(res.response);
        }else{
            req.body.filename = req.body.dni + req.body.sexo + '.jpeg';
            req.body.ruta = APP_PATH + '/uploads/'+req.body.filename;
            req.body.user = row[0];
            next();
        }
    });
}

module.exports.uploadImageToBucket = async function (req, res, next){
    console.log("uploading image");
    var buf = Buffer.from(req.body.file,'base64');
    fs.writeFile(req.body.ruta, buf, function(error){
        if(error){
            res.response.message = "Error al escribir el archivo de imagen";
            return res.status(200).json(res.response);
        }else{
            fs.readFile(req.body.ruta, function (err, data) {
                if (err) {
                    res.response.message = "Error al leer el archivo de imagen";
                    return res.status(200).json(res.response);
                }
                let myBucket = CONFIG.get('authenticator').bucketName + '/temp/' + req.client.bucketFolder;
                var params = {Bucket: myBucket, Key: req.body.filename, Body: data};
                s3.putObject(params, function (err, data) {
                    if (err) {
                        fs.unlink(req.body.ruta, (err) => {
                            if (err) console.log(err);
                        });
                        res.response.message =  'Error en el envio de la imagen';
                        res.response.details = err;
                        return res.status(200).json(res.response);
                    } else {
                        fs.unlink(req.body.ruta, (err) => {
                            if (err)  console.log(err);
                        });
                        console.log("image uplaoded");
                        next();
                    }
                });
            });
        }
    });
}

async function replaceLoginImage(filename,dni,sexo,clientBucket){
   

    var params1 = {
        CopySource: 'autenticartuid/temp/'+ clientBucket + '/' + filename,
        Bucket: 'autenticartuid/login/' + clientBucket,
        Key: dni + sexo +'.jpeg'
    };

    s3.copyObject(params1, function(err, data) {
        if (err){
            console.log(err);
        } else{
            var params = {
                Bucket: 'autenticartuid',
                Delete: { Objects: [ { Key: 'temp/'+ clientBucket + '/' + filename }]},
            };
            s3.deleteObjects(params, function(err, data) {
                if (err){
                    console.log(err);
                }
            });
        }        
    });
}


module.exports.authenticate = async function(req,res,next){
    console.log("authenticate");
    let dni = req.body.user.dni;
    let sexo = req.body.user.sexo;
    var params = {
        SimilarityThreshold: 0,
        SourceImage: {
            S3Object: {
                Bucket: "autenticartuid",
                Name: "usuarios/" + req.client.bucketFolder + '/' + dni + sexo + "_S.jpeg"
            }
        },
        TargetImage: {
            S3Object: {
                Bucket: "autenticartuid",
                Name: "temp/" + req.client.bucketFolder + '/' + dni + sexo + ".jpeg"
            }
        }
    };
    rekognition.compareFaces(params, function (err, data) {
        
        if (err) {
            res.response.message = 'Error en la comparacion';
            res.response.details = err;
            return res.status(200).json(res.response);
        } else {
            let appPer = CONFIG.get('authenticator').approvePercentage;
            if (data.FaceMatches[0] && data.FaceMatches[0].Similarity > appPer) {
                reports.authenticatorConsume(req.client.id, "L");
                req.body.similitud = data.FaceMatches[0].Similarity;
                replaceLoginImage(req.body.filename, req.body.user.dni, req.body.sexo, req.client.bucketFolder);
                var flag = false;
                res.response.requireData = {
                    mailValidationMandatory : false,
                    phoneValidationMandatory: false,
                    addressValidationMandatory: false
                };
                if (req.client.settings.mailValidationMandatory && !req.body.user.emailVrf){
                    res.response.requireData.mailValidationMandatory = true;
                    flag = true;
                }
                if (req.client.settings.phoneValidationMandatory && !req.body.user.telefonoVrf){
                    res.response.requireData.phoneValidationMandatory = true;
                    flag = true;
                }
                if (req.client.settings.addressValidationMandatory && !req.body.user.addressVrf){
                    res.response.requireData.addressValidationMandatory = true;
                    flag = true;
                }
                res.response.estado = req.body.user.estado;
                res.response.name = req.body.user.apellido + ', ' + req.body.user.nombre,
                res.response.cuil = req.body.user.cuil ;
                res.response.dni = req.body.dni ;
                res.response.sexo = req.body.sexo ;
                res.response.email = req.body.user.email ;
                res.response.telefono = req.body.user.telefono ;
                res.response.telefonoVrf = req.body.user.telefonoVrf;
                res.response.emailVrf = req.body.user.emailVrf;
                res.response.addressVrf = req.body.user.addressVrf;
                res.response.idUsuario = req.body.user.idUsuario;
                res.response.flow = "AUTH";
                res.response.message = "Ok";
                res.response.authToken = tokenizer.tokenize(res.response);
                if (flag){
                    res.response.status = 200;
                    res.response.res = "ok";
                    res.response.message = "Es necesario completar el flujo de registro";
                    console.log("falta completar registro");
                    return res.status(200).json(res.response);
                }else{
                    next();
                }
            }else{
                reports.authenticatorConsume(req.client.id, "F");
                res.response.message = `Su identidad no coincide con nuestros registros. 
                        Es posible que la foto haya salido movida o con mala iluminación.
                        Intente nuevamente y si el problema persiste, \n
                        comuníquese mediante el formulario de contacto`;
                
                return res.status(200).json(res.response);
            }
        }
    });
}  

module.exports.createToken = async function(req, res, next){
    console.log("creating token");
    req.body.token = rand();
    req.body.timer = req.client.codeExpires;
    let query = 'INSERT INTO auth (idUsuario,fecha,fecha_expiracion, token,id_device,latitud,longitud,similitud) VALUES (?,UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(), interval ? second),?,?,?,?,?)';
    AUTHENTICATOR_DB.query(query, [req.body.user.idUsuario,req.body.timer, req.body.token, req.body.id_device, req.body.latitud,req.body.longitud,req.body.similitud], function (err,result) {
        if (err) {
            console.log(err);
            res.response.message = "Error de conexión a la base de datos";
            return res.status(200).json(res.response);
        }else{
            res.response.status = 200;
            res.response.res = "ok";
            res.response.token = req.body.token;
            res.response.tiempo = req.body.timer;
           // res.response.name.authToken = tokenizer.tokenize(res.response);
            return res.status(200).json(res.response);
        }
       
    });
}