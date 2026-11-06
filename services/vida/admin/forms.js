

const queries = {
    "forms" : "select * from formularios f where 1=1",
    "respuestas" : "select * from respuestas r join formularios f on f.id = r.id_formulario join usuario u on u.id_usuario = r.id_usuario where 1=1"
}
module.exports.getRespuestas = async function(req,res){
    res.response = {
        error: 1,
        data: "Error"
    };

    var query = ""
    if(req.user.empresa === 'TUID'){
        if (req.query.empresa){
            query = `${queries.respuestas} and f.empresa = '${req.query.empresa}'`;
        }else{
            query = `${queries.respuestas}`;
        }
    }else{
        query = `${queries.respuestas} and f.empresa = '${req.query.empresa}'`;
    }
    VIDA_DB.query(query,[], function(err,docs){
        if (err) {
            res.response.data = "Error de conexion con base de datos"
            return res.status(200).json(res.response);
        }
        res.response.error = 0;
        res.response.data = docs;
        return res.status(200).json(res.response);
    });


}

module.exports.getFormularios = async function(req,res){
    res.response = {
        error: 1,
        data: "Error"
    };

    var query = ""
    if(req.user.empresa === 'TUID'){
        if (req.query.empresa){
            query = `${queries.forms} and f.empresa = ${req.query.empresa}`;
        }else{
            query = `${queries.forms}`;
        }
    }else{
        query = `${queries.forms} and f.empresa = '${req.user.empresa}'`;
    }
    VIDA_DB.query(query,[], function(err,docs){
        if (err) {
            res.response.data = "Error de conexion con base de datos"
            return res.status(200).json(res.response);
        }
        res.response.error = 0;
        res.response.data = docs;
        return res.status(200).json(res.response);
    });


}

