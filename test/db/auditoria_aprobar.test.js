// Aprobar una certificacion en Auditoria actualiza SOLO esa certificacion (no todas las de la persona). MySQL LOCAL de prueba.
// Requiere: node test/db/setup.js
const assert = require('assert');
const util = require('util');
const mysql = require('mysql');
const { PERSONAS } = require('./setup');

global.CONFIG = { get: () => ({ bucketName: 'x' }), has: () => false };
const Module = require('module');
const orig = Module._load;
Module._load = function (req) {
    if (/aws-sdk|utils\/(bucket|maps|slack|whatsapp|mail)$/.test(req)) {
        const dummy = function () { return dummyProxy; };
        const dummyProxy = new Proxy(dummy, { get: (t, k) => (k === 'then' ? undefined : dummyProxy), apply: () => dummyProxy, construct: () => dummyProxy });
        return dummyProxy;
    }
    return orig.apply(this, arguments);
};

const pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: '', database: 'vida_test' });
global.VIDA_DB = pool;
global.VIDA_DB.sync_query = util.promisify(pool.query).bind(pool);
const q = (sql, p) => VIDA_DB.sync_query(sql, p);
const auditoria = require('../../services/vida/admin/auditoria');

(async () => {
    const { ana } = PERSONAS;
    const [u] = await q('SELECT id_usuario FROM usuario WHERE cuil = ?', [ana.cuil]);
    const ids = (await q('SELECT id_validacion FROM auditoria WHERE id_usuario = ? ORDER BY id_validacion', [u.id_usuario])).map((r) => r.id_validacion);
    assert.ok(ids.length >= 3, 'la persona de prueba necesita 3 certificaciones');
    await q("UPDATE auditoria SET auditor='viejo@tuid.test', fechaAuditoria='2020-01-01' WHERE id_validacion = ?", [ids[0]]);
    await q('UPDATE auditoria SET auditor=NULL, fechaAuditoria=NULL WHERE id_validacion IN (?, ?)', [ids[1], ids[2]]);

    const ultima = ids[ids.length - 1];
    const resp = await new Promise((resolve) => {
        const res = { response: {}, status: () => ({ json: () => resolve(res.response) }) };
        auditoria.validacionOk({ params: { id_validacion: ultima }, query: {}, user: { email: 'nuevo@tuid.test' } }, res, () => {});
    });
    assert.strictEqual(resp.error, 0);

    const filas = await q('SELECT id_validacion, auditor, fechaAuditoria FROM auditoria WHERE id_usuario = ? ORDER BY id_validacion', [u.id_usuario]);
    const por = (id) => filas.find((f) => f.id_validacion === id);
    assert.strictEqual(por(ultima).auditor, 'nuevo@tuid.test');
    assert.ok(por(ultima).fechaAuditoria, 'la aprobada tiene fecha de auditoria');
    assert.strictEqual(por(ids[0]).auditor, 'viejo@tuid.test', 'la ya auditada no se toca');
    assert.ok(String(por(ids[0]).fechaAuditoria).includes('2020'), 'su fecha no se toca');
    assert.strictEqual(por(ids[1]).auditor, null, 'otra pendiente no se aprueba');
    console.log('ok  aprobar actualiza solo la certificacion elegida');
    process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
