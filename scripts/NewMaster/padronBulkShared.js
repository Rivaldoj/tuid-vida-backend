const fs = require('fs');
const path = require('path');

const BATCH_SIZE = 5000;

const CSV_FIELDS = [
  'CUIL', 'Apellido_Nombre', 'Apellido', 'Nombre', 'Sexo', 'DNI', 'IdActividad',
  'Baja', 'CUIT_Baja', 'FechaNac', 'CP', 'IdProvincia', 'FechaFalle',
  'Fallecido', 'IdNacionalidad', 'Domicilio', 'Idlocal', 'Familiar',
  'IdRelLab', 'cuitemplea', 'IdBanco', 'IdObrasoc', 'Telefono', 'Celular',
  'email', 'OB', 'error',
];

const UPDATE_FIELDS = [
  'Apellido_Nombre', 'Apellido', 'Nombre', 'Sexo', 'DNI', 'IdActividad',
  'Baja', 'CUIT_Baja', 'FechaNac', 'CP', 'IdProvincia', 'FechaFalle',
  'Fallecido', 'IdNacionalidad', 'Domicilio', 'Idlocal', 'Familiar',
  'IdRelLab', 'cuitemplea', 'IdBanco', 'Telefono', 'Celular',
  'email', 'OB',
];

function dedupeByCuil(rows) {
  const map = new Map();
  rows.forEach((row) => map.set(row.CUIL, row));
  return Array.from(map.values());
}

function csvEscape(val) {
  if (val == null) return '';
  const s = String(val);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeRejectedCsv(csvPath, rows, errorMsg) {
  fs.mkdirSync(path.dirname(csvPath), { recursive: true });
  const lines = [CSV_FIELDS.join(',')];
  for (const row of rows) {
    lines.push(CSV_FIELDS.map((field) => csvEscape(field === 'error' ? errorMsg : row[field])).join(','));
  }
  fs.writeFileSync(csvPath, `${lines.join('\n')}\n`);
}

async function bulkUpsert(model, rows) {
  const unique = dedupeByCuil(rows);
  await model.bulkCreate(unique, {
    updateOnDuplicate: UPDATE_FIELDS,
  });
  return unique.length;
}

module.exports = {
  BATCH_SIZE,
  CSV_FIELDS,
  UPDATE_FIELDS,
  dedupeByCuil,
  csvEscape,
  writeRejectedCsv,
  bulkUpsert,
};
