
module.exports.getEntities = async (req, res, next) => { 
    res.response = {
        error: 1,
        data: []
    }
    let query = "SELECT nombre, img from empresa where visible = 1";
    VIDA_DB.query(query, [], function (err, rows) {
        if(err){
            res.response.message = "Error de conexion con base de datos";
            res.response.details = "Error de conexion con base de datos";
            return res.status(200).json(res.response);
        }else {
            res.response.message = "";
            res.response.error = 0;
            res.response.data = rows;
            return res.status(200).json(res.response);
        }
    });
}
