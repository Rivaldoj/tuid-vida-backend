// Actualizacion mensual del padron contra la base LOCAL de prueba (padron_test, puerto 3307, datos ficticios): lectura de un DBF como el real
// (CP850, fechas de 50 caracteres), altas, completar vacios, no pisar datos, deshacer.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const util = require('util');
const mysql = require('mysql');
const iconv = require('iconv-lite');
const cuil = require('../../utils/cuil');
const { leer, convertir } = require('../../utils/padronMensual');
const motorCrear = require('../../services/vida/admin/cargaPadron').crear;

const base = { host: '127.0.0.1', port: 3307, user: 'root', password: '', multipleStatements: true };

// Escribe un DBF minimo con los campos del padron mensual
function escribirDbf(ruta, filas) {
    const campos = [['CUIL', 'N', 18], ['APENOM', 'C', 192], ['IDACTIVIDA', 'N', 18], ['BAJA', 'C', 50], ['FECHANACI', 'C', 50], ['SEXO', 'C', 50], ['CP', 'N', 18],
        ['IDPROVIN', 'C', 50], ['FECHAFALL', 'C', 50], ['FALLECIDO', 'N', 18], ['FECHANAC', 'D', 50], ['DNI', 'N', 18], ['OB', 'N', 18], ['APELLIDO', 'C', 50], ['NOMBRE', 'C', 50], ['IDLOTE', 'N', 18]];
    const largoReg = 1 + campos.reduce((s, c) => s + c[2], 0);
    const largoCab = 32 + 32 * campos.length + 1;
    const cab = Buffer.alloc(32);
    cab[0] = 3; cab.writeUInt32LE(filas.length, 4); cab.writeUInt16LE(largoCab, 8); cab.writeUInt16LE(largoReg, 10); cab[29] = 2;
    const desc = Buffer.alloc(32 * campos.length + 1);
    campos.forEach((c, i) => { desc.write(c[0], i * 32, 'latin1'); desc[i * 32 + 11] = c[1].charCodeAt(0); desc[i * 32 + 16] = c[2]; });
    desc[desc.length - 1] = 0x0d;
    const regs = filas.map((f) => {
        const b = Buffer.alloc(largoReg, 0x20);
        let o = 1;
        campos.forEach((c) => { const t = iconv.encode(String(f[c[0]] == null ? '' : f[c[0]]), 'cp850'); t.copy(b, o, 0, Math.min(t.length, c[2])); o += c[2]; });
        return b;
    });
    fs.writeFileSync(ruta, Buffer.concat([cab, desc].concat(regs)));
}

const mk = (dni, pre) => { const b = (pre || '27') + String(dni).padStart(8, '0'); return b + cuil.checkDigit(b); };

(async () => {
    const raiz = mysql.createPool(base);
    await util.promisify(raiz.query).bind(raiz)('CREATE DATABASE IF NOT EXISTS padron_test');
    const pool = mysql.createPool(Object.assign({ database: 'padron_test' }, base));
    const padron = { sync_query: util.promisify(pool.query).bind(pool) };
    await padron.sync_query('DROP TABLE IF EXISTS master; DROP TABLE IF EXISTS padron_carga_log; DROP TABLE IF EXISTS padron_carga_lotes; DROP TABLE IF EXISTS fallecidos_carga_log; DROP TABLE IF EXISTS actividad;');
    await padron.sync_query('CREATE TABLE actividad (IdActividad INT UNSIGNED PRIMARY KEY, Actividad VARCHAR(50) NULL)');
    await padron.sync_query('INSERT INTO actividad VALUES (960990, "x")');
    await padron.sync_query('CREATE TABLE master (CUIL BIGINT UNSIGNED NOT NULL PRIMARY KEY, Apellido_Nombre VARCHAR(160) NULL, Apellido VARCHAR(60) NULL, Nombre VARCHAR(60) NULL, Sexo CHAR(1) NULL, DNI INT UNSIGNED NULL, ' +
        'IdActividad MEDIUMINT UNSIGNED NULL, Baja CHAR(1) NULL, FechaNac DATE NULL, CP SMALLINT UNSIGNED NULL, IdProvincia CHAR(1) NULL, FechaFalle DATE NULL, Fallecido TINYINT UNSIGNED NULL, OB TINYINT UNSIGNED DEFAULT 0, IdLote TINYINT UNSIGNED NULL, KEY idx_dni (DNI))');

    const nueva1 = mk(71000001), nueva2 = mk(71000002), fallecida = mk(20000003, '20'), existente = mk(71000004), igual = mk(71000005);
    // master: 'existente' es un alta minima (como las de la carga de fallecidos) con fallecido marcado; 'igual' ya esta completa
    await padron.sync_query('INSERT INTO master (CUIL, Apellido_Nombre, DNI, Fallecido, FechaFalle, IdLote) VALUES (?, "VIEJO NOMBRE", 71000004, 1, "2026-09-09", 4)', [existente]);
    await padron.sync_query('INSERT INTO master (CUIL, Apellido_Nombre, Apellido, Nombre, Sexo, DNI, FechaNac, CP, IdProvincia, IdLote) VALUES (?, "IGUAL UNO", "IGUAL", "UNO", "M", 71000005, "2020-01-01", 1000, "C", 3)', [igual]);

    const ruta = path.join(os.tmpdir(), 'padronac_test.dbf');
    escribirDbf(ruta, [
        { CUIL: nueva1, APENOM: 'PEÑA ACOSTA JANNA', IDACTIVIDA: 0, FECHANACI: '2026-06-11', SEXO: 'F', CP: 3355, IDPROVIN: 'N', FALLECIDO: '', FECHANAC: '20260611', DNI: 71000001, OB: 0, APELLIDO: 'PEÑA ACOSTA', NOMBRE: 'JANNA', IDLOTE: 18 },
        { CUIL: nueva2, APENOM: 'DIAZ NOAH', IDACTIVIDA: 960990, BAJA: '1', FECHANACI: '2026-07-01', SEXO: 'D', CP: 0, IDPROVIN: 'x', FECHAFALL: '', FALLECIDO: '', FECHANAC: '20260701', OB: '', APELLIDO: 'DIAZ', NOMBRE: 'NOAH', IDLOTE: 5 },
        { CUIL: fallecida, APENOM: 'ROJAS ANA', FECHANACI: '1950-02-03', SEXO: 'f', CP: 1000, IDPROVIN: 'B', FECHAFALL: '20260815', FALLECIDO: 1, FECHANAC: '19500203', DNI: 20000003, OB: 0, APELLIDO: 'ROJAS', NOMBRE: 'ANA', IDLOTE: 7 },
        { CUIL: existente, APENOM: 'NOMBRE NUEVO', FECHANACI: '2026-05-05', SEXO: 'M', CP: 2000, IDPROVIN: 'S', FALLECIDO: 1, FECHAFALL: '20260909', FECHANAC: '20260505', DNI: 71000004, APELLIDO: 'NOMBRE', NOMBRE: 'NUEVO', IDLOTE: 9 },
        { CUIL: igual, APENOM: 'IGUAL UNO', FECHANACI: '2020-01-01', SEXO: 'M', CP: 1000, IDPROVIN: 'C', FECHANAC: '20200101', DNI: 71000005, APELLIDO: 'IGUAL', NOMBRE: 'UNO', IDLOTE: 3 },
        { CUIL: '27123456781', APENOM: 'CUIL MALO' },                          // digito verificador invalido
        { CUIL: nueva1, APENOM: 'REPETIDO' },                                 // repetido en el archivo
        { CUIL: mk(71000009), APENOM: '' }                                    // sin nombre
    ]);

    // lectura: CP850 -> texto correcto, fechas de 50 caracteres, cantidad de registros
    const leidas = [];
    const info = await leer(ruta, async (f) => { leidas.push(...f); }, 3);
    assert.strictEqual(info.registros, 8);
    assert.strictEqual(info.codificacion, 'cp850');
    assert.strictEqual(leidas[0].APENOM, 'PEÑA ACOSTA JANNA');
    assert.strictEqual(leidas[0].FECHANAC, '20260611');

    const actividades = new Set([960990]);
    const validas = [], malas = [];
    const vistos = new Set();
    for (const g of leidas) { const r = convertir(g, actividades); if (r.error) malas.push(r.error); else if (!vistos.has(r.fila.cuil)) { vistos.add(r.fila.cuil); validas.push(r.fila); } }
    assert.deepStrictEqual(malas, ['CUIL con digito verificador invalido', 'Sin apellido y nombre']);
    assert.strictEqual(validas.length, 5);
    const f1 = validas.find((f) => f.cuil === Number(nueva1)), f2 = validas.find((f) => f.cuil === Number(nueva2)), ff = validas.find((f) => f.cuil === Number(fallecida));
    assert.strictEqual(f1.idActividad, null, 'actividad 0 -> NULL');
    assert.strictEqual(f2.idActividad, 960990); assert.strictEqual(f2.baja, '1'); assert.strictEqual(f2.sexo, 'X', "'D' del archivo = 'X'");
    assert.strictEqual(f2.cp, null, 'CP 0 -> NULL'); assert.strictEqual(f2.idProvincia, 'X'); assert.strictEqual(f2.dni, 71000002, 'DNI vacio -> del CUIL');
    assert.strictEqual(ff.sexo, 'F'); assert.strictEqual(ff.fallecido, 1); assert.strictEqual(ff.fechaFalle, '2026-08-15');

    const m = motorCrear({ padron });
    const an = await m.analizar(validas);
    assert.deepStrictEqual([an.nuevas.length, an.completar.length, an.iguales, an.nuevasFallecidas], [3, 1, 1, 1]);
    assert.strictEqual((await padron.sync_query('SELECT COUNT(*) n FROM master'))[0].n, 2, 'analizar no escribe');

    const r = await m.aplicar(an, 'padron_prueba');
    await m.registrarLote({ lote: 'padron_prueba', archivo: 'padronac_test.dbf', resumen: 'prueba' });
    assert.deepStrictEqual(r, { altas: 3, completadas: 1 });
    assert.strictEqual(await m.loteExiste('padron_prueba'), true);
    const g = async (c) => (await padron.sync_query('SELECT * FROM master WHERE CUIL = ?', [c]))[0];
    const a1 = await g(nueva1);
    assert.strictEqual(a1.Apellido_Nombre, 'PEÑA ACOSTA JANNA'); assert.strictEqual(a1.IdLote, 18); assert.strictEqual(a1.Fallecido, 0); assert.strictEqual(a1.CP, 3355);
    const af = await g(fallecida);
    assert.strictEqual(af.Fallecido, 1); assert.strictEqual(String(af.FechaFalle.toISOString().slice(0, 10)), '2026-08-15');
    // la existente se completo SIN pisar nombre, fallecido, fecha ni lote
    const ex = await g(existente);
    assert.strictEqual(ex.Apellido_Nombre, 'VIEJO NOMBRE', 'no pisa el nombre existente');
    assert.strictEqual(ex.Sexo, 'M'); assert.strictEqual(ex.CP, 2000); assert.strictEqual(ex.Apellido, 'NOMBRE');
    assert.strictEqual(ex.Fallecido, 1); assert.strictEqual(ex.IdLote, 4, 'no cambia el lote');
    assert.strictEqual((await g(igual)).Nombre, 'UNO');

    // idempotente: repetir no cambia nada
    const an2 = await m.analizar(validas);
    assert.deepStrictEqual([an2.nuevas.length, an2.completar.length, an2.iguales], [0, 0, 5]);

    // deshacer: borra las altas del lote; las que recibieron una marca de fallecidos se conservan
    await padron.sync_query('CREATE TABLE fallecidos_carga_log (id INT AUTO_INCREMENT PRIMARY KEY, lote VARCHAR(40), cuil BIGINT)');
    await padron.sync_query('INSERT INTO fallecidos_carga_log (lote, cuil) VALUES ("otro", ?)', [fallecida]);
    const rv = await m.revertir('padron_prueba');
    assert.deepStrictEqual(rv, { altas: 2, conservadas: 1 });
    assert.strictEqual(await g(nueva1), undefined); assert.strictEqual(await g(nueva2), undefined);
    assert.ok(await g(fallecida), 'conservada: la toco una carga de fallecidos');
    assert.ok(await g(existente) && await g(igual), 'las que ya estaban no se borran');

    fs.unlinkSync(ruta);
    console.log('OK carga_padron');
    pool.end(); raiz.end();
})().catch((e) => { console.error(e); process.exit(1); });
