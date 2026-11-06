// Prueba los enlaces de foto contra la MySQL LOCAL de prueba y un servidor Express de prueba (sin AWS ni produccion).
// Requiere: node test/db/setup.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const util = require('util');
const mysql = require('mysql');
const express = require('express');
const { PERSONAS } = require('./setup');
const fotos = require('../../utils/fotos');

const pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: '', database: 'vida_test', multipleStatements: true });
const db = { sync_query: util.promisify(pool.query).bind(pool) };
const claves = [];
const firmarFoto = (clave, segundos) => { claves.push(clave); return 'https://s3.example.test/' + clave + '?firmado=1&expira=' + segundos; };

function pedir(puerto, metodo, ruta, cuerpo) {
    return new Promise((resolve, reject) => {
        const datos = cuerpo ? new URLSearchParams(cuerpo).toString() : null;
        const req = http.request({ host: '127.0.0.1', port: puerto, path: ruta, method: metodo,
            headers: datos ? { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(datos) } : {} }, (res) => {
            let html = '';
            res.on('data', (c) => (html += c));
            res.on('end', () => resolve({ status: res.statusCode, html, headers: res.headers }));
        });
        req.on('error', reject);
        if (datos) req.write(datos);
        req.end();
    });
}

async function levantar(opciones) {
    const app = express();
    app.use('/vida/f', require('../../services/vida/fotos')(Object.assign({ db, firmarFoto }, opciones)));
    const server = app.listen(0, '127.0.0.1');
    await new Promise((r) => server.once('listening', r));
    return { server, puerto: server.address().port };
}

(async () => {
    const { ana } = PERSONAS;
    await db.sync_query('DROP TABLE IF EXISTS fotos_enlaces');
    await db.sync_query(fs.readFileSync(path.join(__dirname, '../../scripts/sql/fotos_enlaces.sql'), 'utf8'));

    // --- utilidades puras
    assert.ok(fotos.codigoValido(fotos.generarCodigo()));
    assert.notStrictEqual(fotos.generarCodigo(), fotos.generarCodigo());
    assert.strictEqual(fotos.claveFotoCertificacion('11111111', 'F'), 'login/11111111F.jpeg');
    assert.ok(fotos.confirmaCuil('27111111117', '117', 3));
    assert.ok(!fotos.confirmaCuil('27111111117', '118', 3));
    assert.ok(!fotos.codigoValido('../../etc/passwd') && !fotos.codigoValido("a' OR '1'='1"));

    const [u] = await db.sync_query('SELECT id_usuario FROM usuario WHERE cuil = ?', [ana.cuil]);
    const [a] = await db.sync_query('SELECT id_validacion FROM auditoria WHERE id_usuario = ? ORDER BY id_validacion LIMIT 1', [u.id_usuario]);
    const nuevo = (dias) => fotos.crearEnlace(db, { idValidacion: a.id_validacion, idUsuario: u.id_usuario, creadoPor: 'admin@tuid.test', dias });

    // ===== Modo por defecto: el telefono se valida por SMS, la persona ve su foto directamente =====
    let { server, puerto } = await levantar({});
    const { codigo } = await nuevo();
    let r = await pedir(puerto, 'GET', '/vida/f/' + codigo);
    assert.strictEqual(r.status, 200);
    assert.ok(r.html.includes('https://s3.example.test/login/11111111F.jpeg'), 'muestra la foto del ultimo login');
    assert.ok(r.html.includes('expira=600'), 'la foto firmada dura 10 minutos');
    assert.ok(/\d{2}\/\d{2}\/\d{4}/.test(r.html), 'muestra la fecha de la certificacion');
    assert.ok(r.html.includes('No es un fraude'));
    assert.ok(r.html.includes('https://tuid.ar/images/logos/Logo-vida30.png'), 'lleva el logo');
    assert.strictEqual(r.headers['cache-control'], 'no-store');
    assert.ok(/noindex/.test(r.headers['x-robots-tag']));
    assert.ok(/default-src 'none'/.test(r.headers['content-security-policy']));
    const [acc] = await db.sync_query('SELECT accesos, ultimo_acceso FROM fotos_enlaces WHERE codigo = ?', [codigo]);
    assert.strictEqual(acc.accesos, 1);
    assert.ok(acc.ultimo_acceso, 'queda registrado cuando se abrio');
    console.log('ok  por defecto: la persona ve su foto directamente y queda registrado el acceso');

    // vencido, inexistente y codigos raros
    const { codigo: c3 } = await nuevo();
    await db.sync_query('UPDATE fotos_enlaces SET vence_en = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE codigo = ?', [c3]);
    r = await pedir(puerto, 'GET', '/vida/f/' + c3);
    assert.strictEqual(r.status, 410);
    assert.ok(r.html.includes('venció') && !r.html.includes('s3.example.test'));
    assert.strictEqual((await pedir(puerto, 'GET', '/vida/f/' + 'A'.repeat(24))).status, 404);
    assert.strictEqual((await pedir(puerto, 'GET', '/vida/f/corto')).status, 404);
    assert.strictEqual((await pedir(puerto, 'GET', '/vida/f/..%2F..%2Fetc%2Fpasswd')).status, 404);
    console.log('ok  enlace vencido, inexistente o con formato raro: no muestra nada');

    // duracion maxima
    assert.strictEqual((await nuevo(30)).dias, 7);
    console.log('ok  duracion tope de 7 dias');
    server.close();

    // ===== Modo opcional: pedir los ultimos 3 digitos del CUIL (config vida.fotoRequiereCuil) =====
    ({ server, puerto } = await levantar({ requiereCuil: true }));
    const { codigo: c4 } = await nuevo();
    r = await pedir(puerto, 'GET', '/vida/f/' + c4);
    assert.ok(r.html.includes('últimos 3 números') && !r.html.includes('s3.example.test'));
    r = await pedir(puerto, 'POST', '/vida/f/' + c4, { cuil3: '117' });
    assert.ok(r.html.includes('s3.example.test'));
    const { codigo: c5 } = await nuevo();
    for (let i = 1; i <= 4; i++) {
        r = await pedir(puerto, 'POST', '/vida/f/' + c5, { cuil3: '000' });
        assert.strictEqual(r.status, 401);
    }
    r = await pedir(puerto, 'POST', '/vida/f/' + c5, { cuil3: '000' });
    assert.strictEqual(r.status, 410);
    r = await pedir(puerto, 'POST', '/vida/f/' + c5, { cuil3: '117' });
    assert.strictEqual(r.status, 410, 'bloqueado: ni con el CUIL correcto');
    console.log('ok  modo opcional con CUIL: confirma los ultimos 3 digitos y bloquea a los 5 intentos');

    console.log('\nTodas las pruebas de enlaces de foto pasaron.');
    server.close();
    pool.end();
    process.exit(0);
})().catch((e) => { console.error('FALLO:', e); process.exit(1); });
