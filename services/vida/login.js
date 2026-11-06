const bucket = require('./../../utils/bucket');
const tuidVidaConfig = CONFIG.get('vida');
const AWS = require('aws-sdk');
const mail = require('./../../utils/mail');
const lodash = require('lodash');
const maps = require('./../../utils/maps');
const slack = require('./../../utils/slack');
const tokenizer = require('./../../utils/tokenizer');
const { response } = require('express');
const c = require('config');
const person = require('../padron/person');
const cuilUtil = require('./../../utils/cuil');

module.exports.login2 = (req, res, next) => {
    res.response = {
        res: 'error',
        status: 200
    }
    var info = req.body;
    var base64 = info.file;
    var idDevice = info.idDevice;
    var latitud = info.latitud;
    var longitud = info.longitud;
    var idValidacion = info.idValidation;
    var version = info.version;
    var os = info.os;
    var appVersion = info.appVersion;
    var empresas = '';
    if (idDevice == null || idDevice === undefined) {
        idDevice = 'asd123'
    }
    let query = `SELECT 
    u.id_usuario,u.nombre,u.apellido, u.dni, u.sexo,u.nacimiento,date(now()) as hoy, ue.empresa, u.id_device, u.cuil,e.img, e.link,
    if(ue.empresa = 'EFECTIVO SI', null,  ue.proxima) as proxima, u.email,u.telefono,u.estado,u.emailVrf,u.telefonoVrf 
    from usuario u left join usuario_empresa ue on (u.cuil = ue.cuil) left join auditoria a on (u.id_usuario = a.id_usuario) left join empresa e on (ue.empresa = e.id)
    WHERE a.id_validacion = ? ORDER BY e.img desc`;

    VIDA_DB.query(query, [idValidacion], async function (err, result) {
        console.log(err, result);
        if (err || result.length === 0) {
            console.log("PASO");
            res.response.message = `No pudimos encontrar tus datos en nuestra base. Contactanos a través del formulario de contacto`;
            res.response.details = err;
        } else {
            console.log("PAS1");

            var dni = result[0].dni;
            var sexo = result[0].sexo;

            //VERSION DE NACHO
            // let emps = await VIDA_DB.sync_query(`select * from (${newQueries.searchDni}) auxi where auxi.status = 'PENDING'`, [dni, sexo, dni, sexo]);
            //FIN VERSION DE NACHO

            // VERSION STV
            let emps = await VIDA_DB.sync_query(`select * from (${newQueries.searchDni2}) auxi where auxi.status = 'PENDING' or auxi.auditor2 like '%ALERTA%'`, [dni, sexo, dni, sexo]);
            // FIN VERSION STV

            console.log(result);
            var id_usuario = result[0].id_usuario;
            var nombre = result[0].nombre;
            var apellido = result[0].apellido;
            var cuil = result[0].cuil;
            var empresa = emps;
            var fecha_prox = result[0].proxima;
            var nacimiento = '01-01-1900';
            if(result[0].nacimiento && result[0].nacimiento.includes('-')) nacimiento = convert(result[0].nacimiento);
            else if((result[0].nacimiento && result[0].nacimiento.includes('/'))) nacimiento = result[0].nacimiento;
            var fecha_valida = result[0].proxima;
            var hoy = convert(result[0].hoy);
            var email = result[0].email;
            var telefono = result[0].telefono;
            var emailVrf = result[0].emailVrf;
            var telefonoVrf = result[0].telefonoVrf;
            var img = result[0].img;
            var link = result[0].link;
            var filename = dni + sexo + '.jpeg';
            bucket.base64toBucket(base64, filename, tuidVidaConfig.bucketName + '/temp', function (err, ready) {
                if (err) {
                    res.response.message = 'No pudo subir la selfie';
                    res.response.details = err;
                    return res.status(200).json(res.response);
                }
                var rekognition = new AWS.Rekognition();
                var params = {
                    SimilarityThreshold: 1,
                    SourceImage: {
                        S3Object: {
                            Bucket: "validador-de-id",
                            Name: "usuarios/" + dni + sexo + "_S.jpeg"
                        }
                    },
                    TargetImage: {
                        S3Object: {
                            Bucket: "validador-de-id",
                            Name: "temp/" + dni + sexo + ".jpeg"
                        }
                    }
                };
                rekognition.compareFaces(params, function (err, data) {
                    if (err) {
                        console.log(err);
                        res.response.message = 'Error en la comparacion';
                        res.response.details = err;
                        return res.status(200).json(res.response);
                    } else if (data.FaceMatches.length > 0 && data.FaceMatches[0].Similarity > tuidVidaConfig.approvePercentage) {
                        var similitud = data.FaceMatches[0].Similarity;
                        var pendingTasks = [];
                        bucket.moveFile(tuidVidaConfig.bucketName, 'temp/' + filename, 'login', filename, function (err) {
                            bucket.copyFile(tuidVidaConfig.bucketName, 'login/' + filename, 'backup', filename.split(".")[0]+"_" + getNowFormattedDate() +".jpeg", function (err) { });
                         });
                        var error = null;
                        var done = lodash.after(3 + empresa.length, function () {
                            if (error) {
                                res.response.message = `Error en base de datos ${error.message}`;
                                res.response.details = error;
                                return res.status(200).json(res.response);
                            } else {
                                console.log(empresa);
                                empresa.forEach(o => {
                                    empresas = empresas + o.empresa + '   ';
                                });
                                if (empresas != null) {
                                    /// MAIL PARA CUANDO FE DE VIDA Y ENLAZADO A ALGUNA EMPRESA
                                    var parms = {
                                        title: "Certificación TuID",
                                        nombre: nombre + " " + apellido,
                                        cuil: cuil,
                                        nacimiento: nacimiento,
                                        fecha_prox: fecha_prox,
                                        hoy: hoy,
                                        empresas: empresa.map(x=> x.empresa).join(", ")
                                    }
                                    if (email) mail.send('fedevida4', parms, email, null, null);
                                } else {
                                    /// MAIL PARA CUANDO FE DE VIDA PERO SIN EMPRESA
                                    var parms = {
                                        title: "Certificación TuID",
                                        nombre: nombre
                                    }
                                    if (email) mail.send('fedevida2', parms, email, null, null);
                                }
                                if (empresas === '   ') {
                                    empresas = 'No contamos con la Información.\n' +
                                        'Puede que su Entidad no se encuentre adherida a nuestro sistema.';
                                }
                                res.response = {
                                    res: 'ok',
                                    status: 200,
                                    message: 'ok',
                                    idUser: id_usuario,
                                    name: apellido + ', ' + nombre,
                                    banco: empresas,
                                    cuil: cuil,
                                    fecha_valida: fecha_valida,
                                    email: email,
                                    telefono: telefono,
                                    emailVrf: emailVrf,
                                    telefonoVrf: telefonoVrf,
                                    img: img,
                                    link: link
                                };
                                res.response.token = tokenizer.tokenize(res.response);
                                res.response.pendingTasks = pendingTasks;
                                if (result.estado === 'Confirmacion') {
                                    res.response.message = 'Debe confirmar alguno de los datos de contacto'
                                }
                                verifyLife(dni, sexo, cuil); // envia un alerta si el usuarios figura como fallecido (por mail y slack)

                                console.log("****RESPONSE***");
                                console.log(res.response);
                                console.log("*******");
                                return res.status(200).json(res.response);
                            }
                        });
                        empresa.forEach(o => {
                            let empresas = o.empresa;
                            let query = 'INSERT INTO auditoria(id_usuario,fecha,id_device,similitud,empresa,latitud,longitud, version, os, direccion, cuil)VALUES(?,NOW(),?,?,?,?,?,?,?,?,?);';
                            VIDA_DB.query(query, [id_usuario, idDevice, similitud, empresas, latitud, longitud, version, os, req.body.address, cuil], function (err) {
                                if (err) {
                                    slack.debug(JSON.stringify(err));
                                    error = {
                                        "status": 400,
                                        "message": "1"
                                    };
                                    done();
                                } else {
                                    let query = 'UPDATE usuario set fecha_valida = NOW() where id_usuario = ?';
                                    VIDA_DB.query(query, [id_usuario], function (err) {
                                        if (err) {
                                            error = {
                                                "status": 400,
                                                "message": "2"
                                            };
                                            done();
                                        } else {
                                            done();
                                        }
                                    });
                                }
                            });
                        });
                        let query2 = 'UPDATE usuario SET `id_device` = ? WHERE `id_usuario` = ?;';
                        VIDA_DB.query(query2, [idDevice, id_usuario], function (err) {
                            if (err) {
                                error = {
                                    "status": 400,
                                    "message": "3"
                                };
                                done();
                            } else {
                                done();
                            }
                        });
                        let query3 = 'DELETE FROM auditoria WHERE id_validacion = ?;\n';
                        VIDA_DB.query(query3, [idValidacion], function (err) {
                            if (err) {
                                error = {
                                    "status": 400,
                                    "message": "4"
                                };
                                done();
                            } else {
                                done();
                            }
                        });
                        VIDA_DB.query(newQueries.pendingTasks, [id_usuario], function (err, docs) {
                            if (err) {
                                console.log(err);
                                error = {
                                    "status": 400,
                                    "message": "5"
                                };
                                done();
                            } else {
                                pendingTasks = docs;
                                done();
                            }
                        });
                    } else {
                        res.response.message = `Su identidad no coincide con nuestros registros.
                        Es posible que la foto haya salido movida o con mala iluminación.
                        Comuníquese mediante el formulario de contacto`;
                        res.response.details = err;
                        return res.status(200).json(res.response);
                    }
                });
            })
        }
    });
}

module.exports.searchdniSTV = async (req, res, next) => {
    // Version en testing al 25/6/23
    // Version rehecha desde cero por STV
    res.response = {
        res: 'error',
        status: 200
    }
    var info = req.body;
    var dni = cleanDoc(info.dni);
    var sexo = info.sexo;
    var version = info.version;
    var os = info.os;
    console.log(dni + " " + sexo);
    // GET USER
    try {
        let query = 'select u.auditor,u.fecha_fallecido, date(now()) as hoy, date(u.fecha) as fecha_registro, u.id_usuario,	u.dni,	u.cuil,	u.nombre,	u.apellido,	u.email,	u.estado, GROUP_CONCAT(e.nombre) as empresas, GROUP_CONCAT(e.tipo) as empresas_tipos,GROUP_CONCAT(ue.fecha_recordatorio) as fechas_recordatorios,GROUP_CONCAT(ue.notificacion) as notificaciones, GROUP_CONCAT(ue.proxima) as proximas, GROUP_CONCAT(e.periodicidad) as periodicidades from usuario u left join usuario_empresa ue on (u.cuil = ue.cuil) left join empresa e on (ue.empresa = e.id) where u.dni = ? and u.sexo = ?'
        let user = await vidaQuery(query, [dni, sexo]);

        if (user.length != 1) {
            // USUARIO NO REGISTRADO  O MAS DE UN USUARIO PARA ESE DNI Y SEXO
            res.response.message = 'No hemos podido autenticar su identidad.\n' +
                'Previamente debe registrarse.\n' +
                'Si ya lo ha hecho comuníquese mediante el formulario de contacto'
            return res.status(200).json(res.response);
        }
        user = user[0];
        user.empresas = user.empresas ? user.empresas.split(",") : [];
        user.empresas_tipos = user.empresas_tipos ? user.empresas_tipos.split(",") : [];
        user.fechas_recordatorios = user.fechas_recordatorios ? user.fechas_recordatorios.split(",") : [];
        user.proximas = user.proximas ? user.proximas.split(",") : [];
        user.notificaciones = user.notificaciones ? user.notificaciones.split(",") : [];
        user.periodicidades = user.periodicidades ? user.periodicidades.split(",") : [];

        for (let i = 0; i < user.empresas.length; i++) {
            user.empresas[i] = {
                nombre: user.empresas[i],
                tipo: user.empresas_tipos[i],
                periodicidad: parseInt(user.periodicidades[i]),
                fecha_recordatorio: convert(user.fechas_recordatorios[i]),
                notificacion: convert(user.notificaciones[i]),
                proxima: convert(user.proximas[i]),
                dias_desde_ultima_validacion: 9999,
                estado: "",
                fecha_ultima_validacion: "",
                status: "",
                auditor: "",
                validez: "",
                next: ""
            }
        }
        delete user.empresas_tipos;
        delete user.fechas_recordatorios;
        delete user.notificaciones;
        delete user.proximas;
        delete user.periodicidades;


        if (user.empresas.length < 1) {
            // USUARIO NO TIENE MAS EMPRESAS ASOCIADAS
            showNoEntityMessage(req, res, next);
            return;
        }


        if (user.estado == 'Desaprobado' || user.estado == 'Revancha') {
            // USUARIO DESAPROBADO O EN REVANCHA
            res.response.message = 'Imposible Certificar Fe de Vida por que su Registración no fue completada o fue desaprobada.\nPóngase en contacto con Soporte a través del formulario de contacto';
            return res.status(200).json(res.response);
        }

        if (user.auditor && user.auditor.includes("ALERTA")) {
            // USUARIO CON ALERTA EN REGISTRO
            let fecha = user.fecha_registro;
            try {
                let aux = fecha.split("-");
                fecha = `${aux[2]}/${aux[1]}/${aux[0]}`;
            } catch (er) { }

            res.response = {
                res: 'error',
                status: 200,
                message: `Alerta!\n\nSu Registración realizada el día ${fecha} ha sido observada por no ajustarse a las normas de calidad y seguridad requerida.\n\nContactese cuanto antes mediante el formulario de contacto o por Whatsapp al +54 911 23443283`,
            };
            return res.status(200).json(res.response);
        }

        if (user.fecha_fallecido) {
            // COMPLETAR : CONSULTAR A JORQUE QUE HAY QUE RESPONDER SI EL USSUARIO FIGURA EN TABLA USUARIO COMO FALLECIDO
        }

        // OBTNEGO LA ULTIMA VALIDACION DE PARA CADA EMPRESA DEL USUARIO
        // ARMO UNA QUERY PARA HACER UNIONES DE SELECTS
        let queryValidation = "";
        for (let empresa of user.empresas) {
            let nombre = empresa.nombre;
            queryValidation += (queryValidation.length == 0 ? "" : " UNION ") + `SELECT ROW_NUMBER() OVER (order by fecha desc) as r,id_usuario, empresa, fecha, auditor  from auditoria a where id_usuario = ${user.id_usuario} and similitud > 1 and empresa = "${nombre}" and auditor not like '%ALERTA%'`;
        }
        if (queryValidation.length > 0) {
            queryValidation += " order by 1 limit " + user.empresas.length;
        }


        let validaciones = await vidaQuery(queryValidation);
        console.log(validaciones);


        for (let empresa of user.empresas) {

            // le asigno la ultima fecha de validacion para esa empresa
            for (let r of validaciones) {
                if (r.empresa == empresa.nombre) {
                    empresa.fecha_ultima_validacion = r.fecha;
                    if (empresa.fecha_ultima_validacion && empresa.fecha_ultima_validacion.length > 0) {
                        empresa.dias_desde_ultima_validacion = dateDiff(new Date(), new Date(empresa.fecha_ultima_validacion));
                    }
                    empresa.auditor = r.auditor;
                }
            }
            //calcular validez
            if (empresa.tipo == "D" && empresa.fecha_ultima_validacion && empresa.fecha_ultima_validacion.length > 0) {
                let validez_date = new Date(empresa.fecha_ultima_validacion);
                validez_date.setDate(validez_date.getDate() + 30);
                empresa.validez = convert(validez_date.toISOString().split("T")[0]);
            }

            //calcular next
            if (empresa.tipo == "D") {
                if (empresa.fecha_ultima_validacion && empresa.fecha_ultima_validacion.length > 0) {
                    let next_date = new Date(empresa.fecha_ultima_validacion);
                    next_date.setDate(next_date.getDate() + 30);
                    empresa.next = convert(next_date.toISOString().split("T")[0]);
                }
                else {
                    empresa.next = convert(new Date().toISOString().split("T")[0])
                }
            }
            else empresa.next = empresa.proxima;

            // TODO: 
            //CALCULAR ESTADO DE VALIDACION PRIORITARIO POR EMPRESA DEL USUARIO   VALORES PENDING / OK / LATE

            if (empresa.tipo == "D") {
                if (empresa.fecha_ultima_validacion.length < 1 || empresa.dias_desde_ultima_validacion > empresa.periodicidad * 30) {
                    empresa.status += "PENDING";
                }
                else empresa.status += "OK";
            }
            else {
                if (new Date().getTime() > new Date(empresa.fecha_recordatorio).getTime()) {
                    if (new Date(empresa.fecha_ultima_validacion).getTime() >= new Date(empresa.fecha_recordatorio).getTime()) {
                        if (new Date(empresa.fecha_ultima_validacion).getTime() > new Date(empresa.notificacion).getTime()) {
                            empresa.status += "LATE";
                        }
                        else empresa.status += "OK"
                    }
                    else empresa.status += "PENDING"

                }
                else empresa.status = "OK";
            }


            /*
            if (e.tipo = 'D',
                if(date(a.afecha) is null || DATEDIFF(NOW(),DATE(a.afecha)) > e.periodicidad * 30 ,
                    'PENDING',
                    'OK'),
                if(now() > date(ue.fecha_recordatorio),
                    if(date(a.afecha) >= date(ue.fecha_recordatorio),
                        if(date(a.afecha) > date(ue.notificacion),
                            'LATE',
                            'OK'),
                        'PENDING'),
                    'OK')) as status,
            */
        }



        console.log(user);
        return res.status(200).send(user);


        let empresas = user.empresas;
        // RESPONDER SEGUN EL ESSTADO PRIORITARIO
        if (empresas.findIndex(e => { return e.status == 'PENDING' }) > -1) {
            console.log("USUARIO EN ESTADO PENDING... PROCEDIENDO A LOGIN");
            var id_usuario = user.id_usuario;
            var empresa = empresas[0].nombre;
            let query = 'INSERT INTO auditoria (id_usuario,fecha,empresa,os,version) VALUES (?,NOW(),?,?,?)';

            VIDA_DB.query(query, [id_usuario, empresa, os, version], function (err, result) {
                if (err) {
                    slack.error("Error: Login.js line 373 " + err);
                    res.response.message = "Error de conexíon con la base de datos";
                    return res.status(200).json(res.response);
                } else {
                    res.response = {
                        res: 'ok',
                        status: 200,
                        message: 'ok',
                        idValidation: result.insertId
                    };
                    return res.status(200).json(res.response);
                }
            });
            return;
        }
        if (empresas.findIndex(e => { return e.status == 'OK' }) > -1) {
            console.log("USUARIO CON LA FE DE VIDA AL DIA");
            var message = "Su Fe de Vida se encuentra al día.\n";
            for (var i = 0; i < empresas.length; i++) {
                if (empresas[i].validez) {
                    let conver = convert(empresas[i].validez);
                    message += `Para ${empresas[i].nombre} tiene validez hasta ${conver}.\n`
                } else {
                    let conver = convert(empresas[i].next);
                    message += `El próximo período de ${empresas[i].nombre} comienza ${conver}.\n`;
                }
            }
            res.response.message = message;
            return res.status(200).json(res.response);
        }
        if (empresas.findIndex(e => { return e.status == 'LATE' }) > -1) {
            console.log("USUARIO CON FE DE VIDA ALL DIA PERO ATRASADA");
            res.response.message = 'Su Fe de Vida ya fue certificada para el presente periodo.\nSi está pendiente su beneficio previsional no es necesario que realice ninguna acción.\nEn lo próximos dias deberá acreditarse.';
            return res.status(200).json(res.response);
        }

        // ERROR NO SE DETECTO NINGUN ESTADO COMO OK, PENDING O LATE. Que hay que hacer?
        res.response.message = "Error interno";
        slack.error("Login.js line 408 error:  El usuario no tiene estado en OK, PENDINGO o LATE" + JSON.stringify(user));
        res.response.msg = user;
        return res.status(500).json(res.response);
    }
    catch (err) {
        // ALGO SALIO MAL
        console.log(err);
        slack.error("Login.js line 415 error:  Hubo una excepcion: " + err + JSON.stringify(user));
        res.response.details = err;
        res.response.message = "Error de conexión con la base de datos";
        return res.status(200).json(res.response);
    }
}


//TEST STV
function getNowFormattedDate() {
    var d = new Date(),
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

function dateDiff(date1, date2) {
    const diffTime = Math.abs(date2 - date1);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

module.exports.searchdni = (req, res, next) => {
    // BY STV vigente en prod?
    res.response = {
        res: 'error',
        status: 200
    }
    var info = req.body;
    var dni = cleanDoc(info.dni);
    var sexo = info.sexo;
    var version = info.version;
    var os = info.os;
    VIDA_DB.query(newQueries.searchDni2, [dni, sexo, dni, sexo], function (err, row) {
        console.log(row);
        if (err) {
            console.log(err);
            res.response.details = err;
            res.response.message = "Error de conexión con la base de datos";
            return res.status(200).json(res.response);
        } else if (row.length === 0) {
            console.log("USUARIO NO ENCONTRADO");
            res.response.message = 'No hemos podido autenticar su identidad.\n' +
                'Previamente debe registrarse.\n' +
                'Si ya lo ha hecho comuníquese mediante el formulario de contacto'
            return res.status(200).json(res.response);
        } else if (row[0].empresa == null) {
            console.log("USUARIO NO TIENE EMPRSA ASOCIADA");
            showNoEntityMessage(req, res, next);
        } else if (row[0].estado == 'Desaprobado' || row[0].estado == 'Revancha') {
            console.log("USUARIO DESAPROBADO O EN REVANCHA");
            res.response.message = 'Imposible Certificar Fe de Vida por que su Registración no fue completada o fue desaprobada.\nPóngase en contacto con Soporte a través del formulario de contacto';
            return res.status(200).json(res.response);
        }


        // CAMBIOS STV
        // validar si tiene alerta en registro o en ultima validacion para mandar mensaje de error y que contacte a soporte
        else if (row[0].auditor && row[0].auditor.includes("ALERTA")) {
            //TIENE ALERTA EN REGISTRO
            console.log("USUARIO TIENE Alerta EN REGISTRO");
            let fecha = row[0].fecha_registro;
            try {
                let aux = fecha.split("-");
                fecha = `${aux[2]}/${aux[1]}/${aux[0]}`;
            } catch (er) { }

            res.response = {
                res: 'error',
                status: 200,
                message: `Alerta!\n\nSu Registración realizada el día ${fecha} ha sido observada por no ajustarse a las normas de calidad y seguridad requerida.\n\nContactese cuanto antes mediante el formulario de contacto o por Whatsapp al +54 911 23443283`,
            };
            return res.status(200).json(res.response);
        }
        else if (row.findIndex(e => { return e.auditor2 && e.auditor2.includes("ALERTA") }) > -1) {
            console.log("USUARIO TIENE ALERTA EN ULTIMAS VALIDACIONES... PROCEDER A LOGIN");
            //TIENE ALERTA EN ALGUNA VALIDACION DE LAS ULTIMAS SEGUN EMPRESA

            // ANTES
            // let fecha = row[row.findIndex(e=>{return e.auditor2 && e.auditor2.includes("ALERTA")})].fecha_valida;
            // try{
            //     let aux = fecha.split("-");
            //     fecha = `${aux[2]}/${aux[1]}/${aux[0]}`;
            // } catch(er){}

            // res.response = {
            //     res: 'error',
            //     status: 200,
            //     message: `Alerta!\n\nSu Certificación realizada el día ${fecha} ha sido observada por no ajustarse a las normas de calidad y seguridad requerida.\n\nContactese cuanto antes mediante el formulario de contacto o por Whatsapp al +54 911 23443283`,
            // };
            // return res.status(200).json(res.response);
            // ---- DESPUES ---- 
            var id_usuario = row[0].id_usuario;
            var empresa = row[0].empresa;
            let query = 'INSERT INTO auditoria (id_usuario,fecha,empresa,os,version) VALUES (?,NOW(),?,?,?)';
            VIDA_DB.query(query, [id_usuario, empresa, os, version], function (err, result) {
                if (err) {
                    res.response.message = "Error de conexíon con la base de datos";
                    return res.status(200).json(res.response);
                } else {
                    res.response = {
                        res: 'ok',
                        status: 200,
                        message: 'ok',
                        idValidation: result.insertId
                    };
                    return res.status(200).json(res.response);
                }
            });
            // --- FIIN DESPUES ---
        }
        // FIN CAMBIOS STV

        else if (row.findIndex(e => { return e.status == 'PENDING' }) > -1) {
            console.log("USUARIO EN ESTADO PENDING... PROCEDIENDO A LOGIN");
            var id_usuario = row[0].id_usuario;
            var empresa = row[0].empresa;
            let query = 'INSERT INTO auditoria (id_usuario,fecha,empresa,os,version) VALUES (?,NOW(),?,?,?)';
            VIDA_DB.query(query, [id_usuario, empresa, os, version], function (err, result) {
                if (err) {
                    res.response.message = "Error de conexíon con la base de datos";
                    return res.status(200).json(res.response);
                } else {
                    res.response = {
                        res: 'ok',
                        status: 200,
                        message: 'ok',
                        idValidation: result.insertId
                    };
                    return res.status(200).json(res.response);
                }
            });
        } else if (row.findIndex(e => { return e.status == 'OK' }) > -1) {
            console.log("USUARIO CON LA FE DE VIDA AL DIA");
            var message = "Su Fe de Vida se encuentra al día.\n";
            for (var i = 0; i < row.length; i++) {
                if (row[i].validez) {
                    let conver = convert(row[i].validez);
                    message += `Para ${row[i].empresa} tiene validez hasta ${conver}.\n`
                } else {
                    let conver = convert(row[i].next);
                    message += `El próximo período de ${row[i].empresa} comienza ${conver}.\n`;
                }
            }
            res.response.message = message;
            return res.status(200).json(res.response);
        } else if (row.findIndex(e => { return e.status == 'LATE' }) > -1) {
            console.log("USUARIO CON FE DE VIDA ALL DIA PERO ATRASADA");
            res.response.message = 'Su Fe de Vida ya fue certificada para el presente periodo.\nSi está pendiente su beneficio previsional no es necesario que realice ninguna acción.\nEn lo próximos dias deberá acreditarse.';
            return res.status(200).json(res.response);
        }
    });

}


module.exports.searchdniNachoProd = (req, res, next) => {
    // VERSION PROD NACHO
    res.response = {
        res: 'error',
        status: 200
    }
    var info = req.body;
    var dni = cleanDoc(info.dni);
    var sexo = info.sexo;
    var version = info.version;
    var os = info.os;
    VIDA_DB.query(newQueries.searchDniNachoProd, [dni, sexo, dni, sexo], function (err, row) {
        console.log(row);
        if (err) {
            res.response.details = err;
            res.response.message = "Error de conexión con la base de datos";
            return res.status(200).json(res.response);
        } else if (row.length === 0) {
            res.response.message = 'No hemos podido autenticar su identidad.\n' +
                'Previamente debe registrarse.\n' +
                'Si ya lo ha hecho comuníquese mediante el formulario de contacto'
            return res.status(200).json(res.response);
        } else if (row[0].empresa == null) {
            showNoEntityMessage(req, res, next);
        } else if (row[0].estado == 'Desaprobado' || row[0].estado == 'Revancha') {
            res.response.message = 'Imposible Certificar Fe de Vida por que su Registración no fue completada o fue desaprobada.\nPóngase en contacto con Soporte a través del formulario de contacto';
            return res.status(200).json(res.response);
        } else if (row.findIndex(e => { return e.status == 'PENDING' }) > -1) {
            var id_usuario = row[0].id_usuario;
            var empresa = row[0].empresa;
            let query = 'INSERT INTO auditoria (id_usuario,fecha,empresa,os,version) VALUES (?,NOW(),?,?,?)';
            VIDA_DB.query(query, [id_usuario, empresa, os, version], function (err, result) {
                if (err) {
                    res.response.message = "Error de conexíon con la base de datos";
                    return res.status(200).json(res.response);
                } else {
                    res.response = {
                        res: 'ok',
                        status: 200,
                        message: 'ok',
                        idValidation: result.insertId
                    };
                    return res.status(200).json(res.response);
                }
            });
        } else if (row.findIndex(e => { return e.status == 'OK' }) > -1) {
            var message = "Su Fe de Vida se encuentra al día.\n";
            for (var i = 0; i < row.length; i++) {
                if (row[i].validez) {
                    let conver = convert(row[i].validez);
                    message += `Para ${row[i].empresa} tiene validez hasta ${conver}.\n`
                } else {
                    let conver = convert(row[i].next);
                    message += `El próximo período de ${row[i].empresa} comienza ${conver}.\n`;
                }
            }
            res.response.message = message;
            return res.status(200).json(res.response);
        } else if (row.findIndex(e => { return e.status == 'LATE' }) > -1) {
            res.response.message = 'Su Fe de Vida ya fue certificada para el presente periodo.\nSi está pendiente su beneficio previsional no es necesario que realice ninguna acción.\nEn lo próximos dias deberá acreditarse.';
            return res.status(200).json(res.response);
        }
    });

}

module.exports.searchdniOLDDEPRECATED = (req, res, next) => {
    // DEPRECADO POR NACHO // LA MAS VIEJA DE TODAS
    res.response = {
        res: 'error',
        status: 200
    }
    var info = req.body;
    var dni = cleanDoc(info.dni);
    var sexo = info.sexo;
    var version = info.version;
    var os = info.os;

    let query = 'SELECT if (date(now()) >=  ue.fecha_recordatorio,1 ,0) as today, u.id_usuario, ue.empresa, u.cuil, date(u.fecha_valida) as fecha_valida, date(ue.fecha_recordatorio) as fecha_recordatorio, date(ue.notificacion) as notificacion, date(ue.proxima) as proxima from usuario u left join usuario_empresa ue on (u.cuil = ue.cuil) WHERE u.dni = ? and u.sexo = ?';
    VIDA_DB.query(query, [dni, sexo], function (err, row) {
        if (err) {
            res.response.details = err;
            res.response.message = "Error de conexión con la base de datos";
            return res.status(200).json(res.response);
        } else if (row.length === 0) {
            res.response.message = 'No hemos podido autenticar su identidad.\n' +
                'Previamente debe registrarse. \n' +
                'Si ya lo ha hecho comuníquese mediante el formulario de contacto'
            return res.status(200).json(res.response);
        } else {
            var empresa = row[0].empresa;
            if (empresa == null) {
                res.response.message = `Lamentablemente segun nuestros registros no contamos con informacion sobre su Institucion Pagadora. 
                Ello se debe a que aun no esta Adherida a TulD Vida o su fecha de Jubilacion es muy reciente.
                Si ha encontrado util nuestro servicio solicite a su Entidad la adhesion.
                Si considera que no es correcto.
                Pongase en contacto mediante nuestro formulario de contacto en el Menu`;
                return res.status(200).json(res.response);
            } else if (empresa == "EFECTIVO SI") {
                if (row[0].fecha_valida > row[0].fecha_recordatorio && row[0].fecha_valida < row[0].notificacion && row[0].today < 1) {
                    res.response.message = 'Su Fe de Vida ya fue validada en este periodo, el siguiente comienza : ' + row[0].notificacion;
                    return res.status(200).json(res.response);
                } else if (row[0].fecha_valida >= row[0].notificacion) {
                    res.response.message = 'Su Fe de Vida ya fue validada en este periodo y tiene una validez hasta : ' + row[0].proxima;
                    return res.status(200).json(res.response);
                }
            } else { // BAPRO // FLUJO GENERICO
                if (row[0].fecha_valida > row[0].fecha_recordatorio) {
                    if (row[0].fecha_valida < row[0].notificacion) {
                        res.response.message = 'Su Fe de Vida ya fue validada en este periodo, el siguiente comienza : ' + row[0].proxima
                        return res.status(200).json(res.response);
                    } else {
                        res.response.message = 'Su Fe de Vida ya fue validada fuera del tiempo estipulado. Si aún no recibio el pago de haberes, no es necesario que haga nada más, en lo próximos dias deberá acreditarse.';
                        return res.status(200).json(res.response);
                    }
                }
            }
            var id_usuario = row[0].id_usuario;
            let query = 'INSERT INTO auditoria (id_usuario,fecha,empresa,os,version) VALUES (?,NOW(),?,?,?)';
            VIDA_DB.query(query, [id_usuario, empresa, os, version], function (err, result) {
                if (err) {
                    res.response.message = "Error de conexíon con la base de datos";
                    return res.status(200).json(res.response);
                } else {
                    res.response = {
                        res: 'ok',
                        status: 200,
                        message: 'ok',
                        idValidation: result.insertId
                    };
                    return res.status(200).json(res.response);
                }
            });
        }
    });
}

let certificateUrl = tuidVidaConfig.certificateUrl;
module.exports.getCertificate = async (req, res, next) => {
    res.response = {
        error: 1,
        message: 'Certificado no disponible',
        status: 200,
        code: "10011",
        data: null
    }
    // Camino nuevo: por CUIL. Camino anterior (apps viejas): DNI + sexo.
    var statusQuery = userStatusQuery;
    var statusParams = [req.query.dni, req.query.sexo];
    if (req.query.cuil !== undefined && req.query.cuil !== '') {
        if (!cuilUtil.isValid(req.query.cuil)) {
            res.response.code = "10012";
            res.response.message = "El CUIL ingresado no es válido";
            return res.status(200).json(res.response);
        }
        statusQuery = userStatusQuery.replace('WHERE u.dni = ? and u.sexo = ?', 'WHERE u.cuil = ?');
        statusParams = [cuilUtil.normalize(req.query.cuil)];
    }
    VIDA_DB.query(statusQuery, statusParams, function (err, row) {
        console.log(err);
        console.log(row);


        if (row.length > 0 && row[0].fecha_valida) {
            // console.log(row[0].auditor +  "Tiene alerta: " + (row[0].auditor.includes("ALERTA")));

            // si no esta auditado, respondo que esta pendiente de auditoria
            if (row[0].auditor2 == null || row[0].auditor2.length<1) {
                res.response.code = "10010";
                let fecha = convert(row[0].fecha_valida);
                res.response.message = "Su Certificación realizada el " + fecha + "  se encuentra en proceso de revisión. En las próximas 48 horas hábiles podrá acceder a su certificado.";
                return res.status(200).json(res.response);
            }

            // si tiene alerta en registro retorno error para que contacte a soporte
            if (row[0].auditor != null && row[0].auditor.includes("ALERTA")) {
                res.response.code = "10010";
                // let fecha = convert(row[0].fecha_valida);
                // let msg = "No es posible descargar su Certificado de fecha " + fecha +  " dado que el mismo ha sido Observado por no cumplir con las normas de Calidad y Seguridad requeridas. Póngase en contacto con el Departamento de Auditoria a fin de subsanar dicha anomalía."
                // res.response.message = "Alerta!\n\nSu Certificación ha sido observada por no ajustarse a las normas de calidad y seguridad requerida.\n\nContactese cuanto antes mediante el formulario de contacto o por Whatsapp al +54 911 23443283`";
                // res.response.message = msg;
                return res.status(200).json(res.response);
            }
        }


        if (err || row.length == 0) {
            res.response.code = "10012";
            res.response.message = "Usuario no registrado";
            return res.status(200).json(res.response);
        } else if (row[0].empresa == null) {
            res.response.code = "10012";
            res.response.message = "Su entidad no se encuentra adherida";
            return res.status(200).json(res.response); // no esta asociado a ninguna empresa
        } else if (row[0].estado == 'Desaprobado' || row[0].estado == 'Revancha') {
            res.response.code = "10010";
            res.response.message = 'Imposible Certificar Fe de Vida por que su Registración no fue completada o fue desaprobada.\nPóngase en contacto con Soporte a través del formulario de contacto';
            return res.status(200).json(res.response);
        } else if (row.findIndex(e => { return e.status == 'PENDING' }) > -1) {
            res.response.code = "10009";
            res.response.message = 'La validación de Fe de Vida se encuentra pendiente. Debe completar el trámite antes de solicitar el certificado';
            return res.status(200).json(res.response);
        } else if (row.findIndex(e => { return e.auditor2 && e.auditor2.includes("ALERTA") }) > -1) {
            // validdar si tiene alerta en alguna validacion
            res.response.code = "10010";
            let index = row.findIndex(e => { return e.auditor2 && e.auditor2.includes("ALERTA") });
            let fecha = convert(row[index].fecha_valida);
            let msg = "No es posible descargar su Certificado de fecha " + fecha +  " dado que el mismo ha sido Observado por no cumplir con las normas de Calidad y Seguridad requeridas. Póngase en contacto con el Departamento de Auditoria a fin de subsanar dicha anomalía."
                
            // res.response.message = `Alerta!\n\nSu Certificación ha sido observada por no ajustarse a las normas de calidad y seguridad requerida.\n\nContactese cuanto antes mediante el formulario de contacto o por Whatsapp al +54 911 23443283`;
            res.response.message = msg;
            return res.status(200).json(res.response);

        } else if (row.findIndex(e => { return e.status == 'OK' || e.status == "LATE" }) > -1) {
            var f = new Date();
            res.response.data = {
                empresas: row.map(e => { return e.empresa }),
                cuil: row[0].cuil,
                ultima: convert(row[0].fecha_valida),
                nombre: `${row[0].nombre} ${row[0].apellido}`,
                fecha: convert(row[0].hoy),
                nacimiento: row[0].nacimiento.includes('-') ? convert(row[0].nacimiento) : '01-01-1900', //algunos sin fecha de nacimiento
                validez: row[0].validez ? convert(row[0].validez) : convert(row[0].next)
            }
            res.response.data.token = tokenizer.tokenize(res.response.data);
            res.response.data.url = "";//"`${certificateUrl}?token=${res.response.data.token}`;
            res.response.message = "";
            res.response.code = "";
            res.response.error = 0;
            return res.status(200).json(res.response);
        }
    });
}


let daysES = tuidVidaConfig.rangoES;
let userStatusQuery = `SELECT u.id_usuario,
ue.empresa, 
u.cuil,
u.auditor,
u.nacimiento,
u.estado,
u.cuil, 
u.nombre,
u.apellido,
(select a.auditor from auditoria a where a.id_usuario = u.id_usuario and a.empresa = ue.empresa order by a.fecha desc limit 1) as auditor2,
date(now()) as hoy,
date(u.fecha_valida) as fecha_valida,
date(ue.fecha_recordatorio) as fecha_recordatorio,
date(ue.notificacion) as notificacion, date(ue.proxima) as proxima ,
if (ue.empresa = 'EFECTIVO SI', 
     if(now() > date(ue.notificacion), if(date(u.fecha_valida) >= date(ue.notificacion),'OK','PENDING'), if(date(u.fecha_valida) >= date(ue.fecha_recordatorio), 'OK','PENDING')),
     if(now() > date(ue.fecha_recordatorio), if(date(u.fecha_valida) >= date(ue.fecha_recordatorio),if(date(u.fecha_valida) > date(ue.notificacion),'LATE','OK'),'PENDING'),'OK')
) as status,
if (ue.empresa = 'EFECTIVO SI' && now() > date(ue.notificacion) ,  if (fecha_valida is not null, date(DATE_ADD(fecha_valida, INTERVAL ${daysES} DAY)),ue.proxima ) , null) as validez,   
if (ue.empresa = 'EFECTIVO SI', notificacion, proxima) as next
from usuario u left join usuario_empresa ue on (u.cuil = ue.cuil)
WHERE u.dni = ? and u.sexo = ? order by next asc`;

async function vidaQuery(query, params) {
    return new Promise((resolve, reject) => {
        VIDA_DB.query(query, params, function (er, row) {
            if (er) reject(er);
            resolve(row);
        })
    })
}



let queries = {
    "alert": "insert into alertas (cuil,comentarios, fecha) values (?,?,UTC_TIMESTAMP())",
    "entities": "select bco.banco from beneficiario b join entidad_pagadora ep on (ep.IDEntidad = b.IDEntidad) join banco bco on (bco.IDBanco = ep.IDBanco) where b.cuil in (?) and b.fechaProxima > curdate()"
}

function convert(date) {
    try{
        let dates = date.split('-');
        if (dates.length == 3) {
            return `${dates[2]}/${dates[1]}/${dates[0]}`;
        } else {
            return date;
        }
    }
    catch(er){

    }
    return date;
}

async function verifyLife(dni, gender, cuil) {
    try {
        const status = await person.deceased(cuil);
        if (!status.fallecido) return;
    } catch (err) {
        console.log(err);
        return;
    }
    let comment = `Posible fallecido acaba de validar FE de Vida - CUIL : ${cuil}`;
    VIDA_DB.query(queries['alert'], [cuil, comment], function (err, doc) {
        console.log(err);
    });
    slack.debug(comment);
    let params = {
        title: comment,
        dni: dni,
        gender: gender,
        cuil: cuil
    }
    mail.send('alert', params, tuidVidaConfig.supportContact, tuidVidaConfig.supportContact, null);
}

async function showNoEntityMessage(req, res, next) {

    res.response.message = `Lamentablemente no contamos con información sobre su institución pagadora.\nEsto puede deberse a:\n♦ Su beneficio previsional es muy reciente.\n♦ Su institución no esta adherida a TuId Vida. Si encuentra útil nuestro servicio solicite a su entidad la adhesión.\n♦ Si usted es apoderado quien debe realizar la Certificación es el Beneficiario\nCualquier inquietud contáctenos.`;
    try {
        const cuils = await person.cuilsByDni(req.body.dni, req.body.sexo);
        const entities = cuils.length > 0 ? await NEW_MASTER_DB.sync_query(queries['entities'], [cuils]) : [];
        if (entities.length > 0) {
            res.response.message = `Lamentablemente su institución pagadora :\n${entities[0].banco}\n no está adherida a TulD Vida.\nSi ha encontrado útil nuestro servicio solicite a su entidad la adhesión.\nCualquier inquietud pongase en contacto con nosotros.`;
        }
    } catch (err) {
        console.log(err);
    }
    return res.status(200).json(res.response);



}


let validateQueries = {
    "tuid": "select count(*) as total from usuario where dni = ? and sexo = ?",
    "empresa": "select * from usuario_empresa where cuil = ?"
}

module.exports.validateUser = async (req, res, next) => {

    let document = cleanDoc(req.body.dni);

    let gender = req.body.sexo;
    let birth = req.body.birth;
    res.response = {
        res: 200,
        code: "10011",
        message: "",
        proceed: true
    }
    try {
        let usuarioTuid = await VIDA_DB.sync_query(validateQueries['tuid'], [document, gender]);
        console.log(document, gender);
        console.log(usuarioTuid);
        if (usuarioTuid[0].total > 0) {
            res.response.code = "10009";
            res.response.message = "Usted ya se encuentra registrado. Para concluir el trámite ingrese a la opción Fe de Vida";
            res.response.proceed = false;
            return res.status(200).json(res.response);
        }
        let masterResp = (await person.findPeople(document, gender)).map(person.toLegacy);
        if (masterResp.length == 0) {
            res.response.message = "No se encontraron datos en nuestros registros. Comuniquese mediante el formulario de contacto para que podamos resolver su inconveniente.";
            res.response.code = "10010";
            res.response.proceed = false;
            return res.status(200).json(res.response);
        } else {
            var user = masterResp[0];
            if (masterResp.length > 1) {
                let possible = masterResp.findIndex(e => { return birth.includes(String(e.ano)) });
                if (possible >= 0) {
                    user = masterResp[possible];
                }
            }
            let empresaResp = await VIDA_DB.sync_query(validateQueries['empresa'], [user.CUIL]);
            if (empresaResp.length > 0) {
                return res.status(200).json(res.response);
            } else {
                res.response.code = "10011";
                res.response.proceed = false;
                showNoEntityMessage(req, res, next);
            }
        }
    } catch (err) {
        return res.status(200).json(res.response);
    }
}

module.exports.validateToken = async (req, res, next) => {
    res.response = {
        res: 'error',
        message: 'Unknown',
        status: 200
    }
    let token = req.headers['x-auth-token'];
    if (token) {
        tokenizer.detokenize(
            token, function (err, doc) {
                if (err || !doc) {
                    res.response.message = "Token es invalido. Inicie sesión nuevamente";
                    res.status(200).json(res.response);
                } else {
                    req.user = doc;
                    next();
                }
            });
    } else {
        res.response.error = 1;
        res.response.message = "Por favor envie token";
        return res.status(200).json(res.response);
    }
}

function cleanDoc(document) {
    return document.replace(/[^.\d]/g, '').replace(/^0+/, '');;

}

module.exports.getAddress = async (req, res, next) => {

    try {
        req.body.address = await maps.getAddress(req.body.latitud, req.body.longitud);
        if (req.body.address == "") {
            req.body.address = null;
        } else {
            req.body.address = req.body.address.replace(/\uFFFD/g, '');
        }
    } catch (err) {
        req.body.address = null;
    }
    next();

}

var newQueries = {

searchDniNachoProd: `
SELECT distinct u.id_usuario,
ue.empresa,
u.nacimiento,
u.estado,
u.cuil,
u.nombre,
u.apellido,
e.tipo,
date(now()) as hoy,
date(a.afecha) as fecha_valida,
date(ue.fecha_recordatorio) as fecha_recordatorio,
date(ue.notificacion) as notificacion, date(ue.proxima) as proxima ,
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
from usuario u left join usuario_empresa ue on (u.cuil = ue.cuil) left join empresa e on (ue.empresa = e.id) left join (Select a.id_usuario, max(a.fecha)as afecha, a.empresa from auditoria a join usuario u on (u.id_usuario = a.id_usuario)
where u.dni = ? and u.sexo = ? and a.similitud > 1 group by a.id_usuario, a.empresa) as a on (u.id_usuario = a.id_usuario)
WHERE u.fecha_fallecido is null and u.dni = ? and u.sexo = ? and if(a.empresa is null,ue.empresa=ue.empresa ,ue.empresa = a.empresa) order by next asc`,
    
searchDni: `
    SELECT distinct u.id_usuario,
    ue.empresa,
    u.auditor,
    a.auditor2,
    u.nacimiento,
    u.estado,
    date(u.fecha) as fecha_registro,
    u.cuil,
    u.nombre,
    u.apellido,
    e.tipo,
    date(now()) as hoy,
    date(a.afecha) as fecha_valida,
    date(ue.fecha_recordatorio) as fecha_recordatorio,
    date(ue.notificacion) as notificacion, 
    date(ue.proxima) as proxima ,
    if (e.tipo = 'D',
        if(date(a.afecha) is null || DATEDIFF(NOW(),DATE(a.afecha)) > e.periodicidad * 30 ,
            'PENDING',
            'OK'),

        if(now() > date(ue.fecha_recordatorio),
            if(date(a.afecha) >= date(ue.fecha_recordatorio),
                if(date(a.afecha) > date(ue.notificacion),
                    'LATE',
                    'OK'),
                'PENDING'),

        'OK')) as status,

    if (e.tipo = 'D', if (a.afecha is not null, date(DATE_ADD(a.afecha, INTERVAL e.periodicidad * 30 DAY)),null),null) as validez,
    if (e.tipo = 'D', if (a.afecha is not null, date(DATE_ADD(a.afecha, INTERVAL e.periodicidad * 30 DAY)),now()) , proxima) as next
    from 
        usuario u 
        left join usuario_empresa ue on (u.cuil = ue.cuil) 
        left join empresa e on (ue.empresa = e.id) 
        left join (Select a.id_usuario, max(a.fecha)as afecha, a.empresa, a.auditor as auditor2 from auditoria a join usuario u on (u.id_usuario = a.id_usuario) where u.dni = ? and u.sexo = ? and a.similitud > 1 group by a.id_usuario, a.empresa) as a 
            on (u.id_usuario = a.id_usuario)

    WHERE u.fecha_fallecido is null and u.dni = ? and u.sexo = ? and if(a.empresa is null,ue.empresa=ue.empresa ,ue.empresa = a.empresa) order by next asc`,


    searchDni2: `
    SELECT distinct u.id_usuario,
    ue.empresa,
    u.auditor,
    a.auditor2,
    u.nacimiento,
    u.estado,
    date(u.fecha) as fecha_registro,
    u.cuil,
    u.nombre,
    u.apellido,
    e.tipo,
    date(now()) as hoy,
    date(a.afecha) as fecha_valida,
    date(ue.fecha_recordatorio) as fecha_recordatorio,
    date(ue.notificacion) as notificacion, 
    date(ue.proxima) as proxima ,
    if (e.tipo = 'D',
        if(date(a.afecha) is null || DATEDIFF(NOW(),DATE(a.afecha)) > e.periodicidad * 30 ,
            'PENDING',
            'OK'),

        if(now() > date(ue.fecha_recordatorio),
            if(date(a.afecha) >= date(ue.fecha_recordatorio),
                if(date(a.afecha) > date(ue.notificacion),
                    'LATE',
                    'OK'),
                'PENDING'),

        'OK')) as status,

    if (e.tipo = 'D', if (a.afecha is not null, date(DATE_ADD(a.afecha, INTERVAL e.periodicidad * 30 DAY)),null),null) as validez,
    if (e.tipo = 'D', if (a.afecha is not null, date(DATE_ADD(a.afecha, INTERVAL e.periodicidad * 30 DAY)),now()) , proxima) as next
    from 
        usuario u 
        left join usuario_empresa ue on (u.cuil = ue.cuil) 
        left join empresa e on (ue.empresa = e.id) 
        left join 
        (
            
            select * from (select row_number() over(partition by a2.empresa order by a2.fecha desc) as auxi, a2.id_usuario, a2.fecha as afecha, a2.empresa, a2.auditor as auditor2, a2.similitud  from auditoria a2 join usuario u on (u.id_usuario = a2.id_usuario) 
        	where u.dni = ? and u.sexo = ? and a2.similitud > 1 ) as asd 
        	where asd.auxi = 1
            
            ) as a 
            on (u.id_usuario = a.id_usuario)

    WHERE u.fecha_fallecido is null and u.dni = ? and u.sexo = ? and ( a.empresa is null or (a.empresa is not null and ue.empresa = a.empresa) )
    order by next asc`,



    pendingTasks: `select f.* from 
    usuario u join usuario_empresa ue  on u.cuil = ue.cuil
    join formularios f on ue.empresa = f.empresa_id and f.activo = 1
    left join respuestas r on r.id_usuario = u.id_usuario  and r.id_formulario = f.id and ( f.periodicidad = 0 or f.periodicidad > DATEDIFF(now(),r.fecha)  )
    where r.id is null and u.id_usuario = ?`

}

module.exports.showNoEntityMessage = showNoEntityMessage;
module.exports.verifyLife = verifyLife;
module.exports.convert = convert;
module.exports.newQueries = newQueries;

