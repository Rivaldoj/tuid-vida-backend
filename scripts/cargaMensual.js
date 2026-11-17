// Carga mensual completa, SIEMPRE en este orden: 1) padron (padronac.dbf -> padron.master)  2) fallecidos (pdfallem.dbf).
// Si el paso 1 falla, el paso 2 no se ejecuta (los fallecidos que faltan en el padron quedarian sin asignar).
//
//   node scripts/cargaMensual.js                    -> vista previa de los dos pasos (no escribe nada)
//   node scripts/cargaMensual.js --apply            -> aplica el paso 1 y, si salio bien, el paso 2
//   --padron <ruta>  (por defecto C:/TUID/DB_Actu/padronac.dbf)   --fallecidos <ruta>  (por defecto C:/TUID/DB_Actu/pdfallem.dbf)
//   --altas   (en el paso 2: da de alta los fallecidos que sigan sin estar en el padron)   --local   (base de prueba)
const path = require('path');
const { spawnSync } = require('child_process');

const a = { padron: 'C:/TUID/DB_Actu/padronac.dbf', fallecidos: 'C:/TUID/DB_Actu/pdfallem.dbf', apply: false, altas: false, local: false };
for (let i = 2; i < process.argv.length; i++) {
    const k = process.argv[i];
    if (k === '--padron') a.padron = process.argv[++i];
    else if (k === '--fallecidos') a.fallecidos = process.argv[++i];
    else if (k === '--apply') a.apply = true;
    else if (k === '--altas') a.altas = true;
    else if (k === '--local') a.local = true;
    else { console.error('Argumento desconocido: ' + k); process.exit(2); }
}

function paso(nombre, script, args) {
    console.log('\n==================== ' + nombre + ' ====================');
    const r = spawnSync(process.execPath, [path.join(__dirname, script)].concat(args), { stdio: 'inherit' });
    return r.status === 0;
}

const comunes = (a.apply ? ['--apply'] : []).concat(a.local ? ['--local'] : []);
if (!paso('PASO 1 de 2: padron (master)', 'actualizarPadron.js', ['--archivo', a.padron].concat(comunes))) {
    console.error('\nEl paso 1 fallo: NO se ejecuta la carga de fallecidos. Resolver y repetir.');
    process.exit(1);
}
if (!paso('PASO 2 de 2: fallecidos', 'cargarFallecidos.js', ['--archivo', a.fallecidos].concat(comunes, a.altas ? ['--altas'] : []))) {
    console.error('\nEl paso 2 fallo. El padron (paso 1) ya quedo cargado; se puede repetir solo la carga de fallecidos.');
    process.exit(1);
}
console.log('\nCarga mensual ' + (a.apply ? 'APLICADA' : 'vista previa terminada (no se escribio nada)') + '.');
