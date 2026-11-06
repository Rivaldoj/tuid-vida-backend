
var lodash = require("lodash");
const { initParams } = require("request");

module.exports.get = async (req, res) => {

    var ano = req.query.ano;
    var mes = req.query.mes;
    res.response = {
        error : 1,
        total : null,
        mes: {},
        dia:{}

    };
    var empresa;
    if (req.user.empresa == 'TUID' && req.query.empresa){
        empresa = req.query.empresa;
    } else {
        empresa = req.user.empresa;
    }
    let query = empresa === 'TUID' ? 'select count(distinct id_usuario) as total FROM auditoria Where month(Fecha)=?;':'select count(distinct id_usuario) as total FROM auditoria Where month(Fecha)=? and empresa=?;';
    VIDA_DB.query(query,[mes,empresa], function(err, row) {
        if (!err) {
            if(row[0].total == null){
                res.response.error = 0;
                res.response.total = 0;
            }else{
                res.response.error = 0;
                res.response.total = row[0].total;
            }
            let done = lodash.after(6, function (){res.status(200).json(res.response); });
            let query1 = empresa === 'TUID'? 'select count(distinct id_usuario) as cantidad, month(Fecha) as mes FROM auditoria Where similitud > 1 and year(Fecha)=? group by mes;':'select count(distinct id_usuario) as cantidad, month(Fecha) as mes FROM auditoria Where similitud > 1 and year(Fecha)=? and empresa=? group by mes;';
            VIDA_DB.query(query1,[ano,empresa], function (err, rows, fields) {
                if (!err) {
                    res.response.mes = rows.length > 0 ? rows:[{}];
                    done();
                } else {
                    res.response.data = "No data found";
                    res.status(201).json(res.response);
                }
            });
            let query2 = empresa === 'TUID'? 'select count(distinct id_usuario) as cantidad, DAY(Fecha) as dia FROM auditoria Where similitud > 1 and month(Fecha)=? and year(Fecha)=? group by dia;':'select count(distinct id_usuario) as cantidad, DAY(Fecha) as dia FROM auditoria Where similitud > 1 and month(Fecha)=? and year(Fecha)=? and empresa=? group by dia;';
            VIDA_DB.query(query2,[mes,ano,empresa], function (err, rows, fields) {
                if (!err) {
                    res.response.dia = rows.length > 0 ? rows:[{}];
                    done();
                } else {
                    res.response.data = "No data found";
                    res.status(201).json(res.response);
                }
            });
            let query3 = empresa === 'TUID'? 'select count(distinct id_usuario) as cantidad, month(Fecha) as mes FROM usuario Where year(Fecha)=? group by mes;':'select count(distinct id_usuario) as cantidad, month(Fecha) as mes FROM usuario Where year(Fecha)=? and empresa=? group by mes;';
            VIDA_DB.query(query3,[ano,empresa], function (err, rows, fields) {
                if (!err) {
                    res.response.mesr = rows.length > 0 ? rows:[{}];
                    done();
                } else {
                    res.response.data = "No data found";
                    res.status(201).json(res.response);
                }
            });
            let query4 = empresa === 'TUID'? 'select count(distinct id_usuario) as cantidad, DAY(Fecha) as dia FROM usuario Where month(Fecha)=? and year(Fecha)=? group by dia;':'select count(distinct id_usuario) as cantidad, DAY(Fecha) as dia FROM usuario Where month(Fecha)=? and year(Fecha)=? and empresa=? group by dia;';
            VIDA_DB.query(query4,[mes,ano,empresa], function (err, rows, fields) {
                if (!err) {
                    res.response.diar = rows.length > 0 ? rows:[{}];
                    done();
                } else {
                    res.response.data = "No data found";
                    res.status(201).json(res.response);
                }
            });

            let query5 = empresa === 'TUID' ? `select count(DISTINCT CONCAT(r.id_usuario ,'_',r.id_formulario)) as cantidad,  DAY(r.fecha) as dia FROM formularios f join respuestas r on r.id_formulario = f.id where month(r.Fecha)=? and year(r.Fecha)=? group by dia` : `select count(DISTINCT CONCAT(r.id_usuario ,'_',r.id_formulario)) as cantidad, DAY(r.fecha) as dia FROM formularios f join respuestas r on r.id_formulario = f.id Where month(r.Fecha)=? and year(r.Fecha)=? and f.empresa_id =? group by dia;`;
            VIDA_DB.query(query5,[mes,ano,empresa], function (err, rows, fields) {
                if (!err) {
                    
                    res.response.diaf = rows.length > 0 ? rows:[{}];
                    done();
                } else {
                    console.log(err)
                    res.response.data = "No data found";
                    res.status(201).json(res.response);
                }
            });

            let query6 = empresa === 'TUID'? `select count(DISTINCT CONCAT(r.id_usuario ,'_',r.id_formulario)) as cantidad, month(Fecha) as mes FROM formularios f join respuestas r on (r.id_formulario = f.id) Where year(r.Fecha)= ? group by mes` : `select count(DISTINCT CONCAT(r.id_usuario ,'_',r.id_formulario)) as cantidad, month(Fecha) as mes FROM formularios f join respuestas r on (r.id_formulario = f.id) Where year(r.Fecha)=? and f.empresa_id=? group by mes`;
            VIDA_DB.query(query6,[ano,empresa], function (err, rows, fields) {
                if (!err) {
                    res.response.mesf = rows.length > 0 ? rows:[{}];
                    done();
                } else {
                    console.log(err)
                    res.response.data = "No data found";
                    res.status(201).json(res.response);
                }
            });
        }else{
            res.response.data = "No data found";
            res.status(201).json(res.response);
        }
    });
}


module.exports.reportValidations = async (req, res,next) => {

    var ano = req.query.ano;
    var mes = req.query.mes;
    req.par = [];
    var empresa = "";
    if (req.user.empresa == 'TUID' && req.query.empresa){
        if (req.query.empresa){
            empresa = ' and a.empresa = ?'
            req.par.push(req.query.empresa);
        }
    } else {
        empresa = ' and a.empresa = ?'
        req.par.push(req.user.empresa);
    }
    req.par.push(mes);
    req.par.push(ano);
    req.q = `select DISTINCT u.cuil, u.dni, u.sexo, u.nombre,u.apellido, max(a.fecha) as ultima_validacion from auditoria a join usuario u on u.id_usuario = a.id_usuario  ${empresa} and a.similitud > 50 and month(a.fecha) = ? and YEAR(a.fecha) = ? group by u.cuil, u.nombre`;
    next();

}

module.exports.reportRegistrations = async (req, res,next) => {

    var ano = req.query.ano;
    var mes = req.query.mes;
    req.par = [];
    var empresa = "";
    var telefonos = "";
    var emails = "";
    if (req.user.emails) telefonos = ",telefono"
    if (req.user.telefonos) emails = ",email"
    if (req.user.empresa == 'TUID' && req.query.empresa){
        if (req.query.empresa){
            empresa = ' and empresa = ?'
            req.par.push(req.query.empresa);
        }
    } else {
        empresa = ' and empresa = ?'
        req.par.push(req.user.empresa);
    }
    req.par.push(ano);
    req.par.push(mes);
    req.q = `select cuil,dni, sexo, nombre,apellido ${emails} ${telefonos} fecha FROM usuario Where 1=1 ${empresa} and year(fecha)= ? and month(fecha) = ?`;
    next();

}