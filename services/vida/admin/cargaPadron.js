// Actualizacion mensual del padron: da de alta en padron.master a las personas nuevas del archivo (padronac.dbf) y completa
// los datos que falten en las que ya estaban (por ejemplo las altas minimas que dejo la carga de fallecidos). Siempre ANTES de cargar fallecidos.
// Reglas: nunca se pisa un dato que ya existe; Fallecido, FechaFalle, OB e IdLote de una persona existente no se tocan.
// Cada carga queda en padron_carga_lotes / padron_carga_log (en la base padron) para poder deshacerla.
const { trozos } = require('../../../utils/fallecidosCarga');

const TROZO_LECTURA = 2000;
const TROZO_ESCRITURA = 1000;

const SQL_LOTES = `CREATE TABLE IF NOT EXISTS padron_carga_lotes (
  lote VARCHAR(40) NOT NULL PRIMARY KEY,
  fecha DATETIME NOT NULL,
  archivo VARCHAR(200) NULL,
  resumen VARCHAR(1000) NULL,
  revertido_en DATETIME NULL
)`;
const SQL_LOG = `CREATE TABLE IF NOT EXISTS padron_carga_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fecha DATETIME NOT NULL,
  lote VARCHAR(40) NOT NULL,
  cuil BIGINT NOT NULL,
  accion VARCHAR(12) NOT NULL,
  KEY (lote), KEY (cuil)
)`;

// Columnas de master que se completan si estan vacias (campo de la fila -> columna)
const COMPLETABLES = [['apenom', 'Apellido_Nombre'], ['apellido', 'Apellido'], ['nombre', 'Nombre'], ['sexo', 'Sexo'], ['dni', 'DNI'],
    ['fechaNac', 'FechaNac'], ['cp', 'CP'], ['idProvincia', 'IdProvincia'], ['idActividad', 'IdActividad'], ['baja', 'Baja']];

// deps: { padron: { sync_query } }
module.exports.crear = function (deps) {
    const padron = deps.padron;

    async function asegurarTablas() {
        await padron.sync_query(SQL_LOTES);
        await padron.sync_query(SQL_LOG);
    }

    async function actividades() {
        const r = await padron.sync_query('SELECT IdActividad FROM actividad');
        return new Set(r.map((x) => Number(x.IdActividad)));
    }

    // Compara el archivo con master sin escribir nada. filas: lo que devuelve convertir() (ya validadas y sin CUIL repetidos).
    async function analizar(filas) {
        const nuevas = [], completar = [];
        let iguales = 0;
        for (const t of trozos(filas, TROZO_LECTURA)) {
            const ex = await padron.sync_query(
                'SELECT CUIL, Apellido_Nombre, Apellido, Nombre, Sexo, DNI, FechaNac, CP, IdProvincia, IdActividad, Baja FROM master WHERE CUIL IN (?)', [t.map((f) => f.cuil)]);
            const porCuil = new Map(ex.map((x) => [Number(x.CUIL), x]));
            for (const f of t) {
                const e = porCuil.get(f.cuil);
                if (!e) { nuevas.push(f); continue; }
                const vacios = COMPLETABLES.filter(([k, col]) => e[col] == null && f[k] != null);
                if (vacios.length) completar.push({ fila: f, campos: vacios.map(([, col]) => col) }); else iguales++;
            }
        }
        const fall = nuevas.filter((f) => f.fallecido === 1).length;
        return { nuevas, completar, iguales, nuevasFallecidas: fall };
    }

    async function loteExiste(lote) {
        await asegurarTablas();
        const r = await padron.sync_query('SELECT COUNT(*) AS n FROM padron_carga_log WHERE lote = ?', [lote]);
        const l = await padron.sync_query('SELECT COUNT(*) AS n FROM padron_carga_lotes WHERE lote = ?', [lote]);
        return Number(r[0].n) + Number(l[0].n) > 0;
    }

    async function aplicar(analisis, lote, onProgreso, opciones) {
        await asegurarTablas();
        const out = { altas: 0, completadas: 0 };
        const avisar = (t) => { if (onProgreso) onProgreso(t); };
        // Si se esta CONTINUANDO un lote cortado, no se vuelven a anotar las altas que ya estaban en el log del lote
        const yaAnotados = new Set();
        if (opciones && opciones.continuar) {
            const r = await padron.sync_query('SELECT cuil FROM padron_carga_log WHERE lote = ? AND accion = \'alta\'', [lote]);
            r.forEach((x) => yaAnotados.add(Number(x.cuil)));
        }
        // 1) cada tanda se anota en el log ANTES de escribirla (si algo falla a medias, el lote se puede deshacer igual)
        // 2) altas
        for (const t of trozos(analisis.nuevas, TROZO_ESCRITURA)) {
            const sinAnotar = t.filter((f) => !yaAnotados.has(f.cuil));
            if (sinAnotar.length) {
                await padron.sync_query('INSERT INTO padron_carga_log (fecha, lote, cuil, accion) VALUES ' + sinAnotar.map(() => '(NOW(), ?, ?, \'alta\')').join(', '),
                    [].concat(...sinAnotar.map((f) => [lote, f.cuil])));
            }
            const sql = 'INSERT IGNORE INTO master (CUIL, Apellido_Nombre, Apellido, Nombre, Sexo, DNI, IdActividad, Baja, FechaNac, CP, IdProvincia, Fallecido, FechaFalle, OB, IdLote) VALUES ' +
                t.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
            const r = await padron.sync_query(sql, [].concat(...t.map((f) => [f.cuil, f.apenom, f.apellido, f.nombre, f.sexo, f.dni, f.idActividad, f.baja,
                f.fechaNac, f.cp, f.idProvincia, f.fallecido, f.fechaFalle, f.ob, f.idLote])));
            out.altas += r.affectedRows || 0;
            avisar('altas ' + out.altas);
        }
        // 3) completar vacios de las que ya estaban (solo donde hoy esta vacio)
        for (const t of trozos(analisis.completar, 500)) {
            const f = t.map((x) => x.fila);
            const sql = 'INSERT INTO master (CUIL, Apellido_Nombre, Apellido, Nombre, Sexo, DNI, IdActividad, Baja, FechaNac, CP, IdProvincia) VALUES ' +
                f.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ') + ' ON DUPLICATE KEY UPDATE ' +
                COMPLETABLES.map(([, col]) => `${col} = COALESCE(master.${col}, VALUES(${col}))`).join(', ');
            const r = await padron.sync_query(sql, [].concat(...f.map((x) => [x.cuil, x.apenom, x.apellido, x.nombre, x.sexo, x.dni, x.idActividad, x.baja, x.fechaNac, x.cp, x.idProvincia])));
            out.completadas += Math.floor((r.affectedRows || 0) / 2);   // en ON DUPLICATE KEY cada fila modificada cuenta 2
            avisar('completadas ' + out.completadas);
        }
        // Total de altas del lote: si la carga se corto y se retomo (--continuar), las de corridas anteriores ya estan en el log del lote
        out.altasEstaCorrida = out.altas;
        const [tot] = await padron.sync_query('SELECT COUNT(*) n FROM padron_carga_log WHERE lote = ? AND accion = \'alta\'', [lote]);
        out.altas = Math.max(out.altas, Number(tot.n) || 0);
        return out;
    }

    async function registrarLote(meta) {
        await asegurarTablas();
        await padron.sync_query('INSERT INTO padron_carga_lotes (lote, fecha, archivo, resumen) VALUES (?, NOW(), ?, ?) ON DUPLICATE KEY UPDATE archivo = VALUES(archivo), resumen = VALUES(resumen)',
            [meta.lote, meta.archivo || null, meta.resumen || null]);
    }

    // Deshace las ALTAS del lote. Se conservan las que despues recibieron una marca de fallecido de una carga de fallecidos (revertir esa primero).
    // Los datos completados en personas que ya estaban no se deshacen (solo llenaron campos vacios).
    async function revertir(lote) {
        await asegurarTablas();
        let tocadas = 0;
        try {
            const t = await padron.sync_query('SELECT COUNT(DISTINCT l.cuil) AS n FROM padron_carga_log l JOIN fallecidos_carga_log f ON f.cuil = l.cuil WHERE l.lote = ? AND l.accion = \'alta\'', [lote]);
            tocadas = Number(t[0].n);
        } catch (e) { /* no existe la tabla de fallecidos: nadie las toco */ }
        let sql = 'DELETE m FROM master m JOIN padron_carga_log l ON l.cuil = m.CUIL AND l.lote = ? AND l.accion = \'alta\'';
        try {
            await padron.sync_query('SELECT 1 FROM fallecidos_carga_log LIMIT 1');
            sql += ' WHERE NOT EXISTS (SELECT 1 FROM fallecidos_carga_log f WHERE f.cuil = m.CUIL)';
        } catch (e) { /* sin tabla */ }
        const r = await padron.sync_query(sql, [lote]);
        await padron.sync_query('INSERT INTO padron_carga_lotes (lote, fecha, revertido_en) VALUES (?, NOW(), NOW()) ON DUPLICATE KEY UPDATE revertido_en = NOW()', [lote]);
        return { altas: r.affectedRows || 0, conservadas: tocadas };
    }

    return { analizar, aplicar, revertir, registrarLote, loteExiste, asegurarTablas, actividades };
};
