// Prueba las notificaciones push por rango de fechas y con mensajes prearmados, contra la MySQL LOCAL de prueba (sin Firebase real).
// Requiere: node test/db/setup.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const util = require('util');
const mysql = require('mysql');

global.CONFIG = { get: () => ({}), has: () => false };
const pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: '', database: 'vida_test', multipleStatements: true });
const db = { sync_query: util.promisify(pool.query).bind(pool) };

async function llamar(handler, req) {
    let out;
    await handler(Object.assign({ query: {}, body: {}, user: { email: 'admin@tuid.test', empresa: 'TUID' } }, req), { status: () => ({ json: (j) => { out = j; } }) });
    return out;
}

(async () => {
    await db.sync_query('DROP TABLE IF EXISTS textos_historial; DROP TABLE IF EXISTS textos; DROP TABLE IF EXISTS notificaciones_envios;');
    for (const f of ['textos.sql', 'notificaciones_log.sql']) await db.sync_query(fs.readFileSync(path.join(__dirname, '../../scripts/sql/' + f), 'utf8'));

    const enviados = [];
    let fallarA = null;
    const srv = require('../../services/vida/admin/notificaciones').crear({
        db,
        push: { sendAsync: async (token, titulo, texto) => { enviados.push({ token, titulo, texto }); return token === fallarA ? { ok: false, motivo: 'UNREGISTERED' } : { ok: true }; } }
    });

    const personas = await db.sync_query("SELECT u.id_usuario, u.cuil, u.id_device FROM usuario u JOIN usuario_empresa ue ON ue.cuil = u.cuil WHERE ue.empresa = 'TESTBANCO' ORDER BY u.id_usuario");
    assert.ok(personas.length >= 3, 'hay personas de prueba');
    // fechas conocidas: la primera certifico hace 5 dias, la segunda hace 100, la tercera nunca
    await db.sync_query("DELETE FROM auditoria WHERE empresa = 'TESTBANCO'");
    await db.sync_query("INSERT INTO auditoria (id_usuario, fecha, similitud, empresa, cuil, session_id) VALUES (?, DATE_SUB(NOW(), INTERVAL 5 DAY), 95, 'TESTBANCO', ?, 's1'), (?, DATE_SUB(NOW(), INTERVAL 100 DAY), 95, 'TESTBANCO', ?, 's2')",
        [personas[0].id_usuario, personas[0].cuil, personas[1].id_usuario, personas[1].cuil]);
    await db.sync_query('UPDATE usuario SET id_device = CONCAT("TOKEN-", id_usuario), fecha_fallecido = NULL');

    // combo de mensajes: solo textos push activos
    let r = await llamar(srv.mensajes, {});
    assert.strictEqual(r.error, 0);
    assert.ok(r.data.length >= 2 && r.data.every((m) => m.clave.endsWith('_PUSH')), JSON.stringify(r.data.map((m) => m.clave)));
    console.log('ok  combo de mensajes prearmados (solo push)');

    // destinatarios segun el modo: no envia nada
    const base = { empresa: 'TESTBANCO' };
    r = await llamar(srv.destinatarios, { body: { ...base, modo: 'dias', dias: 30 } });
    assert.strictEqual(r.data.total, personas.length - 1, 'sin certificar hace mas de 30 dias: todos menos la que certifico hace 5 dias');
    r = await llamar(srv.destinatarios, { body: { ...base, modo: 'nunca' } });
    assert.strictEqual(r.data.total, personas.length - 2);
    const hoy = (d) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
    r = await llamar(srv.destinatarios, { body: { ...base, modo: 'rango', desde: hoy(120), hasta: hoy(60) } });
    assert.strictEqual(r.data.total, 1, 'ultima certificacion dentro del rango');
    r = await llamar(srv.destinatarios, { body: { ...base, modo: 'rango', desde: hoy(6), hasta: hoy(5) } });
    assert.strictEqual(r.data.total, 1, 'el dia "hasta" se incluye completo');
    r = await llamar(srv.destinatarios, { body: { ...base, modo: 'cuil', cuil: personas[0].cuil } });
    assert.strictEqual(r.data.total, 1);
    assert.strictEqual(enviados.length, 0, 'consultar no envia');
    console.log('ok  destinatarios por dias, rango, nunca certificaron y CUIL');

    // validaciones
    for (const body of [
        { ...base, modo: 'xx' }, { ...base, modo: 'cuil', cuil: '123' }, { ...base, modo: 'dias', dias: 0 }, { ...base, modo: 'dias', dias: 'a' },
        { ...base, modo: 'rango', desde: '2026-01-01' }, { ...base, modo: 'rango', desde: '2026-02-01', hasta: '2026-01-01' }, { modo: 'nunca' }
    ]) assert.strictEqual((await llamar(srv.destinatarios, { body })).error, 1, JSON.stringify(body));
    console.log('ok  validaciones');

    // un administrador de empresa solo puede enviar a SU empresa, aunque pida otra
    r = await llamar(srv.destinatarios, { user: { email: 'x@otra', empresa: 'OTRABANCO' }, body: { empresa: 'TESTBANCO', modo: 'nunca' } });
    assert.strictEqual(r.data.total, 0, 'se ignora la empresa pedida: usa la propia');
    console.log('ok  cada empresa solo envia a sus usuarios');

    // envio con mensaje prearmado: variables por persona, registro en el historial
    r = await llamar(srv.enviar, { body: { ...base, modo: 'dias', dias: 30, clave: 'RECORDATORIO_FE_DE_VIDA_PUSH' } });
    assert.strictEqual(r.error, 0, JSON.stringify(r));
    assert.deepStrictEqual([r.data.enviados, r.data.fallidos], [personas.length - 1, 0]);
    assert.strictEqual(enviados.length, personas.length - 1);
    assert.ok(enviados.every((e) => e.titulo && !e.texto.includes('{{') && !e.titulo.includes('{{')));
    let [h] = await db.sync_query('SELECT * FROM notificaciones_envios ORDER BY id DESC LIMIT 1');
    assert.ok(h.usuario === 'admin@tuid.test' && h.empresa === 'TESTBANCO' && h.destinatarios === personas.length - 1 && h.enviados === personas.length - 1 && h.clave_texto === 'RECORDATORIO_FE_DE_VIDA_PUSH');
    console.log('ok  envio con mensaje prearmado + registro');

    // fallos parciales y mensaje libre
    enviados.length = 0;
    fallarA = 'TOKEN-' + personas[0].id_usuario;
    r = await llamar(srv.enviar, { body: { ...base, modo: 'cuil', cuil: personas[0].cuil, titulo: 'Aviso', mensaje: 'Hola {{nombre}}, recuerde su Fe de Vida.' } });
    assert.strictEqual(r.error, 0);
    assert.deepStrictEqual([r.data.enviados, r.data.fallidos], [0, 1]);
    assert.ok(/^Hola [^{}]+, recuerde/.test(enviados[0].texto), JSON.stringify(enviados));
    fallarA = null;
    console.log('ok  mensaje libre y conteo de fallidos');

    // errores: texto inexistente, de otro canal, desactivado, sin dispositivo, mensaje vacio o muy largo
    enviados.length = 0;
    assert.strictEqual((await llamar(srv.enviar, { body: { ...base, modo: 'nunca', clave: 'NO_EXISTE' } })).error, 1);
    assert.strictEqual((await llamar(srv.enviar, { body: { ...base, modo: 'nunca', clave: 'AUDITORIA_OBSERVADA_WHATSAPP' } })).error, 1, 'un texto de WhatsApp no sirve para push');
    assert.strictEqual((await llamar(srv.enviar, { body: { ...base, modo: 'nunca', titulo: '', mensaje: 'x' } })).error, 1);
    assert.strictEqual((await llamar(srv.enviar, { body: { ...base, modo: 'nunca', titulo: 'a', mensaje: 'x'.repeat(201) } })).error, 1);
    await db.sync_query("UPDATE usuario SET id_device = NULL WHERE cuil = ?", [personas[0].cuil]);
    r = await llamar(srv.enviar, { body: { ...base, modo: 'cuil', cuil: personas[0].cuil, titulo: 'a', mensaje: 'b' } });
    assert.strictEqual(r.error, 1, 'sin la app instalada no hay a quien enviar');
    assert.strictEqual(enviados.length, 0);
    await db.sync_query("UPDATE usuario SET fecha_fallecido = NOW() WHERE cuil = ?", [personas[1].cuil]);
    r = await llamar(srv.destinatarios, { body: { ...base, modo: 'dias', dias: 30 } });
    assert.strictEqual(r.data.total, personas.length - 2, 'no se notifica a fallecidos');
    console.log('ok  errores y fallecidos excluidos');

    r = await llamar(srv.historial, {});
    assert.ok(r.error === 0 && r.data.length >= 2);
    r = await llamar(srv.historial, { user: { email: 'x@otra', empresa: 'OTRABANCO' } });
    assert.strictEqual(r.data.length, 0, 'cada empresa ve solo su historial');
    console.log('ok  historial');

    console.log('\nTodas las pruebas de notificaciones pasaron.');
    pool.end();
    process.exit(0);
})().catch((e) => { console.error('FALLO:', e); process.exit(1); });
