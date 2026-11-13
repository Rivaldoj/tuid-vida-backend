// Prueba sin dependencias: node test/identidad.test.js
const assert = require('assert');
const id = require('../utils/identidad');

assert.deepStrictEqual(id.words('  José-Pedro  ÑANDÚ '), ['JOSE', 'PEDRO', 'NANDU']);
assert.ok(id.sameWords('JOSE', 'JOSE PEDRO'));
assert.ok(id.sameWords('Jose Pedro', 'JOSE'));
assert.ok(id.sameWords('GONZALEZ', 'GONZÁLEZ'));
assert.ok(!id.sameWords('PEREZ', 'GOMEZ'));
assert.ok(!id.sameWords('', 'GOMEZ'));
assert.ok(!id.sameWords(null, null));

// Datos sinteticos (ninguna persona real)
const row = { CUIL: 20123456786, DNI: 12345678, Sexo: 'M', Apellido: 'PEREZ GARCIA', Nombre: 'JUAN CARLOS' };
const ok = { cuil: '20-12345678-6', number: '12345678', gender: 'M', name: 'JUAN', lastname: 'PEREZ' };
assert.deepStrictEqual(id.compare(ok, row), { ok: true });
assert.deepStrictEqual(id.compare({ ...ok, cuil: undefined }, row), { ok: true });
assert.strictEqual(id.compare(ok, null).motivo, 'cuil-inexistente');
assert.strictEqual(id.compare({ ...ok, cuil: '27123456781' }, row).motivo, 'cuil-distinto');
assert.strictEqual(id.compare({ ...ok, number: '12345679' }, row).motivo, 'dni-distinto');
assert.strictEqual(id.compare({ ...ok, number: '012345678' }, row).ok, true);
assert.strictEqual(id.compare({ ...ok, gender: 'F' }, row).motivo, 'sexo-distinto');
assert.strictEqual(id.compare({ ...ok, gender: 'X' }, row).ok, true);
assert.strictEqual(id.compare({ ...ok, lastname: 'GOMEZ' }, row).motivo, 'apellido-distinto');
assert.strictEqual(id.compare({ ...ok, name: 'PEDRO' }, row).motivo, 'nombre-distinto');
console.log('identidad.test.js OK');
