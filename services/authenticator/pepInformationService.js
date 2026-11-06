module.exports.insertIntoPepInfoIffWhiteBrandRequiredMiddelware = function (req, res, next) {
    let whiteBrand = req.client;
    if (whiteBrand && whiteBrand.interceptPepInformation) {
        console.log("Intecepting PEP Information");
        let body = req.body;

        insertPepInformation(whiteBrand.id, body.idDocument.name, body.idDocument.lastname, req.masterData['CUIL'], body.esPep, body.vinculoPep, body.cargoPep, body.esSujetoObligado, body.tipoSujetoObligado)
            .then(data => { console.log("PEP INFORMATION UPDATED!",{ esPep: body.esPep,vinculo: body.vinculoPep, cargo: body.cargoPep, esSujetoObligado: body.esSujetoObligado, tipoSujetoObligado: body.tipoSujetoObligado}) })
            .catch(error => { console.log("ERROR WITH PEP INFORMATION UPDATE", error) })
            .finally(() => { return next() });
    }
    else {
        console.log("PEP NOT INTERCEPTED FROM WHITEBRAND", whiteBrand);
        return next();
    }
}

function insertPepInformation(aplicacion, nombre, apellido, cuil, esPep = false, vinculoPep = "NO INFORMADO", cargoPep = "NO INFORMADO", esSujetoObligado = false, tipoSujetoObligado = "NO INFORMADO") {
    return new Promise(async (resolve, reject) => {
        let query = `INSERT INTO pepinfo (aplicacion, nombre, apellido, cuil, esPep, vinculoPep, cargoPep, esSujetoObligado, tipoSujetoObligado) values (?,?,?,?,?,?,?,?,?)`;
        let params = [aplicacion, nombre, apellido, cuil, esPep, vinculoPep, cargoPep, esSujetoObligado, tipoSujetoObligado];
        AUTHENTICATOR_DB.query(query, params, function (err, row) {
            if (err) {
                console.log("ERROR INSERTING PEP INFORMATION", err);
                return reject("Error de conexión con base de datos");
            }
            return resolve();
        });
    });
}

// se llama a esta funcion al momento de enviar el webhook al cliente
module.exports.getPepDataFromBodyRequest = function (req) {
    if (req.client && req.client.interceptPepInformation === true) {
        let pepData = {
            esPep: req.body.esPep || false,
            vinculoPep: req.body.vinculoPep || "NO INFORMADO",
            cargoPep: req.body.cargoPep || "NO INFORMADO",
            esSujetoObligado: req.body.esSujetoObligado || "NO INFORMADO",
            tipoSujetoObligado:  req.body.tipoSujetoObligado || "NO INFORMADO"
        };


        // como las apps manejan strings para el tipo de sujeto obligado hago un parche para buscar el string
        // { id : , descripcion : }
        if(req.client.meta && req.client.meta.tiposSujetosObligados){
            let list = req.client.meta.tiposSujetosObligados;
            if(list.length>0){
                if(typeof list[0] === 'object'){
                    pepData.tipoSujetoObligado = list.find(x=> x.descripcion === req.body.tipoSujetoObligado) || { id: -1, descripcion: "NO INFORMADO"}
                }
            }
        }
        return pepData;
    }
    return null;
}


module.exports.getPepDataFromDB = function (req, res, next) {
    AUTHENTICATOR_DB.query('select * from pepinfo where cuil = ? and aplicacion = ? order by id desc limit 1', [req.user.cuil, req.client.id], function (err, result) {
        if (err) {
            return res.status(200).json({status: 400, res: 'error', message: 'Error de conexión con base de datos'});
        }

        req.pepData = {
            esPep: false,
            vinculoPep: "NO INFORMADO",
            cargoPep: "NO INFORMADO",
            esSujetoObligado: false,
            tipoSujetoObligado: "NO INFORMADO"
        };
        console.log("result",result[0]);

        if (result[0]) { // hay info cargada
            req.pepData = {
                esPep: result[0].esPep ? true : false,
                vinculoPep: result[0].vinculoPep || "NO INFORMADO",
                cargoPep: result[0].cargoPep || "NO INFORMADO",
                esSujetoObligado: result[0].esSujetoObligado ? true : false,
                tipoSujetoObligado: result[0].tipoSujetoObligado || "NO INFORMADO"
            }
            if(req.client.meta && req.client.meta.tiposSujetosObligados){ //el cliente tiene cargada la configuracion de tipos de sujetos obligados
                let list = req.client.meta.tiposSujetosObligados;
                if(list.length>0){
                    if(typeof list[0] === 'object'){
                        req.pepData.tipoSujetoObligado = list.find(x=> x.descripcion === req.pepData.tipoSujetoObligado) || { id: -1, descripcion: "NO INFORMADO"}
                    }
                }
            }

        }
        console.log("req.pepData", req.pepData);
        next();
    });
}