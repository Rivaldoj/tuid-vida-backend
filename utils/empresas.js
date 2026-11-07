// Validaciones y utilidades del ABM de Empresas y Administradores. Funciones puras (sin base de datos).
const crypto = require('crypto');

// Columnas de `empresa` que el panel puede leer y modificar. Se usan solo las que existan realmente en la tabla (ver columnasEmpresa).
const CAMPOS_EMPRESA = ['nombre', 'tipo', 'periodicidad', 'img', 'link', 'email', 'costo_validacion', 'visible', 'direcciones', 'emails', 'telefonos'];
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

// Codigo para que el administrador fije su propia clave (se envia por correo; nunca se muestra ni se guarda una clave)
function generarToken() {
    return crypto.randomBytes(12).toString('hex'); // 24 caracteres
}

// Hash descartable para una cuenta recien invitada: nadie conoce la clave, la persona la fija con el codigo
function hashDescartable() {
    return crypto.createHash('sha1').update(crypto.randomBytes(32)).digest('hex');
}

module.exports = { CAMPOS_EMPRESA, CAMPOS_BANDERA, normalizarId, idValido, emailValido, urlHttpsOpcional, validarEmpresa, generarToken, hashDescartable };
