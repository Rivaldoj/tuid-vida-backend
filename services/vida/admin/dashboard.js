
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

// GET /auth/reports/dashboard/informe?ano=2026&mes=11&empresa=<ID>
// Informe mensual por empresa para el PDF del Dashboard: las registraciones del mes (tabla usuario) y las certificaciones del mes (tabla auditoria,
// las mismas que cuentan los graficos: similitud > 1, una por persona: la ultima del mes). Una empresa comun solo ve la suya;
// el Administrador de TUID elige una empresa o "TUID" para ver todas (una seccion por empresa).
module.exports.informeMensual = async (req, res) => {
    const responder = (error, data) => res.status(200).json({ error, data });
    const ano = parseInt(req.query.ano, 10);
    const mes = parseInt(req.query.mes, 10);
    if (!(ano >= 2000 && ano <= 2100) || !(mes >= 1 && mes <= 12)) return responder(1, 'Mes o año inválido');
    let empresa = req.user.empresa;
    if (req.user.empresa == 'TUID' && req.query.empresa) empresa = String(req.query.empresa);
    const todas = empresa === 'TUID';
    try {
        const filtroU = todas ? '' : ' AND u.empresa = ?';
        const filtroA = todas ? '' : ' AND empresa = ?';
        const parU = todas ? [ano, mes] : [ano, mes, empresa];
        const regs = await VIDA_DB.sync_query(
            `SELECT u.empresa, u.cuil, TRIM(CONCAT(IFNULL(u.nombre, ''), ' ', IFNULL(u.apellido, ''))) AS nombre, u.fecha, u.similitud
             FROM usuario u WHERE year(u.fecha) = ? AND month(u.fecha) = ?${filtroU} ORDER BY u.empresa, u.fecha`, parU);
        const certs = await VIDA_DB.sync_query(
            `SELECT a.empresa, u.cuil, TRIM(CONCAT(IFNULL(u.nombre, ''), ' ', IFNULL(u.apellido, ''))) AS nombre, a.fecha, a.similitud
             FROM auditoria a
             JOIN (SELECT MAX(id_validacion) AS idv FROM auditoria WHERE similitud > 1 AND year(fecha) = ? AND month(fecha) = ?${filtroA} GROUP BY id_usuario, empresa) l ON l.idv = a.id_validacion
             JOIN usuario u ON u.id_usuario = a.id_usuario ORDER BY a.empresa, a.fecha`, parU);
        const porEmpresa = {};
        const nombreEmpresa = (e) => e || 'Sin empresa';
        const seccion = (e) => porEmpresa[nombreEmpresa(e)] || (porEmpresa[nombreEmpresa(e)] = { empresa: nombreEmpresa(e), registraciones: [], certificaciones: [] });
        const fila = (r) => ({ cuil: r.cuil == null ? '' : String(r.cuil), nombre: r.nombre || '', fecha: r.fecha == null ? '' : String(r.fecha), similitud: r.similitud == null ? null : Number(r.similitud) });
        regs.forEach((r) => seccion(r.empresa).registraciones.push(fila(r)));
        certs.forEach((r) => seccion(r.empresa).certificaciones.push(fila(r)));
        if (!todas) seccion(empresa); // la empresa pedida aparece aunque no tenga movimientos
        const empresas = Object.keys(porEmpresa).sort().map((k) => porEmpresa[k]);
        return responder(0, { ano, mes, empresa: todas ? 'TUID' : empresa, todas, empresas });
    } catch (err) {
        console.log(err);
        return responder(1, 'No se pudo armar el informe');
    }
};
