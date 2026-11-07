// Prueba las claves del panel (scrypt con sal + compatibilidad con SHA1 viejo) y el login / cambio / reseteo, contra la MySQL LOCAL de prueba.
// Requiere: node test/db/setup.js
const assert = require('assert');
const crypto = require('crypto');
const util = require('util');
const mysql = require('mysql');

let scrypt = false;
global.CONFIG = {
    get: (k) => (k === 'security.aesKey' ? 'k'.repeat(32) : k === 'security.passwordHash' ? 'scrypt' : k === 'jwt'
        ? { key: 'clave-de-prueba', time: 1, units: 'days', authenticatorAdmin: { key: 'a', time: 1, units: 'days' }, vidaAdmin: { time: 1, units: 'days' } } : {}),
    has: (k) => k === 'security.aesKey' || (k === 'security.passwordHash' && scrypt)
};
global.TESTING = true;
const Module = require('module');
const orig = Module._load;
Module._load = function (req) {
    if (/aws-sdk|nodemailer|utils\/(bucket|maps|slack|sms|push|mail|whatsapp)$/.test(req)) {
        const dummy = function () { return proxy; };
        const proxy = new Proxy(dummy, { get: (t, k) => (k === 'then' ? undefined : proxy), apply: () => proxy, construct: () => proxy });
        return proxy;
    }
    return orig.apply(this, arguments);
};

const pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: '', database: 'vida_test', multipleStatements: true });
pool.on('connection', (c) => c.query("SET SESSION sql_mode=''")); // la consulta de login mezcla agregados sin GROUP BY (asi corre en produccion)
global.VIDA_DB = pool;
global.VIDA_DB.sync_query = util.promisify(pool.query).bind(pool);
const q = (sql, p) => VIDA_DB.sync_query(sql, p);
const P = require('../../utils/password');
const user = require('../../services/vida/admin/user');

function llamar(handler, body) {
    return new Promise((resolve) => {
        handler({ body, user: { empresa: 'TUID' } }, { status: () => ({ json: (j) => resolve(j) }) }, (e) => resolve({ error: 1, data: String(e) }));
    });
}
const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
    // --- utilidades puras
    scrypt = true;
    const h = P.paraGuardar('Clave-Segura-1');
    assert.ok(h.startsWith('s1$') && h.length <= 255 && h.length > 90, 'formato nuevo con sal');
    assert.notStrictEqual(h, P.paraGuardar('Clave-Segura-1'), 'la sal hace distinto cada hash');
    assert.deepStrictEqual(P.verificar('Clave-Segura-1', h), { ok: true, actualizar: false });
    assert.strictEqual(P.verificar('otra', h).ok, false);
    assert.deepStrictEqual(P.verificar('vieja123', sha1('vieja123')), { ok: true, actualizar: true }, 'SHA1 viejo se acepta y pide actualizar');
    assert.strictEqual(P.verificar('x', sha1('vieja123')).ok, false);
    assert.ok(!P.verificar('', '').ok);
    assert.ok(!P.verificar(undefined, h).ok && !P.verificar('a', null).ok && !P.verificar('a', 's1$roto').ok);
    scrypt = false;
    assert.strictEqual(P.paraGuardar('abc12345'), sha1('abc12345'), 'sin activar sigue guardando SHA1');
    assert.ok(P.claveAceptable('corta1') && P.claveAceptable('sololetrasaqui') && P.claveAceptable('12345678') && !P.claveAceptable('Letras123'));
    console.log('ok  hash scrypt con sal, compatibilidad con SHA1 y reglas de clave');

    // --- login contra la base
    await q("DELETE FROM cliente; DELETE FROM password; DELETE FROM logueo; DELETE FROM empresa WHERE id = 'TUID'");
    await q("INSERT INTO empresa (id, tipo) VALUES ('TUID', 'E')");
    await q("INSERT INTO cliente (email, password, empresa, rol, activo, fecha_ultima) VALUES ('admin@tuid.test', ?, 'TUID', 'A', 1, NOW())", [sha1('vieja123')]);
    await q("INSERT INTO password (id_usuario, fecha, password) SELECT id_usuario, NOW(), password FROM cliente");

    // con la opcion apagada: entra con SHA1 y no cambia nada
    let r = await llamar(user.login, { email: 'admin@tuid.test', password: 'vieja123' });
    assert.strictEqual(r.error, 0, JSON.stringify(r));
    await esperar(200);
    let [c] = await q("SELECT password FROM cliente WHERE email = 'admin@tuid.test'");
    assert.strictEqual(c.password, sha1('vieja123'));
    r = await llamar(user.login, { email: 'admin@tuid.test', password: 'mala' });
    assert.strictEqual(r.error, 1);

    // con la opcion activada: entra y la clave se convierte sola al formato nuevo
    scrypt = true;
    r = await llamar(user.login, { email: 'admin@tuid.test', password: 'vieja123' });
    assert.strictEqual(r.error, 0);
    await esperar(300);
    [c] = await q("SELECT password FROM cliente WHERE email = 'admin@tuid.test'");
    assert.ok(c.password.startsWith('s1$'), 'convertida a scrypt');
    r = await llamar(user.login, { email: 'admin@tuid.test', password: 'vieja123' });
    assert.strictEqual(r.error, 0, 'sigue entrando con la misma clave despues de convertir');
    assert.strictEqual((await llamar(user.login, { email: 'admin@tuid.test', password: 'otra' })).error, 1);
    console.log('ok  login: SHA1 viejo entra y se convierte a scrypt en el primer ingreso');

    // --- reseteo con codigo (invitacion de administrador): clave debil, clave nueva, historial, codigo usado
    await q("UPDATE cliente SET resetPasswordToken = 'CODIGO1', resetPasswordExpires = DATE_ADD(NOW(), INTERVAL 1 HOUR) WHERE email = 'admin@tuid.test'");
    r = await llamar(user.reset, { token: 'CODIGO1', password1: 'corta', password2: 'corta' });
    assert.strictEqual(r.error, 1);
    assert.ok(/8 y 100|letras/.test(r.data), r.data);
    r = await llamar(user.reset, { token: 'CODIGO1', password1: 'vieja123', password2: 'vieja123' });
    assert.strictEqual(r.error, 1);
    assert.ok(/ya fue utilizada/.test(r.data), 'no se puede repetir una clave del historial: ' + r.data);
    r = await llamar(user.reset, { token: 'CODIGO1', password1: 'Nueva-Clave-9', password2: 'Nueva-Clave-9' });
    assert.strictEqual(r.error, 0, JSON.stringify(r));
    [c] = await q("SELECT password, resetPasswordToken FROM cliente WHERE email = 'admin@tuid.test'");
    assert.ok(c.password.startsWith('s1$') && c.resetPasswordToken === null, 'clave nueva en scrypt y codigo consumido');
    assert.strictEqual((await llamar(user.login, { email: 'admin@tuid.test', password: 'Nueva-Clave-9' })).error, 0);
    assert.strictEqual((await llamar(user.login, { email: 'admin@tuid.test', password: 'vieja123' })).error, 1, 'la clave anterior ya no entra');
    r = await llamar(user.reset, { token: 'CODIGO1', password1: 'Otra-Clave-77', password2: 'Otra-Clave-77' });
    assert.strictEqual(r.error, 1, 'el codigo ya usado no sirve');
    r = await llamar(user.reset, { token: 'NO-EXISTE', password1: 'Otra-Clave-77', password2: 'Otra-Clave-77' });
    assert.strictEqual(r.error, 1, 'un codigo inexistente se rechaza sin romper el servidor');
    console.log('ok  reseteo: reglas de clave, historial, codigo de un solo uso y codigo inexistente');

    console.log('\nTodas las pruebas de claves pasaron.');
    pool.end();
    process.exit(0);
})().catch((e) => { console.error('FALLO:', e); process.exit(1); });
