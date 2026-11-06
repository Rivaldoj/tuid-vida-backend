
module.exports.get = async (req,res, next)=> {
    res.response = {
        error: 1,
        message: "Error desconocido",
        data: []
    }
    var params = [];
    var query = "select * from comentarios where 1=1";

    if (req.query.asignacion){ // email de colega
        if (req.query.asignacion == -1){
            query = `${query} and asignacion is null`;
        }else{
            query = `${query} and asignacion = ?`;
            params.push(req.query.asignacion);
        }
    }
    if (req.query.estado){ // O, C, A
        if (req.query.estado == "A"){
            query = `${query} and procesando = 1`;
        }else{
            query = `${query} and estado = ?`;
            params.push(req.query.estado);
        }
        
    }
    if (req.query.prioridad){ // LOW, MEDIUM, HIGH
        query = `${query} and prioridad = ?`;
        params.push(req.query.prioridad);
    }
    if (req.query.text){
        query = `${query} and ( cuil like '%${req.query.text}%' or nombre like '%${req.query.text}%' ) `;
    }


    VIDA_DB.query(`${query} order by fecha desc , external_id desc limit 500`,params, function(err,docs){
        if (err) {
            console.log(err);
            res.response.message = "Error de conexión con la base de datos";
            return res.status(200).json(res.response);
        }else{
            res.response.error = 0;
            res.response.message = `Se han encontrado ${docs.length} tickets`;
            res.response.data = docs;
            return res.status(200).json(res.response);
        }
    });
}



module.exports.changeStatus = async (req,res, next)=> {
    res.response = {
        error: 1,
        message: "Error desconocido"
    }
    let newStatus = req.params.newStatus;
    if (newStatus != 'C' && newStatus != 'O'){
        res.response.message = "Estado inválido";
        return res.status(200).json(res.response);
    }
    var query = "UPDATE comentarios set estado = ?, procesando = 0 where proveedor = ? and external_id = ?";
    VIDA_DB.query(query,[newStatus, req.params.proveedor, req.params.external_id], function(err,docs){
        if (err) {
            res.response.message = "Error de conexión con la base de datos";
            return res.status(200).json(res.response);
        }else{
            res.response.error = 0;
            res.response.message = `Ticket ${req.params.proveedor}${req.params.external_id} actualizado`;
            return res.status(200).json(res.response);
        }
    });
}

module.exports.categories = async (req,res, next)=> {
    res.response = {
        error: 0,
        categories: [
           {
               "code": "A",
               "desc": "Entidad no corresponde"
           },
           {
            "code": "B",
            "desc": "Problema Resuelto"
        },{
            "code": "C",
            "desc": "No contesta"
        },
        {
            "code": "D",
            "desc": "Tipo de Documento"
        },
        {
            "code": "E",
            "desc": "No Coinciden Datos"
        },{
            "code": "F",
            "desc": "Utilizo otros Canales"
        },
        {
            "code": "G",
            "desc": "Impedimentos Físicos"
        },
        {
            "code": "H",
            "desc": "Impedimentos Tecnicos"
        },
        {
            "code": "I",
            "desc": "Registración asistida"
        },
        {
            "code": "J",
            "desc": "Ticket duplicado"
        },
        {
            "code": "K",
            "desc": "Otro"
        }
    ]
    }
    return res.status(200).json(res.response);
   
}



module.exports.changeProcess = async (req,res, next)=> {
    res.response = {
        error: 1,
        message: "Error desconocido"
    }
    var newStatus = req.params.procesando;
    if (newStatus == 'true'){
        newStatus = 1;
    }else{
        newStatus = 0;
    }
    var query = "UPDATE comentarios set procesando = ? where proveedor = ? and external_id = ?";
    VIDA_DB.query(query,[newStatus, req.params.proveedor, req.params.external_id], function(err,docs){
        if (err) {
            res.response.message = "Error de conexión con la base de datos";
            return res.status(200).json(res.response);
        }else{
            res.response.error = 0;
            res.response.message = `Ticket ${req.params.proveedor}${req.params.external_id} actualizado`;
            return res.status(200).json(res.response);
        }
    });
}

module.exports.asign = async (req,res, next)=> {
    res.response = {
        error: 1,
        message: "Error desconocido"
    }
    if (!req.params.email){
        res.response.message = "Es necesario enviar el email";
        return res.status(200).json(res.response);
    }
    var query = "UPDATE comentarios set asignacion = ? where  proveedor = ? and external_id = ? and ? in (select email from cliente where empresa = ?)";
    VIDA_DB.query(query,[req.params.email, req.params.proveedor, req.params.external_id,req.params.email, req.user.empresa], function(err,docs){
        if (err) {
            console.log(err);
            res.response.message = "Error de conexión con la base de datos";
            return res.status(200).json(res.response);
        }else{
            res.response.error = 0;
            res.response.message = `Ticket ${req.params.proveedor}${req.params.external_id} actualizado`;
            return res.status(200).json(res.response);
        }
    });
}

module.exports.channel = async (req,res, next)=> {
    res.response = {
        error: 1,
        message: "Error desconocido"
    }
    if (!req.params.channelId){
        res.response.message = "Es necesario enviar el canal";
        return res.status(200).json(res.response);
    }
    var query = "UPDATE comentarios set canal = ? where  proveedor = ? and external_id = ?";
    VIDA_DB.query(query,[req.params.channelId, req.params.proveedor, req.params.external_id], function(err,docs){
        if (err) {
            console.log(err);
            res.response.message = "Error de conexión con la base de datos";
            return res.status(200).json(res.response);
        }else{
            res.response.error = 0;
            res.response.message = `Ticket ${req.params.proveedor}${req.params.external_id} actualizado`;
            return res.status(200).json(res.response);
        }
    });
}


module.exports.closeIssue = async (req,res, next)=> {
    res.response = {
        error: 1,
        message: "Error desconocido"
    }
    if (!req.body.category){
        res.response.message = "Es necesario enviar el motivo";
        return res.status(200).json(res.response);
    }
    var query = "UPDATE comentarios set motivo_cierre = ? where  proveedor = ? and external_id = ?";
    VIDA_DB.query(query,[req.body.category, req.params.proveedor, req.params.external_id], function(err,docs){
        if (err) {
            console.log(err);
            res.response.message = "Error de conexión con la base de datos";
            return res.status(200).json(res.response);
        }else{
            res.response.error = 0;
            res.response.message = `Ticket ${req.params.proveedor}${req.params.external_id} actualizado`;
            return res.status(200).json(res.response);
        }
    });
}

module.exports.daily = async (req,res, next)=> {
    req.q = `select if(asignacion is null, 'SIN ASIGNACION', asignacion) as responsable, date(fecha) as dia,count(*) as total,
    sum(if(estado='C',1,0)) as cerrados, 
    sum(if(estado='O',1,0)) as abiertos,  
    sum(if(autoresponse=1,1,0)) as automaticos,
    sum(if(prioridad='LOW',1,0)) as baja_prioridad,
    sum(if(prioridad='MEDIUM',1,0)) as media_prioridad,
    sum(if(prioridad='HIGH',1,0)) as alta_prioridad,
    sum( IF(estado = 'C',
    CASE
        WHEN prioridad = 'HIGH' THEN 3
        WHEN prioridad = 'MEDIUM' THEN 2
        ELSE 1
    END
    ,0)) as puntos
    from comentarios group by asignacion ,date(fecha) order by dia desc`;
    req.par = [];
    next();
}

module.exports.monthly = async (req,res, next)=> {
    req.q = `select if(asignacion is null, 'SIN ASIGNACION', asignacion) as responsable, year(fecha) as ano, month(fecha) as mes,count(*) as total,
    sum(if(estado='C',1,0)) as cerrados, 
    sum(if(estado='O',1,0)) as abiertos,  
    sum(if(autoresponse=1,1,0)) as automaticos,
    sum(if(prioridad='LOW',1,0)) as baja_prioridad,
    sum(if(prioridad='MEDIUM',1,0)) as media_prioridad,
    sum(if(prioridad='HIGH',1,0)) as alta_prioridad,
    sum( IF(estado = 'C',
    CASE
        WHEN prioridad = 'HIGH' THEN 3
        WHEN prioridad = 'MEDIUM' THEN 2
        ELSE 1
    END
    ,0)) as puntos
    from comentarios group by asignacion , year(fecha), month(fecha) order by ano desc, mes desc`;
    req.par = [];
    next();
}




module.exports.supportUsers = async (req,res, next)=> {
    res.response = {
        error: 1,
        message: "Error desconocido"
    }
    var query = "select email from cliente where empresa = ? and activo = 1";
    VIDA_DB.query(query,[req.user.empresa], function(err,docs){
        if (err) {
            res.response.message = "Error de conexión con la base de datos";
            return res.status(200).json(res.response);
        }else{
            res.response.error = 0;
            res.response.message = `Se han encontrado ${docs.length} usuarios`;
            res.response.data = docs;
            return res.status(200).json(res.response);
        }
    });
}

