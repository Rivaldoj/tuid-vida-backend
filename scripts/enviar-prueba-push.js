// Envia UNA notificacion push de prueba a un dispositivo, usando la cuenta de servicio de Firebase (FCM v1).
// Uso: node scripts/enviar-prueba-push.js "<token del dispositivo>" "<titulo>" "<mensaje>"
// El token es el campo usuario.id_device. La ruta del .json de la cuenta de servicio sale de la variable de entorno
// GOOGLE_APPLICATION_CREDENTIALS (el archivo no se guarda en el repositorio).
global.CONFIG = { has: () => false, get: () => ({}) };
const push = require('../utils/push');

const [token, titulo, mensaje] = process.argv.slice(2);
if (!token || !titulo || !mensaje) {
    console.log('Uso: node scripts/enviar-prueba-push.js "<token>" "<titulo>" "<mensaje>"');
    process.exit(1);
}
push.sendAsync(token, titulo, mensaje).then((r) => {
    console.log(r.ok ? 'Enviada.' : 'No se pudo enviar: ' + r.motivo + (r.tokenInvalido ? ' (el dispositivo ya no existe: el token está vencido)' : ''));
    process.exit(r.ok ? 0 : 2);
});
