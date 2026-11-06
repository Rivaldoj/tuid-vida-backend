const AWS = require('aws-sdk');
const liveness = require('../../../../utils/liveness');
const mail = require('../../../../utils/mail');
const tokenizer = require('../../../../utils/tokenizer');
const vidaLogin = require('../../login');
const shared = require('./shared');
const cuilUtil = require('../../../../utils/cuil');

// Filtros para ubicar a la persona. El CUIL es el identificador valido ante los organismos previsionales
// y fiscales y evita el problema de los DNI duplicados y del prefijo que ya no indica el sexo.
// DNI + sexo se mantiene solo para las versiones anteriores de la app.
const FILTER_BY_CUIL = 'u.cuil = ?';
const FILTER_BY_DNI = 'u.dni = ? and u.sexo = ?';

const rekognition = new AWS.Rekognition();
const tuidVidaConfig = CONFIG.get('vida');

// Estado de Fe de Vida por empresa del usuario. La última certificación se une por usuario y empresa,
// para que las empresas sin certificar sigan apareciendo como PENDING aunque otra ya esté certificada.
const searchQuery = (filter) => `
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
    date(ue.proxima) as proxima,
    if (e.tipo = 'D',
        if(date(a.afecha) is null || DATEDIFF(NOW(),DATE(a.afecha)) > e.periodicidad * 30,
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
    if (e.tipo = 'D', if (a.afecha is not null, date(DATE_ADD(a.afecha, INTERVAL e.periodicidad * 30 DAY)),now()), proxima) as next
    from
        usuario u
        left join usuario_empresa ue on (u.cuil = ue.cuil)
        left join empresa e on (ue.empresa = e.id)
        left join (
            select * from (
                select row_number() over(partition by a2.empresa order by a2.fecha desc) as auxi, a2.id_usuario, a2.fecha as afecha, a2.empresa, a2.auditor as auditor2, a2.similitud
                from auditoria a2 join usuario u on (u.id_usuario = a2.id_usuario)
                where ${filter} and a2.similitud > 1
            ) as asd
            where asd.auxi = 1
        ) as a on (u.id_usuario = a.id_usuario and a.empresa = ue.empresa)
    WHERE u.fecha_fallecido is null and ${filter}
    order by next asc`;

const pendingQuery = (filter) => `select * from (${searchQuery(filter)}) auxi where auxi.status = 'PENDING' or auxi.auditor2 like '%ALERTA%'`;

const VALIDATION_QUERY = `SELECT
    u.id_usuario, u.nombre, u.apellido, u.dni, u.sexo, u.nacimiento, date(now()) as hoy, ue.empresa, u.id_device, u.cuil, e.img, e.link,
    if(ue.empresa = 'EFECTIVO SI', null, ue.proxima) as proxima, u.email, u.telefono, u.estado, u.emailVrf, u.telefonoVrf, a.session_id
    from usuario u left join usuario_empresa ue on (u.cuil = ue.cuil) left join auditoria a on (u.id_usuario = a.id_usuario) left join empresa e on (ue.empresa = e.id)
    WHERE a.id_validacion = ? ORDER BY e.img desc`;

function cleanDoc(document) {
    return document.replace(/\D/g, '').replace(/^0+/, '');
}

function pad(value) {
    return String(value).padStart(2, '0');
}

// dd/mm/yyyy a partir de un Date (la base de vida devuelve DATE como Date en UTC) o de un string yyyy-mm-dd
function formatDate(value) {
    if (!value) return value;
    if (value instanceof Date) {
        return `${pad(value.getUTCDate())}/${pad(value.getUTCMonth() + 1)}/${value.getUTCFullYear()}`;
    }
    return vidaLogin.convert(String(value));
}

function backupTimestamp() {
    const d = new Date();
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function sendError(res, message, details) {
    res.response.message = message;
    if (details !== undefined) res.response.details = details;
    return res.status(200).json(res.response);
}

module.exports.searchdni = async (req, res, next) => {
    res.response = {
        res: 'error',
        status: 200
    };
    // Camino nuevo: CUIL. Camino anterior (apps viejas): DNI + sexo.
    let filter;
    let params;
    if (req.body.cuil !== undefined && req.body.cuil !== null && req.body.cuil !== '') {
        const cuil = cuilUtil.normalize(req.body.cuil);
        if (!cuilUtil.isValid(cuil)) {
            return sendError(res, 'El CUIL ingresado no es válido. Revise los números e inténtelo nuevamente.');
        }
        req.body.cuil = cuil;
        filter = FILTER_BY_CUIL;
        params = [cuil, cuil];
    } else {
        const dni = cleanDoc(String(req.body.dni || ''));
        const sexo = req.body.sexo;
        if (!dni || !sexo) {
            return sendError(res, 'Faltan datos requeridos: cuil');
        }
        req.body.dni = dni;
        filter = FILTER_BY_DNI;
        params = [dni, sexo, dni, sexo];
    }

    let rows;
    try {
        rows = await VIDA_DB.sync_query(searchQuery(filter), params);
    } catch (err) {
        console.log(err);
        return sendError(res, 'Error de conexión con la base de datos', err);
    }

    if (rows.length === 0) {
        res.response.registration = 'NOT_REGISTERED';   // la app lo usa para ofrecer "Registrarse"
        return sendError(res, 'No hemos podido autenticar su identidad.\nPreviamente debe registrarse.\nSi ya lo ha hecho comuníquese mediante el formulario de contacto');
    }
    if (rows[0].empresa == null) {
        return vidaLogin.showNoEntityMessage(req, res, next);
    }
    if (rows[0].estado == 'Desaprobado' || rows[0].estado == 'Revancha') {
        return sendError(res, 'Imposible Certificar Fe de Vida por que su Registración no fue completada o fue desaprobada.\nPóngase en contacto con Soporte a través del formulario de contacto');
    }
    if (rows[0].auditor && rows[0].auditor.includes('ALERTA')) {
        return sendError(res, `Alerta!\n\nSu Registración realizada el día ${formatDate(rows[0].fecha_registro)} ha sido observada por no ajustarse a las normas de calidad y seguridad requerida.\n\nContactese cuanto antes mediante el formulario de contacto o por Whatsapp al +54 911 23443283`);
    }

    const canLogin = rows.some((row) => row.auditor2 && row.auditor2.includes('ALERTA'))
        || rows.some((row) => row.status == 'PENDING');
    if (canLogin) {
        try {
            const sessionId = await liveness.createSession();
            const result = await VIDA_DB.sync_query(
                'INSERT INTO auditoria (id_usuario, fecha, empresa, os, version, appversion, session_id) VALUES (?, NOW(), ?, ?, ?, ?, ?)',
                [rows[0].id_usuario, rows[0].empresa, req.body.os || null, req.body.version || null, req.body.appversion || null, sessionId]
            );
            res.response = {
                res: 'ok',
                status: 200,
                message: 'ok',
                idValidation: result.insertId,
                sessionId
            };
            return res.status(200).json(res.response);
        } catch (err) {
            console.log(err);
            return sendError(res, 'Error de conexíon con la base de datos', err.message || err);
        }
    }

    if (rows.some((row) => row.status == 'OK')) {
        let message = 'Su Fe de Vida se encuentra al día.\n';
        rows.forEach((row) => {
            if (row.validez) {
                message += `Para ${row.empresa} tiene validez hasta ${formatDate(row.validez)}.\n`;
            } else {
                message += `El próximo período de ${row.empresa} comienza ${formatDate(row.next)}.\n`;
            }
        });
        return sendError(res, message);
    }
    if (rows.some((row) => row.status == 'LATE')) {
        return sendError(res, 'Su Fe de Vida ya fue certificada para el presente periodo.\nSi está pendiente su beneficio previsional no es necesario que realice ninguna acción.\nEn lo próximos dias deberá acreditarse.');
    }
    return sendError(res, 'No pudimos determinar el estado de su Fe de Vida. Comuníquese mediante el formulario de contacto');
}

module.exports.loadValidation = async (req, res, next) => {
    res.response = {
        res: 'error',
        status: 200
    };
    const { idValidation, sessionId } = req.body;
    if (!idValidation || !sessionId) {
        return sendError(res, 'Faltan datos requeridos: idValidation, sessionId');
    }
    try {
        const rows = await VIDA_DB.sync_query(VALIDATION_QUERY, [idValidation]);
        if (rows.length === 0) {
            return sendError(res, 'No pudimos encontrar tus datos en nuestra base. Contactanos a través del formulario de contacto');
        }
        if (rows[0].session_id !== sessionId) {
            return sendError(res, 'La sesión de verificación de vida no corresponde a esta validación. Inicie el proceso nuevamente.');
        }
        req.loginUser = rows[0];
        next();
    } catch (err) {
        console.log(err);
        return sendError(res, 'No pudimos encontrar tus datos en nuestra base. Contactanos a través del formulario de contacto', err.message || err);
    }
}

module.exports.checkLiveness = async (req, res, next) => {
    try {
        const result = await shared.validateLivenessSession(req.body.sessionId);
        res.response.livenessStatus = result.livenessStatus;
        if (!result.session) {
            if (result.confidence !== undefined) res.response.confidence = result.confidence;
            return sendError(res, result.message);
        }
        req.liveness = result.session;
        next();
    } catch (err) {
        console.log(err);
        return sendError(res, 'Error al obtener el resultado de la prueba de vida', err.message || err);
    }
}

module.exports.compareSelfie = async (req, res, next) => {
    const base = req.loginUser.dni + req.loginUser.sexo;
    const params = {
        SimilarityThreshold: 1,
        SourceImage: {
            S3Object: {
                Bucket: tuidVidaConfig.bucketName,
                Name: 'usuarios/' + base + '_S.jpeg'
            }
        },
        TargetImage: shared.referenceSource(req.liveness)
    };
    let data;
    try {
        data = await rekognition.compareFaces(params).promise();
    } catch (err) {
        console.log(err);
        return sendError(res, 'Error en la comparacion', err.message || err);
    }

    const similarity = data.FaceMatches && data.FaceMatches.length > 0 ? data.FaceMatches[0].Similarity : 0;
    if (similarity <= tuidVidaConfig.approvePercentage) {
        shared.copyReference(req.liveness, tuidVidaConfig.bucketName + '/temp', base + '.jpeg')
            .catch((err) => console.log('No se pudo guardar la selfie del login fallido', err));
        return sendError(res, `Su identidad no coincide con nuestros registros.
                        Es posible que la foto haya salido movida o con mala iluminación.
                        Comuníquese mediante el formulario de contacto`);
    }

    req.similitud = similarity;
    try {
        await Promise.all([
            shared.copyReference(req.liveness, tuidVidaConfig.bucketName + '/login', base + '.jpeg'),
            shared.copyReference(req.liveness, tuidVidaConfig.bucketName + '/backup', base + '_' + backupTimestamp() + '.jpeg'),
        ]);
    } catch (err) {
        console.log('No se pudo guardar la selfie del login', err);
    }
    next();
}

module.exports.saveLogin = async (req, res, next) => {
    const user = req.loginUser;
    let emps;
    let pendingTasks;
    try {
        // Por CUIL (el usuario ya fue identificado): evita mezclar a dos personas con el mismo DNI y sexo
        emps = await VIDA_DB.sync_query(pendingQuery(FILTER_BY_CUIL), [user.cuil, user.cuil]);
        const empresas = emps.length > 0 ? emps.map((e) => e.empresa) : [null];
        for (const empresa of empresas) {
            await VIDA_DB.sync_query(
                `INSERT INTO auditoria (id_usuario, fecha, id_device, similitud, empresa, latitud, longitud, version, os, direccion, cuil, appversion, session_id, liveness_confidence)
                VALUES (?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [user.id_usuario, req.body.idDevice || null, req.similitud, empresa, req.body.latitud || null, req.body.longitud || null,
                    req.body.version || null, req.body.os || null, req.body.address || null, user.cuil, req.body.appversion || null,
                    req.body.sessionId, req.liveness.Confidence]
            );
        }
        await VIDA_DB.sync_query('UPDATE usuario SET fecha_valida = NOW(), id_device = ? WHERE id_usuario = ?', [req.body.idDevice || user.id_device, user.id_usuario]);
        await VIDA_DB.sync_query('DELETE FROM auditoria WHERE id_validacion = ?', [req.body.idValidation]);
        pendingTasks = await VIDA_DB.sync_query(vidaLogin.newQueries.pendingTasks, [user.id_usuario]);
    } catch (err) {
        console.log(err);
        return sendError(res, `Error en base de datos ${err.message}`, err.message || err);
    }

    const nombresEmpresas = emps.map((e) => e.empresa);
    if (user.email) {
        if (nombresEmpresas.length > 0) {
            mail.send('fedevida4', {
                title: 'Certificación TuID',
                nombre: user.nombre + ' ' + user.apellido,
                cuil: user.cuil,
                nacimiento: user.nacimiento ? formatDate(user.nacimiento) : '01-01-1900',
                fecha_prox: formatDate(user.proxima),
                hoy: formatDate(user.hoy),
                empresas: nombresEmpresas.join(', ')
            }, user.email, null, null);
        } else {
            mail.send('fedevida2', { title: 'Certificación TuID', nombre: user.nombre }, user.email, null, null);
        }
    }

    res.response = {
        res: 'ok',
        status: 200,
        message: 'ok',
        idUser: user.id_usuario,
        name: user.apellido + ', ' + user.nombre,
        banco: nombresEmpresas.length > 0
            ? nombresEmpresas.map((e) => e + '   ').join('')
            : 'No contamos con la Información.\nPuede que su Entidad no se encuentre adherida a nuestro sistema.',
        cuil: user.cuil,
        fecha_valida: user.proxima,
        email: user.email,
        telefono: user.telefono,
        emailVrf: user.emailVrf,
        telefonoVrf: user.telefonoVrf,
        img: user.img,
        link: user.link
    };
    res.response.token = tokenizer.tokenize(res.response);
    res.response.pendingTasks = pendingTasks;
    if (user.estado === 'Confirmacion') {
        res.response.message = 'Debe confirmar alguno de los datos de contacto';
    }
    vidaLogin.verifyLife(user.dni, user.sexo, user.cuil);
    return res.status(200).json(res.response);
}

// Consultas compartidas con account.js (consulta de registro e historial)
module.exports.queries = { searchQuery, FILTER_BY_CUIL };
