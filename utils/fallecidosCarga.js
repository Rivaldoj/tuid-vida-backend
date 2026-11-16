// Carga de fallecidos (padron mensual): validacion de los registros del archivo y decision por destino. Funciones puras (sin base de datos).
//
// Archivo (DBF): CUIL, APENOM, FALLECIDO, FECHAFALLE, FECHAACTU, IDLOTE, OB.
// Destinos:
//   padron.master              -> Fallecido = 1, FechaFalle
//   tuid_vida.usuario_empresa  -> Posible_fallecido = 1, Fecha_fallecido
//   tuid_vida.usuario          -> fecha_fallecido (y notificaciones = 0, igual que el boton de fallecido del panel)
// Regla comun: NUNCA se pisa una fecha de fallecimiento que ya existe; si la fecha del archivo es distinta, se informa como conflicto.

const cuilUtil = require('./cuil');

const FECHA_MINIMA = '1900-01-01';

// Date (el DBF entrega medianoche UTC), texto "AAAA-MM-DD..." o vacio -> "AAAA-MM-DD" o null
function aFecha(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
    return m ? m[1] + '-' + m[2] + '-' + m[3] : null;
}

// registros: [{ CUIL, FALLECIDO, FECHAFALLE, APENOM, IDLOTE, ... }]. Devuelve { validos: [{ cuil, fecha, apenom, idlote }], invalidos: [{ cuil, motivo }], duplicados }
// Un registro es valido si el CUIL esta bien formado, FALLECIDO = 1 y la fecha (si viene) es real, posterior a 1900 y no futura.
function validarRegistros(registros, hoy) {
    const tope = hoy || new Date().toISOString().slice(0, 10);
    const vistos = new Map();
    const validos = [];
    const invalidos = [];
    let duplicados = 0;
    for (const r of registros || []) {
        const cuil = cuilUtil.normalize(r.CUIL);
        if (!cuilUtil.isValid(cuil)) { invalidos.push({ cuil: String(r.CUIL), motivo: 'CUIL inválido' }); continue; }
        if (Number(r.FALLECIDO) !== 1) { invalidos.push({ cuil, motivo: 'FALLECIDO distinto de 1' }); continue; }
        const fecha = aFecha(r.FECHAFALLE);
        if (r.FECHAFALLE != null && r.FECHAFALLE !== '' && !fecha) { invalidos.push({ cuil, motivo: 'Fecha de fallecimiento ilegible' }); continue; }
        if (fecha && fecha < FECHA_MINIMA) { invalidos.push({ cuil, motivo: 'Fecha de fallecimiento anterior a 1900' }); continue; }
        if (fecha && fecha > tope) { invalidos.push({ cuil, motivo: 'Fecha de fallecimiento futura' }); continue; }
        if (vistos.has(cuil)) {
            duplicados++;
            // si el repetido trae fecha y el anterior no, se conserva la fecha
            const previo = vistos.get(cuil);
            if (!previo.fecha && fecha) previo.fecha = fecha;
            continue;
        }
        const v = { cuil, fecha, apenom: String(r.APENOM == null ? '' : r.APENOM).trim().replace(/\s+/g, ' ') || null, idlote: Number.isInteger(Number(r.IDLOTE)) && Number(r.IDLOTE) > 0 ? Number(r.IDLOTE) : null };
        vistos.set(cuil, v);
        validos.push(v);
    }
    return { validos, invalidos, duplicados };
}

// Decision para un destino. fechaActual = lo que ya tiene el destino; marcadoActual = si ya figura como fallecido.
//   marcar        -> no estaba marcado: se marca con la fecha del archivo
//   igual         -> ya estaba marcado con la misma fecha (o el archivo no trae fecha): nada que hacer
//   completar     -> estaba marcado SIN fecha y el archivo la trae: se completa la fecha
//   conflicto     -> estaba marcado con otra fecha: NO se pisa, se informa
function decidir(registro, marcadoActual, fechaActual) {
    const actual = aFecha(fechaActual);
    if (!marcadoActual) return 'marcar';
    if (!actual) return registro.fecha ? 'completar' : 'igual';
    if (!registro.fecha || registro.fecha === actual) return 'igual';
    return 'conflicto';
}

// Parte una lista en trozos de `n`
function trozos(lista, n) {
    const out = [];
    for (let i = 0; i < lista.length; i += n) out.push(lista.slice(i, i + n));
    return out;
}

// DNI que forma parte del CUIL (prefijo de 2 + DNI de 8 + verificador). Solo para personas (prefijos 20, 23, 24, 25, 26, 27).
function dniDeCuil(c) {
    const t = String(c);
    return /^(20|23|24|25|26|27)\d{9}$/.test(t) ? parseInt(t.slice(2, 10), 10) : null;
}

module.exports = { dniDeCuil, aFecha, validarRegistros, decidir, trozos, FECHA_MINIMA };
