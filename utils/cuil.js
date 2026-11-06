// Normalizacion y validacion de CUIL/CUIT argentinos (11 digitos, digito verificador modulo 11).
// Desde 2021 el prefijo ya no indica el sexo de la persona: aca NO se deduce ni se calcula el CUIL
// a partir de DNI + sexo, solo se comprueba que el numero recibido este bien formado.

const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
const PREFIJOS = ['20', '23', '24', '25', '26', '27', '30', '33', '34'];

// Deja solo los digitos. Devuelve '' si no es texto ni numero.
function normalize(value) {
    if (typeof value !== 'string' && typeof value !== 'number') return '';
    return String(value).replace(/\D/g, '');
}

function checkDigit(tenDigits) {
    let sum = 0;
    for (let i = 0; i < 10; i++) sum += Number(tenDigits[i]) * PESOS[i];
    const rest = 11 - (sum % 11);
    if (rest === 11) return 0;
    if (rest === 10) return -1; // con ese prefijo no existe CUIL valido
    return rest;
}

function isValid(value) {
    const d = normalize(value);
    if (d.length !== 11) return false;
    if (!PREFIJOS.includes(d.slice(0, 2))) return false;
    return checkDigit(d.slice(0, 10)) === Number(d[10]);
}

module.exports = { normalize, isValid, checkDigit };
