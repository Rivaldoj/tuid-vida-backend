
const tokenizer = require('../../utils/tokenizer');

module.exports = async (req, res, next) => {
    res.response.res = 'error';
    res.response.status = 400;

    // SI EL WHITEBRAND TINEE SETEADO REGISTRAR SIEMPRE AL USUARIO YA SEA 
    // PORQUE REQUIERE PEP ENTONCES SIEMRRE RESPONDER QUE ES UN USUARIO NUEVO
    if(req.client && req.client.alwayRegister){
        return res.status(200).json({ res: 'ok', message: 'Nuevo'});
    }
    
    let query = 'SELECT idUsuario, cuil, nombre, apellido, emailVrf, telefonoVrf, estado from usuarios  WHERE dni = ? and sexo = ? and aplicacion = ? ';
    AUTHENTICATOR_DB.query(query,[req.body.dni,req.body.sexo, req.client.id], function(err,row) { 
        if (err){
            res.response.message = "Error de conexión con base de datos";
            return res.status(res.response.status).json(res.response);  
        }else if (row[0] == undefined){
            res.response.res =  'ok';
            res.response.status = 200;
            res.response.message = 'Nuevo';
            return res.status(res.response.status).json(res.response);  
        }else{
            if(row[0].estado === "Ok"  || row[0].estado == "Verificar"){ //
                //solicitar codigo de validacion
                res.response.res = 'ok';
                res.response.status = 200;
                res.response.message = 'Registrado';
                res.response.estado = row[0].estado;
                res.response.nombre = row[0].nombre;
                res.response.apellido = row[0].apellido;
               // res.response.id = tokenizer.tokenize(row[0]);
            } else if (row[0].estado == "Desaprobado" ){
                res.response.res = 'ok';
                res.response.status = 200;
                res.response.message = 'Desaprobado';
                res.response.estado = row[0].estado;
                res.response.nombre = row[0].nombre;
                res.response.apellido = row[0].apellido;
            } else { 
                res.response.res =  'ok';
                res.response.status = 200;
                res.response.message = 'Nuevo';
            }
            
        } 
        return res.status(res.response.status).json(res.response); 
    });
}; 
