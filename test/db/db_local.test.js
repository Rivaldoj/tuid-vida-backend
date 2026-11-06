// Prueba las consultas reales (searchdni por CUIL, consulta de registro, historial) contra la MySQL LOCAL de prueba
// (puerto 3307, datos ficticios). No usa AWS ni produccion. Requiere: node test/db/setup.js
const assert = require('assert');
const util = require('util');
const mysql = require('mysql');
const { PERSONAS } = require('./setup');
const cuilUtil = require('../../utils/cuil');

global.CONFIG = { get: () => ({ bucketName: 'x', approvePercentage: 90, rangoES: 1 }) };
const Module = require('module');
const orig = Module._load;
Module._load = function (req) {
    if (/mail|tokenizer|\.\/shared|aws-sdk|^\.\.\/\.\.\/login$/.test(req)) {
        return new Proxy({ Rekognition: function () { return {}; } }, { get: (t, k) => t[k] || (() => {}) });
    }
    if (/utils\/liveness$/.test(req)) {
        let n = 0;
        return { createSession: async () => 'fake-session-' + (++n) };
    }
    return orig.apply(this, arguments);
};

const pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: '', database: 'vida_test' });
global.VIDA_DB = pool;
global.VIDA_DB.sync_query = util.promisify(pool.query).bind(pool);

const login = require('../../services/vida/v2/services/login');
const account = require('../../services/vida/v2/services/account');

function call(handler, body, ip) {
    return new Promise(async (resolve) => {
        const res = { status: () => ({ json: (j) => resolve(j) }) };
        await handler({ body, ip: ip || ('10.0.0.' + Math.floor(Math.random() * 250)) }, res, () => {});
    });
}
const rows = (sql, p) => VIDA_DB.sync_query(sql, p);

(async () => {
    const { ana, beto, carlos, dora } = PERSONAS;
    const desconocido = (() => {
        for (let n = 99999990; n < 99999999; n++) {
            const d = '20' + n;
            if (cuilUtil.checkDigit(d) >= 0) return d + cuilUtil.checkDigit(d);
        }
    })();

    // ---- searchdni por CUIL
    let r = await call(login.searchdni, { cuil: ana.cuil });
    assert.strictEqual(r.res, 'ok', JSON.stringify(r));
    assert.ok(r.idValidation > 0 && /^fake-session/.test(r.sessionId));
    const prov = await rows('SELECT id_usuario FROM auditoria WHERE id_validacion = ?', [r.idValidation]);
    const anaId = (await rows('SELECT id_usuario FROM usuario WHERE cuil = ?', [ana.cuil]))[0].id_usuario;
    const betoId = (await rows('SELECT id_usuario FROM usuario WHERE cuil = ?', [beto.cuil]))[0].id_usuario;
    assert.strictEqual(prov[0].id_usuario, anaId, 'la validacion provisoria debe ser de Ana, no de Beto');
    console.log('ok  searchdni por CUIL identifica a Ana aunque comparta DNI y sexo con Beto');

    r = await call(login.searchdni, { cuil: beto.cuil });
    assert.strictEqual(r.res, 'error');
    assert.ok(/al día/.test(r.message), 'Beto esta al dia: ' + r.message);
    console.log('ok  Beto (mismo DNI) se evalua por su propio estado: al dia');

    r = await call(login.searchdni, { cuil: carlos.cuil });
    assert.ok(/al día/.test(r.message));
    r = await call(login.searchdni, { cuil: dora.cuil });
    assert.ok(/desaprobada/.test(r.message), r.message);
    r = await call(login.searchdni, { cuil: desconocido });
    assert.ok(/Previamente debe registrarse/.test(r.message), r.message);
    assert.strictEqual(r.registration, 'NOT_REGISTERED', 'la app necesita este codigo para ofrecer Registrarse');
    r = await call(login.searchdni, { cuil: desconocido.slice(0, 10) + ((Number(desconocido[10]) + 1) % 10) });
    assert.ok(/no es válido/.test(r.message));
    console.log('ok  al dia / desaprobada / no registrado / CUIL invalido');

    // ---- camino anterior DNI + sexo sigue funcionando
    r = await call(login.searchdni, { dni: '22222222', sexo: 'M' });
    assert.ok(/al día/.test(r.message));
    console.log('ok  DNI + sexo (apps viejas) sigue funcionando');

    // ---- consulta de registro
    const estado = async (c) => (await call(account.checkRegistration, { cuil: c })).registration;
    assert.strictEqual(await estado(ana.cuil), 'REGISTERED_PENDING');
    assert.strictEqual(await estado(carlos.cuil), 'REGISTERED_UP_TO_DATE');
    const alDia = await call(account.checkRegistration, { cuil: carlos.cuil });
    assert.strictEqual(alDia.proximas.length, 1, JSON.stringify(alDia));
    assert.strictEqual(alDia.proximas[0].empresa, 'TESTBANCO');
    assert.ok(/^\d{2}\/\d{2}\/\d{4}$/.test(alDia.proximas[0].proxima), 'fecha dd/mm/aaaa: ' + alDia.proximas[0].proxima);
    const pend = await call(account.checkRegistration, { cuil: ana.cuil });
    assert.ok(pend.proximas === undefined, 'solo se informa la proxima fecha a quien esta al dia');
    assert.strictEqual(await estado(dora.cuil), 'REGISTRATION_INCOMPLETE');
    assert.strictEqual(await estado(desconocido), 'NOT_REGISTERED');
    r = await call(account.checkRegistration, { cuil: ana.cuil });
    assert.strictEqual(r.pendingFeDeVida, true);
    assert.ok(!/PRUEBA|ANA|1950/.test(JSON.stringify(r)), 'sin datos personales');
    console.log('ok  consulta de registro: pendiente / al dia / incompleto / no registrado, sin datos personales');

    // ---- historial
    r = await call(account.history, { cuil: ana.cuil, idDevice: 'DEVICE-ANA' });
    assert.strictEqual(r.res, 'ok', JSON.stringify(r));
    assert.strictEqual(r.certificaciones.length, 20, 'tope de 20');
    assert.ok(new Date(r.certificaciones[0].fecha) > new Date(r.certificaciones[19].fecha), 'mas reciente primero');
    assert.ok(r.certificaciones.every((c) => c.empresas[0] === 'TESTBANCO'));
    const denied = 'No pudimos actualizar su historial. Realice una Fe de Vida desde este teléfono e inténtelo nuevamente.';
    r = await call(account.history, { cuil: ana.cuil, idDevice: 'DEVICE-BETO' });
    assert.strictEqual(r.message, denied, 'el telefono de otra persona no ve el historial de Ana');
    r = await call(account.history, { cuil: desconocido, idDevice: 'DEVICE-ANA' });
    assert.strictEqual(r.message, denied);
    r = await call(account.history, { cuil: beto.cuil, idDevice: 'DEVICE-BETO' });
    assert.strictEqual(r.certificaciones.length, 1, 'Beto ve solo lo suyo (mismo DNI que Ana)');
    console.log('ok  historial: 20 mas recientes, solo del telefono vinculado, sin mezclar personas con igual DNI');

    // limpieza de las validaciones provisorias creadas por los searchdni
    await rows('DELETE FROM auditoria WHERE similitud IS NULL');
    console.log('\nTodas las pruebas contra la base local pasaron.');
    pool.end();
    process.exit(0);
})().catch((e) => { console.error('FALLO:', e); process.exit(1); });
