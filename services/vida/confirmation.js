module.exports.confirmation = (req,res, next ) => {
    var info = req.body;
    var tokenemail = info.codeEmail;
    var tokentel = info.codeTel;
    var usuario = info.idUser;
    res.response = {
        res: 'error',
        status: 200
    };
    if (Boolean(usuario) && (Boolean(tokenemail) || Boolean(tokentel))) {
        let query = 'SELECT estado, tokenEmail,tokenCel,dni,sexo,email FROM usuario WHERE id_usuario=?';
        VIDA_DB.query(query, [usuario], function(err, rows) {
            if (err) {
                res.message = "Error Occured!";
                return res.status(200).json(res.response);
            }
            if (rows.length <= 0 || rows[0].estado !== "Confirmacion"){
                res.response.message = 'Error en la verificacion';
                return res.status(res.response.status).json(res.response);
            }else {
                req.user = rows[0];
                if (req.user.tokenCel === tokentel || req.user.tokenEmail === tokenemail || req.user.tokenCel === tokenemail){
                    let query;
                    if(Boolean(tokenemail) && Boolean(tokentel)) {
                        query = 'UPDATE usuario u SET u.estado="Ok",emailVrf=1,telefonoVrf=1 WHERE u.id_usuario = ?';
                    }else if (Boolean(tokenemail)){
                        query = 'UPDATE usuario u SET u.estado="Ok",emailVrf=1 WHERE u.id_usuario = ?';
                    }else{
                        query = 'UPDATE usuario u SET u.estado="Ok",telefonoVrf=1 WHERE u.id_usuario = ?';
                    }
                    usuario = parseInt(usuario, 10);
                    VIDA_DB.query(query, [usuario], function (err) {
                        if (err) {
                            res.message = "No se pudo finalizar el registro";
                            res.details = err;
                            return res.status(200).json(res.response);
                        } else {
                            res.response = {
                                res: 'ok',
                                status: 200,
                                message: 'ok'
                            };
                            return res.status(res.response.status).json(res.response);
                        }
                    });
                }else{
                    res.response.message = 'El código ingresado no es válido';
                    return res.status(res.response.status).json(res.response);
                }
            }
        });
    } else {
        res.response.message = 'No se detectan los campos correspondientes';
        return res.status(200).json(res.response);
    }
}

module.exports.reconfirmation = (req,res, next ) => {
    var info = req.body;
    var tokenemail = info.codeEmail;
    var tokentel = info.codeTel;
    var usuario = info.idUser;
    res.response = {
        res: 'error',
        status: 200
    };
    if (Boolean(usuario) && (Boolean(tokenemail) || Boolean(tokentel))) {
        let query = 'SELECT estado, tokenemail,tokencel,emailVrf,telefonoVrf,dni,sexo FROM usuario WHERE id_usuario=?';
        VIDA_DB.query(query, [usuario], function(err, rows) {
            if (err) {
                res.message = "Usuario no encontrado";
                return res.status(200).json(res.response);
            }else if (rows.length <= 0 || rows[0].estado !== "Confirmacion"){
                res.response.message = 'Error en la verificacion';
                return res.status(res.response.status).json(res.response);
            }else {
                req.user = rows[0];
                if(req.user.tokencel == tokentel || req.user.tokenemail == tokenemail) {
                    let query;
                    if(Boolean(tokenemail) && Boolean(tokentel)) {
                        query = 'UPDATE usuario u SET u.estado="Ok",emailVrf=1,telefonoVrf=1 WHERE u.id_usuario = ?';
                    }else if (Boolean(tokenemail)){
                        query = 'UPDATE usuario u SET u.estado="Ok",emailVrf=1 WHERE u.id_usuario = ?';
                    }else{
                        query = 'UPDATE usuario u SET u.estado="Ok",telefonoVrf=1 WHERE u.id_usuario = ?';
                    }
                    usuario = parseInt(usuario, 10);
                    VIDA_DB.query(query, [usuario], function (err) {
                        if (err) {
                            res.response.message = 'No se pudo finalizar el registro';
                            res.response.details = err;
                            return res.status(res.response.status).json(res.response);
                        } else {
                            if (req.user.tokencel == tokentel) {
                                res.response.telefono = 'true';
                            } else if (Boolean(tokentel)) {
                                res.response.telefono = 'false';
                            }
                            if (req.user.tokenemail == tokenemail) {
                                res.response.email = 'true';
                            } else if (Boolean(tokenemail)) {
                                res.response.email = 'false';
                            }
                            res.response.res = 'ok';
                            res.response.message = 'ok';
                            return res.status(res.response.status).json(res.response);
                        }
                    });
                }else{
                    res.response.message = 'El código ingresado no es válido';
                    return res.status(res.response.status).json(res.response);
                }
            }
        });
    } else {
        res.response.message = 'No se detectan los campos correspondientes';
        return res.status(200).json(res.response);
    }
}