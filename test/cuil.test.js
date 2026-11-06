// Prueba sin dependencias: node test/cuil.test.js
const assert = require('assert');
const cuil = require('../utils/cuil');

assert.strictEqual(cuil.checkDigit('2012345678'), 6);
assert.ok(cuil.isValid('20123456786'));
assert.ok(cuil.isValid('20-12345678-6'));
assert.ok(cuil.isValid(20123456786));
assert.ok(!cuil.isValid('20123456787'));
assert.ok(!cuil.isValid('2012345678'));
assert.ok(!cuil.isValid('201234567860'));
assert.ok(!cuil.isValid(''));
assert.ok(!cuil.isValid(null));
assert.ok(!cuil.isValid(undefined));
assert.ok(!cuil.isValid({}));
assert.ok(!cuil.isValid('9912345678' + Math.max(cuil.checkDigit('9912345678'), 0)));
assert.strictEqual(cuil.normalize('20-12345678-6'), '20123456786');
assert.strictEqual(cuil.normalize(null), '');
console.log('cuil.test.js OK');
