// Textos con formato HTML (Certificacion y Respuesta a Contacto) contra la MySQL LOCAL de prueba. Requiere: node test/db/setup.js
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
global.TESTING = false;
// se captura el envio real de Contacto sin tocar AWS
const mailing = require('../../utils/mail');
const enviadosContacto = [];
mailing.sendHtml = (html, to, title, from) => { enviadosContacto.push({ html, to, title, from }); };
const correos = require('../../services/vida/admin/correos');
const servicio = require('../../services/vida/admin/textos');
const contactoTexto = require('../../services/vida/contactoTexto');

async function llamar(handler, req) {
    let out;
    await handler(Object.assign({ query: {}, body: {}, params: {}, user: { email: 'admin@tuid.test' } }, req), { status: () => ({ json: (j) => { out = j; } }) });
    return out;
}
const sql = (f) => fs.readFileSync(path.join(__dirname, '../../scripts/sql/' + f), 'utf8');

(async () => {
    const { ana } = PERSONAS;
    await db.sync_query('DROP TABLE IF EXISTS textos_historial; DROP TABLE IF EXISTS textos; DROP TABLE IF EXISTS fotos_enlaces;');
    await db.sync_query(sql('textos.sql'));
    await db.sync_query(sql('fotos_enlaces.sql'));
    await db.sync_query(sql('textos_contacto.sql'));
    const [u] = await db.sync_query('SELECT id_usuario FROM usuario WHERE cuil = ?', [ana.cuil]);
    const [a] = await db.sync_query('SELECT id_validacion FROM auditoria WHERE id_usuario = ? ORDER BY id_validacion LIMIT 1', [u.id_usuario]);

    // 1) alta y validaciones del formato
    let r = await llamar(servicio.create, { body: { clave: 'cert_html', canal: 'email', formato: 'html', nombre: 'Certificación en HTML', asunto: 'TuID Vida: {{nombre}}',
        cuerpo: '<h2>Hola {{nombre}}</h2><script>alert(1)</script><p style="color:#006e7b">Su certificación del <b>{{fecha}}</b> fue observada. <a href="{{enlace_foto}}" onclick="x()">Ver foto</a></p>' } });
    assert.strictEqual(r.error, 0, JSON.stringify(r));
    const [guardado] = await db.sync_query("SELECT * FROM textos WHERE clave = 'CERT_HTML'");
    assert.strictEqual(guardado.formato, 'html');
    assert.ok(!/script|onclick/.test(guardado.cuerpo), 'se guarda saneado: ' + guardado.cuerpo);
    assert.ok(guardado.cuerpo.includes('href="{{enlace_foto}}"'));
    r = await llamar(servicio.create, { body: { clave: 'wa_html', canal: 'whatsapp', formato: 'html', nombre: 'No vale', cuerpo: '<p>x</p>' } });
    assert.strictEqual(r.error, 1, 'HTML solo en correos');
    r = await llamar(servicio.create, { body: { clave: 'raro', canal: 'email', formato: 'rtf', nombre: 'No vale', cuerpo: 'x' } });
    assert.strictEqual(r.error, 1);
    r = await llamar(servicio.create, { body: { clave: 'solo_script', canal: 'email', formato: 'html', nombre: 'Solo script', cuerpo: '<script>x</script>' } });
    assert.strictEqual(r.error, 1, 'sin contenido permitido');
    r = await llamar(servicio.list, { query: { canal: 'email' } });
    assert.ok(r.data.textos.every((t) => t.formato));
    console.log('ok  alta de textos HTML: se sanean y solo valen para correo');

    // 2) vista previa: HTML saneado con datos de ejemplo escapados + documento completo
    r = await llamar(servicio.preview, { body: { formato: 'html', asunto: 'Hola {{nombre}}', cuerpo: '<p>{{nombre}} {{inventada}}</p><script>x</script>' } });
    assert.strictEqual(r.error, 0);
    assert.strictEqual(r.data.cuerpo, '<p>Ana María {{inventada}}</p>');
    assert.deepStrictEqual(r.data.desconocidas, ['inventada']);
    assert.ok(r.data.documento.startsWith('<!DOCTYPE html>') && r.data.documento.includes('<p>Ana María'));
    r = await llamar(servicio.preview, { body: { cuerpo: 'Hola {{nombre}}' } });
    assert.strictEqual(r.data.cuerpo, 'Hola Ana María');
    assert.strictEqual(r.data.documento, null);
    console.log('ok  vista previa de HTML');

    // 3) edicion: el historial guarda el formato; pasar un texto a HTML lo sanea; HTML no se puede en WhatsApp
    const [wa] = await db.sync_query("SELECT id FROM textos WHERE clave = 'AUDITORIA_OBSERVADA_WHATSAPP'");
    r = await llamar(servicio.update, { params: { id: wa.id }, body: { formato: 'html' } });
    assert.strictEqual(r.error, 1);
    const [em] = await db.sync_query("SELECT id, cuerpo FROM textos WHERE clave = 'AUDITORIA_OBSERVADA_EMAIL'");
    r = await llamar(servicio.update, { params: { id: em.id }, body: { formato: 'html' } });
    assert.strictEqual(r.error, 0, JSON.stringify(r));
    const [pasado] = await db.sync_query('SELECT formato, cuerpo FROM textos WHERE id = ?', [em.id]);
    assert.strictEqual(pasado.formato, 'html');
    const [h1] = await db.sync_query('SELECT id, formato FROM textos_historial WHERE id_texto = ? ORDER BY id DESC LIMIT 1', [em.id]);
    assert.strictEqual(h1.formato, 'texto');
    r = await llamar(servicio.restaurar, { params: { id: em.id, idHistorial: h1.id } });
    assert.strictEqual(r.error, 0, JSON.stringify(r));
    assert.strictEqual((await db.sync_query('SELECT formato FROM textos WHERE id = ?', [em.id]))[0].formato, 'texto', 'restaurar vuelve tambien al formato');
    console.log('ok  edicion: historial con formato, cambio de formato y restaurar');

    // 4) CERTIFICACION: el correo usa el HTML del texto dentro del marco (logo, foto, pie)
    const enviados = [];
    const enviarCorreo = correos.crearEnviarCorreo({
        db, firmarFoto: (clave) => 'https://s3.example.test/' + clave + '?firmado=1',
        enviar: async (html, asunto, para) => { enviados.push({ html, asunto, para }); }, urlBase: () => 'https://api.autenticartuid.com'
    });
    r = await llamar(enviarCorreo, { body: { id_validacion: a.id_validacion, clave: 'CERT_HTML' } });
    assert.strictEqual(r.error, 0, JSON.stringify(r));
    const m = enviados[0];
    assert.strictEqual(m.asunto, 'TuID Vida: Ana Maria');
    assert.ok(m.html.includes('<h2>Hola Ana Maria</h2>') && m.html.includes('style="color:#006e7b"'), 'respeta el HTML del texto');
    assert.ok(/href="https:\/\/api\.autenticartuid\.com\/vida\/f\/[A-Za-z0-9_-]+"/.test(m.html), 'enlace propio a la foto');
    assert.ok(m.html.includes('Logo-vida30.png') && m.html.includes('https://s3.example.test/'), 'conserva logo y foto del marco');
    assert.ok(!/<script|onclick/.test(m.html));
    // un valor con HTML (nombre) no se interpreta
    await db.sync_query("UPDATE usuario SET nombre = '<img src=x onerror=alert(1)>Ana' WHERE id_usuario = ?", [u.id_usuario]);
    enviados.length = 0;
    r = await llamar(enviarCorreo, { body: { id_validacion: a.id_validacion, clave: 'CERT_HTML' } });
    assert.strictEqual(r.error, 0);
    assert.ok(!/<img src=x/i.test(enviados[0].html), 'el nombre no puede meter HTML');
    await db.sync_query("UPDATE usuario SET nombre = 'ANA MARIA' WHERE id_usuario = ?", [u.id_usuario]);
    console.log('ok  Certificacion: correo con el HTML del panel dentro del marco, valores escapados');

    // 5) CONTACTO: respuestas cargadas desde los archivos
    const [{ n }] = await db.sync_query("SELECT COUNT(*) n FROM textos WHERE clave LIKE 'CONTACTO%' AND formato = 'html' AND canal = 'email'");
    assert.strictEqual(n, 35);
    const body = { nombre: 'Ana Prueba', cuil: ana.cuil, email: 'ana@example.test', title: '[TI1] Tengo dificultades con el Escaneo', fecha: '2026-12-01',
        correo_cliente: 'soporte@banco.test', telefono_cliente: '0800-111' };
    assert.strictEqual(await contactoTexto.enviar('auto_response/103', body, 'contacto@tuid.test'), true);
    let e = enviadosContacto.pop();
    assert.strictEqual(e.to, 'ana@example.test');
    assert.strictEqual(e.title, '[TI1] Tengo dificultades con el Escaneo');
    assert.ok(e.html.startsWith('<!DOCTYPE html>') && e.html.includes('Ana Prueba') && e.html.includes('dificultades con el escaneo') && !e.html.includes('{{'), e.html.slice(0, 400));
    assert.strictEqual(await contactoTexto.enviar('auto_response/109A', body, 'contacto@tuid.test'), true);
    e = enviadosContacto.pop();
    assert.ok(e.html.includes('mailto:soporte@banco.test') && e.html.includes('0800-111') && e.html.includes('01/12/2026'));
    // nombre con HTML: se escapa
    await contactoTexto.enviar('auto_response/103', Object.assign({}, body, { nombre: '<script>alert(1)</script>' }), 'x');
    assert.ok(!/<script>alert/.test(enviadosContacto.pop().html));
    console.log('ok  Contacto: respuestas automaticas con el texto del panel (35 cargados)');

    // 6) respaldo: texto editado, desactivado o inexistente
    const [t103] = await db.sync_query("SELECT id FROM textos WHERE clave = 'CONTACTO_103'");
    r = await llamar(servicio.update, { params: { id: t103.id }, body: { cuerpo: '<p>Texto nuevo para {{nombre}}</p>' } });
    assert.strictEqual(r.error, 0);
    await contactoTexto.enviar('auto_response/103', body, 'x');
    assert.ok(enviadosContacto.pop().html.includes('<p>Texto nuevo para Ana Prueba</p>'), 'se usa lo ultimo editado');
    r = await llamar(servicio.update, { params: { id: t103.id }, body: { activo: false } });
    assert.strictEqual(await contactoTexto.enviar('auto_response/103', body, 'x'), false, 'desactivado: se usa el archivo de siempre');
    assert.strictEqual(await contactoTexto.enviar('auto_response/999', body, 'x'), false, 'sin texto: se usa el archivo');
    assert.strictEqual(await contactoTexto.enviar('contact', body, 'x'), false);
    // base caida: no revienta, devuelve false
    const real = global.VIDA_DB; global.VIDA_DB = { sync_query: async () => { throw new Error('base caida'); } };
    assert.strictEqual(await contactoTexto.enviar('auto_response/100', body, 'x'), false);
    global.VIDA_DB = real;
    // el sembrado no pisa un texto ya editado
    await db.sync_query(sql('textos_contacto.sql'));
    assert.ok((await db.sync_query("SELECT cuerpo FROM textos WHERE clave = 'CONTACTO_103'"))[0].cuerpo.includes('Texto nuevo'), 'INSERT IGNORE conserva lo editado');
    console.log('ok  Contacto: respaldo al archivo si el texto esta desactivado, falta o la base falla; el sembrado no pisa ediciones');

    // 7) PIE COMPARTIDO: se agrega a Contacto y reemplaza el pie fijo de la certificacion; si se desactiva, todo vuelve a como era
    await db.sync_query(sql('textos_pie.sql'));
    await db.sync_query('DELETE FROM textos WHERE clave LIKE \'CONTACTO%\'');
    await db.sync_query(sql('textos_contacto.sql'));
    assert.ok(!(await db.sync_query("SELECT cuerpo FROM textos WHERE clave = 'CONTACTO_100'"))[0].cuerpo.includes('Soporte al Usuario'), 'los textos de Contacto ya no traen firma');
    await contactoTexto.enviar('auto_response/109A', body, 'x');
    const c = enviadosContacto.pop().html;
    assert.ok(c.includes('Atencion al Usuario') && c.includes('mailto:soporte@tuid.ar') && c.includes('Facebook.png') && c.includes('Ley N'), 'Contacto lleva el pie');
    assert.ok(c.indexOf('mailto:soporte@banco.test') < c.indexOf('Atencion al Usuario'), 'el pie va al final');
    enviados.length = 0;
    r = await llamar(enviarCorreo, { body: { id_validacion: a.id_validacion, clave: 'CERT_HTML' } });
    assert.strictEqual(r.error, 0, JSON.stringify(r));
    const k = enviados[0].html;
    assert.ok(k.includes('Atencion al Usuario') && !k.includes('Departamento de Auditoría') && k.includes('https://s3.example.test/'), 'la certificacion usa el pie compartido y conserva la foto');
    const [pie] = await db.sync_query("SELECT id FROM textos WHERE clave = 'PIE_CORREO'");
    await llamar(servicio.update, { params: { id: pie.id }, body: { cuerpo: '<p>Pie editado {{nombre}}</p>' } });
    await contactoTexto.enviar('auto_response/109A', body, 'x');
    assert.ok(enviadosContacto.pop().html.includes('<p>Pie editado Ana Prueba</p>'), 'el pie editado se usa enseguida');
    await llamar(servicio.update, { params: { id: pie.id }, body: { activo: false } });
    enviados.length = 0;
    await llamar(enviarCorreo, { body: { id_validacion: a.id_validacion, clave: 'CERT_HTML' } });
    assert.ok(enviados[0].html.includes('Departamento de Auditoría'), 'sin pie compartido vuelve el pie fijo');
    await contactoTexto.enviar('auto_response/109A', body, 'x');
    assert.ok(!enviadosContacto.pop().html.includes('Atencion al Usuario'), 'sin pie compartido, Contacto sale sin pie');
    console.log('ok  pie compartido: Contacto y Certificacion, edicion inmediata, desactivar vuelve al comportamiento anterior');

    console.log('\nTodas las pruebas de Textos en HTML pasaron.');
    pool.end();
    process.exit(0);
})().catch((e) => { console.error('FALLO:', e); process.exit(1); });
