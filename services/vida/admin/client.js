module.exports.getListaNegra = async function(req,res){
    res.response = {
        error: 1,
        data: "Error"
    };
    VIDA_DB.query('SELECT * FROM lista_negra where activo=1 and empresa=(select id_empresa from empresa where desc_empresa=?)',[req.user.empresa], function(err, rows, fields) {
        if (!err) {
            res.response.error = 0;
            res.response.data = rows;
            return res.status(201).json(res.response);
        } else {
            return res.status(200).json(res.response);
        }
    });
}

module.exports.listanegra = async function(err, res){
     res.response = {
        "error": 1,
        "data": ""
    };
    var userData = {
        "dni": req.body.dni,
        "sexo": req.body.sexo,
        "motivo":req.body.motivo
    };
    let query = userData.dni.length === 11? 'SELECT DNI,Sexo,CUIL,Nombres FROM personas WHERE CUIL= ?':'SELECT DNI,Sexo,CUIL,Nombres FROM personas WHERE DNI = ? and Sexo=?';
    VIDA_DB.query(query, [userData.dni ,userData.sexo], function(err, rows, fields) {
        if (rows.length === 0) {
            appData.error = 1;
            appData["data"] = "El cliente no existe";
            res.status(201).json(appData);
        } else {
            res.reponse.data = rows;
            var Nombres = rows[0].Nombres;
            var DNI = rows[0].DNI;
            var Sexo = rows[0].Sexo;
            var CUIL = rows[0].CUIL;
            VIDA_DB.query('SELECT * FROM lista_negra WHERE (DNI = ? and Sexo=?) or CUIL= ? and empresa=(select id_empresa from empresa where desc_empresa=?)', [userData.dni, userData.sexo, userData.dni,req.user.empresa], function (err, result) {
                if (result.length > 0) {
                    VIDA_DB.query('UPDATE lista_negra SET Motivo = ?, Activo=1 where CUIL= ? and empresa=(select id_empresa from empresa where desc_empresa=?)', [userData.motivo, CUIL,req.user.empresa], function (err) {
                        if (!err) {
                            res.response.error = 0;
                            res.response.data = "Usuario bloqueado nuevamente!";
                            return res.status(200).json(res.response);
                        } else {
                            return res.status(201).json(res.response);
                        }
                    })
                } else {
                    VIDA_DB.query('INSERT INTO lista_negra SET CUIL= ?, DNI=?, Sexo=?, Nombres= ?, Motivo=?,Activo=1 and empresa=(select id_empresa from empresa where desc_empresa=?)', [CUIL, DNI, Sexo, Nombres, userData.motivo,req.user.empresa], function (err) {
                        if (!err) {
                            res.response.error = 0;
                            res.response.data = "Usuario bloqueado exitosamente!";
                            return res.status(200).json(res.response);
                        } else {
                            return res.status(201).json(res.response);
                        }
                    })
                }
            })
        }
    })
}

module.exports.deleteListaNegra = async function(req,res){
    res.response = {
        error: 1,
        data: "Error Occured!"
    }
    var id = req.body.id;
    VIDA_DB.query('UPDATE lista_negra SET Activo = 0 where ID= ? and empresa = ?', [id, req.user.empresa], function(err) {
        if (!err) {
            res.response.error = 0;
            res.response.data = "Cliente eliminado de lista negra!";
            return res.status(200).json(res.response);
        } else {
            return res.status(201).json(res.response);
        }
    });
}