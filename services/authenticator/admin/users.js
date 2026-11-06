
const crypto = require('crypto');
module.exports.list = async function(req,res,next){
    res.response.error = 1;
    res.response.data = "Error desconocido";
    AUTHENTICATOR_DB.query("SELECT activo, aplicacion, email, rol, empresa from clientes where aplicacion = ? or 'S' = ? ", [req.user.aplicacion, req.user.rol],
    function(err, row){
        if (err){
            res.response.data = "Error de conexión con la base de datos";
            res.status(400).json(res.response);
        }else{
            res.response.error = 0;
            res.response.data = row;
            res.status(200).json(res.response);
        }
    });

}

module.exports.create = async function(req,res,next){
    res.response.error = 1;
    res.response.data = "Error desconocido";

    var app = req.user.aplicacion
    if ( req.body.aplicacion && req.user.rol == 'S'){
        app = req.body.aplicacion;
    }
    var rol = "U";
    if (req.body.rol && req.user.rol == 'S'){
        rol = req.body.rol;
    }
    let password = crypto.createHash('sha1').update(req.body.password).digest('hex');
    let query = `insert into clientes (email, telefono, aplicacion, rol, password, activo) values (?,?,?,?,?,1)`;
    AUTHENTICATOR_DB.query(query, [req.body.email, req.body.telefono, app, rol, password],
    function (err, result){
        if (err){
            if (err.code == 'ER_DUP_ENTRY') {
                res.response.data = "El mail ya se encuentra registrado";
            }else{
                res.response.data = "Error de conexión con la base de datos";
            }        
            res.status(400).json(res.response);
        }else{
            res.response.data = "Usuario agregado";
            res.response.error = 0;
            console.log(result);

            res.status(200).json(res.response);
        }
    });
}


module.exports.delete = async function(req,res,next){
    res.response.error = 1;
    res.response.data = "Error desconocido";
    AUTHENTICATOR_DB.query("delete from clientes where idCliente = ? and (aplicacion = ? or 'S' = ?)", [req.paramas.idCliente, req.user.aplicacion, req.user.rol],
    function(err, row){
        if (err){
            res.response.data = "Error de conexión con la base de datos";
            return res.status(400).json(res.response);
        }else{
            if ( result.affectedRows > 0 ) {
                res.response.error = 0;
                res.response.data = "Usuario eliminado";
                return res.status(200).json(res.response);
            }else{
                res.response.data = "No se pudo eliminar al usuario";
                return res.status(400).json(res.response);
            }
        }
    });
}



module.exports.getBlacklist = async function(req,res,next){
    res.response.error = 1;
    res.response.data = "Error desconocido";
    AUTHENTICATOR_DB.query("SELECT * from lista_negra where aplicacion = ? or 'S' = ?", [req.user.aplicacion, req.user.rol],
    function(err, row){
        if (err){
            res.response.data = "Error de conexión con la base de datos";
            res.status(400).json(res.response);
        }else{
            res.response.error = 0;
            res.response.data = row;
            res.status(200).json(res.response);
        }
    });
}

module.exports.postBlacklist = async function(req,res,next){
    res.response.error = 1;
    res.response.data = "Error desconocido";
    var app = req.user.aplicacion;
    if (req.user.rol == 'C' && req.body.aplicacion){
        app = req.body.aplicacion;
    }
    AUTHENTICATOR_DB.query("insert into lista_negra(dni, sexo, motivo, nombre, apellido, aplicacion) values(?,?,?,?,?,?) on duplicate key update motivo = values(motivo), apellido = values(apellido), nombre = values(nombre)", [req.body.dni, req.body.sexo, req.body.motivo, req.body.nomrbe, req.body.apellido,app],
    function(err, row){
        if (err){
            res.response.data = "Error de conexión con la base de datos";
            res.status(400).json(res.response);
        }else{
            res.response.error = 0;
            res.response.data = "DNI agregado";
            return res.status(200).json(res.response);
        }
    });
}

module.exports.removeBlackList = async function(req,res,next){
    res.response.error = 1;
    res.response.data = "Error desconocido";
    var app = req.user.aplicacion;
    if (req.user.rol == 'C' && req.body.aplicacion){
        app = req.body.aplicacion;
    }
    AUTHENTICATOR_DB.query("delete from lista_negra where dni = ? and sexo = ? and aplicacion =? ",[req.body.dni, req.body.sexo, app],
    function(err, row){
        if (err){
            res.response.data = "Error de conexión con la base de datos";
            res.status(400).json(res.response);
        }else{
            res.response.error = 0;
            res.response.data = "DNI removido";
            return res.status(200).json(res.response);
        }
    });
}