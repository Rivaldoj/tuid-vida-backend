const crypto = require('crypto');

const HEADERS = {
    id: 'X-Tuid-Webhook-Id',
    timestamp: 'X-Tuid-Timestamp',
    keyId: 'X-Tuid-Key-Id',
    signature: 'X-Tuid-Signature',
};
const DEFAULT_TOLERANCE_SEC = 300;

const keyCache = new Map();

function settings() {
    return CONFIG.has('authenticator.webhookSigning') ? CONFIG.get('authenticator.webhookSigning') : null;
}

function enabled() {
    const s = settings();
    return Boolean(s && s.enabled && s.kid && s.privateKey);
}

function privateKeyObject(pem) {
    if (!keyCache.has(pem)) keyCache.set(pem, crypto.createPrivateKey(pem));
    return keyCache.get(pem);
}

function publicKeyObject(pem) {
    if (!keyCache.has(pem)) keyCache.set(pem, crypto.createPublicKey(pem));
    return keyCache.get(pem);
}

// El receptor verifica sobre estos mismos bytes: `${timestamp}.${body}` con el body crudo tal como llega
function signingInput(timestamp, body) {
    return Buffer.from(`${timestamp}.${body}`, 'utf8');
}

function signedRequest(payload, options = {}) {
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const headers = { 'Content-Type': 'application/json' };
    if (!enabled()) return { body, headers, signed: false };

    const s = settings();
    const timestamp = options.timestamp || Math.floor(Date.now() / 1000);
    const signature = crypto.sign('sha256', signingInput(timestamp, body), privateKeyObject(s.privateKey));
    headers[HEADERS.id] = options.webhookId || crypto.randomUUID();
    headers[HEADERS.timestamp] = String(timestamp);
    headers[HEADERS.keyId] = s.kid;
    headers[HEADERS.signature] = signature.toString('base64');
    return { body, headers, signed: true, webhookId: headers[HEADERS.id] };
}

function publicKeys() {
    const s = settings();
    return (s && s.publicKeys) || [];
}

function jwks() {
    return {
        keys: publicKeys().map(({ kid, pem }) => ({
            ...publicKeyObject(pem).export({ format: 'jwk' }),
            kid,
            alg: 'ES256',
            use: 'sig',
        })),
    };
}

function activePublicKeyPem() {
    const s = settings();
    const active = s && publicKeys().find((key) => key.kid === s.kid);
    return active ? active.pem : null;
}

function header(headers, name) {
    const found = Object.keys(headers).find((key) => key.toLowerCase() === name.toLowerCase());
    return found ? headers[found] : undefined;
}

// publicKeysByKid: { [kid]: PEM | JWK | KeyObject }
function verify(rawBody, headers, publicKeysByKid, toleranceSec = DEFAULT_TOLERANCE_SEC, nowSec = Math.floor(Date.now() / 1000)) {
    const timestamp = header(headers, HEADERS.timestamp);
    const kid = header(headers, HEADERS.keyId);
    const signature = header(headers, HEADERS.signature);
    if (!timestamp || !kid || !signature) return { valid: false, reason: 'faltan headers de firma' };
    if (!/^\d+$/.test(timestamp) || Math.abs(nowSec - Number(timestamp)) > toleranceSec) {
        return { valid: false, reason: 'timestamp fuera de la ventana permitida' };
    }
    const key = publicKeysByKid[kid];
    if (!key) return { valid: false, reason: `kid desconocido: ${kid}` };

    const keyObject = key instanceof crypto.KeyObject ? key
        : typeof key === 'string' ? publicKeyObject(key)
        : crypto.createPublicKey({ key, format: 'jwk' });
    const valid = crypto.verify('sha256', signingInput(timestamp, String(rawBody)), keyObject, Buffer.from(signature, 'base64'));
    return valid ? { valid: true } : { valid: false, reason: 'firma invalida' };
}

module.exports = {
    HEADERS,
    enabled,
    signedRequest,
    jwks,
    activePublicKeyPem,
    verify,
};
