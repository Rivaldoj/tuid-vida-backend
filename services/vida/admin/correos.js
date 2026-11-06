// Envio, desde la ficha de Auditoria, del correo HTML con el logo y la foto de la certificacion objetada (mismo mecanismo y estilo que
// el correo de "fraude" del Control de Registraciones). El texto sale del Modulo de Textos (canal email).
const path = require('path');
const ejs = require('ejs');
const textos = require('../../../utils/textos');
const fotos = require('../../../utils/fotos');

const PLANTILLA = path.join(__dirname, '../../../html/mails/certificacion_observada.ejs');
const SEGUNDOS_FOTO_CORREO = fotos.DIAS_POR_DEFECTO * 24 * 3600; // la foto del correo vence junto con los enlaces (tope de S3: 7 dias)

// Arma el HTML del correo. Todo lo que viene de la base se escapa; `fotoUrl` solo se acepta si es https.
async function armarCorreo({ titulo, nombre, cuil, fecha, cuerpoTexto, fotoUrl }) {
    const foto = typeof fotoUrl === 'string' && /^https:\/\//.test(fotoUrl) ? fotoUrl : '';
    return ejs.renderFile(PLANTILLA, {
        title: titulo, nombre, cuil, fecha, fotoUrl: foto, cuerpoHtml: textos.aParrafosHtml(cuerpoTexto)
    }, { async: false });
}

// POST /auth/auditoria/enviar-correo { id_validacion, clave }
// deps: { db, firmarFoto(clave, segundos), enviar(html, asunto, para, desde, cc) } (se inyectan para poder probarlo sin AWS)
module.exports.crearEnviarCorreo = function (deps) {
    return async function enviarCorreo(req, res) {
        const responder = (error, data) => res.status(200).json({ error, data });
        const id = parseInt(req.body && req.body.id_validacion, 10);
        const clave = String((req.body && req.body.clave) || '').trim().toUpperCase();
        if (!id || !clave) return responder(1, 'Faltan datos: id_validacion y clave del texto');
        try {
            const [texto] = await deps.db.sync_query("SELECT * FROM textos WHERE clave = ? AND canal = 'email' AND activo = 1", [clave]);
            if (!texto) return responder(1, 'No se encontró ese texto de correo o está desactivado');
            const [p] = await deps.db.sync_query(
                `SELECT u.id_usuario, u.nombre, u.apellido, u.cuil, u.email, u.dni, u.sexo, u.extra, a.empresa, a.fecha, a.auditor
                 FROM auditoria a JOIN usuario u ON u.id_usuario = a.id_usuario WHERE a.id_validacion = ?`, [id]);
            if (!p) return responder(1, 'No se encontró la certificación');
            if (!textos.emailValido(p.email)) return responder(1, 'La persona no tiene un correo válido cargado');

            const nombre = textos.capitalizar(p.nombre);
            const apellido = textos.capitalizar(p.apellido);
            const fecha = textos.formatoFecha(p.fecha);
            const datos = {
                nombre, apellido, nombre_completo: `${nombre} ${apellido}`.trim(), cuil: textos.formatoCuil(p.cuil),
                empresa: p.empresa || '', fecha, auditor: String(p.auditor || '').replace(/^ALERTA:/, ''), enlace_foto: ''
            };
            // Si el texto usa {{enlace_foto}} tambien se crea el enlace con confirmacion de CUIL
            if (/\{\{\s*enlace_foto\s*\}\}/i.test(String(texto.cuerpo))) {
                const e = await fotos.crearEnlace(deps.db, { idValidacion: id, idUsuario: p.id_usuario, creadoPor: req.user && req.user.email });
                datos.enlace_foto = deps.urlBase() + '/vida/f/' + e.codigo;
            }
            const cuerpoTexto = textos.render(texto.cuerpo, datos).texto;
            const asunto = textos.render(texto.asunto || 'TuID Vida', datos).texto;
            const fotoUrl = deps.firmarFoto(fotos.claveFotoCertificacion(p.dni, p.sexo), SEGUNDOS_FOTO_CORREO);
            const html = await armarCorreo({ titulo: asunto, nombre, cuil: datos.cuil, fecha, cuerpoTexto, fotoUrl });

            await deps.enviar(html, asunto, p.email);
            const marca = ` Mail:observada(${fecha})`;
            await deps.db.sync_query('UPDATE usuario SET extra = CONCAT(IFNULL(extra, ""), ?) WHERE id_usuario = ?', [marca, p.id_usuario]);
            return responder(0, 'Correo enviado');
        } catch (err) {
            console.log(err);
            return responder(1, 'No se pudo enviar el correo');
        }
    };
};

module.exports.armarCorreo = armarCorreo;
