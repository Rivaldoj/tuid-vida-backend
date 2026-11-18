// scripts/corregirFechaFallecidoUsuario.js: pasa usuario.fecha_fallecido a la fecha real del padron, con registro para deshacer. MySQL LOCAL de prueba.
// Requiere: node test/db/setup.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const mysql = require('mysql');
const util = require('util');
const { PERSONAS } = require('./setup');

const pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: '', database: 'vida_test', dateStrings: true });
const q = util.promisify(pool.query).bind(pool);
const script = path.join(__dirname, '../../scripts/corregirFechaFallecidoUsuario.js');
const correr = (...args) => execFileSync('node', [script, '--local', ...args], { encoding: 'utf8' });
const fecha = async (cuil) => String((await q('SELECT fecha_fallecido f FROM usuario WHERE cuil = ?', [cuil]))[0].f).slice(0, 10);

(async () => {
    const { ana, beto, carlos, dora } = PERSONAS;
    await q('UPDATE usuario SET fecha_fallecido = NULL');
    await q('UPDATE usuario SET fecha_fallecido = ? WHERE cuil = ?', ['2025-08-31', ana.cuil]);    // posterior al archivo (fecha de deteccion)
    await q('UPDATE usuario SET fecha_fallecido = ? WHERE cuil = ?', ['2024-01-05', beto.cuil]);   // anterior al archivo
    await q('UPDATE usuario SET fecha_fallecido = ? WHERE cuil = ?', ['2025-05-31', carlos.cuil]); // se modifica a mano despues del informe
    await q("UPDATE usuario SET fecha_fallecido = ?, estado = 'Error' WHERE cuil = ?", ['2025-06-30', dora.cuil]);
    const csv = ['﻿Tipo;Destino;CUIL;Fecha en la base;Fecha en el archivo;Detalle',
        `"Conflicto de fecha";"usuario";"${ana.cuil}";"2025-08-31";"2025-01-21";"No se modifica"`,
        `"Conflicto de fecha";"usuario";"${beto.cuil}";"2024-01-05";"2024-03-02";"No se modifica"`,
        `"Conflicto de fecha";"usuario";"${carlos.cuil}";"2025-04-30";"2025-02-10";"No se modifica"`,
        `"Conflicto de fecha";"usuario";"${dora.cuil}";"2025-06-30";"2025-03-03";"No se modifica"`,
        '"Conflicto de fecha";"master";"20000000001";"2020-01-01";"2020-01-02";"x"',
        '"Descartado";"";"123";"";"";"CUIL invalido"'].join('\r\n');
    const informe = path.join(os.tmpdir(), 'informe_fecha_usuario.csv');
    fs.writeFileSync(informe, csv);

    // 1) solo mirar: no escribe
    let out = correr('--informe', informe);
    assert.ok(/a corregir \.+ 2 /.test(out), out);
    assert.ok(out.includes('SOLO MIRAR'));
    assert.strictEqual(await fecha(ana.cuil), '2025-08-31');
    console.log('ok  solo mirar: no escribe');

    // 2) aplicar: corrige solo lo que sigue como en el informe; no toca la modificada a mano, ni Error, ni otros destinos
    correr('--informe', informe, '--apply', '--lote', 'test_fecha');
    assert.strictEqual(await fecha(ana.cuil), '2025-01-21');
    assert.strictEqual(await fecha(beto.cuil), '2024-03-02');
    assert.strictEqual(await fecha(carlos.cuil), '2025-05-31', 'cambio a mano despues del informe: no se toca');
    assert.strictEqual(await fecha(dora.cuil), '2025-06-30', 'estado Error: no se toca');
    console.log('ok  aplicar: corrige a la fecha del padron y respeta lo modificado a mano y el estado Error');

    // 3) el lote no se puede repetir con el mismo nombre
    assert.throws(() => correr('--informe', informe, '--apply', '--lote', 'test_fecha'));
    console.log('ok  un lote no se aplica dos veces');

    // 4) deshacer devuelve la fecha anterior
    out = correr('--revertir', 'test_fecha');
    assert.ok(out.includes('2 fechas'), out);
    assert.strictEqual(await fecha(ana.cuil), '2025-08-31');
    assert.strictEqual(await fecha(beto.cuil), '2024-01-05');
    assert.strictEqual(await fecha(carlos.cuil), '2025-05-31');
    console.log('ok  deshacer devuelve las fechas anteriores');

    await q("UPDATE usuario SET fecha_fallecido = NULL, estado = NULL");
    fs.unlinkSync(informe);
    console.log('\nTodas las pruebas de la correccion de fechas pasaron.');
    pool.end();
})().catch((e) => { console.error('FALLO:', e); process.exit(1); });
