// Periodo de la empresa en el informe mensual del Dashboard (Periodo, Total Periodo, certificaciones hasta el corte) contra la MySQL LOCAL de prueba.
// Usa un mes ya cerrado (marzo de 2020) para que la fecha de corte no dependa del dia en que se corre. Requiere: node test/db/setup.js
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
    const ins = (u, fecha, sim, emp) => db.sync_query('INSERT INTO auditoria (id_usuario, fecha, similitud, empresa, cuil, session_id) VALUES (?, ?, ?, ?, 0, ?)', [u, fecha, sim, emp, 'per-' + Math.random()]);
    await db.sync_query("DELETE FROM auditoria WHERE fecha < '2021-01-01'");
    await ins(await id(carlos), '2020-02-20 09:00:00', 90, 'TESTBANCO'); // antes de Fecha_actual: no cuenta
    await ins(await id(ana), '2020-03-05 09:00:00', 90, 'TESTBANCO');
    await ins(await id(ana), '2020-03-20 09:00:00', 95, 'TESTBANCO');    // misma persona: cuenta una sola vez
    await ins(await id(carlos), '2020-03-25 09:00:00', 88, 'TESTBANCO');
    await ins(await id(dora), '2020-03-26 09:00:00', 0.5, 'TESTBANCO');   // similitud baja: no cuenta
    await ins(await id(carlos), '2020-04-02 09:00:00', 88, 'TESTBANCO');  // despues del corte de marzo: no cuenta
    await ins(await id(dora), '2020-03-10 09:00:00', 80, 'OTRABANCO');
    await db.sync_query("UPDATE empresa SET Fecha_actual = '2020-03-01', Fecha_fin = '2020-03-31', Cantidad = 10 WHERE id = 'TESTBANCO'");
    await db.sync_query("UPDATE empresa SET Fecha_actual = NULL, Fecha_fin = NULL, Cantidad = 0 WHERE id = 'OTRABANCO'");

    // 1) periodo completo: certificaciones desde Fecha_actual hasta el corte (31/03/2020)
    let r = await informe({ empresa: 'TESTBANCO' }, { ano: '2020', mes: '3' });
    assert.strictEqual(r.error, 0, JSON.stringify(r));
    assert.strictEqual(r.data.corte, '2020-03-31');
    const t = r.data.empresas.find((e) => e.empresa === 'TESTBANCO');
    assert.deepStrictEqual(t.periodo, { fecha_actual: '2020-03-01', fecha_fin: '2020-03-31', cantidad: 10, corte: '2020-03-31', certificadas: 2, pendientes: 8 });
    assert.ok(t.certificaciones.length > 0 && t.certificaciones.every((c) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(c.fecha)), 'la fecha viaja como texto AAAA-MM-DD hh:mm:ss: ' + JSON.stringify(t.certificaciones[0]));
    console.log('ok  periodo: inicio-fin, total periodo, 2 certificaciones hasta el corte, 8 pendientes');

    // 2) la fecha de inicio manda: con inicio el 22/03 solo cuenta la del 25/03
    await db.sync_query("UPDATE empresa SET Fecha_actual = '2020-03-22' WHERE id = 'TESTBANCO'");
    r = await informe({ empresa: 'TESTBANCO' }, { ano: '2020', mes: '3' });
    assert.strictEqual(r.data.empresas[0].periodo.certificadas, 1);
    assert.strictEqual(r.data.empresas[0].periodo.pendientes, 9);
    // el corte tambien: el informe de febrero corta el 29/02/2020 (antes de que empiece el periodo de marzo)
    r = await informe({ empresa: 'TESTBANCO' }, { ano: '2020', mes: '2' });
    assert.strictEqual(r.data.corte, '2020-02-29');
    assert.strictEqual(r.data.empresas[0].periodo.certificadas, 0);
    console.log('ok  el inicio del periodo y la fecha de corte acotan las certificaciones');

    // 3) empresa sin periodo cargado: periodo null (el PDF lo informa); TUID ve una seccion por empresa
    r = await informe({ empresa: 'TUID' }, { ano: '2020', mes: '3', empresa: 'TUID' });
    assert.strictEqual(r.data.todas, true);
    assert.strictEqual(r.data.empresas.find((e) => e.empresa === 'OTRABANCO').periodo, null);
    assert.ok(r.data.empresas.find((e) => e.empresa === 'TESTBANCO').periodo);
    console.log('ok  sin periodo cargado: null; TUID recibe el periodo de cada empresa');

    // 4) si la tabla empresa falla, el informe sale igual
    const original = db.sync_query;
    global.VIDA_DB = { sync_query: async (q, p) => { if (/FROM empresa WHERE id IN/.test(q)) throw new Error('sin columnas'); return original(q, p); } };
    r = await informe({ empresa: 'TESTBANCO' }, { ano: '2020', mes: '3' });
    assert.strictEqual(r.error, 0);
    assert.strictEqual(r.data.empresas[0].periodo, undefined);
    console.log('ok  falla al leer el periodo: el informe sale sin ese bloque');

    await db.sync_query("DELETE FROM auditoria WHERE fecha < '2021-01-01'");
    console.log('\nTodas las pruebas del periodo en el informe pasaron.');
    pool.end();
    process.exit(0);
})().catch((e) => { console.error('FALLO:', e); process.exit(1); });
