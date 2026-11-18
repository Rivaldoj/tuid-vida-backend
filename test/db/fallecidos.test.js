// Control de Fallecidos (usuario_empresa.Posible_fallecido = 1) contra la MySQL LOCAL de prueba. Requiere: node test/db/setup.js
const assert = require('assert');
const util = require('util');
const mysql = require('mysql');
const cuil = require('../../utils/cuil');

global.CONFIG = { get: () => ({}), has: () => false };
const pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: '', database: 'vida_test', multipleStatements: true });
const db = { sync_query: util.promisify(pool.query).bind(pool) };
const poolP = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: '', database: 'padron_test', multipleStatements: true });
const padron = { sync_query: util.promisify(poolP.query).bind(poolP) };
const srv = require('../../services/vida/admin/fallecidos').crear({ db, padron });
const srvSinPadron = require('../../services/vida/admin/fallecidos').crear({ db });

async function listar(user, query, servicio) {
    let out;
    await (servicio || srv).listar({ user, query: query || {} }, { status: () => ({ json: (j) => { out = j; } }) });
    return out;
}
const mk = (d) => { const base = '20' + d; return base + cuil.checkDigit(base); };

(async () => {
    await db.sync_query("DELETE FROM usuario_empresa WHERE empresa IN ('FALLE1', 'FALLE2')");
    const [a, b, c, d, e] = ['30000001', '30000003', '30000005', '30000006', '30000007'].map(mk);
    await db.sync_query(
        `INSERT INTO usuario_empresa (cuil, empresa, Posible_fallecido, Fecha_fallecido) VALUES
         (?, 'FALLE1', 1, '2026-10-05'), (?, 'FALLE1', 1, NULL), (?, 'FALLE1', 0, '2026-09-01'), (?, 'FALLE1', NULL, NULL), (?, 'FALLE2', 1, '2026-08-01')`, [a, b, c, d, e]);

    // 1) el Administrador de TUID elige la empresa: solo las marcadas con 1, mas recientes primero y las sin fecha al final
    let r = await listar({ empresa: 'TUID' }, { empresa: 'FALLE1' });
    assert.strictEqual(r.error, 0, JSON.stringify(r));
    assert.strictEqual(r.data.empresa, 'FALLE1');
    assert.strictEqual(r.data.total, 2);
    assert.deepStrictEqual(r.data.filas, [
        { cuil: a, posible_fallecido: true, fecha_fallecido: '2026-10-05' },
        { cuil: b, posible_fallecido: true, fecha_fallecido: null }
    ]);
    console.log('ok  TUID: solo Posible_fallecido = 1 de la empresa elegida, ordenado por fecha');

    // 2) una empresa cliente ve solo la suya, aunque pida otra
    r = await listar({ empresa: 'FALLE2' }, { empresa: 'FALLE1' });
    assert.strictEqual(r.data.empresa, 'FALLE2');
    assert.deepStrictEqual(r.data.filas.map((f) => f.cuil), [e]);
    console.log('ok  una empresa cliente solo ve la suya');

    // 3) sin empresa elegida (TUID) se avisa; una empresa sin casos devuelve la lista vacia
    assert.strictEqual((await listar({ empresa: 'TUID' }, {})).error, 1);
    r = await listar({ empresa: 'TUID' }, { empresa: 'NO_EXISTE' });
    assert.strictEqual(r.error, 0);
    assert.deepStrictEqual(r.data, { empresa: 'NO_EXISTE', total: 0, filas: [] });
    console.log('ok  sin empresa: aviso; sin casos: lista vacia');

    // 4) el padron es la fuente principal: quien figura fallecido en master aparece aunque usuario_empresa no tenga la marca (se pierde con cada listado nuevo)
    await padron.sync_query('DELETE FROM master WHERE CUIL IN (?)', [[c, d, a]]);
    await padron.sync_query("INSERT INTO master (CUIL, Apellido_Nombre, DNI, Fallecido, FechaFalle) VALUES (?, 'PRUEBA C', 30000005, 1, '2026-10-20'), (?, 'PRUEBA D', 30000006, 1, NULL), (?, 'PRUEBA A', 30000001, 1, '2026-10-06')", [c, d, a]);
    r = await listar({ empresa: 'TUID' }, { empresa: 'FALLE1' });
    assert.deepStrictEqual(r.data.filas, [
        { cuil: c, posible_fallecido: true, fecha_fallecido: '2026-10-20' },   // solo en master (en usuario_empresa figura 0)
        { cuil: a, posible_fallecido: true, fecha_fallecido: '2026-10-06' },   // en los dos: gana la fecha del padron
        { cuil: b, posible_fallecido: true, fecha_fallecido: null },           // solo marca en usuario_empresa
        { cuil: d, posible_fallecido: true, fecha_fallecido: null }            // en master sin fecha
    ]);
    assert.strictEqual(r.data.total, 4);
    // sin padron configurado, solo cuentan las marcas de usuario_empresa
    r = await listar({ empresa: 'TUID' }, { empresa: 'FALLE1' }, srvSinPadron);
    assert.deepStrictEqual(r.data.filas.map((f) => f.cuil), [a, b]);
    // una persona del padron que NO esta en el listado de la empresa no aparece
    await padron.sync_query("INSERT INTO master (CUIL, Apellido_Nombre, DNI, Fallecido, FechaFalle) VALUES (?, 'AJENO', 30000009, 1, '2026-01-01') ON DUPLICATE KEY UPDATE Fallecido = 1", [mk('30000009')]);
    r = await listar({ empresa: 'TUID' }, { empresa: 'FALLE1' });
    assert.strictEqual(r.data.total, 4);
    await padron.sync_query('DELETE FROM master WHERE CUIL IN (?)', [[c, d, a, mk('30000009')]]);
    console.log('ok  el informe toma tambien a los fallecidos del padron (master) que estan en el listado vigente de la empresa');

    await db.sync_query("DELETE FROM usuario_empresa WHERE empresa IN ('FALLE1', 'FALLE2')");
    console.log('\nTodas las pruebas del Control de Fallecidos pasaron.');
    pool.end(); poolP.end();
    process.exit(0);
})().catch((e) => { console.error('FALLO:', e); process.exit(1); });
