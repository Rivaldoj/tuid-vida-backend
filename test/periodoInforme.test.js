// Prueba sin base de datos: node test/periodoInforme.test.js
const assert = require('assert');
const p = require('../utils/periodoInforme');

// fecha de corte: ultimo dia del mes, pero nunca despues de hoy
assert.strictEqual(p.fechaCorte(2026, 10, '2026-11-16'), '2026-10-31', 'mes anterior: ultimo dia');
assert.strictEqual(p.fechaCorte(2026, 11, '2026-11-16'), '2026-11-16', 'mes en curso: hoy');
assert.strictEqual(p.fechaCorte(2028, 2, '2028-05-01'), '2028-02-29', 'anio bisiesto');
assert.strictEqual(p.fechaCorte(2030, 1, '2026-11-16'), '2026-11-16', 'mes futuro: hoy');
assert.strictEqual(p.fechaCorte(2026, 12, '2027-01-01'), '2026-12-31');
// "hoy" en Argentina: 01:00 UTC del 17/11 todavia es 16/11 (UTC-3)
assert.strictEqual(p.hoyArgentina(new Date('2026-11-17T01:00:00Z')), '2026-11-16');
assert.strictEqual(p.hoyArgentina(new Date('2026-11-17T04:00:00Z')), '2026-11-17');

// fechas
assert.strictEqual(p.soloFecha('2026-11-01T03:00:00.000Z'), '2026-11-01');
assert.strictEqual(p.soloFecha(new Date('2026-11-01T00:00:00Z')), '2026-11-01');
assert.strictEqual(p.soloFecha(null), null);
assert.strictEqual(p.soloFecha(''), null);

// periodo
assert.strictEqual(p.armarPeriodo({ fecha_actual: null, fecha_fin: null, cantidad: 0 }, 0, '2026-11-16'), null, 'sin fecha de inicio no hay periodo');
assert.strictEqual(p.armarPeriodo(null, 0, '2026-11-16'), null);
assert.deepStrictEqual(p.armarPeriodo({ fecha_actual: '2026-11-01', fecha_fin: '2026-11-30', cantidad: 120 }, 45, '2026-11-16'),
    { fecha_actual: '2026-11-01', fecha_fin: '2026-11-30', cantidad: 120, corte: '2026-11-16', certificadas: 45, pendientes: 75 });
const sobra = p.armarPeriodo({ fecha_actual: '2026-11-01', fecha_fin: null, cantidad: 10 }, 12, '2026-11-16');
assert.strictEqual(sobra.pendientes, -2);
assert.strictEqual(sobra.fecha_fin, null);
assert.strictEqual(p.armarPeriodo({ fecha_actual: '2026-11-01', cantidad: null }, undefined, '2026-11-16').cantidad, 0);
console.log('periodoInforme.test.js OK');
