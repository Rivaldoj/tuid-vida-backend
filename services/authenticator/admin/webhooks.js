const webhooks = require('../../../utils/webhooks');

module.exports.list = function (req, res) {
    const filters = {
        status: req.query.status || 'pending',
        aplicacion: req.query.aplicacion || null,
        limit: req.query.limit,
        offset: req.query.offset,
    };
    webhooks.listPending(filters, function (err, data) {
        if (err) {
            return res.status(200).json({ status: 400, res: 'error', message: 'Error de conexión con la base de datos', details: err.message || err });
        }
        return res.status(200).json({ status: 200, res: 'ok', total: data.total, items: data.items });
    });
};

module.exports.retry = function (req, res) {
    const id = parseInt(req.params.id, 10);
    if (!id) {
        return res.status(200).json({ status: 400, res: 'error', message: 'id inválido' });
    }
    webhooks.retryNow(id, function (err, result) {
        if (err) {
            return res.status(200).json({ status: 400, res: 'error', message: 'Error de conexión con la base de datos', details: err.message || err });
        }
        if (result.notFound) {
            return res.status(200).json({ status: 404, res: 'error', message: 'Webhook no encontrado' });
        }
        if (result.alreadyDelivered) {
            return res.status(200).json({ status: 400, res: 'error', message: 'El webhook ya fue entregado' });
        }
        return res.status(200).json({
            status: 200,
            res: 'ok',
            message: 'Reintento forzado',
            id: result.id,
            webhook_id: result.webhook_id,
        });
    });
};
