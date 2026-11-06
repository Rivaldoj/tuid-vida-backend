module.exports = function(req, res, next){
    let auth = req.headers['authorization'];
    let whiteBrand = CONFIG.get("vida").whitebrands.find(e => {return e.token == auth && e.enabled});
    if (whiteBrand) {
        req.client = whiteBrand;
        return next();
    } else {
        return res.status(401).send({message:"Please make sure your request has a valid Authorization header"});
    }
 }