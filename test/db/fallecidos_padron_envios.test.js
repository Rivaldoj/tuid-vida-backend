// Quienes figuran fallecidos en el padron (master) no reciben notificaciones ni correos, aunque usuario no lo tenga marcado; y si el padron
// no responde, no se envia a ciegas. MySQL LOCAL de prueba. Requiere: node test/db/setup.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const util = require('util');
const mysql = require('mysql');
const { PERSONAS } = require('./setup');

global.CONFIG = { get: (k) => (k === 'security.aesKey' ? 'k'.repeat(32) : {}), has: (k) => k === 'security.aesKey' };
const pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: '', database: 'vida_test', multipleStatements: true });
const db = { sync_query: util.promisify(pool.query).bind(pool) };
const poolP = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: '', database: 'padron_test' });
const padron = { sync_query: util.promisify(poolP.query).bind(poolP) };
const pf = require('../../utils/padronFallecidos');

async function llamar(handler, req) {
    let out;
    await handler(Object.assign({ query: {}, body: {}, user: { email: 'admin@tuid.test', empresa: 'TUID' } }, req), { status: () => ({ json: (j) => { out = j; } }) });
    return out;
}

(async () => {
    // 1) la funcion comun: por tandas, solo Fallecido = 1, y error publico si el padron falla
    const consultas = [];
    const falso = { sync_query: async (sql, p) => { consultas.push(p[0].length); return p[0].filter((c) => Number(c) % 2 === 0).map((c) => ({ CUIL: c })); } };
    const cuils = Array.from({ length: 4500 }, (_, i) => 20000000000 + i);
    let set = await pf.crear(falso).fallecidas(cuils);
    assert.deepStrictEqual(consultas, [2000, 2000, 500], 'por tandas de 2000');
    assert.strictEqual(set.size, 2250);
    assert.strictEqual((await pf.crear(falso).fallecidas([])).size, 0);
    let error = null;
    try { await pf.crear({ sync_query: async () => { throw new Error('ECONNREFUSED'); } }).fallecidas([20000000001]); } catch (e) { error = e; }
    assert.ok(error && error.publico && error.message === pf.MENSAJE);
    error = null;
    try { await pf.crear({ sync_query: () => new Promise(() => {}) }, { esperaMs: 50 }).fallecidas([20000000001]); } catch (e) { error = e; }
    assert.ok(error && error.publico, 'si el padron no contesta a tiempo tambien se detiene');
    console.log('ok  funcion comun: tandas, solo fallecidos y error publico si el padron no responde');

    // 2) en notificaciones y correo
    const { ana, beto, carlos } = PERSONAS;
    await db.sync_query('UPDATE usuario SET fecha_fallecido = NULL, id_device = CONCAT("TOKEN-", id_usuario)');
    await padron.sync_query('DELETE FROM master WHERE CUIL = ?', [beto.cuil]);
    await padron.sync_query("INSERT INTO master (CUIL, Apellido_Nombre, DNI, Fallecido, FechaFalle) VALUES (?, 'BETO PRUEBA', 30000099, 1, '2026-09-01')", [beto.cuil]);
    const real = pf.crear(padron);

    await db.sync_query('DROP TABLE IF EXISTS textos_historial; DROP TABLE IF EXISTS textos; DROP TABLE IF EXISTS notificaciones_envios;');
    for (const f of ['textos.sql', 'notificaciones_log.sql']) await db.sync_query(fs.readFileSync(path.join(__dirname, '../../scripts/sql/' + f), 'utf8'));
    const mk = (fallecidas) => require('../../services/vida/admin/notificaciones').crear({ db, push: { sendAsync: async () => ({ ok: true }) }, fallecidas });
    const conMaster = await llamar(mk(real.fallecidas).destinatarios, { body: { empresa: 'TESTBANCO', modo: 'dias', dias: 1 } });
    const sinMaster = await llamar(mk(null).destinatarios, { body: { empresa: 'TESTBANCO', modo: 'dias', dias: 1 } });
    assert.strictEqual(sinMaster.error, 0, JSON.stringify(sinMaster));
    const esBeto = (await db.sync_query("SELECT 1 FROM usuario u JOIN usuario_empresa ue ON ue.cuil = u.cuil WHERE ue.empresa = 'TESTBANCO' AND u.cuil = ?", [beto.cuil])).length === 1;
    assert.strictEqual(conMaster.data.total, sinMaster.data.total - (esBeto ? 1 : 0), 'Beto (fallecido en master) no recibe la notificacion');
    const caido = await llamar(mk(async () => { throw Object.assign(new Error(pf.MENSAJE), { publico: true }); }).destinatarios, { body: { empresa: 'TESTBANCO', modo: 'dias', dias: 1 } });
    assert.strictEqual(caido.error, 1);
    assert.strictEqual(caido.data, pf.MENSAJE, 'si el padron falla se avisa y no se sigue');
    console.log('ok  notificaciones: excluye a los fallecidos del padron y se detiene si el padron falla');

    const modulo = require('../../services/vida/admin/correoMasivo');
    const hoy = (d) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
    await db.sync_query("UPDATE empresa SET nombre = 'Banco de Prueba', Fecha_actual = ?, Fecha_fin = ?, emails = 0 WHERE id = 'TESTBANCO'", [hoy(30), hoy(-30)]);
    const enviados = [];
    const mc = (fallecidas) => modulo.crear({ db, enviar: async (h, a, para) => { enviados.push(para); }, soporte: () => 's@t.test', fallecidas });
    const c1 = await llamar(mc(real.fallecidas).destinatarios, { body: { empresa: 'TESTBANCO', segmento: 'nousan', dias: 1 } });
    const c0 = await llamar(mc(null).destinatarios, { body: { empresa: 'TESTBANCO', segmento: 'nousan', dias: 1 } });
    assert.strictEqual(c0.error, 0, JSON.stringify(c0));
    assert.strictEqual(c1.data.total, c0.data.total - (esBeto ? 1 : 0), 'Beto no recibe el correo');
    const c2 = await llamar(mc(async () => { throw Object.assign(new Error(pf.MENSAJE), { publico: true }); }).destinatarios, { body: { empresa: 'TESTBANCO', segmento: 'nousan', dias: 1 } });
    assert.strictEqual(c2.data, pf.MENSAJE);
    assert.strictEqual(enviados.length, 0);
    console.log('ok  correo: excluye a los fallecidos del padron y se detiene si el padron falla');

    await padron.sync_query('DELETE FROM master WHERE CUIL = ?', [beto.cuil]);
    console.log('\nTodas las pruebas de fallecidos del padron en envios pasaron.');
    pool.end(); poolP.end();
    process.exit(0);
})().catch((e) => { console.error('FALLO:', e); process.exit(1); });
