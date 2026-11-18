// Consulta al padron (padron.master, otra base de datos) para saber quienes figuran como fallecidos. master es la fuente de verdad: se mantiene
// al dia todos los meses y son millones de registros, por eso se consulta por CUIL (clave primaria) y por tandas, nunca recorriendo la tabla.
// Si el padron no responde se lanza un error "publico": quien envia (notificaciones, correo) debe detenerse y no enviar a ciegas.
const TROZO = 2000;
const ESPERA_MS = 30000;
const MENSAJE = 'No se pudo comprobar el padrón de fallecidos. Por precaución no se envía nada; intente de nuevo en unos minutos.';

function conEspera(promesa, ms) {
    let t;
    const limite = new Promise((_, rechazar) => { t = setTimeout(() => rechazar(new Error('tiempo agotado')), ms); });
    return Promise.race([promesa, limite]).finally(() => clearTimeout(t));
}

// padron: { sync_query }. Devuelve { fallecidas(cuils) -> Set de CUIL (texto) }
module.exports.crear = function (padron, opciones) {
    const espera = (opciones && opciones.esperaMs) || ESPERA_MS;
    async function fallecidas(cuils) {
        const out = new Set();
        const lista = Array.from(new Set((cuils || []).filter((c) => c != null && c !== '').map((c) => String(c))));
        try {
            for (let i = 0; i < lista.length; i += TROZO) {
                const filas = await conEspera(padron.sync_query('SELECT CUIL FROM master WHERE CUIL IN (?) AND Fallecido = 1', [lista.slice(i, i + TROZO)]), espera);
                filas.forEach((f) => out.add(String(f.CUIL)));
            }
        } catch (err) {
            console.log('[padron] no se pudo consultar fallecidos:', err && (err.code || err.message));
            throw Object.assign(new Error(MENSAJE), { publico: true });
        }
        return out;
    }
    return { fallecidas };
};
module.exports.MENSAJE = MENSAJE;
