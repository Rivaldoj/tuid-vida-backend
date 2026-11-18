// Correo masivo desde el panel (como las notificaciones push, pero por mail): se elige empresa y a quien, se ve cuantas personas lo recibirian
// ("destinatarios") y recien despues se envia, en segundo plano y con ritmo controlado. Todo queda en el historial.
//
// Segmentos:
//   pendientes -> registrados de la empresa que todavia NO certificaron en el periodo vigente (empresa.Fecha_actual .. Fecha_fin)
//   nousan     -> registrados que nunca certificaron con esa empresa (o, con "dias", que llevan mas de N dias sin certificar)
//   cuil       -> una sola persona (pruebas)
// Solo se escribe a quien tiene un correo valido, no esta de baja (correos_bajas) ni fallecido; cada correo sale una sola vez por direccion.
const textos = require('../../../utils/textos');
const pieCorreo = require('../../../utils/pieCorreo');
const { soloFecha } = require('../../../utils/periodoInforme');

const MAX_DESTINATARIOS = 20000;   // SES permite 50.000 por dia
const POR_SEGUNDO = 10;            // SES permite 14 por segundo
const SEGMENTOS = ['pendientes', 'nousan', 'cuil'];
const PREFIJO_COMUNICACION = 'COM_';   // solo los textos de correo cuya clave empieza asi se ofrecen como comunicacion (los demas son correos del sistema)
const MINUTOS_SIN_NOVEDAD = 15;

const SQL_ENVIOS = `CREATE TABLE IF NOT EXISTS correos_envios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fecha DATETIME NOT NULL,
  usuario VARCHAR(100) NULL,
  empresa VARCHAR(50) NULL,
  segmento VARCHAR(12) NOT NULL,
  filtros VARCHAR(250) NULL,
  clave_texto VARCHAR(60) NULL,
  asunto VARCHAR(200) NULL,
  destinatarios INT NOT NULL DEFAULT 0,
  enviados INT NOT NULL DEFAULT 0,
  fallidos INT NOT NULL DEFAULT 0,
  estado VARCHAR(15) NOT NULL DEFAULT 'enviando',
  actualizado DATETIME NULL,
  terminado_en DATETIME NULL,
  detalle MEDIUMTEXT NULL,
  KEY (empresa), KEY (fecha)
)`;
const SQL_BAJAS = `CREATE TABLE IF NOT EXISTS correos_bajas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cuil VARCHAR(15) NULL,
  email VARCHAR(100) NULL,
  fecha DATETIME NOT NULL,
  usuario VARCHAR(100) NULL,
  motivo VARCHAR(200) NULL,
  KEY (cuil), KEY (email)
)`;

// Valida el pedido. Devuelve { error } o { filtros }
function validarFiltros(body, usuarioLogueado) {
    const b = body || {};
    const empresa = usuarioLogueado.empresa === 'TUID' ? String(b.empresa || '').trim() : usuarioLogueado.empresa;
    if (!empresa) return { error: 'Elija la empresa.' };
    const segmento = String(b.segmento || '');
    if (!SEGMENTOS.includes(segmento)) return { error: 'Elija a quién enviar.' };
    const f = { empresa, segmento };
    if (segmento === 'cuil') {
        f.cuil = String(b.cuil || '').replace(/\D/g, '');
        if (f.cuil.length !== 11) return { error: 'Ingrese el CUIL completo (11 dígitos).' };
    } else if (segmento === 'nousan' && b.dias != null && String(b.dias).trim() !== '') {
        f.dias = Number(b.dias);
        if (!Number.isInteger(f.dias) || f.dias < 1 || f.dias > 3650) return { error: 'Ingrese la cantidad de días (1 a 3650) o déjela vacía.' };
    }
    return { filtros: f };
}

function resumenFiltros(f) {
    if (f.segmento === 'cuil') return 'cuil ' + f.cuil;
    if (f.segmento === 'pendientes') return 'certificaciones pendientes del período';
    return f.dias ? 'registrados sin certificar hace más de ' + f.dias + ' días' : 'registrados que nunca certificaron';
}

// Motivo legible de un correo que no salio (errores de SES)
function textoMotivo(err) {
    const c = String((err && (err.code || err.name)) || '');
    const m = String((err && err.message) || '');
    if (/MessageRejected/i.test(c)) return /not verified|sandbox/i.test(m) ? 'Dirección no habilitada (cuenta de envío en prueba)' : 'Rechazado por el servicio de correo';
    if (/Throttl|Limit|Quota/i.test(c) || /Maximum sending rate|Daily message quota/i.test(m)) return 'Límite de envíos del servicio de correo';
    if (/InvalidParameter|Invalid.*address|Illegal address/i.test(c + ' ' + m)) return 'Dirección de correo inválida';
    if (/ETIMEDOUT|ECONNRESET|ENOTFOUND|Timeout|NetworkingError/i.test(c + ' ' + m)) return 'Falla de red al enviar';
    return 'No se pudo enviar';
}

// Separa a las personas encontradas en: a quienes se les escribe, sin correo valido, de baja y repetidas (misma direccion)
function clasificar(filas, bajas) {
    const bajaCuil = new Set((bajas || []).filter((b) => b.cuil).map((b) => String(b.cuil)));
    const bajaMail = new Set((bajas || []).filter((b) => b.email).map((b) => String(b.email).trim().toLowerCase()));
    const vistos = new Set();
    const out = { enviar: [], sinCorreo: [], enBaja: [], repetidos: 0 };
    for (const p of filas) {
        const mail = String(p.email || '').trim();
        if (!textos.emailValido(mail)) { out.sinCorreo.push(p); continue; }
        if (bajaCuil.has(String(p.cuil)) || bajaMail.has(mail.toLowerCase())) { out.enBaja.push(p); continue; }
        if (vistos.has(mail.toLowerCase())) { out.repetidos++; continue; }
        vistos.add(mail.toLowerCase());
        out.enviar.push(Object.assign({}, p, { email: mail }));
    }
    return out;
}

function datosPersona(p, empresaRow) {
    const nombre = textos.capitalizar(p.nombre);
    const apellido = textos.capitalizar(p.apellido);
    const fin = empresaRow && empresaRow.Fecha_fin ? soloFecha(empresaRow.Fecha_fin) : null;
    return {
        nombre, apellido, nombre_completo: `${nombre} ${apellido}`.trim(), cuil: textos.formatoCuil(p.cuil),
        empresa: (empresaRow && (empresaRow.nombre || empresaRow.id)) || p.empresa || '', fecha: textos.formatoFecha(new Date()), auditor: '', enlace_foto: '',
        fecha_vencimiento: fin ? fin.split('-').reverse().join('/') : ''
    };
}

// deps: { db: { sync_query }, enviar(html, asunto, para) -> Promise, soporte() -> correo de soporte }
module.exports.crear = function (deps) {
    const db = deps.db;
    const responder = (res, error, data) => res.status(200).json({ error, data });
    let actual = null;     // envio en curso { id }
    let tablas = false;

    async function asegurarTablas() {
        if (tablas) return;
        await db.sync_query(SQL_ENVIOS);
        await db.sync_query(SQL_BAJAS);
        tablas = true;
    }

    async function empresaDe(id) {
        const [e] = await db.sync_query('SELECT id, nombre, Fecha_actual, Fecha_fin, emails FROM empresa WHERE id = ?', [id]);
        return e || null;
    }

    // El Administrador de una empresa cliente solo puede usarlo si la empresa tiene habilitado el uso de correos
    function permitido(req, e) {
        if (req.user.empresa === 'TUID') return null;
        if (!e || Number(e.emails) !== 1) return 'Su empresa no tiene habilitado el envío de correos. Consulte con TuID.';
        return null;
    }

    async function buscar(f, e) {
        const params = [f.empresa];
        let donde = '';
        if (f.segmento === 'cuil') {
            donde = 'AND t.cuil = ?';
            params.push(f.cuil);
        } else if (f.segmento === 'pendientes') {
            const inicio = soloFecha(e && e.Fecha_actual);
            if (!inicio) return { error: 'La empresa todavía no tiene un período cargado (fecha de inicio).' };
            const fin = soloFecha(e.Fecha_fin) || '2999-12-31';
            donde = 'AND t.hechas = 0';
            params.unshift(inicio, fin);
        } else if (f.dias) {
            donde = 'AND (t.ultima IS NULL OR t.ultima < DATE_SUB(CURDATE(), INTERVAL ? DAY))';
            params.push(f.dias);
        } else {
            donde = 'AND t.ultima IS NULL';
        }
        // "hechas": certificaciones dentro del periodo (solo se usa en "pendientes"; los otros segmentos pasan sin esos parametros)
        const hechas = f.segmento === 'pendientes'
            ? '(SELECT COUNT(*) FROM auditoria a WHERE a.id_usuario = u.id_usuario AND a.empresa = ue.empresa AND a.fecha >= ? AND a.fecha < DATE_ADD(?, INTERVAL 1 DAY))'
            : '0';
        const filas = await db.sync_query(
            `SELECT t.* FROM (
                SELECT u.id_usuario, u.nombre, u.apellido, u.cuil, u.email, u.emailVrf, ue.empresa,
                       (SELECT MAX(a.fecha) FROM auditoria a WHERE a.id_usuario = u.id_usuario AND a.empresa = ue.empresa) AS ultima,
                       ${hechas} AS hechas
                FROM usuario u JOIN usuario_empresa ue ON ue.cuil = u.cuil
                WHERE ue.empresa = ? AND u.fecha_fallecido IS NULL AND (ue.Posible_fallecido IS NULL OR ue.Posible_fallecido <> 1)
             ) t WHERE 1 = 1 ${donde} ORDER BY t.apellido, t.nombre LIMIT ${MAX_DESTINATARIOS + 1}`, params);
        let bajas = [];
        try { bajas = await db.sync_query('SELECT cuil, email FROM correos_bajas'); } catch (err) { /* sin tabla todavia: nadie esta de baja */ }
        return { filas, bajas };
    }

    async function ultimoEnvioParecido(f) {
        const [r] = await db.sync_query("SELECT id, fecha, usuario FROM correos_envios WHERE empresa = ? AND segmento = ? AND estado <> 'error' AND fecha > DATE_SUB(NOW(), INTERVAL 24 HOUR) ORDER BY id DESC LIMIT 1", [f.empresa, f.segmento]);
        return r || null;
    }

    // Textos de correo (formato html o texto) que se pueden usar como comunicacion
    async function mensajes(req, res) {
        try {
            const filas = await db.sync_query("SELECT clave, nombre, asunto, cuerpo, formato FROM textos WHERE canal = 'email' AND activo = 1 AND clave LIKE 'COM\\_%' ORDER BY nombre");
            return responder(res, 0, filas);
        } catch (err) {
            console.log(err);
            return responder(res, 1, 'No se pudieron leer los mensajes');
        }
    }

    // POST /auth/correos/destinatarios -> a cuantas personas les llegaria (no envia nada)
    async function destinatarios(req, res) {
        try {
            await asegurarTablas();
            const v = validarFiltros(req.body, req.user);
            if (v.error) return responder(res, 1, v.error);
            const e = await empresaDe(v.filtros.empresa);
            if (!e) return responder(res, 1, 'No se encontró la empresa.');
            const p = permitido(req, e);
            if (p) return responder(res, 1, p);
            const b = await buscar(v.filtros, e);
            if (b.error) return responder(res, 1, b.error);
            const c = clasificar(b.filas, b.bajas);
            const reciente = await ultimoEnvioParecido(v.filtros);
            return responder(res, 0, {
                encontrados: Math.min(b.filas.length, MAX_DESTINATARIOS), total: c.enviar.length, sinCorreo: c.sinCorreo.length, enBaja: c.enBaja.length, repetidos: c.repetidos,
                excedeLimite: b.filas.length > MAX_DESTINATARIOS, limite: MAX_DESTINATARIOS,
                periodo: v.filtros.segmento === 'pendientes' ? { desde: soloFecha(e.Fecha_actual), hasta: soloFecha(e.Fecha_fin) } : null,
                ejemplo: c.enviar.slice(0, 5).map((x) => `${textos.capitalizar(x.nombre)} ${textos.capitalizar(x.apellido)} · ${x.email}`),
                envioReciente: reciente ? { fecha: reciente.fecha, usuario: reciente.usuario } : null
            });
        } catch (err) {
            console.log(err);
            return responder(res, 1, 'No se pudieron buscar los destinatarios');
        }
    }

    // Asunto y cuerpo (ya con el formato elegido) a partir de un texto prearmado o de uno libre
    async function leerMensaje(body) {
        if (body.clave) {
            const clave = String(body.clave).trim().toUpperCase();
            if (!clave.startsWith(PREFIJO_COMUNICACION)) return { error: 'Ese texto no es una comunicación (su clave debe empezar con ' + PREFIJO_COMUNICACION + ').' };
            const [t] = await db.sync_query("SELECT asunto, cuerpo, formato FROM textos WHERE clave = ? AND canal = 'email' AND activo = 1", [clave]);
            if (!t) return { error: 'No se encontró ese mensaje o está desactivado.' };
            return { clave, asunto: t.asunto || 'TuID Vida', cuerpo: t.cuerpo, html: t.formato === 'html' };
        }
        const asunto = String(body.asunto || '').trim();
        const cuerpo = String(body.mensaje || '').trim();
        if (!asunto || !cuerpo) return { error: 'Escriba el asunto y el mensaje, o elija un mensaje prearmado.' };
        if (asunto.length > 150 || cuerpo.length > 5000) return { error: 'El asunto admite 150 caracteres y el mensaje 5000.' };
        return { clave: null, asunto, cuerpo, html: false };
    }

    function armarHtml(m, datos, pie) {
        const contenido = m.html ? textos.renderHtml(m.cuerpo, datos).html : textos.aParrafosHtml(textos.render(m.cuerpo, datos).texto);
        const soporte = deps.soporte ? deps.soporte() : '';
        const baja = '<p style="margin:16px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#666666;">Si no desea recibir estas comunicaciones, escríbanos' +
            (soporte ? ' a <a href="mailto:' + soporte + '" style="color:#666666;">' + soporte + '</a>' : '') + ' y lo excluiremos de los próximos envíos.</p>';
        return '<div style="max-width:640px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:#363636;">' + contenido + pie + baja + '</div>';
    }

    // POST /auth/correos/prueba -> un correo de muestra a quien esta logueado, con datos de ejemplo
    async function prueba(req, res) {
        try {
            const para = String((req.user && req.user.email) || '').trim();
            if (!textos.emailValido(para)) return responder(res, 1, 'Su usuario no tiene un correo válido para recibir la prueba.');
            const m = await leerMensaje(req.body || {});
            if (m.error) return responder(res, 1, m.error);
            const datos = Object.assign({}, textos.EJEMPLO);
            const pie = await pieCorreo.obtener(db, datos);
            await deps.enviar(armarHtml(m, datos, pie), '[PRUEBA] ' + textos.render(m.asunto, datos).texto, para);
            return responder(res, 0, 'Se envió una prueba a ' + para);
        } catch (err) {
            console.log(err);
            return responder(res, 1, 'No se pudo enviar la prueba: ' + textoMotivo(err));
        }
    }

    async function trabajo(id, lista, m, e, pie) {
        let enviados = 0, fallidos = 0;
        const motivos = {};
        const fallidosLista = [];
        const guardar = async (estado) => {
            const detalle = JSON.stringify({ motivos, fallidos: fallidosLista.slice(0, 5000) });
            await db.sync_query('UPDATE correos_envios SET enviados = ?, fallidos = ?, estado = ?, actualizado = NOW(), terminado_en = ?, detalle = ? WHERE id = ?',
                [enviados, fallidos, estado, estado === 'enviando' ? null : new Date(), detalle, id]);
        };
        try {
            for (let i = 0; i < lista.length; i += POR_SEGUNDO) {
                const t0 = Date.now();
                const lote = lista.slice(i, i + POR_SEGUNDO);
                await Promise.all(lote.map(async (p) => {
                    const datos = datosPersona(p, e);
                    try {
                        await deps.enviar(armarHtml(m, datos, pie), textos.render(m.asunto, datos).texto, p.email);
                        enviados++;
                    } catch (err) {
                        fallidos++;
                        const motivo = textoMotivo(err);
                        motivos[motivo] = (motivos[motivo] || 0) + 1;
                        fallidosLista.push({ cuil: String(p.cuil || ''), nombre: textos.capitalizar(p.nombre), apellido: textos.capitalizar(p.apellido), email: p.email, motivo });
                    }
                }));
                if ((i / POR_SEGUNDO) % 5 === 4) await guardar('enviando');
                const espera = 1000 - (Date.now() - t0);
                if (espera > 0 && i + POR_SEGUNDO < lista.length) await new Promise((r) => setTimeout(r, espera));
            }
            await guardar('terminado');
        } catch (err) {
            console.log('[correos] el envio', id, 'se interrumpio:', err && err.message);
            try { await guardar('error'); } catch (e2) { /* sin base */ }
        } finally {
            actual = null;
        }
    }

    // POST /auth/correos/enviar { empresa, segmento, ..., clave | (asunto, mensaje) } -> arranca el envio en segundo plano
    async function enviar(req, res) {
        try {
            await asegurarTablas();
            if (actual) return responder(res, 1, 'Ya hay un envío en curso. Espere a que termine.');
            const v = validarFiltros(req.body, req.user);
            if (v.error) return responder(res, 1, v.error);
            const e = await empresaDe(v.filtros.empresa);
            if (!e) return responder(res, 1, 'No se encontró la empresa.');
            const p = permitido(req, e);
            if (p) return responder(res, 1, p);
            const m = await leerMensaje(req.body);
            if (m.error) return responder(res, 1, m.error);
            const b = await buscar(v.filtros, e);
            if (b.error) return responder(res, 1, b.error);
            if (b.filas.length > MAX_DESTINATARIOS) return responder(res, 1, `Son más de ${MAX_DESTINATARIOS} personas: acote el envío.`);
            const c = clasificar(b.filas, b.bajas);
            if (c.enviar.length === 0) return responder(res, 1, 'No hay personas con correo para ese filtro.');
            const pie = await pieCorreo.obtener(db, {});
            const r = await db.sync_query(
                "INSERT INTO correos_envios (fecha, usuario, empresa, segmento, filtros, clave_texto, asunto, destinatarios, estado, actualizado) VALUES (NOW(), ?, ?, ?, ?, ?, ?, ?, 'enviando', NOW())",
                [req.user.email || null, v.filtros.empresa, v.filtros.segmento, resumenFiltros(v.filtros).slice(0, 250), m.clave, String(m.asunto).slice(0, 200), c.enviar.length]);
            actual = { id: r.insertId };
            trabajo(r.insertId, c.enviar, m, e, pie);   // sin await: sigue en segundo plano
            return responder(res, 0, { id: r.insertId, total: c.enviar.length, sinCorreo: c.sinCorreo.length, enBaja: c.enBaja.length });
        } catch (err) {
            console.log(err);
            actual = null;
            return responder(res, 1, 'No se pudo iniciar el envío');
        }
    }

    // Un envio "enviando" sin novedades hace rato (el servidor se reinicio) se muestra como interrumpido
    function conEstado(f) {
        if (f.estado === 'enviando' && !(actual && actual.id === f.id)) {
            const t = f.actualizado ? new Date(f.actualizado).getTime() : 0;
            if (Date.now() - t > MINUTOS_SIN_NOVEDAD * 60 * 1000) return Object.assign({}, f, { estado: 'interrumpido' });
        }
        return f;
    }

    // GET /auth/correos/envio/:id -> progreso y detalle (motivos y lista de personas a las que no les llego)
    async function envio(req, res) {
        try {
            await asegurarTablas();
            const [f] = await db.sync_query('SELECT * FROM correos_envios WHERE id = ?', [parseInt(req.params.id, 10) || 0]);
            if (!f || (req.user.empresa !== 'TUID' && f.empresa !== req.user.empresa)) return responder(res, 1, 'No se encontró el envío.');
            let d = {};
            try { d = JSON.parse(f.detalle || '{}'); } catch (e) { /* detalle ilegible */ }
            const out = conEstado(f);
            delete out.detalle;
            return responder(res, 0, Object.assign({}, out, {
                motivos: Object.keys(d.motivos || {}).map((k) => ({ motivo: k, cantidad: d.motivos[k] })).sort((a, b) => b.cantidad - a.cantidad),
                noAlcanzados: d.fallidos || []
            }));
        } catch (err) {
            console.log(err);
            return responder(res, 1, 'No se pudo leer el envío');
        }
    }

    // GET /auth/correos/historial -> ultimos envios (de la empresa del usuario; TUID ve todas)
    async function historial(req, res) {
        try {
            await asegurarTablas();
            const cols = 'id, fecha, usuario, empresa, segmento, filtros, clave_texto, asunto, destinatarios, enviados, fallidos, estado, actualizado, terminado_en';
            const filas = req.user.empresa === 'TUID'
                ? await db.sync_query(`SELECT ${cols} FROM correos_envios ORDER BY id DESC LIMIT 50`)
                : await db.sync_query(`SELECT ${cols} FROM correos_envios WHERE empresa = ? ORDER BY id DESC LIMIT 50`, [req.user.empresa]);
            return responder(res, 0, filas.map(conEstado));
        } catch (err) {
            console.log(err);
            return responder(res, 1, 'No se pudo leer el historial');
        }
    }

    // Bajas (solo TUID): quien pide no recibir mas comunicaciones queda excluido de los envios
    async function bajas(req, res) {
        try {
            await asegurarTablas();
            if (req.user.empresa !== 'TUID') return responder(res, 1, 'Solo TuID administra las bajas.');
            return responder(res, 0, await db.sync_query('SELECT id, cuil, email, fecha, usuario, motivo FROM correos_bajas ORDER BY id DESC LIMIT 500'));
        } catch (err) {
            console.log(err);
            return responder(res, 1, 'No se pudieron leer las bajas');
        }
    }

    async function agregarBaja(req, res) {
        try {
            await asegurarTablas();
            if (req.user.empresa !== 'TUID') return responder(res, 1, 'Solo TuID administra las bajas.');
            const cuil = String((req.body && req.body.cuil) || '').replace(/\D/g, '');
            const email = String((req.body && req.body.email) || '').trim().toLowerCase();
            if (!cuil && !email) return responder(res, 1, 'Ingrese el CUIL o el correo.');
            if (cuil && cuil.length !== 11) return responder(res, 1, 'El CUIL debe tener 11 dígitos.');
            if (email && !textos.emailValido(email)) return responder(res, 1, 'El correo no es válido.');
            const motivo = String((req.body && req.body.motivo) || '').trim().slice(0, 200) || null;
            await db.sync_query('INSERT INTO correos_bajas (cuil, email, fecha, usuario, motivo) VALUES (?, ?, NOW(), ?, ?)', [cuil || null, email || null, req.user.email || null, motivo]);
            return responder(res, 0, 'Baja registrada');
        } catch (err) {
            console.log(err);
            return responder(res, 1, 'No se pudo registrar la baja');
        }
    }

    async function quitarBaja(req, res) {
        try {
            await asegurarTablas();
            if (req.user.empresa !== 'TUID') return responder(res, 1, 'Solo TuID administra las bajas.');
            await db.sync_query('DELETE FROM correos_bajas WHERE id = ?', [parseInt(req.params.id, 10) || 0]);
            return responder(res, 0, 'Baja quitada');
        } catch (err) {
            console.log(err);
            return responder(res, 1, 'No se pudo quitar la baja');
        }
    }

    return { mensajes, destinatarios, prueba, enviar, envio, historial, bajas, agregarBaja, quitarBaja, asegurarTablas };
};
module.exports.validarFiltros = validarFiltros;
module.exports.clasificar = clasificar;
module.exports.textoMotivo = textoMotivo;
module.exports.PREFIJO_COMUNICACION = PREFIJO_COMUNICACION;
