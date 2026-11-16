// Servicio del panel "Carga de fallecidos" (analizar / aplicar en segundo plano / cargas anteriores / revertir) con el motor real
// contra las bases LOCALES de prueba (vida_test y padron_test). El lector de DBF se reemplaza por uno de mentira. Requiere: node test/db/setup.js
const assert = require('assert');
const util = require('util');
const mysql = require('mysql');
const { PERSONAS } = require('./setup');
const cuil = require('../../utils/cuil');
const panelMod = require('../../services/vida/admin/cargaFallecidosPanel');

const base = { host: '127.0.0.1', port: 3307, user: 'root', password: '', multipleStatements: true };
const poolVida = mysql.createPool(Object.assign({ database: 'vida_test' }, base));
const poolRaiz = mysql.createPool(Object.assign({}, base));
const vida = { sync_query: util.promisify(poolVida.query).bind(poolVida) };
const raiz = { sync_query: util.promisify(poolRaiz.query).bind(poolRaiz) };

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
async function llamar(handler, req) {
    let out;
    await handler(Object.assign({ body: {}, params: {}, user: { email: 'admin@tuid.test', empresa: 'TUID', rol: 'A' } }, req), { status: () => ({ json: (j) => { out = j; } }) });
    return out;
}
async function terminar(srv, id) {
    for (let i = 0; i < 100; i++) {
        const r = await llamar(srv.estado, { params: { id } });
        if (r.error === 0 && r.data.estado !== 'en_curso') return r.data;
        await esperar(50);
    }
    throw new Error('el trabajo no termino');
}

(async () => {
    await raiz.sync_query('CREATE DATABASE IF NOT EXISTS padron_test');
    const poolP = mysql.createPool(Object.assign({ database: 'padron_test' }, base));
    const padron = { sync_query: util.promisify(poolP.query).bind(poolP) };
    await padron.sync_query('DROP TABLE IF EXISTS master; DROP TABLE IF EXISTS fallecidos_carga_log;');
    await padron.sync_query('CREATE TABLE master (CUIL BIGINT UNSIGNED NOT NULL PRIMARY KEY, Apellido_Nombre VARCHAR(160) NULL, Apellido VARCHAR(60) NULL, Nombre VARCHAR(60) NULL, Sexo CHAR(1) NULL, DNI INT UNSIGNED NULL, FechaNac DATE NULL, Fallecido TINYINT UNSIGNED NULL, FechaFalle DATE NULL, IdLote TINYINT UNSIGNED NULL, KEY idx_dni (DNI))');
    await vida.sync_query('DROP TABLE IF EXISTS fallecidos_carga_log; DROP TABLE IF EXISTS fallecidos_carga_lotes');
    await vida.sync_query('UPDATE usuario_empresa SET Posible_fallecido = NULL, Fecha_fallecido = NULL');
    await vida.sync_query('UPDATE usuario SET fecha_fallecido = NULL, notificaciones = 1');

    const { ana, carlos, dora } = PERSONAS;
    const nuevo = (() => { for (let d = 70000000; ; d++) { const b = '20' + d; const x = cuil.checkDigit(b); if (x >= 0) return b + x; } })();
    await padron.sync_query('INSERT INTO master (CUIL, Fallecido) VALUES (?, 0), (?, 0), (?, 0)', [ana.cuil, carlos.cuil, dora.cuil]);

    let filas = [
        { CUIL: Number(ana.cuil), FALLECIDO: 1, FECHAFALLE: new Date('2026-10-05T00:00:00Z'), APENOM: 'PRUEBA ANA MARIA', IDLOTE: 3 },
        { CUIL: Number(carlos.cuil), FALLECIDO: 1, FECHAFALLE: new Date('2026-10-06T00:00:00Z'), APENOM: 'ALDIA CARLOS', IDLOTE: 4 },
        { CUIL: Number(nuevo), FALLECIDO: 1, FECHAFALLE: new Date('2026-09-01T00:00:00Z'), APENOM: 'GOMEZ MARTA', IDLOTE: 9 },
        { CUIL: '20123456787', FALLECIDO: 1, FECHAFALLE: null, APENOM: 'MAL CUIL', IDLOTE: 1 }                  // se descarta
    ];
    let campos = ['CUIL', 'APENOM', 'FALLECIDO', 'FECHAFALLE', 'FECHAACTU', 'IDLOTE', 'OB'];
    const srv = panelMod.crear({ padron, vida, leerDbf: async () => ({ filas, campos, registros: filas.length }) });
    const archivo = (nombre, size) => ({ path: 'uploads/no-existe-' + Math.random(), originalname: nombre, size: size || 2000 });

    // 1) errores de la subida
    assert.strictEqual((await llamar(srv.analizar, {})).error, 1);
    assert.ok((await llamar(srv.analizar, { file: archivo('datos.csv') })).data.includes('DBF'));
    assert.ok((await llamar(srv.analizar, { file: archivo('pdfallet.dbf', 988 * 1024 * 1024) })).data.includes('25 MB'));
    campos = ['CUIL', 'FALLECIDO'];
    assert.ok((await llamar(srv.analizar, { file: archivo('x.dbf') })).data.includes('FECHAFALLE'), 'avisa que campo falta');
    campos = ['CUIL', 'APENOM', 'FALLECIDO', 'FECHAFALLE', 'FECHAACTU', 'IDLOTE', 'OB'];
    const mal = panelMod.crear({ padron, vida, leerDbf: async () => { throw new Error('no es dbf'); } });
    assert.ok((await llamar(mal.analizar, { file: archivo('roto.dbf') })).data.includes('DBF válido'));
    console.log('ok  errores de subida: sin archivo, extension, tamano, campos que faltan, archivo roto');

    // 2) vista previa: cuenta, no escribe, devuelve el informe
    let r = await llamar(srv.analizar, { file: archivo('pdfallem.dbf') });
    assert.strictEqual(r.error, 0, JSON.stringify(r));
    const d = r.data;
    assert.deepStrictEqual([d.archivo.leidos, d.archivo.validos, d.archivo.descartados], [4, 3, 1]);
    assert.deepStrictEqual([d.master.coinciden, d.master.marcar, d.master.noEncontrados, d.altas], [2, 2, 1, 1]);
    assert.strictEqual(d.usuario_empresa.personas, 2);
    assert.strictEqual(d.usuario.marcar, 2);
    assert.deepStrictEqual(d.informe.descartados.map((x) => x.motivo), ['CUIL inválido']);
    assert.deepStrictEqual(d.informe.altas, [{ cuil: nuevo, dniRepetido: false }]);
    assert.ok(/^[0-9a-f]{24}$/.test(d.cargaId));
    assert.strictEqual((await padron.sync_query('SELECT COUNT(*) n FROM master WHERE Fallecido = 1'))[0].n, 0, 'la vista previa no escribe');
    console.log('ok  vista previa: cuenta lo que cambiaria y arma el informe, sin escribir');

    // 3) aplicar: corre en segundo plano, con las altas
    let a = await llamar(srv.aplicar, { body: { cargaId: d.cargaId, altas: true } });
    assert.strictEqual(a.error, 0, JSON.stringify(a));
    assert.ok(/^\d{4}-\d{2}-\d{2}_pdfallem$/.test(a.data.lote), a.data.lote);
    const t = await terminar(srv, a.data.trabajoId);
    assert.strictEqual(t.estado, 'listo', JSON.stringify(t));
    assert.deepStrictEqual(t.resultado, { master: 2, usuario_empresa: 2, usuario: 2, altas: 1 });
    assert.strictEqual((await padron.sync_query('SELECT COUNT(*) n FROM master WHERE Fallecido = 1'))[0].n, 3, 'master: 2 marcados + 1 alta');
    assert.strictEqual((await padron.sync_query('SELECT Apellido_Nombre n, IdLote l FROM master WHERE CUIL = ?', [nuevo]))[0].n, 'GOMEZ MARTA');
    console.log('ok  aplicar en segundo plano: marca en los tres destinos y da de alta, primero');

    // 4) una vista previa se aplica una sola vez; otra persona no puede usar la de otra
    assert.ok((await llamar(srv.aplicar, { body: { cargaId: d.cargaId } })).data.includes('venció'));
    r = await llamar(srv.analizar, { file: archivo('pdfallem.dbf') });
    assert.strictEqual(r.data.master.marcar, 0, 'ya estaban marcados');
    const ajena = await llamar(srv.aplicar, { user: { email: 'otro@tuid.test', empresa: 'TUID', rol: 'A' }, body: { cargaId: r.data.cargaId } });
    assert.ok(ajena.data.includes('otra persona'));
    console.log('ok  la vista previa se usa una sola vez y es de quien la hizo');

    // 5) cargas anteriores: quien, cuando, archivo y resumen
    let l = await llamar(srv.lotes, {});
    assert.strictEqual(l.error, 0);
    assert.strictEqual(l.data.length, 1);
    assert.deepStrictEqual([l.data[0].lote, l.data[0].usuario, l.data[0].archivo, l.data[0].revertido], [a.data.lote, 'admin@tuid.test', 'pdfallem.dbf', false]);
    assert.ok(l.data[0].resumen.includes('altas 1') && l.data[0].filas > 0);
    console.log('ok  cargas anteriores con usuario, archivo y resumen');

    // 6) mismo nombre de archivo el mismo dia: el lote no se repite
    filas = [{ CUIL: Number(dora.cuil), FALLECIDO: 1, FECHAFALLE: new Date('2026-10-07T00:00:00Z'), APENOM: 'DESAPROBADA DORA', IDLOTE: 5 }];
    await padron.sync_query('INSERT INTO master (CUIL, Fallecido) VALUES (?, 0)', [mk('27', '55555555')]).catch(() => {});
    r = await llamar(srv.analizar, { file: archivo('pdfallem.dbf') });
    a = await llamar(srv.aplicar, { body: { cargaId: r.data.cargaId } });
    assert.ok(/_pdfallem_2$/.test(a.data.lote), 'segundo lote del dia: ' + a.data.lote);
    const t2 = await terminar(srv, a.data.trabajoId);
    assert.strictEqual(t2.resultado.altas, 0, 'sin la opcion de altas no se da de alta a nadie');
    console.log('ok  el nombre del lote no se repite');

    // 7) una sola escritura a la vez
    filas = [{ CUIL: Number(ana.cuil), FALLECIDO: 1, FECHAFALLE: new Date('2026-10-05T00:00:00Z'), APENOM: 'X', IDLOTE: 1 }];
    const lenta = panelMod.crear({ padron: { sync_query: async (...x) => { await esperar(80); return padron.sync_query(...x); } }, vida, leerDbf: async () => ({ filas: [{ CUIL: Number(carlos.cuil), FALLECIDO: 1, FECHAFALLE: new Date('2026-10-09T00:00:00Z'), APENOM: 'Y', IDLOTE: 2 }], campos, registros: 1 }) });
    await padron.sync_query('UPDATE master SET Fallecido = 0, FechaFalle = NULL WHERE CUIL = ?', [carlos.cuil]);
    await vida.sync_query('UPDATE usuario SET fecha_fallecido = NULL WHERE cuil = ?', [carlos.cuil]);
    r = await llamar(lenta.analizar, { file: archivo('lento.dbf') });
    const primero = await llamar(lenta.aplicar, { body: { cargaId: r.data.cargaId } });
    assert.strictEqual(primero.error, 0);
    r = await llamar(lenta.analizar, { file: archivo('lento2.dbf') });
    const segundo = await llamar(lenta.aplicar, { body: { cargaId: r.data.cargaId } });
    assert.ok(segundo.data.includes('otra carga en curso'));
    assert.ok((await llamar(lenta.revertir, { body: { lote: 'x' } })).data.includes('otra carga en curso'));
    await terminar(lenta, primero.data.trabajoId);
    console.log('ok  una sola escritura a la vez');

    // 8) revertir desde el panel: deshace, queda marcada como revertida y no se revierte dos veces
    const lote1 = (await llamar(srv.lotes, {})).data.find((x) => /pdfallem$/.test(x.lote)).lote;
    let rv = await llamar(srv.revertir, { body: { lote: lote1 } });
    assert.strictEqual(rv.error, 0, JSON.stringify(rv));
    const tr = await terminar(srv, rv.data.trabajoId);
    assert.strictEqual(tr.estado, 'listo');
    // Carlos se modifico DESPUES de esa carga (paso 7): la reversion no lo toca; solo se deshace lo que sigue como lo dejo la carga
    assert.deepStrictEqual([tr.resultado.altas, tr.resultado.master, tr.resultado.usuario], [1, 1, 1]);
    assert.strictEqual((await padron.sync_query('SELECT COUNT(*) n FROM master WHERE CUIL = ?', [nuevo]))[0].n, 0, 'la alta se borro');
    l = await llamar(srv.lotes, {});
    assert.strictEqual(l.data.find((x) => x.lote === lote1).revertido, true);
    assert.ok((await llamar(srv.revertir, { body: { lote: lote1 } })).data.includes('ya fue revertida'));
    assert.ok((await llamar(srv.revertir, { body: { lote: 'no-existe' } })).data.includes('No se encontró'));
    assert.ok((await llamar(srv.revertir, { body: { lote: "x'; DROP TABLE master;--" } })).data.includes('inválido'));
    console.log('ok  revertir desde el panel: deshace, queda marcada y no se repite; rechaza lotes raros');

    // 9) trabajo inexistente
    assert.strictEqual((await llamar(srv.estado, { params: { id: 'nada' } })).error, 1);

    await padron.sync_query('DROP TABLE fallecidos_carga_log; DROP TABLE master;');
    await vida.sync_query('DROP TABLE fallecidos_carga_log; DROP TABLE fallecidos_carga_lotes');
    console.log('\nTodas las pruebas de la carga de fallecidos del panel pasaron.');
    poolVida.end(); poolRaiz.end(); poolP.end();
    process.exit(0);

    function mk(p, d) { const b = p + d; return b + cuil.checkDigit(b); }
})().catch((e) => { console.error('FALLO:', e); process.exit(1); });
