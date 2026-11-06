const argentinaAddress = require('./../../../resources/AR_min.json');
const tokenizer = require('../../../utils/tokenizer');
const webhook = require('../../../utils/webhooks');
const AWS = require('aws-sdk');
const s3 = new AWS.S3();

const REQUIRED_FIELDS = ['pais', 'provincia', 'localidad', 'codigoPostal', 'calle', 'numero'];

function canMarkOk(settings, user) {
    const mailOk = !settings.mailValidationMandatory || !!user.emailVrf;
    const phoneOk = !settings.phoneValidationMandatory || !!user.telefonoVrf;
    const addressOk = !settings.addressValidationMandatory || !!user.addressVrf;
    return mailOk && phoneOk && addressOk;
}

function buildWebhookPayload(req, user, address) {
    const bucket = CONFIG.get('authenticator').bucketName;
    const folder = req.client.bucketFolder || req.client.id;
    const keyBase = 'usuarios/' + folder + '/' + user.dni + user.sexo;
    console.log(address);
    let addressObj = address
    delete addressObj.token;
    delete addressObj.data;

    return {
        text: 'Nueva alta',
        data: {
            nombre: user.nombre,
            apellido: user.apellido,
            dni: user.dni,
            cuil: user.cuil,
            email: user.email,
            telefono: user.telefono,
            address: addressObj,
            nfc: user.nfc ? user.nfc : false,
            tipo: user.tipo,
            ejemplar: user.ejemplar,
            sexo: user.sexo,
            tramite: user.tramite,
            nacimiento: user.nacimiento,
            secured : user.attestVrf, // luego indicar lo de android
            front: s3.getSignedUrl('getObject', { Bucket: bucket, Key: keyBase + '_F.jpeg', Expires: 10000000 }),
            back: s3.getSignedUrl('getObject', { Bucket: bucket, Key: keyBase + '_B.jpeg', Expires: 10000000 }),
            docPhoto: s3.getSignedUrl('getObject', { Bucket: bucket, Key: keyBase + '_P.jpeg', Expires: 10000000 }),
            selfie: s3.getSignedUrl('getObject', { Bucket: bucket, Key: keyBase + '_S.jpeg', Expires: 10000000 })
        },
        meta: req.pepData
    };
}

module.exports.getLocalities = (req, res) => {
    return res.status(200).json(argentinaAddress);
};

module.exports.updateAddress = (req, res) => {
    res.response = res.response || { status: 400, res: 'error' };
    res.response.status = 400;
    res.response.res = 'error';

    if (!req.body.token) {
        res.response.message = 'Falta indicar el token';
        return res.status(200).json(res.response);
    }

    const missing = REQUIRED_FIELDS.filter((f) => !req.body[f] && req.body[f] !== 0);
    if (missing.length) {
        res.response.message = 'Faltan campos de dirección: ' + missing.join(', ');
        return res.status(200).json(res.response);
    }



    const user = req.user;
    const upsertSql = `INSERT INTO usuario_direccion
                (idUsuario, pais, provincia, localidad, codigoPostal, calle, numero, piso, depto, codigoUta, fecha)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())
                ON DUPLICATE KEY UPDATE
                    pais = VALUES(pais),
                    provincia = VALUES(provincia),
                    localidad = VALUES(localidad),
                    codigoPostal = VALUES(codigoPostal),
                    calle = VALUES(calle),
                    numero = VALUES(numero),
                    piso = VALUES(piso),
                    depto = VALUES(depto),
                    codigoUta = VALUES(codigoUta),
                    fecha = UTC_TIMESTAMP()`;

    const upsertParams = [
        user.idUsuario,
        req.body.pais,
        req.body.provincia,
        req.body.localidad,
        req.body.codigoPostal,
        req.body.calle,
        req.body.numero,
        req.body.piso || null,
        req.body.depto || null,
        req.body.codigoUta || null
    ];

    AUTHENTICATOR_DB.query(upsertSql, upsertParams, function (err) {
        if (err) {
            console.log(err);
            res.response.message = 'Error de conexión con la base de datos';
            return res.status(200).json(res.response);
        }

        user.addressVrf = 1;
        const markOk = canMarkOk(req.client.settings || {}, user);
        const estado = markOk ? 'Ok' : (user.estado || 'Verificar');
        const updateUserSql = markOk
            ? "UPDATE usuarios SET addressVrf = 1, estado = 'Ok' WHERE idUsuario = ?"
            : 'UPDATE usuarios SET addressVrf = 1 WHERE idUsuario = ?';

        AUTHENTICATOR_DB.query(updateUserSql, [user.idUsuario], function (err) {
            if (err) {
                console.log(err);
                res.response.message = 'Error de conexión con la base de datos';
                return res.status(200).json(res.response);
            }

            user.estado = estado;
            res.response.res = 'ok';
            res.response.status = 200;
            res.response.message = estado;
            res.response.addressVrf = true;
            console.log(res.response);
            if (estado === 'Ok' && req.client.webhook != null) {
                webhook.notify(req.client.webhook, buildWebhookPayload(req, user, req.body), function () { }, req.client.id);
            }

            return res.status(200).json(res.response);
        });
    });

};
