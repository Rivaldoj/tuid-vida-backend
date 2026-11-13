// Aviso "certificacion en revision" (horas y texto) editable desde Configuracion, contra la MySQL LOCAL de prueba. Requiere: node test/db/setup.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const util = require('util');
const mysql = require('mysql');
const Module = require('module');

global.CONFIG = { get: () => ({}), has: () => false };
const pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: '', database: 'vida_test', multipleStatements: true });
const q = util.promisify(pool.query).bind(pool);
global.VIDA_DB = { sync_query: q };
const orig = Module._load;
Module._load = function (req) {
    if (/aws-sdk|nodemailer|utils\/(bucket|maps|slack|sms|push|mail|whatsapp)$/.test(req)) {
        const d = function () { return p; };
        const p = new Proxy(d, { get: (t, k) => (k === 'then' ? undefined : p), apply: () => p, construct: () => p });
        return p;
    }
    return orig.apply(this, arguments);
};
const settings = require('../../utils/settings');
const configuracion = require('../../services/vida/admin/configuracion');

async function llamar(handler, body) {
    let out;
    await handler({ body: body || {}, query: {}, user: { email: 'admin@tuid.test' } }, { status: () => ({ json: (j) => { out = j; } }) });
    return out;
}

(async () => {
    await q('DROP TABLE IF EXISTS configuracion_historial; DROP TABLE IF EXISTS configuracion;');
    await q(fs.readFileSync(path.join(__dirname, '../../scripts/sql/configuracion.sql'), 'utf8'));

    // 1) sin configurar: el aviso de siempre (48 horas)
    settings.limpiarCache();
    let m = await settings.mensajeRevision('05/11/2026');
    assert.strictEqual(m, 'Su Certificación realizada el 05/11/2026 se encuentra en proceso de revisión. En las próximas 48 horas hábiles podrá acceder a su certificado.');
    let r = await llamar(configuracion.getCertificado);
    assert.strictEqual(r.error, 0);
    assert.strictEqual(r.data.horas, 48);
    assert.ok(r.data.porDefecto.mensaje.includes('{{horas}}'));
    console.log('ok  sin configuracion: el aviso de siempre');

    // 2) se edita desde el panel: horas y texto
    r = await llamar(configuracion.setCertificado, { horas: 72, mensaje: 'Su certificación del {{fecha}} está en revisión. Tardará hasta {{horas}} horas hábiles.' });
    assert.strictEqual(r.error, 0, JSON.stringify(r));
    m = await settings.mensajeRevision('05/11/2026');
    assert.strictEqual(m, 'Su certificación del 05/11/2026 está en revisión. Tardará hasta 72 horas hábiles.', 'el cambio se usa enseguida');
    const hist = await q("SELECT clave, valor_anterior, valor_nuevo, usuario FROM configuracion_historial WHERE clave LIKE 'certificado%' ORDER BY id");
    assert.deepStrictEqual(hist.map((h) => h.clave), ['certificado_horas_revision', 'certificado_mensaje_revision']);
    assert.strictEqual(hist[0].valor_nuevo, '72');
    assert.strictEqual(hist[0].usuario, 'admin@tuid.test');
    // guardar lo mismo no ensucia el historial
    await llamar(configuracion.setCertificado, { horas: 72, mensaje: 'Su certificación del {{fecha}} está en revisión. Tardará hasta {{horas}} horas hábiles.' });
    assert.strictEqual((await q("SELECT COUNT(*) n FROM configuracion_historial WHERE clave LIKE 'certificado%'"))[0].n, 2);
    console.log('ok  horas y texto editables, con historial');

    // 3) validaciones
    for (const malo of [{ horas: 0, mensaje: 'Un mensaje valido {{horas}}' }, { horas: 1000, mensaje: 'Un mensaje valido {{horas}}' }, { horas: 'x', mensaje: 'Un mensaje valido' },
        { horas: 48, mensaje: 'corto' }, { horas: 48, mensaje: 'a'.repeat(256) }, { horas: 48, mensaje: 'Texto con {{inventada}} variable' }, {}]) {
        r = await llamar(configuracion.setCertificado, malo);
        assert.strictEqual(r.error, 1, JSON.stringify(malo));
    }
    assert.strictEqual((await settings.certificadoRevision()).horas, 72, 'lo invalido no cambia nada');
    console.log('ok  validaciones de horas y de texto');

    // 4) valores corruptos en la base o base caida: se usa el aviso de siempre
    await q("UPDATE configuracion SET valor = 'abc' WHERE clave = 'certificado_horas_revision'");
    settings.limpiarCache();
    assert.strictEqual((await settings.certificadoRevision()).horas, 48);
    const real = global.VIDA_DB; global.VIDA_DB = { sync_query: async () => { throw new Error('base caida'); } };
    settings.limpiarCache();
    assert.ok((await settings.mensajeRevision('01/01/2026')).includes('48 horas'));
    global.VIDA_DB = real;
    console.log('ok  valores invalidos o base caida: el aviso de siempre');

    console.log('\nTodas las pruebas de la configuracion del certificado pasaron.');
    pool.end();
    process.exit(0);
})().catch((e) => { console.error('FALLO:', e); process.exit(1); });
