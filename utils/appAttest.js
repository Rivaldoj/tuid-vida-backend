const crypto = require('crypto');
const { verifyAttestation, verifyAssertion } = require('appattest-checker-node');

function globalDefaults() {
    return (CONFIG.get('authenticator') || {}).appAttest || {};
}

function getConfig(client) {
    const globalCfg = globalDefaults();
    const local = (client && client.appAttest) || {};
    const bundleId = local.bundleId || (client && client.package) || '';
    return {
        teamId: local.teamId || globalCfg.teamId || '',
        bundleId: bundleId,
        environment: local.environment || globalCfg.environment || 'development',
        challengeTtlMinutes: local.challengeTtlMinutes || globalCfg.challengeTtlMinutes || 15
    };
}

function isConfigured(client) {
    const cfg = getConfig(client);
    return !!(cfg.teamId && cfg.bundleId);
}

function appId(client) {
    const { teamId, bundleId } = getConfig(client);
    return teamId + '.' + bundleId;
}

function isDevelopment(client) {
    return getConfig(client).environment !== 'production';
}

function toBuffer(value) {
    if (!value) return Buffer.alloc(0);
    if (Buffer.isBuffer(value)) return value;
    return Buffer.from(String(value), 'base64');
}

function assertionClientDataHash(challenge, rawBody) {
    const bodyHash = crypto.createHash('sha256').update(rawBody || Buffer.alloc(0)).digest();
    return crypto.createHash('sha256')
        .update(Buffer.from(String(challenge), 'utf8'))
        .update(bodyHash)
        .digest();
}

async function checkAttestation(client, keyId, challenge, attestation) {
    const result = await verifyAttestation(
        {
            appId: appId(client),
            developmentEnv: isDevelopment(client)
        },
        keyId,
        Buffer.from(String(challenge), 'utf8'),
        toBuffer(attestation)
    );
    if (result && result.verifyError) {
        const err = new Error(result.verifyError);
        err.verifyError = result.verifyError;
        throw err;
    }
    return result;
}

async function checkAssertion(client, clientDataHash, publicKeyPem, assertion) {
    const result = await verifyAssertion(
        clientDataHash,
        publicKeyPem,
        appId(client),
        toBuffer(assertion)
    );
    if (result && result.verifyError) {
        const err = new Error(result.verifyError);
        err.verifyError = result.verifyError;
        throw err;
    }
    return result;
}

module.exports = {
    getConfig,
    isConfigured,
    appId,
    assertionClientDataHash,
    checkAttestation,
    checkAssertion
};
