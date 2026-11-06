const AWS = require('aws-sdk');
const s3 = new AWS.S3();

const { Parser } = require('json2csv');


module.exports.searchUser = (req, res, next) => {

    res.response.error = 1;
    res.response.data = "Error desconocido";
    console.log(req.params);
    console.log(req.user);
    AUTHENTICATOR_DB.query("select u.aplicacion, u.nombre, u.apellido, u.dni, u.sexo, a.latitud, a.similitud, a.longitud, a.fecha from auth a, usuarios u where a.idUsuario = u.idUsuario and idValidacion = ?  and (aplicacion = ? or 'S'= ?)",[req.params.idValidacion, req.user.aplicacion, req.user.rol],
    function(err, doc){
        if (err || doc.length == 0){
            console.log(err);
            res.response.data = "Validacion no encontrada";
            return res.status(400).json(res.response);
        }else{
            req.validation = doc[0];
            next();
        }
    } )
}

module.exports.data = (req, res, next) => {

    res.response.front = s3.getSignedUrl('getObject', {
        Bucket: "autenticartuid",
        Key: "usuarios/" + req.validation.aplicacion + "/" + req.validation.dni + req.validation.sexo + "_F.jpeg",
        Expires: 3600
    });

    res.response.back = s3.getSignedUrl('getObject', {
        Bucket: "autenticartuid",
        Key: "usuarios/" + req.validation.aplicacion + "/" + req.validation.dni + req.validation.sexo + "_B.jpeg",
        Expires: 3600
    });

    res.response.docPhoto = s3.getSignedUrl('getObject', {
        Bucket: "autenticartuid",
        Key: "usuarios/" + req.validation.aplicacion + "/" + req.validation.dni + req.validation.sexo + "_P.jpeg",
       Expires: 3600
    });
    res.response.selfie = s3.getSignedUrl('getObject', {
        Bucket: "autenticartuid",
        Key: "usuarios/" + req.validation.aplicacion + "/" + req.validation.dni + req.validation.sexo + "_S.jpeg",
        Expires: 3600
    });

    res.response.lastLogin  = s3.getSignedUrl('getObject', {
        Bucket: "autenticartuid",
        Key: "login/" + req.validation.aplicacion + "/" + req.validation.dni + req.validation.sexo + ".jpeg",
        Expires: 3600
    });
    res.response.error = 0;
    res.response.validation = req.validation;
    return res.status(200).json(res.response);

   
}
module.exports.filter = (req, res,next) => { 
    req.body.params = [];
    req.body.query = "select a.idValidacion, u.nombre, u.apellido, u.cuil, a.fecha,a.latitud, a.longitud, a.similitud, u.aplicacion from auth a, usuarios u where a.idUsuario = u.idUsuario and (u.aplicacion = ? or 'S' = ?)";
    req.body.params.push(req.user.aplicacion);
    req.body.params.push(req.user.rol);
    if ( req.query.aplicacion ){
        req.body.query = req.body.query + " and u.aplicacion = ?"
        req.body.params.push(req.query.aplicacion);
    }
    if ( req.query.text ){
        
        req.body.query = req.body.query + " and (u.dni = ? or u.cuil =? or u.nombre like ?)"
        req.body.params.push(req.query.text);
        req.body.params.push(req.query.text);
        req.body.params.push('%'+req.query.text+'%');
    }
    if ( req.query.gender ){
        req.body.query = req.body.query + " and u.sexo = ? "
        req.body.params.push(req.query.gender);
    }
    next();

}

module.exports.list = (req, res,next) => {
    res.response.error = 1;
    res.response.data = "Error desconocido";
    req.body.query = req.body.query + " order by a.fecha desc limit 500";
    AUTHENTICATOR_DB.query(req.body.query, req.body.params,
    function(err,rows){
        if (err){
            console.log(err);
            res.response.data = "Error conectando con la base de datos";
            res.status(400).json(res.response);
        }else{
            res.response.error = 0;
            res.response.data = rows;
            res.status(200).json(res.response);
        }
    })
    
}

module.exports.download = (req, res,next) => {
    res.response.error = 1;
    res.response.data = "Error desconocido";
    req.body.query = req.body.query + " order by a.fecha desc";
    AUTHENTICATOR_DB.query(req.body.query, req.body.params,function(err,rows){
        if (err){
            res.response.data = "Error conectando con la base de datos";
            res.status(400).json(res.response);
        }else{
            const json2csv = new Parser();
            const csv = json2csv.parse(rows);
            res.header('Content-Type', 'text/csv');
            res.attachment('validations.csv');
            return res.send(csv);
        }
    })
}