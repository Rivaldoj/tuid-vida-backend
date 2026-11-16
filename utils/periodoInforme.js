// Periodo de certificacion de una empresa para el informe mensual del Dashboard. Funciones puras (sin base de datos).
// Periodo = Fecha_actual - Fecha_fin (tabla empresa); Total Periodo = Cantidad (registros de la ultima subida);
// certificaciones = las hechas desde Fecha_actual hasta la fecha de corte del reporte.

// Fecha de hoy en Argentina como AAAA-MM-DD (el servidor corre en UTC: de noche "hoy" seria el dia siguiente)
function hoyArgentina(ahora) {
    return (ahora || new Date()).toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
}

// Fecha de corte del reporte del mes: el ultimo dia del mes, pero nunca despues de hoy (en el mes en curso el corte es hoy)
function fechaCorte(ano, mes, hoy) {
    const ultimo = new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);
    const h = hoy || hoyArgentina();
    return ultimo < h ? ultimo : h;
}

// "2026-11-01" / Date / "2026-11-01T03:00:00.000Z" -> "2026-11-01"; vacio -> null
function soloFecha(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v));
    return m ? m[1] : null;
}

// fila: { fecha_actual, fecha_fin, cantidad } de la tabla empresa; certificadas: personas certificadas entre fecha_actual y el corte.
// Devuelve null si la empresa todavia no tiene un periodo cargado (sin fecha de inicio).
function armarPeriodo(fila, certificadas, corte) {
    const inicio = soloFecha(fila && fila.fecha_actual);
    if (!inicio) return null;
    const cantidad = fila.cantidad == null ? 0 : Number(fila.cantidad);
    const hechas = Number(certificadas) || 0;
    return {
        fecha_actual: inicio,
        fecha_fin: soloFecha(fila.fecha_fin),
        cantidad,                       // Total Periodo
        corte,                          // fecha de corte del reporte
        certificadas: hechas,           // certificaciones desde fecha_actual hasta el corte
        pendientes: cantidad - hechas   // Total Certificaciones = Cantidad - certificaciones (puede dar negativo si se certifico mas gente que la cargada)
    };
}

module.exports = { hoyArgentina, fechaCorte, soloFecha, armarPeriodo };
