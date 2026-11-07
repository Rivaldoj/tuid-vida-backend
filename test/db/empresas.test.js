// Prueba el ABM de Empresas y Administradores contra la MySQL LOCAL de prueba (sin envio real de correo).
// Requiere: node test/db/setup.js
const assert = require('assert');
const util = require('util');
const mysql = require('mysql');

global.CONFIG = { get: () => ({}), has: () => false };
const pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: '', database: 'vida_test', multipleStatements: true });
const db = { sync_query: util.promisify(pool.query).bind(pool) };
const U = require('../../utils/empresas');

async function llamar(handler, req) {
    let out;
    await handler(Object.assign({ query: {}, body: {}, params: {}, user: { email: 'admin@tuid.test' } }, req), { status: () => ({ json: (j) => { out = j; } }) });
    return out;
}

(async () => {
    // validaciones puras
    assert.strictEqual(U.normalizarId('  acme   sa '), 'ACME SA');
    assert.ok(U.idValido('ACME SA') && !U.idValido('A') && !U.idValido('-ACME') && !U.idValido('ACME;DROP'));
    assert.ok(U.emailValido('a@b.co') && !U.emailValido('sin-arroba') && !U.emailValido('a b@c.com'));
    assert.ok(U.validarEmpresa({ id: 'x', tipo: 'D', periodicidad: 6 }, ['D'], true).error, 'nombre corto');
    assert.ok(U.validarEmpresa({ id: 'ACME', tipo: 'Z', periodicidad: 6 }, ['D'], true).error, 'tipo invalido');
    assert.ok(U.validarEmpresa({ id: 'ACME', tipo: 'D', periodicidad: 0 }, ['D'], true).error, 'periodicidad');
    assert.ok(U.validarEmpresa({ id: 'ACME', tipo: 'D', periodicidad: 6, link: 'http://x.com' }, ['D'], true).error, 'solo https');
    assert.ok(!U.validarEmpresa({ id: 'acme', tipo: 'd', periodicidad: '6', link: 'https://acme.com' }, ['D'], true).error);
    assert.notStrictEqual(U.generarToken(), U.generarToken());
    console.log('ok  validaciones');

    await db.sync_query("DELETE FROM cliente WHERE empresa LIKE 'ACME%' OR email LIKE '%@acme.test'; DELETE FROM empresa WHERE id LIKE 'ACME%'");
    const [{ n: antes }] = await db.sync_query('SELECT COUNT(*) AS n FROM empresa');
    const correos = [];
    const srv = require('../../services/vida/admin/empresas').crear({
        db,
        enviar: async (plantilla, params, para) => { correos.push({ plantilla, params, para }); },
        urlPanel: () => 'https://panel.example.test'
    });

    // alta: empresa + administrador invitado, sin clave conocida
    let r = await llamar(srv.crear, { body: { id: 'acme sa', nombre: 'Acme Seguros S.A.', email: 'contacto@acme.test', costo_validacion: 0.35, visible: true, periodicidad: 6, link: 'https://acme.test', emails: true, admin_email: 'Jefe@Acme.test' } });
    assert.strictEqual(r.error, 0, JSON.stringify(r));
    const [e] = await db.sync_query("SELECT * FROM empresa WHERE id = 'ACME SA'");
    assert.ok(e && e.periodicidad === 6 && e.emails === 1 && e.direcciones === 0);
    assert.ok(e.tipo === 'E' && e.nombre === 'Acme Seguros S.A.' && e.email === 'contacto@acme.test' && e.costo_validacion === 0.35 && e.visible === 1, 'tipo por defecto E y campos nuevos');
    const [c] = await db.sync_query("SELECT * FROM cliente WHERE email = 'jefe@acme.test'");
    assert.ok(c && c.rol === 'A' && c.activo === 1 && c.empresa === 'ACME SA' && c.fecha_ultima === null);
    assert.ok(c.resetPasswordToken && c.resetPasswordExpires > new Date(Date.now() + 40 * 3600 * 1000), 'codigo vigente ~48h');
    assert.strictEqual(correos.length, 1);
    assert.strictEqual(correos[0].plantilla, 'invitacion_admin');
    assert.strictEqual(correos[0].para, 'jefe@acme.test');
    assert.strictEqual(correos[0].params.token, c.resetPasswordToken);
    assert.ok(!JSON.stringify(correos[0]).includes(c.password), 'el hash nunca viaja');
    console.log('ok  alta de empresa + administrador con codigo por correo');

    // duplicados y datos invalidos
    assert.strictEqual((await llamar(srv.crear, { body: { id: 'Acme SA', tipo: 'D', periodicidad: 6, admin_email: 'otro@acme.test' } })).error, 1, 'empresa repetida');
    assert.strictEqual((await llamar(srv.crear, { body: { id: 'ACME DOS', tipo: 'D', periodicidad: 6, admin_email: 'jefe@acme.test' } })).error, 1, 'correo repetido');
    assert.strictEqual((await db.sync_query("SELECT id FROM empresa WHERE id = 'ACME DOS'")).length, 0, 'no queda empresa a medias');
    assert.strictEqual((await llamar(srv.crear, { body: { id: 'ACME TRES', tipo: 'D', periodicidad: 6, admin_email: 'malo' } })).error, 1);
    assert.strictEqual(correos.length, 1);
    console.log('ok  duplicados y datos invalidos no crean nada');

    // listado con conteos
    r = await llamar(srv.listar, {});
    assert.strictEqual(r.error, 0);
    const fila = r.data.empresas.find((x) => x.id === 'ACME SA');
    assert.ok(fila && fila.administradores === 1 && fila.usuarios === 0);
    assert.ok(r.data.tipos.includes('D'));
    assert.strictEqual(r.data.empresas.length, antes + 1);

    // modificacion
    r = await llamar(srv.actualizar, { params: { id: 'acme sa' }, body: { periodicidad: 12, direcciones: true, link: '', nombre: 'Acme', costo_validacion: 0.5 } });
    assert.strictEqual(r.error, 0, JSON.stringify(r));
    const [e2] = await db.sync_query("SELECT * FROM empresa WHERE id = 'ACME SA'");
    assert.ok(e2.periodicidad === 12 && e2.direcciones === 1 && e2.link === null && e2.emails === 1 && e2.nombre === 'Acme' && e2.costo_validacion === 0.5);
    assert.strictEqual((await llamar(srv.actualizar, { params: { id: 'ACME SA' }, body: { email: 'malo' } })).error, 1);
    assert.strictEqual((await llamar(srv.actualizar, { params: { id: 'ACME SA' }, body: { costo_validacion: -1 } })).error, 1);
    assert.strictEqual((await llamar(srv.actualizar, { params: { id: 'NO EXISTE' }, body: { periodicidad: 3 } })).error, 1);
    assert.strictEqual((await llamar(srv.actualizar, { params: { id: 'ACME SA' }, body: { periodicidad: 999 } })).error, 1);
    assert.strictEqual((await llamar(srv.actualizar, { params: { id: 'ACME SA' }, body: { id: 'OTRO NOMBRE' } })).error, 1, 'el nombre no se cambia');
    console.log('ok  modificacion');

    // nuevo administrador / reinvitacion
    r = await llamar(srv.invitar, { params: { id: 'ACME SA' }, body: { email: 'segundo@acme.test' } });
    assert.strictEqual(r.error, 0);
    r = await llamar(srv.invitar, { params: { id: 'ACME SA' }, body: { email: 'jefe@acme.test' } });
    assert.strictEqual(r.error, 0);
    const [c2] = await db.sync_query("SELECT resetPasswordToken FROM cliente WHERE email = 'jefe@acme.test'");
    assert.notStrictEqual(c2.resetPasswordToken, c.resetPasswordToken, 'la reinvitacion renueva el codigo');
    assert.strictEqual((await db.sync_query("SELECT id_usuario FROM cliente WHERE email = 'jefe@acme.test'")).length, 1);
    assert.strictEqual((await llamar(srv.invitar, { params: { id: 'NO EXISTE' }, body: { email: 'x@acme.test' } })).error, 1);
    const [otra] = await db.sync_query("SELECT email FROM cliente WHERE empresa <> 'ACME SA' LIMIT 1");
    if (otra) assert.strictEqual((await llamar(srv.invitar, { params: { id: 'ACME SA' }, body: { email: otra.email } })).error, 1, 'no se roba un correo de otra empresa');
    console.log('ok  invitar / reinvitar administradores');

    // cuentas y estado
    r = await llamar(srv.cuentas, { params: { id: 'ACME SA' } });
    assert.strictEqual(r.data.length, 2);
    assert.ok(r.data.every((x) => x.invitacion_vigente === 1));
    assert.ok(!JSON.stringify(r.data).includes('password'));
    const idc = r.data[0].id_usuario;
    assert.strictEqual((await llamar(srv.estadoCuenta, { params: { id: 'ACME SA', idUsuario: String(idc) }, body: { activo: false } })).error, 0);
    assert.strictEqual((await db.sync_query('SELECT activo FROM cliente WHERE id_usuario = ?', [idc]))[0].activo, 0);
    assert.strictEqual((await llamar(srv.estadoCuenta, { params: { id: 'OTRA', idUsuario: String(idc) }, body: { activo: true } })).error, 1, 'solo cuentas de esa empresa');
    assert.strictEqual((await llamar(srv.estadoCuenta, { params: { id: 'ACME SA', idUsuario: String(idc) }, body: { activo: 'x' } })).error, 1);
    r = await llamar(srv.accesoEmpresa, { params: { id: 'ACME SA' }, body: { activo: false } });
    assert.strictEqual(r.error, 0);
    assert.strictEqual((await db.sync_query("SELECT COUNT(*) AS n FROM cliente WHERE empresa = 'ACME SA' AND activo = 1"))[0].n, 0);
    assert.strictEqual((await llamar(srv.accesoEmpresa, { params: { id: 'TUID' }, body: { activo: false } })).error, 1, 'TUID no se suspende');
    console.log('ok  habilitar / deshabilitar cuentas y suspender el acceso de una empresa');

    await db.sync_query("DELETE FROM cliente WHERE empresa = 'ACME SA'; DELETE FROM empresa WHERE id = 'ACME SA'");
    console.log('\nTodas las pruebas del ABM de empresas pasaron.');
    pool.end();
    process.exit(0);
})().catch((e) => { console.error('FALLO:', e); process.exit(1); });
