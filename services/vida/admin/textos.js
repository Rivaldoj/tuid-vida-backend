const textos = require('../../../utils/textos');
const fotos = require('../../../utils/fotos');
const htmlCorreo = require('../../../utils/htmlCorreo');

// Direccion publica del servidor para los enlaces que se mandan a las personas (configuracion `vida.publicUrl`)
function urlBasePublica() {
    try {
        const v = CONFIG.has('vida.publicUrl') ? String(CONFIG.get('vida.publicUrl')) : '';
        if (/^https:\/\/[^\s/]+$/.test(v.replace(/\/+$/, ''))) return v.replace(/\/+$/, '');
    } catch (e) { /* sin configuracion: se usa la direccion por defecto */ }
    return 'https://api.autenticartuid.com';
}
module.exports.urlBasePublica = urlBasePublica;

const CANALES = ['whatsapp', 'email', 'push'];
const FORMATOS = ['texto', 'html'];
const MAX_CUERPO = 4000;
const MAX_CUERPO_HTML = 50000;

function responder(res, error, data) {
    res.response = { error, data };
    return res.status(200).json(res.response);
}

// `actual` = texto guardado (al editar): de ahi salen el canal y el formato si el pedido no los trae
function validar(body, esAlta, actual) {
    const out = {};
    if (esAlta) {
        const clave = String(body.clave || '').trim().toUpperCase();
        if (!/^[A-Z0-9_]{3,60}$/.test(clave)) return { error: 'La clave debe tener entre 3 y 60 caracteres: letras, números o guion bajo.' };
        out.clave = clave;
        if (!CANALES.includes(body.canal)) return { error: 'El canal debe ser whatsapp, email o push.' };
        out.canal = body.canal;
    }
    const canal = esAlta ? out.canal : (actual && actual.canal);
    let formato = (actual && actual.formato) || 'texto';
    if (body.formato !== undefined) {
        if (!FORMATOS.includes(body.formato)) return { error: 'El formato debe ser texto o html.' };
        formato = body.formato;
        out.formato = formato;
    }
    if (formato === 'html' && canal !== 'email') return { error: 'El formato HTML solo se puede usar en los correos.' };
    if (body.nombre !== undefined || esAlta) {
        const nombre = String(body.nombre || '').trim();
        if (nombre.length < 3 || nombre.length > 100) return { error: 'El nombre debe tener entre 3 y 100 caracteres.' };
        out.nombre = nombre;
    }
    // si cambia el formato a HTML hay que volver a sanear el texto que ya estaba guardado
    if (body.cuerpo !== undefined || esAlta || (out.formato === 'html' && actual && actual.formato !== 'html')) {
        let cuerpo = String(body.cuerpo !== undefined ? body.cuerpo : (actual ? actual.cuerpo : '') || '').trim();
        if (cuerpo.length < 1) return { error: 'El texto no puede estar vacío.' };
        if (formato === 'html') {
            if (cuerpo.length > MAX_CUERPO_HTML) return { error: `El texto no puede superar los ${MAX_CUERPO_HTML} caracteres.` };
            cuerpo = htmlCorreo.sanear(cuerpo);
            if (!cuerpo) return { error: 'El HTML no tiene contenido permitido.' };
        } else if (cuerpo.length > MAX_CUERPO) return { error: `El texto no puede superar los ${MAX_CUERPO} caracteres.` };
        out.cuerpo = cuerpo;
    }
    if (body.asunto !== undefined || esAlta) {
        const asunto = body.asunto == null ? null : String(body.asunto).trim();
        if (asunto && asunto.length > 200) return { error: 'El asunto no puede superar los 200 caracteres.' };
        out.asunto = asunto || null;
    }
    if (body.activo !== undefined) out.activo = body.activo ? 1 : 0;
    return { valores: out };
}

// GET /auth/textos?canal=whatsapp&activos=1  -> lista (para el panel y para los combos)
module.exports.list = async (req, res) => {
    try {
        const where = [];
        const params = [];
        if (req.query.canal && CANALES.includes(req.query.canal)) { where.push('canal = ?'); params.push(req.query.canal); }
        if (req.query.activos == 1) where.push('activo = 1');
        const rows = await VIDA_DB.sync_query(
            `SELECT id, clave, canal, formato, nombre, asunto, cuerpo, activo, actualizado_por, actualizado_en FROM textos
             ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY canal, nombre`, params);
        return responder(res, 0, { textos: rows, variables: textos.VARIABLES });
    } catch (err) {
        console.log(err);
        return responder(res, 1, 'No se pudieron leer los textos');
    }
};

// POST /auth/textos  { clave, canal, nombre, asunto, cuerpo, formato? }
module.exports.create = async (req, res) => {
    const v = validar(req.body || {}, true);
    if (v.error) return responder(res, 1, v.error);
    try {
        const existe = await VIDA_DB.sync_query('SELECT id FROM textos WHERE clave = ?', [v.valores.clave]);
        if (existe.length > 0) return responder(res, 1, 'Ya existe un texto con esa clave.');
        const r = await VIDA_DB.sync_query(
            'INSERT INTO textos (clave, canal, formato, nombre, asunto, cuerpo, activo, actualizado_por, actualizado_en) VALUES (?, ?, ?, ?, ?, ?, 1, ?, NOW())',
            [v.valores.clave, v.valores.canal, v.valores.formato || 'texto', v.valores.nombre, v.valores.asunto, v.valores.cuerpo, req.user && req.user.email]);
        return responder(res, 0, { id: r.insertId });
    } catch (err) {
        console.log(err);
        return responder(res, 1, 'No se pudo guardar el texto');
    }
};

// PUT /auth/textos/:id  { nombre?, asunto?, cuerpo?, activo? }  -> guarda la version anterior en el historial
module.exports.update = async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!id) return responder(res, 1, 'Texto inválido');
    try {
        const [actual] = await VIDA_DB.sync_query('SELECT * FROM textos WHERE id = ?', [id]);
        if (!actual) return responder(res, 1, 'No se encontró el texto');
        const v = validar(req.body || {}, false, actual);
        if (v.error) return responder(res, 1, v.error);
        const campos = Object.keys(v.valores);
        if (campos.length === 0) return responder(res, 1, 'No hay nada para cambiar');
        const usuario = req.user && req.user.email;
        await VIDA_DB.sync_query(
            'INSERT INTO textos_historial (id_texto, formato, asunto, cuerpo, activo, usuario, fecha) VALUES (?, ?, ?, ?, ?, ?, NOW())',
            [id, actual.formato || 'texto', actual.asunto, actual.cuerpo, actual.activo, usuario || null]);
        const sets = campos.map((c) => `${c} = ?`).concat(['actualizado_por = ?', 'actualizado_en = NOW()']);
        await VIDA_DB.sync_query(`UPDATE textos SET ${sets.join(', ')} WHERE id = ?`, campos.map((c) => v.valores[c]).concat([usuario || null, id]));
        return responder(res, 0, 'Texto actualizado');
    } catch (err) {
        console.log(err);
        return responder(res, 1, 'No se pudo guardar el texto');
    }
};

// GET /auth/textos/:id/historial  -> versiones anteriores (la mas reciente primero)
module.exports.historial = async (req, res) => {
    try {
        const rows = await VIDA_DB.sync_query(
            'SELECT id, formato, asunto, cuerpo, activo, usuario, fecha FROM textos_historial WHERE id_texto = ? ORDER BY fecha DESC, id DESC LIMIT 50',
            [parseInt(req.params.id, 10) || 0]);
        return responder(res, 0, rows);
    } catch (err) {
        console.log(err);
        return responder(res, 1, 'No se pudo leer el historial');
    }
};

// POST /auth/textos/:id/restaurar/:idHistorial -> vuelve a una version anterior (queda registrada como un cambio mas)
module.exports.restaurar = async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const idHist = parseInt(req.params.idHistorial, 10);
    if (!id || !idHist) return responder(res, 1, 'Datos inválidos');
    try {
        const [version] = await VIDA_DB.sync_query('SELECT formato, asunto, cuerpo FROM textos_historial WHERE id = ? AND id_texto = ?', [idHist, id]);
        if (!version) return responder(res, 1, 'No se encontró esa versión');
        req.body = { formato: version.formato || 'texto', asunto: version.asunto, cuerpo: version.cuerpo };
        return module.exports.update(req, res);
    } catch (err) {
        console.log(err);
        return responder(res, 1, 'No se pudo restaurar la versión');
    }
};

// POST /auth/textos/preview { asunto, cuerpo, formato? } -> el texto con datos de ejemplo y las variables desconocidas
// Con formato html, `cuerpo` es el HTML ya saneado (lo mismo que se enviaria) y `documento` el correo completo para mostrarlo.
module.exports.preview = async (req, res) => {
    const body = req.body || {};
    const esHtml = body.formato === 'html';
    const cuerpo = esHtml ? textos.renderHtml(body.cuerpo, textos.EJEMPLO) : textos.render(body.cuerpo, textos.EJEMPLO);
    const asunto = textos.render(body.asunto, textos.EJEMPLO);
    return responder(res, 0, {
        asunto: asunto.texto,
        cuerpo: esHtml ? cuerpo.html : cuerpo.texto,
        documento: esHtml ? htmlCorreo.documento(cuerpo.html, asunto.texto) : null,
        desconocidas: Array.from(new Set(cuerpo.desconocidas.concat(asunto.desconocidas)))
    });
};

// GET /auth/textos/contacto?tipo=validacion|registracion&id=<id_validacion|id_usuario>&clave=<CLAVE>
// Arma el texto con los datos de la persona y los enlaces de WhatsApp y correo para abrirlos en una pestana nueva.
module.exports.contacto = async (req, res) => {
    const tipo = req.query.tipo === 'registracion' ? 'registracion' : 'validacion';
    const id = parseInt(req.query.id, 10);
    const clave = String(req.query.clave || '').trim().toUpperCase();
    if (!id || !clave) return responder(res, 1, 'Faltan datos: id y clave del texto');
    try {
        const [texto] = await VIDA_DB.sync_query('SELECT * FROM textos WHERE clave = ? AND activo = 1', [clave]);
        if (!texto) return responder(res, 1, 'No se encontró ese texto o está desactivado');
        const sql = tipo === 'validacion'
            ? `SELECT u.nombre, u.apellido, u.cuil, u.telefono, u.email, a.empresa, a.fecha, a.auditor
               FROM auditoria a JOIN usuario u ON u.id_usuario = a.id_usuario WHERE a.id_validacion = ?`
            : `SELECT u.nombre, u.apellido, u.cuil, u.telefono, u.email, u.empresa, u.fecha, u.auditor
               FROM usuario u WHERE u.id_usuario = ?`;
        const [p] = await VIDA_DB.sync_query(sql, [id]);
        if (!p) return responder(res, 1, 'No se encontró a la persona');
        const nombre = textos.capitalizar(p.nombre);
        const apellido = textos.capitalizar(p.apellido);
        const datos = {
            nombre, apellido, nombre_completo: `${nombre} ${apellido}`.trim(),
            cuil: textos.formatoCuil(p.cuil), empresa: p.empresa || '', fecha: textos.formatoFecha(p.fecha),
            auditor: String(p.auditor || '').replace(/^ALERTA:/, '')
        };
        // Si el texto usa {{enlace_foto}} se crea un enlace propio (vence y pide los ultimos digitos del CUIL) a la foto de ESTA certificacion
        if (tipo === 'validacion' && /\{\{\s*enlace_foto\s*\}\}/i.test(String(texto.cuerpo) + String(texto.asunto || ''))) {
            const [vinculo] = await VIDA_DB.sync_query('SELECT id_usuario FROM auditoria WHERE id_validacion = ?', [id]);
            const enlace = await fotos.crearEnlace(VIDA_DB, { idValidacion: id, idUsuario: vinculo.id_usuario, creadoPor: req.user && req.user.email });
            datos.enlace_foto = urlBasePublica() + '/vida/f/' + enlace.codigo;
        }
        const cuerpo = texto.formato === 'html' ? htmlCorreo.aTextoPlano(textos.renderHtml(texto.cuerpo, datos).html) : textos.render(texto.cuerpo, datos).texto;
        const asunto = textos.render(texto.asunto, datos).texto;
        const data = { canal: texto.canal, asunto, texto: cuerpo, persona: datos.nombre_completo, whatsapp: null, email: null, avisos: [] };
        if (texto.canal === 'whatsapp') {
            data.whatsapp = textos.urlWhatsApp(p.telefono, cuerpo);
            if (!data.whatsapp) data.avisos.push('La persona no tiene un teléfono válido cargado.');
        } else if (texto.canal === 'email') {
            data.email = textos.urlMailto(p.email, asunto, cuerpo);
            if (!data.email) data.avisos.push('La persona no tiene un correo válido cargado.');
        }
        return responder(res, 0, data);
    } catch (err) {
        console.log(err);
        return responder(res, 1, 'No se pudo armar el mensaje');
    }
};
