// ABM de Empresas y de sus Administradores (solo el Administrador de TUID, permiso EMPRESAS).
// Hasta ahora una empresa y su administrador los cargaba un desarrollador directamente en la base de datos.
// Cada empresa tiene su Administrador, que despues crea y habilita a sus usuarios desde "Gestionar usuarios" (ya existente).
const util = require('../../../utils/empresas');

const HORAS_INVITACION = 48;

// deps: { db: { sync_query }, enviar(plantilla, params, para), urlPanel() }
module.exports.crear = function (deps) {
    const db = deps.db;
    let columnasCache = null;

    async function columnas() {
        if (columnasCache) return columnasCache;
        const filas = await db.sync_query('SHOW COLUMNS FROM empresa');
        columnasCache = filas.map((f) => ({ nombre: f.Field, obligatoria: f.Null === 'NO' && f.Default == null && !/auto_increment/i.test(f.Extra || '') }));
        return columnasCache;
    }

    async function tiposExistentes() {
        const filas = await db.sync_query('SELECT DISTINCT tipo FROM empresa WHERE tipo IS NOT NULL');
        const tipos = filas.map((f) => String(f.tipo).toUpperCase());
        return tipos.includes('E') ? tipos : ['E'].concat(tipos); // 'E' es el tipo por defecto de la tabla
    }

    const responder = (res, error, data) => res.status(200).json({ error, data });

    // Empresas con la cantidad de administradores y usuarios activos de cada una
    async function listar(req, res) {
        try {
            const cols = (await columnas()).map((c) => c.nombre);
            const campos = ['id'].concat(util.CAMPOS_EMPRESA.filter((c) => cols.includes(c))).map((c) => 'e.' + c).join(', ');
            const filas = await db.sync_query(
                `SELECT ${campos},
                   (SELECT COUNT(*) FROM cliente c WHERE c.empresa = e.id AND c.activo = 1 AND c.rol <> 'U') AS administradores,
                   (SELECT COUNT(*) FROM cliente c WHERE c.empresa = e.id AND c.activo = 1 AND c.rol = 'U') AS usuarios,
                   (SELECT COUNT(*) FROM cliente c WHERE c.empresa = e.id) AS cuentas
                 FROM empresa e ORDER BY e.id`);
            return responder(res, 0, { empresas: filas, tipos: await tiposExistentes() });
        } catch (err) {
            console.log(err);
            return responder(res, 1, 'No se pudieron leer las empresas');
        }
    }

    // Crea la cuenta de un administrador (sin clave) y le envia por correo el codigo para fijarla
    async function invitarCuenta(empresa, email, rol, creadoPor) {
        const token = util.generarToken();
        const existente = await db.sync_query('SELECT id_usuario, empresa FROM cliente WHERE email = ?', [email]);
        if (existente.length > 0) {
            if (existente[0].empresa !== empresa) return { error: 'Ese correo ya está en uso en otra empresa.' };
            await db.sync_query(
                `UPDATE cliente SET activo = 1, rol = ?, resetPasswordToken = ?, resetPasswordExpires = DATE_ADD(NOW(), INTERVAL ${HORAS_INVITACION} HOUR) WHERE id_usuario = ?`,
                [rol, token, existente[0].id_usuario]);
        } else {
            await db.sync_query(
                `INSERT INTO cliente (email, password, empresa, rol, activo, resetPasswordToken, resetPasswordExpires)
                 VALUES (?, ?, ?, ?, 1, ?, DATE_ADD(NOW(), INTERVAL ${HORAS_INVITACION} HOUR))`,
                [email, util.hashDescartable(), empresa, rol, token]);
        }
        await deps.enviar('invitacion_admin', {
            title: 'Su acceso al panel de TuID Vida', empresa, email, token, horas: HORAS_INVITACION, urlPanel: deps.urlPanel()
        }, email);
        return { ok: true };
    }

    // POST /auth/empresas { id, tipo, periodicidad, img, link, direcciones, emails, telefonos, admin_email }
    async function crear(req, res) {
        try {
            const tipos = await tiposExistentes();
            const v = util.validarEmpresa(req.body, tipos, true);
            if (v.error) return responder(res, 1, v.error);
            const adminEmail = String((req.body && req.body.admin_email) || '').trim().toLowerCase();
            if (!util.emailValido(adminEmail)) return responder(res, 1, 'Ingrese el correo del Administrador de la empresa.');
            if ((await db.sync_query('SELECT id FROM empresa WHERE UPPER(id) = ?', [v.valores.id])).length > 0) {
                return responder(res, 1, 'Ya existe una empresa con ese nombre.');
            }
            const otra = await db.sync_query('SELECT empresa FROM cliente WHERE email = ?', [adminEmail]);
            if (otra.length > 0) return responder(res, 1, 'Ese correo ya está en uso en otra cuenta.');

            const cols = await columnas();
            const nombres = cols.map((c) => c.nombre);
            const insertar = {};
            for (const campo of ['id'].concat(util.CAMPOS_EMPRESA)) {
                if (v.valores[campo] !== undefined && nombres.includes(campo)) insertar[campo] = v.valores[campo];
            }
            // La tabla puede exigir otras columnas que este modulo no conoce: se avisa en lugar de guardar algo incompleto
            const faltan = cols.filter((c) => c.obligatoria && insertar[c.nombre] === undefined).map((c) => c.nombre);
            if (faltan.length > 0) return responder(res, 1, 'La tabla de empresas exige datos que este formulario todavía no pide: ' + faltan.join(', '));

            await db.sync_query('INSERT INTO empresa SET ?', [insertar]);
            const r = await invitarCuenta(v.valores.id, adminEmail, 'A', req.user && req.user.email);
            if (r.error) {
                await db.sync_query('DELETE FROM empresa WHERE id = ?', [v.valores.id]); // no queda una empresa sin administrador
                return responder(res, 1, r.error);
            }
            return responder(res, 0, { id: v.valores.id, mensaje: 'Empresa creada. Se envió al administrador un correo para que fije su clave.' });
        } catch (err) {
            console.log(err);
            return responder(res, 1, 'No se pudo crear la empresa');
        }
    }

    // PUT /auth/empresas/:id { tipo?, periodicidad?, img?, link?, direcciones?, emails?, telefonos? }
    async function actualizar(req, res) {
        try {
            const id = util.normalizarId(req.params.id);
            const tipos = await tiposExistentes();
            const v = util.validarEmpresa(req.body, tipos, false);
            if (v.error) return responder(res, 1, v.error);
            const nombres = (await columnas()).map((c) => c.nombre);
            const campos = Object.keys(v.valores).filter((c) => nombres.includes(c));
            if (campos.length === 0) return responder(res, 1, 'No hay nada para cambiar');
            const r = await db.sync_query(`UPDATE empresa SET ${campos.map((c) => c + ' = ?').join(', ')} WHERE id = ?`, campos.map((c) => v.valores[c]).concat([id]));
            if (!r.affectedRows) return responder(res, 1, 'No se encontró la empresa');
            return responder(res, 0, 'Empresa actualizada');
        } catch (err) {
            console.log(err);
            return responder(res, 1, 'No se pudo actualizar la empresa');
        }
    }

    // GET /auth/empresas/:id/cuentas -> administradores y usuarios de la empresa
    async function cuentas(req, res) {
        try {
            const filas = await db.sync_query(
                `SELECT id_usuario, email, rol, activo, fecha_ultima,
                        (resetPasswordToken IS NOT NULL AND resetPasswordExpires > NOW()) AS invitacion_vigente
                 FROM cliente WHERE empresa = ? ORDER BY rol, email`, [util.normalizarId(req.params.id)]);
            return responder(res, 0, filas);
        } catch (err) {
            console.log(err);
            return responder(res, 1, 'No se pudieron leer las cuentas');
        }
    }

    // POST /auth/empresas/:id/administradores { email }  -> nuevo administrador (o reinvitar a uno existente)
    async function invitar(req, res) {
        try {
            const id = util.normalizarId(req.params.id);
            const email = String((req.body && req.body.email) || '').trim().toLowerCase();
            if (!util.emailValido(email)) return responder(res, 1, 'Ingrese un correo válido.');
            if ((await db.sync_query('SELECT id FROM empresa WHERE id = ?', [id])).length === 0) return responder(res, 1, 'No se encontró la empresa');
            const r = await invitarCuenta(id, email, 'A', req.user && req.user.email);
            if (r.error) return responder(res, 1, r.error);
            return responder(res, 0, 'Se envió el correo para que fije su clave.');
        } catch (err) {
            console.log(err);
            return responder(res, 1, 'No se pudo enviar la invitación');
        }
    }

    // POST /auth/empresas/:id/cuentas/:idUsuario/estado { activo: true|false }  -> habilita o deshabilita una cuenta
    async function estadoCuenta(req, res) {
        try {
            const activo = req.body && req.body.activo;
            if (typeof activo !== 'boolean') return responder(res, 1, 'Se debe enviar "activo": true o false');
            const r = await db.sync_query('UPDATE cliente SET activo = ?, reintento = 0 WHERE id_usuario = ? AND empresa = ?',
                [activo ? 1 : 0, parseInt(req.params.idUsuario, 10) || 0, util.normalizarId(req.params.id)]);
            if (!r.affectedRows) return responder(res, 1, 'No se encontró la cuenta');
            return responder(res, 0, activo ? 'Cuenta habilitada' : 'Cuenta deshabilitada');
        } catch (err) {
            console.log(err);
            return responder(res, 1, 'No se pudo cambiar la cuenta');
        }
    }

    // POST /auth/empresas/:id/acceso { activo: true|false } -> suspende o reactiva el acceso de TODAS las cuentas de la empresa (no borra nada)
    async function accesoEmpresa(req, res) {
        try {
            const activo = req.body && req.body.activo;
            if (typeof activo !== 'boolean') return responder(res, 1, 'Se debe enviar "activo": true o false');
            const id = util.normalizarId(req.params.id);
            if (id === 'TUID') return responder(res, 1, 'No se puede suspender el acceso de TUID.');
            const r = await db.sync_query('UPDATE cliente SET activo = ? WHERE empresa = ?', [activo ? 1 : 0, id]);
            return responder(res, 0, activo ? `Acceso reactivado (${r.affectedRows} cuentas)` : `Acceso suspendido (${r.affectedRows} cuentas)`);
        } catch (err) {
            console.log(err);
            return responder(res, 1, 'No se pudo cambiar el acceso');
        }
    }

    return { listar, crear, actualizar, cuentas, invitar, estadoCuenta, accesoEmpresa };
};
