// Validaciones y utilidades del ABM de Empresas y Administradores. Funciones puras (sin base de datos).
const crypto = require('crypto');
const cuilUtil = require('./cuil');

// Columnas de `empresa` que el panel puede leer y modificar. Se usan solo las que existan realmente en la tabla (ver columnasEmpresa).
const CAMPOS_EMPRESA = ['nombre', 'CUIT', 'tipo', 'periodicidad', 'img', 'link', 'email', 'costo_validacion', 'visible', 'direcciones', 'emails', 'telefonos'];
const CAMPOS_BANDERA = ['direcciones', 'emails', 'telefonos', 'visible']; // permisos de datos que pueden ver los administradores de la empresa en sus descargas

// El identificador de la empresa es su nombre (asi se guarda en usuario_empresa, cliente y auditoria): mayusculas, digitos, espacio, _ y -
function normalizarId(valor) {
    return String(valor == null ? '' : valor).trim().replace(/\s+/g, ' ').toUpperCase();
}

function idValido(id) {
    return /^[A-Z0-9][A-Z0-9 _-]{1,48}[A-Z0-9]$/.test(id);
}

function emailValido(email) {
    return typeof email === 'string' && email.trim().length <= 100 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function urlHttpsOpcional(valor) {
    if (valor == null || String(valor).trim() === '') return { ok: true, valor: null };
    const v = String(valor).trim();
    return /^https:\/\/[^\s"'<>]{4,300}$/.test(v) ? { ok: true, valor: v } : { ok: false };
}

// Valida los datos de una empresa. `tiposPermitidos` son los tipos que ya existen en la base (por ejemplo ['D']).
// Devuelve { error } o { valores } con solo los campos que vinieron.
function validarEmpresa(body, tiposPermitidos, esAlta) {
    const b = body || {};
    const v = {};
    if (esAlta) {
        const id = normalizarId(b.id);
        if (!idValido(id)) return { error: 'El nombre de la empresa debe tener entre 3 y 50 caracteres: letras, números, espacios, guion o guion bajo.' };
        v.id = id;
    }
    if (b.nombre !== undefined) {
        const nombre = String(b.nombre == null ? '' : b.nombre).trim();
        if (nombre.length > 100) return { error: 'El nombre para mostrar admite hasta 100 caracteres.' };
        v.nombre = nombre === '' ? null : nombre;
    }
    // CUIT de la empresa (columna CUIT char(11)): opcional; si se carga debe estar bien formado (11 digitos con digito verificador)
    if (b.CUIT !== undefined) {
        const cuit = cuilUtil.normalize(b.CUIT);
        if (cuit !== '' && !cuilUtil.isValid(cuit)) return { error: 'El CUIT no es válido (11 dígitos con dígito verificador).' };
        v.CUIT = cuit === '' ? null : cuit;
    }
    if (b.email !== undefined) {
        const email = String(b.email == null ? '' : b.email).trim();
        if (email !== '' && !emailValido(email)) return { error: 'El correo de la empresa no es válido.' };
        v.email = email === '' ? null : email;
    }
    if (b.costo_validacion !== undefined && b.costo_validacion !== '') {
        const c = Number(b.costo_validacion);
        if (!isFinite(c) || c < 0 || c > 100000) return { error: 'El costo por validación debe ser un número entre 0 y 100000.' };
        v.costo_validacion = c;
    }
    if (b.tipo !== undefined || esAlta) {
        const tipo = String(b.tipo == null || b.tipo === '' ? 'E' : b.tipo).trim().toUpperCase();
        if (!tiposPermitidos.includes(tipo)) return { error: 'El tipo de empresa no es válido.' };
        v.tipo = tipo;
    }
    if (b.periodicidad !== undefined || esAlta) {
        const p = Number(b.periodicidad == null || b.periodicidad === '' ? 1 : b.periodicidad);
        if (!Number.isInteger(p) || p < 1 || p > 120) return { error: 'La periodicidad debe ser un número entero de meses entre 1 y 120.' };
        v.periodicidad = p;
    }
    for (const campo of ['img', 'link']) {
        if (b[campo] !== undefined) {
            const r = urlHttpsOpcional(b[campo]);
            if (!r.ok) return { error: `El campo ${campo === 'img' ? 'logo' : 'enlace'} debe ser una dirección https válida.` };
            v[campo] = r.valor;
        }
    }
    for (const campo of CAMPOS_BANDERA) {
        if (b[campo] !== undefined) v[campo] = b[campo] ? 1 : 0;
    }
    return { valores: v };
}


// Fecha AAAA-MM-DD valida (o vacia -> null)
function fechaOpcional(valor) {
    if (valor == null || String(valor).trim() === '') return { ok: true, valor: null };
    const v = String(valor).trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return { ok: false };
    const d = new Date(v + 'T00:00:00Z');
    return isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? { ok: false } : { ok: true, valor: v };
}

// Periodo de certificacion que se completa al subir el archivo: inicio, fin, proxima validacion (inicio <= fin <= proxima) y cantidad. Todo obligatorio.
function validarPeriodo(b) {
    b = b || {};
    const etiquetas = { fecha_actual: 'fecha de inicio', fecha_fin: 'fecha de fin', fecha_proxima: 'fecha de próxima validación' };
    const v = {};
    for (const campo of Object.keys(etiquetas)) {
        const r = fechaOpcional(b[campo]);
        if (!r.ok || r.valor === null) return { error: 'Complete la ' + etiquetas[campo] + ' (formato AAAA-MM-DD).' };
        v[campo] = r.valor;
    }
    if (v.fecha_fin < v.fecha_actual) return { error: 'La fecha de fin no puede ser anterior a la de inicio.' };
    if (v.fecha_proxima < v.fecha_fin) return { error: 'La próxima validación no puede ser anterior a la fecha de fin.' };
    const n = Number(b.cantidad_registros);
    if (!Number.isInteger(n) || n < 1) return { error: 'La cantidad de registros debe ser un número entero mayor a cero.' };
    v.cantidad_registros = n;
    return { valores: v };
}

// Datos de una cuenta (usuario de una empresa cliente). El CUIL es obligatorio por seguridad.
function validarCuenta(b, esAlta) {
    b = b || {};
    const v = {};
    if (esAlta || b.cuil !== undefined) {
        const cuil = cuilUtil.normalize(b.cuil);
        if (!cuilUtil.isValid(cuil)) return { error: 'El CUIL es obligatorio y debe ser válido (11 dígitos con dígito verificador).' };
        v.cuil = cuil;
    }
    if (esAlta || b.nombre !== undefined) {
        const nombre = String(b.nombre == null ? '' : b.nombre).trim().replace(/\s+/g, ' ');
        if (nombre.length < 3 || nombre.length > 80) return { error: 'El nombre es obligatorio (entre 3 y 80 caracteres).' };
        v.nombre = nombre;
    }
    if (esAlta || b.email !== undefined) {
        const email = String(b.email == null ? '' : b.email).trim().toLowerCase();
        if (!emailValido(email) || email.length > 50) return { error: 'Ingrese un correo válido (hasta 50 caracteres).' };
        v.email = email;
    }
    return { valores: v };
}

// Codigo para que el administrador fije su propia clave (se envia por correo; nunca se muestra ni se guarda una clave)
function generarToken() {
    return crypto.randomBytes(12).toString('hex'); // 24 caracteres
}

// Hash descartable para una cuenta recien invitada: nadie conoce la clave, la persona la fija con el codigo
function hashDescartable() {
    return crypto.createHash('sha1').update(crypto.randomBytes(32)).digest('hex');
}

// Empresa a la que va el listado que se sube. Una empresa cliente sube siempre a la suya (aunque mande otra en el pedido). El Administrador de TUID
// puede elegir otra empresa, para subir por cuenta de quien necesite ayuda: debe existir. db: { sync_query }. Devuelve { empresa, porCuentaDe } o { error }
async function empresaDeSubida(db, user, body) {
    const propia = user && user.empresa;
    if (propia !== 'TUID') return { empresa: propia, porCuentaDe: false };
    const pedida = String((body && body.empresa) || '').trim();
    if (!pedida || pedida === 'TUID') return { empresa: 'TUID', porCuentaDe: false };
    const filas = await db.sync_query('SELECT id FROM empresa WHERE id = ?', [pedida]);
    if (!filas.length) return { error: 'No se encontró la empresa elegida.' };
    return { empresa: filas[0].id, porCuentaDe: true };
}

module.exports = { empresaDeSubida, fechaOpcional, validarPeriodo, validarCuenta, CAMPOS_EMPRESA, CAMPOS_BANDERA, normalizarId, idValido, emailValido, urlHttpsOpcional, validarEmpresa, generarToken, hashDescartable };
