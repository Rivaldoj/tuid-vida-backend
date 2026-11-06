const tokenizer = require('../utils/tokenizer');


module.exports.web = async (req, res, next) => {
    let token = req.body.token || req.headers['token'];
    tokenizer.detokenizeAuthenticatorAdmin(
        token, function(err, doc){
            if (err || !doc){
                res.response.error = 1;
                res.response.data = "Token es invalido. Inicie sesión nuevamente";
                res.status(201).json(res.response);
            }else{
                req.user = doc;
                next();
            }
    });
}


module.exports.api = async (req, res, next) => {
    let token = req.body.token || req.headers['token'] || req.query.token;
    AUTHENTICATOR_DB.query('select * from clientes where auth = ?', [token], function(err,rows){
        if (err || rows.length == 0){
            res.response.error = 1;
            res.response.data = "Token es invalido. ";
            res.status(201).json(res.response);
        }else{
            req.user = rows[0];
            next();
        }
    });
}