const COLUMNS = 'CUIL, DNI, Sexo, Apellido_Nombre, Apellido, Nombre, FechaNac, CP, IdProvincia, Domicilio, Idlocal, Familiar, IdRelLab, cuitemplea, IdBanco, IdObrasoc, Telefono, Celular, email, Fallecido, FechaFalle';

async function findPeople(dni, sexo) {
    const params = [dni];
    let query = `SELECT ${COLUMNS} FROM master WHERE DNI = ? AND Apellido_Nombre IS NOT NULL`;
    if (sexo) {
        query += ' AND Sexo = ?';
        params.push(sexo);
    }
    return PADRON_DB.sync_query(query + ' ORDER BY CUIL ASC', params);
}

async function findPerson(dni, sexo) {
    const [row] = await findPeople(dni, sexo);
    return row ? { row, legacy: toLegacy(row) } : null;
}

async function findByCuil(cuil) {
    const [row] = await PADRON_DB.sync_query(`SELECT ${COLUMNS} FROM master WHERE CUIL = ?`, [cuil]);
    return row || null;
}

async function cuilsByDni(dni, sexo) {
    const rows = await findPeople(dni, sexo);
    return rows.map((row) => row.CUIL);
}

async function deceased(cuil) {
    const [row] = await PADRON_DB.sync_query('SELECT Fallecido, FechaFalle FROM master WHERE CUIL = ?', [cuil]);
    if (!row) return { fallecido: false, fecha: null };
    return { fallecido: row.Fallecido === 1 || !!row.FechaFalle, fecha: row.FechaFalle };
}

function splitBirth(fechaNac) {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(fechaNac || '');
    if (!match) return { ano: null, mes: null, dia: null };
    return { ano: Number(match[1]), mes: Number(match[2]), dia: Number(match[3]) };
}

// Forma que esperan los flujos v1 (req.masterData); Nombres va como "APELLIDO, NOMBRE" porque validateData compara contra ese formato
function toLegacy(row) {
    const nombre = row.Nombre || '';
    const [nombre1, ...rest] = nombre.split(' ').filter(Boolean);
    return {
        DNI: row.DNI,
        Sexo: row.Sexo,
        CUIL: row.CUIL,
        Nombres: row.Apellido && row.Nombre ? `${row.Apellido}, ${row.Nombre}` : row.Apellido_Nombre,
        Apellidos: row.Apellido || (row.Apellido_Nombre || '').split(' ')[0],
        Nombre1: nombre1 || null,
        Nombre2: rest.length > 0 ? rest.join(' ') : null,
        nombre: row.Nombre,
        ...splitBirth(row.FechaNac),
        FechaNac: row.FechaNac,
        cuitemplea: row.cuitemplea || null,
        idobrasoc: row.IdObrasoc || null,
        idbanco: row.IdBanco || null,
        idrellab: row.IdRelLab,
        telefono: row.Telefono,
        celular: row.Celular,
        familiar: row.Familiar,
        CP: row.CP != null ? String(row.CP) : null,
    };
}

// Columnas que esperan los clientes de /payments y del admin (getDni)
function toMasterPersonColumns(row) {
    return {
        cuil: row.CUIL,
        dni: row.DNI,
        sexo: row.Sexo,
        Nombres: row.Apellido_Nombre,
        FechaNac: row.FechaNac,
        Domicilio: row.Domicilio,
        Cod_local: row.Idlocal,
        CP: row.CP,
        Familiar: row.Familiar,
        IDRelLab: row.IdRelLab,
        Cuitemplea: row.cuitemplea,
        IDBanco: row.IdBanco,
        IDObrasoc: row.IdObrasoc,
        Telefono: row.Telefono,
        Celular: row.Celular,
        Fallecido: row.Fallecido,
        Email: row.email,
    };
}

module.exports = {
    findPeople,
    findPerson,
    findByCuil,
    cuilsByDni,
    deceased,
    toLegacy,
    toMasterPersonColumns,
};
