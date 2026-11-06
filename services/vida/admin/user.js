
const crypto = require('crypto');
const tokenizer = require('../../../utils/tokenizer');
const slack = require('../../../utils/slack');
const mail = require('../../../utils/mail');
const push = require('../../../utils/push');

const request = require('request');
const fs = require('fs');
const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const csv = require('fast-csv');
const lodash         = require("lodash");
const async = require('async');
const nodemailer = require('nodemailer');
const vidaConfig = CONFIG.get('vida');

module.exports.login = async function(req, res) {

    var appData = {
        "error": 1,
        "data": "Error Occured!"
    };
    console.log("1");
    var email = req.body.email;
    var password = crypto.createHash('sha1').update(req.body.password).digest('hex');
    var password1 = (!req.body.password1)?null:crypto.createHash('sha1').update(req.body.password1).digest('hex');

    VIDA_DB.query('SELECT DATEDIFF(now(),max(p.fecha)) as dias,c.*, e.direcciones, e.emails, e.telefonos FROM cliente c join empresa e on (e.id = c.empresa) left join password p on (c.id_usuario = p.id_usuario) where c.email = ?;', [email], 
        function(err, rows,fields) {
            
        if (err) { return res.status(201).json(appData) }
        if (rows.length > 0) {
            var retry = rows[0].reintento + 1;
            var id_usuario = rows[0].id_usuario;
            var cambio_pass = rows[0].dias;
            if (rows[0].password === password && retry < 4) {
                VIDA_DB.query('UPDATE cliente SET retry=0 where email=?', [email], function (err) {
                    var permissions = getUserPermissions(rows[0]);
                    rows[0].newPermissions = permissions;
                    let token = tokenizer.tokenizeVidaAdmin(rows[0]);

                    var rol = rows[0].rol;
                    if (cambio_pass > 30){
                        appData.fecha_ultima = null;
                    }else {
                        appData.fecha_ultima = rows[0].fecha_ultima;
                    }
                    if (appData["fecha_ultima"] === null){
                        if(password1 === null){
                            appData.error = 0;
                            appData.data = "Logueo satisfactorio";
                            appData.usuario = rows[0].email;
                            return res.status(200).json(appData);
                        }else{
                            VIDA_DB.query('SELECT * FROM password WHERE password = ? and id_usuario = ?', [password1, id_usuario], function(err, rows,fields) {
                                if (err) { return res.status(201).json(appData)} 
                                if (rows.length > 0) {
                                    appData.error = 1;
                                    appData.data = "Esa contraseña ya fue utilizada";
                                    return res.status(201).json(appData);
                                } else {
                                    VIDA_DB.query('INSERT INTO password (id_usuario,fecha,password) VALUES(?,NOW(),?);', [id_usuario, password1], function (err) {
                                        if (err) {return res.status(201).json(appData)}
                                        VIDA_DB.query('UPDATE cliente SET password = ?, fecha_ultima = NOW() WHERE id_usuario = ?;', [password1, id_usuario], function (err) {
                                            if (err) { return res.status(201).json(appData) }
                                            appData.error = 0;
                                            appData.fecha_ultima = 'Hoy';
                                            appData.permissions = rol;
                                    
                                            appData.token = token;
                                            appData.data = "Contraseña actualizada!";
                                            return res.status(200).json(appData);
                                        });
                                    });
                                }
                            });
                        }
                    }else{
                        appData.error = 0;
                        appData.data = "Logueo satisfactorio";
                        appData.permissions = rol;
                        appData.newPermissions = permissions;
                        
                        appData.token = token;
                        appData.usuario = rows[0].email;
                        return res.status(200).json(appData);
                    }
                });
                VIDA_DB.query('INSERT INTO logueo (id_usuario,fecha) VALUES(?,NOW());', [id_usuario], function (err) {});
            } else {
                VIDA_DB.query('UPDATE cliente SET retry=? where email=?', [retry ,email], function (err) {                                
                    if (retry > 3) {
                    appData["data"] = "Cantidad de intentos superada, comuniquese con un administrador";
                    }else{
                    appData["data"] = "Email y Password no coinciden";
                    }
                    return res.status(201).json(appData);
                });
            }         
        } else {
            appData.error = 1;
            appData.data = "No existe una cuenta con ese email";
            return res.status(201).json(appData);
        }
    });
}


module.exports.forgot = async function(req, res, next) {
    var appData = {
        "error": 1,
        "data": ""
    };
    var email = req.body.email;
    async.waterfall([
        function(done) {
            crypto.randomBytes(6, function(err, buf) {
                var token = buf.toString('hex');
                done(err, token);
            });
        },
        function(token,done) {
            VIDA_DB.query('SELECT * FROM cliente WHERE email = ?', [email], function (err, user) {
                if (!user) {
                    appData["data"] = 'No existe una cuenta con ese email';
                    res.status(201).json(appData);
                }
                //let reset = Date.now() + 3600000; // 1 hour
                VIDA_DB.query('UPDATE cliente SET resetPasswordToken = ?,resetPasswordExpires=DATE_ADD(NOW(), INTERVAL 10 MINUTE) where email=?', [token,email], function (err) {
                    if (err) {
                        console.log(err);
                        appData.error = 1;
                        appData.data = "Error al crear token";
                        res.status(201).json(appData);
                    } else{
                        done(err,token,user);
                    }
                });
            });  
        },
        function(token, user, done) {
            var smtpTransport = nodemailer.createTransport({
                host: 'email-smtp.us-east-1.amazonaws.com',
                port: 465,
                secure: true, // true for 465, false for other ports
                auth: {
                    user: '***REMOVED***', // generated ethereal user
                    pass: '***REMOVED***' // generated ethereal password
                },
                tls: {
                    rejectUnauthorized: false
                }
            });
            var mailOptions = {
                to: email,
                from: 'contacto@autenticartuid.com',
                subject: 'Confirmacion TuID',
                html: '<body><p>Esta recibiendo este email, porque usted (o alguien mas) pidio un cambio de contraseña para su cuenta.</p><p>Porfavor ingrese el siguiente token y su nueva contraseña para completar el proceso:</p><p><strong>' + token +'</strong> <p>Si usted no solicito esto, porfavor ignore este email y su password permanecera sin cambios.</p>'
            };
            smtpTransport.sendMail(mailOptions, function (err) {
                if(err){
                    appData.data = "Error servicio de email";
                    res.status(201).json(appData);
                }else{
                    appData.error = 0;
                    appData.data = "Se envió un email con un token de validación";
                    res.status(200).json(appData);
                    done(err, 'done');
                }
            });
        }
    ], function(err) {
        if (err) return next(err);
    });
}


module.exports.reset = async function(req, res){
    var appData = {
        "error": 1,
        "data": ""
    };
    var token = req.body.token;
    async.waterfall([
        function(done) {
            console.log(token);
            VIDA_DB.query('SELECT * FROM cliente WHERE resetPasswordToken = ? and resetPasswordExpires>NOW()', [token], function (err, user) {
                if (user === undefined) {
                    appData.data = 'El token para reseteo de contraseña no existe o a expirado';
                    res.status(201).json(appData);
                }else if (req.body.password1 === req.body.password2) {
                    var id_usuario = user[0].id_usuario;
                    var newpassword = crypto.createHash('sha1').update(req.body.password1).digest('hex');
                    VIDA_DB.query('SELECT * FROM password WHERE password = ? and id_usuario = ?', [newpassword, id_usuario], function(err, rows,fields) {
                        if (err) {
                            appData.error = 1;
                            appData.data = "Error Occured!";
                            res.status(201).json(appData);
                        } else {
                            if (rows.length > 0) {
                                appData.error = 1;
                                appData.data = "Esa contraseña ya fue utilizada";
                                res.status(201).json(appData);
                            } else {
                                VIDA_DB.query('UPDATE cliente SET resetPasswordToken = null,resetPasswordExpires=null, password=?, reintento = 0 where id_usuario=?', [newpassword, id_usuario], function (err) {
                                    VIDA_DB.query('INSERT INTO password (id_usuario,fecha,password) VALUES(?,NOW(),?);', [id_usuario, newpassword], function (err) {
                                        if (err) {
                                            appData.error = 1;
                                            appData.data = "Internal Server Error";
                                            res.status(201).json(appData);
                                        } else {

                                            appData.error = 0;
                                            appData.data = "Contraseña cambiada con exito";
                                            res.status(201).json(appData);
                                            done(user, err);
                                        }
                                    });
                                });
                            }
                        }
                    });
                } else {
                    appData.error = 1;
                    appData.data = "Las contraseñas no coinciden";
                    res.status(201).json(appData);
                }
            });
        }
    ], function(err) {
        //res.redirect('/campgrounds');
    });
}


module.exports.auth = async function(req, res) {
    return res.status(200).send(req.user);
}


module.exports.getUsers = async function(req, res){
    res.response = {
        error : 1,
        data : "Error desconocido"
    }
    VIDA_DB.query('SELECT * FROM cliente where empresa = ? and activo=1',[req.user.empresa], function(err, rows, fields) {
        if (!err) {
            res.response.error = 0;
            res.response.data = rows;
            return res.status(200).json(res.response);
        } else {
            res.response.data = "No data found";
            return res.status(201).json(res.response);
        }
    });
}



module.exports.getEmpresas = async function(req,res){
    res.response = {
        error : 1,
        data : "Error desconocido"
    }
    VIDA_DB.query('SELECT distinct empresa FROM cliente where activo=1', function(err, rows, fields) {
        if (!err) {
            res.response.error = 0;
            res.response.data = rows;
            return res.status(200).json(res.response);
        } else {
            res.response.data = "No data found";
            return res.status(201).json(res.response);
        }
    });
}

module.exports.getEmail = async function(req,res){
    
    res.response = {
        error : 0,
        empresa: req.user.empresa
    }
    res.status(200).json(res.response);
}


module.exports.register = async function(req,res){
    res.response = {
        error: 1,
        data: ""
    };
    var userData = {
        "email": req.body.email,
        "password": crypto.createHash('sha1').update(req.body.password).digest('hex'),
        "empresa": req.user.empresa,
        "rol": req.body.rol
    };

    VIDA_DB.query('SELECT * FROM  cliente WHERE email= ?', [userData.email], function(err, rows) {
        if (rows.length > 0) {
            if (rows[0].empresa === req.user.empresa){
                VIDA_DB.query('UPDATE cliente SET password=?, rol=?, activo=1, fecha_ultima=null where email=?', [userData.password, userData.rol,userData.email], function(err) {
                    if (!err) {
                        res.response.error = 0;
                        res.response.data = "Usuario registrado exitosamente!";
                        return res.status(200).json(res.response);
                    } else {
                        res.response.data = "Error Occured!";
                       return res.status(201).json(res.response);
                    }
                })
            } else {
                res.response.data = "Ese email ya fue utilizado";
                return res.status(201).json(res.response);
            }
        } else {
            VIDA_DB.query('INSERT INTO cliente SET ?', userData, function(err) {
                if (!err) {
                    res.response.error = 0;
                    res.response.data = "Usuario registrado exitosamente!";
                    return res.status(200).json(res.response);
                } else {
                    res.response.data = "Error Occured!";
                    return res.status(201).json(res.response);
                }
            })
        }

    });
}


module.exports.update = async function (req, res){
    res.response = {
        error: 1,
        data: ""
    };
    var id_usuario = req.body.id_usuario;
    var email= req.body.email;
    var password = crypto.createHash('sha1').update(req.body.password).digest('hex');
    VIDA_DB.query('SELECT * FROM usuario WHERE email= ? and id_usuario <> ?', [email, id_usuario], function(err, rows) {
        if (rows.length > 0) {
            res.response.error = 1;
            res.response.data = "El usuario o email ya fueron utilizados";
            return res.status(201).json(res.response);
        } else {
            connection.query('UPDATE usuario email = ?, password = ? where id_usuario= ?'
                , [ nombre, apellidos, id_servicio, email, password, telefono, id_usuario], function(err) {
                    if (!err) {
                        res.response.error = 0;
                        res.response.data = "Usuario actualizado exitosamente!";
                        return res.status(200).json(res.response );
                    } else {
                        res.response.data = "Error Occured!";
                        return res.status(201).json(res.response );
                    }
                })
        }

    });
}



module.exports.delete = async function (req, res){
    res.response = {
        error: 1,
        data: ""
    };
    var email = req.body.email;
    VIDA_DB.query('SELECT * FROM cliente WHERE email = ?', [email], function(err, rows) {
        if (rows.length === 0) {  
            res.response.data = "El usuario no existe";
            return res.status(201).json( res.response);
        } else {
            VIDA_DB.query('UPDATE cliente SET activo = 0 where email= ?', [email], function(err) {
                if (!err) {
                    res.response.error = 0;
                    res.response.data = "Usuario eliminado exitosamente!";
                    return res.status(200).json( res.response);
                } else {
                    return res.status(201).json( res.response);
                }
            })
        }

    });
}

module.exports.updateNotificaciones = async(req,res,next)=>{
    var info = req.body;
    var notificaciones = info.notificaciones;
    var cuil = info.cuil;
    res.response = {
        "error": 1,
        "data": "Error desconocido"
    };
    VIDA_DB.query('UPDATE usuario SET  notificaciones = ? where cuil=? and estado <> "Error"', [ notificaciones, cuil], function (err) {
        if (err) {
            res.response.data = "Error Occured!";
            res.status(201).json(res.response);
        } else {
            res.response.error = 0;
            res.response.data = "Cambio efectuado";
            res.status(200).json(res.response);
        }
    }); 

}


module.exports.updateFallecido = async(req,res,next)=>{
    var info = req.body;
    var fallecido = info.fallecido;
    var cuil = info.cuil;
    var q = "";
    if (fallecido){
        q = 'UPDATE usuario SET fecha_fallecido = CURDATE(), notificaciones = 0 where cuil=? and estado <> "Error"';
    }else{
        q = 'UPDATE usuario SET fecha_fallecido = null where cuil=? and estado <> "Error"';
    }
    res.response = {
        "error": 1,
        "data": "Error desconocido"
    };
    VIDA_DB.query(q, [ cuil], function (err) {
        if (err) {
            res.response.data = "Error Occured!";
            res.status(201).json(res.response);
        } else {
            res.response.error = 0;
            res.response.data = "Cambio efectuado";
            res.status(200).json(res.response);
        }
    }); 

}


module.exports.updateContact = async(req,res,next)=>{
    var info = req.body;
    var email = info.email;
    var telefono = info.telefono;
   
    var cuil = info.cuil;
    res.response = {
        "error": 1,
        "data": "Error desconocido"
    };

    if(email || telefono){
        
        VIDA_DB.query('UPDATE usuario SET  email=?,telefono=?, estado = "Ok" where cuil=? and estado <> "Error"', [ email, telefono, cuil], function (err) {
            if (err) {
                res.response.data = "Error Occured!";
                res.status(201).json(res.response);
            } else {
                res.response.error = 0;
                res.response.data = "Cambio efectuado";
                res.status(200).json(res.response);
            }
        }); 
    }else{
        res.status(200).json(res.response);
    }

}


module.exports.notification = async (req,res,next)=>{
    res.response = {
        "error": 1,
        "data": ""
    };
    var cuil = req.body.cuil;
    var asunto = req.body.asunto;
    var mensaje = req.body.mensaje;
    var no_verificado = req.body.no_verificado;
    var dias = req.body.dias;
    var query,variable;
    var respuesta;
    var empresa;
    if (req.user.empresa == 'TUID'){
        empresa = req.body.empresa;
    } else {
        empresa = req.user.empresa;
    }
    if (no_verificado == 1){
        variable = dias;
        query = 'select distinct u.nombre, u.apellido,u.id_device from tuid_vida.usuario u left join tuid_vida.usuario_empresa ue on (u.cuil = ue.cuil)  where ue.empresa=? and id_usuario not in(select u.id_usuario from tuid_vida.usuario u left join tuid_vida.auditoria a on (u.id_usuario = a.id_usuario) where a.fecha > DATE_SUB(CURDATE(), INTERVAL ? DAY)order by a.fecha desc)';
    }else{
        variable = cuil;
        query = 'select u.nombre, u.apellido, u.id_device from tuid_vida.usuario u left join tuid_vida.usuario_empresa ue on (u.cuil = ue.cuil) where ue.empresa=? and u.cuil=?';
    }
    VIDA_DB.query(query, [empresa,variable], function(err,rows) {
        if (err|| rows.length === 0) {
            
            res.response.data = "No se encontraron resultados";
            res.status(201).json(res.response);
        } else {
            var headersOpt = {
                "content-type": "application/json",
                "Authorization": require('./../../../utils/push').authorizationHeader()
            };
            var enviados = 0;
            let finish = lodash.after(rows.length, function () {
                
                res.response.error = 0;
                res.response.data = 'mensajes:' + rows.length + ' mensajes enviados:' + enviados;
                res.status(201).json(res.response);
            });
            rows.forEach(function (row) {
                request(
                    {
                        method: 'POST',
                        uri: 'https://fcm.googleapis.com/fcm/send',
                        headers: headersOpt,
                        json: true,
                        body: {
                            "to": row.id_device,
                            "notification": {
                                "title": row.nombre + ' ' + row.apellido + ' ' + asunto,
                                "body": mensaje
                            }
                        }
                    }, function (error, response, body) {
                        //Print the Response
                        // si el envio falla, "body" puede venir vacio: antes esto tiraba el proceso
                        if(body && body.success === 1){
                            enviados = enviados + 1;
                        }
                        finish();
                    });
            });
        }
    });
}


module.exports.upload = async(req,res,next)=>{
    var file = req.file;
    res.response = {
        "error": 1,
        "data": ""
    };
 //  if (req.user.empresa != "TUID") return res.status(100).json({issue: "seguridad"});
    slack.debug( 'El cliente ' + req.user.empresa + ' subio un nuevo archivo: ' + file.originalname);
    let stream = fs.createReadStream(file.path);
    let myArray = [];
    let csvStream = csv
        .parse({ delimiter: ';' })
        .on("data", (data) => {
            console.log(data);
            if (data.length == 4){
                data = data.concat('1');
            }
            data = data.concat(req.user.empresa);
            myArray.push(data);
        })
        .on("end", function () {
            console.log(myArray);
            VIDA_DB.getConnection(function(err, connection) {
                if (err) {
                    res.response.data = "Internal Server Error";
                    res.status(201).json(res.response);
                } else {
                    let query =  'start transaction; delete from tuid_vida.usuario_empresa where empresa = ?;';
                    connection.query(query, [req.user.empresa], function(err) {
                    
                        let query =  'insert into tuid_vida.usuario_empresa (cuil,fecha_recordatorio,notificacion,proxima, notificaciones_periodo, empresa) VALUES ?';
                        connection.query(query, [myArray], function(err) {
                            if(err){
                                console.log(err);
                                connection.query('rollback;', function(err) {});
                                res.response.data = "Fallo la subida, corrobore la delimitación y que no contenga duplicados";
                                res.status(201).json(res.response);
                            }else{
                                let query =  'UPDATE tuid_vida.usuario_empresa SET dni = SUBSTRING(cuil,3,8) where empresa = ?;' +
                                    'commit;';
                                connection.query(query, [req.user.empresa], function(err) {
                                    res.response.error = 0;
                                    res.response.data = "Archivo subido";
                                    res.status(200).json(res.response);
                                });
                            }
                        });
                    });
                    connection.release();
                }
            });
        });
    stream.pipe(csvStream);
    var myBucket = "validador-de-id/"+req.user.empresa;
    fs.readFile(file.path, function (err, data) {
        if (err) {
            throw err;
        }
        var params = {Bucket: myBucket, Key: file.originalname, Body: data};
        s3.putObject(params, function (err, data) {
            if (err) {
                fs.unlink(file.path, (err) => {
                    if (err) throw err;
                });
            } else {
                fs.unlink(file.path, (err) => {
                    if (err) throw err;
                });
            }
        });
    });
    
}


const unsubscribeUrl = CONFIG.get('vida').unsubscribeUrl;
module.exports.reminder = async(req,res,next)=> {
    res.response.error = 1;
    res.response.data = "No tenes permisos para enviar este recordatorio";
    if (req.user.empresa != 'TUID') return res.status(400).json(res.response);
    
    VIDA_DB.query("select * from usuario where cuil = ?", [req.body.cuil], function(err,docs){
        if (err || docs.length < 1 ){
            res.response.data = "No se pudo encontrar datos del usuarios";
            return res.status(201).json(res.response);
        }else if(!docs[0].notificaciones)  {
            res.response.data = "El usuario no acepta notificaciones";
            return res.status(201).json(res.response);
        } else {
            if (docs[0].email) {
                var token = tokenizer.tokenize({cuil:docs[0].cuil });
                let params = {
                    title: "Actualización de certificado de supervivencia",
                    name : `${docs[0].nombre} ${docs[0].apellido}`,
                    url : `${unsubscribeUrl}?token=${token}`
                }
                mail.send('reminder', params,docs[0].email,null, null );
            }
            if (docs[0].id_device) {
                push.send(docs[0].id_device, "Actualiza tu FE DE VIDA", "Evita inconvenientes en el pago del haber previsional");
            }
            res.response.error = 0;
            res.response.data = "Notificaciones enviadas";
            return res.status(200).json(res.response);
        }
    })

}


module.exports.getUserPermissions = getUserPermissions; // expuesto para pruebas
function getUserPermissions(user){

    var permissions = ["EXTRA","SISA","AUDITORIA","FORMULARIOS","FALLECIDOS","DASHBOARD","REPORTSSUP","SOPORTE","WEBNOTIFICATIONS", "VALIDACIONES", "REGISTRACIONES", "DESCARGA","ARCHIVO", "USERADMIN", "REGISTROMANUAL", "NOTIFICACIONES", "COBRO", "ALERTAS", "ERRORES" ];

    if (user.rol == "U"){
        permissions.splice(permissions.indexOf('USERADMIN'), 1);
    }
    if (user.empresa == "TUID" ){
        if ( user.rol == "U" ){
            permissions.splice(permissions.indexOf('DESCARGA'), 1);
            permissions.splice(permissions.indexOf('ARCHIVO'), 1);
            permissions.splice(permissions.indexOf('NOTIFICACIONES'), 1);
            permissions.splice(permissions.indexOf('REPORTSSUP'), 1);
            permissions.splice(permissions.indexOf("SISA"),1);
        }
    }else {
        permissions.splice(permissions.indexOf("EXTRA"),1);
        permissions.splice(permissions.indexOf("SISA"),1);
        permissions.splice(permissions.indexOf("AUDITORIA"),1);
        permissions.splice(permissions.indexOf("REPORTSSUP"),1);
        permissions.splice(permissions.indexOf('SOPORTE'), 1);
        permissions.splice(permissions.indexOf('WEBNOTIFICATIONS'), 1);
        permissions.splice(permissions.indexOf('NOTIFICACIONES'), 1);
        permissions.splice(permissions.indexOf('REGISTROMANUAL'), 1);
        permissions.splice(permissions.indexOf('COBRO'), 1);
        permissions.splice(permissions.indexOf('ERRORES'), 1);
        permissions.splice(permissions.indexOf('ALERTAS'), 1);
    }
    // Configuracion global (por ejemplo el interruptor de auditoria): solo el Administrador de TUID
    if (user.empresa == "TUID" && user.rol != "U") permissions.push("CONFIGURACION");
    return permissions;

}


