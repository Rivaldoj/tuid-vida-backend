// Comparacion del nombre y apellido del documento contra padron.master, por aproximacion con un porcentaje de tolerancia.
// Funciones puras, sin base de datos.
//
// Regla (la del padron de TUID):
//  - Si el padron trae Apellido y Nombre por separado, se compara cada uno por su lado.
//  - Si no se pudo separar (Apellido y Nombre vacios), se compara todo junto contra Apellido_Nombre.

/** Palabras de un nombre: mayusculas, sin tildes ni puntuacion. El padron trae la enie como "¥". */
function words(text) {
    return String(text == null ? '' : text)
        .replace(/[¥ñÑ]/g, 'N')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toUpperCase()
        .replace(/[^A-Z]+/g, ' ')
        .trim()
        .split(' ')
        .filter(Boolean);
}

function distancia(a, b) {
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        const cur = [i];
        for (let j = 1; j <= b.length; j++) {
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
        prev = cur;
    }
    return prev[b.length];
}

/** Parecido (0 a 1) entre dos palabras. Una inicial ("I.") o una palabra cortada ("ALEJ") coincide con la completa. */
function parecidoPalabra(a, b) {
    if (a === b) return 1;
    const [corta, larga] = a.length <= b.length ? [a, b] : [b, a];
    if (corta.length === 1) return larga[0] === corta ? 1 : 0;
    if (corta.length >= 3 && larga.startsWith(corta)) return 1;
    return 1 - distancia(a, b) / Math.max(a.length, b.length);
}

/**
 * Parecido (0 a 100) entre dos nombres. Cada palabra del lado mas corto busca su mejor pareja en el otro
 * (sin repetir), asi no importa el orden y "JOSE" coincide con "JOSE PEDRO" (el padron a veces trae un solo nombre).
 */
function parecido(a, b) {
    const x = words(a);
    const y = words(b);
    if (x.length === 0 || y.length === 0) return 0;
    const [chico, grande] = x.length <= y.length ? [x, y] : [y, x];
    const usadas = new Set();
    let suma = 0;
    for (const p of chico) {
        let mejor = 0;
        let idx = -1;
        grande.forEach((q, i) => {
            if (usadas.has(i)) return;
            const s = parecidoPalabra(p, q);
            if (s > mejor) { mejor = s; idx = i; }
        });
        if (idx >= 0) usadas.add(idx);
        suma += mejor;
    }
    return Math.round((suma / chico.length) * 1000) / 10;
}

function vacio(v) {
    return words(v).length === 0;
}

/**
 * declared: { name, lastname } del documento; row: fila de master (Apellido, Nombre, Apellido_Nombre).
 * tolerancia: porcentaje minimo (1 a 100). Devuelve { ok, modo, apellido, nombre, total }:
 *  modo 'separado' (apellido y nombre por su lado) o 'junto' (todo contra Apellido_Nombre); los valores son porcentajes.
 */
function compararNombres(declared, row, tolerancia) {
    const minimo = Number(tolerancia);
    if (!row) return { ok: false, modo: 'sin-padron' };
    if (!vacio(row.Apellido) && !vacio(row.Nombre)) {
        const apellido = parecido(declared.lastname, row.Apellido);
        const nombre = parecido(declared.name, row.Nombre);
        return { ok: apellido >= minimo && nombre >= minimo, modo: 'separado', apellido, nombre };
    }
    const total = parecido(`${declared.lastname || ''} ${declared.name || ''}`, row.Apellido_Nombre);
    return { ok: total >= minimo, modo: 'junto', total };
}

module.exports = { words, parecidoPalabra, parecido, compararNombres };
