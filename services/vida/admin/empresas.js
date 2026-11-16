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

    // Campos del periodo de certificacion -> columna real de `empresa` (sin distinguir mayusculas; la cantidad puede llamarse Cantidad o cantidad_registros)
    const PERIODO = [
        { campo: 'fecha_actual', candidatas: ['fecha_actual'] },
        { campo: 'fecha_fin', candidatas: ['fecha_fin'] },
        { campo: 'fecha_proxima', candidatas: ['fecha_proxima'] },
        { campo: 'cantidad_registros', candidatas: ['cantidad', 'cantidad_registros'] }
    ];
    async function columnasPeriodo() {
        const nombres = (await columnas()).map((c) => c.nombre);
        const r = [];
        for (const p of PERIODO) {
            const real = nombres.find((n) => p.candidatas.includes(n.toLowerCase()));
            if (real) r.push({ campo: p.campo, real });
        }
        return r;
    }

    async function tiposExistentes() {
        const filas = await db.sync_query('SELECT DISTINCT tipo FROM empresa WHERE tipo IS NOT NULL');
        const tipos = filas.map((f) => String(f.tipo).toUpperCase());
        return tipos.includes('E') ? tipos : ['E'].concat(tipos); // 'E' es el tipo por defecto de la tabla
    }

    const responder = (res, error, data) => res.status(200).json({ error, data });

    // El Administrador de TUID ve y maneja todas las empresas; el Administrador de una empresa cliente solo la suya.
    const esTuid = (req) => !!(req.user && req.user.empresa === 'TUID');
    const puedeVer = (req, id) => esTuid(req) || (req.user && req.user.empresa === id);
    const soloTuid = (req, res) => (esTuid(req) ? true : (responder(res, 1, 'Error de permisos'), false));

    // Empresas con la cantidad de administradores y usuarios activos de cada una
    async function listar(req, res) {
        try {
            const cols = (await columnas()).map((c) => c.nombre);
            const campos = ['id'].concat(util.CAMPOS_EMPRESA.filter((c) => cols.includes(c))).map((c) => 'e.' + c).join(', ');
            // Periodo: en produccion las columnas son Fecha_actual, Fecha_fin, Fecha_proxima y Cantidad (se leen con alias fijo)
            const periodo = (await columnasPeriodo()).map((p) => `e.${p.real} AS ${p.campo}`).join(', ');
            const filas = await db.sync_query(
                `SELECT ${campos}${periodo ? ', ' + periodo : ''},
                   (SELECT COUNT(*) FROM cliente c WHERE c.empresa = e.id AND c.activo = 1 AND c.rol <> 'U') AS administradores,
                   (SELECT COUNT(*) FROM cliente c WHERE c.empresa = e.id AND c.activo = 1 AND c.rol = 'U') AS usuarios,
                   (SELECT COUNT(*) FROM cliente c WHERE c.empresa = e.id) AS cuentas
                 FROM empresa e ${esTuid(req) ? '' : 'WHERE e.id = ?'} ORDER BY e.id`, esTuid(req) ? [] : [req.user.empresa]);
            return responder(res, 0, { empresas: filas, tipos: await tiposExistentes() });
        } catch (err) {
            console.log(err);
            return responder(res, 1, 'No se pudieron leer las empresas');
        }
    }

    // Crea la cuenta de un administrador (sin clave) y le envia por correo el codigo para fijarla
    async function invitarCuenta(empresa, email, rol, creadoPor, extra) {
        extra = extra || {};
        const token = util.generarToken();
        const existente = await db.sync_query('SELECT id_usuario, empresa FROM cliente WHERE email = ?', [email]);
        if (existente.length > 0) {
            if (existente[0].empresa !== empresa) return { error: 'Ese correo ya está en uso en otra empresa.' };
            await db.sync_query(
                `UPDATE cliente SET activo = 1, rol = ?, resetPasswordToken = ?, resetPasswordExpires = DATE_ADD(NOW(), INTERVAL ${HORAS_INVITACION} HOUR) WHERE id_usuario = ?`,
                [rol, token, existente[0].id_usuario]);
            if (extra.cuil) await db.sync_query('UPDATE cliente SET cuil = ?, nombre = ? WHERE id_usuario = ?', [extra.cuil, extra.nombre, existente[0].id_usuario]);
        } else {
            await db.sync_query(
                `INSERT INTO cliente (email, password, empresa, rol, activo, resetPasswordToken, resetPasswordExpires${extra.cuil ? ', cuil, nombre' : ''})
                 VALUES (?, ?, ?, ?, 1, ?, DATE_ADD(NOW(), INTERVAL ${HORAS_INVITACION} HOUR)${extra.cuil ? ', ?, ?' : ''})`,
                [email, util.hashDescartable(), empresa, rol, token].concat(extra.cuil ? [extra.cuil, extra.nombre] : []));
        }
        await deps.enviar('invitacion_admin', {
            title: 'Su acceso al panel de TuID Vida', empresa, email, token, horas: HORAS_INVITACION, urlPanel: deps.urlPanel()
        }, email);
        return { ok: true };
    }

    // POST /auth/empresas { id, tipo, periodicidad, img, link, direcciones, emails, telefonos, admin_email }
    async function crear(req, res) {
        try {
            if (!soloTuid(req, res)) return;
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
            if (!soloTuid(req, res)) return;
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
            if (!puedeVer(req, util.normalizarId(req.params.id))) return responder(res, 1, 'Error de permisos');
            const filas = await db.sync_query(
                `SELECT id_usuario, CUIL AS cuil, Nombre AS nombre, email, rol, activo, fecha_ultima,
                        (CUIL IS NULL OR CUIL NOT REGEXP '^[0-9]{11}$') AS cuil_provisorio,
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
            if (!soloTuid(req, res)) return;
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
            if (!puedeVer(req, util.normalizarId(req.params.id))) return responder(res, 1, 'Error de permisos');
            const activo = req.body && req.body.activo;
            if (typeof activo !== 'boolean') return responder(res, 1, 'Se debe enviar "activo": true o false');
            const r = await db.sync_query(`UPDATE cliente SET activo = ?, reintento = 0 WHERE id_usuario = ? AND empresa = ?${esTuid(req) ? '' : " AND rol = 'U'"}`,
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
            if (!soloTuid(req, res)) return;
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

    // POST /auth/empresas/:id/usuarios { cuil, nombre, email, rol? } -> alta de un usuario de la empresa (recibe un correo para fijar su clave).
    // El CUIL es obligatorio por seguridad. El rol solo lo define el Administrador de TUID; para el resto siempre es 'U'.
    async function altaUsuario(req, res) {
        try {
            const id = util.normalizarId(req.params.id);
            if (!puedeVer(req, id)) return responder(res, 1, 'Error de permisos');
            const v = util.validarCuenta(req.body, true);
            if (v.error) return responder(res, 1, v.error);
            if ((await db.sync_query('SELECT id FROM empresa WHERE id = ?', [id])).length === 0) return responder(res, 1, 'No se encontró la empresa');
            const rol = esTuid(req) && ['U', 'A', 'S'].includes(String((req.body || {}).rol || 'U').toUpperCase()) ? String((req.body || {}).rol || 'U').toUpperCase() : 'U';
            const dup = await db.sync_query('SELECT id_usuario FROM cliente WHERE cuil = ? AND empresa = ? AND email <> ?', [v.valores.cuil, id, v.valores.email]);
            if (dup.length > 0) return responder(res, 1, 'Ya hay otra cuenta de esta empresa con ese CUIL.');
            const r = await invitarCuenta(id, v.valores.email, rol, req.user && req.user.email, { cuil: v.valores.cuil, nombre: v.valores.nombre });
            if (r.error) return responder(res, 1, r.error);
            return responder(res, 0, 'Usuario creado. Se envió el correo para que fije su clave.');
        } catch (err) {
            console.log(err);
            return responder(res, 1, 'No se pudo crear el usuario');
        }
    }

    // PUT /auth/empresas/:id/usuarios/:idUsuario { cuil?, nombre?, email?, rol? } -> modificacion. El rol solo lo cambia el Administrador de TUID.
    async function modificarUsuario(req, res) {
        try {
            const id = util.normalizarId(req.params.id);
            if (!puedeVer(req, id)) return responder(res, 1, 'Error de permisos');
            const idUsuario = parseInt(req.params.idUsuario, 10) || 0;
            const v = util.validarCuenta(req.body, false);
            if (v.error) return responder(res, 1, v.error);
            const cambios = Object.assign({}, v.valores);
            if (req.body && req.body.rol !== undefined && esTuid(req)) {
                const rol = String(req.body.rol).toUpperCase();
                if (!['U', 'A', 'S'].includes(rol)) return responder(res, 1, 'El rol no es válido.');
                cambios.rol = rol;
            }
            const campos = Object.keys(cambios);
            if (campos.length === 0) return responder(res, 1, 'No hay nada para cambiar');
            const actual = await db.sync_query('SELECT id_usuario, rol FROM cliente WHERE id_usuario = ? AND empresa = ?', [idUsuario, id]);
            if (actual.length === 0) return responder(res, 1, 'No se encontró la cuenta');
            if (!esTuid(req) && actual[0].rol !== 'U') return responder(res, 1, 'Error de permisos');
            if (cambios.email) {
                const otro = await db.sync_query('SELECT id_usuario FROM cliente WHERE email = ? AND id_usuario <> ?', [cambios.email, idUsuario]);
                if (otro.length > 0) return responder(res, 1, 'Ese correo ya está en uso en otra cuenta.');
            }
            if (cambios.cuil) {
                const otro = await db.sync_query('SELECT id_usuario FROM cliente WHERE cuil = ? AND empresa = ? AND id_usuario <> ?', [cambios.cuil, id, idUsuario]);
                if (otro.length > 0) return responder(res, 1, 'Ya hay otra cuenta de esta empresa con ese CUIL.');
            }
            await db.sync_query(`UPDATE cliente SET ${campos.map((c) => c + ' = ?').join(', ')} WHERE id_usuario = ? AND empresa = ?`,
                campos.map((c) => cambios[c]).concat([idUsuario, id]));
            return responder(res, 0, 'Usuario actualizado');
        } catch (err) {
            console.log(err);
            return responder(res, 1, 'No se pudo actualizar el usuario');
        }
    }

    // Periodo de la ultima subida de archivo (inicio, fin, proxima validacion y cantidad de registros). Lo usa la subida de archivos.
    async function guardarPeriodo(empresa, valores) {
        const cols = await columnasPeriodo();
        if (cols.length < PERIODO.length) throw new Error('Faltan columnas de periodo en empresa (fecha_actual, fecha_fin, fecha_proxima, Cantidad)');
        await db.sync_query(`UPDATE empresa SET ${cols.map((c) => c.real + ' = ?').join(', ')}, ultimo_archivo = NOW() WHERE id = ?`,
            cols.map((c) => valores[c.campo]).concat([empresa]));
    }

    return { listar, crear, actualizar, cuentas, invitar, estadoCuenta, accesoEmpresa, altaUsuario, modificarUsuario, guardarPeriodo };
};
