const settings = require('../../../utils/settings');

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
