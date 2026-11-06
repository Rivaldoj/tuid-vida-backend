module.exports.validations = async (req,res,next) => {
    
    res.response = {
        "error": 1,
        "data": ""
    };

    var Auth = req.body.authorization;
    var empresa = req.body.empresa;
    var fecha_i = req.body.fechaI;
    var fecha_f = req.body.fechaF //+ 1;

    let query = 'select * from cliente c join empresa e on (e.id = c.empresa) where c.autorizacion = ? and c.empresa = ? ';
    VIDA_DB.query(query, [Auth, empresa], function (err, rows) {
        if (err || rows.length === 0 || Auth === null) {
            res.response.error = 1;
            res.response.data = "No está autorizado";
            return res.status(201).json(res.response);
        } else {
            var dir = "";
            var email = "";
            var tel = "";
            if (rows[0].direcciones) dir = " ,a.direccion ";
            if (rows[0].telefonos) tel = " ,c1.telefono ";
            if (rows[0].emails) email = " ,c1.email ";
            var params = [];
            var query = `select distinct c1.cuil, c1.maxfecha as fecha, a.similitud, a.latitud, a.longitud ${dir} ${email} ${tel} from (SELECT u.telefono, u.email, u.cuil, 
                au.id_usuario,
                Max(au.fecha) AS maxfecha,
                au.empresa
                FROM auditoria au INNER JOIN usuario u ON (au.id_usuario = u.id_usuario and au.auditor is not null and au.auditor not like 'ALERTA%')
                where au.empresa = ? and au.fecha >= ? and au.fecha <= date_add(?, interval 1 day)
                and au.similitud > 1
                GROUP BY u.cuil, au.id_usuario, au.empresa
                HAVING Max(au.fecha)>= ? And Max(au.fecha) <= date_add(?, interval 1 day)) c1 inner join auditoria a on (c1.maxfecha = a.fecha and c1.id_usuario = a.id_usuario) 
                where a.empresa = ? and a.similitud > 1 and a.auditor is not null and a.auditor not like 'ALERTA%'
                order by cuil asc, fecha desc`;
            params = [empresa,fecha_i,fecha_f,fecha_i,fecha_f, empresa];
         
            console.log(params);

            VIDA_DB.query(query, params, function (err, rows) {
               
                if (err || rows.length === 0) {
                    console.log(err);
                    res.response.error = 1;
                    res.response.data = "No se encontraron resultados";
                    return res.status(201).json(res.response);
                } else {
                    res.response.error = 0;
                    res.response.data = rows;
                    return res.status(200).json(res.response);
                }
            });
        }
    });
}


module.exports.forms = async (req,res,next) => {

        res.response = {
            "error": 1,
            "data": ""
        };
        var Auth = req.body.authorization;
        var empresa = req.body.empresa;
        var form = req.body.form;//+ 1;
        let query = 'select * from cliente c join empresa e on (e.id = c.empresa) where c.autorizacion = ? and c.empresa = ? ';
        VIDA_DB.query(query, [Auth, empresa], function (err, rows) {
            if (err || rows.length === 0 || Auth === null) {
                res.response.error = 1;
                res.response.data = "No está autorizado";
                return res.status(201).json(res.response);
            } else {
                VIDA_DB.query(queriesApi.forms, [form, empresa], function (err, rows) {
                    if (err || rows.length === 0) {
                        console.log(err);
                        res.response.error = 1;
                        res.response.data = "No se encontraron resultados";
                        return res.status(201).json(res.response);
                    } else {
                        res.response.error = 0;
                        res.response.data = rows.map(e=> {
                            try {
                                e.respuesta = JSON.parse(e.respuesta);
                            }catch(e){
                                e.respuesta = [];
                            }
                            return e;
                        });
                        return res.status(200).json(res.response);
                    }
                });
            }
        });
}


var queriesApi = {
    forms : `select u.cuil , f.id as id_formulario, f.nombre , f.descripcion , f.empresa_id , r.respuesta , r.fecha as fecha_respuesta
    from usuario u 
    join respuestas r on r.id_usuario = u.id_usuario 
    join formularios f on f.id = r.id_formulario and f.id = ? 
    inner join (SELECT r2.id_formulario, r2.id_usuario, MAX(r2.id) AS maxpostid FROM respuestas r2 GROUP BY r2.id_usuario, r2.id_formulario) p2 ON r.id = p2.maxpostid
    where f.empresa_id  = ? `
}
