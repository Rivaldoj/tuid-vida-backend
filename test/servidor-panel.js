// Servidor de PRUEBA para ver el panel de administracion en el navegador (puerto 3004). No usa AWS ni produccion.
//  - sirve el panel compilado con `ng build --configuration local` (C:\TUID\panel-vida\fuente\dist\panel)
//  - /vida/admin: las rutas REALES del backend contra la MySQL local de prueba (datos ficticios, ver test/db/setup.js)
//  - /vida/admin/login: acepta cualquier usuario y devuelve un token de Administrador de TUID (solo para pruebas)
// Uso: node test/db/setup.js && node test/servidor-panel.js   ->   http://localhost:3004
const path = require('path');
const util = require('util');
const mysql = require('mysql');
const express = require('express');

global.CONFIG = {
    has: (k) => k === 'security.aesKey',
    get: (k) => k === 'security.aesKey' ? 'k'.repeat(32) : k === 'jwt'
        ? { key: 'clave-de-prueba', time: 1, units: 'days', authenticatorAdmin: { key: 'clave-admin-de-prueba', time: 1, units: 'days' }, vidaAdmin: { time: 1, units: 'days' } }
        : { bucketName: 'x', approvePercentage: 90, rangoES: 1, whitebrands: [] }
};
global.TESTING = true;
const Module = require('module');
const orig = Module._load;
Module._load = function (req) {
    // Firebase simulado: Ana = token que Firebase da por inexistente, Carlos = falla transitoria, el resto llega
    if (/utils\/push$/.test(req)) {
        return { sendAsync: async (token) => (token === 'DEVICE-ANA' ? { ok: false, motivo: 'UNREGISTERED', tokenInvalido: true } : token === 'DEVICE-CARLOS' ? { ok: false, motivo: 'UNAVAILABLE' } : { ok: true }), send: async () => {} };
    }
    if (/aws-sdk|nodemailer|utils\/(bucket|maps|slack|sms|push|mail|whatsapp)$/.test(req)) {
        const dummy = function () { return dummyProxy; };
        const dummyProxy = new Proxy(dummy, { get: (t, k) => (k === 'then' ? undefined : dummyProxy), apply: () => dummyProxy, construct: () => dummyProxy });
        return dummyProxy;
    }
    return orig.apply(this, arguments);
};

// En la prueba local faltan tablas de produccion que usan otras pantallas del panel: un error de esas pantallas no debe tirar el servidor
process.on('unhandledRejection', (e) => console.log('[prueba local] error no atendido:', e && e.message));
process.on('uncaughtException', (e) => console.log('[prueba local] excepcion:', e && e.message));

const pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: '', database: 'vida_test', multipleStatements: true });
global.VIDA_DB = pool;
// Base del padron de PRUEBA (padron_test): la pantalla "Carga de fallecidos" actualiza padron.master ademas de tuid_vida
global.PADRON_DB = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: '', database: 'padron_test', multipleStatements: true, dateStrings: true });
global.PADRON_DB.sync_query = util.promisify(PADRON_DB.query).bind(PADRON_DB);
global.VIDA_DB.sync_query = util.promisify(pool.query).bind(pool);
const q = (sql, p) => VIDA_DB.sync_query(sql, p);

const tokenizer = require('../utils/tokenizer');
const adminUser = require('../services/vida/admin/user');
const { PERSONAS } = require('./db/setup');

async function sembrar() {
    await q('CREATE DATABASE IF NOT EXISTS padron_test');
    await PADRON_DB.sync_query('DROP TABLE IF EXISTS master; DROP TABLE IF EXISTS fallecidos_carga_log;');
    await PADRON_DB.sync_query('CREATE TABLE master (CUIL BIGINT UNSIGNED NOT NULL PRIMARY KEY, Apellido_Nombre VARCHAR(160) NULL, Apellido VARCHAR(60) NULL, Nombre VARCHAR(60) NULL, Sexo CHAR(1) NULL, DNI INT UNSIGNED NULL, FechaNac DATE NULL, Fallecido TINYINT UNSIGNED NULL, FechaFalle DATE NULL, IdLote TINYINT UNSIGNED NULL, KEY idx_dni (DNI))');
    await q('DROP TABLE IF EXISTS fallecidos_carga_log; DROP TABLE IF EXISTS fallecidos_carga_lotes');
    await q('CREATE TABLE IF NOT EXISTS alertas (id INT AUTO_INCREMENT PRIMARY KEY, cuil VARCHAR(15), comentarios VARCHAR(500), fecha DATETIME)');
    // tablas del interruptor de auditoria (migracion de produccion, aplicada solo en la BD local de prueba)
    await q(require('fs').readFileSync(path.join(__dirname, '../scripts/sql/configuracion.sql'), 'utf8'));
    await q("UPDATE configuracion SET valor = 'ON' WHERE clave = 'auditoria_certificaciones'");
    // tablas del Modulo de Textos (migracion de produccion, aplicada solo en la BD local de prueba)
    await q('DROP TABLE IF EXISTS fotos_enlaces;');
    await q(require('fs').readFileSync(path.join(__dirname, '../scripts/sql/fotos_enlaces.sql'), 'utf8'));
    await q('DROP TABLE IF EXISTS textos_historial; DROP TABLE IF EXISTS textos;');
    await q(require('fs').readFileSync(path.join(__dirname, '../scripts/sql/textos.sql'), 'utf8'));
    await q('DROP TABLE IF EXISTS notificaciones_envios;');
    await q(require('fs').readFileSync(path.join(__dirname, '../scripts/sql/notificaciones_log.sql'), 'utf8'));
    // Correo masivo: un texto de comunicacion de ejemplo (clave COM_) y la empresa con periodo vigente y correos habilitados
    await q('DROP TABLE IF EXISTS correos_envios; DROP TABLE IF EXISTS correos_bajas;');
    await q("INSERT INTO textos (clave, canal, formato, nombre, asunto, cuerpo, actualizado_por, actualizado_en) VALUES ('COM_RECORDATORIO', 'email', 'html', 'Recordatorio de certificación', '{{nombre}}, le quedan pocos días para certificar', '<p>Hola {{nombre}}:</p><p>Recuerde certificar su Fe de Vida antes del <strong>{{fecha_vencimiento}}</strong>.</p>', 'prueba', NOW())");
    await q("UPDATE empresa SET nombre = 'Banco de Prueba', Fecha_actual = DATE_SUB(CURDATE(), INTERVAL 30 DAY), Fecha_fin = DATE_ADD(CURDATE(), INTERVAL 30 DAY), emails = 1 WHERE id = 'TESTBANCO'");
    const { ana, beto, carlos, dora } = PERSONAS;
    await PADRON_DB.sync_query('INSERT INTO master (CUIL, Fallecido) VALUES (?, 0), (?, 0), (?, 0), (?, 0)', [ana.cuil, beto.cuil, carlos.cuil, dora.cuil]);
    await q("INSERT IGNORE INTO empresa (id, tipo, periodicidad) VALUES ('OTRABANCO','D',6)");
    await q("UPDATE usuario SET auditor='aud1@tuid.test', empresa='TESTBANCO' WHERE cuil IN (?, ?)", [ana.cuil, carlos.cuil]);
    await q("UPDATE usuario SET auditor=NULL, empresa='OTRABANCO' WHERE cuil = ?", [beto.cuil]);
    await q("UPDATE usuario SET auditor='ALERTA:aud2@tuid.test', empresa='TESTBANCO' WHERE cuil = ?", [dora.cuil]);
    const [u] = await q('SELECT id_usuario FROM usuario WHERE cuil = ?', [ana.cuil]);
    const ids = (await q('SELECT id_validacion FROM auditoria WHERE id_usuario = ? ORDER BY id_validacion LIMIT 3', [u.id_usuario])).map((r) => r.id_validacion);
    await q("UPDATE auditoria SET auditor='aud1@tuid.test', empresa='TESTBANCO' WHERE id_validacion = ?", [ids[0]]);
    await q("UPDATE auditoria SET auditor='Liveness', empresa='OTRABANCO' WHERE id_validacion = ?", [ids[1]]);
    await q("UPDATE auditoria SET auditor='ALERTA:aud2@tuid.test', empresa='TESTBANCO' WHERE id_validacion = ?", [ids[2]]);
    await q("DELETE FROM cliente");
    await q("INSERT INTO cliente (email, empresa, rol, activo) VALUES ('aud1@tuid.test','TUID','A',1), ('aud2@tuid.test','TUID','U',1)");
    // Empresa, periodo y usuarios de ejemplo (pantallas Empresas / Mi empresa / Subir archivo)
    const cu = (p, d) => p + d + require('../utils/cuil').checkDigit(p + d);
    await q("UPDATE empresa SET nombre = 'Banco de Prueba S.A.', CUIT = '30500010912', Fecha_actual = '2026-11-01', Fecha_fin = '2026-11-30', Fecha_proxima = '2027-05-01', Cantidad = 120 WHERE id = 'TESTBANCO'");
    // Posibles fallecidos de ejemplo (usuario_empresa.Posible_fallecido = 1) para la pantalla Control Fallecidos
    await q('DELETE FROM usuario_empresa WHERE empresa = ?', ['TESTBANCO']);
    await q("INSERT INTO usuario_empresa (cuil, empresa, Posible_fallecido, Fecha_fallecido) VALUES (?, 'TESTBANCO', 1, '2026-10-05'), (?, 'TESTBANCO', 1, NULL), (?, 'TESTBANCO', 0, NULL)", [ana.cuil, carlos.cuil, dora.cuil]);
    await q("INSERT INTO cliente (cuil, nombre, email, empresa, rol, activo, fecha_ultima) VALUES (?, 'Marta Gomez', 'cliente@testbanco.test', 'TESTBANCO', 'A', 1, NOW()), (?, 'Pedro Ruiz', 'pedro@testbanco.test', 'TESTBANCO', 'U', 1, NOW()), ('000001', 'Cuenta vieja', 'vieja@testbanco.test', 'TESTBANCO', 'U', 1, NULL)",
        [cu('27', '12345678'), cu('20', '23456789')]);
    await q("UPDATE cliente SET nombre = 'Administrador TuID', cuil = ? WHERE email = 'aud1@tuid.test'", [cu('20', '11222334')]);
    // fechas de hoy para que se vean con el rango por defecto del panel
    await q("UPDATE auditoria SET fecha = NOW() WHERE id_usuario = ?", [u.id_usuario]);
    await q("UPDATE usuario SET fecha = NOW()");
}

const app = express();
app.use(express.json());
app.use((req, res, next) => { res.response = {}; console.log(new Date().toISOString().slice(11, 19), req.method, req.originalUrl); next(); });

app.post('/vida/admin/login', (req, res) => {
    const email = (req.body && req.body.email) || 'admin@tuid.test';
    // en la prueba local, un usuario que empieza con "cliente" entra como Administrador de la empresa TESTBANCO; el resto como Administrador de TUID
    const usuario = /^cliente/i.test(email) ? { email: 'cliente@testbanco.test', empresa: 'TESTBANCO', rol: 'A' } : { email: email === 'admin@tuid.test' ? 'aud1@tuid.test' : email, empresa: 'TUID', rol: 'A' };
    usuario.newPermissions = adminUser.getUserPermissions(usuario);
    res.status(200).json({
        error: 0, data: 'Logueo satisfactorio', usuario: usuario.email, fecha_ultima: new Date().toISOString(),
        token: tokenizer.tokenizeVidaAdmin(usuario), permissions: usuario.newPermissions.join(','), newPermissions: usuario.newPermissions
    });
});
// el aviso de creditos de SMS consulta un servicio externo: en la prueba local se responde vacio
app.get('/vida/admin/auth/webnotifications', (req, res) => res.status(200).json({ error: 0, data: [] }));
// Correo de Auditoria y pagina de la foto, con firma de foto y envio de PRUEBA (no usan AWS): el ultimo correo se puede ver en /preview/correo
const FOTO_DE_EJEMPLO = 'https://tuid.ar/images/logos/Logo-vida30.png';
let ultimoCorreo = null;
const adminMw = require('../middleware/vidaAdmin');
app.post('/vida/admin/auth/auditoria/enviar-correo', adminMw, require('../services/vida/admin/correos').crearEnviarCorreo({
    db: { sync_query: (...a) => VIDA_DB.sync_query(...a) },
    firmarFoto: () => FOTO_DE_EJEMPLO,
    enviar: async (html, asunto, para) => { ultimoCorreo = { html, asunto, para }; },
    urlBase: () => 'http://localhost:3004'
}));
app.get('/preview/correo', (req, res) => res.send(ultimoCorreo ? ultimoCorreo.html : '<p>Todavia no se envio ningun correo de prueba.</p>'));
app.use('/vida/f', require('../services/vida/fotos')({ db: { sync_query: (...a) => VIDA_DB.sync_query(...a) }, firmarFoto: () => FOTO_DE_EJEMPLO }));
app.use('/vida/admin', require('../routes/vidaAdmin').router);

const dist = path.join(__dirname, '..', '..', 'panel-vida', 'fuente', 'dist', 'panel');
app.use(express.static(dist, { etag: false, lastModified: false, setHeaders: (res) => res.set('Cache-Control', 'no-store') }));
app.get('*', (req, res) => { res.set('Cache-Control', 'no-store'); res.sendFile(path.join(dist, 'index.html')); });

sembrar().then(() => {
    app.listen(3004, '127.0.0.1', () => console.log('Panel de prueba en http://localhost:3004 (cualquier usuario/clave)'));
}).catch((e) => { console.error('No se pudo sembrar los datos de prueba:', e); process.exit(1); });
