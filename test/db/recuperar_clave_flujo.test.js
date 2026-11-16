// Prueba el pedido real de "olvide mi contrasena" (user.forgot) con el correo simulado, contra la MySQL LOCAL de prueba.
// Verifica que el correo sale con el texto del panel + pie y que, si el texto falta, sale el mensaje fijo de siempre.
// Requiere: node test/db/setup.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const util = require('util');
const mysql = require('mysql');

global.CONFIG = { get: (k) => (k === 'security.aesKey' ? 'k'.repeat(32) : {}), has: (k) => k === 'security.aesKey' };
global.TESTING = true;
const enviados = [];
const Module = require('module');
const orig = Module._load;
Module._load = function (req) {
    if (/utils\/mail$/.test(req)) return { sendHtmlAsync: async (html, to, subject, from) => { enviados.push({ html, to, subject, from }); } };
    if (/aws-sdk|nodemailer|utils\/(bucket|maps|slack|sms|push|whatsapp)$/.test(req)) {
        const dummy = function () { return proxy; };
        const proxy = new Proxy(dummy, { get: (t, k) => (k === 'then' ? undefined : proxy), apply: () => proxy, construct: () => proxy });
        return proxy;
    }
    return orig.apply(this, arguments);
};

const pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: '', database: 'vida_test', multipleStatements: true });
global.VIDA_DB = pool;
global.VIDA_DB.sync_query = util.promisify(pool.query).bind(pool);
const q = (sql, p) => VIDA_DB.sync_query(sql, p);
const sqlf = (f) => fs.readFileSync(path.join(__dirname, '../../scripts/sql', f), 'utf8');
const user = require('../../services/vida/admin/user');

function pedir(email) {
    return new Promise((resolve) => {
        user.forgot({ body: { email } }, { status: () => ({ json: (j) => resolve(j) }) }, (e) => resolve({ error: 1, data: String(e) }));
    });
}

(async () => {
    await q('DROP TABLE IF EXISTS textos_historial; DROP TABLE IF EXISTS textos;');
    await q(sqlf('textos.sql'));
    await q(sqlf('textos_pie.sql'));
    await q("DELETE FROM cliente WHERE email = 'persona@banco.test'");
    await q("INSERT INTO cliente (email, empresa, rol, activo, Nombre) VALUES ('persona@banco.test', 'TESTBANCO', 'U', 1, 'Persona Prueba')");

    // 1) sin el texto en el panel: sale el mensaje fijo de siempre
    let r = await pedir('persona@banco.test');
    assert.strictEqual(r.error, 0, JSON.stringify(r));
    let [c] = await q("SELECT resetPasswordToken t FROM cliente WHERE email = 'persona@banco.test'");
    assert.strictEqual(enviados.length, 1);
    assert.strictEqual(enviados[0].subject, 'Confirmacion TuID');
    assert.ok(enviados[0].html.includes(c.t) && enviados[0].html.includes('Esta recibiendo este email'), 'mensaje fijo');
    assert.ok(!enviados[0].html.includes('Canales de Ayuda'), 'el mensaje fijo no lleva el pie');
    console.log('ok  sin texto en el panel: mensaje fijo con el token');

    // 2) con el texto del panel: cuerpo editable + pie compartido
    await q(sqlf('textos_recuperar_clave.sql'));
    r = await pedir('persona@banco.test');
    assert.strictEqual(r.error, 0);
    [c] = await q("SELECT resetPasswordToken t FROM cliente WHERE email = 'persona@banco.test'");
    const m = enviados[1];
    assert.strictEqual(enviados.length, 2);
    assert.strictEqual(m.to, 'persona@banco.test');
    assert.strictEqual(m.from, 'contacto@autenticartuid.com');
    assert.strictEqual(m.subject, 'Confirmacion TuID');
    assert.ok(m.html.includes(c.t) && c.t.length === 12, 'lleva el token real');
    assert.ok(m.html.includes('Está recibiendo este email') && m.html.includes('Canales de Ayuda'), 'texto del panel y pie');
    console.log('ok  con el texto del panel: token real, remitente, asunto y pie');

    // 3) el texto se edita desde el panel y el cambio se ve en el siguiente correo
    await q("UPDATE textos SET cuerpo = '<p>Codigo nuevo: <strong>{{token}}</strong></p>' WHERE clave = 'RECUPERAR_CLAVE_PANEL'");
    await pedir('persona@banco.test');
    [c] = await q("SELECT resetPasswordToken t FROM cliente WHERE email = 'persona@banco.test'");
    assert.ok(enviados[2].html.includes('Codigo nuevo: <strong>' + c.t + '</strong>'));
    console.log('ok  la edicion del panel se refleja en el siguiente correo');

    // 4) si el texto falla en la base (tabla ausente), igual sale el mensaje fijo
    await q('DROP TABLE textos_historial; DROP TABLE textos;');
    r = await pedir('persona@banco.test');
    assert.strictEqual(r.error, 0);
    assert.ok(enviados[3].html.includes('Esta recibiendo este email'), 'respaldo ante falla de la base');
    console.log('ok  falla del modulo de textos: sale el mensaje fijo');

    await q("DELETE FROM cliente WHERE email = 'persona@banco.test'");
    console.log('\nTodas las pruebas del flujo de recuperacion de clave pasaron.');
    pool.end();
    process.exit(0);
})().catch((e) => { console.error('FALLO:', e); process.exit(1); });
