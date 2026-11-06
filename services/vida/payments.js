const person = require('../padron/person');
const cuilUtil = require('../../utils/cuil');

const PAYMENTS_QUERY = "select if(curdate() >= b.fechaActual, b.fechaProxima, b.fechaActual) as fechaActual, b.cuil, b.fechaProxima , b.caja , b.IDEntidad , b.id  from beneficiario b join entidad_pagadora ep on (ep.IDEntidad = b.IDEntidad) join banco bco on (bco.IDBanco = ep.IDBanco) where b.cuil in (?) and b.fechaProxima > curdate()";

module.exports.getPayments = async (req,res,next) => {
    res.response = {
        "error": 1,
        "message": ""
    };
    // Camino nuevo: por CUIL. Camino anterior (apps viejas y panel admin): DNI + sexo.
    const byCuilParam = req.query.cuil !== undefined && req.query.cuil !== '';
    if (byCuilParam && !cuilUtil.isValid(req.query.cuil)) {
        res.response.message = "El CUIL ingresado no es válido";
        return res.status(200).json(res.response);
    }
    if (!byCuilParam && (!req.query.dni || !['M', 'F'].includes(req.query.sexo))){
       res.response.message = "Es necesario enviar el CUIL del usuario";
       return res.status(200).json(res.response);
    }
    try {
        const people = byCuilParam
            ? [await person.findByCuil(cuilUtil.normalize(req.query.cuil))].filter(Boolean)
            : await person.findPeople(req.query.dni, req.query.sexo);
        const byCuil = new Map(people.map((row) => [String(row.CUIL), row]));
        const docs = byCuil.size > 0 ? await NEW_MASTER_DB.sync_query(PAYMENTS_QUERY, [[...byCuil.keys()]]) : [];
        res.response.error = 0;
        res.response.message = `${docs.length} resultados`;
        res.response.pagos = docs.map(({ cuil, ...payment }) => ({
            fechaActual: `${payment.fechaActual}T03:00:00.000Z`,
            ...person.toMasterPersonColumns(byCuil.get(String(cuil))),
            fechaProxima: `${payment.fechaProxima}T03:00:00.000Z`,
            caja: payment.caja,
            IDEntidad: payment.IDEntidad,
            id: payment.id,
        }));
    } catch (err) {
        console.log(err);
        res.response.message = "Error de conexión con base de datos";
    }
    return res.status(200).json(res.response);
}
