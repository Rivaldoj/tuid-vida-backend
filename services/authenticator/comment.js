const mailing = require('../../utils/mail');
const config = CONFIG.get('authenticator');

module.exports = async function(req,res, next){
    res.response.status = 400;
    res.response.res = "error";
    if (!req.body.email) return res.status(res.response.status).json(res.response);
    if (!req.body.os) req.body.os = "";
    if (!req.body.version) req.body.version = "";
    
    var params = [];
    params.push(req.body.cuil);
    params.push(req.body.nombre);
    params.push(req.body.email);
    params.push(req.body.telefono);
    params.push(req.body.asunto);
    params.push(req.body.mensaje);
    params.push(req.client.id);

    req.body.code = "N/A";
    req.body.letter = "N/A";
    req.body.autoresponse = "N/A";
    AUTHENTICATOR_DB.query(`insert into comentarios(cuil, nombre, email, telefono, asunto, mensaje, aplicacion, fecha) 
    values(?,?,?,?,?,?,?, UTC_TIMESTAMP)`, params,
     function(err, result){
        if (err){
            res.response.message = "Error de conexión con la base de datos";
        }
        res.response.res = "ok";
        res.response.status = 200;
        res.response.message = "Solicitud enviada con éxito, nos pondremos en contacto a la brevedad.";
        var params = req.body;
        params.app = req.client.name;
        params.title = "Contacto " + req.client.name;
        mailing.send('contact',params,config.supportContact, null, null );
        return res.status(res.response.status).json(res.response);
    });
}

