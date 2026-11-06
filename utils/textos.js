// Utilidades del Modulo de Textos: reemplazo de variables y enlaces de WhatsApp / correo. Funciones puras (sin base de datos).

const VARIABLES = ['nombre', 'apellido', 'nombre_completo', 'cuil', 'empresa', 'fecha', 'auditor'];

// Datos de ejemplo para la vista previa en el panel
const EJEMPLO = {
    nombre: 'Ana María',
    apellido: 'Prueba',
    nombre_completo: 'Ana María Prueba',
    cuil: '27-11111111-7',
    empresa: 'BANCO DE EJEMPLO',
    fecha: '06/11/2026',
    auditor: 'auditor@tuid.test'
};

// Reemplaza {{variable}} por su valor. Es un reemplazo de texto: no se ejecuta nada de lo que haya en la plantilla.
// Las variables desconocidas se dejan como estan (para que se vea el error en la vista previa) y se informan en `desconocidas`.
function render(plantilla, datos) {
    const desconocidas = [];
    const texto = String(plantilla == null ? '' : plantilla).replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (todo, nombre) => {
        const clave = nombre.toLowerCase();
        if (!VARIABLES.includes(clave)) {
            if (!desconocidas.includes(nombre)) desconocidas.push(nombre);
            return todo;
        }
        const valor = datos && datos[clave];
        return valor == null ? '' : String(valor);
    });
    return { texto, desconocidas };
}

// Numero para wa.me: solo digitos, con codigo de pais. Supuesto para Argentina: sin 54 se agrega 54 y el 9 de los celulares.
// Devuelve null si no hay un numero utilizable.
function telefonoWhatsApp(telefono) {
    let d = String(telefono == null ? '' : telefono).replace(/\D/g, '');
    if (d.length < 8) return null;
    d = d.replace(/^00/, '').replace(/^0+/, '');
    if (!d.startsWith('54')) d = (d.startsWith('9') ? '54' : '549') + d;
    else if (d.startsWith('54') && !d.startsWith('549') && d.length === 12) d = '549' + d.slice(2);
    return d;
}

function urlWhatsApp(telefono, texto) {
    const numero = telefonoWhatsApp(telefono);
    if (!numero) return null;
    return 'https://wa.me/' + numero + '?text=' + encodeURIComponent(texto).replace(/%20/g, '%20');
}

function emailValido(email) {
    return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function urlMailto(email, asunto, cuerpo) {
    if (!emailValido(email)) return null;
    // los saltos de linea van como %0D%0A en mailto
    const cuerpoCodificado = encodeURIComponent(String(cuerpo || '')).replace(/%0A/g, '%0D%0A');
    return 'mailto:' + email.trim() + '?subject=' + encodeURIComponent(String(asunto || '')) + '&body=' + cuerpoCodificado;
}

function formatoFecha(valor) {
    if (!valor) return '';
    const pad = (n) => String(n).padStart(2, '0');
    const d = valor instanceof Date ? valor : new Date(valor);
    if (isNaN(d.getTime())) return String(valor);
    return pad(d.getUTCDate()) + '/' + pad(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear();
}

function formatoCuil(cuil) {
    const d = String(cuil == null ? '' : cuil).replace(/\D/g, '');
    return d.length === 11 ? d.slice(0, 2) + '-' + d.slice(2, 10) + '-' + d.slice(10) : String(cuil || '');
}

// "ANA MARIA" -> "Ana Maria": los nombres suelen venir en mayusculas en la base
function capitalizar(texto) {
    return String(texto || '').toLowerCase().replace(/(^|\s)([a-záéíóúüñ])/g, (m, a, b) => a + b.toUpperCase());
}

module.exports = { VARIABLES, EJEMPLO, render, telefonoWhatsApp, urlWhatsApp, urlMailto, emailValido, formatoFecha, formatoCuil, capitalizar };
