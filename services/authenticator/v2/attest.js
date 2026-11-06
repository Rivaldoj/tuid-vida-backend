const crypto = require('crypto');
const appAttest = require('../../../utils/appAttest');

function saveChallenge(challenge, client, callback) {
    const clientId = client && (typeof client === 'string' ? client : client.id);
    const ttl = appAttest.getConfig(client).challengeTtlMinutes;
    AUTHENTICATOR_DB.query(
        `INSERT INTO app_attest_challenge (challenge, client_id, expires_at, used)
         VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE), 0)
         ON DUPLICATE KEY UPDATE
            client_id = VALUES(client_id),
            expires_at = VALUES(expires_at),
            used = 0`,
        [challenge, clientId, ttl],
        function (err) {
            if (err) console.log('App Attest: error guardando challenge', err);
            if (callback) callback(err);
        }
    );
}

function findValidChallenge(challenge, clientId) {
    return AUTHENTICATOR_DB.sync_query(
        `SELECT challenge, client_id, used, expires_at
         FROM app_attest_challenge
         WHERE challenge = ? AND client_id = ? AND used = 0 AND expires_at > UTC_TIMESTAMP()`,
        [challenge, clientId]
    );
}

function markChallengeUsed(challenge) {
    return AUTHENTICATOR_DB.sync_query(
        'UPDATE app_attest_challenge SET used = 1 WHERE challenge = ?',
        [challenge]
    );
}

function findKey(keyId, clientId) {
    return AUTHENTICATOR_DB.sync_query(
        'SELECT key_id, public_key, counter, app_id, client_id, id_usuario FROM app_attest_keys WHERE key_id = ? AND client_id = ?',
        [keyId, clientId]
    );
}

function upsertKey({ keyId, publicKeyPem, receipt, client }) {
    return AUTHENTICATOR_DB.sync_query(
        `INSERT INTO app_attest_keys
            (key_id, public_key, counter, app_id, client_id, receipt, created_at, last_used_at)
         VALUES (?, ?, 0, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
         ON DUPLICATE KEY UPDATE
            public_key = VALUES(public_key),
            counter = 0,
            app_id = VALUES(app_id),
            client_id = VALUES(client_id),
            receipt = VALUES(receipt),
            last_used_at = UTC_TIMESTAMP()`,
        [keyId, publicKeyPem, appAttest.appId(client), client.id, receipt || null]
    );
}

function updateKeyAfterAssertion(keyId, signCount) {
    return AUTHENTICATOR_DB.sync_query(
        `UPDATE app_attest_keys
         SET counter = ?, last_used_at = UTC_TIMESTAMP()
         WHERE key_id = ?`,
        [signCount, keyId]
    );
}

function bindKeyToUser(keyId, idUsuario) {
    return AUTHENTICATOR_DB.sync_query(
        'UPDATE app_attest_keys SET id_usuario = ?, last_used_at = UTC_TIMESTAMP() WHERE key_id = ?',
        [idUsuario, keyId]
    );
}

function saveChallengeAsync(challenge, client) {
    return new Promise(function (resolve) {
        saveChallenge(challenge, client, resolve);
    });
}

module.exports.getChallenge = async function (req, res) {
    if (!req.client || !req.client.id) {
        return res.status(200).json({
            res: 'error',
            status: 400,
            message: 'Cliente no encontrado'
        });
    }

    const challenge = crypto.randomUUID();
    await saveChallengeAsync(challenge, req.client);
    return res.status(200).json({ challenge: challenge });
};

module.exports.enroll = async function (req, res) {
    res.response = res.response || { status: 400, res: 'error' };
    res.response.status = 400;
    res.response.res = 'error';

    const keyId = req.body && req.body.keyId;
    const attestation = req.body && req.body.attestation;
    const challenge = req.body && req.body.challenge;

    if (!keyId || !attestation || !challenge) {
        res.response.message = 'Faltan keyId, attestation o challenge';
        return res.status(200).json(res.response);
    }

    if (!req.client || !req.client.id) {
        res.response.message = 'Cliente no encontrado';
        return res.status(200).json(res.response);
    }

    if (!appAttest.isConfigured(req.client)) {
        res.response.message = 'App Attest no configurado para esta marca';
        return res.status(200).json(res.response);
    }

    try {
        const rows = await findValidChallenge(challenge, req.client.id);
        if (!rows || !rows[0]) {
            res.response.message = 'Challenge inválido o vencido';
            return res.status(200).json(res.response);
        }

        const result = await appAttest.checkAttestation(req.client, keyId, challenge, attestation);
        await upsertKey({
            keyId: keyId,
            publicKeyPem: result.publicKeyPem,
            receipt: result.receipt || null,
            client: req.client
        });
        console.log('Key enrolada correctamente con id: ', keyId);
        res.response.res = 'ok';
        res.response.status = 200;
        res.response.message = 'Key enrolada';
        res.response.keyId = keyId;
        return res.status(200).json(res.response);
    } catch (err) {
        console.log('App Attest enroll error', err);
        res.response.message = 'Attestation inválida';
        res.response.details = err.verifyError || err.message;
        return res.status(200).json(res.response);
    }
};

module.exports.saveChallenge = saveChallenge;
module.exports.findValidChallenge = findValidChallenge;
module.exports.markChallengeUsed = markChallengeUsed;
module.exports.findKey = findKey;
module.exports.updateKeyAfterAssertion = updateKeyAfterAssertion;
module.exports.bindKeyToUser = bindKeyToUser;
