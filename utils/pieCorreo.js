// Pie de pagina compartido de los correos: el texto PIE_CORREO del Modulo de Textos (canal email, formato html).
// Si no existe, esta desactivado o la base falla, devuelve '' y el correo sale sin pie (o con el pie fijo de su plantilla).
const textos = require('./textos');

const CLAVE = 'PIE_CORREO';

async function obtener(db, datos) {
    try {
        const [t] = await db.sync_query("SELECT cuerpo, formato FROM textos WHERE clave = ? AND canal = 'email' AND activo = 1", [CLAVE]);
        if (!t || !t.cuerpo) return '';
        return t.formato === 'html' ? textos.renderHtml(t.cuerpo, datos || {}).html : textos.aParrafosHtml(textos.render(t.cuerpo, datos || {}).texto);
    } catch (err) {
        console.log('Pie de correo: no se pudo leer, el correo sale sin pie', err && err.message);
        return '';
    }
}

module.exports = { obtener, CLAVE };
