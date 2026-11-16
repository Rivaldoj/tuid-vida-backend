// Prueba el correo de recuperacion de clave del panel con el texto editable (Textos) y el pie compartido, contra la MySQL LOCAL de prueba.
// Requiere: node test/db/setup.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const util = require('util');
const mysql = require('mysql');

global.CONFIG = { get: () => ({}), has: () => false };
const pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: '', database: 'vida_test', multipleStatements: true });
const db = { sync_query: util.promisify(pool.query).bind(pool) };
const sql = (f) => fs.readFileSync(path.join(__dirname, '../../scripts/sql', f), 'utf8');
const rc = require('../../services/vida/recuperarClaveTexto');
const textos = require('../../utils/textos');

(async () => {
    await db.sync_query('DROP TABLE IF EXISTS textos_historial; DROP TABLE IF EXISTS textos;');
    await db.sync_query(sql('textos.sql'));
    await db.sync_query(sql('textos_pie.sql'));

    // sin el texto cargado: devuelve null y quien llama manda el mensaje fijo
    assert.strictEqual(await rc.armar(db, { token: 'df7efa4f10b9' }), null);
    console.log('ok  sin el texto en el panel: null (se usa el mensaje fijo)');

    await db.sync_query(sql('textos_recuperar_clave.sql'));
    await db.sync_query(sql('textos_recuperar_clave.sql')); // repetible: no duplica ni falla
    assert.strictEqual((await db.sync_query("SELECT COUNT(*) n FROM textos WHERE clave = 'RECUPERAR_CLAVE_PANEL'"))[0].n, 1);
    assert.ok(textos.VARIABLES.includes('token'));

    let m = await rc.armar(db, { token: 'df7efa4f10b9', nombre: 'Ana' });
    assert.ok(m, 'arma el correo');
    assert.strictEqual(m.asunto, 'Confirmacion TuID');
    assert.ok(m.html.includes('df7efa4f10b9'), 'lleva el token');
    assert.ok(!m.html.includes('{{'), 'sin variables sin reemplazar');
    assert.ok(m.html.includes('contraseña permanecerá sin cambios'), 'texto del cuerpo');
    assert.ok(m.html.includes('soporte@tuid.ar') && m.html.includes('Canales de Ayuda'), 'lleva el pie compartido');
    assert.ok(m.html.indexOf('df7efa4f10b9') < m.html.indexOf('soporte@tuid.ar'), 'el pie va al final');
    assert.ok(/font-family:Arial/.test(m.html), 'mantiene el estilo');
    console.log('ok  correo con el texto del panel, el token y el pie compartido');

    // el token se escapa: nada de lo que venga como dato se interpreta como HTML
    m = await rc.armar(db, { token: '<script>x</script>' });
    assert.ok(!m.html.includes('<script>'));

    // editado desde el panel (asunto con variable) y desactivado
    await db.sync_query("UPDATE textos SET asunto = 'Su codigo {{token}}' WHERE clave = 'RECUPERAR_CLAVE_PANEL'");
    assert.strictEqual((await rc.armar(db, { token: 'abc123' })).asunto, 'Su codigo abc123');
    await db.sync_query("UPDATE textos SET activo = 0 WHERE clave = 'RECUPERAR_CLAVE_PANEL'");
    assert.strictEqual(await rc.armar(db, { token: 'abc123' }), null);
    await db.sync_query("UPDATE textos SET activo = 1 WHERE clave = 'RECUPERAR_CLAVE_PANEL'");
    // sin token no se arma (no se manda un correo vacio)
    assert.strictEqual(await rc.armar(db, { token: '' }), null);
    // sin el pie (desactivado) el correo igual sale
    await db.sync_query("UPDATE textos SET activo = 0 WHERE clave = 'PIE_CORREO'");
    m = await rc.armar(db, { token: 'abc123' });
    assert.ok(m && m.html.includes('abc123') && !m.html.includes('Canales de Ayuda'));
    // base caida: null, no excepcion
    assert.strictEqual(await rc.armar({ sync_query: async () => { throw new Error('caida'); } }, { token: 'abc123' }), null);
    console.log('ok  token escapado, asunto editable, desactivado, sin pie y base caida');

    console.log('\nTodas las pruebas del correo de recuperacion de clave pasaron.');
    pool.end();
    process.exit(0);
})().catch((e) => { console.error('FALLO:', e); process.exit(1); });
