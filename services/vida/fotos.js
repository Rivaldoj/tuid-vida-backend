// Pagina publica "Su foto de la certificacion": la persona recibe un enlace por WhatsApp o correo, confirma los ultimos 3 digitos de su
// CUIL y ve la foto de la certificacion que Auditoria objeto. El enlace vence y se bloquea tras varios intentos fallidos.
const express = require('express');
const fotos = require('../../utils/fotos');
const textos = require('../../utils/textos');
const { createLimiter } = require('../../utils/rateLimit');

const LOGO = 'https://tuid.ar/images/logos/Logo-vida30.png';
const WHATSAPP_SOPORTE = 'https://api.whatsapp.com/send?phone=5491123443283&text=' + encodeURIComponent('Consulta por mi foto de TuID Vida');
const SEGUNDOS_FOTO = 600; // la foto firmada de S3 dura 10 minutos: alcanza para verla y no queda un enlace permanente

function pagina(titulo, contenido) {
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${titulo}</title>
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow">
<style>body{font-family:Arial,Helvetica,sans-serif;background:#f2f6f7;margin:0;color:#2b2a2a}
.caja{max-width:520px;margin:0 auto;padding:24px 18px}.logo{text-align:center;margin-bottom:14px}.logo img{width:170px;height:auto}
.tarjeta{background:#fff;border-radius:10px;padding:22px;box-shadow:0 1px 4px rgba(0,0,0,.15)}
h1{font-size:22px;color:#006e7b;margin:0 0 12px}p{font-size:18px;line-height:1.45}
input[type=text]{font-size:26px;letter-spacing:6px;text-align:center;width:120px;padding:10px;border:2px solid #00abc0;border-radius:6px}
button{font-size:20px;font-weight:bold;background:#00abc0;color:#fff;border:0;border-radius:6px;padding:14px 22px;margin-top:14px;width:100%}
.error{color:#c62828}.foto{width:100%;height:auto;border-radius:8px;margin:10px 0}
.pie{font-size:15px;color:#555;text-align:center;margin-top:16px}a{color:#006e7b}</style></head>
<body><div class="caja"><div class="logo"><img src="${LOGO}" alt="TuID Vida"></div><div class="tarjeta">${contenido}</div>
<p class="pie">Si tiene dudas, escriba a Soporte por <a href="${WHATSAPP_SOPORTE}">WhatsApp</a>. Nunca le pediremos claves ni datos bancarios.</p></div></body></html>`;
}

const MENSAJES_ERROR = {
    invalido: ['Enlace no válido', 'Este enlace no es válido. Verifique que lo haya copiado completo.'],
    vencido: ['Enlace vencido', 'Este enlace venció. Escríbanos por WhatsApp y le enviamos uno nuevo.'],
    bloqueado: ['Enlace bloqueado', 'Por seguridad, este enlace se bloqueó por demasiados intentos. Escríbanos por WhatsApp y le enviamos uno nuevo.']
};

function formulario(codigo, error) {
    return pagina('Su foto de TuID Vida',
        `<h1>Su foto de TuID Vida</h1><p>Para proteger sus datos, confirme que es usted: ingrese los <strong>últimos 3 números de su CUIL</strong>.</p>
${error ? `<p class="error">${error}</p>` : ''}
<form method="post" action="/vida/f/${codigo}" autocomplete="off"><input type="text" name="cuil3" inputmode="numeric" maxlength="3" autofocus required>
<button type="submit">Ver mi foto</button></form>`);
}

// db: { sync_query }, firmarFoto(clave, segundos) -> URL firmada, requiereCuil: pedir los ultimos 3 digitos del CUIL (por defecto NO: el telefono se valida por SMS)
module.exports = function crearRouter({ db, firmarFoto, requiereCuil = false }) {
    const router = express.Router();
    const limitador = createLimiter({ max: 40, windowMs: 10 * 60 * 1000 });
    router.use(express.urlencoded({ extended: false, limit: '1kb' }));
    router.use((req, res, next) => {
        res.set({
            'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer',
            'Content-Security-Policy': "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; form-action 'self'",
            'Content-Type': 'text/html; charset=utf-8'
        });
        next();
    });

    function error(res, tipo) {
        const [titulo, texto] = MENSAJES_ERROR[tipo] || MENSAJES_ERROR.invalido;
        return res.status(tipo === 'invalido' ? 404 : 410).send(pagina(titulo, `<h1>${titulo}</h1><p>${texto}</p>`));
    }

    // Muestra la foto de la certificacion del enlace (la foto firmada de S3 dura 10 minutos)
    async function mostrarFoto(res, enlace) {
        const [dato] = await db.sync_query(
            `SELECT u.dni, u.sexo, u.cuil, a.fecha FROM auditoria a JOIN usuario u ON u.id_usuario = a.id_usuario WHERE a.id_validacion = ?`,
            [enlace.id_validacion]);
        if (!dato) return error(res, 'invalido');
        await fotos.registrarAcceso(db, enlace.id);
        const url = firmarFoto(fotos.claveFotoCertificacion(dato.dni, dato.sexo), SEGUNDOS_FOTO);
        const fecha = textos.formatoFecha(dato.fecha);
        return res.send(pagina('Su foto de TuID Vida',
            `<h1>Esta es su foto</h1><p>Es la foto de su certificación de Fe de Vida del <strong>${fecha}</strong>. La recibió porque Auditoría necesita que la repita.</p>
<img class="foto" src="${url}" alt="Su foto de la certificación">
<p>Si la reconoce, entre a la aplicación y repita su Fe de Vida en un lugar con buena luz, sin anteojos y solo en la imagen. <strong>No es un fraude.</strong></p>
<p>Si <strong>no es usted</strong>, escríbanos de inmediato por WhatsApp.</p>`));
    }

    router.get('/:codigo', async (req, res) => {
        try {
            const r = await fotos.buscarEnlace(db, req.params.codigo);
            if (r.error) return error(res, r.error);
            // El telefono se valida por SMS al registrarse: por defecto la persona ve su foto directamente (el enlace es largo, no adivinable y vence)
            if (!requiereCuil) return await mostrarFoto(res, r.enlace);
            return res.send(formulario(req.params.codigo, null));
        } catch (err) {
            console.log(err);
            return res.status(500).send(pagina('Error', '<h1>No pudimos mostrar la página</h1><p>Intente nuevamente en unos minutos.</p>'));
        }
    });

    router.post('/:codigo', async (req, res) => {
        try {
            if (!limitador.allow(String(req.ip || 'desconocido'))) {
                return res.status(429).send(pagina('Demasiados intentos', '<h1>Demasiados intentos</h1><p>Espere unos minutos e inténtelo nuevamente.</p>'));
            }
            const r = await fotos.buscarEnlace(db, req.params.codigo);
            if (r.error) return error(res, r.error);
            if (!requiereCuil) return await mostrarFoto(res, r.enlace);   // sin confirmacion de CUIL no hay nada que enviar por formulario
            const [dato] = await db.sync_query(
                `SELECT u.cuil FROM auditoria a JOIN usuario u ON u.id_usuario = a.id_usuario WHERE a.id_validacion = ?`,
                [r.enlace.id_validacion]);
            if (!dato) return error(res, 'invalido');
            if (!fotos.confirmaCuil(dato.cuil, req.body && req.body.cuil3, 3)) {
                await fotos.registrarFallo(db, r.enlace.id);
                const quedan = fotos.MAX_INTENTOS - (r.enlace.intentos_fallidos + 1);
                if (quedan <= 0) return error(res, 'bloqueado');
                return res.status(401).send(formulario(req.params.codigo, `Los números no coinciden. Le quedan ${quedan} intentos.`));
            }
            return await mostrarFoto(res, r.enlace);
        } catch (err) {
            console.log(err);
            return res.status(500).send(pagina('Error', '<h1>No pudimos mostrar la foto</h1><p>Intente nuevamente en unos minutos.</p>'));
        }
    });

    return router;
};
