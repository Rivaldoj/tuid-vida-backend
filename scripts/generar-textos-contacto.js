// Genera scripts/sql/textos_contacto.sql: carga en Textos (canal email, formato html) las respuestas automaticas de Contacto que hoy son
// archivos (html/mails/auto_response/*.ejs). Uso: node scripts/generar-textos-contacto.js
// Las variables <%= nombre %> pasan a {{nombre}}. INSERT IGNORE: no pisa un texto que ya se haya editado desde el panel.
const fs = require('fs');
const path = require('path');
const htmlCorreo = require('../utils/htmlCorreo');

const DIR = path.join(__dirname, '../html/mails/auto_response');
const MOTIVOS = {
    100: 'Solicito Ayuda modo de uso', 101: 'Confirmar Registración o Fe de Vida', 102: 'Quiero saber si mi Fe de Vida está Vigente',
    103: 'Tengo dificultades con el Escaneo', 104: 'Envío de Código de validación', 105: 'Solicito Certificado de Fe de Vida',
    106: 'Cuándo debo Renovar mi Fe de Vida', 107: 'Otorgar permisos para TuID Vida', 108: 'No puedo realizar Fe de Vida',
    109: 'No me acreditaron el beneficio previsional', 110: 'Cambio de Dispositivo'
};
const LETRAS = { A: 'falta dar Fe de Vida', B: 'Fe de Vida satisfactoria', C: 'usuario no registrado', D: 'entidad no adherida', E: 'fuera de término' };
const VARIABLES = ['nombre', 'cuil', 'fecha', 'correo_cliente', 'telefono_cliente'];

const q = (v) => "'" + String(v).split(String.fromCharCode(92)).join(String.fromCharCode(92, 92)).split("'").join("''") + "'";
let sql = '-- GENERADO por scripts/generar-textos-contacto.js: respuestas automaticas de Contacto (correo, formato html). Se pueden editar desde el panel (Textos).\n' +
    '-- Si el texto esta desactivado o no existe, el sistema usa el archivo html/mails/auto_response/<codigo>.ejs.\n' +
    'INSERT IGNORE INTO textos (clave, canal, formato, nombre, asunto, cuerpo, actualizado_por, actualizado_en) VALUES\n';
const filas = [];
for (const archivo of fs.readdirSync(DIR).sort()) {
    const m = archivo.match(/^(\d{3})([A-E]?)\.ejs$/);
    if (!m) continue;
    let ejs = fs.readFileSync(path.join(DIR, archivo), 'utf8');
    // href="<% correo_cliente %>" (no imprimia nada) -> mailto
    ejs = ejs.replace(/href="<%\s*correo_cliente\s*%>"/g, 'href="mailto:{{correo_cliente}}"');
    ejs = ejs.replace(/<%=\s*([a-z_]+)\s*%>/g, (t, v) => {
        if (!VARIABLES.includes(v)) throw new Error(archivo + ': variable no prevista ' + v);
        return '{{' + v + '}}';
    });
    if (/<%/.test(ejs)) throw new Error(archivo + ': quedan etiquetas EJS sin convertir');
    // La firma y los datos de contacto del final (desde "Saludos") ya no van en cada texto: los pone el pie compartido PIE_CORREO.
    const ultimaFirma = (() => { let i = -1, m; const re = /<p[^>]*>\s*Saludos/gi; while ((m = re.exec(ejs))) i = m.index; return i; })();
    if (ultimaFirma < 0) throw new Error(archivo + ': no se encontro la firma');
    const cuerpo = htmlCorreo.sanear(ejs.slice(0, ultimaFirma));
    const nombre = 'Respuesta a Contacto ' + m[1] + (m[2] ? m[2] : '') + ' - ' + MOTIVOS[Number(m[1])] + (m[2] ? ' (' + LETRAS[m[2]] + ')' : '');
    filas.push(`(${q('CONTACTO_' + m[1] + m[2])}, 'email', 'html', ${q(nombre)}, NULL, ${q(cuerpo)}, 'migracion', NOW())`);
}
sql += filas.join(',\n') + ';\n';
fs.writeFileSync(path.join(__dirname, 'sql/textos_contacto.sql'), sql);
console.log('textos de contacto generados:', filas.length);
