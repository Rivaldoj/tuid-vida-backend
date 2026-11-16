// Motor de la carga mensual de fallecidos contra las bases LOCALES de prueba (vida_test y padron_test, puerto 3307, datos ficticios).
// Requiere: node test/db/setup.js
const assert = require('assert');
const util = require('util');
const mysql = require('mysql');
const { PERSONAS } = require('./setup');
const cuil = require('../../utils/cuil');
const { validarRegistros } = require('../../utils/fallecidosCarga');
const motor = require('../../services/vida/admin/cargaFallecidos');

const base = { host: '127.0.0.1', port: 3307, user: 'root', password: '', multipleStatements: true };
const poolVida = mysql.createPool(Object.assign({ database: 'vida_test' }, base));
const poolPadron = mysql.createPool(Object.assign({}, base));
const vida = { sync_query: util.promisify(poolVida.query).bind(poolVida) };
const raiz = { sync_query: util.promisify(poolPadron.query).bind(poolPadron) };

(async () => {
    await raiz.sync_query('CREATE DATABASE IF NOT EXISTS padron_test');
    const poolP = mysql.createPool(Object.assign({ database: 'padron_test' }, base));
    const padron = { sync_query: util.promisify(poolP.query).bind(poolP) };
    await padron.sync_query('DROP TABLE IF EXISTS master; DROP TABLE IF EXISTS fallecidos_carga_log;');
    await padron.sync_query('CREATE TABLE master (CUIL BIGINT UNSIGNED NOT NULL PRIMARY KEY, Apellido_Nombre VARCHAR(160) NULL, Apellido VARCHAR(60) NULL, Nombre VARCHAR(60) NULL, Sexo CHAR(1) NULL, DNI INT UNSIGNED NULL, FechaNac DATE NULL, Fallecido TINYINT UNSIGNED NULL, FechaFalle DATE NULL, IdLote TINYINT UNSIGNED NULL, KEY idx_dni (DNI))');
    await vida.sync_query('DROP TABLE IF EXISTS fallecidos_carga_log');

    const { ana, carlos, dora, beto } = PERSONAS;
    const elena = '27444444458';
    const mk27 = (dni) => { const b = '27' + String(dni).padStart(8, '0'); return b + cuil.checkDigit(b); };
    const sinPadron = (() => { for (let d = 70000000; ; d++) { const b = '20' + d; const x = cuil.checkDigit(b); if (x >= 0) return b + x; } })();

    // padron.master: ana y carlos sin marcar; dora ya marcada igual; elena marcada con OTRA fecha (conflicto); beto sin marcar pero fuera del archivo
    await padron.sync_query('INSERT INTO master (CUIL, Fallecido, FechaFalle) VALUES (?, 0, NULL), (?, NULL, NULL), (?, 1, "2026-09-01"), (?, 1, "2026-08-20"), (?, 0, NULL)',
        [ana.cuil, carlos.cuil, dora.cuil, elena, beto.cuil]);
    // usuario_empresa: dora ya marcada igual, elena con otra fecha; el resto vacio
    await vida.sync_query('UPDATE usuario_empresa SET Posible_fallecido = NULL, Fecha_fallecido = NULL');
    await vida.sync_query('UPDATE usuario_empresa SET Posible_fallecido = 1, Fecha_fallecido = "2026-09-01" WHERE cuil = ?', [dora.cuil]);
    await vida.sync_query('UPDATE usuario_empresa SET Posible_fallecido = 1, Fecha_fallecido = "2026-08-20" WHERE cuil = ?', [elena]);
    // usuario: todos vivos; carlos con notificaciones activas
    await vida.sync_query('UPDATE usuario SET fecha_fallecido = NULL, notificaciones = 1');

    const archivo = [
        { CUIL: Number(ana.cuil), FALLECIDO: 1, FECHAFALLE: new Date('2026-10-05T00:00:00Z') },
        { CUIL: Number(carlos.cuil), FALLECIDO: 1, FECHAFALLE: null },                              // sin fecha
        { CUIL: Number(dora.cuil), FALLECIDO: 1, FECHAFALLE: new Date('2026-09-01T00:00:00Z') },
        { CUIL: Number(elena), FALLECIDO: 1, FECHAFALLE: new Date('2026-08-15T00:00:00Z') },
        { CUIL: Number(sinPadron), FALLECIDO: 1, FECHAFALLE: new Date('2026-07-01T00:00:00Z'), APENOM: 'GOMEZ  MARTA', IDLOTE: 9 }
    ];
    const v = validarRegistros(archivo, '2026-11-16');
    assert.strictEqual(v.validos.length, 5);
    const m = motor.crear({ padron, vida });

    // 1) analisis: no escribe nada
    let an = await m.analizar(v.validos);
    assert.deepStrictEqual([an.master.coinciden, an.master.noEncontrados, an.master.marcar, an.master.igual, an.master.conflicto, an.master.completar], [4, 1, 2, 1, 1, 0]);
    assert.deepStrictEqual([an.usuario_empresa.personas, an.usuario_empresa.marcar, an.usuario_empresa.igual, an.usuario_empresa.conflicto], [4, 2, 1, 1]);
    // usuario: ana y dora se marcan; carlos no tiene fecha (aca la fecha ES la marca); elena no esta registrada
    assert.deepStrictEqual([an.usuario.coinciden, an.usuario.marcar, an.usuario.sinFecha, an.usuario.conflicto], [3, 2, 1, 0]);
    assert.deepStrictEqual(an.conflictos.map((c) => c.destino + ':' + c.cuil).sort(), ['master:' + elena, 'usuario_empresa:' + elena].sort());
    assert.deepStrictEqual(an.noEncontradosMaster, [sinPadron]);
    assert.strictEqual((await padron.sync_query('SELECT COUNT(*) n FROM master WHERE Fallecido = 1'))[0].n, 2, 'analizar no escribe');
    assert.strictEqual((await vida.sync_query('SELECT COUNT(*) n FROM usuario WHERE fecha_fallecido IS NOT NULL'))[0].n, 0);
    console.log('ok  analisis: cuenta lo que se marcaria, los conflictos y los que faltan, sin escribir');

    // 2) aplicar
    const LOTE = 'prueba-2026-10';
    let r = await m.aplicar(an, LOTE);
    assert.deepStrictEqual(r, { master: 2, usuario_empresa: 2, usuario: 2, altas: 0 });
    const mst = Object.fromEntries((await padron.sync_query('SELECT CUIL, Fallecido, DATE_FORMAT(FechaFalle, "%Y-%m-%d") f FROM master')).map((x) => [String(x.CUIL), x.Fallecido + '|' + x.f]));
    assert.strictEqual(mst[ana.cuil], '1|2026-10-05');
    assert.strictEqual(mst[carlos.cuil], '1|null', 'sin fecha en el archivo: se marca sin fecha');
    assert.strictEqual(mst[dora.cuil], '1|2026-09-01');
    assert.strictEqual(mst[elena], '1|2026-08-20', 'un conflicto de fecha NO se pisa');
    assert.strictEqual(mst[beto.cuil], '0|null', 'quien no esta en el archivo no se toca');
    const ue = Object.fromEntries((await vida.sync_query('SELECT cuil, Posible_fallecido p, DATE_FORMAT(Fecha_fallecido, "%Y-%m-%d") f FROM usuario_empresa')).map((x) => [String(x.cuil), x.p + '|' + x.f]));
    assert.strictEqual(ue[ana.cuil], '1|2026-10-05');
    assert.strictEqual(ue[carlos.cuil], '1|null');
    assert.strictEqual(ue[elena], '1|2026-08-20');
    assert.strictEqual(ue[beto.cuil], 'null|null');
    const us = Object.fromEntries((await vida.sync_query('SELECT cuil, DATE_FORMAT(fecha_fallecido, "%Y-%m-%d") f, notificaciones n FROM usuario')).map((x) => [String(x.cuil), x.f + '|' + x.n]));
    assert.strictEqual(us[ana.cuil], '2026-10-05|0', 'se marca con la fecha del padron y se apagan las notificaciones');
    assert.strictEqual(us[dora.cuil], '2026-09-01|0');
    assert.strictEqual(us[carlos.cuil], 'null|1', 'sin fecha no se marca en usuario');
    assert.strictEqual(us[beto.cuil], 'null|1');
    console.log('ok  aplicar: marca en los tres destinos, conserva las fechas existentes y no toca a nadie mas');

    // 3) repetible: volver a correrlo no cambia nada
    an = await m.analizar(v.validos);
    assert.deepStrictEqual([an.master.marcar, an.usuario_empresa.marcar, an.usuario.marcar], [0, 0, 0]);
    r = await m.aplicar(an, 'prueba-repetida');
    assert.deepStrictEqual(r, { master: 0, usuario_empresa: 0, usuario: 0, altas: 0 });
    console.log('ok  repetible: una segunda corrida no cambia nada');

    // 4) el log guarda los valores de antes
    const log = await padron.sync_query("SELECT destino, accion, antes_marcado, antes_fecha FROM fallecidos_carga_log WHERE lote = ? AND destino = 'master' ORDER BY cuil", [LOTE]);
    assert.strictEqual(log.length, 2);
    assert.ok(log.every((x) => x.accion === 'marcar' && x.antes_fecha === null));
    assert.strictEqual((await vida.sync_query('SELECT COUNT(*) n FROM fallecidos_carga_log WHERE lote = ?', [LOTE]))[0].n, 4, '2 usuario_empresa + 2 usuario');
    console.log('ok  cada cambio queda en fallecidos_carga_log con el valor de antes');

    // 5) revertir el lote: vuelve todo, y respeta lo que ya estaba
    const rv = await m.revertir(LOTE);
    assert.deepStrictEqual(rv, { master: 2, usuario_empresa: 2, usuario: 2, altas: 0 });
    const mst2 = Object.fromEntries((await padron.sync_query('SELECT CUIL, Fallecido, DATE_FORMAT(FechaFalle, "%Y-%m-%d") f FROM master')).map((x) => [String(x.CUIL), x.Fallecido + '|' + x.f]));
    assert.strictEqual(mst2[ana.cuil], '0|null');
    assert.strictEqual(mst2[carlos.cuil], 'null|null');
    assert.strictEqual(mst2[dora.cuil], '1|2026-09-01', 'lo que ya estaba antes de la carga se conserva');
    assert.strictEqual(mst2[elena], '1|2026-08-20');
    const us2 = Object.fromEntries((await vida.sync_query('SELECT cuil, fecha_fallecido f, notificaciones n FROM usuario')).map((x) => [String(x.cuil), String(x.f) + '|' + x.n]));
    assert.strictEqual(us2[ana.cuil], 'null|1', 'vuelven las notificaciones que tenia');
    assert.strictEqual((await vida.sync_query('SELECT Posible_fallecido p FROM usuario_empresa WHERE cuil = ?', [ana.cuil]))[0].p, null);
    console.log('ok  revertir: devuelve los valores de antes y respeta lo que ya estaba');

    // 6) si alguien cambio la fecha despues de la carga, revertir no la pisa
    await m.aplicar(await m.analizar(v.validos), 'otra');
    await padron.sync_query('UPDATE master SET FechaFalle = "2026-10-06" WHERE CUIL = ?', [ana.cuil]);
    await m.revertir('otra');
    assert.strictEqual((await padron.sync_query('SELECT Fallecido f, DATE_FORMAT(FechaFalle, "%Y-%m-%d") d FROM master WHERE CUIL = ?', [ana.cuil]))[0].d, '2026-10-06', 'un cambio posterior no se revierte');
    console.log('ok  revertir no pisa los cambios hechos despues de la carga');

    // 7) un destino por vez
    await m.revertir('otra');
    await vida.sync_query('UPDATE usuario SET fecha_fallecido = NULL, notificaciones = 1');
    await padron.sync_query('UPDATE master SET Fallecido = 0, FechaFalle = NULL WHERE CUIL = ?', [ana.cuil]);
    r = await m.aplicar(await m.analizar(v.validos), 'solo-master', ['master']);
    assert.ok(r.master >= 1 && r.usuario === 0 && r.usuario_empresa === 0);
    console.log('ok  se puede aplicar a un solo destino');

    // 8) altas: quien el archivo trae y el padron no tiene se da de alta PRIMERO (fila minima), con el DNI sacado del CUIL
    await vida.sync_query('UPDATE usuario SET fecha_fallecido = NULL, notificaciones = 1');
    await padron.sync_query('UPDATE master SET Fallecido = 0, FechaFalle = NULL WHERE CUIL = ?', [ana.cuil]);
    await padron.sync_query('DELETE FROM master WHERE CUIL = ?', [sinPadron]);
    // otro CUIL con el mismo DNI que el alta: se da de alta igual pero se avisa
    const dniAlta = parseInt(sinPadron.slice(2, 10), 10);
    await padron.sync_query('INSERT INTO master (CUIL, DNI, Fallecido) VALUES (?, ?, 0)', [mk27(dniAlta), dniAlta]);
    an = await m.analizar(v.validos);
    assert.deepStrictEqual(an.trabajo.altas.map((x) => x.cuil), [sinPadron]);
    assert.deepStrictEqual(an.altasDniRepetido, [sinPadron], 'el DNI ya existe en el padron con otro CUIL');
    r = await m.aplicar(an, 'con-altas', undefined, undefined, { altas: true });
    assert.strictEqual(r.altas, 1);
    const alta = (await padron.sync_query('SELECT Apellido_Nombre n, DNI d, Fallecido f, DATE_FORMAT(FechaFalle, "%Y-%m-%d") fe, IdLote l, Sexo s, Apellido a FROM master WHERE CUIL = ?', [sinPadron]))[0];
    assert.deepStrictEqual([alta.n, alta.d, alta.f, alta.fe, alta.l, alta.s, alta.a], ['GOMEZ MARTA', dniAlta, 1, '2026-07-01', 9, null, null], 'fila minima: sin inventar sexo ni apellido separado');
    assert.strictEqual((await m.analizar(v.validos)).trabajo.altas.length, 0, 'una vez dada de alta ya no es alta');
    console.log('ok  altas: el alta va primero, con el DNI del CUIL, sin inventar datos, y avisa el DNI repetido');

    // 9) revertir las altas: se borra la fila minima, pero NO si despues se completo con otros datos
    await padron.sync_query('UPDATE master SET Apellido = ? WHERE CUIL = ?', ['GOMEZ', sinPadron]);
    let rv2 = await m.revertir('con-altas');
    assert.strictEqual(rv2.altas, 0, 'la fila fue completada despues de la carga: se conserva');
    await padron.sync_query('UPDATE master SET Apellido = NULL WHERE CUIL = ?', [sinPadron]);
    rv2 = await m.revertir('con-altas');
    assert.strictEqual(rv2.altas, 1);
    assert.strictEqual((await padron.sync_query('SELECT COUNT(*) n FROM master WHERE CUIL = ?', [sinPadron]))[0].n, 0);
    console.log('ok  revertir las altas borra la fila minima y respeta la que ya se completo');

    await padron.sync_query('DROP TABLE fallecidos_carga_log; DROP TABLE master;');
    await vida.sync_query('DROP TABLE fallecidos_carga_log');
    console.log('\nTodas las pruebas de la carga de fallecidos pasaron.');
    poolVida.end(); poolPadron.end(); poolP.end();
    process.exit(0);
})().catch((e) => { console.error('FALLO:', e); process.exit(1); });
