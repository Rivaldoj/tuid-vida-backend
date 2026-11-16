const crypto = require('crypto');
const cuilUtil = require('../../../../utils/cuil');
const { createLimiter } = require('../../../../utils/rateLimit');
const login = require('./login');

const HISTORY_LIMIT = 20;

// Frenos contra consultas masivas (enumeracion de CUIL). Por origen: ver nota de proxy en el informe.
const registrationLimiter = createLimiter({ max: 30, windowMs: 10 * 60 * 1000 });
const historyLimiter = createLimiter({ max: 20, windowMs: 10 * 60 * 1000 });
const deviceLimiter = createLimiter({ max: 30, windowMs: 10 * 60 * 1000 });
setInterval(() => { registrationLimiter.sweep(); historyLimiter.sweep(); deviceLimiter.sweep(); }, 10 * 60 * 1000).unref();

function origin(req) {
    return String(req.ip || (req.connection && req.connection.remoteAddress) || 'unknown');
}

function reply(res, payload) {
    return res.status(200).json(Object.assign({ status: 200 }, payload));
}

function error(res, message) {
    return reply(res, { res: 'error', message });
}

function sameSecret(a, b) {
    const x = Buffer.from(String(a || ''));
    const y = Buffer.from(String(b || ''));
    return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Estados que informa checkRegistration. Nunca se devuelven nombres, fechas ni datos de contacto.
const REGISTRATION = {
    NOT_REGISTERED: 'NOT_REGISTERED',
    NOT_ADHERED: 'NOT_ADHERED',          // no esta registrada y su CUIL no figura en usuario_empresa (entidad no adherida)
    INCOMPLETE: 'REGISTRATION_INCOMPLETE',
    PENDING: 'REGISTERED_PENDING',
    UP_TO_DATE: 'REGISTERED_UP_TO_DATE'
};

const NO_ADHERIDA = 'Su CUIL no figura en ninguna entidad adherida a TuID Vida.\nEsto puede deberse a que su beneficio previsional es muy reciente o a que su institución todavía no está adherida. Si encuentra útil nuestro servicio, solicite a su entidad la adhesión. Cualquier inquietud contáctenos.';

function registrationStatus(rows) {
    if (rows.length === 0) return REGISTRATION.NOT_REGISTERED;
    if (rows[0].estado === 'Desaprobado' || rows[0].estado === 'Revancha') return REGISTRATION.INCOMPLETE;
    const pending = rows.some((r) => r.status === 'PENDING' || (r.auditor2 && r.auditor2.includes('ALERTA')));
    return pending ? REGISTRATION.PENDING : REGISTRATION.UP_TO_DATE;
}

// dd/mm/aaaa a partir de un Date (la base devuelve DATE como Date en UTC) o de un texto aaaa-mm-dd
function formatFecha(value) {
    if (!value) return null;
    const pad = (n) => String(n).padStart(2, '0');
    if (value instanceof Date) {
        return pad(value.getUTCDate()) + '/' + pad(value.getUTCMonth() + 1) + '/' + value.getUTCFullYear();
    }
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
    return m ? m[3] + '/' + m[2] + '/' + m[1] : String(value);
}

// Una fila por entidad: la fecha sale de usuario_empresa.proxima; si esa columna esta vacia se usa la que calcula
// la consulta (validez = ultima certificacion + periodicidad, o el proximo periodo).
function proximasCertificaciones(rows) {
    const vistas = new Set();
    const out = [];
    for (const r of rows) {
        if (!r.empresa || vistas.has(r.empresa)) continue;
        vistas.add(r.empresa);
        out.push({ empresa: String(r.empresa).trim(), proxima: formatFecha(r.proxima || r.validez || r.next) });
    }
    return out;
}

// POST /checkregistration { cuil }
// Para el boton "Registrarse": dice si la persona ya esta registrada y si tiene la Fe de Vida pendiente,
// sin devolver datos personales.
async function checkRegistration(req, res) {
    if (!registrationLimiter.allow(origin(req))) {
        return error(res, 'Demasiados intentos. Espere unos minutos e inténtelo nuevamente.');
    }
    const cuil = cuilUtil.normalize(req.body && req.body.cuil);
    if (!cuilUtil.isValid(cuil)) {
        return error(res, 'El CUIL ingresado no es válido. Revise los números e inténtelo nuevamente.');
    }
    try {
        const rows = await VIDA_DB.sync_query(login.queries.searchQuery(login.queries.FILTER_BY_CUIL), [cuil, cuil]);
        let registration = registrationStatus(rows);
        let message = 'ok';
        // Para registrarse, el CUIL tiene que figurar en usuario_empresa: es lo que prueba que la persona pertenece
        // a una entidad adherida a TuID Vida. Si no figura, no se puede registrar.
        if (registration === REGISTRATION.NOT_REGISTERED) {
            const entidades = await VIDA_DB.sync_query('SELECT empresa FROM usuario_empresa WHERE cuil = ? LIMIT 1', [cuil]);
            if (entidades.length === 0) {
                registration = REGISTRATION.NOT_ADHERED;
                message = NO_ADHERIDA;
            }
        }
        const payload = {
            res: 'ok',
            message,
            registered: registration !== REGISTRATION.NOT_REGISTERED && registration !== REGISTRATION.NOT_ADHERED,
            registration,
            pendingFeDeVida: registration === REGISTRATION.PENDING
        };
        // Quien esta al dia: se informa para que entidad y en que fecha le toca la proxima certificacion
        // (la app lo muestra y NO abre la camara). Es la misma informacion que ya daba searchdni.
        if (registration === REGISTRATION.UP_TO_DATE) payload.proximas = proximasCertificaciones(rows);
        return reply(res, payload);
    } catch (err) {
        console.log(err);
        return error(res, 'No pudimos consultar su registro en este momento. Inténtelo nuevamente.');
    }
}

// Agrupa las filas de auditoria (una por empresa) en certificaciones: todas las filas de una misma
// Fe de Vida comparten session_id. Devuelve las ultimas `limit`, de la mas reciente a la mas antigua.
function groupCertifications(rows, limit) {
    const groups = new Map();
    for (const r of rows) {
        const key = r.session_id || `f:${r.fecha instanceof Date ? r.fecha.getTime() : r.fecha}`;
        let g = groups.get(key);
        if (!g) {
            g = { id: r.id, fecha: r.fecha, empresas: [], direccion: r.direccion || null, latitud: r.latitud || null, longitud: r.longitud || null, estado: 'OK' };
            groups.set(key, g);
        }
        if (r.empresa && !g.empresas.includes(r.empresa)) g.empresas.push(r.empresa);
        if (r.auditor && r.auditor.includes('ALERTA')) g.estado = 'OBSERVADA';
        if (r.id < g.id) g.id = r.id;
    }
    return [...groups.values()]
        .sort((a, b) => new Date(b.fecha) - new Date(a.fecha) || b.id - a.id)
        .slice(0, limit);
}

// POST /history { cuil, idDevice }
// Devuelve las ultimas 20 certificaciones de ESA persona. Solo responde si idDevice coincide con el
// dispositivo desde el que la persona hizo su ultima Fe de Vida (queda guardado en usuario.id_device),
// es decir, solo desde el telefono ya vinculado. Es de solo lectura.
async function history(req, res) {
    const denied = 'No pudimos actualizar su historial. Realice una Fe de Vida desde este teléfono e inténtelo nuevamente.';
    if (!historyLimiter.allow(origin(req))) {
        return error(res, 'Demasiados intentos. Espere unos minutos e inténtelo nuevamente.');
    }
    const cuil = cuilUtil.normalize(req.body && req.body.cuil);
    const idDevice = req.body && req.body.idDevice;
    if (!cuilUtil.isValid(cuil) || !idDevice) {
        return error(res, denied);
    }
    try {
        const users = await VIDA_DB.sync_query(
            'SELECT id_usuario, id_device FROM usuario WHERE cuil = ? AND fecha_fallecido IS NULL', [cuil]);
        // mismo mensaje si no existe o si el dispositivo no coincide: no se revela cual de los dos fue
        if (users.length !== 1 || !sameSecret(users[0].id_device, idDevice)) {
            return error(res, denied);
        }
        const rows = await VIDA_DB.sync_query(
            `SELECT a.id_validacion AS id, a.fecha, a.empresa, a.direccion, a.latitud, a.longitud, a.session_id, a.auditor
             FROM auditoria a
             WHERE a.id_usuario = ? AND a.similitud > 1
             ORDER BY a.fecha DESC, a.id_validacion DESC
             LIMIT 200`, [users[0].id_usuario]);
        const certificaciones = groupCertifications(rows, HISTORY_LIMIT);
        return reply(res, { res: 'ok', message: 'ok', cuil, certificaciones });
    } catch (err) {
        console.log(err);
        return error(res, 'No pudimos actualizar su historial. Verifique su conexión a Internet e inténtelo nuevamente.');
    }
}

// Token de Firebase: letras, numeros y _ - : . (unos 160 caracteres); se acota para no guardar cualquier cosa
function tokenValido(t) {
    return typeof t === 'string' && t.length >= 16 && t.length <= 4096 && /^[A-Za-z0-9_:.\-]+$/.test(t);
}

// POST /refreshdevice { cuil, idDevice, newIdDevice }
// La app avisa que Firebase le renovo el token (idDevice = el que el servidor tiene, newIdDevice = el nuevo). Solo se cambia si idDevice coincide
// con el token guardado: la prueba de que es el mismo telefono es conocer el token anterior (igual que /history). Sin esa prueba no se toca nada:
// con solo el CUIL cualquiera podria quedarse con las notificaciones y el historial de otra persona. Un telefono nuevo se vincula con una Fe de Vida.
async function refreshDevice(req, res) {
    const denied = 'No pudimos actualizar el dispositivo.';
    if (!deviceLimiter.allow(origin(req))) {
        return error(res, 'Demasiados intentos. Espere unos minutos e inténtelo nuevamente.');
    }
    const cuil = cuilUtil.normalize(req.body && req.body.cuil);
    const anterior = req.body && req.body.idDevice;
    const nuevo = req.body && req.body.newIdDevice;
    if (!cuilUtil.isValid(cuil) || !tokenValido(anterior) || !tokenValido(nuevo) || anterior === nuevo) {
        return error(res, denied);
    }
    try {
        const users = await VIDA_DB.sync_query(
            'SELECT id_usuario, id_device FROM usuario WHERE cuil = ? AND fecha_fallecido IS NULL', [cuil]);
        // mismo mensaje si no existe o si el token anterior no coincide: no se revela cual de los dos fue
        if (users.length !== 1) return error(res, denied);
        const guardado = users[0].id_device;
        if (sameSecret(guardado, nuevo)) return reply(res, { res: 'ok', message: 'ok' });   // ya estaba actualizado (reintento de la app)
        if (!sameSecret(guardado, anterior)) return error(res, denied);
        // el WHERE vuelve a exigir el token anterior: si cambio mientras tanto (por ejemplo una Fe de Vida desde otro telefono), no se pisa
        await VIDA_DB.sync_query('UPDATE usuario SET id_device = ? WHERE id_usuario = ? AND id_device = ?', [nuevo, users[0].id_usuario, guardado]);
        return reply(res, { res: 'ok', message: 'ok' });
    } catch (err) {
        console.log(err);
        return error(res, 'No pudimos actualizar el dispositivo. Verifique su conexión a Internet e inténtelo nuevamente.');
    }
}

module.exports = { checkRegistration, history, refreshDevice, tokenValido, registrationStatus, groupCertifications, proximasCertificaciones, formatFecha };
