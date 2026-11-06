// Limite de intentos en memoria (ventana deslizante). Sirve para frenar consultas masivas de CUIL.
// Limitaciones: la cuenta vive en cada proceso (si hay varias instancias, cada una cuenta aparte) y
// se reinicia al reiniciar el servidor. Para un control global haria falta un almacen compartido.

function createLimiter({ max, windowMs, now = () => Date.now() }) {
    const hits = new Map(); // clave -> [timestamps]

    function purge(list, t) {
        while (list.length > 0 && t - list[0] >= windowMs) list.shift();
    }

    // true si el intento esta permitido (y lo registra); false si se supero el maximo
    function allow(key) {
        const t = now();
        const list = hits.get(key) || [];
        purge(list, t);
        if (list.length >= max) {
            hits.set(key, list);
            return false;
        }
        list.push(t);
        hits.set(key, list);
        return true;
    }

    // limpia claves vencidas para que el mapa no crezca sin limite
    function sweep() {
        const t = now();
        for (const [key, list] of hits) {
            purge(list, t);
            if (list.length === 0) hits.delete(key);
        }
    }

    return { allow, sweep, size: () => hits.size };
}

module.exports = { createLimiter };
