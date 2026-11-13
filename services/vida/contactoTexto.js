// Respuesta automatica de Contacto con el texto editable del panel (Textos, canal email, clave CONTACTO_<codigo><letra>, por ejemplo CONTACTO_103 o CONTACTO_109A).
// Si el texto no existe, esta desactivado o algo falla, `enviar` devuelve false y quien llama manda el archivo de siempre (html/mails/auto_response):
// asi una falla del panel o de la base nunca deja a la persona sin respuesta.
const mailing = require('../../utils/mail');
const textos = require('../../utils/textos');
const htmlCorreo = require('../../utils/htmlCorreo');
const pieCorreo = require('../../utils/pieCorreo');

// "auto_response/103" -> "CONTACTO_103"
function claveDe(templateName) {
    const m = String(templateName || '').match(/auto_response\/([0-9]{3}[A-Z]?)$/);
    return m ? 'CONTACTO_' + m[1] : null;
}

function datosDe(body) {
    const nombre = String(body.nombre || '');
    return {
        nombre,
        apellido: '',
        nombre_completo: nombre,
        cuil: textos.formatoCuil(body.cuil),
        empresa: body.empresa || '',
        fecha: body.fecha ? textos.formatoFecha(body.fecha) : '',
        correo_cliente: body.correo_cliente || '',
        telefono_cliente: body.telefono_cliente || ''
    };
}

// `body.title` es el asunto que arma el sistema (con el numero de ticket); el asunto del texto del panel no se usa en estas respuestas.
async function enviar(templateName, body, desde) {
    try {
        const clave = claveDe(templateName);
        if (!clave) return false;
        const [t] = await VIDA_DB.sync_query("SELECT cuerpo, formato FROM textos WHERE clave = ? AND canal = 'email' AND activo = 1", [clave]);
        if (!t || !t.cuerpo) return false;
        const datos = datosDe(body);
        const contenido = t.formato === 'html' ? textos.renderHtml(t.cuerpo, datos).html : textos.aParrafosHtml(textos.render(t.cuerpo, datos).texto);
        if (!contenido) return false;
        const pie = await pieCorreo.obtener(VIDA_DB, datos);
        mailing.sendHtml(htmlCorreo.documento(contenido + pie, body.title), body.email, body.title, desde, null);
        return true;
    } catch (err) {
        console.log('Contacto: no se pudo usar el texto del panel, se usa el archivo', err && err.message);
        return false;
    }
}

module.exports = { enviar, claveDe, datosDe };
