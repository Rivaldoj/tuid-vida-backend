const AWS = require('aws-sdk');
const liveness = require('../../../../utils/liveness');

const s3 = new AWS.S3();
const tuidVidaConfig = CONFIG.get('vida');

// Devuelve { session } si la prueba de vida es válida, o { message, livenessStatus, confidence } si no
async function validateLivenessSession(sessionId) {
    const session = await liveness.getSessionResults(sessionId);
    console.log('liveness', sessionId, session.Status, session.Confidence);
    const result = { livenessStatus: session.Status };
    if (session.Status === 'CREATED' || session.Status === 'EXPIRED') {
        return { ...result, message: 'La prueba de vida no se completó o la sesión expiró. Por favor intente nuevamente.' };
    }
    if (session.Status === 'IN_PROGRESS') {
        return { ...result, message: 'La prueba de vida todavía está en proceso. Por favor intente nuevamente.' };
    }
    if (session.Status !== 'SUCCEEDED' || session.Confidence < tuidVidaConfig.livenessThreshold) {
        return { ...result, confidence: session.Confidence, message: 'No se pudo confirmar la prueba de vida. Por favor intente nuevamente.' };
    }
    if (!session.ReferenceImage || (!session.ReferenceImage.S3Object && !session.ReferenceImage.Bytes)) {
        return { ...result, message: 'No se obtuvo la imagen de referencia de la verificación de vida' };
    }
    return { ...result, session };
}

function referenceSource(session) {
    const reference = session.ReferenceImage;
    return reference.S3Object
        ? { S3Object: { Bucket: reference.S3Object.Bucket, Name: reference.S3Object.Name } }
        : { Bytes: reference.Bytes };
}

// Guarda la imagen de referencia del liveness en bucketPath/key (copia cross-bucket o sube los bytes)
function copyReference(session, bucketPath, key) {
    const reference = session.ReferenceImage;
    if (reference.S3Object) {
        return s3.copyObject({
            CopySource: encodeURI(reference.S3Object.Bucket + '/' + reference.S3Object.Name),
            Bucket: bucketPath,
            Key: key
        }).promise();
    }
    return s3.putObject({ Bucket: bucketPath, Key: key, Body: reference.Bytes }).promise();
}

module.exports = {
    validateLivenessSession,
    referenceSource,
    copyReference,
};
