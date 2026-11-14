// Control de nombre y apellido del documento contra padron.master al registrarse (ver utils/identidad.js).
// Si no coinciden dentro de la tolerancia, la registracion queda OBSERVADA (usuario.auditor = 'ALERTA:PADRON') y se avisa a Auditoria.
// La configuracion (activo y porcentaje de tolerancia) vive en la tabla `configuracion` y se edita desde el panel.
const identidad = require('./identidad');

const CLAVE_ACTIVO = 'padron_control_nombres';      // 'ON' | 'OFF'
const CLAVE_TOLERANCIA = 'padron_tolerancia_nombre'; // porcentaje minimo de parecido
const TOLERANCIA_POR_DEFECTO = 80;
const MARCA_OBSERVADO = 'ALERTA:PADRON';

async function leerConfig() {
    let activo = true;
    let tolerancia = TOLERANCIA_POR_DEFECTO;
    try {
        const rows = await VIDA_DB.sync_query('SELECT clave, valor FROM configuracion WHERE clave IN (?, ?)', [CLAVE_ACTIVO, CLAVE_TOLERANCIA]);
        rows.forEach((r) => {
            if (r.clave === CLAVE_ACTIVO) activo = String(r.valor).trim().toUpperCase() !== 'OFF';
            if (r.clave === CLAVE_TOLERANCIA) {
                const n = parseInt(r.valor, 10);
                if (n >= 1 && n <= 100) tolerancia = n;
            }
        });
    } catch (err) { /* sin tabla: valores por defecto */ }
    return { activo, tolerancia };
}

function validarConfig(body) {
    const b = body || {};
    if (typeof b.activo !== 'boolean') return { error: 'Se debe indicar si el control está activado' };
    const tolerancia = Number(b.tolerancia);
    if (!Number.isInteger(tolerancia) || tolerancia < 50 || tolerancia > 100) return { error: 'La tolerancia debe ser un número entero entre 50 y 100' };
    return { activo: b.activo, tolerancia };
}

async function guardarConfig(c, usuario) {
    const nuevos = { [CLAVE_ACTIVO]: c.activo ? 'ON' : 'OFF', [CLAVE_TOLERANCIA]: String(c.tolerancia) };
    for (const clave of Object.keys(nuevos)) {
        const rows = await VIDA_DB.sync_query('SELECT valor FROM configuracion WHERE clave = ?', [clave]);
        const anterior = rows.length ? rows[0].valor : null;
        if (anterior === nuevos[clave]) continue;
        await VIDA_DB.sync_query(
            `INSERT INTO configuracion (clave, valor, actualizado_por, actualizado_en) VALUES (?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE valor = VALUES(valor), actualizado_por = VALUES(actualizado_por), actualizado_en = VALUES(actualizado_en)`,
            [clave, nuevos[clave], usuario || null]);
        try {
            await VIDA_DB.sync_query('INSERT INTO configuracion_historial (clave, valor_anterior, valor_nuevo, usuario, fecha) VALUES (?, ?, ?, ?, NOW())',
                [clave, anterior, nuevos[clave], usuario || null]);
        } catch (e) { /* el historial no debe frenar el cambio */ }
    }
}

/**
 * Compara el documento con la fila del padron. Devuelve { observado, detalle } y nunca lanza:
 * si algo falla no se bloquea el registro (queda como antes) y se deja el motivo en `detalle`.
 */
async function evaluar(doc, row) {
    try {
        const c = await leerConfig();
        if (!c.activo) return { observado: false, detalle: 'control desactivado' };
        const r = identidad.compararNombres({ name: doc.name, lastname: doc.lastname }, row, c.tolerancia);
        if (r.ok) return { observado: false, detalle: `coincide (${r.modo})` };
        const partes = r.modo === 'separado' ? `apellido ${r.apellido}%, nombre ${r.nombre}%` : `nombre completo ${r.total}%`;
        return { observado: true, detalle: `${partes} (mínimo ${c.tolerancia}%)`, resultado: r };
    } catch (err) {
        console.log('Control de nombres', err);
        return { observado: false, detalle: 'no se pudo controlar' };
    }
}

/**
 * Texto para la pantalla "Errores en registros" (columna varchar(255)): que dice el documento, que dice el padron y el parecido.
 * Ejemplo: "OBSERVADA: Documento: RIVALDO, JORGE MODESTO | Padrón: RIVALDO, JORGE | apellido 100%, nombre 37.1% (mínimo 80%)"
 */
function describirDiferencia(doc, row, detalle) {
    const padron = row && row.Apellido && row.Nombre ? `${row.Apellido}, ${row.Nombre}` : String((row && row.Apellido_Nombre) || '');
    const texto = `OBSERVADA: Documento: ${doc.lastname}, ${doc.name} | Padrón: ${padron} | ${detalle}`;
    return texto.length > 255 ? texto.slice(0, 252) + '...' : texto;
}

module.exports = { describirDiferencia, leerConfig, validarConfig, guardarConfig, evaluar, MARCA_OBSERVADO, TOLERANCIA_POR_DEFECTO };
