module.exports.submit = (req,res,next) => {
    
    res.response = {
        res: 'error',
        message: 'Unknown',
        status: 200
    }
    console.log(req.body);
    
    if (!req.body.id || !Array.isArray(req.body.cuestionario)){
        res.response.message = "Faltan parámetros";
        return res.status(200).json(res.response);
    }

    let text = JSON.stringify(req.body.cuestionario);
    VIDA_DB.query('insert into respuestas (id_usuario, id_formulario, respuesta, fecha) select ?,id,?,now() from formularios where id = ? ', 
    [req.user.idUser, text, req.body.id ], function(err,doc){
        console.log(err,doc);
        if (err){
            res.response.message = "Imposible actualizar base de datos";
            return res.status(200).json(res.response);
        }else{
            res.response.res = 'ok';
            res.response.message = "Respuesta recibida satisfactoriamente";
            return res.status(200).json(res.response);
        }
    })
}