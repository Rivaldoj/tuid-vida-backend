// Control de nombres del documento contra padron.master: comparacion, configuracion y registro observado.
// Requiere la MySQL LOCAL de prueba: node test/db/setup.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const util = require('util');
const mysql = require('mysql');
const Module = require('module');

global.CONFIG = { get: (k) => (k === 'vida' ? { supportContact: 'soporte@tuid.test', bucketName: 'x' } : {}), has: () => false };
const pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: '', database: 'vida_test', multipleStatements: true });
const q = util.promisify(pool.query).bind(pool);
global.VIDA_DB = { sync_query: q };
const avisos = { slack: [], mail: [] };
const orig = Module._load;
Module._load = function (req) {
    if (/utils\/slack$/.test(req)) return { debug: (m) => avisos.slack.push(m), error: () => {} };
    if (/utils\/mail$/.test(req)) return { send: (...a) => avisos.mail.push(a) };
    if (/aws-sdk|nodemailer|utils\/(bucket|maps|sms|push|whatsapp|liveness)$|padron\/questions$|padron\/person$|\/shared$/.test(req)) {
        const d = function () { return p; };
        const p = new Proxy(d, { get: (t, k) => (k === 'then' ? undefined : p), apply: () => p, construct: () => p });
        return p;
    }
    return orig.apply(this, arguments);
};
const identidad = require('../../utils/identidad');
const controlNombres = require('../../utils/controlNombres');
const configuracion = require('../../services/vida/admin/configuracion');
const register = require('../../services/vida/v2/services/register');

async function llamar(handler, body) {
    let out;
    await handler({ body: body || {}, query: {}, user: { email: 'admin@tuid.test' } }, { status: () => ({ json: (j) => { out = j; } }) });
    return out;
}

(async () => {
    // 1) comparacion
    const sep = { Apellido: 'GREGORI', Nombre: 'NATALIA ALEJANDRA', Apellido_Nombre: 'GREGORI NATALIA ALEJ' };
    assert.ok(identidad.compararNombres({ lastname: 'GREGORI', name: 'NATALIA ALEJANDRA' }, sep, 80).ok);
    assert.ok(identidad.compararNombres({ lastname: 'GREGORI', name: 'NATALIA' }, sep, 80).ok, 'el padron trae mas nombres que el documento');
    assert.ok(identidad.compararNombres({ lastname: 'PENA', name: 'JORGE' }, { Apellido: 'PE¥A', Nombre: 'JORGE LEONARDO', Apellido_Nombre: '' }, 80).ok, 'la enie del padron');
    assert.ok(identidad.compararNombres({ lastname: 'BORDON', name: 'NORMA ISABEL' }, { Apellido: 'BORDON', Nombre: 'NORMA I.', Apellido_Nombre: '' }, 80).ok, 'inicial');
    assert.strictEqual(identidad.compararNombres({ lastname: 'PEREZ', name: 'NATALIA' }, sep, 80).ok, false, 'otro apellido');
    assert.strictEqual(identidad.compararNombres({ lastname: 'GREGORI', name: 'MARIA' }, sep, 80).ok, false, 'otro nombre');
    // sin separar: va por todo junto
    const junto = { Apellido: '', Nombre: '', Apellido_Nombre: 'ZANONI ROGELIO GERARDO' };
    let r = identidad.compararNombres({ lastname: 'ZANONI', name: 'ROGELIO GERARDO' }, junto, 80);
    assert.ok(r.ok && r.modo === 'junto');
    r = identidad.compararNombres({ lastname: 'GOMEZ', name: 'PEDRO' }, junto, 80);
    assert.ok(!r.ok && r.modo === 'junto');
    assert.ok(identidad.compararNombres({ lastname: 'GARZIA', name: 'ANA' }, { Apellido: 'GARCIA', Nombre: 'ANA', Apellido_Nombre: '' }, 80).ok, 'una letra de diferencia entra en la tolerancia');
    assert.ok(!identidad.compararNombres({ lastname: 'GARZIA', name: 'ANA' }, { Apellido: 'GARCIA', Nombre: 'ANA', Apellido_Nombre: '' }, 95).ok, 'con tolerancia alta no entra');
    console.log('ok  comparacion por aproximacion (separado, junto, enie, iniciales, tolerancia)');

    // 2) configuracion
    await q('DROP TABLE IF EXISTS configuracion_historial; DROP TABLE IF EXISTS configuracion; DROP TABLE IF EXISTS alertas;');
    await q(fs.readFileSync(path.join(__dirname, '../../scripts/sql/configuracion.sql'), 'utf8'));
    await q('CREATE TABLE alertas (id INT AUTO_INCREMENT PRIMARY KEY, cuil VARCHAR(20), comentarios VARCHAR(1000), fecha DATETIME)');
    assert.deepStrictEqual(await controlNombres.leerConfig(), { activo: true, tolerancia: 80 });
    r = await llamar(configuracion.setControlNombres, { activo: true, tolerancia: 40 });
    assert.strictEqual(r.error, 1);
    r = await llamar(configuracion.setControlNombres, { activo: 'si', tolerancia: 80 });
    assert.strictEqual(r.error, 1);
    r = await llamar(configuracion.setControlNombres, { activo: true, tolerancia: 90 });
    assert.strictEqual(r.error, 0);
    assert.deepStrictEqual(await controlNombres.leerConfig(), { activo: true, tolerancia: 90 });
    assert.strictEqual((await q("SELECT COUNT(*) n FROM configuracion_historial WHERE clave LIKE 'padron_%'"))[0].n, 2);
    await llamar(configuracion.setControlNombres, { activo: true, tolerancia: 80 });
    console.log('ok  configuracion del control (validaciones e historial)');

    // la tabla usuario local no trae todas las columnas de produccion: se agregan las que usa el registro
    const columnas = { tramite: 'VARCHAR(50)', vencimiento: 'VARCHAR(20)', direccion: 'VARCHAR(255)', id_pregunta: 'VARCHAR(50)', id_respuesta: 'VARCHAR(100)',
        valback: 'VARCHAR(50)', valfront: 'VARCHAR(50)', os: 'VARCHAR(50)', version: 'VARCHAR(50)', tipo: 'VARCHAR(5)', pais: 'VARCHAR(20)', nfc: 'TINYINT',
        nfc_opencode: 'VARCHAR(20)', ejemplar: 'VARCHAR(5)', latitud: 'VARCHAR(30)', longitud: 'VARCHAR(30)', appversion: 'VARCHAR(30)',
        serial_number: 'VARCHAR(50)', barcode: 'VARCHAR(500)', mrz: 'VARCHAR(500)' };
    const existentes = (await q("SELECT column_name c FROM information_schema.columns WHERE table_schema = 'vida_test' AND table_name = 'usuario'")).map((x) => x.c);
    for (const [col, tipo] of Object.entries(columnas)) if (!existentes.includes(col)) await q(`ALTER TABLE usuario ADD COLUMN ${col} ${tipo} NULL`);
    await q('CREATE TABLE IF NOT EXISTS errors (id INT AUTO_INCREMENT PRIMARY KEY, dni VARCHAR(20), sexo CHAR(1), message VARCHAR(500), nombre VARCHAR(200))');

    // 3) registro: coincide -> normal; no coincide -> observado + aviso; control apagado -> normal
    async function registrar(doc, row) {
        const req = { body: { idDocument: doc, similitud: 90, estado: 'Verificar', idDevice: 'dev1' }, masterData: row };
        let out;
        await register.createUser(req, { response: { res: 'error' }, status: () => ({ json: (j) => { out = j; } }) }, () => {});
        await new Promise((ok) => setTimeout(ok, 150));
        return out;
    }
    const fila = (cuil, ap, no) => ({ CUIL: cuil, DNI: 20111222, Sexo: 'M', Apellido: ap, Nombre: no, Apellido_Nombre: `${ap} ${no}` });
    await q('DELETE FROM usuario WHERE cuil IN (20201112221, 20201112222, 20201112223)');
    avisos.slack.length = 0; avisos.mail.length = 0;

    let o = await registrar({ name: 'JUAN CARLOS', lastname: 'PEREZ', number: '20111222', gender: 'M' }, fila(20201112221, 'PEREZ', 'JUAN CARLOS'));
    assert.strictEqual(o.res, 'ok');
    assert.strictEqual((await q('SELECT auditor FROM usuario WHERE cuil = 20201112221'))[0].auditor, null, 'coincide: queda pendiente como siempre');
    assert.strictEqual(avisos.slack.length, 0);

    o = await registrar({ name: 'MARCOS', lastname: 'GOMEZ', number: '20111222', gender: 'M' }, fila(20201112222, 'PEREZ', 'JUAN CARLOS'));
    assert.strictEqual(o.res, 'ok', 'el registro se crea igual');
    assert.strictEqual((await q('SELECT auditor FROM usuario WHERE cuil = 20201112222'))[0].auditor, 'ALERTA:PADRON');
    const al = await q("SELECT comentarios FROM alertas WHERE cuil = '20201112222'");
    assert.strictEqual(al.length, 1);
    assert.ok(al[0].comentarios.includes('no coincide con padron.master'));
    assert.strictEqual(avisos.slack.length, 1);
    assert.strictEqual(avisos.mail.length, 1);
    assert.strictEqual(avisos.mail[0][0], 'validationAlert');

    await llamar(configuracion.setControlNombres, { activo: false, tolerancia: 80 });
    o = await registrar({ name: 'MARCOS', lastname: 'GOMEZ', number: '20111222', gender: 'M' }, fila(20201112223, 'PEREZ', 'JUAN CARLOS'));
    assert.strictEqual(o.res, 'ok');
    assert.strictEqual((await q('SELECT auditor FROM usuario WHERE cuil = 20201112223'))[0].auditor, null, 'control apagado: no observa');
    assert.strictEqual(avisos.slack.length, 1, 'sin aviso nuevo');
    console.log('ok  registro: coincide pasa, no coincide queda observado con aviso, apagado no controla');

    await q('DELETE FROM usuario WHERE cuil IN (20201112221, 20201112222, 20201112223)');
    console.log('\nTodas las pruebas del control de nombres pasaron.');
    pool.end();
    process.exit(0);
})().catch((e) => { console.error('FALLO:', e); process.exit(1); });
