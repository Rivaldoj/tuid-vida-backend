// Prueba sin dependencias: node test/textos.test.js
const assert = require('assert');
const t = require('../utils/textos');

// --- variables
let r = t.render('Hola {{nombre}} {{ apellido }}, su CUIL es {{cuil}}.', { nombre: 'Ana', apellido: 'Prueba', cuil: '27-11111111-7' });
assert.strictEqual(r.texto, 'Hola Ana Prueba, su CUIL es 27-11111111-7.');
assert.deepStrictEqual(r.desconocidas, []);

r = t.render('Hola {{Nombre}} {{inventada}} {{inventada}}', { nombre: 'Ana' });
assert.strictEqual(r.texto, 'Hola Ana {{inventada}} {{inventada}}', 'una variable desconocida se deja y se informa');
assert.deepStrictEqual(r.desconocidas, ['inventada']);

r = t.render('Fecha: {{fecha}}', {});
assert.strictEqual(r.texto, 'Fecha: ', 'un dato faltante queda vacio');

// no se ejecuta nada de lo que haya en la plantilla
r = t.render('{{constructor}} ${process.exit(1)} {{nombre}}', { nombre: 'X' });
assert.ok(r.texto.includes('${process.exit(1)}') && r.texto.endsWith('X'));

// --- telefonos argentinos para wa.me
assert.strictEqual(t.telefonoWhatsApp('+54 9 11 2344-3283'), '5491123443283');
assert.strictEqual(t.telefonoWhatsApp('5491123443283'), '5491123443283');
assert.strictEqual(t.telefonoWhatsApp('011 2344-3283'), '5491123443283'.replace('5491123443283', '549112344328' + '3'));
assert.strictEqual(t.telefonoWhatsApp('1123443283'), '5491123443283');
assert.strictEqual(t.telefonoWhatsApp('541123443283'), '5491123443283', '54 sin el 9 de celular: se agrega');
assert.strictEqual(t.telefonoWhatsApp('5491123443283'), '5491123443283', 'formato de la registracion (549 + numero): no se toca');
assert.strictEqual(t.telefonoWhatsApp('549110000000'), '549110000000');
assert.strictEqual(t.telefonoWhatsApp('123'), null);
assert.strictEqual(t.telefonoWhatsApp(null), null);

// --- enlaces
const wa = t.urlWhatsApp('1123443283', 'Hola José\nSu CUIL: 27-1');
assert.ok(wa.startsWith('https://wa.me/5491123443283?text='));
assert.ok(!wa.includes(' ') && !wa.includes('\n'));
assert.strictEqual(decodeURIComponent(wa.split('?text=')[1]), 'Hola José\nSu CUIL: 27-1');
assert.strictEqual(t.urlWhatsApp('', 'x'), null);

const mt = t.urlMailto(' ana@example.com ', 'Asunto ñ', 'Línea 1\nLínea 2');
assert.ok(mt.startsWith('mailto:ana@example.com?subject='));
assert.ok(mt.includes('%0D%0A'));
assert.strictEqual(t.urlMailto('no-es-un-correo', 'a', 'b'), null);

// --- formatos
assert.strictEqual(t.formatoFecha(new Date(Date.UTC(2026, 10, 6))), '06/11/2026');
assert.strictEqual(t.formatoCuil('27111111117'), '27-11111111-7');
assert.strictEqual(t.capitalizar('ANA MARIA'), 'Ana Maria');
assert.strictEqual(t.capitalizar('NÚÑEZ'), 'Núñez');

console.log('textos.test.js OK');
