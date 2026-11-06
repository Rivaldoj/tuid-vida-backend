

const sms =  require('../../utils/sms');
const email =  require('../../utils/mail');
const resources = require('./../../startup/resources');

var rand = function () {
    return Math.floor(Math.random() * (9999 - 1000)) + 1000 // remove `0.`
};

module.exports.verification = (req,res, next ) => {
    console.log(req.body);
    res.response = {
        res: 'error',
        status: 200,
    };
    if ( req.body.phone ){
        let tel = resources.validatePhone(req.body.phone);
        if (!tel){
            res.response.message = "Error al validar el número de teléfono celular.\nAsegurese que el número ingresado corresponda a un celular";
            return res.status(res.response.status).json(res.response);
        }
        req.body.telefono = tel.replace(/^\+/, '');;
    }
    var tokenemail = null;
    var tokentel = null;
    usuario = req.body.idUser;
    let query = 'SELECT sexo, dni, estado, nombre, apellido FROM usuario WHERE id_usuario=?';
    VIDA_DB.query(query, [usuario], function (err, rows) {
        if (rows.length > 0) {
            if (rows[0].estado != "Verificar" && rows[0].estado != "Ok" && rows[0].estado != "Confirmacion" ) {
                res.response.message = 'El usuario no esta en esta etapa';
                return res.status(200).json(res.response);
            } else {
                req.user = rows[0];
                var q = "UPDATE usuario  SET ? WHERE id_usuario = ?";
                let parms = {
                    estado : "Confirmacion"
                };
                
                if (Boolean(req.body.email)){
                    tokenemail = rand();
                    parms.email = req.body.email;
                    parms.tokenemail = tokenemail;
                    var params = {
                        token : tokenemail,
                        nombre : req.user.nombre,
                        title: "Verificación de email TuID " + tokenemail
                    }
                    email.send('verification', params, req.body.email, null, null);
                }else if (Boolean(req.body.telefono)){
                    tokentel = rand();
                    parms.telefono = req.body.telefono;
                    parms.tokencel = tokentel;
                    sms.send(req.body.telefono, 'TuID ' + tokentel,function(err,body){

                    } );
                }else{
                    res.response.message = "Falta indicar que dato se quiere validar";
                    return res.status(200).json(res.response);
                }
                VIDA_DB.query(q, [parms, usuario], function (err) {
                    if (err) {
                        res.response.status = 400;
                        res.response.message = 'No se pudo crear el regsitro de usuario';
                        res.response.details = err;
                        return res.status(200).json(res.response);
                    } else {
                        res.response.res = 'ok',
                        res.response.status = 200,
                        res.response.message = 'ok'
                        //index faces rekognition ??
                        return res.status(res.response.status).json(res.response);
                    }
                });
            }
        } else {  
            res.response.message = 'No se encontro el usuario';
            res.response.details = 'El id de usuario no existe';
            return res.status(200).json(res.response);
        }
    });
}


module.exports.reverification = (req,res, next ) => {
    console.log(req.body);
    res.response = {
        res: 'error',
        status: 200,
    };
    var mail = req.body.email;
    if ( req.body.phone ){
        let tel = resources.validatePhone(req.body.phone);
        if (!tel){
            res.response.message = "Error al validar el número de teléfono celular.\nAsegurese que el número ingresado corresponda a un celular";
            return res.status(res.response.status).json(res.response);
        }
        req.body.telefono = tel;
    }
    var telefono = req.body.telefono ? req.body.telefono.replace(/^\+/, '') : null;
    var usuario = req.body.idUser;
    
    var tokentel;
    var tokenemail;
    if (Boolean(telefono)) {
        console.log("enviando SMS");
        tokentel = rand();
        sms.send(telefono, 'TuID ' + tokentel ,function(err,body){ } );
    } else if (Boolean(mail)) {
        console.log("enviando Mail");
        tokenemail = rand();
        var params = {
            token : tokenemail,
            title: "Verificación de email TuID " + tokenemail
        }
        email.send('reverification', params, mail, null);
    }
    let query,token,contacto;
    if(Boolean(mail)){
        query = 'UPDATE usuario u SET u.tokenemail=?,u.email=?, u.estado="Confirmacion",emailVrf=0 WHERE u.id_usuario = ?';
        contacto=mail;
        token=tokenemail;
    }else{
        query = 'UPDATE usuario u SET u.tokencel=?,u.telefono=?, u.estado="Confirmacion",telefonoVrf=0 WHERE u.id_usuario = ?';
        contacto=telefono;
        token=tokentel;
    }
    usuario = parseInt(usuario, 10);
    VIDA_DB.query(query, [token, contacto, usuario], function (err) {
        if (err) {
            res.response.status = 400;
            res.response.message = 'No se pudo crear el regsitro de usuario';
            res.response.details = err;
            return res.status(200).json(res.response);
        } else {
            res.response.res = 'ok',
            res.response.status = 200,
            res.response.message = 'ok'
            //index faces rekognition ??
            return res.status(res.response.status).json(res.response);
        }
    });
}