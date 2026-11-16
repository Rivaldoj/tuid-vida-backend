// Prueba sin base de datos: node test/fallecidosCarga.test.js
const assert = require('assert');
const { aFecha, validarRegistros, decidir, trozos, dniDeCuil } = require('../utils/fallecidosCarga');
const cuil = require('../utils/cuil');

const mk = (d) => { const b = '20' + d; return b + cuil.checkDigit(b); };
const C1 = mk('30000001');
const C2 = mk('30000003');
const C3 = mk('30000005');

// --- fechas
assert.strictEqual(aFecha(new Date('2026-10-05T00:00:00Z')), '2026-10-05');
assert.strictEqual(aFecha('2026-10-05'), '2026-10-05');
assert.strictEqual(aFecha('2026-10-05T03:00:00.000Z'), '2026-10-05');
assert.strictEqual(aFecha(null), null);
assert.strictEqual(aFecha(''), null);
assert.strictEqual(aFecha(new Date('x')), null);
assert.strictEqual(aFecha('basura'), null);

// --- validacion del archivo
const HOY = '2026-11-16';
let v = validarRegistros([
    { CUIL: Number(C1), FALLECIDO: 1, FECHAFALLE: new Date('2026-10-05T00:00:00Z') },
    { CUIL: Number(C2), FALLECIDO: 1, FECHAFALLE: null },                                   // sin fecha: valido
    { CUIL: '20123456787', FALLECIDO: 1, FECHAFALLE: new Date('2026-10-05T00:00:00Z') },    // verificador mal
    { CUIL: 123, FALLECIDO: 1, FECHAFALLE: null },                                          // largo mal
    { CUIL: Number(C3), FALLECIDO: 0, FECHAFALLE: null },                                   // no es fallecido
    { CUIL: Number(C3), FALLECIDO: 1, FECHAFALLE: new Date('2027-01-01T00:00:00Z') },       // futura
    { CUIL: Number(C3), FALLECIDO: 1, FECHAFALLE: new Date('1850-01-01T00:00:00Z') },       // antes de 1900
    { CUIL: Number(C3), FALLECIDO: 1, FECHAFALLE: 'no es fecha' },                          // ilegible
    { CUIL: Number(C1), FALLECIDO: 1, FECHAFALLE: new Date('2026-10-05T00:00:00Z') }        // repetido
], HOY);
assert.deepStrictEqual(v.validos, [{ cuil: C1, fecha: '2026-10-05', apenom: null, idlote: null }, { cuil: C2, fecha: null, apenom: null, idlote: null }]);
assert.strictEqual(v.duplicados, 1);
assert.deepStrictEqual(v.invalidos.map((i) => i.motivo), [
    'CUIL inválido', 'CUIL inválido', 'FALLECIDO distinto de 1', 'Fecha de fallecimiento futura', 'Fecha de fallecimiento anterior a 1900', 'Fecha de fallecimiento ilegible']);
// el repetido con fecha completa al que no la tenia
v = validarRegistros([{ CUIL: Number(C2), FALLECIDO: 1, FECHAFALLE: null }, { CUIL: Number(C2), FALLECIDO: 1, FECHAFALLE: new Date('2026-09-09T00:00:00Z') }], HOY);
assert.deepStrictEqual(v.validos, [{ cuil: C2, fecha: '2026-09-09', apenom: null, idlote: null }]);
// nombre y lote del archivo (para las altas en el padron): espacios sobrantes fuera, lote solo si es entero positivo
v = validarRegistros([{ CUIL: Number(C1), FALLECIDO: 1, FECHAFALLE: null, APENOM: '  PEREZ   JUAN  ', IDLOTE: 7 }, { CUIL: Number(C2), FALLECIDO: 1, FECHAFALLE: null, APENOM: '', IDLOTE: 0 }], HOY);
assert.deepStrictEqual(v.validos.map((x) => [x.apenom, x.idlote]), [['PEREZ JUAN', 7], [null, null]]);
assert.strictEqual(validarRegistros(null).validos.length, 0);

// --- decision por destino: nunca se pisa una fecha existente
const R = { cuil: C1, fecha: '2026-10-05' };
const SIN = { cuil: C1, fecha: null };
assert.strictEqual(decidir(R, false, null), 'marcar');
assert.strictEqual(decidir(R, false, '2020-01-01'), 'marcar', 'no marcado: se marca (la fecha previa se conserva al escribir)');
assert.strictEqual(decidir(R, true, '2026-10-05'), 'igual');
assert.strictEqual(decidir(R, true, new Date('2026-10-05T00:00:00Z')), 'igual', 'compara fechas, no tipos');
assert.strictEqual(decidir(R, true, null), 'completar');
assert.strictEqual(decidir(SIN, true, null), 'igual');
assert.strictEqual(decidir(R, true, '2026-09-01'), 'conflicto');
assert.strictEqual(decidir(SIN, true, '2026-09-01'), 'igual', 'el archivo sin fecha no genera conflicto');

// --- trozos
assert.deepStrictEqual(trozos([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
assert.deepStrictEqual(trozos([], 3), []);
// --- DNI que forma parte del CUIL (solo personas)
assert.strictEqual(dniDeCuil('20123456786'), 12345678);
assert.strictEqual(dniDeCuil('27111111117'), 11111111);
assert.strictEqual(dniDeCuil(20123456786), 12345678);
assert.strictEqual(dniDeCuil('30500010912'), null, 'CUIT de empresa: no tiene DNI');
assert.strictEqual(dniDeCuil('123'), null);
console.log('fallecidosCarga.test.js OK');
