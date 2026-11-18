// Control de Fallecidos: personas del listado vigente de una empresa (usuario_empresa) que figuran como fallecidas en el padron (master.Fallecido = 1,
// la fuente que se mantiene al dia todos los meses) o que estan marcadas a mano en usuario_empresa (Posible_fallecido = 1). Las marcas de usuario_empresa
// se pierden cada vez que la empresa sube un listado nuevo; por eso el padron es la fuente principal.
// El Administrador de TUID elige la empresa; el de una empresa cliente ve solo la suya.
// deps: { db: { sync_query } (tuid_vida), padron: { sync_query } (opcional: sin el, solo cuentan las marcas de usuario_empresa) }
module.exports.crear = function (deps) {
    const db = deps.db;
    const padron = deps.padron;
    const TROZO = 2000;

    const responder = (res, error, data) => res.status(200).json({ error, data });
    const fecha = (v) => {
        if (v == null || v === '') return null;
        if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
        const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v));
        return m ? m[1] : null;
    };

    // GET /auth/fallecidos?empresa=<ID> -> { empresa, total, filas: [{ cuil, posible_fallecido, fecha_fallecido }] }
    async function listar(req, res) {
        try {
            const esTuid = !!(req.user && req.user.empresa === 'TUID');
            const empresa = esTuid ? String((req.query && req.query.empresa) || '').trim() : req.user.empresa;
            if (!empresa) return responder(res, 1, 'Elija una empresa.');
            // El nombre de las columnas en produccion: Posible_fallecido y Fecha_fallecido (MariaDB no distingue mayusculas)
            const lista = await db.sync_query('SELECT cuil, Posible_fallecido, Fecha_fallecido FROM usuario_empresa WHERE empresa = ?', [empresa]);
            // fallecidas segun el padron (otra base: por tandas de CUIL)
            const enPadron = new Map();
            if (padron) {
                for (let i = 0; i < lista.length; i += TROZO) {
                    const cuils = lista.slice(i, i + TROZO).map((f) => f.cuil);
                    const r = await padron.sync_query('SELECT CUIL, FechaFalle FROM master WHERE CUIL IN (?) AND Fallecido = 1', [cuils]);
                    r.forEach((x) => enPadron.set(String(x.CUIL), fecha(x.FechaFalle)));
                }
            }
            const data = [];
            lista.forEach((f) => {
                const k = f.cuil == null ? '' : String(f.cuil);
                const marcada = Number(f.Posible_fallecido) === 1;
                if (!marcada && !enPadron.has(k)) return;
                data.push({ cuil: k, posible_fallecido: true, fecha_fallecido: enPadron.get(k) || fecha(f.Fecha_fallecido) });
            });
            // mas recientes primero, las sin fecha al final
            data.sort((a, b) => (a.fecha_fallecido ? 0 : 1) - (b.fecha_fallecido ? 0 : 1) || (b.fecha_fallecido || '').localeCompare(a.fecha_fallecido || '') || a.cuil.localeCompare(b.cuil));
            return responder(res, 0, { empresa, total: data.length, filas: data });
        } catch (err) {
            console.log(err);
            return responder(res, 1, 'No se pudo armar el reporte de fallecidos');
        }
    }

    return { listar };
};
