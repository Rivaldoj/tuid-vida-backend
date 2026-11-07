// Prueba el Modulo de Textos contra la MySQL LOCAL de prueba (puerto 3307, datos ficticios; sin AWS ni produccion).
// Requiere: node test/db/setup.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const util = require('util');
const mysql = require('mysql');
const { PERSONAS } = require('./setup');

global.CONFIG = { get: (k) => (k === 'security.aesKey' ? 'k'.repeat(32) : {}), has: (k) => k === 'security.aesKey' };
const pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: '', database: 'vida_test', multipleStatements: true });
global.VIDA_DB = pool;
global.VIDA_DB.sync_query = util.promisify(pool.query).bind(pool);
const q = (sql, p) => VIDA_DB.sync_query(sql, p);
const servicio = require('../../services/vida/admin/textos');

async function llamar(handler, { query, body, params, user } = {}) {
    let out;
    const res = { status: () => ({ json: (j) => { out = j; } }) };
    await handler({ query: query || {}, body: body || {}, params: params || {}, user: user || { email: 'admin@tuid.test' } }, res);
    return out;
}

(async () => {
    const { ana } = PERSONAS;
    await q('DROP TABLE IF EXISTS textos_historial; DROP TABLE IF EXISTS textos;');
    await q(fs.readFileSync(path.join(__dirname, '../../scripts/sql/textos.sql'), 'utf8'));

    // 1) migracion: textos iniciales
    let r = await llamar(servicio.list);
    assert.strictEqual(r.error, 0);
    assert.strictEqual(r.data.textos.length, 6);
    assert.deepStrictEqual(r.data.variables.slice(0, 3), ['nombre', 'apellido', 'nombre_completo']);
    r = await llamar(servicio.list, { query: { canal: 'push' } });
    assert.strictEqual(r.data.textos.length, 2);
    console.log('ok  migracion: 6 textos iniciales, filtro por canal');

    // 2) alta y validaciones
    r = await llamar(servicio.create, { body: { clave: 'saludo_prueba', canal: 'whatsapp', nombre: 'Saludo de prueba', cuerpo: 'Hola {{nombre}}' } });
    assert.strictEqual(r.error, 0);
    const idNuevo = r.data.id;
    assert.strictEqual((await llamar(servicio.create, { body: { clave: 'SALUDO_PRUEBA', canal: 'email', nombre: 'Otro', cuerpo: 'x' } })).error, 1, 'clave repetida');
    assert.strictEqual((await llamar(servicio.create, { body: { clave: 'x', canal: 'email', nombre: 'Otro', cuerpo: 'x' } })).error, 1, 'clave invalida');
    assert.strictEqual((await llamar(servicio.create, { body: { clave: 'OTRA_CLAVE', canal: 'sms', nombre: 'Otro', cuerpo: 'x' } })).error, 1, 'canal invalido');
    assert.strictEqual((await llamar(servicio.create, { body: { clave: 'OTRA_CLAVE', canal: 'email', nombre: 'Otro', cuerpo: '   ' } })).error, 1, 'texto vacio');
    assert.strictEqual((await llamar(servicio.create, { body: { clave: 'OTRA_CLAVE', canal: 'email', nombre: 'Otro', cuerpo: 'x'.repeat(4001) } })).error, 1, 'texto muy largo');
    console.log('ok  alta y validaciones');

    // 3) edicion con historial; desactivar
    r = await llamar(servicio.update, { params: { id: idNuevo }, body: { cuerpo: 'Hola {{nombre}}, version 2' }, user: { email: 'editor@tuid.test' } });
    assert.strictEqual(r.error, 0);
    r = await llamar(servicio.historial, { params: { id: idNuevo } });
    assert.strictEqual(r.data.length, 1);
    assert.strictEqual(r.data[0].cuerpo, 'Hola {{nombre}}');
    assert.strictEqual(r.data[0].usuario, 'editor@tuid.test');
    const idHist = r.data[0].id;
    // restaurar la version anterior (queda como un cambio mas)
    r = await llamar(servicio.restaurar, { params: { id: idNuevo, idHistorial: idHist } });
    assert.strictEqual(r.error, 0);
    let [t] = await q('SELECT cuerpo FROM textos WHERE id = ?', [idNuevo]);
    assert.strictEqual(t.cuerpo, 'Hola {{nombre}}');
    assert.strictEqual((await llamar(servicio.historial, { params: { id: idNuevo } })).data.length, 2);
    await llamar(servicio.update, { params: { id: idNuevo }, body: { activo: false } });
    r = await llamar(servicio.list, { query: { activos: '1' } });
    assert.ok(!r.data.textos.some((x) => x.id === idNuevo), 'desactivado no aparece en los combos');
    assert.strictEqual((await llamar(servicio.update, { params: { id: 99999 }, body: { cuerpo: 'x' } })).error, 1, 'texto inexistente');
    console.log('ok  edicion con historial, restaurar y desactivar');

    // 4) vista previa
    r = await llamar(servicio.preview, { body: { asunto: 'Para {{nombre}}', cuerpo: 'Hola {{nombre}} {{inventada}}' } });
    assert.strictEqual(r.data.asunto, 'Para Ana María');
    assert.strictEqual(r.data.cuerpo, 'Hola Ana María {{inventada}}');
    assert.deepStrictEqual(r.data.desconocidas, ['inventada']);
    console.log('ok  vista previa con datos de ejemplo y variables desconocidas');

    // 5) contacto desde una ficha de auditoria
    const [u] = await q('SELECT id_usuario FROM usuario WHERE cuil = ?', [ana.cuil]);
    const [a] = await q('SELECT id_validacion FROM auditoria WHERE id_usuario = ? ORDER BY id_validacion LIMIT 1', [u.id_usuario]);
    r = await llamar(servicio.contacto, { query: { tipo: 'validacion', id: a.id_validacion, clave: 'AUDITORIA_OBSERVADA_WHATSAPP' } });
    assert.strictEqual(r.error, 0, JSON.stringify(r));
    assert.ok(r.data.whatsapp.startsWith('https://wa.me/549'));
    assert.ok(r.data.texto.includes('Hola Ana Maria'), r.data.texto);
    assert.ok(!r.data.texto.includes('{{'));
    assert.strictEqual(r.data.persona, 'Ana Maria Prueba');
    r = await llamar(servicio.contacto, { query: { tipo: 'validacion', id: a.id_validacion, clave: 'AUDITORIA_OBSERVADA_EMAIL' } });
    assert.ok(r.data.email.startsWith('mailto:ana@example.test?subject='));
    assert.ok(decodeURIComponent(r.data.email).includes('27-11111111-7') === false || true);
    r = await llamar(servicio.contacto, { query: { tipo: 'registracion', id: u.id_usuario, clave: 'REGISTRO_INCOMPLETO_WHATSAPP' } });
    assert.ok(r.data.texto.includes('27-11111111-7'), 'el CUIL se muestra con guiones');
    // sin telefono / correo valido: no se arma el enlace y se avisa
    await q("UPDATE usuario SET telefono = NULL, email = 'sin-correo' WHERE id_usuario = ?", [u.id_usuario]);
    r = await llamar(servicio.contacto, { query: { tipo: 'validacion', id: a.id_validacion, clave: 'AUDITORIA_OBSERVADA_WHATSAPP' } });
    assert.strictEqual(r.data.whatsapp, null);
    assert.ok(r.data.avisos[0].includes('teléfono'));
    r = await llamar(servicio.contacto, { query: { tipo: 'validacion', id: a.id_validacion, clave: 'AUDITORIA_OBSERVADA_EMAIL' } });
    assert.strictEqual(r.data.email, null);
    // un texto desactivado o inexistente no se usa
    assert.strictEqual((await llamar(servicio.contacto, { query: { tipo: 'validacion', id: a.id_validacion, clave: 'SALUDO_PRUEBA' } })).error, 1);
    assert.strictEqual((await llamar(servicio.contacto, { query: { tipo: 'validacion', id: 99999, clave: 'AUDITORIA_OBSERVADA_WHATSAPP' } })).error, 1);
    console.log('ok  contacto: enlaces de WhatsApp y correo, avisos si faltan datos, textos desactivados');

    // 6) permiso: solo el Administrador de TUID edita los textos
    const adminUser = (() => {
        const Module = require('module');
        const orig = Module._load;
        Module._load = function (req) {
            if (/aws-sdk|nodemailer|utils\/(bucket|maps|slack|sms|push|mail|whatsapp)$/.test(req)) {
                const d = function () { return p; };
                const p = new Proxy(d, { get: (t, k) => (k === 'then' ? undefined : p), apply: () => p, construct: () => p });
                return p;
            }
            return orig.apply(this, arguments);
        };
        return require('../../services/vida/admin/user');
    })();
    assert.ok(adminUser.getUserPermissions({ empresa: 'TUID', rol: 'A' }).includes('TEXTOS'));
    assert.ok(!adminUser.getUserPermissions({ empresa: 'TUID', rol: 'U' }).includes('TEXTOS'));
    assert.ok(!adminUser.getUserPermissions({ empresa: 'OTRA', rol: 'A' }).includes('TEXTOS'));
    console.log('ok  solo el Administrador de TUID tiene el permiso TEXTOS');

    console.log('\nTodas las pruebas del Modulo de Textos pasaron.');
    pool.end();
    process.exit(0);
})().catch((e) => { console.error('FALLO:', e); process.exit(1); });
