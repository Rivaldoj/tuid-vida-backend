// Actualizacion mensual del padron (padronac.dbf -> padron.master): lectura del DBF y conversion de cada registro. Funciones sin base de datos.
//
// El archivo trae las personas NUEVAS del mes (CUIL, APENOM, FECHANAC, SEXO, CP, IDPROVIN, FALLECIDO, FECHAFALL, IDACTIVIDA, BAJA, OB, IDLOTE ...).
// Particularidades del DBF (por eso no se usa dbffile, que lo rechaza): los campos de fecha vienen declarados con 50 caracteres y el texto
// esta en CP850 (la N con tilde es el byte 0xA5), no en UTF-8.
const fs = require('fs');
const iconv = require('iconv-lite');
const cuilUtil = require('./cuil');
const { dniDeCuil } = require('./fallecidosCarga');

const CODIFICACION = { 0x01: 'cp437', 0x02: 'cp850', 0x03: 'win1252', 0x57: 'win1252', 0x58: 'win1252', 0x64: 'cp852', 0xC8: 'win1250' };

async function abrir(ruta) {
    const fd = await fs.promises.open(ruta, 'r');
    const cab = Buffer.alloc(32);
    await fd.read(cab, 0, 32, 0);
    const registros = cab.readUInt32LE(4), largoCab = cab.readUInt16LE(8), largoReg = cab.readUInt16LE(10);
    const campos = [];
    let pos = 1;
    const desc = Buffer.alloc(largoCab - 32);
    await fd.read(desc, 0, desc.length, 32);
    for (let o = 0; o + 32 <= desc.length && desc[o] !== 0x0d; o += 32) {
        const nombre = desc.slice(o, o + 11).toString('latin1').split('\0')[0];
        const largo = desc[o + 16];
        campos.push({ nombre, pos, largo });
        pos += largo;
    }
    return { fd, registros, largoCab, largoReg, campos, codificacion: CODIFICACION[cab[29]] || 'cp850' };
}

// Devuelve los registros como objetos { CAMPO: 'texto' } (sin espacios ni bytes nulos), de a lotes, llamando a onLote(filas)
async function leer(ruta, onLote, tamLote) {
    const a = await abrir(ruta);
    tamLote = tamLote || 5000;
    try {
        for (let i = 0; i < a.registros; i += tamLote) {
            const n = Math.min(tamLote, a.registros - i);
            const buf = Buffer.alloc(n * a.largoReg);
            await a.fd.read(buf, 0, buf.length, a.largoCab + i * a.largoReg);
            const filas = [];
            for (let r = 0; r < n; r++) {
                const base = r * a.largoReg;
                if (buf[base] === 0x2a) continue; // registro marcado como borrado
                const f = {};
                for (const c of a.campos) {
                    let b = buf.slice(base + c.pos, base + c.pos + c.largo);
                    const z = b.indexOf(0);
                    if (z >= 0) b = b.slice(0, z);
                    f[c.nombre] = iconv.decode(b, a.codificacion).trim();
                }
                filas.push(f);
            }
            await onLote(filas, i + n, a.registros);
        }
    } finally { await a.fd.close(); }
    return { registros: a.registros, campos: a.campos.map((c) => c.nombre), codificacion: a.codificacion };
}

function fecha8(t) {
    const m = /^(\d{4})-?(\d\d)-?(\d\d)$/.exec(String(t || ''));
    if (!m) return null;
    const y = +m[1], mo = +m[2], d = +m[3];
    if (y < 1850 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCMonth() !== mo - 1) return null;
    return m[1] + '-' + m[2] + '-' + m[3];
}

const entero = (t, max) => { const n = /^\d+$/.test(String(t || '')) ? parseInt(t, 10) : null; return n != null && n <= max ? n : null; };
const texto = (t, max) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s ? s.slice(0, max) : null; };

// Convierte un registro del DBF en una fila de master. Devuelve { fila } o { error }. actividades: Set con los IdActividad que existen (FK).
function convertir(g, actividades) {
    const cuil = String(g.CUIL || '');
    if (!/^\d{11}$/.test(cuil)) return { error: 'CUIL con formato invalido' };
    if (!cuilUtil.isValid(cuil)) return { error: 'CUIL con digito verificador invalido' };
    const apenom = texto(g.APENOM, 160);
    if (!apenom) return { error: 'Sin apellido y nombre' };
    let sexo = String(g.SEXO || '').toUpperCase();
    sexo = sexo === 'D' ? 'X' : (sexo === 'F' || sexo === 'M' || sexo === 'X' ? sexo : null);   // 'D' del archivo = 'X' en el padron (asi estan las cargas anteriores)
    const fall = String(g.FALLECIDO || '') === '1';
    const fechaFalle = fall ? fecha8(g.FECHAFALL || g.FECHAFALLE) : null;
    const act = entero(g.IDACTIVIDA, 4294967295);
    const prov = String(g.IDPROVIN || '').toUpperCase();
    const cp = entero(g.CP, 65535);
    return {
        fila: {
            cuil: Number(cuil), apenom, apellido: texto(g.APELLIDO, 60), nombre: texto(g.NOMBRE, 60), sexo,
            dni: entero(g.DNI, 4294967295) || dniDeCuil(cuil),
            idActividad: act && actividades && actividades.has(act) ? act : null,
            baja: String(g.BAJA || '') === '1' ? '1' : null,
            fechaNac: fecha8(g.FECHANAC) || fecha8(g.FECHANACI),
            cp: cp || null, idProvincia: /^[A-Z]$/.test(prov) ? prov : null,
            fallecido: fall ? 1 : 0, fechaFalle,
            ob: entero(g.OB, 255) || 0, idLote: entero(g.IDLOTE, 255)
        }
    };
}

module.exports = { leer, abrir, convertir, fecha8 };
