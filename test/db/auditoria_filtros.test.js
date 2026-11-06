// Prueba los filtros de la lista de Auditoria (empresa y auditor, sumados a fechas y rechazados) contra la MySQL LOCAL de prueba.
// Datos ficticios; sin AWS ni produccion. Requiere: node test/db/setup.js
const assert = require('assert');
const util = require('util');
const mysql = require('mysql');
const { PERSONAS } = require('./setup');

global.CONFIG = { get: () => ({ bucketName: 'x' }), has: () => false };
const Module = require('module');
const orig = Module._load;
Module._load = function (req) {
    if (/aws-sdk|utils\/(bucket|maps|slack|whatsapp|mail)$/.test(req)) {
        const dummy = function () { return dummyProxy; };
        const dummyProxy = new Proxy(dummy, { get: (t, k) => (k === 'then' ? undefined : dummyProxy), apply: () => dummyProxy, construct: () => dummyProxy });
        return dummyProxy;
    }
    return orig.apply(this, arguments);
};

const pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: '', database: 'vida_test' });
global.VIDA_DB = pool;
global.VIDA_DB.sync_query = util.promisify(pool.query).bind(pool);
const q = (sql, p) => VIDA_DB.sync_query(sql, p);
const auditoria = require('../../services/vida/admin/auditoria');

function listar(query) {
    return new Promise((resolve, reject) => {
        const res = { response: {}, status: () => ({ json: (j) => resolve(j) }) };
        res.status = (c) => ({ json: () => resolve(res.response) });
        auditoria.list({ query }, res, () => {});
        setTimeout(() => reject(new Error('sin respuesta')), 5000);
    });
}

(async () => {
    const { ana, beto, carlos, dora } = PERSONAS;
    // Datos: empresas, auditores y estados
    await q("INSERT INTO empresa (id, tipo, periodicidad) VALUES ('OTRABANCO','D',6)");
    await q("UPDATE usuario SET auditor='aud1@tuid.test', empresa='TESTBANCO' WHERE cuil IN (?, ?)", [ana.cuil, carlos.cuil]);
    await q("UPDATE usuario SET auditor=NULL, empresa='OTRABANCO' WHERE cuil = ?", [beto.cuil]);                  // registro pendiente
    await q("UPDATE usuario SET auditor='ALERTA:aud2@tuid.test', empresa='TESTBANCO' WHERE cuil = ?", [dora.cuil]); // registro rechazado
    const [u] = await q('SELECT id_usuario FROM usuario WHERE cuil = ?', [ana.cuil]);
    const ids = (await q('SELECT id_validacion FROM auditoria WHERE id_usuario = ? ORDER BY id_validacion LIMIT 3', [u.id_usuario])).map((r) => r.id_validacion);
    await q("UPDATE auditoria SET auditor='aud1@tuid.test', empresa='TESTBANCO' WHERE id_validacion = ?", [ids[0]]);
    await q("UPDATE auditoria SET auditor='Liveness',        empresa='OTRABANCO' WHERE id_validacion = ?", [ids[1]]);
    await q("UPDATE auditoria SET auditor='ALERTA:aud2@tuid.test', empresa='TESTBANCO' WHERE id_validacion = ?", [ids[2]]);
    await q("INSERT INTO cliente (email, empresa, rol, activo) VALUES ('aud1@tuid.test','TUID','A',1), ('aud2@tuid.test','TUID','U',1), ('baja@tuid.test','TUID','U',0), ('otro@banco.test','TESTBANCO','A',1)");

    // 1) sin filtros: pendientes (auditor nulo); incluye el registro pendiente de Beto
    let r = await listar({});
    assert.strictEqual(r.error, 0);
    assert.ok(r.data.some((x) => x.cuil === beto.cuil && x.tipo === 'registracion'));
    assert.ok(r.data.every((x) => x.auditor === null));
    console.log('ok  sin filtros: solo pendientes');

    // 2) por empresa
    r = await listar({ empresa: 'OTRABANCO' });
    assert.ok(r.data.length >= 1 && r.data.every((x) => x.empresa === 'OTRABANCO' || (x.empresa === null && x.empresar === 'OTRABANCO')), 'solo OTRABANCO');
    r = await listar({ empresa: 'TESTBANCO' });
    assert.ok(r.data.length >= 1 && r.data.every((x) => x.empresa === 'TESTBANCO'));
    console.log('ok  filtro por empresa');

    // 3) por auditor: lo que aprobo ese auditor; Liveness = aprobacion automatica
    r = await listar({ auditor: 'aud1@tuid.test' });
    assert.strictEqual(r.data.length, 1);
    assert.strictEqual(r.data[0].id_validacion, ids[0]);
    r = await listar({ auditor: 'Liveness' });
    assert.strictEqual(r.data.length, 1);
    assert.strictEqual(r.data[0].id_validacion, ids[1]);
    console.log('ok  filtro por auditor (incluye Liveness)');

    // 4) auditor + rechazados: lo que rechazo ese auditor
    r = await listar({ auditor: 'aud2@tuid.test', rechazados: 1 });
    // la registracion rechazada de Dora y la validacion rechazada de Ana
    assert.strictEqual(r.data.length, 2);
    assert.ok(r.data.every((x) => x.auditor === 'ALERTA:aud2@tuid.test'));
    assert.deepStrictEqual(r.data.map((x) => x.tipo).sort(), ['registracion', 'validacion']);
    r = await listar({ auditor: 'aud1@tuid.test', rechazados: 1 });
    assert.strictEqual(r.data.length, 0, 'aud1 no rechazo nada');
    console.log('ok  auditor + rechazados');

    // 5) combinados (empresa + auditor) y con fechas
    r = await listar({ auditor: 'Liveness', empresa: 'TESTBANCO' });
    assert.strictEqual(r.data.length, 0);
    r = await listar({ auditor: 'Liveness', empresa: 'OTRABANCO' });
    assert.strictEqual(r.data.length, 1);
    r = await listar({ auditor: 'Liveness', empresa: 'OTRABANCO', from: '2000-01-01', to: '2999-01-01' });
    assert.strictEqual(r.data.length, 1);
    r = await listar({ auditor: 'Liveness', empresa: 'OTRABANCO', from: '2999-01-01' });
    assert.strictEqual(r.data.length, 0, 'fuera del rango de fechas');
    r = await listar({ auditor: 'Liveness', tipo: 'validacion' });
    assert.strictEqual(r.data.length, 1);
    console.log('ok  filtros combinados con rango de fechas y tipo (orden correcto de parametros)');

    // 6) rechazados solos (como hoy)
    r = await listar({ rechazados: 1 });
    assert.ok(r.data.length >= 2 && r.data.every((x) => String(x.auditor).startsWith('ALERTA')));
    console.log('ok  rechazados solos siguen funcionando');

    // 7) inyeccion: se trata como texto
    r = await listar({ empresa: "x' OR '1'='1", auditor: "' OR 1=1 --" });
    assert.strictEqual(r.error, 0);
    assert.strictEqual(r.data.length, 0);
    console.log('ok  un valor malicioso se trata como texto (consulta parametrizada)');

    // 9) vista de APROBADAS: registraciones aprobadas + validaciones aprobadas (por un auditor o por Liveness); nunca pendientes ni rechazadas
    r = await listar({ estado: 'aprobadas' });
    assert.strictEqual(r.error, 0);
    assert.ok(r.data.every((x) => x.auditor && !String(x.auditor).startsWith('ALERTA')), 'solo aprobadas');
    assert.deepStrictEqual(r.data.filter((x) => x.tipo === 'validacion').map((x) => x.id_validacion).sort((a, b) => a - b), [ids[0], ids[1]]);
    assert.deepStrictEqual(r.data.filter((x) => x.tipo === 'registracion').map((x) => x.cuil).sort(), [ana.cuil, carlos.cuil].sort());
    r = await listar({ estado: 'aprobadas', auditor: 'Liveness' });
    assert.strictEqual(r.data.length, 1);
    assert.strictEqual(r.data[0].auditor, 'Liveness');
    r = await listar({ estado: 'aprobadas', auditor: 'aud1@tuid.test' });
    assert.strictEqual(r.data.length, 3, 'dos registraciones y una validacion aprobadas por aud1');
    r = await listar({ estado: 'aprobadas', empresa: 'OTRABANCO' });
    assert.deepStrictEqual(r.data.map((x) => x.id_validacion), [ids[1]]);
    r = await listar({ estado: 'aprobadas', tipo: 'registracion' });
    assert.strictEqual(r.data.length, 2);
    r = await listar({ estado: 'aprobadas', from: '2999-01-01' });
    assert.strictEqual(r.data.length, 0);
    r = await listar({ estado: 'aprobadas', empresa: "x' OR '1'='1", auditor: "' OR 1=1 --" });
    assert.strictEqual(r.data.length, 0);
    // estado=rechazadas equivale a rechazados=1; estado=pendientes es lo de siempre
    assert.strictEqual((await listar({ estado: 'rechazadas' })).data.length, (await listar({ rechazados: 1 })).data.length);
    assert.ok((await listar({ estado: 'pendientes' })).data.every((x) => x.auditor === null));
    console.log('ok  vista de aprobadas (registraciones y validaciones, por auditor / Liveness / empresa / fechas / tipo)');

    // 8) opciones de los combos
    const res = { response: {}, status: () => ({ json: () => {} }) };
    await auditoria.filtros({}, res, () => {});
    assert.deepStrictEqual(res.response.data.empresas.sort(), ['OTRABANCO', 'TESTBANCO']);
    assert.deepStrictEqual(res.response.data.auditores, ['aud1@tuid.test', 'aud2@tuid.test', 'Liveness']);
    console.log('ok  combos: empresas y auditores (administradores activos de TUID + Liveness)');

    console.log('\nTodas las pruebas de filtros de auditoria pasaron.');
    pool.end();
    process.exit(0);
})().catch((e) => { console.error('FALLO:', e); process.exit(1); });
