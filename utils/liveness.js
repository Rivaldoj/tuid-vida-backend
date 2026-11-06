const AWS = require('aws-sdk');
const config = require('config');

function getClient() {
  const awsConfig = config.get('aws');

  return new AWS.Rekognition({
    credentials: {
      accessKeyId: awsConfig.credentials.accessKeyId,
      secretAccessKey: awsConfig.credentials.secretAccessKey,
    },
    region: awsConfig.region,
  });
}

function buildSettings(options = {}) {
  const awsConfig = config.get('aws');
  const livenessConfig = awsConfig.liveness || {};
  const bucket = options.s3Bucket || livenessConfig.s3Bucket || config.get('vida.bucketName');
  const prefix = options.s3KeyPrefix || livenessConfig.s3KeyPrefix || 'liveness/';
  const auditImagesLimit = options.auditImagesLimit ?? livenessConfig.auditImagesLimit;

  if (!bucket && auditImagesLimit == null) return undefined;

  const settings = {};
  if (bucket) {
    settings.OutputConfig = {
      S3Bucket: bucket,
      S3KeyPrefix: prefix,
    };
  }
  if (auditImagesLimit != null) {
    settings.AuditImagesLimit = auditImagesLimit;
  }

  return settings;
}

/**
 * Crea una sesión de Face Liveness en AWS Rekognition.
 * @param {object} [options]
 * @param {string} [options.clientRequestToken] Token único para idempotencia
 * @param {string} [options.s3Bucket] Bucket S3 para imágenes de auditoría
 * @param {string} [options.s3KeyPrefix] Prefijo S3 dentro del bucket
 * @param {number} [options.auditImagesLimit] Cantidad de imágenes de auditoría (0-4)
 * @returns {Promise<string>} SessionId de la sesión creada
 */
async function createSession(options = {}) {
  console.log("createSession");
  const params = {};

  if (options.clientRequestToken) {
    params.ClientRequestToken = options.clientRequestToken;
  }

  const settings = buildSettings(options);
  if (settings) {
    params.Settings = settings;
  }
  const response = await getClient().createFaceLivenessSession(params).promise();
  console.log(response);
  return response.SessionId;
}

/**
 * Obtiene el resultado de una sesión de Face Liveness.
 * @param {string} sessionId
 * @returns {Promise<object>} Respuesta de GetFaceLivenessSessionResults
 */
async function getSessionResults(sessionId) {
  const response = await getClient().getFaceLivenessSessionResults({
    SessionId: sessionId,
  }).promise();

  return response;
}

module.exports = {
  createSession,
  getSessionResults,
};
