// Saneado del HTML de los correos que el Administrador edita desde el panel (Textos con formato "html").
// No usa librerias: recorre las etiquetas y deja solo las permitidas, con atributos permitidos y direcciones https / mailto / tel.
// Todo lo demas (script, estilos externos, formularios, eventos on*, javascript:, etc.) se descarta. Funcion pura.

const ETIQUETAS = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'small', 'span', 'div', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'table', 'thead', 'tbody', 'tr', 'td', 'th', 'img', 'hr', 'blockquote', 'center', 'font', 'sup', 'sub']);
const VACIAS = new Set(['br', 'img', 'hr']);
// Se descartan junto con todo su contenido
const CON_CONTENIDO_FUERA = ['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'head', 'title', 'form', 'textarea', 'select', 'svg', 'math', 'applet', 'frameset', 'frame', 'audio', 'video', 'canvas', 'button', 'meta', 'link', 'base'];
const ATRIBUTOS = new Set(['style', 'align', 'valign', 'width', 'height', 'border', 'cellpadding', 'cellspacing', 'bgcolor', 'colspan', 'rowspan', 'start', 'type',
    'alt', 'title', 'color', 'face', 'size', 'target', 'dir', 'lang']);
const DE_ENLACE = /^(https?:\/\/|mailto:|tel:|\{\{\s*[a-zA-Z_]+\s*\}\})/i;
const DE_IMAGEN = /^(https:\/\/|\{\{\s*[a-zA-Z_]+\s*\}\})/i;

function escaparAtributo(v) {
    return String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function estiloSeguro(v) {
    const s = String(v);
    if (/[\\&<>]|expression|javascript|vbscript|url\s*\(|@import|behavior|binding|image-set/i.test(s)) return null;
    return s.replace(/\s+/g, ' ').trim();
}

function direccionSegura(v, patron) {
    // se quitan espacios y caracteres de control que algunos navegadores ignoran dentro del esquema ("java\tscript:")
    const limpia = String(v).replace(/[\u0000- \u007f-\u009f]/g, '');
    if (/&#|&colon;|&newline;|&tab;/i.test(limpia)) return null;
    return patron.test(limpia) ? String(v).trim() : null;
}

// Los valores se guardan escapados (&amp; &quot; ...): se desescapan una sola vez para volver a escaparlos al armar la etiqueta
function desescapar(v) {
    return String(v).replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

function leerAtributos(texto) {
    const out = [];
    const re = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    let m;
    while ((m = re.exec(texto))) {
        out.push([m[1].toLowerCase(), desescapar(m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : '')))]);
    }
    return out;
}

function armarEtiqueta(nombre, texto) {
    let atributos = '';
    let conTargetBlank = false;
    for (const [clave, valor] of leerAtributos(texto)) {
        if (clave.startsWith('on')) continue;
        if (nombre === 'a' && clave === 'href') {
            const d = direccionSegura(valor, DE_ENLACE);
            if (d) atributos += ` href="${escaparAtributo(d)}"`;
        } else if (nombre === 'img' && clave === 'src') {
            // las imagenes de los correos viejos vienen con http://: se pasan a https:// (los sitios de TuID lo sirven)
            const d = direccionSegura(String(valor).replace(/^\s*http:\/\//i, 'https://'), DE_IMAGEN);
            if (d) atributos += ` src="${escaparAtributo(d)}"`;
        } else if (clave === 'style') {
            const e = estiloSeguro(valor);
            if (e) atributos += ` style="${escaparAtributo(e)}"`;
        } else if (clave === 'target') {
            if (nombre === 'a' && /^_blank$/i.test(valor)) conTargetBlank = true;
        } else if (ATRIBUTOS.has(clave)) {
            atributos += ` ${clave}="${escaparAtributo(valor)}"`;
        }
    }
    if (conTargetBlank) atributos += ' target="_blank" rel="noopener noreferrer"';
    return `<${nombre}${atributos}${VACIAS.has(nombre) ? ' /' : ''}>`;
}

// Devuelve solo el contenido del <body> (si hay) ya saneado.
function sanear(html) {
    let s = String(html == null ? '' : html);
    s = s.replace(/<!--[\s\S]*?(-->|$)/g, '').replace(/<!\[CDATA\[[\s\S]*?(\]\]>|$)/g, '').replace(/<![^>]*>/g, '').replace(/<\?[\s\S]*?(\?>|$)/g, '');
    for (const t of CON_CONTENIDO_FUERA) {
        // con cierre; y, si el cierre falta, hasta el final del texto
        s = s.replace(new RegExp(`<${t}\\b[\\s\\S]*?<\\/${t}\\s*>`, 'gi'), '').replace(new RegExp(`<${t}\\b[\\s\\S]*$`, 'gi'), '');
    }
    const cuerpo = s.match(/<body\b[^>]*>([\s\S]*?)(<\/body\s*>|$)/i);
    if (cuerpo) s = cuerpo[1];

    const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
    let salida = '';
    let ultimo = 0;
    let m;
    const texto = (t) => t.replace(/</g, '&lt;');
    // Se balancean las etiquetas: un cierre sin apertura se descarta y las que quedan abiertas se cierran al final,
    // asi un texto cortado o mal escrito no rompe el resto del correo.
    const abiertas = [];
    while ((m = re.exec(s))) {
        salida += texto(s.slice(ultimo, m.index));
        ultimo = re.lastIndex;
        const nombre = m[2].toLowerCase();
        if (!ETIQUETAS.has(nombre)) continue;
        if (m[1]) {
            if (VACIAS.has(nombre)) continue;
            const i = abiertas.lastIndexOf(nombre);
            if (i < 0) continue;
            while (abiertas.length > i) salida += `</${abiertas.pop()}>`;
            continue;
        }
        salida += armarEtiqueta(nombre, m[3]);
        if (!VACIAS.has(nombre)) abiertas.push(nombre);
    }
    salida += texto(s.slice(ultimo));
    while (abiertas.length) salida += `</${abiertas.pop()}>`;
    return salida.trim();
}

// HTML -> texto plano (para el cuerpo de un mailto o la lista del panel)
function aTextoPlano(html) {
    return String(html == null ? '' : html)
        .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h[1-6]|tr|blockquote)\s*>/gi, '\n\n')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
        .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Envuelve el contenido en un documento HTML minimo para el correo
function documento(contenido, titulo) {
    const t = String(titulo || '').replace(/[<>&"]/g, '');
    return '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + t + '</title></head>' +
        '<body style="margin:0;padding:16px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#2b2a2a;">' + contenido + '</body></html>';
}

module.exports = { sanear, aTextoPlano, documento };
