const tokenizer = require('../../../utils/tokenizer');
const crypto = require('crypto');
const mail =  require('../../../utils/mail');

module.exports.login = async function(req,res,next){
    res.response.error = 1;
    res.response.data = "";
    var password = crypto.createHash('sha1').update(req.body.password).digest('hex');
    AUTHENTICATOR_DB.query("select activo, email, rol, empresa, aplicacion from clientes where email = ? and password = ?", [req.body.email, password], function(err, row){
        if (err){
            res.response.data = "Error conectando con la base de datos!";
            return res.status(400).json(res.response);
        }else if (row.length<1){
            res.response.data = "Usuario y contraseña no coinciden";
            return res.status(404).send(res.response);
        }else if (row[0].activo != 1){
            res.response.data = "Usuario deshabilitado. Contacte a soporte";
            return res.status(404).send(res.response);
        }else{
            res.response.error = 0;
            res.response.data = "Logueo satisfactorio";
         
            res.response.rol = row[0].rol;
            res.response.apps = [];
            res.response.usuario = row[0].email;
            if (row[0].rol == "S") {
                row[0].apps = CONFIG.get('authenticator').whitebrands.map(el => {
                   var e = {};
                   e.name = el.name;
                   e.id = el.id;
                   return e;
               });
            }else{
                row[0].apps = CONFIG.get('authenticator').whitebrands.filter(e=>{return e.id == row[0].aplicacion}).map(el => {
                    var e = {};
                    e.name = el.name;
                    e.id = el.id;
                    return e;
                });
            }
            let token = tokenizer.tokenizeAuthenticatorAdmin(row[0]);
            res.response.token = token;
            res.response.apps = row[0].apps;

            res.status(200).json(res.response);
        }      
    });
}


module.exports.forgotPassword = async function(req,res,next){
    res.response.error = 1;
    res.response.data = "";
    var email = req.body.email;
    AUTHENTICATOR_DB.query('SELECT * FROM clientes WHERE email = ? and activo = 1', [email], function (err, user) {
        if (err || user.length == 0) {
            res.response.data = "El usuario no se encuentra registrado o no esta habilitado";
            res.status(201).json(res.response);
        }else{
            const iv = crypto.randomBytes(16);
            var token = iv.toString('hex');
            AUTHENTICATOR_DB.query('UPDATE clientes SET resetPasswordToken = ?,resetPasswordExpires=DATE_ADD(NOW(), INTERVAL 10 MINUTE) where email=? and activo = 1', [token,email], function (err) {
                if (err) {
                    res.response.data = "Error al crear el token";
                    res.status(201).json(res.response);
                } else{
                    let mailingParams = {
                        title: "Actualización de contraseña TuID",
                        token: token
                    };

                    mail.send('resetPassword', mailingParams, email, null);
                    res.response.error = 0;
                    res.response.data = "Se envió un email con un token de validación";
                    res.status(200).json(res.response);
                }
            });
        }
    });

}

module.exports.resetPassword = async function(req,res,next){
    token = req.body.token;
    res.response.error = 1;
    res.response.data = "";
    if (req.body.password1 != req.body.password2){
        res.response.data = "las contraseñas no coinciden";
        return res.status(201).json(res.response);
    }

    AUTHENTICATOR_DB.query('SELECT * FROM clientes WHERE resetPasswordToken = ? and resetPasswordExpires > NOW()', [token], function (err, user) {
        if( err || user.length == 0 ){
            
            res.response.data = 'El token para reseteo de contraseña no existe o ha expirado';
            res.status(201).json(res.response);
        }else{
            var currentUser = user[0];
            var newpassword = crypto.createHash('sha1').update(req.body.password1).digest('hex');
            AUTHENTICATOR_DB.query("UPDATE clientes SET resetPasswordToken = null,resetPasswordExpires=null, password = ? where idCliente = ? ", [newpassword, currentUser.idCliente], function (err, result){

                if (err){
                    res.response.data = "Error de conexion con la base de datos";
                    return res.status(201).json(res.response);
                }else{
                    res.response.error = 0;
                    res.response.data = "Contraseña cambiada con exito";
                    return res.status(200).json(res.response);
                }
            })
        }
    });
}

module.exports.auth = async function(req,res,next){
    res.status(200).json(req.user);
}

