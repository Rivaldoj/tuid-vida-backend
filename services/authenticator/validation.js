
const sms =  require('../../utils/sms');
const email =  require('../../utils/mail');
const tokenizer = require('../../utils/tokenizer');
const reports = require('../../utils/report');
var rand = function () {
    return Math.floor(Math.random() * (9999 - 1000)) + 1000 // remove `0.`
}; 
module.exports.decodeToken = async function(req,res,next){
    res.response.status = 400;
    res.response.res = "error";
    tokenizer.detokenize(req.body.token, function(err, data){
        if (err){
            res.response.message = "Token de identificacion de DNI vencido, inicie el proceso nuevamente";
            return res.status(res.response.status).json(res.response);
        }
        AUTHENTICATOR_DB.query('select * from usuarios where idUsuario =?', data.idUsuario, function(err, result){
            if (err || result[0] == undefined ){
                res.response.message = "Usuario no encontrado";
                return res.status(res.response.status).json(res.response);
            }
            
            req.body.user = result[0];
            next();
        })
       
    });
}

module.exports.updateData = async function (req, res, next){
    let code = rand();
    var q = ""
    var data = "";
    if (req.body.email){
        if (req.body.user.estado == "Ok" && req.client.settings.mailValidationMandatory ) {
            q = "UPDATE usuarios set email = ?, tokenEmail = ?, estado = 'Verificar', emailVrf = 0 where idUsuario = ?";
            req.body.user.estado = "Verificar";
        }else{
            q = "UPDATE usuarios set email = ?, tokenEmail = ?, emailVrf = 0 where idUsuario = ?"
        }
        
        data = req.body.email
    }else if (req.body.telefono){
        if (req.body.user.estado == "Ok" && req.client.settings.phoneValidationMandatory ) {
            q = "UPDATE usuarios set telefono = ?, tokenCel = ? , telefonoVrf = 0,  estado = 'Verificar' where idUsuario = ?";
            req.body.user.estado = "Verificar";
        }else{
            q = "UPDATE usuarios set telefono = ?, tokenCel = ?, telefonoVrf = 0  where idUsuario = ?"
        }
        data = req.body.telefono;
    }else{
        res.response.message = "Falta indicar que dato se quiere validar";
        return res.status(200).json(res.response);
    }
    AUTHENTICATOR_DB.query(q, [data, code, req.body.user.idUsuario], function (err, result){
        if (err){
            res.response.message = "Error de conexion a la base de datos";
            return res.status(200).json(res.response);
        } else if (result.changedRows > 0){
            res.response.status = 200;
            res.response.res = 'ok';
            res.response.message = req.body.user.estado;
            if (req.body.email){
                var paramsEmail = {};
                paramsEmail.title = "Confirmación " + req.client.name;
                if(req.client.emailValidationSubject && req.client.emailValidationSubject.length>0) paramsEmail.title = req.client.emailValidationSubject;
                paramsEmail.code = code;
                paramsEmail.name = req.body.user.nombre + " " + req.body.user.apellido;
                paramsEmail.app = req.client.name;
                email.send("validation/" + req.client.id, paramsEmail, req.body.email, null, null);    
                console.log("Sending validation email code ", paramsEmail.code);
                reports.authenticatorConsume(req.client.id, "E");     
            }else{
                let msg = `Código de verificación: ${code}. ${req.client.displayName?req.client.displayName:req.client.name}`;
                if(TESTING){
                    console.log("TESTING NOT SENDING " + msg + " to phone: " + req.body.telefono, code);
                }
                else sms.send(req.body.telefono, msg, function(err, res){});
                reports.authenticatorConsume(req.client.id, "S");
            }
        } else {
            res.response.message = "El usuario no existe";
        }
        return res.status(200).json(res.response);
    })
}
