// Notificaciones push con FCM HTTP v1 (la API "legacy" fcm/send fue dada de baja por Google).
// Se autentica con la cuenta de servicio de Firebase: el archivo .json NO va en el repositorio, su ruta sale de la configuracion
// (`fcm.serviceAccountFile`) o de la variable de entorno GOOGLE_APPLICATION_CREDENTIALS. Sin dependencias nuevas: el JWT se firma con crypto.
const crypto = require('crypto');
const fs = require('fs');
const request = require('request');

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
let cuenta = null;           // { project_id, client_email, private_key, token_uri }
let tokenCache = null;       // { valor, vence }

function rutaCredenciales() {
    if (typeof CONFIG !== 'undefined' && CONFIG.has('fcm.serviceAccountFile')) return CONFIG.get('fcm.serviceAccountFile');
    return process.env.GOOGLE_APPLICATION_CREDENTIALS || null;
}

function cargarCuenta() {
    if (cuenta) return cuenta;
    const ruta = rutaCredenciales();
    if (!ruta) throw new Error('Push sin configurar: falta fcm.serviceAccountFile (ruta al JSON de la cuenta de servicio de Firebase)');
    const c = JSON.parse(fs.readFileSync(ruta, 'utf8'));
    if (!c.project_id || !c.client_email || !c.private_key) throw new Error('El archivo de la cuenta de servicio de Firebase no es valido');
    cuenta = c;
    return cuenta;
}

const b64url = (b) => Buffer.from(b).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

function armarJwt(c, ahora) {
    const cabecera = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const cuerpo = b64url(JSON.stringify({ iss: c.client_email, scope: SCOPE, aud: c.token_uri || 'https://oauth2.googleapis.com/token', iat: ahora, exp: ahora + 3600 }));
    const firma = crypto.createSign('RSA-SHA256').update(cabecera + '.' + cuerpo).sign(c.private_key);
    return cabecera + '.' + cuerpo + '.' + b64url(firma);
}

function post(opciones) {
    return new Promise((resolve, reject) => request(opciones, (err, resp, body) => (err ? reject(err) : resolve({ status: resp.statusCode, body }))));
}

async function accessToken() {
    const ahora = Math.floor(Date.now() / 1000);
    if (tokenCache && tokenCache.vence - 60 > ahora) return tokenCache.valor;
    const c = cargarCuenta();
    const r = await post({
        method: 'POST', uri: c.token_uri || 'https://oauth2.googleapis.com/token', json: true,
        form: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: armarJwt(c, ahora) }
    });
    if (r.status !== 200 || !r.body || !r.body.access_token) throw new Error('Firebase no entrego el token de acceso (' + r.status + ')');
    tokenCache = { valor: r.body.access_token, vence: ahora + (r.body.expires_in || 3600) };
    return tokenCache.valor;
}

// Los datos de FCM v1 deben ser texto
function datosComoTexto(data) {
    const out = {};
    Object.keys(data || {}).forEach((k) => { out[k] = String(data[k]); });
    return out;
}

// Devuelve { ok: true } o { ok: false, motivo, tokenInvalido } (tokenInvalido = el dispositivo ya no existe: conviene dejar de usarlo)
module.exports.sendAsync = async (to, title, text, data) => {
    try {
        if (!to) return { ok: false, motivo: 'sin token de dispositivo' };
        const c = cargarCuenta();
        const message = { token: to, notification: { title, body: text } };
        // titulo y mensaje tambien como datos: la app los guarda en "Mis avisos" aunque la notificacion la muestre el sistema
        message.data = Object.assign({ titulo: String(title || ''), mensaje: String(text || '') }, datosComoTexto(data));
        const r = await post({
            method: 'POST', uri: 'https://fcm.googleapis.com/v1/projects/' + c.project_id + '/messages:send', json: true,
            headers: { Authorization: 'Bearer ' + (await accessToken()) }, body: { message }
        });
        if (r.status === 200) return { ok: true };
        const estado = r.body && r.body.error && r.body.error.status;
        return { ok: false, motivo: estado || ('HTTP ' + r.status), tokenInvalido: estado === 'NOT_FOUND' || estado === 'UNREGISTERED' };
    } catch (err) {
        return { ok: false, motivo: err.message };
    }
};

// Compatibilidad con el codigo existente (no espera el resultado)
module.exports.send = async (to, title, text, data) => {
    const r = await module.exports.sendAsync(to, title, text, data);
    if (!r.ok) console.log('[push] no se pudo enviar:', r.motivo);
};

module.exports._armarJwt = armarJwt; // para pruebas
