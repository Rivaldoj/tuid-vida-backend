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
    has: () => false,
    get: (k) => k === 'jwt'
        ? { key: 'clave-de-prueba', time: 1, units: 'days', authenticatorAdmin: { key: 'clave-admin-de-prueba', time: 1, units: 'days' }, vidaAdmin: { time: 1, units: 'days' } }
        : { bucketName: 'x', approvePercentage: 90, rangoES: 1, whitebrands: [] }
};
global.TESTING = true;
const Module = require('module');
const orig = Module._load;
Module._load = function (req) {
    if (/aws-sdk|nodemailer|utils\/(bucket|maps|slack|sms|push|mail|whatsapp)$/.test(req)) {
        const dummy = function () { return dummyProxy; };
        const dummyProxy = new Proxy(dummy, { get: (t, k) => (k === 'then' ? undefined : dummyProxy), apply: () => dummyProxy, construct: () => dummyProxy });
        return dummyProxy;
    }
    return orig.apply(this, arguments);
};

const pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: '', database: 'vida_test', multipleStatements: true });
global.VIDA_DB = pool;
global.VIDA_DB.sync_query = util.promisify(pool.query).bind(pool);
const q = (sql, p) => VIDA_DB.sync_query(sql, p);

const tokenizer = require('../utils/tokenizer');
const adminUser = require('../services/vida/admin/user');
const { PERSONAS } = require('./db/setup');

async function sembrar() {
    // tablas del interruptor de auditoria (migracion de produccion, aplicada solo en la BD local de prueba)
    await q(require('fs').readFileSync(path.join(__dirname, '../scripts/sql/configuracion.sql'), 'utf8'));
    await q("UPDATE configuracion SET valor = 'ON' WHERE clave = 'auditoria_certificaciones'");
    const { ana, beto, carlos, dora } = PERSONAS;
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
    // fechas de hoy para que se vean con el rango por defecto del panel
    await q("UPDATE auditoria SET fecha = NOW() WHERE id_usuario = ?", [u.id_usuario]);
    await q("UPDATE usuario SET fecha = NOW()");
}

const app = express();
app.use(express.json());
app.use((req, res, next) => { res.response = {}; console.log(new Date().toISOString().slice(11, 19), req.method, req.originalUrl); next(); });

app.post('/vida/admin/login', (req, res) => {
    const usuario = { email: (req.body && req.body.email) || 'admin@tuid.test', empresa: 'TUID', rol: 'A' };
    usuario.newPermissions = adminUser.getUserPermissions(usuario);
    res.status(200).json({
        error: 0, data: 'Logueo satisfactorio', usuario: usuario.email, fecha_ultima: new Date().toISOString(),
        token: tokenizer.tokenizeVidaAdmin(usuario), permissions: usuario.newPermissions.join(','), newPermissions: usuario.newPermissions
    });
});
// el aviso de creditos de SMS consulta un servicio externo: en la prueba local se responde vacio
app.get('/vida/admin/auth/webnotifications', (req, res) => res.status(200).json({ error: 0, data: [] }));
app.use('/vida/admin', require('../routes/vidaAdmin').router);

const dist = 'C:/TUID/panel-vida/fuente/dist/panel';
app.use(express.static(dist, { etag: false, lastModified: false, setHeaders: (res) => res.set('Cache-Control', 'no-store') }));
app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));

sembrar().then(() => {
    app.listen(3004, '127.0.0.1', () => console.log('Panel de prueba en http://localhost:3004 (cualquier usuario/clave)'));
}).catch((e) => { console.error('No se pudo sembrar los datos de prueba:', e); process.exit(1); });
