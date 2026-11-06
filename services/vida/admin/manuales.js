const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const tuidVidaConfig = CONFIG.get('vida');
const notifications = require('./../../../utils/push');
const bucket =  require('./../../../utils/bucket');
const lodash = require('lodash');

module.exports.list = (req,res,next)=>{
    
    res.response = {
        "error": 1,
        "data": ""
    };
    VIDA_DB.query("select * from manuales order by fecha desc limit 500", [], function(err, docs){
        if (err) return res.status(400).json(res.response);
        res.response.error = "0";
        res.response.data = docs;
        return res.status(200).json(res.response);

    })
}

module.exports.checkImages = (req,res,next)=>{
    res.response = {
        "error": 1,
        "data": "Faltan parametros"
    };

    if (!req.query.document || !req.query.gender)  return res.status(400).json(res.response);
    let namefile = req.query.document + req.query.gender + '_';
    res.response.urls = {
        front : s3.getSignedUrl('getObject', { Bucket: tuidVidaConfig.bucketName , Key: "manual/" + namefile + 'F.jpeg',Expires: 10000000}),
        back : s3.getSignedUrl('getObject', { Bucket: tuidVidaConfig.bucketName , Key: "manual/" + namefile + 'B.jpeg',Expires: 10000000}),
        selfie : s3.getSignedUrl('getObject', { Bucket: tuidVidaConfig.bucketName , Key: "manual/" + namefile + 'S.jpeg',Expires: 10000000})
    }
    res.response.error = "0";
    res.response.data = "Urls";
    return res.status(200).json(res.response);

}

module.exports.accept = (req,res,next)=>{
    res.response = {
        "error": 1,
        "data": ""
    };
    
    
    VIDA_DB.query('select * from manuales where id_usuario = ?',[req.params.idUsuario], async function(err,docs){
        if (err || docs.length == 0){
            console.log(err);
            res.response.data = "No se encontro el registro"
            return res.status(400).json(res.response);
        }
        var usr =  docs[0];
        let exists = await VIDA_DB.sync_query("select * from usuario where dni = ? and sexo = ?", [usr.dni, usr.sexo]);
        if (usr.sexo == "X" ){
            res.response.data = "No se puede aceptar a un usuario no validado"
            return res.status(400).json(res.response);
        }
        if ( exists.length > 0){
            res.response.data = "No se puede aceptar a un usuario ya registrado"
            return res.status(400).json(res.response);
        }
        delete usr.id_usuario; 
        usr.estado = "Ok";
        usr.direccion = "no address";
        usr.extra = `Procesado Semiautomatico por ${req.user.email}`;
        VIDA_DB.query('insert into usuario set ?',[usr], function(err,docs){
            if (err){
                
                res.response.data = "No se puedo copiar usuario"
                return res.status(400).json(res.response);
            }
            let namefile = usr.dni + usr.sexo + '_';
            var error = null;
            let notificar = lodash.after(3,function(){
                if (error){
                    res.response.data = "No se puedo pasar las imagenes"
                    return res.status(400).json(res.response); 
                }
                notifications.send(
                    usr.id_device, 
                    `Felicitaciones! Ya estas registrado`,
                    "Ahora actualiza tu Fe de Vida con 3 pestaneos", 
                    {
                        "action": "life", // url
                        "info": {
                            "document": `${usr.dni}`,
                            "gender": `${usr.sexo}`,
                            "name": `${usr.nombre} ${usr.apellido}`
                        }
                    });
                VIDA_DB.query("delete from manuales where id_usuario = ?", req.params.idUsuario, function(err,doc){})
                //delete de manual
                res.response.error = 0;
                return res.status(200).json(res.response);
            })
            bucket.copyFile(tuidVidaConfig.bucketName,`manual/${namefile}S.jpeg`, `usuarios`,`${namefile}S.jpeg`,function(err){
             
                if (err) error = true;
                notificar();
            })
            bucket.copyFile(tuidVidaConfig.bucketName,`manual/${namefile}B.jpeg`, `usuarios`,`${namefile}B.jpeg`,function(err){

                if (err) error = true;
                notificar();
            })
            bucket.copyFile(tuidVidaConfig.bucketName,`manual/${namefile}F.jpeg`, `usuarios`,`${namefile}F.jpeg`,function(err){

                if (err) error = true;
                notificar();
            })            
        });
    })
}

module.exports.delete = (req,res,next) => {

    res.response = {
        "error": 1,
        "data": ""
    };
    VIDA_DB.query('delete from manuales where id_usuario = ?',[req.params.idUsuario], function(err,docs){
        if (err){
            console.log(err);
            res.response.data = "No se pudo eliminar el registro"
            return res.status(400).json(res.response);
        } 
        res.response.error = "0";
        res.response.data = "Registro eliminado";
        return res.status(200).json(res.response);
    })

}