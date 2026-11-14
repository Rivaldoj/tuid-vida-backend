const backups = require('../../../utils/backups');

function responder(res, fn) {
    return async (req) => {
        res.response = { error: 1, data: 'Error desconocido' };
        try { await fn(req); } catch (err) {
            console.log(err);
            res.response = { error: 1, data: 'No se pudo completar la operación' };
        }
        return res.status(200).json(res.response);
    };
}

// GET /auth/backups -> { estado, registros (base y copias de RDS), fuentes (subidas desde la PC), archivosDb (en S3) }
module.exports.get = (req, res) => responder(res, async () => {
    const [estado, registros, fuentes, archivosDb] = await Promise.all([
        backups.estado(),
        VIDA_DB.sync_query('SELECT id, tipo, origen, nombre, estado, bytes, clave_s3 clave, detalle, usuario, iniciado, terminado FROM backups ORDER BY id DESC LIMIT 60'),
        backups.listarS3('fuentes/', 60).catch(() => []),
        backups.listarS3('db/', 60).catch(() => []),
    ]);
    res.response = { error: 0, data: { estado, registros, fuentes, archivosDb, bucket: backups.bucket() } };
})(req);

// POST /auth/backups/ejecutar { tipo: 'db' | 'snapshot' }  (corre en segundo plano)
module.exports.ejecutar = (req, res) => responder(res, async () => {
    const tipo = req.body && req.body.tipo;
    if (tipo !== 'db' && tipo !== 'snapshot') { res.response.data = 'Tipo de backup inválido'; return; }
    const email = req.user && req.user.email;
    if (!backups.ejecutarEnSegundoPlano(tipo, 'manual', email)) { res.response.data = 'Ya hay un backup en curso'; return; }
    res.response = { error: 0, data: { iniciado: true } };
})(req);

// GET /auth/backups/descargar?clave=db/... | fuentes/...  -> URL firmada (15 minutos)
module.exports.descargar = (req, res) => responder(res, async () => {
    const clave = String((req.query && req.query.clave) || '');
    try { res.response = { error: 0, data: { url: backups.urlDescarga(clave) } }; } catch (e) { res.response.data = 'Archivo inválido'; }
})(req);

// POST /auth/backups/configuracion { activo, hora }
module.exports.setConfig = (req, res) => responder(res, async () => {
    const v = backups.validarConfig(req.body);
    if (v.error) { res.response.data = v.error; return; }
    await backups.guardarConfig(v, req.user && req.user.email);
    res.response = { error: 0, data: v };
})(req);
