// Crea las tablas de prueba y datos FICTICIOS en la MySQL local (puerto 3307). Uso: node test/db/setup.js
const fs = require('fs');
const path = require('path');
const mysql = require('mysql');
const cuil = require('../../utils/cuil');

function mk(prefijo, dni) {
    const diez = prefijo + String(dni).padStart(8, '0');
    const d = cuil.checkDigit(diez);
    if (d < 0) throw new Error('sin verificador ' + diez);
    return diez + d;
}
const PERSONAS = {
    ana:   { dni: '11111111', sexo: 'F', cuil: mk('27', '11111111'), nombre: 'ANA MARIA', apellido: 'PRUEBA' },
    beto:  { dni: '11111111', sexo: 'F', cuil: mk('23', '11111111'), nombre: 'BEATRIZ', apellido: 'DUPLICADA' }, // mismo DNI y sexo que Ana
    carlos:{ dni: '22222222', sexo: 'M', cuil: mk('20', '22222222'), nombre: 'CARLOS', apellido: 'ALDIA' },
    dora:  { dni: '33333333', sexo: 'F', cuil: mk('27', '33333333'), nombre: 'DORA', apellido: 'DESAPROBADA' },
};
module.exports = { PERSONAS };

if (require.main === module) {
    const db = mysql.createConnection({ host: '127.0.0.1', port: 3307, user: 'root', password: '', database: 'vida_test', multipleStatements: true });
    const q = (sql, p) => new Promise((res, rej) => db.query(sql, p, (e, r) => e ? rej(e) : res(r)));
    (async () => {
        await q(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
        await q("INSERT INTO empresa (id, tipo, periodicidad) VALUES ('TESTBANCO','D',6)");
        const ids = {};
        for (const [k, p] of Object.entries(PERSONAS)) {
            const r = await q('INSERT INTO usuario (dni, sexo, cuil, nombre, apellido, nacimiento, estado, fecha, id_device, email, telefono, emailVrf, telefonoVrf) VALUES (?,?,?,?,?,?,?,NOW(),?,?,?,1,1)',
                [p.dni, p.sexo, p.cuil, p.nombre, p.apellido, '1950-05-05', k === 'dora' ? 'Desaprobado' : 'Ok', 'DEVICE-' + k.toUpperCase(),
                    k + '@example.test', '+54911000000' + (10 + Object.keys(PERSONAS).indexOf(k))]);
            ids[k] = r.insertId;
            await q("INSERT INTO usuario_empresa (cuil, empresa, fecha_recordatorio, notificacion, proxima) VALUES (?, 'TESTBANCO', NULL, NULL, DATE_ADD(CURDATE(), INTERVAL 60 DAY))", [p.cuil]);
        }
        // Ana: 25 certificaciones, la ultima hace 8 meses (-> Fe de Vida PENDIENTE). Cada una con su session_id.
        for (let i = 0; i < 25; i++) {
            await q("INSERT INTO auditoria (id_usuario, fecha, similitud, empresa, latitud, longitud, direccion, cuil, session_id, id_device) VALUES (?, DATE_SUB(NOW(), INTERVAL ? DAY), 95, 'TESTBANCO', '-34.6', '-58.4', ?, ?, ?, 'DEVICE-ANA')",
                [ids.ana, 240 + i * 10, 'Calle de prueba ' + i, PERSONAS.ana.cuil, 'sess-ana-' + i]);
        }
        // Beto (mismo DNI+sexo que Ana) y Carlos: certificados hace 10 dias (AL DIA)
        for (const k of ['beto', 'carlos']) {
            await q("INSERT INTO auditoria (id_usuario, fecha, similitud, empresa, cuil, session_id) VALUES (?, DATE_SUB(NOW(), INTERVAL 10 DAY), 95, 'TESTBANCO', ?, ?)", [ids[k], PERSONAS[k].cuil, 'sess-' + k]);
        }
        console.log('Datos de prueba creados. CUIL:', Object.fromEntries(Object.entries(PERSONAS).map(([k, p]) => [k, p.cuil])));
        db.end();
    })().catch((e) => { console.error(e); process.exit(1); });
}
