// Informe mensual del Dashboard (registraciones y certificaciones por empresa) contra la MySQL LOCAL de prueba. Requiere: node test/db/setup.js
const assert = require('assert');
const util = require('util');
const mysql = require('mysql');
const { PERSONAS } = require('./setup');

global.CONFIG = { get: () => ({}), has: () => false };
const pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: '', database: 'vida_test', multipleStatements: true });
const db = { sync_query: util.promisify(pool.query).bind(pool) };
global.VIDA_DB = db;
const dashboard = require('../../services/vida/admin/dashboard');

async function informe(user, query) {
    let out;
    await dashboard.informeMensual({ user, query }, { status: () => ({ json: (j) => { out = j; } }) });
    return out;
}

(async () => {
    const { ana, carlos, dora } = PERSONAS;
    const id = async (p) => (await db.sync_query('SELECT id_usuario FROM usuario WHERE cuil = ?', [p.cuil]))[0].id_usuario;
    // Datos fijos en marzo de 2031: Ana y Carlos se registraron en TESTBANCO, Dora en OTRABANCO, y hay certificaciones (una de Ana repetida, una descartada por similitud baja)
    await db.sync_query("UPDATE usuario SET fecha = '2031-03-10 10:00:00', empresa = 'TESTBANCO', similitud = 91.5 WHERE cuil = ?", [ana.cuil]);
    await db.sync_query("UPDATE usuario SET fecha = '2031-03-11 11:00:00', empresa = 'TESTBANCO', similitud = 88 WHERE cuil = ?", [carlos.cuil]);
    await db.sync_query("UPDATE usuario SET fecha = '2031-03-12 12:00:00', empresa = 'OTRABANCO', similitud = 70 WHERE cuil = ?", [dora.cuil]);
    const ins = (u, fecha, sim, emp) => db.sync_query("INSERT INTO auditoria (id_usuario, fecha, similitud, empresa, cuil, session_id) VALUES (?, ?, ?, ?, 0, ?)", [u, fecha, sim, emp, 'inf-' + Math.random()]);
    await ins(await id(ana), '2031-03-15 09:00:00', 80, 'TESTBANCO');
    await ins(await id(ana), '2031-03-20 09:00:00', 95.25, 'TESTBANCO'); // la ultima de Ana: es la que se informa
    await ins(await id(carlos), '2031-03-16 09:00:00', 0.5, 'TESTBANCO'); // similitud baja: no cuenta
    await ins(await id(dora), '2031-03-17 09:00:00', 60, 'OTRABANCO');
    await ins(await id(ana), '2031-04-02 09:00:00', 99, 'TESTBANCO'); // otro mes: no entra

    // 1) una empresa comun solo ve la suya, aunque pida otra
    let r = await informe({ empresa: 'TESTBANCO' }, { ano: '2031', mes: '3', empresa: 'OTRABANCO' });
    assert.strictEqual(r.error, 0, JSON.stringify(r));
    assert.strictEqual(r.data.todas, false);
    assert.strictEqual(r.data.empresas.length, 1);
    const t = r.data.empresas[0];
    assert.strictEqual(t.empresa, 'TESTBANCO');
    assert.deepStrictEqual(t.registraciones.map((x) => x.cuil), [ana.cuil, carlos.cuil].sort((a, b) => 0));
    assert.strictEqual(t.registraciones[0].nombre, 'ANA MARIA PRUEBA');
    assert.strictEqual(t.registraciones[0].similitud, 91.5);
    assert.strictEqual(t.certificaciones.length, 1, 'una certificacion por persona (la ultima) y sin similitud baja');
    assert.strictEqual(t.certificaciones[0].cuil, ana.cuil);
    assert.strictEqual(t.certificaciones[0].similitud, 95.25);
    assert.ok(t.certificaciones[0].fecha.includes('2031'));
    console.log('ok  empresa comun: solo la suya; registraciones y la ultima certificacion por persona');

    // 2) el Administrador de TUID elige una empresa...
    r = await informe({ empresa: 'TUID' }, { ano: '2031', mes: '3', empresa: 'OTRABANCO' });
    assert.strictEqual(r.data.empresas.length, 1);
    assert.strictEqual(r.data.empresas[0].empresa, 'OTRABANCO');
    assert.strictEqual(r.data.empresas[0].registraciones.length, 1);
    assert.strictEqual(r.data.empresas[0].certificaciones.length, 1);
    // ...o todas: una seccion por empresa
    r = await informe({ empresa: 'TUID' }, { ano: '2031', mes: '3', empresa: 'TUID' });
    assert.strictEqual(r.data.todas, true);
    assert.deepStrictEqual(r.data.empresas.map((e) => e.empresa), ['OTRABANCO', 'TESTBANCO']);
    console.log('ok  TUID: una empresa o todas, una seccion por empresa');

    // 3) una empresa sin movimientos aparece igual (vacia); mes invalido da error
    r = await informe({ empresa: 'TUID' }, { ano: '2031', mes: '7', empresa: 'TESTBANCO' });
    assert.strictEqual(r.data.empresas.length, 1);
    assert.strictEqual(r.data.empresas[0].registraciones.length + r.data.empresas[0].certificaciones.length, 0);
    assert.strictEqual((await informe({ empresa: 'TUID' }, { ano: '2031', mes: '13' })).error, 1);
    assert.strictEqual((await informe({ empresa: 'TUID' }, { ano: 'x', mes: '3' })).error, 1);
    // texto de inyeccion en la empresa: va como parametro
    r = await informe({ empresa: 'TUID' }, { ano: '2031', mes: '3', empresa: "X' OR '1'='1" });
    assert.strictEqual(r.data.empresas[0].registraciones.length, 0);
    console.log('ok  sin movimientos, mes invalido y parametros seguros');

    console.log('\nTodas las pruebas del informe mensual pasaron.');
    pool.end();
    process.exit(0);
})().catch((e) => { console.error('FALLO:', e); process.exit(1); });
