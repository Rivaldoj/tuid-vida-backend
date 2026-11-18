// Notificaciones push desde el panel: se elige a quien (una persona, o por fechas de su ultima certificacion) y un texto prearmado del
// Modulo de Textos (canal push) o uno libre. Primero se puede ver cuantas personas lo recibirian ("destinatarios") y recien despues enviar.
const textos = require('../../../utils/textos');

const MAX_DESTINATARIOS = 5000;
const MODOS = ['cuil', 'dias', 'rango', 'nunca'];
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Valida los filtros del pedido. Devuelve { error } o { filtros }
function validarFiltros(body, usuarioLogueado) {
    const b = body || {};
    const empresa = usuarioLogueado.empresa === 'TUID' ? String(b.empresa || '').trim() : usuarioLogueado.empresa;
    if (!empresa) return { error: 'Elija la empresa.' };
    const modo = String(b.modo || '');
    if (!MODOS.includes(modo)) return { error: 'Elija a quién enviar.' };
    const f = { empresa, modo };
    if (modo === 'cuil') {
        f.cuil = String(b.cuil || '').replace(/\D/g, '');
        if (f.cuil.length !== 11) return { error: 'Ingrese el CUIL completo (11 dígitos).' };
    } else if (modo === 'dias') {
        f.dias = Number(b.dias);
        if (!Number.isInteger(f.dias) || f.dias < 1 || f.dias > 3650) return { error: 'Ingrese la cantidad de días (1 a 3650).' };
    } else if (modo === 'rango') {
        if (!FECHA.test(String(b.desde || '')) || !FECHA.test(String(b.hasta || ''))) return { error: 'Ingrese las fechas desde y hasta.' };
        if (b.desde > b.hasta) return { error: 'La fecha "desde" no puede ser posterior a "hasta".' };
        f.desde = b.desde;
        f.hasta = b.hasta;
    }
    return { filtros: f };
}

function resumenFiltros(f) {
    if (f.modo === 'cuil') return 'cuil ' + f.cuil;
    if (f.modo === 'dias') return 'sin certificar hace más de ' + f.dias + ' días';
    if (f.modo === 'rango') return 'última certificación entre ' + f.desde + ' y ' + f.hasta;
    return 'nunca certificaron';
}

async function buscar(db, f, fallecidas) {
    const params = [f.empresa];
    let donde = '';
    if (f.modo === 'cuil') {
        donde = 'AND t.cuil = ?';
        params.push(f.cuil);
    } else if (f.modo === 'dias') {
        donde = 'AND (t.ultima IS NULL OR t.ultima < DATE_SUB(CURDATE(), INTERVAL ? DAY))';
        params.push(f.dias);
    } else if (f.modo === 'rango') {
        donde = 'AND t.ultima >= ? AND t.ultima < DATE_ADD(?, INTERVAL 1 DAY)';
        params.push(f.desde, f.hasta);
    } else {
        donde = 'AND t.ultima IS NULL';
    }
    const filas = await db.sync_query(
        `SELECT t.* FROM (
            SELECT u.id_usuario, u.nombre, u.apellido, u.cuil, u.id_device, u.telefono, u.email, u.fecha, u.fecha_valida, ue.empresa,
                   (SELECT MAX(a.fecha) FROM auditoria a WHERE a.id_usuario = u.id_usuario AND a.empresa = ue.empresa) AS ultima
            FROM usuario u JOIN usuario_empresa ue ON ue.cuil = u.cuil
            WHERE ue.empresa = ? AND u.fecha_fallecido IS NULL
         ) t WHERE 1 = 1 ${donde} ORDER BY t.apellido, t.nombre LIMIT ${MAX_DESTINATARIOS + 1}`, params);
    // quienes figuran fallecidos en el padron (master) no reciben nada, aunque usuario no lo tenga marcado
    if (!fallecidas) return filas;
    const muertos = await fallecidas(filas.map((p) => p.cuil));
    return filas.filter((p) => !muertos.has(String(p.cuil)));
}

// El id_device es el token de Firebase del telefono: se renueva al reinstalar la app, cambiar de telefono o borrar sus datos, y Firebase lo da por
// vencido cuando el telefono pasa unos 270 dias sin conectarse. El servidor lo actualiza en cada certificacion, asi que su antiguedad es la de la
// ultima certificacion (o la del registro si nunca certifico).
const DIAS_TOKEN_VENCIDO = 270;

function diasDesde(valor, ahora) {
    if (!valor) return null;
    const t = new Date(valor).getTime();
    return isNaN(t) ? null : Math.floor(((ahora || Date.now()) - t) / 86400000);
}

// true si el token de esa persona probablemente ya no sirva por antiguedad
function tokenProbablementeVencido(p, ahora) {
    if (!p.id_device) return false;
    const dias = diasDesde(p.fecha_valida || p.fecha, ahora);
    return dias !== null && dias > DIAS_TOKEN_VENCIDO;
}

// Motivo de un envio fallido, en palabras (codigos de FCM HTTP v1)
function textoMotivo(motivo) {
    const m = String(motivo || '').toUpperCase();
    if (m === 'UNREGISTERED' || m === 'NOT_FOUND') return 'El teléfono ya no está registrado (app desinstalada o dispositivo cambiado)';
    if (m === 'INVALID_ARGUMENT') return 'Token de dispositivo inválido';
    if (m === 'SENDER_ID_MISMATCH') return 'Token de otra aplicación';
    if (m === 'UNAVAILABLE' || m === 'INTERNAL' || m === 'QUOTA_EXCEEDED') return 'Firebase no disponible (conviene reintentar)';
    if (m === 'SIN TOKEN DE DISPOSITIVO') return 'Sin la app instalada';
    return motivo ? String(motivo) : 'Motivo desconocido';
}

function datosPersona(p) {
    const nombre = textos.capitalizar(p.nombre);
    const apellido = textos.capitalizar(p.apellido);
    return {
        nombre, apellido, nombre_completo: `${nombre} ${apellido}`.trim(), cuil: textos.formatoCuil(p.cuil),
        empresa: p.empresa || '', fecha: textos.formatoFecha(new Date()), auditor: '', enlace_foto: ''
    };
}

// deps: { db: { sync_query }, push: { sendAsync(token, titulo, texto) } }
module.exports.crear = function (deps) {
    const db = deps.db;
    const responder = (res, error, data) => res.status(200).json({ error, data });

    // Textos push activos para el combo
    async function mensajes(req, res) {
        try {
            const filas = await db.sync_query("SELECT clave, nombre, asunto, cuerpo FROM textos WHERE canal = 'push' AND activo = 1 ORDER BY nombre");
            return responder(res, 0, filas);
        } catch (err) {
            console.log(err);
            return responder(res, 1, 'No se pudieron leer los mensajes');
        }
    }

    // POST /auth/notificaciones/destinatarios -> cuantas personas lo recibirian (no envia nada)
    async function destinatarios(req, res) {
        try {
            const v = validarFiltros(req.body, req.user);
            if (v.error) return responder(res, 1, v.error);
            const filas = await buscar(db, v.filtros, deps.fallecidas);
            const conDispositivo = filas.filter((p) => p.id_device).length;
            const probablementeSinPush = filas.filter((p) => tokenProbablementeVencido(p)).length;
            return responder(res, 0, {
                total: Math.min(filas.length, MAX_DESTINATARIOS), conDispositivo, sinDispositivo: filas.length - conDispositivo,
                // con dispositivo registrado pero sin certificar hace mas de 270 dias: es probable que el token ya no exista y no reciban nada
                probablementeSinPush, diasTokenVencido: DIAS_TOKEN_VENCIDO,
                excedeLimite: filas.length > MAX_DESTINATARIOS, limite: MAX_DESTINATARIOS,
                ejemplo: filas.slice(0, 5).map((p) => `${textos.capitalizar(p.nombre)} ${textos.capitalizar(p.apellido)}`)
            });
        } catch (err) {
            console.log(err);
            return responder(res, 1, err && err.publico ? err.message : 'No se pudieron buscar los destinatarios');
        }
    }

    // POST /auth/notificaciones/enviar { ...filtros, clave | (titulo, mensaje) }
    async function enviar(req, res) {
        try {
            const v = validarFiltros(req.body, req.user);
            if (v.error) return responder(res, 1, v.error);
            let titulo;
            let cuerpo;
            let clave = null;
            if (req.body.clave) {
                clave = String(req.body.clave).trim().toUpperCase();
                const [t] = await db.sync_query("SELECT asunto, cuerpo FROM textos WHERE clave = ? AND canal = 'push' AND activo = 1", [clave]);
                if (!t) return responder(res, 1, 'No se encontró ese mensaje o está desactivado.');
                titulo = t.asunto || 'TuID Vida';
                cuerpo = t.cuerpo;
            } else {
                titulo = String(req.body.titulo || '').trim();
                cuerpo = String(req.body.mensaje || '').trim();
                if (!titulo || !cuerpo) return responder(res, 1, 'Escriba el título y el mensaje, o elija un mensaje prearmado.');
                if (titulo.length > 100 || cuerpo.length > 200) return responder(res, 1, 'El título admite 100 caracteres y el mensaje 200.');
            }
            const filas = await buscar(db, v.filtros, deps.fallecidas);
            if (filas.length > MAX_DESTINATARIOS) return responder(res, 1, `Son más de ${MAX_DESTINATARIOS} personas: acote las fechas.`);
            const conDispositivo = filas.filter((p) => p.id_device);
            if (conDispositivo.length === 0) return responder(res, 1, 'No hay personas con la app instalada para ese filtro.');

            let enviados = 0;
            let fallidos = 0;
            const motivos = {};          // motivo (texto) -> cantidad
            const muertos = [];          // personas cuyo token Firebase dio por inexistente
            const noAlcanzados = [];     // personas a las que no les llego (con la razon), para contactarlas por otro medio
            for (let i = 0; i < conDispositivo.length; i += 20) {
                const lote = conDispositivo.slice(i, i + 20);
                const rs = await Promise.all(lote.map((p) => {
                    const d = datosPersona(p);
                    return deps.push.sendAsync(p.id_device, textos.render(titulo, d).texto, textos.render(cuerpo, d).texto);
                }));
                rs.forEach((r, k) => {
                    if (r.ok) { enviados++; return; }
                    fallidos++;
                    const texto = textoMotivo(r.motivo);
                    motivos[texto] = (motivos[texto] || 0) + 1;
                    noAlcanzados.push({ persona: lote[k], motivo: texto });
                    if (r.tokenInvalido) muertos.push(lote[k]);
                });
            }
            // Token que Firebase dice que ya no existe: se deja de usar (queda "sin la app" hasta que la persona certifique de nuevo y se guarde el nuevo).
            // Solo se borra si sigue siendo el mismo token (por si la persona certifico desde otro telefono mientras se enviaba).
            let invalidos = 0;
            for (const p of muertos) {
                try {
                    const r = await db.sync_query('UPDATE usuario SET id_device = NULL WHERE id_usuario = ? AND id_device = ?', [p.id_usuario, p.id_device]);
                    if (r && r.affectedRows) invalidos++;
                } catch (e) { console.log('[notificaciones] no se pudo limpiar el token de', p.id_usuario, e && e.message); }
            }
            const sinApp = filas.filter((p) => !p.id_device);
            sinApp.forEach((p) => noAlcanzados.push({ persona: p, motivo: textoMotivo('sin token de dispositivo') }));

            // Datos de contacto en la lista de no alcanzados: solo los que la empresa tiene permitido ver (TUID ve todo)
            let verTelefono = req.user.empresa === 'TUID';
            let verEmail = req.user.empresa === 'TUID';
            if (!verTelefono) {
                try {
                    const [e] = await db.sync_query('SELECT emails, telefonos FROM empresa WHERE id = ?', [v.filtros.empresa]);
                    verTelefono = !!(e && Number(e.telefonos) === 1);
                    verEmail = !!(e && Number(e.emails) === 1);
                } catch (e) { /* sin permiso de datos de contacto */ }
            }
            const lista = noAlcanzados.slice(0, MAX_DESTINATARIOS).map((n) => ({
                cuil: n.persona.cuil == null ? '' : String(n.persona.cuil),
                nombre: textos.capitalizar(n.persona.nombre), apellido: textos.capitalizar(n.persona.apellido),
                motivo: n.motivo,
                telefono: verTelefono ? (n.persona.telefono || '') : null,
                email: verEmail ? (n.persona.email || '') : null
            }));

            const detalle = JSON.stringify({ motivos, tokensEliminados: invalidos, sinApp: sinApp.length }).slice(0, 400);
            const fila = [req.user.email || null, v.filtros.empresa, v.filtros.modo, resumenFiltros(v.filtros).slice(0, 200), clave, titulo.slice(0, 200), conDispositivo.length, enviados, fallidos];
            try {
                await db.sync_query(
                    'INSERT INTO notificaciones_envios (fecha, usuario, empresa, modo, filtros, clave_texto, titulo, destinatarios, enviados, fallidos, detalle, invalidos) VALUES (NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    fila.concat([detalle, invalidos]));
            } catch (e) {
                // La base todavia no tiene las columnas detalle / invalidos (scripts/sql/notificaciones_detalle.sql): se registra el envio como antes
                await db.sync_query(
                    'INSERT INTO notificaciones_envios (fecha, usuario, empresa, modo, filtros, clave_texto, titulo, destinatarios, enviados, fallidos) VALUES (NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?)', fila);
            }
            return responder(res, 0, {
                enviados, fallidos, sinDispositivo: sinApp.length,
                motivos: Object.keys(motivos).map((m) => ({ motivo: m, cantidad: motivos[m] })).sort((a, b) => b.cantidad - a.cantidad),
                tokensEliminados: invalidos, noAlcanzados: lista
            });
        } catch (err) {
            console.log(err);
            return responder(res, 1, err && err.publico ? err.message : 'No se pudieron enviar las notificaciones');
        }
    }

    // GET /auth/notificaciones/historial -> ultimos envios (de la empresa del usuario; TUID ve todas)
    async function historial(req, res) {
        try {
            const filas = req.user.empresa === 'TUID'
                ? await db.sync_query('SELECT * FROM notificaciones_envios ORDER BY id DESC LIMIT 50')
                : await db.sync_query('SELECT * FROM notificaciones_envios WHERE empresa = ? ORDER BY id DESC LIMIT 50', [req.user.empresa]);
            return responder(res, 0, filas);
        } catch (err) {
            console.log(err);
            return responder(res, 1, 'No se pudo leer el historial');
        }
    }

    return { mensajes, destinatarios, enviar, historial };
};
module.exports.validarFiltros = validarFiltros;
module.exports.tokenProbablementeVencido = tokenProbablementeVencido; // para pruebas
module.exports.textoMotivo = textoMotivo;
module.exports.DIAS_TOKEN_VENCIDO = DIAS_TOKEN_VENCIDO;
