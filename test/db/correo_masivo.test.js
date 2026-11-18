// Correo masivo del panel contra la MySQL LOCAL de prueba (sin SES real).
// Requiere: node test/db/setup.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const util = require('util');
const mysql = require('mysql');

global.CONFIG = { get: (k) => (k === 'security.aesKey' ? 'k'.repeat(32) : {}), has: (k) => k === 'security.aesKey' };
const pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: '', database: 'vida_test', multipleStatements: true });
const db = { sync_query: util.promisify(pool.query).bind(pool) };
const { PERSONAS } = require('./setup');
const modulo = require('../../services/vida/admin/correoMasivo');

const TUID = { email: 'admin@tuid.test', empresa: 'TUID', rol: 'A' };
async function llamar(handler, req) {
    let out;
    await handler(Object.assign({ query: {}, params: {}, body: {}, user: TUID }, req), { status: () => ({ json: (j) => { out = j; } }) });
    return out;
}
const esperar = async (cond, ms) => { const t0 = Date.now(); while (!(await cond())) { if (Date.now() - t0 > (ms || 8000)) throw new Error('tiempo agotado'); await new Promise((r) => setTimeout(r, 50)); } };
const hoy = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

(async () => {
    await db.sync_query('DROP TABLE IF EXISTS textos_historial; DROP TABLE IF EXISTS textos; DROP TABLE IF EXISTS correos_envios; DROP TABLE IF EXISTS correos_bajas;');
    await db.sync_query(fs.readFileSync(path.join(__dirname, '../../scripts/sql/textos.sql'), 'utf8'));
    await db.sync_query("INSERT INTO textos (clave, canal, formato, nombre, asunto, cuerpo, actualizado_por, actualizado_en) VALUES " +
        "('COM_PRUEBA', 'email', 'html', 'Comunicacion de prueba', 'Hola {{nombre}}, vence el {{fecha_vencimiento}}', '<p>Estimada/o {{nombre_completo}}: certifique antes del {{fecha_vencimiento}}.</p>', 'test', NOW()), " +
        "('PIE_CORREO', 'email', 'html', 'Pie', NULL, '<p>PIE-DE-PRUEBA</p>', 'test', NOW())");

    const enviados = [];
    let demora = 0;
    let fallarA = null;
    const srv = modulo.crear({
        db,
        enviar: async (html, asunto, para) => {
            if (demora) await new Promise((r) => setTimeout(r, demora));
            if (para === fallarA) { const e = new Error('Email address is not verified'); e.code = 'MessageRejected'; throw e; }
            enviados.push({ html, asunto, para });
        },
        soporte: () => 'soporte@tuid.test'
    });

    // Datos: TESTBANCO con periodo vigente (hoy-30 .. hoy+30). Setup: Ana certifico hace 240+ dias, Beto y Carlos hace 10 dias, Dora nunca.
    await db.sync_query("UPDATE empresa SET nombre = 'Banco de Prueba', Fecha_actual = ?, Fecha_fin = ?, emails = 0 WHERE id = 'TESTBANCO'", [hoy(-30), hoy(30)]);
    await db.sync_query('UPDATE usuario SET fecha_fallecido = NULL');
    const emailDe = async (k) => (await db.sync_query('SELECT email FROM usuario WHERE cuil = ?', [PERSONAS[k].cuil]))[0].email;
    const base = { empresa: 'TESTBANCO' };

    // combo: textos de correo activos, sin los de sistema
    let r = await llamar(srv.mensajes, {});
    assert.deepStrictEqual(r.data.map((m) => m.clave), ['COM_PRUEBA'], 'solo los textos COM_: el pie y los correos del sistema no se ofrecen');
    assert.ok((await llamar(srv.prueba, { body: { clave: 'AUDITORIA_OBSERVADA_EMAIL' } })).error, 'un texto del sistema no se puede enviar como comunicacion');
    console.log('ok  combo de mensajes (sin textos de sistema)');

    // segmentos
    r = await llamar(srv.destinatarios, { body: { ...base, segmento: 'pendientes' } });
    assert.strictEqual(r.error, 0, JSON.stringify(r));
    assert.strictEqual(r.data.total, 2, 'pendientes del periodo: Ana (certifico hace mucho) y Dora (nunca)');
    assert.deepStrictEqual(r.data.periodo, { desde: hoy(-30), hasta: hoy(30) });
    r = await llamar(srv.destinatarios, { body: { ...base, segmento: 'nousan' } });
    assert.strictEqual(r.data.total, 1, 'registrados que nunca certificaron: Dora');
    r = await llamar(srv.destinatarios, { body: { ...base, segmento: 'nousan', dias: 30 } });
    assert.strictEqual(r.data.total, 2, 'o sin certificar hace mas de 30 dias: Ana y Dora');
    r = await llamar(srv.destinatarios, { body: { ...base, segmento: 'cuil', cuil: PERSONAS.carlos.cuil } });
    assert.strictEqual(r.data.total, 1);
    console.log('ok  segmentos: pendientes del periodo, nunca certificaron, sin certificar hace N dias, un CUIL');

    // validaciones y periodo faltante
    assert.ok((await llamar(srv.destinatarios, { body: { ...base, segmento: 'otro' } })).error);
    assert.ok((await llamar(srv.destinatarios, { body: { ...base, segmento: 'cuil', cuil: '123' } })).error);
    assert.ok((await llamar(srv.destinatarios, { body: { ...base, segmento: 'nousan', dias: 0 } })).error);
    await db.sync_query("UPDATE empresa SET Fecha_actual = NULL WHERE id = 'TESTBANCO'");
    r = await llamar(srv.destinatarios, { body: { ...base, segmento: 'pendientes' } });
    assert.ok(/período/.test(r.data), 'sin periodo cargado no se puede armar "pendientes"');
    await db.sync_query("UPDATE empresa SET Fecha_actual = ? WHERE id = 'TESTBANCO'", [hoy(-30)]);
    console.log('ok  validaciones');

    // sin correo / fallecido / baja / repetido
    const mailDora = await emailDe('dora');
    await db.sync_query('UPDATE usuario SET email = NULL WHERE cuil = ?', [PERSONAS.dora.cuil]);
    r = await llamar(srv.destinatarios, { body: { ...base, segmento: 'pendientes' } });
    assert.deepStrictEqual([r.data.total, r.data.sinCorreo], [1, 1], 'Dora sin correo: se cuenta aparte');
    await db.sync_query('UPDATE usuario SET email = ? WHERE cuil = ?', [mailDora, PERSONAS.dora.cuil]);
    await db.sync_query('UPDATE usuario SET fecha_fallecido = NOW() WHERE cuil = ?', [PERSONAS.dora.cuil]);
    r = await llamar(srv.destinatarios, { body: { ...base, segmento: 'pendientes' } });
    assert.strictEqual(r.data.total, 1, 'los fallecidos no reciben');
    await db.sync_query('UPDATE usuario SET fecha_fallecido = NULL WHERE cuil = ?', [PERSONAS.dora.cuil]);
    assert.strictEqual((await llamar(srv.bajas, { user: { ...TUID, empresa: 'TESTBANCO' } })).error, 1, 'las bajas son solo de TUID');
    assert.strictEqual((await llamar(srv.agregarBaja, { body: { cuil: PERSONAS.dora.cuil, motivo: 'pidio la baja' } })).error, 0);
    r = await llamar(srv.destinatarios, { body: { ...base, segmento: 'pendientes' } });
    assert.deepStrictEqual([r.data.total, r.data.enBaja], [1, 1], 'Dora de baja');
    const lista = (await llamar(srv.bajas, {})).data;
    assert.strictEqual(lista.length, 1);
    await llamar(srv.quitarBaja, { params: { id: lista[0].id } });
    r = await llamar(srv.destinatarios, { body: { ...base, segmento: 'pendientes' } });
    assert.strictEqual(r.data.total, 2, 'baja quitada');
    const c = modulo.clasificar([{ cuil: '1', email: 'a@x.com' }, { cuil: '2', email: 'A@X.COM' }, { cuil: '3', email: 'malo' }, { cuil: '4', email: 'b@x.com' }], [{ cuil: null, email: 'b@x.com' }]);
    assert.deepStrictEqual([c.enviar.length, c.repetidos, c.sinCorreo.length, c.enBaja.length], [1, 1, 1, 1], 'misma direccion una sola vez, baja por correo');
    console.log('ok  sin correo, fallecidos, bajas y direcciones repetidas');

    // empresa cliente: solo la suya y solo con el envio de correos habilitado
    const cliente = { email: 'adm@banco.test', empresa: 'TESTBANCO', rol: 'A' };
    r = await llamar(srv.destinatarios, { user: cliente, body: { empresa: 'OTRA', segmento: 'pendientes' } });
    assert.ok(/habilitado/.test(r.data), 'sin emails=1 no puede');
    await db.sync_query("UPDATE empresa SET emails = 1 WHERE id = 'TESTBANCO'");
    r = await llamar(srv.destinatarios, { user: cliente, body: { empresa: 'OTRA', segmento: 'pendientes' } });
    assert.strictEqual(r.data.total, 2, 'usa su empresa y no la que pide');
    console.log('ok  empresa cliente: solo la suya y solo si tiene el envio habilitado');

    // prueba: sale a quien esta logueado con datos de ejemplo
    enviados.length = 0;
    r = await llamar(srv.prueba, { body: { clave: 'COM_PRUEBA' } });
    assert.strictEqual(r.error, 0, JSON.stringify(r));
    assert.deepStrictEqual(enviados.map((e) => e.para), ['admin@tuid.test']);
    assert.ok(enviados[0].asunto.startsWith('[PRUEBA] Hola Ana'), enviados[0].asunto);
    console.log('ok  correo de prueba');

    // envio real en segundo plano: variables, pie, linea de baja, historial, y un rechazo de SES
    enviados.length = 0;
    fallarA = await emailDe('ana');
    demora = 200;
    r = await llamar(srv.enviar, { body: { ...base, segmento: 'pendientes', clave: 'COM_PRUEBA' } });
    assert.strictEqual(r.error, 0, JSON.stringify(r));
    const id = r.data.id;
    assert.strictEqual(r.data.total, 2);
    const otro = await llamar(srv.enviar, { body: { ...base, segmento: 'pendientes', clave: 'COM_PRUEBA' } });
    assert.ok(/en curso/.test(otro.data), 'un solo envio a la vez');
    await esperar(async () => (await llamar(srv.envio, { params: { id } })).data.estado !== 'enviando');
    demora = 0;
    const e = (await llamar(srv.envio, { params: { id } })).data;
    assert.deepStrictEqual([e.estado, e.destinatarios, e.enviados, e.fallidos], ['terminado', 2, 1, 1]);
    assert.strictEqual(e.noAlcanzados.length, 1);
    assert.ok(/no habilitada/.test(e.noAlcanzados[0].motivo), e.noAlcanzados[0].motivo);
    assert.strictEqual(e.noAlcanzados[0].email, fallarA);
    assert.strictEqual(enviados.length, 1);
    assert.ok(/^Hola Dora, vence el \d\d\/\d\d\/\d{4}$/.test(enviados[0].asunto), enviados[0].asunto);
    assert.ok(enviados[0].html.includes('PIE-DE-PRUEBA') && enviados[0].html.includes('soporte@tuid.test') && enviados[0].html.includes('Dora'), 'pie, baja y variables');
    const hist = (await llamar(srv.historial, {})).data;
    assert.strictEqual(hist[0].id, id);
    assert.strictEqual((await llamar(srv.historial, { user: { ...cliente, empresa: 'OTRA' } })).data.length, 0, 'cada empresa ve lo suyo');
    // aviso de envio reciente
    r = await llamar(srv.destinatarios, { body: { ...base, segmento: 'pendientes' } });
    assert.ok(r.data.envioReciente, 'avisa si ya se envio algo parecido en las ultimas 24 h');
    console.log('ok  envio en segundo plano, rechazo de SES, historial y aviso de envio reciente');

    // un envio que quedo "enviando" hace rato (el servidor se reinicio) se muestra interrumpido
    await db.sync_query("INSERT INTO correos_envios (fecha, empresa, segmento, destinatarios, estado, actualizado) VALUES (NOW(), 'TESTBANCO', 'nousan', 5, 'enviando', DATE_SUB(NOW(), INTERVAL 1 HOUR))");
    const h2 = (await llamar(srv.historial, {})).data;
    assert.strictEqual(h2[0].estado, 'interrumpido');
    console.log('ok  envio interrumpido');

    // permisos
    const { getUserPermissions } = require('../../services/vida/admin/user');
    assert.ok(getUserPermissions({ empresa: 'TUID', rol: 'A' }).includes('CORREOS'));
    assert.ok(getUserPermissions({ empresa: 'BANCO', rol: 'A' }).includes('CORREOS'));
    assert.ok(!getUserPermissions({ empresa: 'TUID', rol: 'U' }).includes('CORREOS'));
    assert.ok(!getUserPermissions({ empresa: 'BANCO', rol: 'U' }).includes('CORREOS'));
    console.log('ok  permiso CORREOS (administradores)');

    console.log('Todas las pruebas del correo masivo pasaron.');
    pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
