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

function limpiarCache() { cache = { value: true, at: 0 }; }

module.exports = { auditoriaObligatoria, auditorDeCertificacion, setAuditoriaObligatoria, limpiarCache, AUDITOR_LIVENESS, KEY_AUDITORIA };
