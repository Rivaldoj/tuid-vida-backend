const tuidVidaConfig = CONFIG.get('vida');
const mail = require('./../../../utils/mail');
const slack  = require('./../../../utils/slack');
const bucket = require('./../../../utils/bucket');
const whatsapp = require('../../../utils/whatsapp');
const AWS = require('aws-sdk');
const s3 = new AWS.S3();
module.exports.list = (req,res,next) => {
    var params = [];
    var fecha = "";
    if(req.query.from){
        fecha = `${fecha} and date(aux.fecha) >= ?`
        params.push(req.query.from);
    }
    if (req.query.to){
        fecha = `${fecha} and date(aux.fecha) <= ?`
        params.push(req.query.to);
    }
    var filter = "0=1";
    if (req.query.rechazados && req.query.rechazados == 1){
        filter = `${filter} or aux.auditor like 'ALERTA%'`
    }else{
        filter = `${filter} or aux.auditor is null`
    }
    var order = 'desc'
    if (req.query.order && req.query.order == 'antiguos'){
        order = 'asc'
    }
    var tipo = ""
    if (req.query.tipo && (req.query.tipo == "registracion" || req.query.tipo == "validacion") ){
        tipo = "and aux.tipo = ?";
        params.push(req.query.tipo);
    }
    
    var q = `select * from 
    (select u.dni, u.sexo, u.cuil, a.empresa, u.nombre, u.apellido, u.empresa empresar,
        if(u.auditor is null || u.auditor like 'ALERTA%','registracion','validacion') as tipo, u.id_usuario, a.id_validacion, a.fecha as fecha_validacion, u.fecha  as fecha_registracion, if(u.auditor is null || u.auditor like 'ALERTA%', u.fecha, a.fecha) as fecha, if(u.auditor is null || u.auditor like 'ALERTA%',u.auditor,a.auditor) as auditor from 
usuario u left join auditoria a on (a.id_usuario = u.id_usuario and a.similitud > 1 and u.auditor is not null and u.auditor not like 'ALERTA%' ) 
) aux
where 1=1 ${fecha} and (${filter}) ${tipo}
order by aux.fecha ${order} limit 100`;
console.log(q);
    VIDA_DB.query(q,params, function(err,rows){
        if (err){ 
            console.log(err);
            return  res.status(400).json(res.response);
        }else{
            res.response.error = 0;
            res.response.data = rows;
            return res.status(200).json(res.response);
        }
    });

}

module.exports.validacionOk = (req,res,next) => {
    res.response = {
        "error": 1,
        "data": "Error al actualizar"
    };

    // obtengo datos del usuario
    VIDA_DB.query("SELECT * from auditoria a join usuario u on u.id_usuario = a.id_usuario where a.id_validacion = ?", [req.params.id_validacion], function(err,docs){
        if (err || docs.length == 0){ 
            console.log(err);
            return  res.status(400).json(res.response);
        }else{
            // actualizo las validaciones
            VIDA_DB.query(`update auditoria set auditor = ? , fechaAuditoria =  date(now()), fecha = IF(fecha > date_sub(now(),interval 7 day), now(), fecha) where id_usuario = ? `,[req.user.email,docs[0].id_usuario], function(err,docs){
                
                if (err){ 
                    return  res.status(400).json(res.response);
                }else{
                    res.response.error = 0;
                    res.response.data = "Actualizado con éxito";
                    return res.status(200).json(res.response);
                }
            });

            if (req.query.update){
                // si hubo una actualización, entonces clono las fotos en la carpeta backup del bucket
                let filename = `${docs[0].dni}${docs[0].sexo}.jpeg`;
                let newFilename = `${docs[0].dni}${docs[0].sexo}_S.jpeg`;
                let backup = `${docs[0].dni}${docs[0].sexo}_${req.params.id_validacion}.jpeg`;
                bucket.copyFile(tuidVidaConfig.bucketName, `usuarios/${newFilename}`,'backup',backup,function(){
                    bucket.copyFile(tuidVidaConfig.bucketName,`login/${filename}`,'usuarios',newFilename,function(err,des){
                        
                    } );
                })
            }
            
            
            
        }
        
    });
    
}

module.exports.validacionAlert = async (req,res,next) => {
    res.response = {
        "error": 1,
        "data": "Error al actualizar"
    };

    let cuil = await VIDA_DB.sync_query('select u.cuil from usuario u join auditoria a on (a.id_usuario = u.id_usuario) where a.id_validacion = ?',[req.params.id_validacion])

    VIDA_DB.query(`UPDATE auditoria set auditor = 'ALERTA:${req.user.email}' where id_validacion = ?`,[req.params.id_validacion], function(err,docs){
        if (err){ 
            console.log(err);
            return  res.status(400).json(res.response);
        }else{
            var comentario = `Posible fraude validacion ${req.params.id_validacion} CUIL: ${cuil[0].cuil} - Detectado por : ${req.user.email}`;
            VIDA_DB.query("insert into alertas (cuil,comentarios, fecha) select u.cuil, ? , now() from usuario u join auditoria a on (a.id_usuario = u.id_usuario) where a.id_validacion = ?",[comentario,req.params.id_validacion], function(err,docs){
                if (err){ 
                    console.log(err);
                    return  res.status(400).json(res.response);
                }else{
                    res.response.error = 0;
                    res.response.data = "Alerta generada con éxito";
                    slack.debug(comentario);
                    let params = {
                        title: comentario,  
                    }
                    mail.send('validationAlert', params, tuidVidaConfig.supportContact ,  [tuidVidaConfig.supportContact] , null);
                    return res.status(200).json(res.response);
                }
            });
        }
    });


   
}

module.exports.sendEmail = async (req,res,next) => {
    res.response = {
        "error": 1,
        "data": "Error al buscar usuario o no tiene mail asociado"
    };
    let user = await VIDA_DB.sync_query("select * from usuario where cuil = ? and email != '' and email is not null", [req.query.cuil]);
    if (user.length == 0) return res.status(200).json(res.response);
    let extra = user[0].extra + " Mail:fraude(" + formatDate(new Date()) + ")";
    let result = await VIDA_DB.sync_query("update usuario set extra = ? where id_usuario = ?", [extra, user[0].id_usuario]);
    let params = {title: 'Tramite de Certificación TuID Vida', nombre : user[0].nombre, cuil : user[0].cuil};
    // STV:  MANDAR MENSAJE POR WHATSAPP : FALTA ACCESO A FACEBOOK
    // if(user[0].telefono){
    //     let msg = "En razón de haber realizado la Certificación TuID Vida y que la misma no reune las normas de calidad y seguridad requeridas su trámite será considerado nulo.";
    //     whatsapp.send(user[0].telefono, msg);
    // }
    mail.send('fraude',params,user[0].email, tuidVidaConfig.supportContact ,  [tuidVidaConfig.supportContact] , null );
    res.response.error = 0;
    res.response.data = "Email enviado";
    return res.status(200).json(res.response);
}

function formatDateHours(mDate){
    const yyyy = mDate.getFullYear();
    let mm = mDate.getMonth() + 1; // Months start at 0!
    let dd = mDate.getDate();
    let hh = mDate.getHours();
    let mins = mDate.getMinutes();

    if (dd < 10) dd = '0' + dd;
    if (mm < 10) mm = '0' + mm;
    if (hh < 10) hh = '0' + hh;
    if (mins < 10) mins = '0' + mins;

    return dd + '/' + mm + '/' + yyyy;
}

module.exports.registracionOk = (req,res,next) => {
    res.response = {
        "error": 1,
        "data": "Error al actualizar"
    };
    VIDA_DB.query("UPDATE usuario set auditor = ? where id_usuario = ?",[req.user.email, req.params.id_usuario], function(err,docs){
        if (err){ 
            console.log(err);
            return  res.status(400).json(res.response);
        }else{
            res.response.error = 0;
            res.response.data = "Actualizado con éxito";
            return res.status(200).json(res.response);
        }
    });
}

module.exports.registracionAlert = async (req,res,next) => {
    res.response = {
        "error": 1,
        "data": "Error al actualizar"
    };
    let cuil = await VIDA_DB.sync_query('select cuil from usuario u where u.id_usuario = ?',[req.params.id_usuario])


    VIDA_DB.query(`UPDATE usuario set auditor = 'ALERTA:${req.user.email}' where id_usuario = ?`,[ req.params.id_usuario], function(err,docs){
        if (err){ 
            return  res.status(400).json(res.response);
        }else{
           var comentario = `Posible fraude registracion ${req.params.id_usuario} CUIL ${cuil} - Detectado por : ${req.user.email}`;
            VIDA_DB.query("insert into alertas (cuil,comentarios, fecha) select cuil, ? , now() from usuario u where u.id_usuario = ?",[comentario,req.params.id_usuario], function(err,docs){
                if (err){ 
                    console.log(err);
                    return  res.status(400).json(res.response);
                }else{
                    res.response.error = 0;
                    res.response.data = "Alerta generada con éxito";
                    slack.debug(comentario);
                    let params = {
                        title: comentario,  
                    }
                    mail.send('validationAlert', params, tuidVidaConfig.supportContact ,  [tuidVidaConfig.supportContact], null);
                    return res.status(200).json(res.response);
                }
            });
        }
    });
}


//TEST STV
function formatDate(date) {
    var d = new Date(date),
        month = '' + (d.getMonth() + 1),
        day = '' + d.getDate(),
        year = '' + d.getFullYear();
        hours = '' + d.getHours(),
        minutes =  '' + d.getMinutes(),
        seconds = '' + d.getSeconds()
    
    if (hours.length < 2) 
        hours = '0' + hours;
    if (minutes.length < 2) 
        minutes = '0' + minutes;
    if (seconds.length < 2) 
        seconds = '0' + seconds;  
    if (month.length < 2) 
        month = '0' + month;
    if (day.length < 2) 
        day = '0' + day;

    return [year + month + day, hours+minutes+seconds].join('_');
}

module.exports.test = async (req,res,next)=>{
    //OBJETIVO : Remplazar servicio que rechaza una validación, clonando fotos en un bucket nuevo, enviando mail de fraude y generando registros en base de datos del rechazo
    /*
    35325041M_B.jpeg : DORSO
    35325041M_F.jpeg : FRENTE
    35325041M_P.jpeg : CARA_DNI
    35325041M_S.jpeg : SELFIE
    */
    console.log("TEST STV STARTED ");
    let id_usuario = 37583;
    let dniSexo = "35325041M";
    
    let tipo_auditoria = "registro"  // registro / validacion
    
    let archivos = [];
    for(let c of ["_S","_F", "_B", "_P"]) archivos.push(dniSexo+c+".jpeg");
    let ruta_destino = "rechazosAuditoria/"+dniSexo;
    let date = formatDate(new Date());
    let nuevos = [];

    console.log("COPIANDO ARCHIVOS");
    for(let archivo of archivos){
        try{
            console.log("COPIANDO ARCHIVO: " + archivo);
            let archivo_destino = date+ "_" + tipo_auditoria + "_" + archivo;
            await bucket.copyFilePromise(tuidVidaConfig.bucketName, `usuarios/${archivo}`,ruta_destino,archivo_destino);
            nuevos.push(s3.getSignedUrl('getObject', {Bucket: tuidVidaConfig.bucketName,Key: ruta_destino+"/"+archivo_destino,Expires: 3600}));
            console.log(archivo + " fue copiado");
        }
        catch(er){
            console.log("ERROR", er);
        }
    }
    console.log("ARCHIVOS COPIADOS!");
    console.log("TEST STV ENDED ");
    return res.status(200).send({
        msg:"TEST",
        date: date,
        tipo_auditoria: tipo_auditoria,
        ruta_destino: ruta_destino,
        archivos: archivos,
        nuevos: nuevos
    });
}
//
