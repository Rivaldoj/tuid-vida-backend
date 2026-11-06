module.exports = function(req, res, next){
    if (req.path.startsWith('/v2/docs')) {
        return next();
    }

    let auth = req.headers['authorization'];
    let whiteBrand = CONFIG.get("authenticator").whitebrands.find(e => {return e.token == auth});

    if (whiteBrand) {
        if (!whiteBrand.enabled) {
            return res.status(400).send({res: "error", status: 400, message:"El servicio no está habilitado, consulte con su entidad"});
        }
        req.client = whiteBrand;
        return next();
    } else {
        return res.status(401).send({message:"Please make sure your request has a valid Authorization header"});
    }
 }