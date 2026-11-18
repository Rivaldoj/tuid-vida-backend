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
    await handler(Object.assign({ query: {}, body: {}, params: {}, user: { email: 'admin@tuid.test', empresa: 'TUID', rol: 'A' } }, req), { status: () => ({ json: (j) => { out = j; } }) });
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


    // ---- ABM de usuarios de la empresa (CUIL obligatorio), alcance por empresa y periodo ----
    await db.sync_query("INSERT INTO empresa (id, tipo, periodicidad) VALUES ('ACME SA','E',6) ON DUPLICATE KEY UPDATE tipo = tipo");
    const adminCliente = { email: 'admin@acme.test', empresa: 'ACME SA', rol: 'A' };
    const CUIL_OK = require('../../utils/cuil');
    const cuilAna = '27' + '11111111' + CUIL_OK.checkDigit('2711111111');
    let a = await llamar(srv.altaUsuario, { user: adminCliente, params: { id: 'ACME SA' }, body: { nombre: 'Ana Prueba', email: 'ana@acme.test' } });
    assert.strictEqual(a.error, 1, 'sin CUIL no se da de alta');
    a = await llamar(srv.altaUsuario, { user: adminCliente, params: { id: 'ACME SA' }, body: { cuil: '20123456787', nombre: 'Ana Prueba', email: 'ana@acme.test' } });
    assert.strictEqual(a.error, 1, 'CUIL con verificador incorrecto');
    a = await llamar(srv.altaUsuario, { user: adminCliente, params: { id: 'ACME SA' }, body: { cuil: cuilAna, nombre: 'Ana Prueba', email: 'Ana@Acme.test', rol: 'A' } });
    assert.strictEqual(a.error, 0, JSON.stringify(a));
    let cta = (await db.sync_query("SELECT * FROM cliente WHERE email = 'ana@acme.test'"))[0];
    assert.strictEqual(cta.CUIL, cuilAna);
    assert.strictEqual(cta.rol, 'U', 'el administrador de cliente no puede definir el rol');
    assert.strictEqual((await llamar(srv.altaUsuario, { user: adminCliente, params: { id: 'OTRA' }, body: { cuil: cuilAna, nombre: 'Ana Prueba', email: 'x@otra.test' } })).error, 1, 'no opera sobre otra empresa');
    a = await llamar(srv.altaUsuario, { user: adminCliente, params: { id: 'ACME SA' }, body: { cuil: cuilAna, nombre: 'Otra Persona', email: 'otra@acme.test' } });
    assert.strictEqual(a.error, 1, 'CUIL repetido en la empresa');
    // modificacion: el rol solo lo cambia TUID
    assert.strictEqual((await llamar(srv.modificarUsuario, { user: adminCliente, params: { id: 'ACME SA', idUsuario: String(cta.id_usuario) }, body: { nombre: 'Ana P. Gomez', rol: 'S' } })).error, 0);
    cta = (await db.sync_query('SELECT * FROM cliente WHERE id_usuario = ?', [cta.id_usuario]))[0];
    assert.strictEqual(cta.Nombre, 'Ana P. Gomez');
    assert.strictEqual(cta.rol, 'U');
    assert.strictEqual((await llamar(srv.modificarUsuario, { params: { id: 'ACME SA', idUsuario: String(cta.id_usuario) }, body: { rol: 'S' } })).error, 0);
    assert.strictEqual((await db.sync_query('SELECT rol FROM cliente WHERE id_usuario = ?', [cta.id_usuario]))[0].rol, 'S');
    assert.strictEqual((await llamar(srv.modificarUsuario, { user: { email: 'x', empresa: 'OTRA', rol: 'A' }, params: { id: 'ACME SA', idUsuario: String(cta.id_usuario) }, body: { nombre: 'Intruso' } })).error, 1);
    // un administrador de cliente solo ve su empresa y no crea administradores ni empresas
    assert.strictEqual((await llamar(srv.listar, { user: adminCliente })).data.empresas.map((e) => e.id).join(), 'ACME SA');
    assert.ok((await llamar(srv.listar)).data.empresas.length >= 2, 'TUID ve todas');
    assert.strictEqual((await llamar(srv.cuentas, { user: { email: 'x', empresa: 'OTRA', rol: 'A' }, params: { id: 'ACME SA' } })).error, 1);
    assert.strictEqual((await llamar(srv.invitar, { user: adminCliente, params: { id: 'ACME SA' }, body: { email: 'nuevo@acme.test' } })).error, 1);
    assert.strictEqual((await llamar(srv.crear, { user: adminCliente, body: { id: 'NUEVA', admin_email: 'a@nueva.test' } })).error, 1);
    // cuentas viejas con CUIL de relleno quedan marcadas como provisorias
    await db.sync_query("INSERT INTO cliente (CUIL, email, empresa, rol, activo) VALUES ('000123', 'vieja@acme.test', 'ACME SA', 'U', 1)");
    const cs = (await llamar(srv.cuentas, { params: { id: 'ACME SA' } })).data;
    assert.strictEqual(cs.find((c) => c.email === 'vieja@acme.test').cuil_provisorio, 1);
    assert.strictEqual(cs.find((c) => c.email === 'ana@acme.test').cuil_provisorio, 0);
    // periodo
    assert.ok(U.validarPeriodo({ fecha_actual: '2026-11-01', fecha_fin: '2026-11-30', fecha_proxima: '2027-05-01', cantidad_registros: 5 }).valores);
    assert.ok(U.validarPeriodo({ fecha_actual: '2026-11-01', fecha_fin: '2026-11-30', fecha_proxima: '2027-05-01' }).error, 'la cantidad es obligatoria');
    assert.ok(U.validarPeriodo({ fecha_actual: '2026-11-01', fecha_fin: '2026-10-30', fecha_proxima: '2027-05-01', cantidad_registros: 5 }).error, 'fin posterior al inicio');
    assert.ok(U.validarPeriodo({ fecha_actual: '2026-02-31', fecha_fin: '2026-11-30', fecha_proxima: '2027-05-01', cantidad_registros: 5 }).error, 'fecha inexistente');
    // empresa de destino al subir un listado: la propia; TUID puede elegir otra que exista; una empresa cliente no puede subir por otra
    assert.deepStrictEqual(await U.empresaDeSubida(db, { empresa: 'ACME SA' }, { empresa: 'OTRA' }), { empresa: 'ACME SA', porCuentaDe: false }, 'un cliente sube siempre a la suya');
    assert.deepStrictEqual(await U.empresaDeSubida(db, { empresa: 'TUID' }, { empresa: 'ACME SA' }), { empresa: 'ACME SA', porCuentaDe: true });
    assert.deepStrictEqual(await U.empresaDeSubida(db, { empresa: 'TUID' }, {}), { empresa: 'TUID', porCuentaDe: false });
    assert.ok((await U.empresaDeSubida(db, { empresa: 'TUID' }, { empresa: 'NO EXISTE' })).error, 'TUID elige una empresa que no existe');
    console.log('ok  empresa de destino al subir un listado');
    await srv.guardarPeriodo('ACME SA', { fecha_actual: '2026-11-01', fecha_fin: '2026-11-30', fecha_proxima: '2027-05-01', cantidad_registros: 5 });
    const emp = (await db.sync_query("SELECT DATE_FORMAT(fecha_fin,'%Y-%m-%d') AS f, Cantidad AS n FROM empresa WHERE id = 'ACME SA'"))[0];
    assert.strictEqual(emp.f, '2026-11-30');
    assert.strictEqual(emp.n, 5);
    // CUIT de la empresa: opcional, validado y editable solo por TUID; el periodo no se edita desde la empresa
    assert.ok(U.validarEmpresa({ CUIT: '30-50001091-2' }, ['E'], false).valores.CUIT === '30500010912', 'normaliza el CUIT');
    assert.ok(U.validarEmpresa({ CUIT: '30500010913' }, ['E'], false).error, 'CUIT con verificador incorrecto');
    assert.strictEqual(U.validarEmpresa({ CUIT: '' }, ['E'], false).valores.CUIT, null, 'CUIT vacio -> null');
    assert.strictEqual((await llamar(srv.actualizar, { params: { id: 'ACME SA' }, body: { CUIT: '30500010912' } })).error, 0);
    assert.strictEqual((await llamar(srv.actualizar, { params: { id: 'ACME SA' }, body: { CUIT: '123' } })).error, 1);
    assert.strictEqual((await llamar(srv.actualizar, { user: adminCliente, params: { id: 'ACME SA' }, body: { CUIT: '30500010912' } })).error, 1, 'el admin de cliente no edita la empresa');
    assert.strictEqual((await llamar(srv.actualizar, { params: { id: 'ACME SA' }, body: { fecha_fin: '2030-01-01', Fecha_fin: '2030-01-01', cantidad_registros: 99 } })).error, 1, 'el periodo no se edita desde la empresa');
    assert.strictEqual((await db.sync_query("SELECT CUIT FROM empresa WHERE id = 'ACME SA'"))[0].CUIT, '30500010912');
    assert.strictEqual((await db.sync_query("SELECT Cantidad FROM empresa WHERE id = 'ACME SA'"))[0].Cantidad, 5, 'el periodo quedo como estaba');
    assert.strictEqual((await llamar(srv.listar)).data.empresas.find((e) => e.id === 'ACME SA').CUIT, '30500010912', 'el listado trae el CUIT');
    // el listado devuelve el periodo con los nombres que usa el panel (las columnas reales son Fecha_actual, Fecha_fin, Fecha_proxima, Cantidad)
    const lis = (await llamar(srv.listar)).data.empresas.find((e) => e.id === 'ACME SA');
    assert.ok(lis.fecha_actual && lis.fecha_fin && lis.fecha_proxima, 'fechas del periodo en el listado');
    assert.strictEqual(lis.cantidad_registros, 5);
    console.log('ok  ABM de usuarios con CUIL, alcance por empresa, rol y periodo');

    await db.sync_query("DELETE FROM cliente WHERE empresa = 'ACME SA'; DELETE FROM empresa WHERE id = 'ACME SA'");
    console.log('\nTodas las pruebas del ABM de empresas pasaron.');
    pool.end();
    process.exit(0);
})().catch((e) => { console.error('FALLO:', e); process.exit(1); });
