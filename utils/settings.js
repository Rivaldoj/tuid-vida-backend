// Configuracion global guardada en la base (tabla `configuracion`). Ver scripts/sql/configuracion.sql.

const KEY_AUDITORIA = 'auditoria_certificaciones'; // 'ON' | 'OFF'
const CACHE_MS = 15000;
const AUDITOR_LIVENESS = 'Liveness';

let cache = { value: true, at: 0 };

// true = las certificaciones deben ser aprobadas por Auditoria antes de llegar a los clientes (comportamiento historico).
// Si la tabla no existe o la lectura falla, se devuelve true: ante la duda se exige la auditoria.
async function auditoriaObligatoria() {
    const now = Date.now();
    if (now - cache.at < CACHE_MS) return cache.value;
    let value = true;
    try {
        const rows = await VIDA_DB.sync_query('SELECT valor FROM configuracion WHERE clave = ?', [KEY_AUDITORIA]);
        if (rows.length > 0 && String(rows[0].valor).trim().toUpperCase() === 'OFF') value = false;
    } catch (err) {
        value = true;
    }
    cache = { value, at: now };
    return value;
}

// Valor que se guarda en auditoria.auditor al certificar: null = pendiente de Auditoria; 'Liveness' = aprobada
// automaticamente por la prueba de vida (solo se usa en el flujo con AWS Face Liveness).
async function auditorDeCertificacion() {
    return (await auditoriaObligatoria()) ? null : AUDITOR_LIVENESS;
}

async function setAuditoriaObligatoria(obligatoria, usuario) {
    const nuevo = obligatoria ? 'ON' : 'OFF';
    const rows = await VIDA_DB.sync_query('SELECT valor FROM configuracion WHERE clave = ?', [KEY_AUDITORIA]);
    const anterior = rows.length > 0 ? rows[0].valor : null;
    await VIDA_DB.sync_query(
        `INSERT INTO configuracion (clave, valor, actualizado_por, actualizado_en) VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE valor = VALUES(valor), actualizado_por = VALUES(actualizado_por), actualizado_en = VALUES(actualizado_en)`,
        [KEY_AUDITORIA, nuevo, usuario || null]);
    try {
        await VIDA_DB.sync_query(
            'INSERT INTO configuracion_historial (clave, valor_anterior, valor_nuevo, usuario, fecha) VALUES (?, ?, ?, ?, NOW())',
            [KEY_AUDITORIA, anterior, nuevo, usuario || null]);
    } catch (err) {
        console.log('No se pudo registrar el historial de configuracion', err.message);
    }
    cache = { value: obligatoria, at: 0 }; // la proxima lectura va a la base
    return { anterior, nuevo };
}

function limpiarCache() { cache = { value: true, at: 0 }; revisionCache = { value: null, at: 0 }; }

// --- Aviso "certificacion en revision": horas habiles y texto que ve la persona al pedir su certificado cuando Auditoria todavia no la aprobo.
// Se editan desde el panel (Auditoria, solo Administrador de TUID). Variables del texto: {{fecha}} y {{horas}}.
const KEY_REV_HORAS = 'certificado_horas_revision';
const KEY_REV_MENSAJE = 'certificado_mensaje_revision';
const REVISION_POR_DEFECTO = {
    horas: 48,
    mensaje: 'Su Certificación realizada el {{fecha}} se encuentra en proceso de revisión. En las próximas {{horas}} horas hábiles podrá acceder a su certificado.'
};
const REV_HORAS_MIN = 1;
const REV_HORAS_MAX = 720;
const REV_MENSAJE_MAX = 255; // largo de la columna `valor`
let revisionCache = { value: null, at: 0 };

async function certificadoRevision() {
    const now = Date.now();
    if (revisionCache.value && now - revisionCache.at < CACHE_MS) return revisionCache.value;
    let value = Object.assign({}, REVISION_POR_DEFECTO);
    try {
        const rows = await VIDA_DB.sync_query('SELECT clave, valor FROM configuracion WHERE clave IN (?, ?)', [KEY_REV_HORAS, KEY_REV_MENSAJE]);
        rows.forEach((r) => {
            if (r.clave === KEY_REV_HORAS) {
                const h = parseInt(r.valor, 10);
                if (h >= REV_HORAS_MIN && h <= REV_HORAS_MAX) value.horas = h;
            } else if (r.clave === KEY_REV_MENSAJE && String(r.valor).trim().length > 0) {
                value.mensaje = String(r.valor).trim();
            }
        });
    } catch (err) {
        value = Object.assign({}, REVISION_POR_DEFECTO); // sin tabla o con la base caida: el aviso de siempre
    }
    revisionCache = { value, at: now };
    return value;
}

// Arma el aviso con la fecha de la certificacion y las horas configuradas
async function mensajeRevision(fecha) {
    const c = await certificadoRevision();
    return c.mensaje.replace(/\{\{\s*fecha\s*\}\}/gi, fecha == null ? '' : String(fecha)).replace(/\{\{\s*horas\s*\}\}/gi, String(c.horas));
}

// Valida lo que llega del panel. Devuelve { error } o { horas, mensaje }.
function validarRevision(body) {
    const horas = parseInt(body && body.horas, 10);
    if (!(horas >= REV_HORAS_MIN && horas <= REV_HORAS_MAX)) return { error: `Las horas deben estar entre ${REV_HORAS_MIN} y ${REV_HORAS_MAX}.` };
    const mensaje = String((body && body.mensaje) || '').trim();
    if (mensaje.length < 10) return { error: 'El mensaje es muy corto.' };
    if (mensaje.length > REV_MENSAJE_MAX) return { error: `El mensaje no puede superar los ${REV_MENSAJE_MAX} caracteres.` };
    const desconocidas = [];
    mensaje.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (t, n) => { if (!['fecha', 'horas'].includes(n.toLowerCase())) desconocidas.push(n); return t; });
    if (desconocidas.length > 0) return { error: 'Variables que no existen: ' + desconocidas.join(', ') + '. Se pueden usar {{fecha}} y {{horas}}.' };
    return { horas, mensaje };
}

async function guardarClave(clave, nuevo, usuario) {
    const rows = await VIDA_DB.sync_query('SELECT valor FROM configuracion WHERE clave = ?', [clave]);
    const anterior = rows.length > 0 ? rows[0].valor : null;
    if (anterior === nuevo) return;
    await VIDA_DB.sync_query(
        `INSERT INTO configuracion (clave, valor, actualizado_por, actualizado_en) VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE valor = VALUES(valor), actualizado_por = VALUES(actualizado_por), actualizado_en = VALUES(actualizado_en)`,
        [clave, nuevo, usuario || null]);
    try {
        await VIDA_DB.sync_query('INSERT INTO configuracion_historial (clave, valor_anterior, valor_nuevo, usuario, fecha) VALUES (?, ?, ?, ?, NOW())', [clave, anterior, nuevo, usuario || null]);
    } catch (err) {
        console.log('No se pudo registrar el historial de configuracion', err.message);
    }
}

async function setCertificadoRevision(v, usuario) {
    await guardarClave(KEY_REV_HORAS, String(v.horas), usuario);
    await guardarClave(KEY_REV_MENSAJE, v.mensaje, usuario);
    revisionCache = { value: null, at: 0 };
}

module.exports = { certificadoRevision, mensajeRevision, validarRevision, setCertificadoRevision, REVISION_POR_DEFECTO, auditoriaObligatoria, auditorDeCertificacion, setAuditoriaObligatoria, limpiarCache, AUDITOR_LIVENESS, KEY_AUDITORIA };
