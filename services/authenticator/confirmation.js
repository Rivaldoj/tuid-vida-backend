
const tokenizer = require('../../utils/tokenizer');
const webhook = require('../../utils/webhooks');
const AWS = require('aws-sdk');
const s3 = new AWS.S3();
module.exports.decodeToken = async function(req,res,next){
    res.response.status = 400;
    res.response.res = "error";
    tokenizer.detokenize(req.body.token, function(err, data){
        if (err){
            res.response.message = "Token de identificacion de DNI vencido, inicie el proceso nuevamente";
            return res.status(200).json(res.response);
        }
        AUTHENTICATOR_DB.query('select * from usuarios where idUsuario =?', data.idUsuario, function(err, result){
            if (err || result[0] == undefined ){
                res.response.message = "Usuario no encontrado";
                return res.status(200).json(res.response);
            }
            req.user = result[0];
            req.body.data = data;
            req.body.user = result[0];
            next();
        })
       
    });
}

module.exports.confirm = async function (req, res , next){
    
    var q = "";
    var params = [];
    if (req.body.codeEmail ){
        const phoneOk = !req.client.settings.phoneValidationMandatory || req.body.user.telefonoVrf;
        const addressOk = !req.client.settings.addressValidationMandatory || req.body.user.addressVrf;
        if (phoneOk && addressOk){
            q = "update usuarios set emailVrf = 1, estado = 'Ok' where idUsuario = ? and tokenEmail = ? ";
            req.body.user.estado = "Ok";
            params.push(req.body.user.idUsuario, req.body.codeEmail);
        }else{
            q = "update usuarios set emailVrf = 1 where idUsuario = ? and tokenEmail = ?";
            params.push(req.body.user.idUsuario, req.body.codeEmail);
        }
    }else if (req.body.codeTel){
        const mailOk = !req.client.settings.mailValidationMandatory || req.body.user.emailVrf;
        const addressOk = !req.client.settings.addressValidationMandatory || req.body.user.addressVrf;
        if (mailOk && addressOk){
            q = "update usuarios set telefonoVrf = 1, estado = 'Ok' where idUsuario = ? and tokenCel = ? ";
            req.body.user.estado = "Ok";
            params.push(req.body.user.idUsuario, req.body.codeTel);
        }else{
            q = "update usuarios set telefonoVrf = 1 where idUsuario = ? and tokenCel = ?";
            params.push(req.body.user.idUsuario, req.body.codeTel);
        }
    }

    AUTHENTICATOR_DB.query(q, params, function(err, result){
        console.log(result);
        if (err){
            res.response.message = "Error de conexión con la base de datos";
            return res.status(200).json(res.response); 
        }else if (result.changedRows == 0) {
            res.response.message = "Código incorrecto";
            return res.status(200).json(res.response); 
        }else{
            res.response.res = "ok";
            res.response.message = req.body.user.estado;
            if (req.body.user.estado == "Ok" && req.client.webhook != null){
                var pars = {
                    "text" : "Nueva alta",
                    "data": {
                        "nombre": req.body.user.nombre, 
                        "apellido":req.body.user.apellido, 
                        "dni":  req.body.user.dni, 
                        "cuil" :  req.body.user.cuil, 
                        "email" : req.body.user.email,
                        "telefono": req.body.user.telefono,
                        "address": null,
                        "nfc": req.body.user.nfc,
                        "tipo": req.body.user.tipo,
                        "ejemplar": req.body.user.ejemplar,
                        "sexo" : req.body.user.sexo, 
                        "tramite": req.body.user.tramite, 
                        "nacimiento": req.body.user.nacimiento,
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
                pars['meta'] = req.pepData;
                if(req.client.alwayRegister){
                    if(req.client.settings.phoneValidationMandatory && req.body.codeTel) webhook.notify(req.client.webhook,pars,function(err, res){}, req.client.id);
                }
                else webhook.notify(req.client.webhook,pars,function(err, res){}, req.client.id);
            } 
            res.response.status = 200; 
            return res.status(200).json(res.response); 
        }
    })
}



