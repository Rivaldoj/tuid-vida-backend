// Notificaciones push: motivo de los fallos, limpieza de tokens que Firebase da por muertos, estimacion de tokens vencidos y lista de personas a
// las que no llego (para contactarlas por otro medio). Contra la MySQL LOCAL de prueba, sin Firebase real. Requiere: node test/db/setup.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const util = require('util');
const mysql = require('mysql');

global.CONFIG = { get: () => ({}), has: () => false };
const pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: '', database: 'vida_test', multipleStatements: true });
const db = { sync_query: util.promisify(pool.query).bind(pool) };
const notif = require('../../services/vida/admin/notificaciones');

async function llamar(handler, req) {
    let out;
    await handler(Object.assign({ query: {}, body: {}, user: { email: 'admin@tuid.test', empresa: 'TUID' } }, req), { status: () => ({ json: (j) => { out = j; } }) });
    return out;
}

(async () => {
    // --- funciones puras ---
    const ahora = Date.parse('2026-11-16T12:00:00Z');
    const hace = (dias) => new Date(ahora - dias * 86400000).toISOString();
    assert.strictEqual(notif.DIAS_TOKEN_VENCIDO, 270);
    assert.strictEqual(notif.tokenProbablementeVencido({ id_device: 'T', fecha_valida: hace(271) }, ahora), true);
    assert.strictEqual(notif.tokenProbablementeVencido({ id_device: 'T', fecha_valida: hace(269) }, ahora), false);
    assert.strictEqual(notif.tokenProbablementeVencido({ id_device: 'T', fecha_valida: null, fecha: hace(400) }, ahora), true, 'nunca certifico: cuenta desde el registro');
    assert.strictEqual(notif.tokenProbablementeVencido({ id_device: 'T', fecha_valida: hace(10), fecha: hace(900) }, ahora), false, 'la ultima certificacion renueva el token');
    assert.strictEqual(notif.tokenProbablementeVencido({ id_device: null, fecha_valida: hace(900) }, ahora), false, 'sin dispositivo no aplica');
    assert.strictEqual(notif.tokenProbablementeVencido({ id_device: 'T' }, ahora), false, 'sin fechas: no se asume nada');
    assert.ok(notif.textoMotivo('UNREGISTERED').includes('ya no está registrado'));
    assert.ok(notif.textoMotivo('UNAVAILABLE').includes('reintentar'));
    assert.strictEqual(notif.textoMotivo('sin token de dispositivo'), 'Sin la app instalada');
    assert.strictEqual(notif.textoMotivo('RARO'), 'RARO');
    assert.strictEqual(notif.textoMotivo(''), 'Motivo desconocido');
    console.log('ok  antiguedad del token y texto de los motivos');

    // --- con base ---
    await db.sync_query('DROP TABLE IF EXISTS textos_historial; DROP TABLE IF EXISTS textos; DROP TABLE IF EXISTS notificaciones_envios;');
    for (const f of ['textos.sql', 'notificaciones_log.sql']) await db.sync_query(fs.readFileSync(path.join(__dirname, '../../scripts/sql/' + f), 'utf8'));
    const personas = await db.sync_query("SELECT u.id_usuario, u.cuil FROM usuario u JOIN usuario_empresa ue ON ue.cuil = u.cuil WHERE ue.empresa = 'TESTBANCO' ORDER BY u.id_usuario");
    assert.ok(personas.length >= 3);
    const [p0, p1, p2] = personas;
    await db.sync_query('UPDATE usuario SET id_device = CONCAT("TOKEN-", id_usuario), fecha_fallecido = NULL, telefono = "1155550000", email = "x@y.test"');
    await db.sync_query('UPDATE usuario SET fecha_valida = DATE_SUB(NOW(), INTERVAL 300 DAY) WHERE id_usuario = ?', [p0.id_usuario]);                // token vencido
    await db.sync_query('UPDATE usuario SET fecha_valida = DATE_SUB(NOW(), INTERVAL 10 DAY) WHERE id_usuario = ?', [p1.id_usuario]);                 // token fresco
    await db.sync_query('UPDATE usuario SET fecha_valida = NULL, fecha = DATE_SUB(NOW(), INTERVAL 400 DAY) WHERE id_usuario = ?', [p2.id_usuario]);   // nunca certifico, registro viejo
    await db.sync_query("DELETE FROM auditoria WHERE empresa = 'TESTBANCO'");
    await db.sync_query("UPDATE empresa SET emails = 0, telefonos = 0 WHERE id = 'TESTBANCO'");

    let comportamiento = {};
    const srv = notif.crear({
        db,
        push: { sendAsync: async (token) => (comportamiento[token] ? comportamiento[token]() : { ok: true }) }
    });
    const base = { empresa: 'TESTBANCO', modo: 'nunca', titulo: 'Aviso', mensaje: 'Hola {{nombre}}' };

    // 1) la vista previa avisa cuantos tienen un token probablemente vencido
    let r = await llamar(srv.destinatarios, { body: { empresa: 'TESTBANCO', modo: 'nunca' } });
    assert.strictEqual(r.error, 0, JSON.stringify(r));
    assert.strictEqual(r.data.probablementeSinPush, 2, 'p0 (300 dias) y p2 (registro de hace 400 dias)');
    assert.strictEqual(r.data.diasTokenVencido, 270);
    assert.strictEqual(r.data.conDispositivo, personas.length);
    console.log('ok  la vista previa informa los tokens probablemente vencidos');

    // 2) envio: p0 token muerto (FCM UNREGISTERED), p1 falla transitoria, p2 sin la app
    await db.sync_query('UPDATE usuario SET id_device = NULL WHERE id_usuario = ?', [p2.id_usuario]);
    comportamiento['TOKEN-' + p0.id_usuario] = () => ({ ok: false, motivo: 'UNREGISTERED', tokenInvalido: true });
    comportamiento['TOKEN-' + p1.id_usuario] = () => ({ ok: false, motivo: 'UNAVAILABLE' });
    r = await llamar(srv.enviar, { body: base });
    assert.strictEqual(r.error, 0, JSON.stringify(r));
    assert.deepStrictEqual([r.data.enviados, r.data.fallidos, r.data.sinDispositivo, r.data.tokensEliminados], [personas.length - 3, 2, 1, 1]);
    assert.deepStrictEqual(r.data.motivos.map((m) => m.cantidad), [1, 1]);
    assert.ok(r.data.motivos.some((m) => m.motivo.includes('ya no está registrado')) && r.data.motivos.some((m) => m.motivo.includes('reintentar')));
    const [u0] = await db.sync_query('SELECT id_device FROM usuario WHERE id_usuario = ?', [p0.id_usuario]);
    const [u1] = await db.sync_query('SELECT id_device FROM usuario WHERE id_usuario = ?', [p1.id_usuario]);
    assert.strictEqual(u0.id_device, null, 'el token que Firebase dio por muerto se elimina');
    assert.strictEqual(u1.id_device, 'TOKEN-' + p1.id_usuario, 'una falla transitoria NO elimina el token');
    console.log('ok  motivos de los fallos y limpieza solo de los tokens muertos');

    // 3) lista de no alcanzados: quien, por que, y datos de contacto solo si la empresa los puede ver
    assert.strictEqual(r.data.noAlcanzados.length, 3);
    const motivosPorCuil = {};
    r.data.noAlcanzados.forEach((n) => { motivosPorCuil[n.cuil] = n.motivo; });
    assert.ok(motivosPorCuil[String(p0.cuil)].includes('ya no está registrado'));
    assert.strictEqual(motivosPorCuil[String(p2.cuil)], 'Sin la app instalada');
    assert.ok(r.data.noAlcanzados.every((n) => n.telefono === '1155550000' && n.email === 'x@y.test'), 'TUID ve el contacto');
    await db.sync_query('UPDATE usuario SET id_device = CONCAT("TOKEN-", id_usuario) WHERE id_usuario IN (?, ?)', [p0.id_usuario, p2.id_usuario]);
    comportamiento = { ['TOKEN-' + p0.id_usuario]: () => ({ ok: false, motivo: 'INVALID_ARGUMENT' }) };
    const cliente = { email: 'adm@testbanco.test', empresa: 'TESTBANCO' };
    r = await llamar(srv.enviar, { user: cliente, body: base });
    assert.ok(r.data.noAlcanzados.length >= 1 && r.data.noAlcanzados.every((n) => n.telefono === null && n.email === null), 'sin permiso de la empresa no se muestran los datos de contacto');
    assert.strictEqual(r.data.tokensEliminados, 0, 'INVALID_ARGUMENT no se considera token muerto');
    await db.sync_query("UPDATE empresa SET emails = 1, telefonos = 1 WHERE id = 'TESTBANCO'");
    r = await llamar(srv.enviar, { user: cliente, body: base });
    assert.ok(r.data.noAlcanzados.every((n) => n.telefono === '1155550000' && n.email === 'x@y.test'), 'con permiso de la empresa si se muestran');
    console.log('ok  lista de no alcanzados con contacto solo si la empresa lo tiene permitido');

    // 4) si la persona certifico desde otro telefono mientras se enviaba, su token nuevo no se borra
    await db.sync_query('UPDATE usuario SET id_device = CONCAT("TOKEN-", id_usuario)');
    comportamiento = {
        ['TOKEN-' + p0.id_usuario]: async () => { await db.sync_query("UPDATE usuario SET id_device = 'TOKEN-NUEVO' WHERE id_usuario = ?", [p0.id_usuario]); return { ok: false, motivo: 'UNREGISTERED', tokenInvalido: true }; }
    };
    r = await llamar(srv.enviar, { body: base });
    assert.strictEqual(r.data.tokensEliminados, 0);
    assert.strictEqual((await db.sync_query('SELECT id_device FROM usuario WHERE id_usuario = ?', [p0.id_usuario]))[0].id_device, 'TOKEN-NUEVO');
    console.log('ok  no se borra un token que cambio durante el envio');

    // 5) el historial guarda el detalle; y si la base todavia no tiene las columnas nuevas, el envio se registra igual
    const [h] = await db.sync_query('SELECT * FROM notificaciones_envios ORDER BY id DESC LIMIT 1');
    assert.ok(h.detalle && JSON.parse(h.detalle).motivos, 'detalle del envio');
    await db.sync_query('ALTER TABLE notificaciones_envios DROP COLUMN detalle, DROP COLUMN invalidos');
    const antes = (await db.sync_query('SELECT COUNT(*) n FROM notificaciones_envios'))[0].n;
    comportamiento = {};
    r = await llamar(srv.enviar, { body: base });
    assert.strictEqual(r.error, 0, JSON.stringify(r));
    assert.strictEqual((await db.sync_query('SELECT COUNT(*) n FROM notificaciones_envios'))[0].n, antes + 1, 'se registro sin las columnas nuevas');
    console.log('ok  detalle en el historial y registro compatible con la base sin las columnas nuevas');

    console.log('\nTodas las pruebas de tokens de notificaciones pasaron.');
    pool.end();
    process.exit(0);
})().catch((e) => { console.error('FALLO:', e); process.exit(1); });
