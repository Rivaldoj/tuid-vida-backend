// Comparacion de la identidad declarada en el registro contra el padron (master). Funciones puras, sin base de datos.
const cuil = require('./cuil');

/** Palabras de un nombre: mayusculas, sin tildes ni puntuacion. */
function words(text) {
    return String(text || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toUpperCase()
        .replace(/[^A-Z]+/g, ' ')
        .trim()
        .split(' ')
        .filter(Boolean);
}

/**
 * Dos apellidos (o dos nombres) coinciden si uno contiene todas las palabras del otro.
 * Asi "JOSE" coincide con "JOSE PEDRO" (el chip trae los dos nombres y el padron a veces uno solo),
 * pero "PEREZ" no coincide con "GOMEZ".
 */
function sameWords(a, b) {
    const x = words(a);
    const y = words(b);
    if (x.length === 0 || y.length === 0) return false;
    const contains = (big, small) => small.every((w) => big.includes(w));
    return contains(x, y) || contains(y, x);
}

function digits(value) {
    return String(value == null ? '' : value).replace(/\D/g, '').replace(/^0+/, '');
}

/**
 * Compara lo que declara la persona con la fila del padron.
 * declared: { cuil, number, gender, name, lastname }; row: fila de master (CUIL, DNI, Sexo, Apellido, Nombre).
 * Devuelve { ok: true } o { ok: false, motivo } con el motivo en texto corto (sin datos personales).
 */
function compare(declared, row) {
    if (!row) return { ok: false, motivo: 'cuil-inexistente' };
    if (declared.cuil && cuil.normalize(declared.cuil) !== cuil.normalize(row.CUIL)) return { ok: false, motivo: 'cuil-distinto' };
    if (digits(declared.number) !== digits(row.DNI)) return { ok: false, motivo: 'dni-distinto' };
    const g = String(declared.gender || '').toUpperCase();
    const s = String(row.Sexo || '').toUpperCase();
    if ((g === 'M' || g === 'F') && (s === 'M' || s === 'F') && g !== s) return { ok: false, motivo: 'sexo-distinto' };
    if (!sameWords(declared.lastname, row.Apellido)) return { ok: false, motivo: 'apellido-distinto' };
    if (!sameWords(declared.name, row.Nombre)) return { ok: false, motivo: 'nombre-distinto' };
    return { ok: true };
}

module.exports = { words, sameWords, compare };
