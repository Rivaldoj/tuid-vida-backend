// Uso: node scripts/testWebhookSignature.js
// Prueba firma ES256 + cola/reintentos de webhooks (sin Slack real; HTTP solo a localhost)
global.APP_PATH = __dirname + '/..';
process.env.NODE_CONFIG_DIR = APP_PATH + '/config/';
global.CONFIG = require('config');
global.TESTING = false;

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');

require.cache[require.resolve('../utils/slack')] = { exports: { autenticador() {}, error() {}, debug() {} } };

const signer = require('../utils/webhookSigner');

let failures = 0;
function check(label, condition, detail) {
    if (!condition) failures++;
    console.log(`${condition ? 'OK   ' : 'FALLA'} ${label}${detail ? ' - ' + detail : ''}`);
}

function keysByKid() {
    return Object.fromEntries(signer.jwks().keys.map((jwk) => [jwk.kid, jwk]));
}

function opensslVerify(pem, data, signatureB64) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whsig-'));
    try {
        fs.writeFileSync(path.join(dir, 'pub.pem'), pem);
        fs.writeFileSync(path.join(dir, 'data.bin'), data);
        fs.writeFileSync(path.join(dir, 'sig.der'), Buffer.from(signatureB64, 'base64'));
        return execFileSync('openssl', ['dgst', '-sha256', '-verify', 'pub.pem', '-signature', 'sig.der', 'data.bin'], { cwd: dir }).toString().trim();
    } catch (err) {
        return (err.stdout || '').toString().trim() || err.message;
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

// Memoria que imita AUTHENTICATOR_DB.query para webhook_deliveries
function mockDb() {
    const rows = new Map();
    let seq = 1;
    function query(sql, params, cb) {
        if (typeof params === 'function') { cb = params; params = []; }
        const s = sql.replace(/\s+/g, ' ').trim();
        setImmediate(() => {
            try {
                if (s.startsWith('INSERT INTO webhook_deliveries')) {
                    const id = seq++;
                    const [webhook_id, endpoint, aplicacion, payload] = params;
                    rows.set(id, {
                        id, webhook_id, endpoint, aplicacion, payload,
                        status: 'pending', attempts: 0,
                        next_attempt_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
                        last_status_code: null, last_error: null,
                        last_attempt_at: null, delivered_at: null,
                        created_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
                    });
                    return cb(null, { insertId: id, affectedRows: 1 });
                }
                if (s.includes("status = 'delivered'")) {
                    const [attempts, statusCode, id] = params;
                    const row = rows.get(id);
                    if (!row) return cb(null, { affectedRows: 0 });
                    Object.assign(row, { status: 'delivered', attempts, last_status_code: statusCode, last_error: null, delivered_at: new Date() });
                    return cb(null, { affectedRows: 1 });
                }
                if (s.includes("status = 'dead'")) {
                    const [attempts, statusCode, errorMsg, id] = params;
                    const row = rows.get(id);
                    if (!row) return cb(null, { affectedRows: 0 });
                    Object.assign(row, { status: 'dead', attempts, last_status_code: statusCode, last_error: errorMsg });
                    return cb(null, { affectedRows: 1 });
                }
                if (s.includes("status = 'pending', attempts = 0")) {
                    const [id] = params;
                    const row = rows.get(id);
                    if (!row || row.status === 'delivered') return cb(null, { affectedRows: 0 });
                    Object.assign(row, { status: 'pending', attempts: 0, last_error: null, last_status_code: null, next_attempt_at: new Date().toISOString().slice(0, 19).replace('T', ' ') });
                    return cb(null, { affectedRows: 1 });
                }
                if (s.includes("status = 'pending'") && s.includes('INTERVAL ? SECOND')) {
                    const [attempts, statusCode, errorMsg, delaySec, id] = params;
                    const row = rows.get(id);
                    if (!row) return cb(null, { affectedRows: 0 });
                    Object.assign(row, {
                        status: 'pending', attempts, last_status_code: statusCode, last_error: errorMsg,
                        next_attempt_at: new Date(Date.now() + delaySec * 1000).toISOString().slice(0, 19).replace('T', ' '),
                    });
                    return cb(null, { affectedRows: 1 });
                }
                if (s.startsWith('UPDATE webhook_deliveries SET next_attempt_at = DATE_ADD')) {
                    const [claimSec, id] = params;
                    const row = rows.get(id);
                    if (!row || row.status !== 'pending') return cb(null, { affectedRows: 0 });
                    row.next_attempt_at = new Date(Date.now() + claimSec * 1000).toISOString().slice(0, 19).replace('T', ' ');
                    return cb(null, { affectedRows: 1 });
                }
                if (s.startsWith('SELECT * FROM webhook_deliveries WHERE id = ?')) {
                    const row = rows.get(params[0]);
                    return cb(null, row ? [Object.assign({}, row)] : []);
                }
                if (s.startsWith('SELECT * FROM webhook_deliveries WHERE id IN')) {
                    return cb(null, params.map((id) => rows.get(id)).filter(Boolean).map((r) => Object.assign({}, r)));
                }
                if (s.startsWith('SELECT id FROM webhook_deliveries')) {
                    const due = [...rows.values()].filter((r) => r.status === 'pending').map((r) => ({ id: r.id }));
                    return cb(null, due.slice(0, params[0] || 20));
                }
                if (s.startsWith('SELECT COUNT(*)')) {
                    let list = [...rows.values()].filter((r) => r.status === 'pending' || r.status === 'dead');
                    if (s.includes("status = 'pending'")) list = list.filter((r) => r.status === 'pending');
                    if (s.includes("status = 'dead'")) list = list.filter((r) => r.status === 'dead');
                    return cb(null, [{ total: list.length }]);
                }
                if (s.startsWith('SELECT id, webhook_id')) {
                    let list = [...rows.values()].filter((r) => r.status === 'pending' || r.status === 'dead');
                    return cb(null, list.map((r) => Object.assign({}, r)));
                }
                return cb(new Error('SQL no mockeado: ' + s.slice(0, 120)));
            } catch (e) {
                cb(e);
            }
        });
    }
    return { query, rows };
}

function receiveN(count, handler, send) {
    const received = [];
    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            const chunks = [];
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', () => {
                const body = Buffer.concat(chunks).toString('utf8');
                const n = received.length;
                received.push({ headers: req.headers, body });
                handler(n, req, res, body);
                if (received.length >= count) {
                    server.close();
                    resolve(received);
                }
            });
        });
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => send(`http://127.0.0.1:${server.address().port}/webhook`));
    });
}

async function main() {
    check('firma habilitada en la config', signer.enabled());
    const jwks = signer.jwks();
    check('JWKS con al menos una clave', jwks.keys.length > 0, JSON.stringify(jwks.keys.map(({ kid, kty, crv, alg }) => ({ kid, kty, crv, alg }))));

    const payload = { text: 'Nueva alta', data: { nombre: 'JUAN', apellido: 'PEREZ', dni: 12345678, sexo: 'M', cuil: 20123456789, acento: 'ñandú' } };
    const { body, headers, webhookId } = signer.signedRequest(payload);
    const keys = keysByKid();

    check('roundtrip valido', signer.verify(body, headers, keys).valid);
    check('body alterado se rechaza', !signer.verify(body.replace('JUAN', 'JUAM'), headers, keys).valid);

    const stable = signer.signedRequest(payload, { webhookId: 'fixed-id-0001' });
    check('webhookId estable en options', stable.headers[signer.HEADERS.id] === 'fixed-id-0001');
    check('signedRequest expone webhookId', stable.webhookId === 'fixed-id-0001');

    const old = signer.signedRequest(payload, { timestamp: Math.floor(Date.now() / 1000) - 301 });
    const oldResult = signer.verify(old.body, old.headers, keys);
    check('timestamp vencido se rechaza', !oldResult.valid, oldResult.reason);

    const unknown = signer.verify(body, { ...headers, [signer.HEADERS.keyId]: 'otro-kid' }, keys);
    check('kid desconocido se rechaza', !unknown.valid, unknown.reason);

    const tsHeader = headers[signer.HEADERS.timestamp];
    const tampered = signer.verify(body, { ...headers, [signer.HEADERS.timestamp]: String(Number(tsHeader) + 1) }, keys);
    check('timestamp alterado se rechaza', !tampered.valid, tampered.reason);

    const opensslOut = opensslVerify(signer.activePublicKeyPem(), Buffer.from(`${tsHeader}.${body}`, 'utf8'), headers[signer.HEADERS.signature]);
    check('openssl verifica la firma DER', opensslOut === 'Verified OK', opensslOut);

    const db = mockDb();
    global.AUTHENTICATOR_DB = db;
    delete require.cache[require.resolve('../utils/webhooks')];
    const webhooks = require('../utils/webhooks');

    // 1) Entrega OK en el primer intento
    const okOnce = await receiveN(1, (n, req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ recibido: true }));
    }, (url) => {
        webhooks.notify(url, payload, (err, resBody) => {
            check('notify recibe la respuesta parseada', !err && resBody && resBody.recibido === true, err ? err.message : JSON.stringify(resBody));
        }, 'testauth');
    });
    check('el receptor recibe los headers de firma', Boolean(okOnce[0].headers['x-tuid-signature'] && okOnce[0].headers['x-tuid-webhook-id']));
    check('content-type application/json', okOnce[0].headers['content-type'] === 'application/json', okOnce[0].headers['content-type']);
    check('el receptor valida con el body crudo', signer.verify(okOnce[0].body, okOnce[0].headers, keys).valid);
    check('el body llega igual al payload', JSON.stringify(JSON.parse(okOnce[0].body)) === JSON.stringify(payload));
    await new Promise((resolve) => {
        const wait = () => {
            if ([...db.rows.values()].some((r) => r.status === 'delivered')) return resolve();
            setTimeout(wait, 20);
        };
        wait();
    });
    check('fila queda delivered', [...db.rows.values()].some((r) => r.status === 'delivered'));

    // 2) Falla 2 veces y luego 200; mismo webhook-id
    const failThenOk = await new Promise((resolve, reject) => {
        const received = [];
        const server = http.createServer((req, res) => {
            const chunks = [];
            req.on('data', (c) => chunks.push(c));
            req.on('end', () => {
                const bodyBuf = Buffer.concat(chunks).toString('utf8');
                received.push({ headers: { ...req.headers }, body: bodyBuf });
                if (received.length < 3) {
                    res.statusCode = 503;
                    res.end('Service Unavailable');
                } else {
                    res.statusCode = 200;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ ok: true }));
                    server.close();
                    resolve(received);
                }
            });
        });
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const url = `http://127.0.0.1:${server.address().port}/webhook`;
            // delays: forzar 0 entre intentos mockeando config via retries inmediatos con retryNow
            webhooks.notify(url, payload, function () {}, 'testauth');
            const waitPending = () => {
                const pending = [...db.rows.values()].find((r) => r.status === 'pending' && r.attempts >= 1);
                if (!pending) return setTimeout(waitPending, 30);
                // forzar 2do intento
                webhooks.retryNow(pending.id, function () {
                    const wait2 = () => {
                        const p2 = db.rows.get(pending.id);
                        if (!p2 || p2.attempts < 1 || (p2.status === 'pending' && received.length < 2)) return setTimeout(wait2, 30);
                        // si todavía pending tras 2do fail, forzar 3ro
                        if (received.length < 3 && p2.status === 'pending') {
                            webhooks.retryNow(pending.id, function () {});
                        }
                        if (received.length < 3) return setTimeout(wait2, 30);
                    };
                    wait2();
                });
            };
            setTimeout(waitPending, 50);
        });
    });

    const ids = failThenOk.map((r) => r.headers['x-tuid-webhook-id']);
    check('3 intentos recibidos', failThenOk.length === 3, String(failThenOk.length));
    check('mismo webhook-id en reintentos', ids[0] && ids[0] === ids[1] && ids[1] === ids[2], ids.join(','));
    await new Promise((resolve) => {
        const wait = () => {
            if ([...db.rows.values()].some((r) => r.webhook_id === ids[0] && r.status === 'delivered')) return resolve();
            setTimeout(wait, 20);
        };
        wait();
    });
    check('intentos 1-2 fueron 503 y el 3ro entregó', [...db.rows.values()].some((r) => r.webhook_id === ids[0] && r.status === 'delivered'));

    // 3) listPending
    await new Promise((resolve) => {
        // meter un pending artificial
        db.query(
            `INSERT INTO webhook_deliveries (webhook_id, endpoint, aplicacion, payload, status, attempts, next_attempt_at, created_at) VALUES (?, ?, ?, ?, 'pending', 0, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
            ['list-id', 'http://127.0.0.1/x', 'testauth', JSON.stringify(payload)],
            function () {
                webhooks.listPending({ status: 'pending' }, function (err, data) {
                    check('listPending sin error', !err);
                    check('listPending trae items', data && data.items && data.items.length >= 1);
                    resolve();
                });
            }
        );
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    console.log(`\n${failures === 0 ? 'Sin fallas' : failures + ' falla(s)'}`);
    process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
