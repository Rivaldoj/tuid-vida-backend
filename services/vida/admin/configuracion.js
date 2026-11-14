const settings = require('../../../utils/settings');
const controlNombres = require('../../../utils/controlNombres');

// GET /auth/configuracion/auditoria -> { obligatoria: true|false }
module.exports.getAuditoria = async (req, res) => {
    res.response = { error: 1, data: 'Error desconocido' };
    try {
        settings.limpiarCache();
        res.response.error = 0;
        res.response.data = { obligatoria: await settings.auditoriaObligatoria(), auditorAutomatico: settings.AUDITOR_LIVENESS };
    } catch (err) {
        console.log(err);
        res.response.data = 'No se pudo leer la configuración';
    }
    return res.status(200).json(res.response);
};

// GET /auth/configuracion/control-nombres -> { activo, tolerancia, porDefecto }
// Control del nombre y apellido del documento contra padron.master al registrarse.
module.exports.getControlNombres = async (req, res) => {
    res.response = { error: 1, data: 'Error desconocido' };
    try {
        const c = await controlNombres.leerConfig();
        res.response.error = 0;
        res.response.data = { activo: c.activo, tolerancia: c.tolerancia, porDefecto: controlNombres.TOLERANCIA_POR_DEFECTO };
    } catch (err) {
        console.log(err);
        res.response.data = 'No se pudo leer la configuración';
    }
    return res.status(200).json(res.response);
};

// POST /auth/configuracion/control-nombres { activo, tolerancia }
module.exports.setControlNombres = async (req, res) => {
    res.response = { error: 1, data: 'Error desconocido' };
    const v = controlNombres.validarConfig(req.body);
    if (v.error) {
        res.response.data = v.error;
        return res.status(200).json(res.response);
    }
    try {
        await controlNombres.guardarConfig(v, req.user && req.user.email);
        res.response.error = 0;
        res.response.data = { activo: v.activo, tolerancia: v.tolerancia };
    } catch (err) {
        console.log(err);
        res.response.data = 'No se pudo guardar la configuración';
    }
    return res.status(200).json(res.response);
};

// GET /auth/configuracion/certificado -> { horas, mensaje, porDefecto: { horas, mensaje } }
// Aviso que ve la persona al pedir su certificado cuando Auditoria todavia no aprobo la certificacion.
module.exports.getCertificado = async (req, res) => {
    res.response = { error: 1, data: 'Error desconocido' };
    try {
        settings.limpiarCache();
        const c = await settings.certificadoRevision();
        res.response.error = 0;
        res.response.data = { horas: c.horas, mensaje: c.mensaje, porDefecto: settings.REVISION_POR_DEFECTO };
    } catch (err) {
        console.log(err);
        res.response.data = 'No se pudo leer la configuración';
    }
    return res.status(200).json(res.response);
};

// POST /auth/configuracion/certificado { horas, mensaje }  (variables del mensaje: {{fecha}} y {{horas}})
module.exports.setCertificado = async (req, res) => {
    res.response = { error: 1, data: 'Error desconocido' };
    const v = settings.validarRevision(req.body);
    if (v.error) {
        res.response.data = v.error;
        return res.status(200).json(res.response);
    }
    try {
        await settings.setCertificadoRevision(v, req.user && req.user.email);
        res.response.error = 0;
        res.response.data = { horas: v.horas, mensaje: v.mensaje };
    } catch (err) {
        console.log(err);
        res.response.data = 'No se pudo guardar la configuración';
    }
    return res.status(200).json(res.response);
};

// POST /auth/configuracion/auditoria { obligatoria: true|false }
// true  = las certificaciones esperan la aprobacion de Auditoria antes de llegar a los clientes.
// false = pasan directo y se guardan con auditor = 'Liveness'.
module.exports.setAuditoria = async (req, res) => {
    res.response = { error: 1, data: 'Error desconocido' };
    const valor = req.body && req.body.obligatoria;
    if (typeof valor !== 'boolean') {
        res.response.data = 'Se debe enviar "obligatoria": true o false';
        return res.status(200).json(res.response);
    }
    try {
        const r = await settings.setAuditoriaObligatoria(valor, req.user && req.user.email);
        res.response.error = 0;
        res.response.data = { obligatoria: valor, anterior: r.anterior, nuevo: r.nuevo };
    } catch (err) {
        console.log(err);
        res.response.data = 'No se pudo guardar la configuración';
    }
    return res.status(200).json(res.response);
};
