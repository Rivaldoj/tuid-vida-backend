const AWS = require('aws-sdk');
const liveness = require('../../../../utils/liveness');
const bucket = require('../../../../utils/bucket');
const slack = require('../../../../utils/slack');
const person = require('../../../padron/person');
const questions = require('../../../padron/questions');
const shared = require('./shared');
const cuilUtil = require('../../../../utils/cuil');
const identidad = require('../../../../utils/identidad');

const rekognition = new AWS.Rekognition();
const tuidVidaConfig = CONFIG.get('vida');

const REQUIRED_DOCUMENT_FIELDS = ['number', 'gender', 'name', 'lastname', 'front', 'back', 'photo'];

function cleanDoc(document) {
    return document.replace(/\D/g, '').replace(/^0+/, '');
}

function cleanName(name) {
    return name
        .replace(/nxx/gi, 'n')
        .replace("'", ' ')
        .replace(/ñ/gi, 'n')
        .toUpperCase()
        .replace(/  /g, ' ');
}

function fileBase(req) {
    return req.body.idDocument.number + req.body.idDocument.gender;
}

function uploadBase64(base64, filename) {
    return new Promise((resolve, reject) => {
        bucket.base64toBucket(base64, filename, tuidVidaConfig.bucketName + '/temp', (err) => err ? reject(err) : resolve());
    });
}

function moveUserFiles(filename) {
    return new Promise((resolve, reject) => {
        bucket.moveUserFiles(filename, tuidVidaConfig.bucketName, '/temp', '/usuarios', (err) => err ? reject(err) : resolve());
    });
}

function sendError(req, res, message, details) {
    res.response.message = message;
    if (details !== undefined) res.response.details = details;
    saveError(req, res);
    return res.status(200).json(res.response);
}

async function saveError(req, res) {
    try {
        const doc = req.body.idDocument || {};
        await VIDA_DB.sync_query(
            'insert into errors (dni, sexo, message, nombre) values(?,?,?,?);',
            [doc.number, doc.gender, res.response.message, `${doc.name} ${doc.lastname}`]
        );
    } catch (err) {
        console.log(err);
    }
}

module.exports.cleanData = async (req, res, next) => {
    res.response = {
        res: 'error',
        status: 200
    };
    const doc = req.body.idDocument;
    const missing = [];
    if (!req.body.sessionId) missing.push('sessionId');
    if (!doc) missing.push('idDocument');
    else REQUIRED_DOCUMENT_FIELDS.forEach((field) => { if (!doc[field]) missing.push('idDocument.' + field); });
    if (missing.length > 0) {
        res.response.message = 'Faltan datos requeridos: ' + missing.join(', ');
        return res.status(200).json(res.response);
    }

    doc.number = String(doc.number).replace(/ /g, '');
    if (doc.number.substr(0, 1) === 'M' || doc.number.substr(0, 1) === 'F') {
        doc.number = doc.number.substr(1);
    }
    doc.number = cleanDoc(doc.number);
    doc.name = cleanName(doc.name);
    doc.lastname = cleanName(doc.lastname);
    next();
}

module.exports.checkBlacklist = async (req, res, next) => {
    try {
        const rows = await VIDA_DB.sync_query(
            'SELECT CUIL FROM lista_negra WHERE dni=? and sexo=? and activo=1',
            [req.body.idDocument.number, req.body.idDocument.gender]
        );
        if (rows.length > 0) {
            return sendError(req, res, 'Este DNI se encuentra en la lista negra', 'Este DNI se encuentra en la lista negra');
        }
        next();
    } catch (err) {
        console.log(err);
        return sendError(req, res, 'Error de conexion con base de datos', 'Error de conexion con base de datos');
    }
}

module.exports.verifyRecords = async (req, res, next) => {
    const params = [req.body.idDocument.number, req.body.idDocument.gender];
    try {
        const rows = await VIDA_DB.sync_query('SELECT estado FROM usuario WHERE dni=? and sexo=?', params);
        if (rows.length > 0) {
            if (rows[0].estado === 'Ok' || rows[0].estado === 'Confirmacion') {
                return sendError(req, res, 'Usted ya se encuentra registrado. Para concluir el trámite ingrese a la opción Fe de vida');
            }
            await VIDA_DB.sync_query('DELETE FROM usuario WHERE dni=? and sexo=?', params);
        }
        next();
    } catch (err) {
        console.log(err);
        return sendError(req, res, 'Problema de conexion, vuelva a intentarlo mas tarde');
    }
}

module.exports.checkMaster = async (req, res, next) => {
    try {
        const doc = req.body.idDocument;
        const declaredCuil = cuilUtil.isValid(req.body.cuil) ? cuilUtil.normalize(req.body.cuil) : null;
        let row;
        if (declaredCuil) {
            // El CUIL escrito por la persona se busca en el padron y se compara con el DNI, sexo, nombre y apellido del documento
            row = await person.findByCuil(declaredCuil);
        } else {
            const found = await person.findPerson(doc.number, doc.gender);
            row = found ? found.row : null;
        }
        if (!row) {
            res.response.status = 204;
            slack.error(doc.number + ' ' + doc.gender + ' No pudo registrarse por que no figura en los registros');
            return sendError(req, res, 'No se encontraron datos en nuestros registros. Comuniquese mediante el formulario de contacto para que podamos resolver su inconveniente.');
        }
        if (declaredCuil) {
            const result = identidad.compare({ cuil: declaredCuil, number: doc.number, gender: doc.gender, name: doc.name, lastname: doc.lastname }, row);
            if (!result.ok) {
                res.response.status = 204;
                slack.error(doc.number + ' ' + doc.gender + ' Registro rechazado: el documento no coincide con el padron (' + result.motivo + ')');
                return sendError(req, res, 'Los datos de su documento no coinciden con nuestros registros (CUIL, nombre o apellido). Verifique el CUIL ingresado o comuniquese mediante el formulario de contacto para que podamos resolver su inconveniente.');
            }
        }
        req.masterData = row;
        next();
    } catch (err) {
        console.log(err);
        return sendError(req, res, 'Error de conexión a la base de datos master', 'Error de conexión a la base de datos master');
    }
}

module.exports.checkLiveness = async (req, res, next) => {
    try {
        const result = await shared.validateLivenessSession(req.body.sessionId);
        res.response.livenessStatus = result.livenessStatus;
        if (!result.session) {
            if (result.confidence !== undefined) res.response.confidence = result.confidence;
            return sendError(req, res, result.message);
        }
        req.liveness = result.session;
        next();
    } catch (err) {
        console.log(err);
        return sendError(req, res, 'Error al obtener el resultado de la prueba de vida', err.message || err);
    }
}

module.exports.uploadImages = async (req, res, next) => {
    const namefile = fileBase(req) + '_';
    try {
        await Promise.all([
            uploadBase64(req.body.idDocument.front, namefile + 'F.jpeg'),
            uploadBase64(req.body.idDocument.back, namefile + 'B.jpeg'),
            uploadBase64(req.body.idDocument.photo, namefile + 'P.jpeg'),
            shared.copyReference(req.liveness, tuidVidaConfig.bucketName + '/temp', namefile + 'S.jpeg'),
        ]);
        next();
    } catch (err) {
        console.log('No se pudieron subir las imagenes a AWS S3', err);
        return sendError(req, res, 'No se pudieron subir las imágenes. Intente nuevamente o comuniquese a través del formulario de contacto');
    }
}

module.exports.validateUser = async (req, res, next) => {
    const params = {
        SimilarityThreshold: 1,
        SourceImage: shared.referenceSource(req.liveness),
        TargetImage: {
            S3Object: {
                Bucket: tuidVidaConfig.bucketName,
                Name: 'temp/' + fileBase(req) + '_P.jpeg'
            }
        }
    };
    let data;
    try {
        data = await rekognition.compareFaces(params).promise();
    } catch (err) {
        console.log(err);
        const message = 'No hemos podido detectar un rostro en las imagenes provistas. Esto es muy frecuente en documentos poco legibles. Comuniquese con nosotros a través del formulario de contacto y resolveremos el inconveniente.';
        return sendError(req, res, message, message);
    }

    if (!data.FaceMatches || data.FaceMatches.length === 0) {
        return sendError(req, res, 'No se reconoce ningun rostro en la foto, por favor verifique la calidad de la misma');
    }

    req.body.similitud = data.FaceMatches[0].Similarity;
    res.response.similarity = req.body.similitud;

    try {
        if (req.body.similitud < tuidVidaConfig.revengePercentage) {
            req.body.estado = 'Error';
            return sendError(req, res, 'No nos fue posible realizar la Autenticación.\n Su información Personal y los datos Biométricos obtenidos no son coincidentes.\nPor favor verifique el encuadre e iluminación e intente nuevamente.\nPruebe encender el Flash. \n');
        }
        if (req.body.similitud < tuidVidaConfig.approvePercentage) {
            res.response.message = 'chance';
            req.body.estado = 'Revancha';
            const generated = await questions.generateQuestion(req.masterData);
            if (!generated) {
                return sendError(req, res, 'No hay datos para generar la pregunta de validación');
            }
            req.body.pregunta = generated.pregunta;
            req.body.respuesta = generated.respuesta;
            res.response.question = generated.question;
            return next();
        }
        await moveUserFiles(fileBase(req));
        res.response.message = 'ok';
        req.body.estado = 'Verificar';
        next();
    } catch (err) {
        console.log(err);
        return sendError(req, res, req.body.estado === 'Revancha' ? 'Error al generar la pregunta de validación' : 'Error al subir imagen');
    }
}

module.exports.createUser = async (req, res, next) => {
    const doc = req.body.idDocument;
    const master = req.masterData;
    if (req.body.similitud < 60 && req.body.similitud > 55) {
        req.body.similitud = req.body.similitud + 5;
    }
    try {
        const empresas = await VIDA_DB.sync_query('SELECT empresa FROM usuario_empresa WHERE cuil=?', [master.CUIL]);
        const user = {
            dni: master.DNI,
            sexo: master.Sexo,
            nombre: doc.name,
            apellido: doc.lastname,
            tramite: doc.tramit || null,
            nacimiento: doc.birth || null,
            vencimiento: doc.expires || null,
            direccion: null,
            id_pregunta: req.body.pregunta || null,
            id_respuesta: req.body.pregunta ? req.body.respuesta : null,
            estado: req.body.estado,
            similitud: req.body.similitud,
            id_device: req.body.idDevice || null,
            cuil: master.CUIL,
            valback: null,
            valfront: null,
            empresa: empresas.length > 0 ? empresas[0].empresa : 'Sin informacion',
            os: req.body.os || null,
            version: req.body.version || null,
            tipo: doc.type || null,
            pais: doc.pais ? String(doc.pais).trim().toUpperCase().substr(0, 20) : null,
            nfc: doc.nfc ? 1 : 0,
            nfc_opencode: doc.nfcCode || null,
            ejemplar: doc.example || null,
            latitud: req.body.latitud || null,
            longitud: req.body.longitud || null,
            appversion: req.body.appversion || null,
            serial_number: doc.serialNumber || null,
            barcode: doc.barcode || null,
            mrz: doc.mrz || null,
        };
        const result = await VIDA_DB.sync_query('INSERT INTO usuario SET ?, fecha=now()', [user]);
        res.response.res = 'ok';
        res.response.iduser = result.insertId;
        return res.status(200).json(res.response);
    } catch (err) {
        console.log(err);
        res.response = {
            message: 'No se pudo crear el registro de usuario',
            details: 'No se pudo crear el registro de usuario',
            res: 'error',
            status: 400
        };
        saveError(req, res);
        return res.status(200).json(res.response);
    }
}

module.exports.session = async (req, res) => {
    try {
        const sessionId = await liveness.createSession();
        return res.status(200).json({ sessionId });
    } catch (error) {
        console.log("Error creando la sesión de liveness", error);
        res.response.res = 'error';
        res.response.status = 400;
        res.response.message = 'Error creando la sesión de liveness';
        res.response.details = error.message || error;
        return res.status(200).json(res.response);
    }
}
