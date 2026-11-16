// Correo de recuperacion de clave del panel con el texto editable (Modulo de Textos, canal email, clave RECUPERAR_CLAVE_PANEL) y el pie compartido (PIE_CORREO).
// `armar` devuelve { html, asunto } o null si el texto no existe, esta desactivado o algo falla: asi quien llama manda el mensaje fijo de siempre
// y una falla del panel o de la base nunca deja a la persona sin su codigo.
const textos = require('../../utils/textos');
const htmlCorreo = require('../../utils/htmlCorreo');
const pieCorreo = require('../../utils/pieCorreo');

const CLAVE = 'RECUPERAR_CLAVE_PANEL';
const ASUNTO_POR_DEFECTO = 'Confirmacion TuID';

// db: { sync_query }; datos: { token, nombre?, nombre_completo?, empresa? }
async function armar(db, datos) {
    try {
        const [t] = await db.sync_query("SELECT cuerpo, formato, asunto FROM textos WHERE clave = ? AND canal = 'email' AND activo = 1", [CLAVE]);
        if (!t || !t.cuerpo) return null;
        const contenido = t.formato === 'html' ? textos.renderHtml(t.cuerpo, datos).html : textos.aParrafosHtml(textos.render(t.cuerpo, datos).texto);
        if (!contenido || !String(datos && datos.token || '')) return null;
        const asunto = (t.asunto && textos.render(t.asunto, datos).texto.trim()) || ASUNTO_POR_DEFECTO;
        const pie = await pieCorreo.obtener(db, datos);
        return { html: htmlCorreo.documento(contenido + pie, asunto), asunto };
    } catch (err) {
        console.log('Recuperar clave: no se pudo usar el texto del panel, se usa el mensaje fijo', err && err.message);
        return null;
    }
}

module.exports = { armar, CLAVE, ASUNTO_POR_DEFECTO };
