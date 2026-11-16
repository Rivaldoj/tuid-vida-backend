// Prueba sin base de datos real: node test/account.test.js
const assert = require('assert');

global.CONFIG = { get: () => ({ bucketName: 'x', approvePercentage: 90, rangoES: 1 }) };
const Module = require('module');
const orig = Module._load;
Module._load = function (req) {
    if (/liveness|mail|tokenizer|\.\/shared|aws-sdk|^\.\.\/\.\.\/login$/.test(req)) {
        return new Proxy({ Rekognition: function () { return {}; } }, { get: (t, k) => t[k] || (() => {}) });
    }
    return orig.apply(this, arguments);
};

const account = require('../services/vida/v2/services/account');
const { createLimiter } = require('../utils/rateLimit');

const CUIL = '20123456786';
let queries = [];
let dbAnswers = [];
global.VIDA_DB = { sync_query: async (q, p) => { queries.push({ q, p }); return dbAnswers.shift() || []; } };

function call(handler, body, ip = '1.1.1.1') {
    return new Promise(async (resolve) => {
        const res = { status: () => ({ json: (j) => resolve(j) }) };
        await handler({ body, ip }, res);
    });
}

(async () => {
    // --- estado de registro
    assert.strictEqual(account.registrationStatus([]), 'NOT_REGISTERED');
    assert.strictEqual(account.registrationStatus([{ estado: 'Desaprobado' }]), 'REGISTRATION_INCOMPLETE');
    assert.strictEqual(account.registrationStatus([{ estado: 'Ok', status: 'PENDING' }]), 'REGISTERED_PENDING');
    assert.strictEqual(account.registrationStatus([{ estado: 'Ok', status: 'OK', auditor2: 'ALERTA x' }]), 'REGISTERED_PENDING');
    assert.strictEqual(account.registrationStatus([{ estado: 'Ok', status: 'OK' }, { estado: 'Ok', status: 'LATE' }]), 'REGISTERED_UP_TO_DATE');

    // --- checkregistration: no devuelve datos personales y consulta por CUIL
    dbAnswers = [[{ estado: 'Ok', status: 'PENDING', nombre: 'JUAN', apellido: 'PEREZ', cuil: CUIL, fecha_valida: '2026-01-01' }]];
    queries = [];
    let r = await call(account.checkRegistration, { cuil: '20-12345678-6' });
    assert.strictEqual(r.res, 'ok');
    assert.strictEqual(r.registered, true);
    assert.strictEqual(r.pendingFeDeVida, true);
    assert.deepStrictEqual(queries[0].p, [CUIL, CUIL]);
    const texto = JSON.stringify(r);
    assert.ok(!/JUAN|PEREZ|2026|nombre|apellido/.test(texto), 'no debe filtrar datos personales');

    r = await call(account.checkRegistration, { cuil: '20123456787' });
    assert.strictEqual(r.res, 'error');
    assert.strictEqual(queries.length, 1, 'un CUIL invalido no consulta la base');

    // no registrado pero con entidad adherida (figura en usuario_empresa): puede registrarse
    dbAnswers = [[], [{ empresa: 'TESTBANCO' }]];
    r = await call(account.checkRegistration, { cuil: CUIL });
    assert.strictEqual(r.registered, false);
    assert.strictEqual(r.registration, 'NOT_REGISTERED');
    assert.strictEqual(r.pendingFeDeVida, false);
    // no registrado y sin entidad adherida (no figura en usuario_empresa): no puede registrarse
    dbAnswers = [[], []];
    r = await call(account.checkRegistration, { cuil: CUIL });
    assert.strictEqual(r.registered, false);
    assert.strictEqual(r.registration, 'NOT_ADHERED');
    assert.ok(/entidad adherida/.test(r.message), r.message);

    // --- limite de intentos
    const lim = createLimiter({ max: 2, windowMs: 1000, now: (() => { let t = 0; return () => t; })() });
    assert.ok(lim.allow('a') && lim.allow('a') && !lim.allow('a') && lim.allow('b'));
    let t = 0;
    const lim2 = createLimiter({ max: 1, windowMs: 1000, now: () => t });
    assert.ok(lim2.allow('x')); assert.ok(!lim2.allow('x')); t = 1500; assert.ok(lim2.allow('x'));

    // --- agrupacion de certificaciones (una por Fe de Vida aunque haya varias empresas) y tope de 20
    const rows = [];
    for (let i = 1; i <= 25; i++) {
        rows.push({ id: i * 2, fecha: new Date(2026, 0, i), empresa: 'BANCO A', session_id: 's' + i, direccion: 'x', auditor: null });
        rows.push({ id: i * 2 + 1, fecha: new Date(2026, 0, i), empresa: 'BANCO B', session_id: 's' + i, direccion: 'x', auditor: i === 25 ? 'ALERTA' : null });
    }
    const g = account.groupCertifications(rows, 20);
    assert.strictEqual(g.length, 20);
    assert.deepStrictEqual(g[0].empresas, ['BANCO A', 'BANCO B']);
    assert.strictEqual(g[0].estado, 'OBSERVADA');
    assert.ok(new Date(g[0].fecha) > new Date(g[19].fecha), 'mas reciente primero');
    assert.strictEqual(g[1].estado, 'OK');

    // --- historial: autorizacion por dispositivo
    const denied = 'No pudimos actualizar su historial. Realice una Fe de Vida desde este teléfono e inténtelo nuevamente.';
    dbAnswers = [[{ id_usuario: 7, id_device: 'TOKEN-OK' }], rows.slice(0, 4)];
    queries = [];
    r = await call(account.history, { cuil: CUIL, idDevice: 'TOKEN-OK' }, '2.2.2.2');
    assert.strictEqual(r.res, 'ok');
    assert.strictEqual(r.certificaciones.length, 2);
    assert.deepStrictEqual(queries[1].p, [7], 'solo el historial de esa persona');
    assert.ok(!/similitud|liveness|session/i.test(JSON.stringify(r)), 'no expone datos internos');

    dbAnswers = [[{ id_usuario: 7, id_device: 'OTRO' }]];
    queries = [];
    r = await call(account.history, { cuil: CUIL, idDevice: 'TOKEN-OK' }, '3.3.3.3');
    assert.strictEqual(r.message, denied);
    assert.strictEqual(queries.length, 1, 'con dispositivo distinto no se lee el historial');

    dbAnswers = [[]];
    r = await call(account.history, { cuil: CUIL, idDevice: 'TOKEN-OK' }, '4.4.4.4');
    assert.strictEqual(r.message, denied, 'mismo mensaje si el usuario no existe');

    r = await call(account.history, { cuil: CUIL }, '5.5.5.5');
    assert.strictEqual(r.message, denied);
    r = await call(account.history, { cuil: '20123456787', idDevice: 'x' }, '5.5.5.5');
    assert.strictEqual(r.message, denied);

    // --- refreshdevice: la app avisa que Firebase le renovo el token; se prueba con el token anterior
    const VIEJO = 'fcm-token-viejo-0123456789:APA91b-abcdefghijklmnop';
    const NUEVO = 'fcm-token-nuevo-9876543210:APA91b-qrstuvwxyzabcdef';
    const deniedR = 'No pudimos actualizar el dispositivo.';
    // token anterior correcto: se actualiza, y el UPDATE vuelve a exigir el token anterior
    dbAnswers = [[{ id_usuario: 7, id_device: VIEJO }], { affectedRows: 1 }];
    queries = [];
    r = await call(account.refreshDevice, { cuil: CUIL, idDevice: VIEJO, newIdDevice: NUEVO }, '6.6.6.6');
    assert.strictEqual(r.res, 'ok');
    assert.strictEqual(queries.length, 2);
    assert.ok(/UPDATE usuario SET id_device = \? WHERE id_usuario = \? AND id_device = \?/.test(queries[1].q));
    assert.deepStrictEqual(queries[1].p, [NUEVO, 7, VIEJO]);
    // reintento de la app: el servidor ya tiene el token nuevo -> ok sin tocar nada
    dbAnswers = [[{ id_usuario: 7, id_device: NUEVO }]];
    queries = [];
    r = await call(account.refreshDevice, { cuil: CUIL, idDevice: VIEJO, newIdDevice: NUEVO }, '6.6.6.6');
    assert.strictEqual(r.res, 'ok');
    assert.strictEqual(queries.length, 1, 'ya estaba actualizado: no hay UPDATE');
    // sin prueba (el token anterior no es el guardado): no se toca nada y el mensaje no dice por que
    dbAnswers = [[{ id_usuario: 7, id_device: 'OTRO-TELEFONO-0123456789' }]];
    queries = [];
    r = await call(account.refreshDevice, { cuil: CUIL, idDevice: VIEJO, newIdDevice: NUEVO }, '7.7.7.7');
    assert.strictEqual(r.message, deniedR);
    assert.strictEqual(queries.length, 1, 'sin prueba no hay UPDATE');
    dbAnswers = [[]];
    r = await call(account.refreshDevice, { cuil: CUIL, idDevice: VIEJO, newIdDevice: NUEVO }, '7.7.7.7');
    assert.strictEqual(r.message, deniedR, 'mismo mensaje si el usuario no existe');
    // datos invalidos: ni se consulta la base
    queries = [];
    for (const body of [
        { cuil: CUIL, idDevice: VIEJO }, { cuil: CUIL, newIdDevice: NUEVO }, { cuil: CUIL, idDevice: VIEJO, newIdDevice: VIEJO },
        { cuil: '20123456787', idDevice: VIEJO, newIdDevice: NUEVO }, { cuil: CUIL, idDevice: 'corto', newIdDevice: NUEVO },
        { cuil: CUIL, idDevice: VIEJO, newIdDevice: 'tiene espacios y <script> 123456' }, { cuil: CUIL, idDevice: VIEJO, newIdDevice: 'x'.repeat(5000) }
    ]) {
        r = await call(account.refreshDevice, body, '8.8.8.8');
        assert.strictEqual(r.message, deniedR, JSON.stringify(body).slice(0, 80));
    }
    assert.strictEqual(queries.length, 0, 'con datos invalidos no se consulta la base');
    assert.ok(account.tokenValido(VIEJO) && !account.tokenValido('corto') && !account.tokenValido(null));
    // freno por origen
    let ultimo;
    for (let i = 0; i < 40; i++) ultimo = await call(account.refreshDevice, { cuil: CUIL, idDevice: VIEJO, newIdDevice: NUEVO }, '9.9.9.9');
    assert.ok(/Demasiados intentos/.test(ultimo.message), 'se frena la insistencia desde un mismo origen');

    console.log('account.test.js OK');
    process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
