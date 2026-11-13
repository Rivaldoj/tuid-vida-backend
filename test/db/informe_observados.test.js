// Informe de Casos Observados de Auditoria (rechazadas) contra la MySQL LOCAL de prueba. Requiere: node test/db/setup.js
const assert = require('assert');
const util = require('util');
const mysql = require('mysql');
const Module = require('module');
const { PERSONAS } = require('./setup');

global.CONFIG = { get: () => ({}), has: () => false };
const pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: '', database: 'vida_test', multipleStatements: true });
const db = { sync_query: util.promisify(pool.query).bind(pool) };
global.VIDA_DB = db;
// la lista de Auditoria carga librerias de AWS / correo que aca no se usan
const orig = Module._load;
Module._load = function (req) {
    if (/aws-sdk|nodemailer|utils\/(bucket|maps|slack|sms|push|mail|whatsapp)$/.test(req)) {
        const d = function () { return p; };
        const p = new Proxy(d, { get: (t, k) => (k === 'then' ? undefined : p), apply: () => p, construct: () => p });
        return p;
    }
    return orig.apply(this, arguments);
};
const auditoria = require('../../services/vida/admin/auditoria');

async function informe(user, query) {
    let out;
    await auditoria.informeObservados({ user, query }, { status: () => ({ json: (j) => { out = j; } }) });
    return out;
}

(async () => {
    const { ana, carlos, dora } = PERSONAS;
    const id = async (p) => (await db.sync_query('SELECT id_usuario FROM usuario WHERE cuil = ?', [p.cuil]))[0].id_usuario;
    // Marzo de 2032. Ana: registro aprobado, una validacion RECHAZADA (TESTBANCO) y una aprobada. Carlos: registro RECHAZADO (TESTBANCO).
    // Dora: registro aprobado, validacion RECHAZADA de OTRABANCO. Hay ademas un rechazo fuera del rango.
    await db.sync_query("UPDATE usuario SET fecha = '2032-03-05 10:00:00', empresa = 'TESTBANCO', auditor = 'aud@tuid.test' WHERE cuil = ?", [ana.cuil]);
    await db.sync_query("UPDATE usuario SET fecha = '2032-03-10 11:30:15', empresa = 'TESTBANCO', auditor = 'ALERTA:aud@tuid.test' WHERE cuil = ?", [carlos.cuil]);
    await db.sync_query("UPDATE usuario SET fecha = '2032-03-06 12:00:00', empresa = 'OTRABANCO', auditor = 'aud@tuid.test' WHERE cuil = ?", [dora.cuil]);
    const ins = (u, fecha, sim, emp, aud) => db.sync_query('INSERT INTO auditoria (id_usuario, fecha, similitud, empresa, cuil, session_id, auditor) VALUES (?, ?, ?, ?, 0, ?, ?)', [u, fecha, sim, emp, 'obs-' + Math.random(), aud]);
    await ins(await id(ana), '2032-03-12 09:15:00', 90, 'TESTBANCO', 'ALERTA:aud@tuid.test'); // rechazada: entra
    await ins(await id(ana), '2032-03-13 09:00:00', 90, 'TESTBANCO', 'aud@tuid.test'); // aprobada: no
    await ins(await id(ana), '2032-03-14 09:00:00', 0.5, 'TESTBANCO', 'ALERTA:aud@tuid.test'); // similitud baja: no cuenta
    await ins(await id(ana), '2032-03-15 09:00:00', 90, 'TESTBANCO', null); // pendiente: no
    await ins(await id(dora), '2032-03-20 18:45:00', 80, 'OTRABANCO', 'ALERTA:otro@tuid.test'); // rechazada: entra
    await ins(await id(dora), '2032-04-02 18:45:00', 80, 'OTRABANCO', 'ALERTA:otro@tuid.test'); // fuera del rango

    // 1) todas las empresas, solo TUID
    let r = await informe({ empresa: 'TUID' }, { from: '2032-03-01', to: '2032-03-31' });
    assert.strictEqual(r.error, 0, JSON.stringify(r));
    assert.strictEqual(r.data.todas, true);
    assert.deepStrictEqual(r.data.empresas.map((e) => e.empresa), ['OTRABANCO', 'TESTBANCO']);
    const t = r.data.empresas[1];
    assert.strictEqual(t.registraciones, 1);
    assert.strictEqual(t.validaciones, 1);
    assert.deepStrictEqual(t.casos.map((c) => [c.tipo, c.cuil]), [['registracion', carlos.cuil], ['validacion', ana.cuil]], 'ordenados por fecha');
    assert.ok(t.casos[0].fecha.startsWith('2032-03-10'));
    const o = r.data.empresas[0];
    assert.strictEqual(o.registraciones, 0);
    assert.deepStrictEqual(o.casos.map((c) => [c.tipo, c.cuil]), [['validacion', dora.cuil]]);
    assert.strictEqual(r.data.truncado, false);
    console.log('ok  casos observados: registraciones y validaciones rechazadas, por empresa y por fecha');

    // 2) una empresa; el rango recorta
    r = await informe({ empresa: 'TUID' }, { from: '2032-03-01', to: '2032-03-31', empresa: 'TESTBANCO' });
    assert.deepStrictEqual(r.data.empresas.map((e) => e.empresa), ['TESTBANCO']);
    r = await informe({ empresa: 'TUID' }, { from: '2032-03-11', to: '2032-03-11', empresa: 'TESTBANCO' });
    assert.strictEqual(r.data.empresas[0].casos.length, 0, 'el rango Desde/Hasta recorta (y la empresa pedida aparece vacia)');
    r = await informe({ empresa: 'TUID' }, { from: '2032-03-12', to: '2032-03-12' });
    assert.strictEqual(r.data.empresas.length, 1);
    assert.strictEqual(r.data.empresas[0].casos[0].cuil, ana.cuil, 'el dia Hasta se incluye completo');
    console.log('ok  filtros de empresa y rango de fechas');

    // 3) una empresa comun solo ve la suya aunque pida otra; validaciones de parametros
    r = await informe({ empresa: 'OTRABANCO' }, { from: '2032-03-01', to: '2032-03-31', empresa: 'TESTBANCO' });
    assert.deepStrictEqual(r.data.empresas.map((e) => e.empresa), ['OTRABANCO']);
    assert.strictEqual((await informe({ empresa: 'TUID' }, { from: '2032-03-01' })).error, 1);
    assert.strictEqual((await informe({ empresa: 'TUID' }, { from: '2032-04-01', to: '2032-03-01' })).error, 1);
    assert.strictEqual((await informe({ empresa: 'TUID' }, { from: "2032-03-01' OR 1=1", to: '2032-03-31' })).error, 1);
    r = await informe({ empresa: 'TUID' }, { from: '2032-03-01', to: '2032-03-31', empresa: "X' OR '1'='1" });
    assert.strictEqual(r.data.empresas[0].casos.length, 0);
    console.log('ok  permisos por empresa y parametros seguros');

    console.log('\nTodas las pruebas del informe de casos observados pasaron.');
    pool.end();
    process.exit(0);
})().catch((e) => { console.error('FALLO:', e); process.exit(1); });
