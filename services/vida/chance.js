const bucket = require('../../utils/bucket')
const tuidVidaConfig = CONFIG.get('vida');

function UpdateAuditoria(id, estado,next){
    let query = 'UPDATE usuario u SET u.estado=? WHERE u.id_usuario = ?';
            VIDA_DB.query(query, [estado, id], function(err) {
                if (err) {
                    return next(error);
                } else {
                    return next();
                }
    });
}

module.exports.chance = async (req, res, next) => {
    res.response ={
        "res" : "error",
        "status":400,
        "message":"Error Occured!"
    };
    let query = 'SELECT id_respuesta,estado,dni,sexo FROM usuario WHERE id_usuario=?';
    VIDA_DB.query(query, [req.body.idUser], function(err, rows) {
        if (err) {
            res.response.message = "Error de conexión a la base de datos";
            return res.status(200).json(res.response);
        } else {
            if (rows.length > 0) {
                if (rows[0].estado === 'Revancha') {
                    if (req.body.answers[0].idChoice != rows[0].id_respuesta) {
                        res.response.status = 201;
                        res.response.message = "El puntaje no es suficiente";
                        req.body.estado = "Desaprobado";

                        UpdateAuditoria(req.body.idUser, req.body.estado, function (err) {
                        });

                        res.response.url = `${tuidVidaConfig.supportUrl}?text=${encodeURI(`Hola TuID. Mi registro fue desaprobado. Podrian ayudarme?`)}`;
               

                        return res.status(201).json(res.response);
                    } else {
                        req.body.estado = "Verificar";
                        res.response.res = "ok";
                        res.response.status =  200;
                        res.response.message = "Verificar";
                        bucket.moveUserFiles(rows[0].dni + rows[0].sexo, tuidVidaConfig.bucketName, '/temp', '/usuarios', function(err){
                            if (err) {
                                console.log(err);
                                res.response.res = "error";
                                res.response.status =  400;
                                res.response.message =  "Error al subir imagen"; 
                                return res.status(200).json(res.response); 
                            } else {
                                req.body.estado = 'Verificar';
                                UpdateAuditoria(req.body.idUser, req.body.estado, function (err) {
                                    return res.status(200).json(res.response);
                                });
                            }
                        });
                    }
                } else {
                    res.response.message = "El usuario no esta habilitado para una revancha";
                    return res.status(200).json(res.response);
                }
            }else{
                res.response.message = "No se encontraron datos";
                return res.status(200).json(res.response);
            }
        }
    });
}
