const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const crypto = require('crypto');
const request = require('request');
const slack = require('./slack');
const signer = require('./webhookSigner');

var whitebrandsConfig = CONFIG.get('authenticator').whitebrands;

function retrySettings() {
    const defaults = {
        maxAttempts: 6,
        pollIntervalMs: 30000,
        timeoutMs: 15000,
        claimSeconds: 120,
        delaysSeconds: [0, 60, 300, 900, 3600, 21600],
    };
    if (!CONFIG.has('authenticator.webhookRetry')) return defaults;
    return Object.assign({}, defaults, CONFIG.get('authenticator.webhookRetry'));
}

function parseBody(body) {
    if (typeof body !== 'string') return body;
    try {
        return JSON.parse(body);
    } catch (err) {
        return body;
    }
}

function parsePayload(raw) {
    if (raw == null) return {};
    if (typeof raw === 'object') return raw;
    try {
        return JSON.parse(raw);
    } catch (err) {
        return {};
    }
}

function delayForAttempt(attemptsAfterThis) {
    const delays = retrySettings().delaysSeconds;
    const idx = Math.min(Math.max(attemptsAfterThis, 0), delays.length - 1);
    return delays[idx] || 0;
}

function formatNextLabel(nextAt, delaySec) {
    if (!nextAt) return '—';
    if (delaySec != null) {
        let human;
        if (delaySec < 60) human = `en ${delaySec}s`;
        else if (delaySec < 3600) human = `en ${Math.round(delaySec / 60)} min`;
        else human = `en ${Math.round(delaySec / 3600)} h`;
        return `${nextAt} UTC (${human})`;
    }
    return `${nextAt} UTC`;
}

function formatWebhookSlack(delivery, result) {
    const max = retrySettings().maxAttempts;
    const payload = parsePayload(delivery.payload);
    const data = payload.data || {};
    const lines = [
        `Webhook ${result.kind} | ${delivery.aplicacion || '-'} | intento ${result.attempt}/${max}`,
        `id: ${delivery.webhook_id}`,
        `endpoint: ${delivery.endpoint}`,
        `evento: ${payload.text || '-'}`,
        `dni: ${data.dni != null ? data.dni : '-'} | sexo: ${data.sexo || '-'} | cuil: ${data.cuil != null ? data.cuil : '-'}`,
        `http: ${result.statusCode != null ? result.statusCode : '-'} | ms: ${result.ms != null ? result.ms : '-'}`,
    ];
    if (result.error) lines.push(`error: ${String(result.error).slice(0, 300)}`);
    if (result.responseSnippet) lines.push(`body: ${result.responseSnippet}`);
    lines.push(`next: ${result.nextLabel || '—'}`);
    return lines.join('\n');
}

function notifySlack(delivery, result) {
    const msg = formatWebhookSlack(delivery, result);
    if (TESTING) {
        console.log(msg);
        return;
    }
    slack.autenticador(msg);
    if (result.kind === 'DEAD') slack.error(msg);
}

function summarizeResponseBody(body) {
    if (body == null) return null;
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    return text.length > 300 ? text.slice(0, 300) + '…' : text;
}

function markDelivered(delivery, statusCode, next) {
    AUTHENTICATOR_DB.query(
        `UPDATE webhook_deliveries SET status = 'delivered', attempts = ?, last_status_code = ?, last_error = NULL,
         last_attempt_at = UTC_TIMESTAMP(), delivered_at = UTC_TIMESTAMP(), next_attempt_at = UTC_TIMESTAMP()
         WHERE id = ?`,
        [delivery.attempts, statusCode, delivery.id],
        function (err) {
            if (err) console.log('webhook markDelivered', err);
            if (next) next(null, { delivered: true, statusCode });
        }
    );
}

function markFailure(delivery, statusCode, errorMsg, next) {
    const settings = retrySettings();
    const attempts = delivery.attempts;
    const dead = attempts >= settings.maxAttempts;
    const delaySec = dead ? null : delayForAttempt(attempts);
    const status = dead ? 'dead' : 'pending';
    const sql = dead
        ? `UPDATE webhook_deliveries SET status = 'dead', attempts = ?, last_status_code = ?, last_error = ?,
           last_attempt_at = UTC_TIMESTAMP() WHERE id = ?`
        : `UPDATE webhook_deliveries SET status = 'pending', attempts = ?, last_status_code = ?, last_error = ?,
           last_attempt_at = UTC_TIMESTAMP(), next_attempt_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND) WHERE id = ?`;
    const params = dead
        ? [attempts, statusCode, errorMsg, delivery.id]
        : [attempts, statusCode, errorMsg, delaySec, delivery.id];

    AUTHENTICATOR_DB.query(sql, params, function (err) {
        if (err) console.log('webhook markFailure', err);
        const nextAt = dead ? null : new Date(Date.now() + (delaySec || 0) * 1000).toISOString().replace('T', ' ').slice(0, 19);
        if (next) next(null, { delivered: false, dead, statusCode, nextAt, delaySec });
    });
}

function attempt(delivery, next) {
    const settings = retrySettings();
    const payload = parsePayload(delivery.payload);
    delivery.attempts = (delivery.attempts || 0) + 1;

    let signed;
    try {
        signed = signer.signedRequest(payload, { webhookId: delivery.webhook_id });
    } catch (err) {
        console.log('No se pudo firmar el webhook', err);
        slack.error(`No se pudo firmar el webhook a ${delivery.endpoint}: ${err.message}`);
        signed = { body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json' } };
    }

    if (TESTING) {
        notifySlack(delivery, {
            kind: 'OK',
            attempt: delivery.attempts,
            statusCode: 200,
            ms: 0,
            nextLabel: '—',
        });
        return markDelivered(delivery, 200, next);
    }

    const started = Date.now();
    request.post(delivery.endpoint, {
        body: signed.body,
        headers: signed.headers,
        timeout: settings.timeoutMs,
    }, function (err, res, body) {
        const ms = Date.now() - started;
        const statusCode = res && res.statusCode;
        const ok = !err && statusCode >= 200 && statusCode < 300;
        const snippet = summarizeResponseBody(body);

        if (ok) {
            notifySlack(delivery, {
                kind: 'OK',
                attempt: delivery.attempts,
                statusCode,
                ms,
                responseSnippet: snippet,
                nextLabel: '—',
            });
            return markDelivered(delivery, statusCode, function (e, info) {
                if (next) next(null, parseBody(body));
            });
        }

        const errorMsg = err ? (err.code || err.message || String(err)) : (`HTTP ${statusCode}` + (snippet ? `: ${snippet}` : ''));
        markFailure(delivery, statusCode || null, errorMsg, function (e, info) {
            const kind = info && info.dead ? 'DEAD' : 'FAIL';
            notifySlack(delivery, {
                kind,
                attempt: delivery.attempts,
                statusCode: statusCode || null,
                ms,
                error: errorMsg,
                responseSnippet: err ? null : snippet,
                nextLabel: info && info.dead ? 'no más reintentos' : formatNextLabel(info && info.nextAt, info && info.delaySec),
            });
            if (next) next(err || new Error(errorMsg), null);
        });
    });
}

function enqueue(endpoint, params, aplicacion, next) {
    const webhookId = crypto.randomUUID();
    const payloadJson = JSON.stringify(params);
    const sql = `INSERT INTO webhook_deliveries
        (webhook_id, endpoint, aplicacion, payload, status, attempts, next_attempt_at, created_at)
        VALUES (?, ?, ?, ?, 'pending', 0, UTC_TIMESTAMP(), UTC_TIMESTAMP())`;

    AUTHENTICATOR_DB.query(sql, [webhookId, endpoint, aplicacion || null, payloadJson], function (err, result) {
        if (err) {
            console.log('webhook enqueue', err);
            slack.error(`No se pudo encolar webhook a ${endpoint}: ${err.message}`);
            // Fallback: un intento directo sin persistir, para no perder el alta
            return directOnce(endpoint, params, webhookId, next);
        }
        const delivery = {
            id: result.insertId,
            webhook_id: webhookId,
            endpoint,
            aplicacion: aplicacion || null,
            payload: params,
            attempts: 0,
        };
        attempt(delivery, next);
    });
}

function directOnce(endpoint, params, webhookId, next) {
    let signed;
    try {
        signed = signer.signedRequest(params, { webhookId });
    } catch (err) {
        signed = { body: JSON.stringify(params), headers: { 'Content-Type': 'application/json' } };
    }
    if (TESTING) {
        console.log('WEBHOOK FALLBACK TESTING', endpoint, params);
        if (next) next(null, { testing: true });
        return;
    }
    const started = Date.now();
    request.post(endpoint, {
        body: signed.body,
        headers: signed.headers,
        timeout: retrySettings().timeoutMs,
    }, function (err, res, body) {
        const ms = Date.now() - started;
        const statusCode = res && res.statusCode;
        const ok = !err && statusCode >= 200 && statusCode < 300;
        const delivery = {
            id: null,
            webhook_id: webhookId,
            endpoint,
            aplicacion: null,
            payload: params,
            attempts: 1,
        };
        notifySlack(delivery, {
            kind: ok ? 'OK' : 'FAIL',
            attempt: 1,
            statusCode: statusCode || null,
            ms,
            error: ok ? null : (err ? (err.code || err.message) : `HTTP ${statusCode}`),
            nextLabel: ok ? '—' : 'sin cola (enqueue falló)',
        });
        if (next) next(err, ok ? parseBody(body) : null);
    });
}

module.exports.notify = function (endpoint, params, next, aplicacion) {
    enqueue(endpoint, params, aplicacion, next);
};

function send(endpoint, params, aplicacion) {
    enqueue(endpoint, params, aplicacion, function () {});
}

module.exports.validateAndSend = async function (document, gender, aplicacion) {
    let whiteBrand = whitebrandsConfig.find((e) => e.id == aplicacion);
    if (!whiteBrand) return;
    if (!whiteBrand.webhook) {
        console.log('sinWebhook');
        return;
    }
    AUTHENTICATOR_DB.query(
        'select * from usuarios where dni = ? and sexo = ? and aplicacion  = ?',
        [document, gender, aplicacion],
        function (err, docs) {
            console.log(document, gender, aplicacion, err, docs);
            if (err || docs.length == 0) return;
            var pars = {
                text: 'Nueva alta',
                data: {
                    nombre: docs[0].nombre,
                    apellido: docs[0].apellido,
                    dni: docs[0].dni,
                    cuil: docs[0].cuil,
                    email: docs[0].telefonoVrf ? docs[0].email : null,
                    telefono: docs[0].telefonoVrf ? docs[0].telefono : null,
                    sexo: docs[0].sexo,
                    tramite: docs[0].tramite,
                    nacimiento: docs[0].nacimiento,
                    front: s3.getSignedUrl('getObject', {
                        Bucket: 'autenticartuid',
                        Key: 'usuarios/' + aplicacion + '/' + document + gender + '_F.jpeg',
                        Expires: 10000000,
                    }),
                    back: s3.getSignedUrl('getObject', {
                        Bucket: 'autenticartuid',
                        Key: 'usuarios/' + aplicacion + '/' + document + gender + '_B.jpeg',
                        Expires: 10000000,
                    }),
                    docPhoto: s3.getSignedUrl('getObject', {
                        Bucket: 'autenticartuid',
                        Key: 'usuarios/' + aplicacion + '/' + document + gender + '_P.jpeg',
                        Expires: 10000000,
                    }),
                    selfie: s3.getSignedUrl('getObject', {
                        Bucket: 'autenticartuid',
                        Key: 'usuarios/' + aplicacion + '/' + document + gender + '_S.jpeg',
                        Expires: 10000000,
                    }),
                },
            };
            send(whiteBrand.webhook, pars, aplicacion);
        }
    );
};

module.exports.listPending = function (filters, next) {
    const statusFilter = (filters && filters.status) || 'pending';
    const limit = Math.min(Math.max(parseInt(filters && filters.limit, 10) || 50, 1), 200);
    const offset = Math.max(parseInt(filters && filters.offset, 10) || 0, 0);
    const aplicacion = filters && filters.aplicacion;

    let where = "status IN ('pending','dead')";
    const params = [];
    if (statusFilter === 'pending') where = "status = 'pending'";
    else if (statusFilter === 'dead') where = "status = 'dead'";
    else if (statusFilter === 'all') where = "status IN ('pending','dead')";

    if (aplicacion) {
        where += ' AND aplicacion = ?';
        params.push(aplicacion);
    }

    const countSql = `SELECT COUNT(*) AS total FROM webhook_deliveries WHERE ${where}`;
    const listSql = `SELECT id, webhook_id, endpoint, aplicacion, payload, status, attempts,
        next_attempt_at, last_status_code, last_error, last_attempt_at, created_at
        FROM webhook_deliveries WHERE ${where}
        ORDER BY created_at DESC LIMIT ? OFFSET ?`;

    AUTHENTICATOR_DB.query(countSql, params, function (err, countRows) {
        if (err) return next(err);
        AUTHENTICATOR_DB.query(listSql, params.concat([limit, offset]), function (err2, rows) {
            if (err2) return next(err2);
            const items = (rows || []).map((row) => {
                const payload = parsePayload(row.payload);
                const data = payload.data || {};
                return {
                    id: row.id,
                    webhook_id: row.webhook_id,
                    aplicacion: row.aplicacion,
                    endpoint: row.endpoint,
                    evento: payload.text || null,
                    dni: data.dni != null ? data.dni : null,
                    sexo: data.sexo || null,
                    cuil: data.cuil != null ? data.cuil : null,
                    status: row.status,
                    attempts: row.attempts,
                    next_attempt_at: row.next_attempt_at,
                    last_status_code: row.last_status_code,
                    last_error: row.last_error,
                    last_attempt_at: row.last_attempt_at,
                    created_at: row.created_at,
                };
            });
            next(null, { total: countRows[0] ? countRows[0].total : 0, items });
        });
    });
};

module.exports.retryNow = function (id, next) {
    AUTHENTICATOR_DB.query('SELECT * FROM webhook_deliveries WHERE id = ?', [id], function (err, rows) {
        if (err) return next(err);
        if (!rows || !rows[0]) return next(null, { notFound: true });
        const row = rows[0];
        if (row.status === 'delivered') return next(null, { alreadyDelivered: true, row });

        AUTHENTICATOR_DB.query(
            `UPDATE webhook_deliveries SET status = 'pending', attempts = 0, next_attempt_at = UTC_TIMESTAMP(),
             last_error = NULL, last_status_code = NULL WHERE id = ? AND status IN ('pending','dead')`,
            [id],
            function (err2, result) {
                if (err2) return next(err2);
                if (!result.affectedRows) return next(null, { alreadyDelivered: true, row });
                const delivery = {
                    id: row.id,
                    webhook_id: row.webhook_id,
                    endpoint: row.endpoint,
                    aplicacion: row.aplicacion,
                    payload: parsePayload(row.payload),
                    attempts: 0,
                };
                attempt(delivery, function () {});
                next(null, { forced: true, id: row.id, webhook_id: row.webhook_id });
            }
        );
    });
};

function claimDue(limit, next) {
    const settings = retrySettings();
    AUTHENTICATOR_DB.query(
        `SELECT id FROM webhook_deliveries
         WHERE status = 'pending' AND next_attempt_at <= UTC_TIMESTAMP()
         ORDER BY next_attempt_at ASC LIMIT ?`,
        [limit],
        function (err, rows) {
            if (err) return next(err, []);
            if (!rows || !rows.length) return next(null, []);

            const claimed = [];
            let pending = rows.length;
            rows.forEach((row) => {
                AUTHENTICATOR_DB.query(
                    `UPDATE webhook_deliveries SET next_attempt_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND)
                     WHERE id = ? AND status = 'pending' AND next_attempt_at <= UTC_TIMESTAMP()`,
                    [settings.claimSeconds, row.id],
                    function (err2, result) {
                        if (!err2 && result.affectedRows === 1) claimed.push(row.id);
                        if (--pending === 0) next(null, claimed);
                    }
                );
            });
        }
    );
}

function processClaimed(ids) {
    if (!ids.length) return;
    AUTHENTICATOR_DB.query(
        `SELECT * FROM webhook_deliveries WHERE id IN (${ids.map(() => '?').join(',')})`,
        ids,
        function (err, rows) {
            if (err || !rows) return;
            rows.forEach((row) => {
                attempt({
                    id: row.id,
                    webhook_id: row.webhook_id,
                    endpoint: row.endpoint,
                    aplicacion: row.aplicacion,
                    payload: parsePayload(row.payload),
                    attempts: row.attempts || 0,
                }, function () {});
            });
        }
    );
}

let workerTimer = null;

module.exports.startRetryWorker = function () {
    if (workerTimer) return;
    const settings = retrySettings();
    const tick = function () {
        claimDue(20, function (err, ids) {
            if (err) {
                console.log('webhook poller', err);
                return;
            }
            processClaimed(ids || []);
        });
    };
    workerTimer = setInterval(tick, settings.pollIntervalMs);
    if (workerTimer.unref) workerTimer.unref();
    console.log(`Webhook retry worker cada ${settings.pollIntervalMs}ms`);
};

module.exports._attempt = attempt;
module.exports._formatWebhookSlack = formatWebhookSlack;
