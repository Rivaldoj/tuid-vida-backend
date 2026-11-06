const person = require('../../padron/person');

let queries = {
    "empresa": "select * from usuario_empresa where cuil = ?",
    "contacto": "select COALESCE(c.email1, c.email2) as email, COALESCE(c.celular1, c.celular2, c.celular3) as celular, a.beneficiario as 'Apoderado de' from (select ? as cuil) x left join contactos c on (c.cuil = x.cuil) left join apoderados a on (a.cuil = x.cuil)",
    "beneficiario" : "select b.cuil, bco.banco, ep.sucursal, ep.domicilio,ep.localidad, ep.provincia, b.caja, b.fechaactual, b.fechaproxima from  beneficiario b join entidad_pagadora ep on (b.cuil = ? AND ep.IDEntidad = b.IDEntidad) join banco bco on (bco.IDBanco = ep.IDBanco)"
}

module.exports.getPayments = async (req,res,next) => {
    res.response = {
        "error": 1,
        "message": "Error desconocido"
    };
    if (!req.query.cuil ){
        res.response.message = "Es necesario enviar el CUIL del usuario";
        return res.status(200).json(res.response);
    }
    try {
        const [pagos, empresas, row, contactos] = await Promise.all([
            NEW_MASTER_DB.sync_query(queries['beneficiario'], [req.query.cuil]),
            VIDA_DB.sync_query(queries['empresa'], [req.query.cuil]),
            person.findByCuil(req.query.cuil),
            NEW_MASTER_DB.sync_query(queries['contacto'], [req.query.cuil]),
        ]);
        res.response.pagos = pagos;
        res.response.empresas = empresas;
        res.response.personas = row ? contactos.map((contacto) => ({
            cuil: row.CUIL,
            dni: row.DNI,
            sexo: row.Sexo,
            Nombres: row.Apellido_Nombre,
            FechaNac: row.FechaNac,
            Fallecido: row.Fallecido,
            ...contacto,
        })) : [];
        res.response.error = 0;
        res.response.message = "";
    } catch (err) {
        console.log(err);
        res.response.message = "Error con base de datos";
    }
    return res.status(200).json(res.response);
}
