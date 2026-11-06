// Prueba el correo de Auditoria con la foto de la certificacion y el WhatsApp con enlace de foto, contra la MySQL LOCAL de prueba.
// Sin AWS ni envio real: la firma de la foto y el envio se reemplazan. Requiere: node test/db/setup.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const util = require('util');
const mysql = require('mysql');
const { PERSONAS } = require('./setup');

global.CONFIG = { get: () => ({}), has: () => false };
const pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: '', database: 'vida_test', multipleStatements: true });
const db = { sync_query: util.promisify(pool.query).bind(pool) };
global.VIDA_DB = db;
const correos = require('../../services/vida/admin/correos');
const textosSrv = require('../../services/vida/admin/textos');

async function llamar(handler, req) {
    let out;
    await handler(Object.assign({ query: {}, body: {}, user: { email: 'aud1@tuid.test' } }, req), { status: () => ({ json: (j) => { out = j; } }) });
    return out;
}

(async () => {
    const { ana } = PERSONAS;
    for (const f of ['textos.sql', 'fotos_enlaces.sql']) {
        if (f === 'textos.sql') await db.sync_query('DROP TABLE IF EXISTS textos_historial; DROP TABLE IF EXISTS textos;');
        if (f === 'fotos_enlaces.sql') await db.sync_query('DROP TABLE IF EXISTS fotos_enlaces;');
        await db.sync_query(fs.readFileSync(path.join(__dirname, '../../scripts/sql/' + f), 'utf8'));
    }
    const [u] = await db.sync_query('SELECT id_usuario FROM usuario WHERE cuil = ?', [ana.cuil]);
    const [a] = await db.sync_query('SELECT id_validacion FROM auditoria WHERE id_usuario = ? ORDER BY id_validacion LIMIT 1', [u.id_usuario]);

    const enviados = [];
    const firmas = [];
    const enviarCorreo = correos.crearEnviarCorreo({
        db,
        firmarFoto: (clave, seg) => { firmas.push([clave, seg]); return 'https://s3.example.test/' + clave + '?firmado=1'; },
        enviar: async (html, asunto, para) => { enviados.push({ html, asunto, para }); },
        urlBase: () => 'https://api.autenticartuid.com'
    });

    // 1) correo: HTML con logo, foto de la certificacion (login), texto del Modulo de Textos y marca en el usuario
    let r = await llamar(enviarCorreo, { body: { id_validacion: a.id_validacion, clave: 'AUDITORIA_OBSERVADA_EMAIL' } });
    assert.strictEqual(r.error, 0, JSON.stringify(r));
    assert.strictEqual(enviados.length, 1);
    const m = enviados[0];
    assert.strictEqual(m.para, 'ana@example.test');
    assert.strictEqual(m.asunto, 'TuID Vida: necesitamos que repita su Fe de Vida');
    assert.ok(m.html.includes('https://tuid.ar/images/logos/Logo-vida30.png'), 'lleva el logo');
    assert.ok(m.html.includes('https://s3.example.test/login/11111111F.jpeg'), 'lleva la foto del ultimo login');
    assert.ok(/width="140"/.test(m.html) && !/width="320"/.test(m.html), 'la foto va chica en el correo');
    const enlaceFoto = (m.html.match(/<a href="(https:\/\/api\.autenticartuid\.com\/vida\/f\/[A-Za-z0-9_-]{20,40})"/) || [])[1];
    assert.ok(enlaceFoto, 'la foto chica enlaza a la pagina de la foto (enlace propio)');
    assert.ok(m.html.includes('Toque la foto para verla más grande'));
    const [filaEnlace] = await db.sync_query('SELECT vence_en > NOW() AS vigente FROM fotos_enlaces WHERE codigo = ?', [enlaceFoto.split('/vida/f/')[1]]);
    assert.ok(filaEnlace && filaEnlace.vigente, 'el enlace existe y esta vigente');
    assert.deepStrictEqual(firmas[0], ['login/11111111F.jpeg', 7 * 24 * 3600], 'la foto del correo dura 7 dias');
    assert.ok(m.html.includes('Hola Ana Maria Prueba'), 'texto con los datos de la persona');
    assert.ok(m.html.includes('27-11111111-7'));
    assert.ok(!m.html.includes('{{'), 'sin variables sin reemplazar');
    const [ex] = await db.sync_query('SELECT extra FROM usuario WHERE id_usuario = ?', [u.id_usuario]);
    assert.ok(/Mail:observada\(\d{2}\/\d{2}\/\d{4}\)/.test(ex.extra));
    console.log('ok  correo HTML con logo, foto de la certificacion (ultimo login) y texto del Modulo de Textos');

    // 2) lo que viene de la base no inyecta HTML en el correo
    await db.sync_query("UPDATE usuario SET nombre = ?, apellido = ? WHERE id_usuario = ?", ['<script>alert(1)</script>', '<img src=x onerror=alert(2)>', u.id_usuario]);
    enviados.length = 0;
    r = await llamar(enviarCorreo, { body: { id_validacion: a.id_validacion, clave: 'AUDITORIA_OBSERVADA_EMAIL' } });
    assert.strictEqual(r.error, 0);
    assert.ok(!/<script>alert/.test(enviados[0].html) && !/<img src=x/.test(enviados[0].html), 'se escapa el HTML de los datos');
    assert.ok(enviados[0].html.includes('&lt;script&gt;'));
    // y un texto editado con HTML tambien se escapa (los textos son texto plano)
    await db.sync_query("UPDATE textos SET cuerpo = ? WHERE clave = 'AUDITORIA_OBSERVADA_EMAIL'", ['Hola <b>{{nombre}}</b>\n\nVea https://tuid.ar/x?a=1&b=2']);
    enviados.length = 0;
    await llamar(enviarCorreo, { body: { id_validacion: a.id_validacion, clave: 'AUDITORIA_OBSERVADA_EMAIL' } });
    assert.ok(enviados[0].html.includes('&lt;b&gt;'));
    assert.ok(enviados[0].html.includes('<a href="https://tuid.ar/x?a=1&amp;b=2"'));
    await db.sync_query("UPDATE usuario SET nombre = 'ANA MARIA', apellido = 'PRUEBA' WHERE id_usuario = ?", [u.id_usuario]);
    console.log('ok  los datos y los textos se escapan: nadie puede meter HTML en el correo');

    // 3) errores: sin correo valido, texto inexistente o de otro canal, certificacion inexistente
    await db.sync_query("UPDATE usuario SET email = 'sin-correo' WHERE id_usuario = ?", [u.id_usuario]);
    enviados.length = 0;
    r = await llamar(enviarCorreo, { body: { id_validacion: a.id_validacion, clave: 'AUDITORIA_OBSERVADA_EMAIL' } });
    assert.strictEqual(r.error, 1);
    assert.strictEqual(enviados.length, 0);
    await db.sync_query("UPDATE usuario SET email = 'ana@example.test' WHERE id_usuario = ?", [u.id_usuario]);
    assert.strictEqual((await llamar(enviarCorreo, { body: { id_validacion: a.id_validacion, clave: 'AUDITORIA_OBSERVADA_WHATSAPP' } })).error, 1, 'un texto de WhatsApp no sirve para correo');
    assert.strictEqual((await llamar(enviarCorreo, { body: { id_validacion: 999999, clave: 'AUDITORIA_OBSERVADA_EMAIL' } })).error, 1);
    assert.strictEqual((await llamar(enviarCorreo, { body: { clave: 'AUDITORIA_OBSERVADA_EMAIL' } })).error, 1);
    console.log('ok  errores: sin correo, texto de otro canal o certificacion inexistente no envian nada');

    // 4) WhatsApp: el texto con {{enlace_foto}} genera un enlace propio que vence
    r = await llamar(textosSrv.contacto, { query: { tipo: 'validacion', id: a.id_validacion, clave: 'AUDITORIA_OBSERVADA_WHATSAPP' } });
    assert.strictEqual(r.error, 0, JSON.stringify(r));
    const enlace = (r.data.texto.match(/https:\/\/api\.autenticartuid\.com\/vida\/f\/([A-Za-z0-9_-]{20,40})/) || [])[0];
    assert.ok(enlace, 'el texto incluye el enlace: ' + r.data.texto);
    assert.ok(!r.data.texto.includes('{{'));
    assert.ok(r.data.whatsapp.includes(encodeURIComponent(enlace)), 'el enlace viaja dentro del mensaje de WhatsApp');
    const codigo = enlace.split('/vida/f/')[1];
    const [fila] = await db.sync_query('SELECT id_validacion, creado_por, vence_en > NOW() AS vigente FROM fotos_enlaces WHERE codigo = ?', [codigo]);
    assert.strictEqual(fila.id_validacion, a.id_validacion);
    assert.strictEqual(fila.creado_por, 'aud1@tuid.test');
    assert.ok(fila.vigente);
    console.log('ok  WhatsApp: el texto lleva un enlace propio a la foto, que vence');

    console.log('\nTodas las pruebas del correo y del WhatsApp con foto pasaron.');
    pool.end();
    process.exit(0);
})().catch((e) => { console.error('FALLO:', e); process.exit(1); });
