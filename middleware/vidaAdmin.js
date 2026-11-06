const tokenizer = require('../utils/tokenizer');


module.exports = async (req, res, next) => {
    let token = req.body.token || req.headers['token'];
    if (token) {
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
    } else {
        res.response.error = 1;
        res.response.data = "Por favor envie token";
        return res.status(201).json(res.response);
    }
}
