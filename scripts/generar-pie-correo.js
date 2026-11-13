// Genera scripts/sql/textos_pie.sql: el Pie de pagina compartido de los correos (clave PIE_CORREO), a partir del diseno en HTML.
// Uso: node scripts/generar-pie-correo.js "C:\TUID\Diseño\Pantallas\Pie_de_pagina_TuID.html"
// Los estilos de clase (<style>) no sobreviven en los correos, asi que se pasan a estilos en linea; los enlaces sin esquema se corrigen.
const fs = require('fs');
const path = require('path');
const htmlCorreo = require('../utils/htmlCorreo');

const origen = process.argv[2];
if (!origen) { console.error('Falta la ruta del diseno HTML'); process.exit(1); }
let html = fs.readFileSync(origen, 'utf8');

// solo la tabla de contenido (sin los comentarios condicionales de Outlook)
html = html.replace(/<!--\[if mso\]>[\s\S]*?<!\[endif\]-->/gi, '');
const tabla = html.match(/<table role="presentation" style="width:94%[\s\S]*<\/table>(?=\s*<!--|\s*<\/td>)/i);
if (!tabla) throw new Error('No se encontro la tabla del pie en el diseno');
let t = tabla[0];

const ESTILO3 = 'font-family:Verdana,Arial,Helvetica,sans-serif;color:#333333;font-size:16px;line-height:normal;';
const ESTILO4 = 'color:#333333;text-decoration:none;';
t = t.replace(/<(\w+)([^>]*?)\sclass="Estilo3"([^>]*)>/g, (m, tag, a, b) => {
    const resto = (a + b).replace(/\sstyle="([^"]*)"/, (mm, st) => ' style="' + ESTILO3 + st + '"');
    return /style=/.test(resto) ? '<' + tag + resto + '>' : '<' + tag + resto + ' style="' + ESTILO3 + '">';
});
t = t.replace(/<a([^>]*?)\sclass="Estilo4"([^>]*)>/g, (m, a, b) => '<a' + a + ' style="' + ESTILO4 + '"' + b + '>');
// enlaces sin esquema
t = t.replace(/href="soporte@tuid\.ar"/g, 'href="mailto:soporte@tuid.ar"').replace(/href="www\.tuid\.ar"/g, 'href="https://www.tuid.ar"');
// enlace vacio (el icono de WhatsApp no esta en el diseno)
t = t.replace(/<td width="30" height="30" align="center"><div class="imgpop"><a target="_blank" href="[^"]*"><\/a><\/div><\/td>/g, '<td width="30" height="30"></td>');
// enlace de www.tuid.ar sin texto (en el diseno esta vacio): se quita; el sitio queda en la linea de abajo
t = t.replace(/<a href="https:\/\/www\.tuid\.ar"[^>]*><\/a>/, '');

const cuerpo = htmlCorreo.sanear(t);
const q = (v) => "'" + String(v).split(String.fromCharCode(92)).join(String.fromCharCode(92, 92)).split("'").join("''") + "'";
const sql = '-- GENERADO por scripts/generar-pie-correo.js: pie de pagina compartido de los correos (firma, contacto, redes, ley de datos). Se edita desde el panel (Textos).\n' +
    '-- El sistema lo agrega al final de las respuestas a Contacto y de la certificacion observada. Si se desactiva, esos correos salen sin pie.\n' +
    'INSERT IGNORE INTO textos (clave, canal, formato, nombre, asunto, cuerpo, actualizado_por, actualizado_en) VALUES\n' +
    `('PIE_CORREO', 'email', 'html', ${q('Pie de página de los correos (firma, contacto y redes)')}, NULL, ${q(cuerpo)}, 'migracion', NOW());\n`;
fs.writeFileSync(path.join(__dirname, 'sql/textos_pie.sql'), sql);
fs.writeFileSync(path.join(__dirname, 'sql/textos_pie.vista.html'), htmlCorreo.documento(cuerpo, 'Pie de página'));
console.log('pie generado:', cuerpo.length, 'caracteres');
