// Carga mensual de fallecidos desde el DBF del padron (pdfallem.dbf). Por defecto SOLO MIRA: muestra que cambiaria y no escribe nada.
//
//   node scripts/cargarFallecidos.js --archivo C:/TUID/DB_Actu/pdfallem.dbf                    (solo mirar)
//   node scripts/cargarFallecidos.js --archivo ... --apply                                      (escribir en los tres destinos)
//   node scripts/cargarFallecidos.js --archivo ... --apply --destinos master,usuario_empresa    (solo algunos destinos)
//   node scripts/cargarFallecidos.js --archivo ... --apply --altas                              (ademas da de alta en padron.master a quienes el archivo trae y el padron no tiene; las altas van PRIMERO)
//   node scripts/cargarFallecidos.js --revertir <lote>                                          (deshacer un lote ya aplicado)
//   agregar --local para correr contra la base de PRUEBA local (puerto 3307: vida_test y padron_test)
//
// Destinos: padron.master (Fallecido, FechaFalle), tuid_vida.usuario_empresa (Posible_fallecido, Fecha_fallecido), tuid_vida.usuario (fecha_fallecido).
// Nunca pisa una fecha ya cargada; cada cambio queda en fallecidos_carga_log para poder revertir. La conexion sale de config/default.json
// y, si existe, de C:/TUID/Carpetas de Apoyo/secrets/backend-produccion-local.json (variable TUID_CONFIG_LOCAL para otra ruta).
const fs = require('fs');
const path = require('path');
const util = require('util');
const mysql = require('mysql');
const { DBFFile } = require('dbffile');
const { validarRegistros } = require('../utils/fallecidosCarga');
const motor = require('../services/vida/admin/cargaFallecidos');

function argumentos(argv) {
    const a = { apply: false, altas: false, local: false, destinos: null, archivo: null, lote: null, revertir: null, salida: 'C:/TUID/DB_Actu/informes' };
    for (let i = 2; i < argv.length; i++) {
        const k = argv[i];
        if (k === '--apply') a.apply = true;
        else if (k === '--altas') a.altas = true;
        else if (k === '--local') a.local = true;
        else if (k === '--archivo') a.archivo = argv[++i];
        else if (k === '--lote') a.lote = argv[++i];
        else if (k === '--revertir') a.revertir = argv[++i];
        else if (k === '--salida') a.salida = argv[++i];
        else if (k === '--destinos') a.destinos = String(argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
        else { console.error('Argumento desconocido: ' + k); process.exit(2); }
    }
    return a;
}

function configBase(local) {
    if (local) {
        const base = { host: '127.0.0.1', port: 3307, user: 'root', password: '', connectTimeout: 10000 };
        return { padron: Object.assign({}, base, { database: 'padron_test' }), vida: Object.assign({}, base, { database: 'vida_test' }) };
    }
    const d = require('../config/default.json');
    let l = {};
    const rutaLocal = process.env.TUID_CONFIG_LOCAL || path.join(__dirname, '..', '..', 'secrets', 'backend-produccion-local.json');
    try { l = JSON.parse(fs.readFileSync(rutaLocal, 'utf8')); } catch (e) { /* sin archivo local: solo default.json */ }
    const sec = (k) => Object.assign({}, d[k].db, (l[k] && l[k].db) || {});
    const ssl = { ssl: { rejectUnauthorized: false }, connectTimeout: 15000 };
    return { padron: Object.assign(sec('padron'), ssl), vida: Object.assign(sec('vida'), ssl) };
}

// La base remota a veces corta la conexion (sobre todo si estuvo quieta mucho rato, como durante la comparacion de millones de registros): se
// reconecta y se reintenta. Las lecturas y los UPDATE de esta carga son repetibles; si un INSERT del log se repite, queda con los mismos valores de
// "antes" y deshacer el lote sigue funcionando igual.
const RECONECTAR = ['PROTOCOL_SEQUENCE_TIMEOUT', 'PROTOCOL_CONNECTION_LOST', 'ETIMEDOUT', 'ECONNRESET', 'EPIPE', 'ER_LOCK_WAIT_TIMEOUT', 'ER_LOCK_DEADLOCK'];

function conexion(cfg) {
    let c, q;
    const conectar = () => { c = mysql.createConnection(cfg); c.on('error', () => {}); q = util.promisify(c.query).bind(c); };
    conectar();
    return {
        sync_query: async (sql, p) => {
            for (let i = 1; ; i++) {
                try { return await q({ sql, timeout: 10 * 60 * 1000, values: p }); }
                catch (e) {
                    if (i >= 6 || !RECONECTAR.includes(e.code)) throw e;
                    console.log('\n  (' + e.code + ': reconectando, intento ' + i + ' de 5)');
                    try { c.destroy(); } catch (x) { /* ya cerrada */ }
                    await new Promise((r) => setTimeout(r, 5000 * i));
                    conectar();
                }
            }
        },
        end: () => { try { c.end(); } catch (x) { /* ya cerrada */ } }
    };
}

async function leerDbf(ruta) {
    // Un .csv con columnas CUIL;FECHAFALLE (fecha AAAA-MM-DD) tambien sirve: todos los registros se toman como fallecidos
    if (/\.csv$/i.test(ruta)) {
        const lineas = fs.readFileSync(ruta, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
        const cab = lineas.shift().split(';').map((s) => s.trim().toUpperCase());
        const ic = cab.indexOf('CUIL'), ifa = cab.indexOf('FECHAFALLE');
        if (ic < 0 || ifa < 0) return { filas: [], campos: cab };
        const filas = lineas.map((l) => { const x = l.split(';'); return { CUIL: x[ic].trim(), FALLECIDO: 1, FECHAFALLE: (x[ifa] || '').trim() }; });
        return { filas, campos: ['CUIL', 'FALLECIDO', 'FECHAFALLE'] };
    }
    const f = await DBFFile.open(ruta);
    const filas = [];
    for (;;) {
        const lote = await f.readRecords(50000);
        if (lote.length === 0) break;
        for (const r of lote) filas.push(r);
    }
    return { filas, campos: f.fields.map((x) => x.name) };
}

const n = (x) => String(x).padStart(8, ' ');
const csv = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';

(async () => {
    const a = argumentos(process.argv);
    const cfg = configBase(a.local);
    const padron = conexion(cfg.padron);
    const vida = conexion(cfg.vida);
    const m = motor.crear({ padron, vida });
    try {
        if (a.revertir) {
            console.log('Revirtiendo el lote ' + a.revertir + ' ...');
            const r = await m.revertir(a.revertir);
            await m.marcarRevertido(a.revertir);
            console.log('Revertido: altas ' + r.altas + ' · master ' + r.master + ' · usuario_empresa ' + r.usuario_empresa + ' · usuario ' + r.usuario);
            return;
        }
        if (!a.archivo) { console.error('Falta --archivo <ruta del DBF>.'); process.exit(2); }
        const destinos = a.destinos || motor.DESTINOS;
        const malos = destinos.filter((d) => !motor.DESTINOS.includes(d));
        if (malos.length) { console.error('Destino desconocido: ' + malos.join(', ') + ' (validos: ' + motor.DESTINOS.join(', ') + ')'); process.exit(2); }

        console.log('Archivo: ' + a.archivo + (a.local ? '   [BASE LOCAL DE PRUEBA]' : ''));
        const { filas, campos } = await leerDbf(a.archivo);
        for (const c of ['CUIL', 'FALLECIDO', 'FECHAFALLE']) if (!campos.includes(c)) { console.error('El archivo no tiene el campo ' + c + ' (campos: ' + campos.join(', ') + ').'); process.exit(2); }
        const v = validarRegistros(filas);
        console.log('\nARCHIVO');
        console.log('  registros leidos ......' + n(filas.length));
        console.log('  validos ...............' + n(v.validos.length));
        console.log('  invalidos .............' + n(v.invalidos.length) + (v.invalidos.length ? '   (se descartan; ver el informe)' : ''));
        console.log('  CUIL repetidos ........' + n(v.duplicados));

        const an = await m.analizar(v.validos);
        const fila = (t, x) => console.log('  ' + t.padEnd(26, '.') + n(x));
        console.log('\npadron.master');
        fila('estan en el padron', an.master.coinciden); fila('no estan en el padron (ALTAS)', an.master.noEncontrados); fila('altas con DNI ya existente', an.altasDniRepetido.length);
        fila('A MARCAR (nuevos)', an.master.marcar); fila('A COMPLETAR (sin fecha)', an.master.completar);
        fila('ya estaban igual', an.master.igual); fila('CONFLICTO de fecha', an.master.conflicto);
        if (an.master.noEncontrados > 0) console.log('  >> ATENCION: hay fallecidos que NO estan en el padron. Primero actualizar el padron mensual (node scripts/actualizarPadron.js, o scripts/cargaMensual.js que hace todo en orden).');
        console.log('tuid_vida.usuario_empresa');
        fila('personas', an.usuario_empresa.personas); fila('filas (empresas)', an.usuario_empresa.filas);
        fila('A MARCAR (personas)', an.usuario_empresa.marcar); fila('A COMPLETAR', an.usuario_empresa.completar);
        fila('ya estaban igual', an.usuario_empresa.igual); fila('CONFLICTO de fecha', an.usuario_empresa.conflicto);
        console.log('tuid_vida.usuario (registrados)');
        fila('coinciden', an.usuario.coinciden); fila('A MARCAR', an.usuario.marcar);
        fila('ya estaban igual', an.usuario.igual); fila('CONFLICTO de fecha', an.usuario.conflicto);
        fila('sin fecha (no se marca)', an.usuario.sinFecha); fila('con estado Error (se saltea)', an.usuario.conError);

        // informe con el detalle de lo que requiere revision
        const lote = a.lote || (new Date().toISOString().slice(0, 10) + '_' + path.basename(a.archivo).replace(/\.[^.]+$/, ''));
        fs.mkdirSync(a.salida, { recursive: true });
        const informe = path.join(a.salida, 'fallecidos_' + lote + '.csv');
        const lineas = ['Tipo;Destino;CUIL;Fecha en la base;Fecha en el archivo;Detalle'];
        v.invalidos.forEach((i) => lineas.push(['Descartado', '', i.cuil, '', '', i.motivo].map(csv).join(';')));
        an.conflictos.forEach((c) => lineas.push(['Conflicto de fecha', c.destino, c.cuil, c.actual, c.archivo, 'No se modifica'].map(csv).join(';')));
        const repetidos = new Set(an.altasDniRepetido);
        an.noEncontradosMaster.forEach((c) => lineas.push([repetidos.has(c) ? 'Alta con DNI ya existente' : 'No esta en el padron', 'master', c, '', '',
            repetidos.has(c) ? 'El DNI ya figura en el padron con otro CUIL: revisar' : (a.altas ? 'Se da de alta con --altas' : 'No se actualiza (usar --altas para darlo de alta)')].map(csv).join(';')));
        fs.writeFileSync(informe, '\ufeff' + lineas.join('\r\n'));
        console.log('\nInforme de revision: ' + informe + ' (' + (lineas.length - 1) + ' filas)');

        if (!a.apply) {
            console.log('\nSOLO MIRAR: no se escribio nada. Para aplicar, repetir el comando con --apply  (lote: ' + lote + ').');
            return;
        }
        console.log('\nAPLICANDO el lote ' + lote + ' en: ' + destinos.join(', ') + (a.altas ? ' (con altas en el padron, primero)' : '') + ' ...');
        const t0 = Date.now();
        let ultimo = '';
        const r = await m.aplicar(an, lote, destinos, (t) => { if (t !== ultimo && /\b\d*00$/.test(t)) { ultimo = t; process.stdout.write('\r  ' + t + '        '); } }, { altas: a.altas });
        await m.registrarLote({ lote, usuario: 'consola', archivo: path.basename(a.archivo),
            resumen: 'master ' + r.master + ', usuario_empresa ' + r.usuario_empresa + ', usuario ' + r.usuario + (a.altas ? ', altas ' + r.altas : '') + ' (' + v.validos.length + ' registros)' });
        console.log('\nListo en ' + Math.round((Date.now() - t0) / 1000) + ' s. Altas en el padron: ' + r.altas + ' · filas actualizadas: master ' + r.master + ' · usuario_empresa ' + r.usuario_empresa + ' · usuario ' + r.usuario);
        console.log('Para deshacerlo:  node scripts/cargarFallecidos.js --revertir ' + lote + (a.local ? ' --local' : ''));
    } finally {
        padron.end();
        vida.end();
    }
})().catch((e) => { console.error('ERROR:', e.code || e.message); process.exit(1); });
