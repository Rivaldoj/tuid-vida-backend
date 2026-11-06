const lodash = require("lodash");
const AWS = require('aws-sdk');
const tokenizer = require('../../utils/tokenizer');
const webhook = require('../../utils/webhooks');
const s3 = new AWS.S3();
module.exports = async (req, res, next) => { 
    console.log(req.body);
    res.response.status = 400; 
    res.response.res = 'error';
    var state = ""; 
    tokenizer.detokenize(req.body.authToken, function(err, data){
        if (err) {
            res.response.message = "Sesión de registro expirada, intente registrandose nuevamente";
            console.log(err);
            return res.status(200).json(res.response);
        }
        console.log(data);
        if (data.estado == 'Revancha'){
            let respuestaRecibida = req.body.answers[0].idChoice;
            let respuestaCorrecta = tokenizer.decrypt(data.id_respuesta);
            console.log(respuestaRecibida);
            console.log(respuestaCorrecta);
            if (respuestaRecibida == respuestaCorrecta) {
                const settings = req.client.settings;
                if (!settings.mailValidationMandatory && !settings.phoneValidationMandatory && !settings.addressValidationMandatory){
                    state = "Ok";
                }else{
                    state = "Verificar";
                }
                moveimg(data.dni, data.sexo,req.client.bucketFolder, function (err) {
                    if (err) {
                        res.response.message = "Error al mover los archivos";
                        return res.status(200).json(res.response);
                    } else {
                        AUTHENTICATOR_DB.query("UPDATE usuarios u SET u.estado=? WHERE u.idUsuario = ? and u.estado = 'Revancha'", [state, data.idUsuario], function(err, result){   
                            if (err){
                                res.response.message = "Error de conexion a base de datos";
                                return res.status(200).json(res.response);
                            }
                            if (result.affectedRows > 0) {
                                res.response.status = 200,
                                res.response.res = "ok";
                                data.estado = state;
                                res.response.message = state;
                                res.response.authToken = tokenizer.tokenize(data);
                                res.response.requireData = req.client.settings;
                                res.response.telefonoVrf = false;
                                res.response.emailVrf = false;
                                res.response.addressVrf = false;
                                console.log(res.response);
                                if (state == "Ok" && req.client.webhook != null){
                                    var pars = {
                                        "text" : "Nueva alta",
                                        "data": {
                                            "nombre": data.nombre,
                                            "apellido":data.apellido,
                                            "dni": data.dni,
                                            "cuil" : data.cuil,
                                            "email" : null, 
                                            "telefono": null, 
                                            "sexo" : data.sexo, 
                                            "tramite": data.tramite, 
                                            "nacimiento": data.nacimiento
                                        }
                                    }
                                    webhook.notify(req.client.webhook,pars,function(err, res){}, req.client.id);
                                }
                                return res.status(200).json(res.response);
                            }else{
                                res.response.message = "El usuario no se encuentra en este paso";
                                return res.status(200).json(res.response);
                            }
                        });
                    }
                });
            }else{

                res.response.status = 201,
                res.response.message= "El puntaje no es suficiente"
                state = "Desaprobado";
                AUTHENTICATOR_DB.sync_query("UPDATE usuarios u SET u.estado=? WHERE u.idUsuario = ? and u.estado = 'Revancha'", [state, data.idUsuario]);
                return res.status(res.response.status).json(res.response);
            }
        }else{
            res.response.status =400;
            res.response.message = "El usuario no se encuentra en este paso";
            return res.status(200).json(res.response);
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