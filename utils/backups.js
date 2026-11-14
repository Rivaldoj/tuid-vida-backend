// Backups de las bases de datos (volcado SQL comprimido a S3 + copias de RDS). Ver scripts/sql/backups.sql.
// Las fuentes (backend, panel, app Android) las sube la PC de TUID a S3 (scripts/backup-pc.js) y aca solo se listan.
const zlib = require('zlib');
const { PassThrough } = require('stream');
const mysql = require('mysql');

const BUCKET_POR_DEFECTO = 'tuid-vida-backups-369680393310';
const REGION = 'us-east-1';
const ZONA = 'America/Argentina/Buenos_Aires';
const INSTANCIAS_RDS = ['tuid-vida']; // master (padron y master) vive replicada en la PC de TUID: no se respalda aca
const PREFIJO_SNAPSHOT = 'tuid-auto-';
const DIAS_SNAPSHOT = 28;
const LOTE_FILAS = 200;
const AVISO_DB_HORAS = 48;
const AVISO_FUENTES_DIAS = 10;

let enCurso = false;

function bucket() {
    try { if (global.CONFIG && CONFIG.has('backups.bucket')) return CONFIG.get('backups.bucket'); } catch (e) { /* por defecto */ }
    return BUCKET_POR_DEFECTO;
}
function s3() { const AWS = require('aws-sdk'); return new AWS.S3({ region: REGION }); }
function rds() { const AWS = require('aws-sdk'); return new AWS.RDS({ region: REGION }); }

// Fecha y hora en Argentina: { dia: 'YYYY-MM-DD', hora: 0-23, diaSemana: 0=domingo }
function ahoraArgentina(fecha) {
    const p = {};
    new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' })
        .formatToParts(fecha || new Date()).forEach((x) => { p[x.type] = x.value; });
    return { dia: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour), diaSemana: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) };
}

// ---------- configuracion ----------
async function leerConfig() {
    const rows = await VIDA_DB.sync_query("SELECT clave, valor FROM configuracion WHERE clave IN ('backup_activo','backup_hora')");
    const m = {}; rows.forEach((r) => { m[r.clave] = r.valor; });
    const hora = parseInt(m.backup_hora, 10);
    return { activo: String(m.backup_activo || 'ON').toUpperCase() !== 'OFF', hora: hora >= 0 && hora <= 23 ? hora : 3 };
}

function validarConfig(body) {
    const b = body || {};
    if (typeof b.activo !== 'boolean') return { error: 'Se debe indicar si los backups automáticos están activos' };
    const hora = Number(b.hora);
    if (!Number.isInteger(hora) || hora < 0 || hora > 23) return { error: 'La hora debe ser un número entero entre 0 y 23' };
    return { activo: b.activo, hora };
}

async function guardarConfig(c, usuario) {
    const nuevos = { backup_activo: c.activo ? 'ON' : 'OFF', backup_hora: String(c.hora) };
    for (const clave of Object.keys(nuevos)) {
        const rows = await VIDA_DB.sync_query('SELECT valor FROM configuracion WHERE clave = ?', [clave]);
        const anterior = rows.length ? rows[0].valor : null;
        if (anterior === nuevos[clave]) continue;
        await VIDA_DB.sync_query(
            `INSERT INTO configuracion (clave, valor, actualizado_por, actualizado_en) VALUES (?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE valor = VALUES(valor), actualizado_por = VALUES(actualizado_por), actualizado_en = VALUES(actualizado_en)`,
            [clave, nuevos[clave], usuario || null]);
        try {
            await VIDA_DB.sync_query('INSERT INTO configuracion_historial (clave, valor_anterior, valor_nuevo, usuario, fecha) VALUES (?, ?, ?, ?, NOW())',
                [clave, anterior, nuevos[clave], usuario || null]);
        } catch (e) { /* el historial no debe frenar el cambio */ }
    }
}

// ---------- volcado SQL ----------
const ESTADO_FECHAS = ['DATE', 'DATETIME', 'TIMESTAMP', 'NEWDECIMAL', 'LONGLONG', 'TIME'];
function castTipos(field, next) {
    return ESTADO_FECHAS.includes(field.type) ? field.string() : next();
}

function consulta(conn, sql, params) {
    return new Promise((resolve, reject) => conn.query(sql, params, (e, r) => (e ? reject(e) : resolve(r))));
}

function escribir(salida, texto) {
    if (salida.write(texto)) return Promise.resolve();
    return new Promise((resolve) => salida.once('drain', resolve));
}

// Vuelca una base completa (estructura y datos) como SQL a `salida` (un stream). Devuelve { tablas, filas }.
async function volcarBase(pool, nombreBase, salida) {
    const conn = await new Promise((res, rej) => pool.getConnection((e, c) => (e ? rej(e) : res(c))));
    let tablas = 0; let filas = 0;
    try {
        await consulta(conn, 'SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');
        await consulta(conn, 'START TRANSACTION WITH CONSISTENT SNAPSHOT');
        await escribir(salida, `-- Backup TuID de la base ${nombreBase} - ${new Date().toISOString()}\nSET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\nSET UNIQUE_CHECKS=0;\nSET SQL_MODE='NO_AUTO_VALUE_ON_ZERO';\n\n`);
        const lista = await consulta(conn, 'SHOW FULL TABLES');
        const clave = Object.keys(lista[0] || {})[0];
        const tipoCol = Object.keys(lista[0] || {})[1];
        const tablasBase = lista.filter((r) => r[tipoCol] === 'BASE TABLE').map((r) => r[clave]);
        const vistas = lista.filter((r) => r[tipoCol] !== 'BASE TABLE').map((r) => r[clave]);
        for (const t of tablasBase) {
            const id = mysql.escapeId(t);
            const create = (await consulta(conn, `SHOW CREATE TABLE ${id}`))[0]['Create Table'];
            await escribir(salida, `DROP TABLE IF EXISTS ${id};\n${create};\n\n`);
            let lote = []; let n = 0;
            const vaciar = async () => {
                if (!lote.length) return;
                await escribir(salida, `INSERT INTO ${id} VALUES ${lote.join(',\n')};\n`);
                lote = [];
            };
            await new Promise((resolve, reject) => {
                const q = conn.query({ sql: `SELECT * FROM ${id}`, typeCast: castTipos }).stream({ highWaterMark: 100 });
                q.on('data', (row) => {
                    lote.push('(' + Object.values(row).map((v) => (v === null ? 'NULL' : mysql.escape(v))).join(',') + ')');
                    n++;
                    if (lote.length >= LOTE_FILAS) { q.pause(); vaciar().then(() => q.resume(), reject); }
                });
                q.on('error', reject);
                q.on('end', () => vaciar().then(resolve, reject));
            });
            await escribir(salida, '\n');
            tablas++; filas += n;
        }
        for (const v of vistas) {
            const def = (await consulta(conn, `SHOW CREATE VIEW ${mysql.escapeId(v)}`))[0]['Create View'];
            await escribir(salida, `DROP VIEW IF EXISTS ${mysql.escapeId(v)};\n${def};\n\n`);
        }
        await escribir(salida, 'SET FOREIGN_KEY_CHECKS=1;\nSET UNIQUE_CHECKS=1;\n-- Fin del backup\n');
        await consulta(conn, 'COMMIT');
    } finally {
        conn.release();
    }
    return { tablas, filas };
}

// Sube un volcado a S3 sin pasarlo por memoria ni por disco. Devuelve { clave, bytes, tablas, filas }.
async function volcarASubir(pool, nombreBase, fecha) {
    const f = ahoraArgentina(fecha);
    const hh = String(new Date(fecha || Date.now()).toISOString()).slice(11, 16).replace(':', '');
    const clave = `db/${nombreBase}/${f.dia}_${hh}.sql.gz`;
    const gz = zlib.createGzip({ level: 6 });
    const entrada = new PassThrough();
    let bytes = 0;
    gz.on('data', () => {});
    const sal = new PassThrough();
    sal.on('data', (c) => { bytes += c.length; });
    entrada.pipe(gz).pipe(sal);
    const subida = s3().upload({ Bucket: bucket(), Key: clave, Body: sal, ServerSideEncryption: 'AES256', ContentType: 'application/gzip' }).promise();
    let resumen;
    try {
        resumen = await volcarBase(pool, nombreBase, entrada);
        entrada.end();
    } catch (err) {
        entrada.destroy(err);
        sal.destroy(err);
        subida.catch(() => {});
        throw err;
    }
    await subida;
    return { clave, bytes, tablas: resumen.tablas, filas: resumen.filas };
}

// ---------- registro ----------
async function abrir(tipo, origen, nombre, usuario, diaProgramado) {
    const r = await VIDA_DB.sync_query(
        'INSERT INTO backups (tipo, origen, nombre, estado, usuario, dia_programado, iniciado) VALUES (?, ?, ?, ?, ?, ?, NOW())',
        [tipo, origen, nombre, 'en_curso', usuario || null, diaProgramado || null]);
    return r.insertId;
}
async function cerrar(id, estado, datos) {
    const d = datos || {};
    await VIDA_DB.sync_query('UPDATE backups SET estado = ?, bytes = ?, clave_s3 = ?, detalle = ?, terminado = NOW() WHERE id = ?',
        [estado, d.bytes || null, d.clave || null, d.detalle ? String(d.detalle).slice(0, 500) : null, id]);
}

function basesRespaldadas() {
    const lista = [];
    if (global.VIDA_DB) lista.push({ nombre: 'tuid_vida', pool: global.VIDA_DB });
    if (global.AUTHENTICATOR_DB) lista.push({ nombre: 'auth_db', pool: global.AUTHENTICATOR_DB });
    return lista;
}

// Hace el backup SQL de cada base. origen: 'programado' | 'manual'.
async function ejecutarBases(origen, usuario) {
    const dia = origen === 'programado' ? ahoraArgentina().dia : null;
    const resultados = [];
    for (const b of basesRespaldadas()) {
        let id;
        try { id = await abrir('db', origen, b.nombre, usuario, dia); } catch (e) {
            if (e && e.code === 'ER_DUP_ENTRY') continue; // otro servidor ya lo hizo hoy
            throw e;
        }
        try {
            const r = await volcarASubir(b.pool, b.nombre);
            await cerrar(id, 'ok', { bytes: r.bytes, clave: r.clave, detalle: `${r.tablas} tablas, ${r.filas} filas` });
            resultados.push({ nombre: b.nombre, ok: true, clave: r.clave });
        } catch (err) {
            console.log('Backup', b.nombre, err);
            await cerrar(id, 'error', { detalle: err && err.message ? err.message : String(err) });
            resultados.push({ nombre: b.nombre, ok: false, error: err && err.message });
        }
    }
    return resultados;
}

// Copia (snapshot) de cada instancia de RDS y limpieza de las propias de mas de DIAS_SNAPSHOT dias.
async function ejecutarSnapshots(origen, usuario) {
    const dia = origen === 'programado' ? ahoraArgentina().dia : null;
    const cliente = rds();
    const stamp = ahoraArgentina().dia.replace(/-/g, '') + '-' + String(Date.now()).slice(-5);
    for (const inst of INSTANCIAS_RDS) {
        let id;
        try { id = await abrir('snapshot', origen, inst, usuario, dia); } catch (e) {
            if (e && e.code === 'ER_DUP_ENTRY') continue;
            throw e;
        }
        try {
            const nombre = `${PREFIJO_SNAPSHOT}${inst}-${stamp}`;
            await cliente.createDBSnapshot({ DBInstanceIdentifier: inst, DBSnapshotIdentifier: nombre }).promise();
            await cerrar(id, 'ok', { clave: nombre, detalle: 'Copia de RDS pedida (se completa en AWS)' });
            const viejos = await cliente.describeDBSnapshots({ DBInstanceIdentifier: inst, SnapshotType: 'manual' }).promise();
            const limite = Date.now() - DIAS_SNAPSHOT * 86400000;
            for (const s of viejos.DBSnapshots) {
                if (s.DBSnapshotIdentifier.startsWith(PREFIJO_SNAPSHOT) && s.SnapshotCreateTime && new Date(s.SnapshotCreateTime).getTime() < limite) {
                    await cliente.deleteDBSnapshot({ DBSnapshotIdentifier: s.DBSnapshotIdentifier }).promise().catch(() => {});
                }
            }
        } catch (err) {
            console.log('Snapshot', inst, err);
            await cerrar(id, 'error', { detalle: err && err.message ? err.message : String(err) });
        }
    }
}

function ejecutarEnSegundoPlano(tipo, origen, usuario) {
    if (enCurso) return false;
    enCurso = true;
    const tarea = tipo === 'snapshot' ? ejecutarSnapshots(origen, usuario) : ejecutarBases(origen, usuario);
    tarea.catch((e) => console.log('Backup', e)).then(() => { enCurso = false; });
    return true;
}

// Revisa si toca un backup automatico: una vez por dia a la hora configurada; las copias de RDS los domingos.
async function revisarProgramacion() {
    if (enCurso) return;
    try {
        const c = await leerConfig();
        if (!c.activo) return;
        const ahora = ahoraArgentina();
        if (ahora.hora < c.hora) return;
        ejecutarEnSegundoPlano('db', 'programado', null);
        if (ahora.diaSemana === 0) {
            // las copias de RDS van despues de terminar los volcados
            const espera = setInterval(() => { if (!enCurso) { clearInterval(espera); ejecutarEnSegundoPlano('snapshot', 'programado', null); } }, 30000);
            setTimeout(() => clearInterval(espera), 3 * 3600000);
        }
    } catch (e) { console.log('Backup (programacion)', e.message || e); }
}

let reloj = null;
function iniciar() {
    if (reloj) return;
    reloj = setInterval(revisarProgramacion, 10 * 60000);
    if (reloj.unref) reloj.unref();
    setTimeout(revisarProgramacion, 60000);
}

// ---------- consulta para el panel ----------
async function listarS3(prefijo, max) {
    const salida = [];
    let token;
    do {
        const r = await s3().listObjectsV2({ Bucket: bucket(), Prefix: prefijo, ContinuationToken: token }).promise();
        r.Contents.forEach((o) => { if (!o.Key.endsWith('/')) salida.push({ clave: o.Key, bytes: o.Size, fecha: o.LastModified }); });
        token = r.IsTruncated ? r.NextContinuationToken : null;
    } while (token && salida.length < 5000);
    salida.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    return salida.slice(0, max || 200);
}

function urlDescarga(clave) {
    if (!/^(db|fuentes)\/[A-Za-z0-9_.\/-]+$/.test(clave) || clave.includes('..')) throw new Error('Clave inválida');
    return s3().getSignedUrl('getObject', { Bucket: bucket(), Key: clave, Expires: 900,
        ResponseContentDisposition: `attachment; filename="${clave.split('/').pop()}"` });
}

// Estado general: ultimo backup correcto de cada tipo y si hay atraso (para avisar en el panel).
async function estado() {
    const [fuentes, dbs] = await Promise.all([
        listarS3('fuentes/', 200).catch(() => null),
        VIDA_DB.sync_query("SELECT MAX(terminado) ultimo FROM backups WHERE tipo = 'db' AND estado = 'ok'"),
    ]);
    const ultimoDb = dbs[0] && dbs[0].ultimo ? new Date(dbs[0].ultimo) : null;
    const ultimoFuentes = fuentes && fuentes.length ? new Date(fuentes[0].fecha) : null;
    const c = await leerConfig();
    return {
        config: c,
        ultimoDb, ultimoFuentes,
        dbAtrasado: c.activo && (!ultimoDb || Date.now() - ultimoDb.getTime() > AVISO_DB_HORAS * 3600000),
        fuentesAtrasadas: !ultimoFuentes || Date.now() - ultimoFuentes.getTime() > AVISO_FUENTES_DIAS * 86400000,
        enCurso,
    };
}

module.exports = { leerConfig, validarConfig, guardarConfig, volcarBase, volcarASubir, ejecutarBases, ejecutarSnapshots, ejecutarEnSegundoPlano,
    revisarProgramacion, iniciar, listarS3, urlDescarga, estado, ahoraArgentina, bucket, estaEnCurso: () => enCurso };
