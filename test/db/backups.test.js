// Volcado de la base a SQL y restauracion, contra la MySQL LOCAL de prueba. Requiere: node test/db/setup.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const util = require('util');
const { PassThrough } = require('stream');
const mysql = require('mysql');
const Module = require('module');

global.CONFIG = { get: () => ({}), has: () => false };
const base = { host: '127.0.0.1', port: 3307, user: 'root', password: '', multipleStatements: true };
const pool = mysql.createPool({ ...base, database: 'vida_test' });
const q = util.promisify(pool.query).bind(pool);
global.VIDA_DB = { sync_query: q };
const orig = Module._load;
Module._load = function (req) {
    if (/aws-sdk/.test(req)) return {};
    return orig.apply(this, arguments);
};
const backups = require('../../utils/backups');

(async () => {
    // 1) configuracion
    await q('DROP TABLE IF EXISTS configuracion_historial; DROP TABLE IF EXISTS configuracion; DROP TABLE IF EXISTS backups;');
    await q(fs.readFileSync(path.join(__dirname, '../../scripts/sql/configuracion.sql'), 'utf8'));
    await q(fs.readFileSync(path.join(__dirname, '../../scripts/sql/backups.sql'), 'utf8'));
    assert.deepStrictEqual(await backups.leerConfig(), { activo: true, hora: 3 });
    assert.ok(backups.validarConfig({ activo: true, hora: 24 }).error);
    assert.ok(backups.validarConfig({ activo: 'si', hora: 3 }).error);
    await backups.guardarConfig(backups.validarConfig({ activo: false, hora: 5 }), 'admin@tuid.test');
    assert.deepStrictEqual(await backups.leerConfig(), { activo: false, hora: 5 });
    assert.strictEqual((await q("SELECT COUNT(*) n FROM configuracion_historial WHERE clave LIKE 'backup%'"))[0].n, 2);
    console.log('ok  configuracion de backups con historial');

    // 2) hora en Argentina
    const a = backups.ahoraArgentina(new Date('2026-11-14T02:30:00Z')); // 23:30 del 13/11 en Argentina (UTC-3)
    assert.strictEqual(a.dia, '2026-11-13');
    assert.strictEqual(a.hora, 23);
    assert.strictEqual(a.diaSemana, 5);
    console.log('ok  fecha y hora de Argentina');

    // 3) volcado y restauracion: datos de todo tipo
    await q('CREATE DATABASE IF NOT EXISTS vida_bk_origen; CREATE DATABASE IF NOT EXISTS vida_bk_copia;');
    const origen = mysql.createPool({ ...base, database: 'vida_bk_origen' });
    const qo = util.promisify(origen.query).bind(origen);
    await qo('SET FOREIGN_KEY_CHECKS=0; DROP TABLE IF EXISTS rara; DROP TABLE IF EXISTS hija; DROP TABLE IF EXISTS padre; DROP VIEW IF EXISTS vista_rara; SET FOREIGN_KEY_CHECKS=1;');
    await qo(`CREATE TABLE padre (id INT AUTO_INCREMENT PRIMARY KEY, nombre VARCHAR(100)) ENGINE=InnoDB;
              CREATE TABLE hija (id INT AUTO_INCREMENT PRIMARY KEY, padre_id INT NOT NULL, FOREIGN KEY (padre_id) REFERENCES padre(id)) ENGINE=InnoDB;
              CREATE TABLE rara (id BIGINT PRIMARY KEY, texto TEXT, foto MEDIUMBLOB, fecha DATETIME, dia DATE, importe DECIMAL(12,2), flag TINYINT(1), j VARCHAR(50) NULL) ENGINE=InnoDB;
              CREATE VIEW vista_rara AS SELECT id, texto FROM rara;`);
    await qo("INSERT INTO padre (nombre) VALUES ('O''Brien \"x\"'), ('Ñandú ✓'), (NULL)");
    await qo('INSERT INTO hija (padre_id) VALUES (1),(2)');
    const blob = Buffer.from([0, 1, 2, 255, 39, 92, 10, 13]);
    await qo('INSERT INTO rara VALUES (?,?,?,?,?,?,?,?)', ['9007199254740993', "linea1\nlinea2 \\ ' \"", blob, '2026-11-13 23:59:59', '2026-11-13', '12345.60', 1, null]);
    for (let i = 0; i < 450; i++) await qo('INSERT INTO rara (id, texto) VALUES (?, ?)', [i + 1, 'fila ' + i]);

    const sal = new PassThrough(); const partes = [];
    sal.on('data', (c) => partes.push(c));
    const res = await backups.volcarBase(origen, 'vida_bk_origen', sal);
    sal.end();
    const sql = Buffer.concat(partes).toString('utf8');
    assert.strictEqual(res.tablas, 3);
    assert.strictEqual(res.filas, 3 + 2 + 451);
    assert.ok(sql.includes('CREATE ALGORITHM') || sql.includes('VIEW'), 'incluye la vista');

    const copia = mysql.createPool({ ...base, database: 'vida_bk_copia' });
    const qc = util.promisify(copia.query).bind(copia);
    await qc('SET FOREIGN_KEY_CHECKS=0; DROP TABLE IF EXISTS rara; DROP TABLE IF EXISTS hija; DROP TABLE IF EXISTS padre; DROP VIEW IF EXISTS vista_rara; SET FOREIGN_KEY_CHECKS=1;');
    await qc(sql);
    for (const t of ['padre', 'hija']) {
        assert.deepStrictEqual(JSON.parse(JSON.stringify(await qc(`SELECT * FROM ${t} ORDER BY id`))), JSON.parse(JSON.stringify(await qo(`SELECT * FROM ${t} ORDER BY id`))), t);
    }
    const sel = 'SELECT id, texto, HEX(foto) foto, DATE_FORMAT(fecha, "%Y-%m-%d %H:%i:%s") fecha, dia, importe, flag, j FROM rara ORDER BY id';
    assert.deepStrictEqual(JSON.parse(JSON.stringify(await qc(sel))), JSON.parse(JSON.stringify(await qo(sel))));
    const fila = (await qc("SELECT CAST(id AS CHAR) id, HEX(foto) foto, importe FROM rara WHERE id > 1000"))[0];
    assert.strictEqual(fila.id, '9007199254740993', 'no pierde precision en BIGINT');
    assert.strictEqual(fila.foto, '000102FF275C0A0D');
    assert.strictEqual((await qc('SELECT COUNT(*) n FROM vista_rara'))[0].n, 451);
    console.log('ok  volcado y restauracion identicos (comillas, acentos, binarios, fechas, decimales, BIGINT, vistas, claves foraneas)');

    await q('DROP DATABASE vida_bk_origen; DROP DATABASE vida_bk_copia;');

    // 4) descarga: solo claves del bucket de backups
    const url = (c) => { try { return backups.urlDescarga(c); } catch (e) { return 'error'; } };
    assert.strictEqual(url('../secretos'), 'error');
    assert.strictEqual(url('otro/archivo.txt'), 'error');
    assert.strictEqual(url('db/../x'), 'error');
    console.log('ok  claves de descarga invalidas rechazadas');

    console.log('\nTodas las pruebas de backups pasaron.');
    pool.end(); origen.end(); copia.end();
    process.exit(0);
})().catch((e) => { console.error('FALLO:', e); process.exit(1); });
