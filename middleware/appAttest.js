const appAttest = require('../utils/appAttest');
const attestService = require('../services/authenticator/v2/attest');

function missingAttest(req, reason) {
    req.appAttest = { verified: false, reason: reason, keyId: null };
    console.log('App Attest: ' + reason);
    return req.appAttest;
}

module.exports = async function (req, res, next) {
    req.appAttest = { verified: false, reason: 'missing', keyId: null };

    const keyId = req.headers['x-app-attest-keyid'];
    const challenge = req.headers['x-app-attest-challenge'];
    const assertion = req.headers['x-app-attest-assertion'];

    if (!keyId || !challenge || !assertion) {
        missingAttest(req, 'missing');
        return next();
    }

    req.appAttest.keyId = keyId;

    if (!appAttest.isConfigured(req.client)) {
        missingAttest(req, 'not_configured');
        req.appAttest.keyId = keyId;
        return next();
    }

    if (req.body && req.body.sessionId && req.body.sessionId !== challenge) {
        missingAttest(req, 'challenge_mismatch');
        req.appAttest.keyId = keyId;
        return next();
    }

    try {
        const clientId = req.client && req.client.id;
        const challenges = await attestService.findValidChallenge(challenge, clientId);
        if (!challenges || !challenges[0]) {
            missingAttest(req, 'challenge_invalid');
            req.appAttest.keyId = keyId;
            return next();
        }

        const keys = await attestService.findKey(keyId, clientId);
        if (!keys || !keys[0]) {
            missingAttest(req, 'key_not_enrolled');
            req.appAttest.keyId = keyId;
            return next();
        }

        const record = keys[0];
        const expectedAppId = appAttest.appId(req.client);
        if (record.app_id && record.app_id !== expectedAppId) {
            missingAttest(req, 'app_id_mismatch');
            req.appAttest.keyId = keyId;
            return next();
        }

        const clientDataHash = appAttest.assertionClientDataHash(challenge, req.rawBody);
        const result = await appAttest.checkAssertion(req.client, clientDataHash, record.public_key, assertion);

        if (result.signCount <= record.counter) {
            missingAttest(req, 'counter_replay');
            req.appAttest.keyId = keyId;
            return next();
        }

        await attestService.updateKeyAfterAssertion(keyId, result.signCount);
        await attestService.markChallengeUsed(challenge);

        req.appAttest = { verified: true, reason: 'ok', keyId: keyId };
        console.log('App Attest: verified keyId=' + keyId + ' client=' + clientId);
        return next();
    } catch (err) {
        console.log('App Attest: invalid', err.verifyError || err.message);
        req.appAttest = {
            verified: false,
            reason: err.verifyError || err.message || 'invalid',
            keyId: keyId
        };
        return next();
    }
};
