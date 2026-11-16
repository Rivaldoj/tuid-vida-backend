// Pantalla "Carga de fallecidos" del panel (solo Administrador de TUID, permiso CARGAFALLECIDOS).
//   POST /auth/fallecidos/carga/analizar   (archivo DBF) -> vista previa de lo que cambiaria; NO escribe nada
//   POST /auth/fallecidos/carga/aplicar    { cargaId, altas } -> corre en segundo plano (devuelve el numero de trabajo)
//   GET  /auth/fallecidos/carga/estado/:id -> progreso y resultado del trabajo
//   GET  /auth/fallecidos/carga/lotes      -> cargas anteriores
//   POST /auth/fallecidos/carga/revertir   { lote } -> deshace una carga (tambien en segundo plano)
// El trabajo real lo hace el motor (cargaFallecidos.js), el mismo que usa la herramienta de comandos. El archivo mensual es chico (decenas de miles de
// filas); el archivo completo del padron (millones) se carga con las herramientas de base de datos, no desde aca.
const fs = require('fs');
const crypto = require('crypto');
const { validarRegistros } = require('../../../utils/fallecidosCarga');
const { hoyArgentina } = require('../../../utils/periodoInforme');
const motorMod = require('./cargaFallecidos');

const MAX_BYTES = 25 * 1024 * 1024;
const MAX_FILAS = 300000;
const VIDA_CARGA_MS = 30 * 60 * 1000;       // una vista previa vale 30 minutos
const VIDA_TRABAJO_MS = 6 * 60 * 60 * 1000;  // el resultado de un trabajo se conserva 6 horas
const TOPE_DETALLE = 5000;

// deps: { padron: { sync_query }, vida: { sync_query }, leerDbf(ruta, maxFilas) -> { filas, campos } }
module.exports.crear = function (deps) {
    const motor = motorMod.crear({ padron: deps.padron, vida: deps.vida });
    const cargas = new Map();     // cargaId -> vista previa analizada, lista para aplicar
    const trabajos = new Map();   // trabajoId -> estado
    let ocupado = false;          // una sola escritura a la vez

    const responder = (res, error, data) => res.status(200).json({ error, data });
    const limpiarArchivo = (req) => { if (req.file && req.file.path) fs.unlink(req.file.path, () => {}); };
    const aleatorio = () => crypto.randomBytes(12).toString('hex');

    const barrido = setInterval(() => {
        const ahora = Date.now();
        cargas.forEach((c, id) => { if (ahora - c.creada > VIDA_CARGA_MS) cargas.delete(id); });
        trabajos.forEach((t, id) => { if (t.estado !== 'en_curso' && ahora - t.creada > VIDA_TRABAJO_MS) trabajos.delete(id); });
    }, 5 * 60 * 1000);
    if (barrido.unref) barrido.unref();

    // Nombre del lote: fecha + nombre del archivo, sin repetirse
    async function nombreLote(archivo) {
        const base = String(archivo || 'carga').replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 24) || 'carga';
        const raiz = (hoyArgentina() + '_' + base).slice(0, 36);
        let lote = raiz;
        for (let i = 2; await motor.loteExiste(lote); i++) lote = raiz + '_' + i;
        return lote;
    }

    function resumenDe(analisis, v, archivo, leidos) {
        return {
            archivo: { nombre: archivo, leidos, validos: v.validos.length, descartados: v.invalidos.length, repetidos: v.duplicados },
            master: analisis.master,
            usuario_empresa: analisis.usuario_empresa,
            usuario: analisis.usuario,
            altas: analisis.trabajo.altas.length,
            altasDniRepetido: analisis.altasDniRepetido.length
        };
    }

    // ---- POST analizar (multipart: file) ----
    async function analizar(req, res) {
        try {
            const f = req.file;
            if (!f) return responder(res, 1, 'Elija el archivo DBF del padrón de fallecidos.');
            if (!/\.dbf$/i.test(f.originalname || '')) { limpiarArchivo(req); return responder(res, 1, 'El archivo debe ser un DBF (por ejemplo pdfallem.dbf).'); }
            if (f.size > MAX_BYTES) {
                limpiarArchivo(req);
                return responder(res, 1, 'El archivo es demasiado grande para subirlo desde el panel (máximo 25 MB). La base completa del padrón se carga con la herramienta de base de datos.');
            }
            let leido;
            try {
                leido = await deps.leerDbf(f.path, MAX_FILAS);
            } catch (e) {
                limpiarArchivo(req);
                return responder(res, 1, e && e.codigo === 'DEMASIADAS_FILAS' ? e.message : 'No se pudo leer el archivo: no parece un DBF válido.');
            }
            limpiarArchivo(req);
            const faltan = ['CUIL', 'FALLECIDO', 'FECHAFALLE'].filter((c) => !leido.campos.includes(c));
            if (faltan.length) return responder(res, 1, 'El archivo no tiene los campos esperados (falta: ' + faltan.join(', ') + '). Es el mensual, por ejemplo pdfallem.dbf.');
            const v = validarRegistros(leido.filas);
            if (v.validos.length === 0) return responder(res, 1, 'El archivo no tiene registros válidos para cargar.');
            const analisis = await motor.analizar(v.validos);
            const id = aleatorio();
            const informe = {
                descartados: v.invalidos.slice(0, TOPE_DETALLE),
                conflictos: analisis.conflictos.slice(0, TOPE_DETALLE),
                altas: analisis.trabajo.altas.slice(0, TOPE_DETALLE).map((a) => ({ cuil: a.cuil, dniRepetido: analisis.altasDniRepetido.includes(a.cuil) }))
            };
            cargas.set(id, { creada: Date.now(), usuario: req.user && req.user.email, archivo: f.originalname, analisis, validos: v, leidos: leido.filas.length });
            return responder(res, 0, Object.assign({ cargaId: id, informe }, resumenDe(analisis, v, f.originalname, leido.filas.length)));
        } catch (err) {
            console.log('[carga fallecidos] analizar:', err);
            limpiarArchivo(req);
            return responder(res, 1, 'No se pudo analizar el archivo.');
        }
    }

    // Corre un trabajo largo sin hacer esperar al pedido web
    function lanzar(tipo, lote, tarea) {
        const id = aleatorio();
        const t = { id, tipo, lote, estado: 'en_curso', progreso: '', resultado: null, error: null, creada: Date.now() };
        trabajos.set(id, t);
        ocupado = true;
        Promise.resolve().then(tarea.bind(null, t)).then((r) => { t.estado = 'listo'; t.resultado = r; }, (e) => {
            console.log('[carga fallecidos] ' + tipo + ' ' + lote + ':', e);
            t.estado = 'error';
            t.error = 'Falló durante la carga. Lo ya escrito queda registrado y se puede revertir desde "Cargas anteriores".';
        }).then(() => { ocupado = false; });
        return t;
    }

    // ---- POST aplicar { cargaId, altas } ----
    async function aplicar(req, res) {
        try {
            if (ocupado) return responder(res, 1, 'Hay otra carga en curso. Espere a que termine.');
            const c = cargas.get(String((req.body && req.body.cargaId) || ''));
            if (!c) return responder(res, 1, 'La vista previa venció o ya se aplicó. Vuelva a subir el archivo.');
            if (c.usuario && req.user && c.usuario !== req.user.email) return responder(res, 1, 'Esa vista previa la hizo otra persona.');
            const conAltas = !!(req.body && req.body.altas);
            const lote = await nombreLote(c.archivo);
            cargas.delete(String(req.body.cargaId));   // una vista previa se aplica una sola vez
            const resumen = resumenDe(c.analisis, c.validos, c.archivo, c.leidos);
            const t = lanzar('aplicar', lote, async (job) => {
                const r = await motor.aplicar(c.analisis, lote, undefined, (p) => { job.progreso = p; }, { altas: conAltas });
                await motor.registrarLote({
                    lote, usuario: c.usuario, archivo: c.archivo,
                    resumen: `master ${r.master}, usuario_empresa ${r.usuario_empresa}, usuario ${r.usuario}` + (conAltas ? `, altas ${r.altas}` : '') + ` (${resumen.archivo.validos} registros)`
                });
                return r;
            });
            return responder(res, 0, { trabajoId: t.id, lote });
        } catch (err) {
            console.log('[carga fallecidos] aplicar:', err);
            return responder(res, 1, 'No se pudo iniciar la carga.');
        }
    }

    // ---- GET estado/:id ----
    async function estado(req, res) {
        const t = trabajos.get(String(req.params.id || ''));
        if (!t) return responder(res, 1, 'No se encontró el trabajo (puede haber vencido).');
        return responder(res, 0, { tipo: t.tipo, lote: t.lote, estado: t.estado, progreso: t.progreso, resultado: t.resultado, error: t.error });
    }

    // ---- GET lotes ----
    async function lotes(req, res) {
        try {
            return responder(res, 0, await motor.listarLotes());
        } catch (err) {
            console.log('[carga fallecidos] lotes:', err);
            return responder(res, 1, 'No se pudieron leer las cargas anteriores.');
        }
    }

    // ---- POST revertir { lote } ----
    async function revertir(req, res) {
        try {
            if (ocupado) return responder(res, 1, 'Hay otra carga en curso. Espere a que termine.');
            const lote = String((req.body && req.body.lote) || '').trim();
            if (!/^[A-Za-z0-9_-]{1,40}$/.test(lote)) return responder(res, 1, 'Lote inválido.');
            const existe = (await motor.listarLotes()).find((l) => l.lote === lote);
            if (!existe) return responder(res, 1, 'No se encontró esa carga.');
            if (existe.revertido) return responder(res, 1, 'Esa carga ya fue revertida.');
            const t = lanzar('revertir', lote, async () => {
                const r = await motor.revertir(lote);
                await motor.marcarRevertido(lote);
                return r;
            });
            return responder(res, 0, { trabajoId: t.id, lote });
        } catch (err) {
            console.log('[carga fallecidos] revertir:', err);
            return responder(res, 1, 'No se pudo iniciar la reversión.');
        }
    }

    return { analizar, aplicar, estado, lotes, revertir, _cargas: cargas, _trabajos: trabajos };
};
