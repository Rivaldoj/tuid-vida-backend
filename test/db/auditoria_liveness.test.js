// Prueba el interruptor de auditoria contra la MySQL LOCAL de prueba (puerto 3307, datos ficticios; sin AWS ni produccion).
// Requiere: node test/db/setup.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const util = require('util');
const mysql = require('mysql');
const { PERSONAS } = require('./setup');

global.CONFIG = { get: () => ({ bucketName: 'x', approvePercentage: 90, rangoES: 1 }), has: () => false };
const Module = require('module');
const orig = Module._load;
Module._load = function (req) {
    if (/^\.\.\/\.\.\/login$/.test(req)) {
        // vidaLogin de prueba: solo lo que usa saveLogin
        return { newQueries: { pendingTasks: 'SELECT 1 AS x' }, verifyLife() {}, convert: (d) => d, getAddress: (r, s, n) => n() };
    }
    if (/mail|tokenizer|\.\/shared|aws-sdk|nodemailer|utils\/(bucket|maps|slack|sms|push)$/.test(req)) {
        // "doble" que acepta cualquier uso (incluido new AWS.S3()) sin hacer nada
        const dummy = function () { return dummyProxy; };
        const dummyProxy = new Proxy(dummy, { get: (t, k) => (k === 'then' ? undefined : dummyProxy), apply: () => dummyProxy, construct: () => dummyProxy });
        return dummyProxy;
    }
    if (/utils\/liveness$/.test(req)) return { createSession: async () => 'fake-session' };
    return orig.apply(this, arguments);
};

const pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: '', database: 'vida_test', multipleStatements: true });
global.VIDA_DB = pool;
global.VIDA_DB.sync_query = util.promisify(pool.query).bind(pool);

const settings = require('../../utils/settings');
const login = require('../../services/vida/v2/services/login');
const adminUser = require('../../services/vida/admin/user');
const q = (sql, p) => VIDA_DB.sync_query(sql, p);

async function certificar(sessionId) {
    const [u] = await q('SELECT * FROM usuario WHERE cuil = ?', [PERSONAS.ana.cuil]);
    const req = {
        loginUser: Object.assign({}, u, { proxima: null, hoy: new Date() }),
        body: { idDevice: 'DEVICE-ANA', sessionId, idValidation: 0, latitud: '-34.6', longitud: '-58.4', version: '1', os: 'test', appversion: '1' },
        similitud: 97, liveness: { Confidence: 99 }
    };
    let out;
    const res = { status: () => ({ json: (j) => { out = j; } }) };
    res.response = {};
    await login.saveLogin(req, res, () => {});
    assert.strictEqual(out.res, 'ok', JSON.stringify(out));
    const rows = await q('SELECT auditor, fechaAuditoria, similitud FROM auditoria WHERE session_id = ?', [sessionId]);
    assert.ok(rows.length >= 1, 'no se registro la certificacion');
    return rows[0];
}

(async () => {
    // 1) sin la tabla `configuracion` el sistema exige auditoria (comportamiento historico)
    await q('DROP TABLE IF EXISTS configuracion_historial; DROP TABLE IF EXISTS configuracion;');
    settings.limpiarCache();
    assert.strictEqual(await settings.auditoriaObligatoria(), true);
    let fila = await certificar('s-sin-tabla');
    assert.strictEqual(fila.auditor, null, 'sin tabla: queda pendiente de auditoria');
    console.log('ok  sin la tabla de configuracion: queda pendiente de auditoria (auditor NULL)');

    // 2) con la tabla creada por la migracion, el valor por defecto es ON
    await q(fs.readFileSync(path.join(__dirname, '../../scripts/sql/configuracion.sql'), 'utf8'));
    settings.limpiarCache();
    assert.strictEqual(await settings.auditoriaObligatoria(), true);
    fila = await certificar('s-on');
    assert.strictEqual(fila.auditor, null);
    console.log('ok  migracion aplicada: por defecto ON, pendiente de auditoria');

    // 3) apagado: pasa directo con auditor = Liveness y lo reciben los clientes
    const r = await settings.setAuditoriaObligatoria(false, 'admin@tuid.test');
    assert.strictEqual(r.anterior, 'ON');
    assert.strictEqual(r.nuevo, 'OFF');
    fila = await certificar('s-off');
    assert.strictEqual(fila.auditor, 'Liveness');
    assert.ok(fila.fechaAuditoria, 'queda con fecha de auditoria');
    // es lo que usan las descargas de los clientes: auditor no nulo y no ALERTA
    const visibles = await q("SELECT 1 FROM auditoria WHERE session_id = 's-off' AND auditor IS NOT NULL AND auditor NOT LIKE 'ALERTA%'");
    assert.ok(visibles.length >= 1, 'el cliente debe recibirla en tiempo real');
    const pendientes = await q("SELECT 1 FROM auditoria WHERE session_id = 's-on' AND auditor IS NOT NULL AND auditor NOT LIKE 'ALERTA%'");
    assert.strictEqual(pendientes.length, 0, 'la de antes (ON) sigue esperando aprobacion');
    console.log('ok  apagado: se guarda con auditor = Liveness y pasa a los clientes; las anteriores siguen pendientes');

    // 4) se vuelve a encender
    await settings.setAuditoriaObligatoria(true, 'admin@tuid.test');
    fila = await certificar('s-on2');
    assert.strictEqual(fila.auditor, null);
    const hist = await q('SELECT valor_anterior, valor_nuevo, usuario FROM configuracion_historial ORDER BY id');
    assert.deepStrictEqual(hist.map((h) => h.valor_nuevo), ['OFF', 'ON']);
    assert.strictEqual(hist[0].usuario, 'admin@tuid.test');
    console.log('ok  encendido de nuevo: vuelve a quedar pendiente; el cambio queda registrado con quien lo hizo');

    // 5) permiso: solo el Administrador de TUID
    const permisos = adminUser.getUserPermissions;
    assert.ok(permisos({ empresa: 'TUID', rol: 'A' }).includes('CONFIGURACION'));
    assert.ok(!permisos({ empresa: 'TUID', rol: 'U' }).includes('CONFIGURACION'));
    assert.ok(!permisos({ empresa: 'OTRA', rol: 'A' }).includes('CONFIGURACION'));
    console.log('ok  solo el Administrador de TUID tiene el permiso CONFIGURACION');

    await q('DELETE FROM auditoria WHERE session_id LIKE "s-%"');
    console.log('\nTodas las pruebas del interruptor de auditoria pasaron.');
    pool.end();
    process.exit(0);
})().catch((e) => { console.error('FALLO:', e); process.exit(1); });
