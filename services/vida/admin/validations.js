var Zip = require('node-zip');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const fs = require('fs');
module.exports.search = async (req,res,next)=>{

    res.response = {
        "error": 1,
        "data": ""
    };
    var dni = req.query.dni;
    var sexo = req.query.sexo;
    let query;
    if (isNaN(dni) === false){
        if(req.user.empresa === 'TUID'){
            query = 'select a.id_validacion, u.cuil, a.fecha,a.similitud,u.apellido,u.nombre,a.latitud,a.longitud,a.empresa, a.auditor, a.direccion  FROM auditoria a join usuario u on (a.id_usuario = u.id_usuario) Where (( u.dni  like "'+ dni +'%" and u.sexo=?) or u.cuil  like "' + dni + '%") and a.similitud > 1';
        }else{
            query = 'select a.id_validacion, u.cuil, a.fecha,a.similitud,u.apellido,u.nombre,a.latitud,a.longitud,a.empresa,a.auditor, a.direccion  FROM auditoria a join usuario u on (a.id_usuario = u.id_usuario) Where a.empresa="' + req.user.empresa + '" and (( u.dni  like "'+ dni +'%" and u.sexo=?) or u.cuil  like "' + dni + '%") and a.similitud > 1';
        }
    } else{
        if(req.user.empresa === 'TUID') {
            query = 'select  a.id_validacion, u.cuil, a.fecha,a.similitud,u.apellido,u.nombre,a.latitud,a.longitud,a.empresa, a.auditor,a.direccion FROM auditoria a join usuario u on (a.id_usuario = u.id_usuario) Where ( u.nombre  like "%' + dni + '%" or u.apellido  like "%'+ dni +'%") and a.similitud > 1';
        }else{
            query = 'select a.id_validacion,  u.cuil, a.fecha,a.similitud,u.apellido,u.nombre,a.latitud,a.longitud,a.empresa,a.auditor, a.direccion  FROM auditoria a join usuario u on (a.id_usuario = u.id_usuario) Where a.empresa="' + req.user.empresa + '" and ( u.nombre  like "%' + dni + '%" or u.apellido  like "%'+ dni +'%") and a.similitud > 1';
        }
    }

    var alert = "";
    if (req.query.alerts){ alert = " and a.auditor like 'ALERTA%'" } ;
    query = `${query} ${alert} order by a.id_validacion desc`;

    VIDA_DB.query(query, [sexo], function(err,rows) {
        if (!err) {
            if (rows.length>0) {
                res.response.error = 0;
                res.response.data = rows;
                res.status(200).json( res.response);
            } else{
                res.response.error = 1;
                res.response.data = "No se encontraron resultados";
                res.status(201).json( res.response);
            }
        } else {
            res.response.error = 1;
            res.response.data = "Error Occured!";
            console.log(err);
            res.status(201).json( res.response);
        }
    });
}

module.exports.get = async (req,res, next) => {
    let query = req.user.empresa === 'TUID'?'SELECT a.id_validacion, u.cuil, a.fecha,a.similitud,u.apellido,u.nombre,a.latitud,a.longitud,a.empresa, a.auditor, a.direccion FROM usuario u join auditoria a on(u.id_usuario = a.id_usuario) where a.similitud > 1 order by id_validacion desc limit 500':'SELECT u.cuil, a.fecha,a.similitud,u.apellido,u.nombre,a.latitud,a.longitud,a.empresa FROM usuario u join auditoria a on(u.id_usuario = a.id_usuario) where a.empresa=? and a.similitud > 1 order by id_validacion desc limit 500';
    VIDA_DB.query(query,[req.user.empresa], function(err, rows, fields) {
        if (!err) {
            res.response.error = 0;
            res.response.data= rows;
            res.status(200).json(res.response);
        } else {
            res.response.error =1;
            res.response.data = "No data found";
            console.log(err);
            res.status(201).json(res.response);
        }
    });

}

module.exports.imgValidation = async (req,res, next) => {
    res.response = {
        "error": 1,
        "data": ""
    };
    connection.query('SELECT a.id_validacion, a.id_usuario, a.Fecha,u.Nombre,u.Apellido,a.latitud,a.longitud,a.Similitud FROM usuario u join auditoria a on(u.id_usuario = a.id_usuario) where a.empresa=? order by id_validacion desc limit 50',[req.user.empresa], function(err, rows, fields) {
        if (!err) {
            res.response.error = 0;
            res.response.data = rows;
            res.status(200).json(res.response);
        } else {
            res.response.data = "No data found";
            res.status(201).json(res.response);
        }
    });

}

module.exports.downloadValidations = async (req,res, next) => {
    res.response = {
        "error": 1,
        "data": ""
    };

    var dia_i = req.query.dia_i || req.headers['dia_i'];
    var ano_i = req.query.ano_i || req.headers['ano_i'];
    var mes_i = req.query.mes_i || req.headers['mes_i'];
    var dia_f = req.query.dia_f || req.headers['dia_f'];
    var ano_f = req.query.ano_f || req.headers['ano_f'];
    var mes_f = req.query.mes_f || req.headers['mes_f'];
    var empresa;
    if (req.user.empresa === 'TUID'){
        empresa = req.query.empresa || req.headers['empresa'];
    } else {
        empresa = req.user.empresa;
    }
    dia_f = dia_f + 1;
    var fecha_i = ano_i + '-' + mes_i + '-' + dia_i;
    var fecha_f = ano_f + '-' + mes_f + '-' + dia_f;
    const csvWriter = createCsvWriter({
        path: './uploads/' + empresa + ano_f + '_'+ mes_f + '.csv',
        header: [
            {id: 'cuil', title: 'Cuil'},
            {id: 'fecha', title: 'Fecha'},
            {id: 'similitud', title: 'Similitud'},
            {id: 'latitud', title: 'latitud'},
            {id: 'longitud', title: 'longitud'},
            {id: 'direccion', title: 'direccion'},
            {id: 'email', title: 'email'},
            {id: 'telefono', title: 'telefono'}
        ]
    });
    var query = "";
    var direcciones = ", 'n/a' as direccion";
    var emails = ", 'n/a' as email";
    var telefonos = ", 'n/a' as telefono"
    if (req.user.direcciones) direcciones = ", a.direccion ";
    if (req.user.telefonos) telefonos = ", c1.telefono ";
    if (req.user.emails) emails = ", c1.email ";

    console.log(empresa, fecha_f, fecha_i);
    if(empresa == 'EFECTIVO SI') {
        if (req.user.direcciones) direcciones = ", a.direccion ";
        if (req.user.telefonos) telefonos = ", c1.telefono ";
        if (req.user.emails) emails = ", c1.email ";

        query = `select distinct c1.cuil, c1.maxfecha as fecha, a.similitud, a.latitud, a.longitud ${direcciones} ${emails} ${telefonos} from (SELECT u.telefono, u.email, u.cuil, 
            au.id_usuario,
            Max(au.fecha) AS maxfecha,
            au.empresa
            FROM auditoria au INNER JOIN usuario u ON (au.id_usuario = u.id_usuario and au.fecha >= ? and au.fecha <= ? and au.auditor is not null and au.auditor not like 'ALERTA%')
            where au.empresa = ? 
            and au.similitud > 1
            GROUP BY u.cuil, au.id_usuario, au.empresa
            HAVING Max(au.fecha)>= ? And Max(au.fecha) <= ? ) c1 inner join auditoria a on ( a.similitud > 1 and c1.maxfecha = a.fecha and c1.id_usuario = a.id_usuario and a.empresa = ?) 
            order by cuil asc, fecha desc`;
         params = [fecha_i,fecha_f,empresa,fecha_i,fecha_f, empresa];
     }else{
        if (req.user.direcciones) direcciones = ", a.direccion ";
        if (req.user.telefonos) telefonos = ", u.telefono ";
        if (req.user.emails) emails = ", u.email ";
         query =  `select * from(select u.cuil, a.fecha,a.similitud,a.latitud,a.longitud ${direcciones} ${emails} ${telefonos}  FROM auditoria a join usuario u on (a.id_usuario = u.id_usuario and a.auditor is not null and a.auditor not like 'ALERTA') Where a.Fecha>=? and a.Fecha<=? and a.empresa=? and a.similitud>1 order by a.fecha desc) AS t1 group by cuil`;
         params = [fecha_i,fecha_f,empresa];
     }
     console.log(query);
     VIDA_DB.query(query, params, function(err,rows) {
        if (err|| rows.length === 0) {
            console.log(err);
            res.response.data = "No se encontraron resultados";
            res.status(201).json(res.response);
        } else {
            console.log(rows[0]);
            var zip = new Zip;
            csvWriter.writeRecords(rows).then(()=> {
                zip.file(empresa  + ano_f + '_'+ mes_f + '.csv', fs.readFileSync('./uploads/' + empresa  + ano_f + '_'+ mes_f + '.csv'));
                var options = {base64: false, compression:'DEFLATE'};
                fs.writeFile('./uploads/'+ ano_f + '_' + mes_f +'.zip',zip.generate(options), 'binary', function (error) {
                    if (error) {
                        res.response.data = "No se encontraron resultados";
                        res.status(201).json(appData);
                    } else {
                        res.download('./uploads/' + ano_f + '_' + mes_f + '.zip');
                    }
                });
            });
        }
    });
}

module.exports.delete = async (req,res,next) => {
    res.response = {
        "error": 1,
        "data": "No se pudo encontrar la validacion"
    };
    if(!req.params.id_validacion) return res.status(200).json(res.response);
    let result = await VIDA_DB.query('delete from auditoria where id_validacion = ?', [req.params.id_validacion]);
    console.log(result);
    res.response.error = 0;
    res.response.data = `Validacion ${req.params.id_validacion} eliminada`;
    return res.status(200).json(res.response);
}

module.exports.getAlerts = async (req,res, next) => {
    res.response = {
        res: 'ok',
        error: 0,
        status: 200,
        message: 'ok',
    };
    if(req.user.empresa === 'TUID'){
        var params = [];
       let query =  `select * from alertas order by fecha desc`;
       let result = await VIDA_DB.sync_query(query,params);
        res.response.data = result; 
        res.response.error = 0;
        return res.status(201).json(res.response);
    }else{
        res.response.error = 1;
        res.response.data = "No se encontraron resultados";
        return res.status(201).json(res.response);
    }
} 