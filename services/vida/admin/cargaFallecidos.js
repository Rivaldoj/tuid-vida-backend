// Carga mensual de fallecidos. Motor compartido por la herramienta de comandos (scripts/cargarFallecidos.js) y, mas adelante, por el panel.
//
// Tres destinos, en DOS servidores distintos (no hay una transaccion que los abarque), por eso todo es repetible y reversible:
//   padron.master              Fallecido = 1, FechaFalle
//   tuid_vida.usuario_empresa  Posible_fallecido = 1, Fecha_fallecido
//   tuid_vida.usuario          fecha_fallecido, notificaciones = 0 (igual que el boton de fallecido del panel)
// Reglas: nunca se pisa una fecha ya cargada (si difiere se informa como conflicto); solo se escribe lo que cambia; todo cambio queda en
// fallecidos_carga_log (con los valores de antes) para poder revertir el lote.
const { decidir, trozos, aFecha, dniDeCuil } = require('../../../utils/fallecidosCarga');

const TROZO_LECTURA = 2000;   // CUIL por consulta de lectura
const TROZO_ESCRITURA = 500;  // CUIL por UPDATE
const DESTINOS = ['master', 'usuario_empresa', 'usuario'];
const DESTINO_ALTAS = 'master_alta';   // altas en padron.master de quienes el archivo trae y el padron no tiene

// Un renglon por carga: quien, cuando, que archivo y el resumen (los detalles estan en fallecidos_carga_log). Solo en tuid_vida.
const SQL_LOTES = `CREATE TABLE IF NOT EXISTS fallecidos_carga_lotes (
  lote VARCHAR(40) NOT NULL PRIMARY KEY,
  fecha DATETIME NOT NULL,
  usuario VARCHAR(100) NULL,
  archivo VARCHAR(200) NULL,
  resumen VARCHAR(1000) NULL,
  revertido_en DATETIME NULL
)`;

const SQL_LOG = `CREATE TABLE IF NOT EXISTS fallecidos_carga_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fecha DATETIME NOT NULL,
  lote VARCHAR(40) NOT NULL,
  destino VARCHAR(20) NOT NULL,
  cuil BIGINT NOT NULL,
  accion VARCHAR(12) NOT NULL,
  antes_marcado TINYINT NULL,
  antes_fecha DATE NULL,
  antes_extra INT NULL,
  nueva_fecha DATE NULL,
  KEY (lote, destino), KEY (cuil)
)`;

// deps: { padron: { sync_query }, vida: { sync_query } }
module.exports.crear = function (deps) {
    const padron = deps.padron;
    const vida = deps.vida;

    // ---------- lectura: que cambiaria en cada destino (no escribe nada) ----------
    async function leerMaster(cuils) {
        const mapa = new Map();
        for (const t of trozos(cuils, TROZO_LECTURA)) {
            const filas = await padron.sync_query('SELECT CUIL, Fallecido, FechaFalle FROM master WHERE CUIL IN (?)', [t]);
            filas.forEach((f) => mapa.set(String(f.CUIL), { marcado: Number(f.Fallecido) === 1, fecha: aFecha(f.FechaFalle), raw: f.Fallecido == null ? null : Number(f.Fallecido) }));
        }
        return mapa;
    }

    async function leerUsuarioEmpresa(cuils) {
        const mapa = new Map();   // cuil -> [{ empresa, marcado, fecha }]
        for (const t of trozos(cuils, TROZO_LECTURA)) {
            const filas = await vida.sync_query('SELECT cuil, empresa, Posible_fallecido, Fecha_fallecido FROM usuario_empresa WHERE cuil IN (?)', [t]);
            filas.forEach((f) => {
                const k = String(f.cuil);
                if (!mapa.has(k)) mapa.set(k, []);
                mapa.get(k).push({ empresa: f.empresa, marcado: Number(f.Posible_fallecido) === 1, fecha: aFecha(f.Fecha_fallecido), raw: f.Posible_fallecido == null ? null : Number(f.Posible_fallecido) });
            });
        }
        return mapa;
    }

    async function leerUsuario(cuils) {
        const mapa = new Map();   // cuil -> [{ id, marcado, fecha, estado }]
        for (const t of trozos(cuils, TROZO_LECTURA)) {
            const filas = await vida.sync_query('SELECT id_usuario, cuil, fecha_fallecido, estado FROM usuario WHERE cuil IN (?)', [t]);
            filas.forEach((f) => {
                const k = String(f.cuil);
                if (!mapa.has(k)) mapa.set(k, []);
                mapa.get(k).push({ id: f.id_usuario, marcado: !!f.fecha_fallecido, fecha: aFecha(f.fecha_fallecido), estado: f.estado });
            });
        }
        return mapa;
    }

    const cuenta = () => ({ coinciden: 0, marcar: 0, completar: 0, igual: 0, conflicto: 0 });

    // Compara el archivo (validos: [{ cuil, fecha }]) con los tres destinos. Devuelve el resumen y las listas de trabajo para `aplicar`.
    async function analizar(validos) {
        const cuils = validos.map((v) => v.cuil);
        const [master, ue, usr] = await Promise.all([leerMaster(cuils), leerUsuarioEmpresa(cuils), leerUsuario(cuils)]);

        const r = {
            master: Object.assign(cuenta(), { noEncontrados: 0 }),
            usuario_empresa: Object.assign(cuenta(), { personas: 0, filas: 0 }),
            usuario: Object.assign(cuenta(), { sinFecha: 0, conError: 0 }),
            trabajo: { master: [], usuario_empresa: [], usuario: [], altas: [] },
            altasDniRepetido: [],   // altas cuyo DNI ya existe en el padron con otro CUIL (para revisar)
            conflictos: [],       // { destino, cuil, actual, archivo }
            noEncontradosMaster: []
        };

        for (const v of validos) {
            // padron.master
            const m = master.get(v.cuil);
            if (!m) {
                r.master.noEncontrados++;
                r.noEncontradosMaster.push(v.cuil);
                r.trabajo.altas.push({ cuil: v.cuil, fecha: v.fecha, apenom: v.apenom, idlote: v.idlote, accion: 'alta', antesMarcado: null, antesFecha: null });
            } else {
                r.master.coinciden++;
                const d = decidir(v, m.marcado, m.fecha);
                r.master[d]++;
                if (d === 'marcar' || d === 'completar') r.trabajo.master.push({ cuil: v.cuil, fecha: v.fecha, accion: d, antesMarcado: m.raw, antesFecha: m.fecha });
                if (d === 'conflicto') r.conflictos.push({ destino: 'master', cuil: v.cuil, actual: m.fecha, archivo: v.fecha });
            }
            // usuario_empresa (una persona puede estar en varias empresas: se decide por persona)
            const filas = ue.get(v.cuil);
            if (filas && filas.length) {
                r.usuario_empresa.coinciden++;
                r.usuario_empresa.personas++;
                r.usuario_empresa.filas += filas.length;
                const ds = filas.map((f) => decidir(v, f.marcado, f.fecha));
                const d = ds.includes('marcar') ? 'marcar' : ds.includes('completar') ? 'completar' : ds.includes('conflicto') ? 'conflicto' : 'igual';
                r.usuario_empresa[d]++;
                if (d === 'marcar' || d === 'completar') {
                    const f0 = filas.find((f, i) => ds[i] === d);
                    r.trabajo.usuario_empresa.push({ cuil: v.cuil, fecha: v.fecha, accion: d, antesMarcado: f0.raw, antesFecha: f0.fecha });
                }
                if (d === 'conflicto') r.conflictos.push({ destino: 'usuario_empresa', cuil: v.cuil, actual: filas.find((f, i) => ds[i] === 'conflicto').fecha, archivo: v.fecha });
            }
            // usuario (personas registradas). Sin fecha de fallecimiento no se marca: aca la fecha ES la marca.
            const us = usr.get(v.cuil);
            if (us && us.length) {
                r.usuario.coinciden++;
                const u = us[0];
                if (u.estado === 'Error') { r.usuario.conError++; continue; }
                const d = decidir(v, u.marcado, u.fecha);
                if (d === 'marcar' && !v.fecha) { r.usuario.sinFecha++; continue; }
                if (d === 'completar') { r.usuario.igual++; continue; }   // marcado y con fecha ya cargada: nada que completar
                r.usuario[d]++;
                if (d === 'marcar') r.trabajo.usuario.push({ cuil: v.cuil, fecha: v.fecha, accion: d, antesMarcado: 0, antesFecha: null });
                if (d === 'conflicto') r.conflictos.push({ destino: 'usuario', cuil: v.cuil, actual: u.fecha, archivo: v.fecha });
            }
        }
        // altas cuyo DNI ya existe en el padron con otro CUIL: se dan de alta igual, pero se avisan para revisar (la consulta usa el indice por DNI)
        const dnis = r.trabajo.altas.map((x) => dniDeCuil(x.cuil)).filter((x) => x != null);
        const existentes = new Set();
        for (const t of trozos(dnis, 500)) {
            (await padron.sync_query('SELECT DISTINCT DNI FROM master WHERE DNI IN (?)', [t])).forEach((x) => existentes.add(Number(x.DNI)));
        }
        r.altasDniRepetido = r.trabajo.altas.filter((x) => existentes.has(dniDeCuil(x.cuil))).map((x) => x.cuil);
        return r;
    }

    // ---------- escritura (solo con aplicar) ----------
    // CASE col WHEN ? THEN ? ... END  con sus parametros
    function caso(col, pares) {
        const sql = 'CASE ' + col + ' ' + pares.map(() => 'WHEN ? THEN ?').join(' ') + ' END';
        const params = [];
        pares.forEach((p) => { params.push(p[0], p[1]); });
        return { sql, params };
    }

    async function asegurarLog() {
        await padron.sync_query(SQL_LOG);
        await vida.sync_query(SQL_LOG);
        await vida.sync_query(SQL_LOTES);
    }

    // Deja asentado quien hizo la carga y con que archivo (para el listado del panel)
    async function registrarLote(meta) {
        await vida.sync_query(SQL_LOTES);
        await vida.sync_query(
            'INSERT INTO fallecidos_carga_lotes (lote, fecha, usuario, archivo, resumen) VALUES (?, NOW(), ?, ?, ?) ON DUPLICATE KEY UPDATE usuario = VALUES(usuario), archivo = VALUES(archivo), resumen = VALUES(resumen)',
            [meta.lote, meta.usuario || null, meta.archivo ? String(meta.archivo).slice(0, 200) : null, meta.resumen ? String(meta.resumen).slice(0, 1000) : null]);
    }

    async function marcarRevertido(lote) {
        await vida.sync_query(SQL_LOTES);
        await vida.sync_query('INSERT INTO fallecidos_carga_lotes (lote, fecha, revertido_en) VALUES (?, NOW(), NOW()) ON DUPLICATE KEY UPDATE revertido_en = NOW()', [lote]);
    }

    // Cargas hechas (las del panel con su detalle, y las de la consola, que solo tienen el registro de cambios), de la mas nueva a la mas vieja
    async function listarLotes() {
        await vida.sync_query(SQL_LOTES);
        const meta = await vida.sync_query('SELECT lote, fecha, usuario, archivo, resumen, revertido_en FROM fallecidos_carga_lotes');
        const juntos = new Map();
        for (const db of [vida, padron]) {
            const filas = await db.sync_query('SELECT lote, MIN(fecha) AS fecha, COUNT(*) AS filas FROM fallecidos_carga_log GROUP BY lote');
            filas.forEach((f) => {
                const x = juntos.get(f.lote) || { lote: f.lote, fecha: f.fecha, filas: 0 };
                x.filas += Number(f.filas);
                if (f.fecha && (!x.fecha || new Date(f.fecha) < new Date(x.fecha))) x.fecha = f.fecha;
                juntos.set(f.lote, x);
            });
        }
        meta.forEach((m) => {
            const x = juntos.get(m.lote) || { lote: m.lote, fecha: m.fecha, filas: 0 };
            Object.assign(x, { usuario: m.usuario, archivo: m.archivo, resumen: m.resumen, revertido: !!m.revertido_en, revertido_en: m.revertido_en });
            if (m.fecha) x.fecha = m.fecha;
            juntos.set(m.lote, x);
        });
        return [...juntos.values()].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).slice(0, 40);
    }

    async function loteExiste(lote) {
        await asegurarLog();
        const a = await vida.sync_query('SELECT COUNT(*) AS n FROM fallecidos_carga_log WHERE lote = ?', [lote]);
        const b = await padron.sync_query('SELECT COUNT(*) AS n FROM fallecidos_carga_log WHERE lote = ?', [lote]);
        return Number(a[0].n) + Number(b[0].n) > 0;
    }

    // Guarda en el log los valores de ANTES, antes de tocar nada
    async function registrar(db, lote, destino, items, extraPorCuil) {
        for (const t of trozos(items, 1000)) {
            const filas = t.map((i) => [lote, destino, i.cuil, i.accion, i.antesMarcado, i.antesFecha, extraPorCuil ? (extraPorCuil.get(i.cuil) == null ? null : extraPorCuil.get(i.cuil)) : null, i.fecha]);
            await db.sync_query('INSERT INTO fallecidos_carga_log (fecha, lote, destino, cuil, accion, antes_marcado, antes_fecha, antes_extra, nueva_fecha) VALUES ' +
                filas.map(() => '(NOW(), ?, ?, ?, ?, ?, ?, ?, ?)').join(', '), [].concat(...filas));
        }
    }

    // trabajo: lo que devolvio `analizar`. lote: texto que identifica la carga (para revertirla). destinos: subconjunto de DESTINOS.
    // opciones.altas = true: ademas da de alta en padron.master a quienes el archivo trae y el padron no tiene (fila minima: CUIL, apellido y nombre, DNI del CUIL, fallecido, fecha, lote)
    async function aplicar(analisis, lote, destinos, onProgreso, opciones) {
        opciones = opciones || {};
        const quiere = (d) => (destinos || DESTINOS).includes(d);
        const out = { master: 0, usuario_empresa: 0, usuario: 0, altas: 0 };
        const avisar = (t) => { if (onProgreso) onProgreso(t); };
        await asegurarLog();

        // Primero las altas en el padron (las personas que el archivo trae y el padron aun no tiene), despues las marcas en los tres destinos
        if (opciones.altas && quiere('master') && analisis.trabajo.altas.length) {
            await registrar(padron, lote, DESTINO_ALTAS, analisis.trabajo.altas);
            for (const t of trozos(analisis.trabajo.altas, TROZO_ESCRITURA)) {
                const filas = t.map((i) => [i.cuil, i.apenom, dniDeCuil(i.cuil), 1, i.fecha, i.idlote]);
                const r = await padron.sync_query(
                    'INSERT IGNORE INTO master (CUIL, Apellido_Nombre, DNI, Fallecido, FechaFalle, IdLote) VALUES ' + filas.map(() => '(?, ?, ?, ?, ?, ?)').join(', '),
                    [].concat(...filas));
                out.altas += r.affectedRows || 0;
                avisar('altas ' + out.altas);
            }
        }
        if (quiere('master') && analisis.trabajo.master.length) {
            await registrar(padron, lote, 'master', analisis.trabajo.master);
            for (const t of trozos(analisis.trabajo.master, TROZO_ESCRITURA)) {
                const c = caso('CUIL', t.map((i) => [i.cuil, i.fecha]));
                const r = await padron.sync_query(
                    `UPDATE master SET Fallecido = 1, FechaFalle = COALESCE(FechaFalle, ${c.sql}) WHERE CUIL IN (?) AND (Fallecido IS NULL OR Fallecido <> 1 OR FechaFalle IS NULL)`,
                    c.params.concat([t.map((i) => i.cuil)]));
                out.master += r.affectedRows || 0;
                avisar('master ' + out.master);
            }
        }
        if (quiere('usuario_empresa') && analisis.trabajo.usuario_empresa.length) {
            await registrar(vida, lote, 'usuario_empresa', analisis.trabajo.usuario_empresa);
            for (const t of trozos(analisis.trabajo.usuario_empresa, TROZO_ESCRITURA)) {
                const c = caso('cuil', t.map((i) => [i.cuil, i.fecha]));
                const r = await vida.sync_query(
                    `UPDATE usuario_empresa SET Posible_fallecido = 1, Fecha_fallecido = COALESCE(Fecha_fallecido, ${c.sql}) WHERE cuil IN (?) AND (Posible_fallecido IS NULL OR Posible_fallecido <> 1 OR Fecha_fallecido IS NULL)`,
                    c.params.concat([t.map((i) => i.cuil)]));
                out.usuario_empresa += r.affectedRows || 0;
                avisar('usuario_empresa ' + out.usuario_empresa);
            }
        }
        if (quiere('usuario') && analisis.trabajo.usuario.length) {
            // se guarda tambien el valor anterior de notificaciones (el boton del panel lo pone en 0 al marcar fallecido)
            const extra = new Map();
            for (const t of trozos(analisis.trabajo.usuario.map((i) => i.cuil), TROZO_LECTURA)) {
                const f = await vida.sync_query('SELECT cuil, notificaciones FROM usuario WHERE cuil IN (?)', [t]);
                f.forEach((x) => extra.set(String(x.cuil), x.notificaciones));
            }
            await registrar(vida, lote, 'usuario', analisis.trabajo.usuario, extra);
            for (const t of trozos(analisis.trabajo.usuario, TROZO_ESCRITURA)) {
                const c = caso('cuil', t.map((i) => [i.cuil, i.fecha]));
                const r = await vida.sync_query(
                    `UPDATE usuario SET fecha_fallecido = ${c.sql}, notificaciones = 0 WHERE cuil IN (?) AND fecha_fallecido IS NULL AND (estado IS NULL OR estado <> 'Error')`,
                    c.params.concat([t.map((i) => i.cuil)]));
                out.usuario += r.affectedRows || 0;
                avisar('usuario ' + out.usuario);
            }
        }
        return out;
    }

    // Deshace un lote: devuelve los valores de antes, pero solo donde nadie cambio nada desde la carga (la fecha sigue siendo la que puso el lote)
    async function revertir(lote) {
        await asegurarLog();
        const out = { master: 0, usuario_empresa: 0, usuario: 0, altas: 0 };
        // altas: solo se borran las filas que siguen siendo las minimas de la carga (si despues se completaron con otros datos, se conservan)
        let r = await padron.sync_query(
            `DELETE m FROM master m JOIN fallecidos_carga_log l ON l.cuil = m.CUIL AND l.lote = ? AND l.destino = '${DESTINO_ALTAS}'
             WHERE m.Apellido IS NULL AND m.Nombre IS NULL AND m.FechaNac IS NULL AND m.Sexo IS NULL`, [lote]);
        out.altas = r.affectedRows || 0;
        r = await padron.sync_query(
            `UPDATE master m JOIN fallecidos_carga_log l ON l.cuil = m.CUIL AND l.lote = ? AND l.destino = 'master'
             SET m.Fallecido = l.antes_marcado, m.FechaFalle = l.antes_fecha WHERE m.FechaFalle <=> COALESCE(l.antes_fecha, l.nueva_fecha)`, [lote]);
        out.master = r.affectedRows || 0;
        r = await vida.sync_query(
            `UPDATE usuario_empresa ue JOIN fallecidos_carga_log l ON l.cuil = ue.cuil AND l.lote = ? AND l.destino = 'usuario_empresa'
             SET ue.Posible_fallecido = l.antes_marcado, ue.Fecha_fallecido = l.antes_fecha WHERE ue.Fecha_fallecido <=> COALESCE(l.antes_fecha, l.nueva_fecha)`, [lote]);
        out.usuario_empresa = r.affectedRows || 0;
        r = await vida.sync_query(
            `UPDATE usuario u JOIN fallecidos_carga_log l ON l.cuil = u.cuil AND l.lote = ? AND l.destino = 'usuario'
             SET u.fecha_fallecido = NULL, u.notificaciones = COALESCE(l.antes_extra, u.notificaciones) WHERE u.fecha_fallecido <=> l.nueva_fecha`, [lote]);
        out.usuario = r.affectedRows || 0;
        return out;
    }

    return { analizar, aplicar, revertir, asegurarLog, registrarLote, marcarRevertido, listarLotes, loteExiste };
};

module.exports.DESTINOS = DESTINOS;
module.exports.DESTINO_ALTAS = DESTINO_ALTAS;
