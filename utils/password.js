// Claves del panel de administracion. Antes eran SHA1 sin sal (se rompen en segundos con tablas publicas).
// Formato nuevo: "s1$<sal hex>$<hash scrypt hex>" (~100 caracteres). Las claves viejas (SHA1 de 40 hex) se siguen aceptando para que nadie
// quede afuera, y se convierten al formato nuevo en el siguiente ingreso correcto.
//
// IMPORTANTE para el despliegue: el formato nuevo no entra en una columna VARCHAR(40). Primero ampliar las columnas
// (scripts/sql/claves_scrypt.sql) y recien despues activar `security.passwordHash: "scrypt"` en la configuracion. Mientras no este
// activada, se sigue guardando SHA1 (se puede verificar ambos formatos igual).
const crypto = require('crypto');

const PREFIJO = 's1$';
const COSTO = { N: 16384, r: 8, p: 1 };

function scryptHex(plain, sal) {
    return crypto.scryptSync(String(plain), sal, 32, COSTO).toString('hex');
}

function sha1Hex(plain) {
    return crypto.createHash('sha1').update(String(plain)).digest('hex');
}

function iguales(a, b) {
    const x = Buffer.from(String(a));
    const y = Buffer.from(String(b));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function scryptActivado() {
    return typeof CONFIG !== 'undefined' && CONFIG.has('security.passwordHash') && CONFIG.get('security.passwordHash') === 'scrypt';
}

// Hash con sal aleatoria (formato nuevo)
function hashNuevo(plain) {
    const sal = crypto.randomBytes(16).toString('hex');
    return PREFIJO + sal + '$' + scryptHex(plain, sal);
}

// Hash a guardar hoy: el nuevo si esta activado, si no el SHA1 de siempre
function paraGuardar(plain) {
    return scryptActivado() ? hashNuevo(plain) : sha1Hex(plain);
}

// { ok, actualizar }: ok = la clave coincide; actualizar = esta guardada en el formato viejo y conviene pasarla al nuevo
function verificar(plain, guardado) {
    if (typeof plain !== 'string' || plain === '' || typeof guardado !== 'string' || guardado === '') return { ok: false, actualizar: false };
    if (guardado.startsWith(PREFIJO)) {
        const partes = guardado.split('$');
        if (partes.length !== 3) return { ok: false, actualizar: false };
        return { ok: iguales(scryptHex(plain, partes[1]), partes[2]), actualizar: false };
    }
    const ok = iguales(sha1Hex(plain), guardado);
    return { ok, actualizar: ok };
}

// Reglas minimas para una clave nueva
function claveAceptable(plain) {
    if (typeof plain !== 'string' || plain.length < 8 || plain.length > 100) return 'La contraseña debe tener entre 8 y 100 caracteres.';
    if (!/[A-Za-z]/.test(plain) || !/\d/.test(plain)) return 'La contraseña debe tener letras y números.';
    return null;
}

module.exports = { hashNuevo, paraGuardar, verificar, claveAceptable, scryptActivado };
