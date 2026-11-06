const sisa = require('./../../../utils/sisa');
module.exports.getDoctor = (req,res,next) =>{
    res.response = {
        "error": 1,
        "message": "Error desconocido"
    };
    if (!req.query.document) res.response.message = "Requiere enviar documemtn";

    sisa.getDoctor(req.query.document).then(result => {
        res.response.message = "Respuesta de SISA";
        res.response.data = JSON.parse(result);
        return res.status(200).json(res.response);
    }).catch(err=>
         { return res.status(400).json(res.response)}
    )
}