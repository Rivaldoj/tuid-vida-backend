// Uso: node scripts/generateWebhookKeys.js [kid]
// Genera un par ECDSA P-256 (ES256) para firmar webhooks. No escribe archivos: pegar la salida en authenticator.webhookSigning
const crypto = require('crypto');

const now = new Date();
const kid = process.argv[2] || `tuid-wh-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
});

console.log('--- Clave privada (no compartir) ---\n' + privateKey);
console.log('--- Clave publica ---\n' + publicKey);
console.log('--- Bloque para authenticator.webhookSigning ---');
console.log(JSON.stringify({
    enabled: true,
    kid,
    privateKey,
    publicKeys: [{ kid, pem: publicKey }],
}, null, 4));
console.log('\nPara rotar: agregar la nueva clave a publicKeys, esperar que venza el cache del JWKS (1 h), cambiar kid/privateKey y luego retirar la clave vieja.');
