// Pasa usuario.fecha_fallecido a la FECHA REAL de fallecimiento (la del padron) en los registrados cuya fecha difiere (los "conflictos de fecha" de la
// carga de fallecidos, que la carga nunca pisa). Por defecto SOLO MIRA. Guarda la fecha anterior en fallecidos_carga_log para poder deshacerlo.
//
//   node scripts/corregirFechaFallecidoUsuario.js --informe C:/TUID/DB_Actu/informes/fallecidos_2026-11-18_pdfallet.csv            (solo mirar)
//   node scripts/corregirFechaFallecidoUsuario.js --informe ... --apply [--lote nombre]
//   node scripts/corregirFechaFallecidoUsuario.js --revertir <lote>
//   agregar --local para la base de PRUEBA local (puerto 3307)
// El informe es el CSV que genera cargarFallecidos.js (filas "Conflicto de fecha" del destino usuario: CUIL, fecha en la base, fecha en el archivo).
// Solo se cambia si la fecha de la base sigue siendo la que figuraba en el informe (si alguien la modifico mientras tanto, no se toca) y la persona no
// tiene estado Error. No cambia "notificaciones".
const fs = require('fs');
const path = require('path');
const util = require('util');
const mysql = require('mysql');

const DESTINO = 'usuario_fecha';   // destino propio en el log: deshacer la carga de fallecidos NO toca estas filas
const ACCION = 'corregir';
const RECONECTAR = ['PROTOCOL_SEQUENCE_TIMEOUT', 'PROTOCOL_CONNECTION_LOST', 'ETIMEDOUT', 'ECONNRESET', 'EPIPE', 'ER_LOCK_WAIT_TIMEOUT', 'ER_LOCK_DEADLOCK'];

function argumentos(argv) {
    const a = { apply: false, local: false, informe: null, lote: null, revertir: null };
    for (let i = 2; i < argv.length; i++) {
        const k = argv[i];
        if (k === '--apply') a.apply = true;
        else if (k === '--local') a.local = true;
        else if (k === '--informe') a.informe = argv[++i];
        else if (k === '--lote') a.lote = argv[++i];
        else if (k === '--revertir') a.revertir = argv[++i];
        else { console.error('Argumento desconocido: ' + k); process.exit(2); }
    }
    return a;
}

function config(local) {
    if (local) return { host: '127.0.0.1', port: 3307, user: 'root', password: '', database: 'vida_test', connectTimeout: 10000, dateStrings: true };
    const d = require('../config/default.json');
    let l = {};
    const ruta = process.env.TUID_CONFIG_LOCAL || path.join(__dirname, '..', '..', 'secrets', 'backend-produccion-local.json');
    try { l = JSON.parse(fs.readFileSync(ruta, 'utf8')); } catch (e) { /* sin archivo local */ }
    return Object.assign({}, d.vida.db, (l.vida && l.vida.db) || {}, { ssl: { rejectUnauthorized: false }, connectTimeout: 15000, dateStrings: true });
}

function conexion(cfg) {
    let c, q;
    const conectar = () => { c = mysql.createConnection(cfg); c.on('error', () => {}); q = util.promisify(c.query).bind(c); };
    conectar();
    return {
        sync_query: async (sql, p) => {
            for (let i = 1; ; i++) {
                try { return await q({ sql, timeout: 4 * 60 * 1000, values: p }); }
                catch (e) {
                    if (i >= 6 || !RECONECTAR.includes(e.code)) throw e;
                    console.log('  (' + e.code + ': reconectando, intento ' + i + ' de 5)');
                    try { c.destroy(); } catch (x) { /* ya cerrada */ }
                    await new Promise((r) => setTimeout(r, 5000 * i));
                    conectar();
                }
            }
        },
        end: () => { try { c.end(); } catch (x) { /* ya cerrada */ } }
    };
}

function leerInforme(ruta) {
    const lineas = fs.readFileSync(ruta, 'utf8').replace(/^\ufeff/, '').split(/\r?\n/).filter((l) => l.trim());
    const out = [];
    for (const l of lineas.slice(1)) {
        const x = l.split(';').map((s) => s.replace(/^"|"$/g, ''));
        if (x[0] !== 'Conflicto de fecha' || x[1] !== 'usuario') continue;
        const antes = (x[3] || '').slice(0, 10), nueva = (x[4] || '').slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(antes) && /^\d{4}-\d{2}-\d{2}$/.test(nueva) && antes !== nueva) out.push({ cuil: x[2], antes, nueva });
    }
    return out;
}

const trozos = (a, n) => { const r = []; for (let i = 0; i < a.length; i += n) r.push(a.slice(i, i + n)); return r; };

(async () => {
    const a = argumentos(process.argv);
    const db = conexion(config(a.local));
    try {
        await db.sync_query('CREATE TABLE IF NOT EXISTS fallecidos_carga_log (id INT AUTO_INCREMENT PRIMARY KEY, fecha DATETIME NOT NULL, lote VARCHAR(40) NOT NULL, destino VARCHAR(20) NOT NULL, cuil BIGINT NOT NULL, accion VARCHAR(12) NOT NULL, antes_marcado TINYINT NULL, antes_fecha DATE NULL, antes_extra INT NULL, nueva_fecha DATE NULL, KEY (lote), KEY (cuil))');
        if (a.revertir) {
            const r = await db.sync_query(
                'UPDATE usuario u JOIN fallecidos_carga_log l ON l.cuil = u.cuil AND l.lote = ? AND l.destino = ? AND l.accion = ? ' +
                'SET u.fecha_fallecido = l.antes_fecha WHERE u.fecha_fallecido <=> l.nueva_fecha', [a.revertir, DESTINO, ACCION]);
            console.log('Revertido el lote ' + a.revertir + ': ' + (r.affectedRows || 0) + ' fechas devueltas a su valor anterior.');
            return;
        }
        if (!a.informe) { console.error('Falta --informe <CSV de la carga de fallecidos>.'); process.exit(2); }
        const filas = leerInforme(a.informe);
        console.log('Conflictos de fecha en el informe: ' + filas.length);
        // estado actual en la base
        const actual = new Map();
        for (const t of trozos(filas.map((f) => f.cuil), 2000)) {
            (await db.sync_query('SELECT cuil, fecha_fallecido, estado FROM usuario WHERE cuil IN (?)', [t])).forEach((r) => {
                const k = String(r.cuil);
                if (!actual.has(k)) actual.set(k, []);
                actual.get(k).push(r);
            });
        }
        const aCambiar = [], cambio = [], error = [], sinFila = [];
        for (const f of filas) {
            const rs = actual.get(f.cuil);
            if (!rs) { sinFila.push(f); continue; }
            if (rs.some((r) => r.estado === 'Error')) { error.push(f); continue; }
            if (rs.every((r) => String(r.fecha_fallecido || '').slice(0, 10) === f.antes)) aCambiar.push(f); else cambio.push(f);
        }
        const dias = aCambiar.map((f) => Math.round((Date.parse(f.antes) - Date.parse(f.nueva)) / 86400000));
        console.log('  a corregir ............ ' + aCambiar.length + (aCambiar.length ? '  (usuario posterior al archivo: ' + dias.filter((d) => d > 0).length + ' · anterior: ' + dias.filter((d) => d < 0).length + ')' : ''));
        console.log('  su fecha cambio desde el informe (no se toca) ' + cambio.length);
        console.log('  con estado Error (no se toca) ...... ' + error.length);
        console.log('  ya no estan en usuario ............. ' + sinFila.length);
        if (!a.apply) { console.log('\nSOLO MIRAR: no se escribio nada. Para aplicar, repetir con --apply.'); return; }
        const lote = a.lote || (new Date().toISOString().slice(0, 10) + '_fecha_usuario');
        const ya = await db.sync_query('SELECT COUNT(*) n FROM fallecidos_carga_log WHERE lote = ?', [lote]);
        if (Number(ya[0].n) > 0) { console.error('El lote ' + lote + ' ya existe: use otro nombre con --lote, o --revertir ' + lote + '.'); process.exit(2); }
        console.log('\nAPLICANDO el lote ' + lote + ' ...');
        let hechas = 0;
        for (const t of trozos(aCambiar, 500)) {
            // primero el log con la fecha de ANTES, despues el cambio
            await db.sync_query('INSERT INTO fallecidos_carga_log (fecha, lote, destino, cuil, accion, antes_marcado, antes_fecha, nueva_fecha) VALUES ' + t.map(() => '(NOW(), ?, ?, ?, ?, 1, ?, ?)').join(', '),
                [].concat(...t.map((f) => [lote, DESTINO, f.cuil, ACCION, f.antes, f.nueva])));
            const caso = 'CASE cuil ' + t.map(() => 'WHEN ? THEN ?').join(' ') + ' END';
            const r = await db.sync_query('UPDATE usuario SET fecha_fallecido = ' + caso + " WHERE cuil IN (?) AND fecha_fallecido IS NOT NULL AND (estado IS NULL OR estado <> 'Error')",
                [].concat(...t.map((f) => [f.cuil, f.nueva]), [t.map((f) => f.cuil)]));
            hechas += r.affectedRows || 0;
        }
        console.log('Listo. Fechas corregidas: ' + hechas);
        console.log('Para deshacerlo:  node scripts/corregirFechaFallecidoUsuario.js --revertir ' + lote + (a.local ? ' --local' : ''));
    } finally {
        db.end();
    }
})().catch((e) => { console.error('ERROR:', e.code || e.message); process.exit(1); });
