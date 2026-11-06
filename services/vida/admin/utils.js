const vidaConfig = CONFIG.get('vida');
const notifications = require('./../../../utils/push');
const sms = require('./../../../utils/sms')
let config = {
    revenge: vidaConfig.revengePercentage,
    registration: vidaConfig.approvePercentage,
    validation: vidaConfig.approveLife,
    manually: vidaConfig.manuallyPercentage
}

module.exports.notifications = async (req,res,next)=>{
    res.response = {
        "error": 0,
        "data": []
    };
    if (config.revenge < 55){ res.response.data.push(`Porcentaje de revancha menor a 55, valor actual ${config.revenge}`)}
    if (config.manually < 55){ res.response.data.push(`Porcentaje de aprobacion de registro manual menor a 55, valor actual ${config.manually}`)}
    if (config.validation < 70){ res.response.data.push(`Porcentaje de registro directo menor a 80, valor actual ${config.validation}`)}
    if (config.approveLife < 70){ res.response.data.push(`Porcentaje de certificación menor a 90, valor actual ${config.approveLife}`)}
    sms.getTelepromCredit(function(err,body){
        if(err){
            res.response.error = 1;
            res.response.errorJson = err;
        }
        else if (body){
            if (body.creditos && body.creditos.length > 0){
                res.response.data.push(`Creditos en Teleprom: ${body.creditos[0].creditos}. Cuenta suspendida: ${body.creditos[0].suspendido}`)
            }
        }
        return res.status(200).json(res.response);
    });
}


module.exports.notify = async (req,res,next)=>{
    res.response = {
        "error": 1,
        "data": "Error desconocido"
    };
    VIDA_DB.query("select id_device from usuario where id_usuario = ?", [req.body.id], function(err,docs){
        if (err || docs.length == 0){
            console.log(err);
            res.response.data = "Usuario no encontrado"
        }else{
            if (docs[0].id_device){
                notifications.send(docs[0].id_device, "TuID Vida", req.body.text);
                res.response.error = 0;
                res.response.data = "Notificación enviada";
            }else{
                res.response.data = "No tenemos datos de contacto";
            }
        }
        return res.status(200).json(res.response);
    })

}
