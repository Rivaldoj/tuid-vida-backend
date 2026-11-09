// Agrega a la base de PRUEBA local (puerto 3307) las personas de test/db/usuarios-locales.json (archivo local, NO se sube a git).
// Cada una queda registrada, con una entidad adherida y su ultima Fe de Vida hace 8 meses (-> Fe de Vida PENDIENTE).
// Uso: node test/db/agregar-usuarios-locales.js   (despues de node test/db/setup.js, que borra y vuelve a crear los datos)
const fs = require('fs');
const path = require('path');
const mysql = require('mysql');
const cuil = require('../../utils/cuil');

const archivo = path.join(__dirname, 'usuarios-locales.json');
if (!fs.existsSync(archivo)) {
    console.log('No hay test/db/usuarios-locales.json: nada para agregar.');
    process.exit(0);
}
const personas = JSON.parse(fs.readFileSync(archivo, 'utf8'));
const db = mysql.createConnection({ host: '127.0.0.1', port: 3307, user: 'root', password: '', database: 'vida_test' });
const q = (sql, p) => new Promise((res, rej) => db.query(sql, p, (e, r) => (e ? rej(e) : res(r))));

(async () => {
    for (const p of personas) {
        const c = cuil.normalize(p.cuil);
        if (!cuil.isValid(c)) throw new Error('CUIL invalido: ' + p.cuil);
        await q('DELETE FROM usuario_empresa WHERE cuil = ?', [c]);
        await q('DELETE FROM auditoria WHERE cuil = ?', [c]);
        await q('DELETE FROM usuario WHERE cuil = ?', [c]);
        const r = await q('INSERT INTO usuario (dni, sexo, cuil, nombre, apellido, nacimiento, estado, fecha, id_device, email, telefono, emailVrf, telefonoVrf) VALUES (?,?,?,?,?,?,?,NOW(),?,?,?,1,1)',
            [p.dni, p.sexo, c, p.nombre, p.apellido, p.nacimiento || '1950-01-01', 'Ok', p.idDevice || null, p.email || null, p.telefono || null]);
        await q("INSERT INTO usuario_empresa (cuil, empresa, fecha_recordatorio, notificacion, proxima) VALUES (?, 'TESTBANCO', NULL, NULL, DATE_ADD(CURDATE(), INTERVAL 60 DAY))", [c]);
        await q("INSERT INTO auditoria (id_usuario, fecha, similitud, empresa, latitud, longitud, direccion, cuil, session_id, id_device) VALUES (?, DATE_SUB(NOW(), INTERVAL 240 DAY), 95, 'TESTBANCO', '-34.6', '-58.4', 'Calle de prueba', ?, ?, ?)",
            [r.insertId, c, 'sess-local-' + c, p.idDevice || null]);
        console.log('Agregado:', p.nombre, p.apellido, c);
    }
    db.end();
})().catch((e) => { console.error(e); process.exit(1); });
