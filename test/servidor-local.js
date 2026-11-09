// Servidor de PRUEBA local para la app (puerto 3003). No usa AWS ni produccion:
//  - base MySQL local con datos ficticios (puerto 3307, ver test/db/setup.js)
//  - searchdni / checkregistration / history / certificate usan el codigo REAL del backend
//  - login es una version de prueba: NO hay prueba de vida ni comparacion facial; registra la certificacion como
//    lo hace el servidor real (auditoria + id_device) para poder probar usuarios guardados e historial.
// Uso: node test/servidor-local.js   y en la PC:  adb reverse tcp:3003 tcp:3003
const util = require('util');
const mysql = require('mysql');
const express = require('express');

global.CONFIG = { get: (k) => (k === 'security.aesKey' ? 'k'.repeat(32) : { bucketName: 'x', approvePercentage: 90, rangoES: 1 }), has: (k) => k === 'security.aesKey' };
const Module = require('module');
const orig = Module._load;
Module._load = function (req) {
    if (/mail|tokenizer|\.\/shared|aws-sdk|utils\/(bucket|maps|slack)$/.test(req)) {
        // "doble" que acepta cualquier uso (incluido new AWS.S3()) sin hacer nada
        const dummy = function () { return dummyProxy; };
        const dummyProxy = new Proxy(dummy, { get: (t, k) => (k === 'then' ? undefined : dummyProxy), apply: () => dummyProxy, construct: () => dummyProxy });
        return dummyProxy;
    }
    if (/utils\/liveness$/.test(req)) {
        let n = 0;
        return { createSession: async () => 'local-session-' + Date.now() + '-' + (++n) };
    }
    return orig.apply(this, arguments);
};

const pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: '', database: 'vida_test' });
global.VIDA_DB = pool;
global.VIDA_DB.sync_query = util.promisify(pool.query).bind(pool);

const v2login = require('../services/vida/v2/services/login');
const account = require('../services/vida/v2/services/account');
const v1login = require('../services/vida/login');

const app = express();
app.use(express.json({ limit: '50mb' }));   // el registro envia las fotos del DNI y la selfie en base64
app.use((req, res, next) => { console.log(new Date().toISOString().slice(11, 19), req.method, req.originalUrl, JSON.stringify(req.body || {}).slice(0, 200)); next(); });

const v2 = express.Router();
v2.post('/searchdni', v2login.searchdni);
v2.post('/checkregistration', account.checkRegistration);
v2.post('/history', account.history);

// Version de PRUEBA de /login: sin liveness ni comparacion facial
v2.post('/login', async (req, res) => {
    const out = (o) => res.status(200).json(Object.assign({ status: 200 }, o));
    try {
        const prov = await VIDA_DB.sync_query('SELECT id_usuario, empresa FROM auditoria WHERE id_validacion = ?', [req.body.idValidation]);
        if (prov.length === 0) return out({ res: 'error', message: 'Validación inexistente (prueba local)' });
        const [u] = await VIDA_DB.sync_query('SELECT * FROM usuario WHERE id_usuario = ?', [prov[0].id_usuario]);
        const emps = await VIDA_DB.sync_query('SELECT empresa FROM usuario_empresa WHERE cuil = ?', [u.cuil]);
        for (const e of emps) {
            await VIDA_DB.sync_query(
                `INSERT INTO auditoria (id_usuario, fecha, id_device, similitud, empresa, latitud, longitud, direccion, cuil, session_id)
                 VALUES (?, NOW(), ?, 95, ?, ?, ?, ?, ?, ?)`,
                [u.id_usuario, req.body.idDevice || null, e.empresa, req.body.latitud || null, req.body.longitud || null,
                    'Dirección de prueba (local)', u.cuil, req.body.sessionId]);
        }
        await VIDA_DB.sync_query('UPDATE usuario SET fecha_valida = NOW(), id_device = ? WHERE id_usuario = ?', [req.body.idDevice || u.id_device, u.id_usuario]);
        await VIDA_DB.sync_query('DELETE FROM auditoria WHERE id_validacion = ?', [req.body.idValidation]);
        return out({
            res: 'ok', message: 'ok', idUser: u.id_usuario, name: u.apellido + ', ' + u.nombre,
            banco: emps.map((e) => e.empresa + '   ').join(''), cuil: u.cuil, fecha_valida: new Date(Date.now() + 180 * 86400000).toISOString(),
            email: u.email, telefono: u.telefono, token: 'token-de-prueba', pendingTasks: []
        });
    } catch (err) {
        console.log(err);
        return out({ res: 'error', message: 'Error en la prueba local: ' + err.message });
    }
});
app.use('/vida/v2', v2);

// v1: la app valida el documento escaneado antes de seguir con el registro. En la prueba local siempre se puede continuar.
app.post('/checkDocument', (req, res) => res.json({ res: 200, code: '10011', message: '', proceed: true }));

// v1 que usa la app para "Cuando cobro" y "Solicitar certificado"
app.get('/certificate', v1login.getCertificate);
app.get('/payments', (req, res) => res.json({
    error: 0, message: '1 resultados',
    pagos: [{ fechaActual: '2026-11-10T03:00:00.000Z', fechaProxima: '2026-12-10T03:00:00.000Z', caja: 'PRUEBA', IDEntidad: 1, id: 1,
        Apellido_Nombre: 'PERSONA DE PRUEBA' }]
}));

app.listen(3003, '127.0.0.1', () => console.log('Servidor de prueba local en http://127.0.0.1:3003 (MySQL local 3307)'));
