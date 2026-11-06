const tokenizer = require('../../../utils/tokenizer');


module.exports.unsubscribe = async (req, res, next) => {
    res.response.error = 1;
    res.response.code = 400;
    tokenizer.detokenize(
        req.query.token, function(err, doc){
            if (err || !doc){
                res.response.message = "Token es invalido. Contacte a soporte";
                return res.status(401).json(res.response);
            }else{
                if (doc.cuil){
                    VIDA_DB.query("update usuario set notificaciones = 0 where cuil = ?", [doc.cuil], function(err, result){
                        if (err) {
                            res.response.message = "Error de conexión con la base de datos";
                            return res.status(res.response.code).json(res.response);
                        }else{
                            res.response.error = 0;
                            res.response.message = `El cuil ${doc.cuil} ya no recibirá más notificaciones ni recordatorios`;
                            res.response.code = 200;
                            return res.status(res.response.code).json(res.response);
                        }
                    })
                }else if (doc.email){
                    VIDA_DB.query("update mails set unsubscribed = 1 where email = ?", [doc.email], function(err, result){
                        if (err) {
                            res.response.message = "Error de conexión con la base de datos";
                            return res.status(res.response.code).json(res.response);
                        }else{
                            res.response.error = 0;
                            res.response.message = `El mail ${doc.email} ya no recibirá más notificaciones ni recordatorios`;
                            res.response.code = 200;
                            return res.status(res.response.code).json(res.response);
                        }
                    })
                }
             }
    });
}