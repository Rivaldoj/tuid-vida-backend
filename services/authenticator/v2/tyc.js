const fs = require('fs');
const path = require('path');

function sendLegalDocument(req, res, type) {
    if (!req.client || !req.client.id) {
        return res.status(401).json({ message: 'Please make sure your request has a valid Authorization header' });
    }

    const filename = req.client.id + '_' + type + '.html';
    const filePath = path.join(APP_PATH, 'html', 'tyc', filename);

    if (!fs.existsSync(filePath)) {
        return res.status(200).json({
            res: 'error',
            status: 404,
            message: 'Documento no encontrado para esta marca',
            brand: req.client.id,
            type: type
        });
    }

    const html = fs.readFileSync(filePath, 'utf8');
    return res.status(200).json({
        res: 'ok',
        status: 200,
        brand: req.client.id,
        brandName: req.client.displayName || req.client.name,
        type: type,
        html: html
    });
}

module.exports.getTyc = function (req, res) {
    sendLegalDocument(req, res, 'tyc');
};

module.exports.getPrivacy = function (req, res) {
    sendLegalDocument(req, res, 'privacy');
};
