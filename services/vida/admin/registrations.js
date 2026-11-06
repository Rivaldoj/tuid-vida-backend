const bucket = require('../../../utils/bucket');
const AWS = require('aws-sdk');
const s3 = new AWS.S3();
var Zip = require('node-zip');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const tuidVidaConfig = CONFIG.get('vida');
const lodash = require('lodash');
const path = require('path');
const { Parser } = require('json2csv');
const fs = require('fs');
var rekognition = new AWS.Rekognition();
var dbr = require('dynamsoft-javascript-barcode');
var Bucket = tuidVidaConfig.bucketName;
var levenshtein = require('fast-levenshtein');
const person = require('../../padron/person');

var newQueries = {
    "admin": `
    SELECT u.extra, u.id_usuario, u.dni,u.sexo , u.auditor as auditorRegistro, u.telefono, u.email ,u.cuil,u.nombre,u.fecha_fallecido, u.apellido,u.fecha,u.similitud,u.notificaciones,u.estado,ue.empresa, ue.fecha_recordatorio, ue.proxima, ue.notificacion,a.afecha as fecha_valida, u.ultima_notificacion, u.os, u.version,
    if (e.tipo = 'D',
    if(
    date(a.afecha) is null || DATEDIFF(NOW(),DATE(a.afecha)) > e.periodicidad * 30 ,
    'PENDING','OK'),
    if(now() > date(ue.fecha_recordatorio),
    if(date(a.afecha) >= date(ue.fecha_recordatorio),if(date(a.afecha) > date(ue.notificacion),
    'LATE','OK'),
    'PENDING'),
    'OK')) as status,
    if (e.tipo = 'D', if (a.afecha is not null, date(DATE_ADD(a.afecha, INTERVAL e.periodicidad * 30 DAY)),null),null) as validez,
    if (e.tipo = 'D', if (a.afecha is not null, date(DATE_ADD(a.afecha, INTERVAL e.periodicidad * 30 DAY)),now()) , proxima) as next
    FROM usuario u 
    left join usuario_empresa ue on (u.cuil = ue.cuil) left join empresa e on (e.id = ue.empresa) 
    left join (Select a.id_usuario, max(a.fecha)as afecha, a.empresa from auditoria a join usuario u on (u.id_usuario = a.id_usuario) 
    where a.similitud > 1 group by a.id_usuario, a.empresa) as a on (u.id_usuario = a.id_usuario and a.empresa = e.id) 
    where 1=1 `,
}

let tuidQuery = newQueries.admin;


/*`SELECT u.telefono, u.email ,u.cuil,u.nombre,u.fecha_fallecido, u.apellido,u.fecha,u.similitud,u.notificaciones,u.estado,ue.empresa, ue.fecha_recordatorio, ue.proxima, ue.notificacion,u.fecha_valida, u.ultima_notificacion, u.os, u.version,
if (ue.empresa = 'EFECTIVO SI', 
    if(now() > date(ue.notificacion), if(date(u.fecha_valida) >= date(ue.notificacion),'OK','PENDING'), if(date(u.fecha_valida) >= date(ue.fecha_recordatorio), 'OK','PENDING')),
    if(now() > date(ue.fecha_recordatorio), if(date(u.fecha_valida) >= date(ue.fecha_recordatorio),if(date(u.fecha_valida) > date(ue.notificacion),'LATE','OK'),'PENDING'),'OK')
) as status,
if (ue.empresa = 'EFECTIVO SI' && now() > date(ue.notificacion) ,  if (u.fecha_valida is not null, date(DATE_ADD(u.fecha_valida, INTERVAL ${daysES} DAY)),ue.proxima ) , null) as validez,  
if (ue.empresa = 'EFECTIVO SI', notificacion, proxima) as next
FROM usuario u left join usuario_empresa ue on (u.cuil = ue.cuil) where u.similitud > 1  `;
*/


module.exports.search = async (req,res,next)=>{
    res.response = {
        "error": 1,
        "data": ""
    };
    var dni = req.query.dni;
    var sexo = req.query.sexo ;
    let query;
    if (isNaN(dni) === false){
        if(req.user.empresa === 'TUID'){
            query = `${tuidQuery} and (( u.dni  like '${dni}%' and u.sexo= ? ) or u.cuil  like '${dni}%' or telefono  like '%${dni}' ) `;
        }else{
            query = 'SELECT  u.cuil,u.nombre, u.apellido,u.fecha,u.similitud,u.notificaciones,u.fecha_fallecido, u.estado,ue.empresa,u.fecha_valida FROM usuario u left join usuario_empresa ue on (u.cuil = ue.cuil) where ue.empresa="' + req.user.empresa + '" and (( u.dni  like "'+ dni +'%" and u.sexo=?) or u.cuil  like "' + dni + '%") and u.similitud > 1 ';
        }
    } else if (dni){
        if(req.user.empresa === 'TUID') {
            query = `${tuidQuery} and ( u.nombre  like '%${dni}%' or u.apellido  like '%${dni}%' or telefono  like '%${dni}' ) `;
        }else{
            query = 'SELECT u.cuil,u.nombre, u.apellido,u.fecha,u.similitud,u.notificaciones,u.fecha_fallecido, u.estado,ue.empresa,u.fecha_valida FROM usuario u left join usuario_empresa ue on (u.cuil = ue.cuil) where ue.empresa="' + req.user.empresa + '" and ( u.nombre  like "%' + dni + '%" or u.apellido  like "%'+ dni +'%") and u.similitud > 1 ';
        }
    }else{
        if(req.user.empresa === 'TUID') {
            query = `${tuidQuery}`;
        }else{
            query = 'SELECT u.cuil,u.nombre, u.apellido,u.fecha,u.similitud,u.notificaciones,u.fecha_fallecido, u.estado,ue.empresa,u.fecha_valida FROM usuario u left join usuario_empresa ue on (u.cuil = ue.cuil) where ue.empresa="' + req.user.empresa + '" and u.similitud > 1 ';
        }
    }
  
    var alert = "";
    if (req.query.alerts){ alert = " and u.auditor like 'ALERTA%' "};
    query = `${query} ${alert} order by u.id_usuario desc`;

    VIDA_DB.query(query, [sexo], function(err,rows) {
        if (!err) {
            if (rows.length>0) {
                res.response.error = 0;
                res.response.data = rows;
                res.status(200).json(res.response);
            } else{
                res.response.error = 1;
                res.response.data = "No se encontraron resultados";
                res.status(201).json(res.response);
            }
        } else {
            res.response.error = 1;
            res.response.data = "Error Occured!";
            res.status(201).json(res.response);
        }
    });
}

module.exports.pendingReport = async (req,res,next)=>{
    req.q = `select * from (${tuidQuery} order by u.id_usuario) aux where aux.status = 'PENDING' and aux.fecha_fallecido is null `;
    req.par = [];
    next();
}

module.exports.sendReport = async (req,res,next)=>{
    res.response = {
        "error": 1,
        "data": ""
    };

    VIDA_DB.query(req.q, req.par , function (error, results) {
        console.log(error);
        if (error) return res.status(200).json(res.response);
        if (results.length < 1) res.status(201).json(res.response);
        const json2csv = new Parser();
        const csv = json2csv.parse(results);
        res.header('Content-Type', 'text/csv');
        let date = new Date();
        let name = `${req.params.reportId}_${date.toISOString()}`;
        res.attachment(`${name}.csv`);
        return res.send(csv);
    }); 
}
module.exports.images = async (req,res,next)=>{
    var ruta = '';
    res.response = {
        "error": 1,
        "data": ""
    };

    var cuil = req.query.cuil || req.headers['cuil'];
    VIDA_DB.query('select u.dni, u.sexo, u.email, u.telefono, u.estado, u.fecha_valida from usuario u where u.cuil=?', [cuil], function (err, row, fields) {
        if (err || row.length == 0 ){
            res.response.data = "No data found";
            return res.status(200).json(res.response);
        }
        if(row[0].estado === 'Ok' || row[0].estado === 'Confirmacion'|| row[0].estado === 'Verificar'){
            ruta = 'usuarios/';
        }else{
            ruta = 'temp/';
        }

        res.response = {
            res: 'ok',
            error: 0,
            status: 200,
            message: 'ok',
            email: row[0].email,
            telefono: row[0].telefono,
            fecha: row[0].fecha_valida
        };

        res.response.frente = s3.getSignedUrl('getObject', {
            Bucket: tuidVidaConfig.bucketName,
            Key: ruta   + row[0].dni + row[0].sexo + "_F.jpeg",
            Expires: 3600
        });
    
        res.response.dorso = s3.getSignedUrl('getObject', {
            Bucket: tuidVidaConfig.bucketName,
            Key: ruta   + row[0].dni + row[0].sexo + "_B.jpeg",
            Expires: 3600
        });
        res.response.photo = s3.getSignedUrl('getObject', {
            Bucket: tuidVidaConfig.bucketName,
            Key: ruta  + row[0].dni + row[0].sexo + "_P.jpeg",
           Expires: 3600
        });
        res.response.selfie = s3.getSignedUrl('getObject', {
            Bucket: tuidVidaConfig.bucketName,
            Key: ruta   + row[0].dni + row[0].sexo + "_S.jpeg",
            Expires: 3600
        });

        res.response.login = s3.getSignedUrl('getObject', {
            Bucket: tuidVidaConfig.bucketName,
            Key: "login/" + row[0].dni + row[0].sexo + ".jpeg",
            Expires: 3600
        });
        return res.status(200).json(res.response);
    });
}

module.exports.get = async (req,res, next) => {

    let query = req.user.empresa ===  'TUID'?`${tuidQuery} order by u.id_usuario desc limit 500`:'SELECT u.cuil,u.nombre, u.apellido,u.fecha,u.similitud,u.estado,ue.empresa,u.fecha_valida, u.notificaciones FROM usuario u left join tuid_vida.usuario_empresa ue on (u.cuil = ue.cuil) where ue.empresa = ? order by u.id_usuario desc limit 500';
    VIDA_DB.query(query,[req.user.empresa], function(err, rows, fields) {
        if (!err) {
            res.response.error = 0;
            res.response.data= rows;
            res.status(200).json(res.response);
        } else {
            res.response.error = 1;
            res.response.data = "No data found";
            console.log(err);
            res.status(201).json(res.response);
        }
    });
}


module.exports.updateExtra = async(req,res,next)=> {
    VIDA_DB.query("update usuario set extra = ? where id_usuario = ?", [ req.body.text,req.params.idUsuario], function(err,rows) {
        return res.status(200).json(rows);
    })
}

module.exports.downloadRegisters = async (req,res, next) => {
   res.response = {
        "error": 1,
        "data": ""
    };
    const csvWriter = createCsvWriter({
        path: './uploads/' + req.user.empresa + '.csv',
        header: [
            {id: 'cuil', title: 'Cuil'},
            {id: 'nombre', title: 'Nombre'},
            {id: 'apellido', title: 'Apellido'},
            {id: 'fecha', title: 'Fecha'},
            {id: 'similitud', title: 'Similitud'},
            {id: 'estado', title: 'Estado'},
        ]
    });

    let query =  'SELECT u.cuil,u.nombre, u.apellido,u.fecha,u.similitud,u.estado FROM usuario u left join tuid_vida.usuario_empresa ue on (u.cuil = ue.cuil) where ue.empresa = ? order by u.id_usuario';
    VIDA_DB.query(query, [req.user.empresa], function(err,rows) {
        if (err|| rows.length === 0) {
            res.response.data = "No se encontraron resultados";
            res.status(201).json(res.response);
        } else {
            var zip = new Zip;
            csvWriter.writeRecords(rows).then(()=> {
                zip.file(req.user.empresa  + '.csv', fs.readFileSync('./uploads/' + req.user.empresa  + '.csv'));
                var options = {base64: false, compression:'DEFLATE'};
                fs.writeFile('./uploads/'+ req.user.empresa +'.zip',zip.generate(options), 'binary', function (error) {
                    if (error) {
                        res.response.data = "No se encontraron resultados";
                        res.status(201).json(res.response);
                    } else {
                        res.download('./uploads/' + req.user.empresa + '.zip');
                    }
                });
            });
        }
    });

}

module.exports.download = async (req,res,next)=> {
    res.response = {
        "error": 1,
        "data": ""
    };

    var dia = req.query.dia || req.headers['dia'];
    var ano = req.query.ano || req.headers['ano'];
    var mes = req.query.mes || req.headers['mes'];

    ano = parseInt(ano, 10);
    mes = parseInt(mes, 10);
    dia = parseInt(dia, 10);
    const csvWriter = createCsvWriter({
        path: './uploads/' + req.user.empresa + ano + '_'+ mes + '.csv',
        header: [
            {id: 'cuil', title: 'Cuil'},
            {id: 'fecha', title: 'Fecha'},
            {id: 'similitud', title: 'Similitud'},
            {id: 'id_usuario', title: 'ID'},
        ]
    });
    let query = dia === 0?  'select * from(select u.cuil, a.fecha,a.similitud,a.id_usuario FROM auditoria a join usuario u on (a.id_usuario = u.id_usuario) Where month(a.Fecha)=? and year(a.Fecha)=? and u.empresa=? and a.similitud > 1 order by id_validacion desc) AS t1 group by cuil':'select * from(select u.cuil, a.fecha,a.similitud,a.id_usuario FROM auditoria a join usuario u on (a.id_usuario = u.id_usuario) Where month(a.Fecha)=? and year(a.Fecha)=? and u.empresa=? and day(a.Fecha)=? and a.similitud > 1 order by id_validacion desc) AS t1 group by cuil';
    VIDA_DB.query(query, [mes,ano,req.user.empresa,dia], function(err,rows) {
        if (err|| rows.length === 0) {
            res.response.data = "No se encontraron resultados";
            res.status(201).json(res.response);
        } else {
            var zip = new Zip;
            csvWriter.writeRecords(rows).then(()=> {
                zip.file(req.user.empresa  + ano + '_'+ mes + '.csv', fs.readFileSync('./uploads/' + req.user.empresa  + ano + '_'+ mes + '.csv'));
                var options = {base64: false, compression:'DEFLATE'};
                fs.writeFile('./uploads/'+ ano + '_' + mes +'.zip',zip.generate(options), 'binary', function (error) {
                    if (error) {
                        res.response.error = 1;
                        res.response.data = "No se encontraron resultados";
                        res.status(201).json(res.response);
                    } else {
                        //res.setHeader('Content-disposition', 'attachment; filename=test1.zip');
                        res.download('./uploads/' + ano + '_' + mes + '.zip');
                    }
                });
            });
        }
    });

}

module.exports.manuallyRegister = async (req,res,next)=>{

    var info = req.body;
    var front = info.front;
    var back = info.back;
    var selfie = info.selfie;
    var email = info.email;
    var docForced = false;
   
    var telefono = null;
    var datos = [];
    if (info.telefono && info.telefono.substring(0,3)=='TID'){
        datos = info.telefono.replace('TID','').split('@');
        if (datos.length > 3) docForced = true;
        
    }else{
        telefono = info.telefono;
    }
    
    var documento;
    res.response = {
        "res": "ok",
        "data": ""
    };
    var pdf417;
    var facedetect;
    var dni;
    var sexo;
    var name;
    var last_name;
    var similitud;
    
    decode_base64(front,"front.jpg", function (err) {
        if (err){
            console.log(err);
            throw err;
        }
    });
    dbr.BarcodeReader.productKeys = 't0172ZQYAAFObiibGORJka+dRy+U+95a5oyPW4rddS04p+bMt3w0iO2odxoLi6lk5asbgCXDfcuDRQn+Pgl2xVmK+zmCDhVW+We9N42/2t8noG4HGoCnQHIYChgKGAoYChgKGAoYChgKGAoYGhgaGBoYGhgaGBoYGhgaGBoYFDAsYFjAsYFjAsIBhAcMChv3u66f2hqCpvsnoGp9VZ9g0Ao1BU7+bmQtlT78B4n5DWw==';
    var ruta = './uploads/front.jpg';

    var done = lodash.after(1, function () {
        var textback;
        var comprobacion;
        var compare = lodash.after(3, function () {
            var fin = lodash.after(4, function () {
                if(res.response.res === 'error'){
                    return res.json(res.response);
                }else{
                    var params = {
                        CollectionId: "tuidvida",
                        DetectionAttributes: [],
                        ExternalImageId: dni + sexo,
                        Image: {
                            S3Object: {
                                Bucket: "validador-de-id",
                                Name: "temp/" + dni + sexo + "_S.jpeg"
                            }
                        }
                    };
                    rekognition.indexFaces(params, function (err, data) {
                        if (err) {
                            res.response.res = 'error';
                            res.response.message = 'No se pudo finalizar el registro';
                            res.response.details = err;
                            return res.status(res.response.status).json(res.response);
                        }
                        else {
                            moveimg(dni,sexo,function () {});
                            putResult(documento, sexo, name, last_name,cuil,similitud,direccion,req.user,email,telefono, function (err, result) {
                                if (err) {
                                    res.response.res = 'error';
                                    res.response.message = 'No se pudo crear el registro de usuario';
                                    res.response.details = err;
                                    return res.json(res.response);
                                }else{
                                    res.response = {
                                        res: 'ok',
                                        status: 200,
                                        message: 'Aprobado',
                                        documento: documento
                                    };
                                    return res.json(res.response);
                                }
                            });
                        }
                    });
                }
            });
            var params1 = {
                Image: { /* required */
                    S3Object: {
                        Bucket: Bucket,
                        Name: "temp/" + facedetect
                    }
                }
            };
            rekognition.detectText(params1, function (err, data) {
                if (err) {
                    return res.json(err);
                } else {
                    console.log('Comienzo escaneo dorso del dni');
                    data.TextDetections.forEach(function (textdetection) {
                        textback = textback + ' ' + textdetection.DetectedText;
                    });
                    var apellido = documento.apellido.replace(/ /g,"<");
                    comprobacion = comprobacion * textback.search(apellido);
                    comprobacion = comprobacion * textback.search(documento.dni);

                    if (comprobacion < 0) {
                        res.response.res = 'error';
                        res.response.message = 'No se puede comprobar la integridad del documento';
                        res.response.documento = documento;
                        console.log('fina1');
                        fin();
                    } else {
                        res.response.res = 'ok';
                        direccion = data.TextDetections[0].DetectedText + data.TextDetections[1].DetectedText + data.TextDetections[3].DetectedText;
                        console.log('fina2');
                        fin();
                    }
                }        // successful response
            });
            var params2 = {
                SimilarityThreshold: 1,
                SourceImage: {
                    S3Object: {
                        Bucket: Bucket,
                        Name: "temp/" + documento.dni + documento.sexo + "_F.jpeg"
                    }
                },
                TargetImage: {
                    S3Object: {
                        Bucket: Bucket,
                        Name: "temp/" + documento.dni + documento.sexo + "_S.jpeg"
                    }
                }
            };
            rekognition.compareFaces(params2, function (err, data) {
                if (err) {
                    res.response = {
                        res: 'error',
                        status: 200,
                        message: 'Error en la comparacion',
                        details: err,
                    };
                    return res.json(res.response);
                } // an error occurred
                else {
                    if (data.FaceMatches.length > 0) {
                        similitud = data.FaceMatches[0].Similarity;
                        if (similitud < tuidVidaConfig.manuallyPercentage) {
                            res.response = {
                                res: 'error',
                                status: 200,
                                message: `Los datos biometricos no coinciden. Coincidencia : ${similitud}`
                            };
                            return res.status(res.response.status).json(res.response);
                        } else {
                            console.log('Comparacion Biometrica');
                            console.log('finb');
                            fin();
                        }
                    }else if (data.FaceMatches.length == 0){
                        res.response = {
                            res: 'error',
                            status: 200,
                            message: `Los datos biometricos no coinciden. No se identifico la cara`
                        };
                        return res.status(res.response.status).json(res.response);
                    }
                }
            });
            Clientehabilitado (dni,sexo, function (err, result) {
                if (err) {
                    res.response = {
                        res: 'error',
                        status: 200,
                        message: err,
                    };
                    return res.status(res.response.status).json(res.response);
                } else {
                    console.log('finc');
                    fin();
                }
            });
            getData(dni, sexo, function (err, result) {
                if (err) {
                    res.response = {
                        res: 'error',
                        status: 200,
                        message: err.message,
                        details : err.details
                    };
                    fin();
                } else  {
                    cuil = result['CUIL'];
                    nombre = result['Nombres'];

                    name = name.replace(/nxx/gi, "n");
                    last_name = last_name.replace(/nxx/gi, "n");
                    name = name.replace("'", " ");
                    last_name = last_name.replace("'", " ");
                    name = name.replace(/ñ/gi, "n");
                    last_name = last_name.replace(/ñ/gi, "n");
                    name = name.toUpperCase();
                    last_name = last_name.toUpperCase();
                    name = name.replace(/  /g, " ");
                    last_name = last_name.replace(/  /g, " ");

                    var count = (nombre.match(/�/g) || []).length;
                    if (count !== 0) count = count + (nombre.match(/,/g) || []).length + 1;
                    var distance = levenshtein.get(nombre, last_name + ' ' + name);

                    if ((nombre.toUpperCase().indexOf(last_name) !== -1) || distance < count) {
                        console.log('find1');
                        fin();
                    }else{
                        res.response = {
                            res: 'error',
                            status: 200,
                            message: 'Los datos del DNI no coinciden con nuestra base de datos'
                        };
                        console.log('find2');
                        fin();
                    }
                }
            });
        });
        upload(front, documento.dni + documento.sexo + '_F.jpeg', function (err, result) {
            if (err) {
                res.response.res = 'error';
                res.response.message = 'No pudo subir la imagen del selfie';
                res.response.details = err;
                return res.json(res.response);
            } else {
                compare();
            }
        });
        upload(back, documento.dni + documento.sexo + '_B.jpeg', function (err, result) {
            if (err) {
                res.response.res = 'error';
                res.response.message = 'No pudo subir la imagen del dorso del dni';
                res.response.details = err;
                return res.json(res.response);
            } else {
                compare();
            }
        });
        upload(selfie, documento.dni + documento.sexo + '_S.jpeg', function (err, result) {
            if (err) {
                res.response.res = 'error';
                res.response.message = 'No pudo subir la selfie';
                res.response.details = err;
                return res.json(res.response);
            } else {
                compare();
            }
        });
    });
    fs.readFile(ruta, function (err, data) {
        dbr.BarcodeReader.createInstance().then(reader => {
            let settings = reader.getRuntimeSettings();
            settings.localizationModes = [2,0,0,0,0,0,0,0];
            settings.deblurLevel = 9;
            reader.updateRuntimeSettings(settings);
            reader.decode(data).then(results => {
                if (results.length > 0){
                    pdf417 = results[0].BarcodeText.replace(/\uFFFD/g, '').split('@');
                    reader.destroy();
                    if (docForced){
                        documento.dni = datos[0];
                        documento.sexo = datos[1];
                        documento.apellido = datos[2];
                        documento.nombre = datos[3];
                        documento.tramite = null;
                        documento.fechaNac = null;
                        documento.fechaexp = null;
                        documento.tipo = null;
                        
                    }else{
                        documento = {
                            tramite: pdf417[0],
                            apellido:pdf417[1],
                            nombre:  pdf417[2],
                            sexo:    pdf417[3],
                            dni:     pdf417[4],
                            tipo:    pdf417[5],
                            fechaNac:convert(pdf417[6]),
                            fechaexp:pdf417[7]
                        };
                    }
                    
                    
                    documento.dni = cleanDoc(documento.dni);
                    dni=documento.dni;
                    sexo=documento.sexo;
                    name= documento.nombre;
                    last_name= documento.apellido;
                    facedetect = dni + sexo + '_B.jpeg';
                    console.log('Escaneo frente del dni');
                    done();
                } else {
                    decode_base64(back,"back.jpg", function (err) {
                        if (err) throw error;
                    });
                    ruta = './uploads/back.jpg';
                    fs.readFile(ruta, function (err, data) {
                        dbr.BarcodeReader.createInstance().then(reader => {
                            /*let settings = reader.getRuntimeSettings();
                            settings.localizationModes = [2,0,0,0,0,0,0,0];
                            settings.deblurLevel = 9;
                            reader.updateRuntimeSettings(settings);
                            */reader.decode(data).then(results => {
                                if (results.length > 0) {
                                    pdf417 = results[0].BarcodeText.replace(/\uFFFD/g, '').split('@');
                                    reader.destroy();
                                    if (docForced){
                                        documento.dni = datos[0];
                                        documento.sexo = datos[1];
                                        documento.apellido = datos[2];
                                        documento.nombre = datos[3];
                                        documento.tramite = null;
                                        documento.fechaNac = null;
                                        documento.fechaexp = null;
                                        documento.tipo = null;
                                    }else{
                                        documento = {
                                            tramite: pdf417[10],
                                            apellido:pdf417[4],
                                            nombre:  pdf417[5],
                                            sexo:    pdf417[8],
                                            dni:     pdf417[1],
                                            tipo:    pdf417[2],
                                            fechaNac:convert(pdf417[7]),
                                            fechaexp:pdf417[9],
                                            cuil:    pdf417[3]
                                        };
                                        
                                    }
                                    
                                    documento.dni = cleanDoc(documento.dni);
                                    dni=documento.dni;
                                    sexo=documento.sexo;
                                    name= documento.nombre;
                                    last_name=documento.apellido;
                                    facedetect = dni + sexo + '_F.jpeg';
                                    console.log('Escaneo frente del dni');
                                    done();
                                }else{
                                    appData = {
                                        res: 'error',
                                        status: 200,
                                        message: 'No se reconoce el documento, pruebe subir una foto de mayor calidad'
                                    };
                                    return res.json(appData);
                                }
                            });
                        });
                    });
                }
            }).catch(E=>{
                console.log(E);
                appData = {
                    res: 'error',
                    status: 200,
                    message: `Error en la lectura del PDF, asegurese que la imagen no sea muy pesada. ${JSON.stringify(E)}`
                };
                return res.json(appData);
            });
        }).catch(e=>{
            appData = {
                res: 'error',
                status: 200,
                message: 'Error en la lectura del PDF, asegurese que la imagen no sea muy pesada'
            };
            return res.json(appData);
        });
    });
    function upload (base64,filename,next){
        var ruta = './uploads/'+filename;
        decode_base64(base64,filename, function (err) {
            if(err) throw err;
            var myBucket = Bucket + '/temp';
            fs.readFile(ruta, function (err, data) {
                if (err) {
                    throw err;
                }
                var params = {Bucket: myBucket, Key: filename, Body: data};
                s3.putObject(params, function (err, data) {
                    if (err) {
                        fs.unlink(ruta, (err) => {
                            if (err) throw err;
                        });
                        next(err);
                    } else {
                        fs.unlink(ruta, (err) => {
                            if (err) throw err;
                        });
                        next();
                    }
                });
            });
        });
    }
}




function decode_base64(base64str , filename, next){

    var buf = Buffer.from(base64str,'base64');
    let pt = path.join(APP_PATH,'/uploads/',filename);
    console.log(pt);
    fs.writeFile(pt, buf, function(error){
        if(error){
            next(error) ;
        }else{
            console.log('File created from base64 string!');
            next();
        }
    });
}

function Clientehabilitado (dni,sexo,next){
   
    let query = 'SELECT CUIL FROM lista_negra WHERE dni=? and sexo=? and activo=1';
    VIDA_DB.query(query, [dni, sexo], function (err, rows) {
        if(err){
            return next(err);
        } else {
            if (rows.length > 0) {
                let error =  "Este DNI se encuentra en la lista negra";
                return next(error);
            } else {
                let query = 'SELECT estado FROM usuario WHERE dni=? and sexo=?';
                VIDA_DB.query(query, [dni, sexo], function (err, rows) {
                    if (rows.length > 0) {
                        if(rows[0].estado === "Ok" || rows[0].estado === "Confirmacion"){
                            let error = 'Ya existe un usuario con ese DNI';
                            return next(error);
                        }else{
                            let query2 = 'DELETE FROM usuario WHERE dni=? and sexo=?';
                            VIDA_DB.query(query2, [dni, sexo], function (err, rows) {
                                if (err) {
                                    let error =  "Internal Server Error";
                                    return next(error);
                                }else{
                                    next();
                                }
                            });
                        }
                    } else {
                        next();
                    }
                });
            }
        }

    });
}

function getData(dni,sex,next){
    person.findPerson(dni, sex)
        .then((found) => {
            if (!found){
                let error={
                    "res":'error',
                    "status":204,
                    "message":"No se encuentran datos de la persona en nuestros registros",
                    "details":null
                };
                return next(error);
            }
            return next(null, found.legacy);
        })
        .catch((err) => {
            let error = {
                "res":'error',
                "status": 400,
                "message": "Error Occured!",
                "details":err
            };
            return next(error);
        });
}


function putResult(documento,sexo, nombre,apellido,cuil,similitud,address,usuario,email,telefono, next){
    var empresa;
    address = '';
    documento.fechaexp = '';
    let query1 = 'SELECT empresa FROM usuario_empresa WHERE cuil=? ';
    VIDA_DB.query(query1, [cuil], function(err, rows) {
        if (rows.length > 0) {
            empresa = rows[0].empresa;
        } else {
            empresa = 'Sin informacion';
        }
        let query = 'INSERT INTO usuario SET dni=?,sexo=?, nombre=?,apellido=?,tramite=?,nacimiento=?,vencimiento=?,direccion=?,estado="Ok",similitud=?,cuil=?,empresa=?,fecha=now(),os=?,email=?,telefono=?';
        VIDA_DB.query(query, [documento.dni,sexo, nombre,apellido,documento.tramite,documento.fechaNac,documento.fechaexp,address,similitud,cuil,empresa,usuario.email,email,telefono], function(err,result) {
            if (err) {
                let error={
                    "res":'error',
                    "status":400,
                    "message":"Error Occured!",
                    "details":err
                };
                return next(error);
            } else {
                return next(null, result.insertId);
            }
        });
    });
            
}

function moveimg(dni,sexo,next){
    let finish = lodash.after(4, function () {
        var params = {
            Bucket: 'validador-de-id',
            Delete: { // required
                Objects: [ // required
                    {
                        Key: 'temp/' + dni + sexo +'_S.jpeg' // required
                    },
                    {
                        Key: 'temp/' + dni + sexo +'_F.jpeg'
                    },
                    {
                        Key: 'temp/' + dni + sexo +'_B.jpeg'
                    },
                ],
            },
        };

        s3.deleteObjects(params, function(err, data) {
            if (err) next(err); // an error occurred
            else     next();           // successful response
        });

    });
    var params1 = {
        CopySource: 'validador-de-id/temp/' + dni + sexo +'_S.jpeg',
        Bucket: 'validador-de-id/usuarios',
        Key: dni + sexo +'_S.jpeg'
    };
    s3.copyObject(params1, function(err, data) {
        if (err) next(err); // an error occurred
        else     finish();           // successful response
    });
    var params2 = {
        CopySource: 'validador-de-id/temp/' + dni + sexo +'_F.jpeg',
        Bucket: 'validador-de-id/usuarios',
        Key: dni + sexo +'_F.jpeg'
    };
    s3.copyObject(params2, function(err, data) {
        if (err) next(err); // an error occurred
        else     finish();           // successful response
    });
    var params3 = {
        CopySource: 'validador-de-id/temp/' + dni + sexo +'_B.jpeg',
        Bucket: 'validador-de-id/usuarios',
        Key: dni + sexo +'_B.jpeg'
    };
    s3.copyObject(params3, function(err, data) {
        if (err) next(err); // an error occurred
        else     finish();           // successful response
    });
}

module.exports.getErrors = async (req,res, next) => {
    res.response = {
        res: 'ok',
        error: 0,
        status: 200,
        message: 'ok',
    };
    if(req.user.empresa === 'TUID'){
        var filter = "";
        var params = [];
        if (req.query.dni && req.query.dni > 0){
            filter = 'and e.dni = ?';
            params.push(req.query.dni);
        }
       let query =  `select e.id, e.dni, e.sexo, e.nombre, e.fecha_error, e.message, 'SIN INFORMACIÓN' as empresa, u.cuil, u.id_usuario , u.fecha 
       from errors e 
       left join usuario u on (e.dni = u.dni && u.sexo = e.sexo) where 1=1 ${filter} order by e.id desc
       limit 20`;
        
       let result = await VIDA_DB.sync_query(query,params);
        res.response.data = result; 
        res.response.error = 0;
        return res.status(201).json(res.response);
    }else{
        res.response.error = 1;
        res.response.data = "No se encontraron resultados";
        return res.status(201).json(res.response);
    }
} 

module.exports.errorImages = async (req,res,next)=>{
    var ruta = 'temp/';
     res.response = { res: 'ok', error: 0, status: 200, message: 'ok'};
     
    res.response.frente = s3.getSignedUrl('getObject', {
        Bucket: tuidVidaConfig.bucketName,
        Key: ruta + req.query.dni + req.query.sexo + "_F.jpeg",
        Expires: 3600
    });
    res.response.dorso = s3.getSignedUrl('getObject', {
        Bucket: tuidVidaConfig.bucketName,
        Key: ruta + req.query.dni + req.query.sexo + "_B.jpeg",
        Expires: 3600
    });
    res.response.photo = s3.getSignedUrl('getObject', {
        Bucket: tuidVidaConfig.bucketName,
        Key: ruta + req.query.dni + req.query.sexo + "_P.jpeg",
        Expires: 3600
    });
    res.response.selfie = s3.getSignedUrl('getObject', {
        Bucket: tuidVidaConfig.bucketName,
        Key: ruta + req.query.dni + req.query.sexo + "_S.jpeg",
        Expires: 3600
    });
  
    return res.status(200).json(res.response);
}


function cleanDoc(document){
    return document.replace(/[^.\d]/g, '').replace(/^0+/, '');;

}


function convert(date){
    let dates = date.split('/');
    if (dates.length == 3) {
        return `${dates[2]}-${dates[1]}-${dates[0]}`;
    }else{
        return date;
    }
}


module.exports.backupImages = async (req,res,next)=>{
    if(!req.query.dni || req.query.dni.length<6 || !req.query.sexo || req.query.sexo.length!=1 ) return res.status(400).send({error:1, msg: "Bad request"});
    bucket.listBackups(req.query.dni, req.query.sexo).then(d => {res.status(200).send(d)}).catch(er=>{ res.status(500).send({ error:1, msg: "EXCEPTON"})});
}







