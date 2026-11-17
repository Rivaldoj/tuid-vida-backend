// Actualizacion mensual de padron.master con el padron del mes (padronac.dbf). Por defecto SOLO MIRA: no escribe nada.
//
//   node scripts/actualizarPadron.js                       -> vista previa con el archivo de C:/TUID/DB_Actu/padronac.dbf
//   node scripts/actualizarPadron.js --archivo <ruta>      -> otro archivo
//   node scripts/actualizarPadron.js --apply               -> aplica (altas y completar vacios)
//   node scripts/actualizarPadron.js --revertir <lote>     -> deshace las altas de un lote
//   --local usa la base de prueba (127.0.0.1:3307, padron_test) · --lote <texto> · --salida <carpeta de informes>
//
// ORDEN DEL MES: 1) este script (padron)  2) scripts/cargarFallecidos.js (fallecidos). Ver tambien scripts/cargaMensual.js, que hace los dos en orden.
const fs = require('fs');
const path = require('path');
const util = require('util');
const mysql = require('mysql');
const { leer, convertir } = require('../utils/padronMensual');
const motorCrear = require('../services/vida/admin/cargaPadron').crear;

const ARCHIVO_DEFECTO = 'C:/TUID/DB_Actu/padronac.dbf';

function argumentos(argv) {
    const a = { archivo: ARCHIVO_DEFECTO, salida: path.join(path.dirname(ARCHIVO_DEFECTO), 'informes') };
    for (let i = 2; i < argv.length; i++) {
        const k = argv[i];
        if (k === '--archivo') a.archivo = argv[++i];
        else if (k === '--apply') a.apply = true;
        else if (k === '--local') a.local = true;
        else if (k === '--lote') a.lote = argv[++i];
        else if (k === '--revertir') a.revertir = argv[++i];
        else if (k === '--salida') a.salida = argv[++i];
        else { console.error('Argumento desconocido: ' + k); process.exit(2); }
    }
    return a;
}

function configPadron(local) {
    if (local) return { host: '127.0.0.1', port: 3307, user: 'root', password: '', database: 'padron_test', connectTimeout: 10000 };
    const d = require('../config/default.json');
    let l = {};
    const rutaLocal = process.env.TUID_CONFIG_LOCAL || path.join(__dirname, '..', '..', 'secrets', 'backend-produccion-local.json');
    try { l = JSON.parse(fs.readFileSync(rutaLocal, 'utf8')); } catch (e) { /* sin archivo local: solo default.json */ }
    return Object.assign({}, d.padron.db, (l.padron && l.padron.db) || {}, { ssl: { rejectUnauthorized: false }, connectTimeout: 15000 });
}

const n = (x) => String(x).padStart(8, ' ');
const csv = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';

(async () => {
    const a = argumentos(process.argv);
    const c = mysql.createConnection(configPadron(a.local));
    const q = util.promisify(c.query).bind(c);
    const padron = { sync_query: (sql, p) => q({ sql, timeout: 10 * 60 * 1000, values: p }) };
    const m = motorCrear({ padron });
    try {
        if (a.revertir) {
            console.log('Revirtiendo el lote ' + a.revertir + ' ...');
            const r = await m.revertir(a.revertir);
            console.log('Altas borradas: ' + r.altas + (r.conservadas ? ' · conservadas (ya tienen marca de fallecido; revertir primero esa carga): ' + r.conservadas : ''));
            return;
        }
        console.log('Archivo: ' + a.archivo + (a.local ? '   [BASE LOCAL DE PRUEBA]' : ''));
        const actividades = await m.actividades();
        const validas = [], descartadas = [];
        const vistos = new Set();
        let repetidos = 0;
        const info = await leer(a.archivo, async (filas, hechos, total) => {
            for (const g of filas) {
                const r = convertir(g, actividades);
                if (r.error) { descartadas.push({ cuil: g.CUIL, motivo: r.error, apenom: g.APENOM }); continue; }
                if (vistos.has(r.fila.cuil)) { repetidos++; continue; }
                vistos.add(r.fila.cuil);
                validas.push(r.fila);
            }
            if (hechos % 50000 < 5000) process.stdout.write('\r  leyendo ' + hechos + ' de ' + total + '   ');
        });
        console.log('\n\nARCHIVO (codificacion ' + info.codificacion + ')');
        console.log('  registros leidos ......' + n(info.registros));
        console.log('  validos ...............' + n(validas.length));
        console.log('  descartados ...........' + n(descartadas.length) + (descartadas.length ? '   (ver el informe)' : ''));
        console.log('  CUIL repetidos ........' + n(repetidos));
        const sinSexo = validas.filter((f) => !f.sexo).length, sinNac = validas.filter((f) => !f.fechaNac).length;
        console.log('  sin sexo / sin fecha de nacimiento: ' + sinSexo + ' / ' + sinNac + ' (se cargan igual)');

        const an = await m.analizar(validas);
        console.log('\npadron.master');
        console.log('  ALTAS (no estan) ......' + n(an.nuevas.length) + '   de ellas fallecidas: ' + an.nuevasFallecidas);
        console.log('  A COMPLETAR (ya estan, con datos vacios) ' + n(an.completar.length));
        console.log('  ya estaban completas ..' + n(an.iguales));

        const lote = a.lote || ('padron_' + new Date().toISOString().slice(0, 10));
        fs.mkdirSync(a.salida, { recursive: true });
        const informe = path.join(a.salida, lote + '.csv');
        const lineas = ['Tipo;CUIL;Detalle'];
        descartadas.forEach((d) => lineas.push(['Descartado', d.cuil, d.motivo + ' (' + (d.apenom || '') + ')'].map(csv).join(';')));
        an.completar.forEach((x) => lineas.push(['A completar', x.fila.cuil, x.campos.join(', ')].map(csv).join(';')));
        fs.writeFileSync(informe, '\ufeff' + lineas.join('\r\n'));
        console.log('\nInforme de revision: ' + informe + ' (' + (lineas.length - 1) + ' filas)');

        if (!a.apply) {
            console.log('\nSOLO MIRAR: no se escribio nada. Para aplicar, repetir el comando con --apply  (lote: ' + lote + ').');
            console.log('Despues del padron, correr la carga de fallecidos (scripts/cargarFallecidos.js).');
            return;
        }
        if (await m.loteExiste(lote)) { console.error('El lote ' + lote + ' ya existe. Usar --lote con otro nombre, o --revertir ' + lote + ' primero.'); process.exit(2); }
        console.log('\nAPLICANDO el lote ' + lote + ' ...');
        const t0 = Date.now();
        let ultimo = '';
        const r = await m.aplicar(an, lote, (t) => { if (t !== ultimo && /\b\d*000$/.test(t)) { ultimo = t; process.stdout.write('\r  ' + t + '        '); } });
        await m.registrarLote({ lote, archivo: path.basename(a.archivo), resumen: 'altas ' + r.altas + ', completadas ' + r.completadas + ' (' + validas.length + ' registros)' });
        console.log('\nListo en ' + Math.round((Date.now() - t0) / 1000) + ' s. Altas: ' + r.altas + ' · completadas: ' + r.completadas);
        console.log('Para deshacerlo:  node scripts/actualizarPadron.js --revertir ' + lote + (a.local ? ' --local' : ''));
        console.log('SIGUIENTE PASO: node scripts/cargarFallecidos.js --archivo <pdfallem.dbf>');
    } finally {
        c.end();
    }
})().catch((e) => { console.error('ERROR:', e.code || e.message); process.exit(1); });
