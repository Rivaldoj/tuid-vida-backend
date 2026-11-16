// Lee un DBF (FoxPro) completo en memoria: { filas, campos }. Pensado para el archivo mensual de fallecidos (decenas de miles de filas).
// El archivo grande del padron (millones de filas) NO se lee con esto: se carga con las herramientas de base de datos.
const { DBFFile } = require('dbffile');

async function leerDbf(ruta, maxFilas) {
    const f = await DBFFile.open(ruta);
    if (maxFilas && f.recordCount > maxFilas) {
        const e = new Error('El archivo tiene ' + f.recordCount + ' registros (maximo ' + maxFilas + ')');
        e.codigo = 'DEMASIADAS_FILAS';
        throw e;
    }
    const filas = [];
    for (;;) {
        const lote = await f.readRecords(50000);
        if (lote.length === 0) break;
        for (const r of lote) filas.push(r);
    }
    return { filas, campos: f.fields.map((x) => x.name), registros: f.recordCount };
}

module.exports = { leerDbf };
