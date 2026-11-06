const person = require('../../padron/person');

module.exports.fechaPago = async (req, res, next) => {
    if (!req.query.cuil || req.query.cuil < 1){
        res.response.data = "Debe ingresar DNI";
        return res.status(400).json(res.response);
    }

    res.response.error = 1;
    res.response.data = "Error de conexión con la base de datos";
    let query = "select * from beneficiario be join entidad_pagadora ep on (be.cuil = ? and be.IDEntidad = ep.IDEntidad) join banco b on (b.IDBanco = ep.IDBanco)";
    try {
        const results = await NEW_MASTER_DB.sync_query(query, [req.query.cuil]);
        res.response.documents = results;
        res.response.error = 0;
        res.response.data = `Resultados encontrados ${results.length}`;
        return res.status(200).json(res.response);
    } catch (error) {
        console.log(error);
        return res.status(400).json(res.response);
    }
}

module.exports.getDni = async (req, res, next) => {
    if (!req.query.dni || req.query.dni < 1){
        res.response.data = "Debe ingresar DNI";
        return res.status(400).json(res.response);
    }

    res.response.error = 1;
    res.response.data = "Error desconocido";
    const genero = ['M', 'F'].includes(req.query.genero) ? req.query.genero : undefined;
    try {
        const rows = await person.findPeople(req.query.dni, genero);
        res.response.documents = rows.map(person.toMasterPersonColumns);
        res.response.error = 0;
        res.response.data = `Resultados encontrados ${res.response.documents.length}`;
        return res.status(200).json(res.response);
    } catch (error) {
        console.log(error);
        res.response.data = "Error de conexión con base de datos";
        return res.status(400).json(res.response);
    }
}
