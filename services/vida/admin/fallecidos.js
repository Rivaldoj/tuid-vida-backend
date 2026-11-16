// Control de Fallecidos: personas de una empresa marcadas como "posible fallecido" en usuario_empresa (Posible_fallecido = 1).
// El Administrador de TUID elige la empresa; el de una empresa cliente ve solo la suya.
// deps: { db: { sync_query } }
module.exports.crear = function (deps) {
    const db = deps.db;

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
            const filas = await db.sync_query(
                `SELECT cuil, Posible_fallecido, Fecha_fallecido FROM usuario_empresa
                 WHERE empresa = ? AND Posible_fallecido = 1 ORDER BY Fecha_fallecido IS NULL, Fecha_fallecido DESC, cuil`, [empresa]);
            const data = filas.map((f) => ({
                cuil: f.cuil == null ? '' : String(f.cuil),
                posible_fallecido: Number(f.Posible_fallecido) === 1,
                fecha_fallecido: fecha(f.Fecha_fallecido)
            }));
            return responder(res, 0, { empresa, total: data.length, filas: data });
        } catch (err) {
            console.log(err);
            return responder(res, 1, 'No se pudo armar el reporte de fallecidos');
        }
    }

    return { listar };
};
