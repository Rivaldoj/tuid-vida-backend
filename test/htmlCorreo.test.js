// Prueba sin dependencias: node test/htmlCorreo.test.js
const assert = require('assert');
const h = require('../utils/htmlCorreo');
const t = require('../utils/textos');
const { claveDe, datosDe } = require('../services/vida/contactoTexto');

const sano = (x) => h.sanear(x);

// --- lo normal pasa
assert.strictEqual(sano('<p>Hola <strong>Ana</strong></p>'), '<p>Hola <strong>Ana</strong></p>');
assert.strictEqual(sano('<a href="https://tuid.ar/x?a=1&b=2" target="_blank">Ayuda</a>'), '<a href="https://tuid.ar/x?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">Ayuda</a>');
assert.strictEqual(sano('<a href="mailto:contacto@tuid.ar">c</a>'), '<a href="mailto:contacto@tuid.ar">c</a>');
assert.strictEqual(sano('<p style="color:#333;margin:0">x</p>'), '<p style="color:#333;margin:0">x</p>');
assert.strictEqual(sano('<img src="https://tuid.ar/a.png" width="48" alt="x">'), '<img src="https://tuid.ar/a.png" width="48" alt="x" />');
assert.strictEqual(sano('<html><head><title>t</title><style>.a{}</style></head><body><p>solo cuerpo</p></body></html>'), '<p>solo cuerpo</p>', 'se queda con el cuerpo');
assert.strictEqual(sano('<ol start="1" type="1"><li>uno</li></ol>'), '<ol start="1" type="1"><li>uno</li></ol>');
assert.strictEqual(sano('Texto &ldquo;con&rdquo; entidades &nbsp;'), 'Texto &ldquo;con&rdquo; entidades &nbsp;');

// --- ataques
const malos = [
    '<script>alert(1)</script>hola', '<SCRIPT SRC=//x.y/z.js></SCRIPT>', '<script>alert(1)', '<img src=x onerror=alert(1)>', '<img src="javascript:alert(1)">',
    '<a href="javascript:alert(1)">x</a>', '<a href=" jav&#x09;ascript:alert(1)">x</a>', '<a href="java\tscript:alert(1)">x</a>', '<a href="data:text/html;base64,AAAA">x</a>',
    '<a href="//evil.com">x</a>', '<img src="http://x/a.png">', '<iframe src="https://x"></iframe>', '<svg onload=alert(1)>', '<body onload=alert(1)>',
    '<p style="background:url(javascript:alert(1))">x</p>', '<p style="width:expression(alert(1))">x</p>', '<p style="a:\6a avascript">x</p>', '<form action="https://x"><input name=a></form>',
    '<object data="x"></object>', '<link rel=stylesheet href="https://x/s.css">', '<meta http-equiv=refresh content="0;url=https://x">', '<div onclick="x()">a</div>',
    '<a href="https://x" onmouseover="alert(1)">x</a>', '<<script>script>alert(1)<</script>/script>', '<img src="https://x/a.png" onerror="alert(1)">', '<math><mi xlink:href="javascript:alert(1)">'
];
for (const m of malos) {
    const r = sano(m);
    assert.ok(!/<script|<iframe|<svg|<form|<object|<link|<meta|<math|javascript:|onerror|onload|onclick|onmouseover|expression\(|url\(|data:|="\/\/|="http:\/\//i.test(r), 'no se sanea: ' + m + ' -> ' + r);
}
assert.strictEqual(sano('<script>alert(1)</script>hola'), 'hola');
assert.ok(!sano('<a href="https://x" onmouseover="alert(1)">x</a>').includes('onmouseover'));
assert.ok(sano('<<b>b>').indexOf('<<') === -1, 'un < suelto se escapa');
assert.strictEqual(sano(sano('<a href="https://tuid.ar/x?a=1&b=2">z</a><p style="color:red">q</p>')), sano('<a href="https://tuid.ar/x?a=1&b=2">z</a><p style="color:red">q</p>'), 'sanear es idempotente');
assert.strictEqual(sano(null), '');

// --- imagenes http:// de los correos viejos pasan a https://; las etiquetas se balancean
assert.strictEqual(sano('<img src="http://tuid.com.ar/images/a.png" width="30">'), '<img src="https://tuid.com.ar/images/a.png" width="30" />');
assert.strictEqual(sano('<table><tr><td><p>uno</p>'), '<table><tr><td><p>uno</p></td></tr></table>');
assert.strictEqual(sano('</div><p>x</p></td>'), '<p>x</p>');

// --- variables con HTML: el valor se escapa, la plantilla se respeta
let r = t.renderHtml('<p>Hola <strong>{{nombre}}</strong> CUIL {{cuil}}</p>', { nombre: '<img src=x onerror=alert(1)>Ana', cuil: '20-1-2' });
assert.ok(!/<img/.test(r.html) && r.html.includes('&lt;img'), r.html);
assert.deepStrictEqual(r.desconocidas, []);
r = t.renderHtml('<a href="{{nombre}}">x</a>', { nombre: 'javascript:alert(1)' });
assert.ok(!/href/.test(r.html), 'un valor no puede dar un enlace peligroso: ' + r.html);
r = t.renderHtml('<a href="mailto:{{correo_cliente}}">{{correo_cliente}}</a>', { correo_cliente: 'a@b.com' });
assert.strictEqual(r.html, '<a href="mailto:a@b.com">a@b.com</a>');
r = t.renderHtml('<a href="{{enlace_foto}}">foto</a> {{inventada}}', { enlace_foto: 'https://api.autenticartuid.com/vida/f/Abc123' });
assert.ok(r.html.includes('href="https://api.autenticartuid.com/vida/f/Abc123"') && r.desconocidas[0] === 'inventada');
assert.ok(sano('<a href="{{enlace_foto}}">f</a>').includes('href="{{enlace_foto}}"'), 'una variable sola en href se conserva al guardar');

// --- texto plano y documento
assert.strictEqual(h.aTextoPlano('<p>Hola&nbsp;<b>Ana</b></p><p>Chau<br>dos</p>'), 'Hola Ana\n\nChau\ndos');
const d = h.documento('<p>x</p>', 'Asunto <b>');
assert.ok(d.includes('<title>Asunto b</title>') && d.includes('<p>x</p></body></html>'));

// --- Contacto
assert.strictEqual(claveDe('auto_response/103'), 'CONTACTO_103');
assert.strictEqual(claveDe('auto_response/109A'), 'CONTACTO_109A');
assert.strictEqual(claveDe('contact'), null);
assert.strictEqual(claveDe('auto_response/../x'), null);
const dd = datosDe({ nombre: 'ANA', cuil: '20105982276', fecha: '2026-11-13', correo_cliente: 'a@b.c' });
assert.strictEqual(dd.cuil, '20-10598227-6');
assert.strictEqual(dd.fecha, '13/11/2026');
assert.strictEqual(dd.telefono_cliente, '');

// --- los textos generados desde los archivos conservan el contenido y no traen codigo
const fs = require('fs');
const sql = fs.readFileSync(__dirname + '/../scripts/sql/textos_contacto.sql', 'utf8');
assert.strictEqual((sql.match(/\('CONTACTO_/g) || []).length, 35);
assert.ok(!/<script|<%|onerror|javascript:/i.test(sql), 'el SQL generado no trae codigo');
assert.ok(/CONTACTO_109E/.test(sql) && !/\{\{(?!nombre|cuil|fecha|correo_cliente|telefono_cliente)[a-z_]+\}\}/.test(sql));
console.log('ok  htmlCorreo / textos html / contacto');
