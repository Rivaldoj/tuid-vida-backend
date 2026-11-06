global.APP_PATH = __dirname + '/../..';
process.env.NODE_CONFIG_DIR = APP_PATH + '/config/';
global.CONFIG = require('config');

const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const { initSequelize, syncDatabase, prepareDictionaryTables } = require('../../startup/sequelize.init');
const { ensureMasterTable } = require('./masterSchema');

const BATCH_SIZE = 1000;

const FILES = {
  provincia: 'Dic_Provincia.xlsx',
  nacionalidad: 'Dic_Nacionalidad.xlsx',
  relacion_laboral: 'Dic_RelLab.xlsx',
  banco: 'Dic_Banco.xlsx',
  obra_social: 'Dic_Obrasoc.xlsx',
  localidad: 'Dic_Local.xlsx',
  actividad: 'Dic_Actividades.xlsx',
};

const LOADERS = [
  { name: 'provincia', file: FILES.provincia, parse: parseProvincia, pk: 'IdProvincia' },
  { name: 'nacionalidad', file: FILES.nacionalidad, parse: parseNacionalidad, pk: 'IdNacionalidad' },
  { name: 'relacion_laboral', file: FILES.relacion_laboral, parse: parseRelacionLaboral, modelKey: 'relacionLaboral', pk: 'IdRelLab' },
  { name: 'banco', file: FILES.banco, parse: parseBanco, pk: 'IdBanco' },
  { name: 'obra_social', file: FILES.obra_social, parse: parseObraSocial, modelKey: 'obraSocial', pk: 'IdObrasoc' },
  { name: 'localidad', file: FILES.localidad, parse: parseLocalidad, pk: 'IdLocal' },
  { name: 'actividad', file: FILES.actividad, parse: parseActividad, pk: 'IdActividad' },
];

function parseArgs() {
  const dirIdx = process.argv.indexOf('--dir');
  const dir = dirIdx !== -1 ? process.argv[dirIdx + 1] : __dirname;
  return path.resolve(dir);
}

function readSheet(filePath) {
  const wb = xlsx.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return xlsx.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false });
}

function isHeaderRow(row, expected) {
  if (!row || !row.length) return false;
  return expected.every((col, i) => {
    const val = row[i];
    return val && String(val).trim().toLowerCase() === col.toLowerCase();
  });
}

function findHeaderIndex(rows, expected) {
  for (let i = 0; i < rows.length; i++) {
    if (isHeaderRow(rows[i], expected)) return i;
  }
  return 0;
}

function toInt(val) {
  const n = parseInt(val, 10);
  return Number.isNaN(n) ? null : n;
}

function dedupeByPk(rows, pk) {
  const map = new Map();
  rows.forEach((row) => map.set(row[pk], row));
  return Array.from(map.values());
}

async function bulkInsert(model, rows, pk) {
  const unique = dedupeByPk(rows, pk);
  let total = 0;
  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const batch = unique.slice(i, i + BATCH_SIZE);
    await model.bulkCreate(batch);
    total += batch.length;
    if (unique.length > BATCH_SIZE) {
      console.log(`  ${model.name}: ${total}/${unique.length}`);
    }
  }
  return total;
}

function parseProvincia(rows) {
  const headerIdx = findHeaderIndex(rows, ['IdProvincia', 'Provincia']);
  return rows.slice(headerIdx + 1)
    .filter((r) => r[0] && r[1])
    .map((r) => ({ IdProvincia: String(r[0]).trim(), Provincia: String(r[1]).trim() }));
}

function parseNacionalidad(rows) {
  const headerIdx = findHeaderIndex(rows, ['IdNacionalidad', 'Nacionalidad', 'Pais']);
  return rows.slice(headerIdx + 1)
    .filter((r) => r[0] != null && toInt(r[0]) != null)
    .map((r) => ({
      IdNacionalidad: toInt(r[0]),
      Nacionalidad: r[1] ? String(r[1]).trim() : null,
      Pais: r[2] ? String(r[2]).trim() : null,
    }));
}

function parseRelacionLaboral(rows) {
  const headerIdx = findHeaderIndex(rows, ['IdRelLab', 'Relacion Laboral', 'IdRelLabt']);
  return rows.slice(headerIdx + 1)
    .filter((r) => r[0] != null && toInt(r[0]) != null)
    .map((r) => ({
      IdRelLab: toInt(r[0]),
      denominacion: r[1] ? String(r[1]).trim() : null,
      codigo: r[2] ? String(r[2]).trim() : null,
    }));
}

function parseBanco(rows) {
  const headerIdx = findHeaderIndex(rows, ['IdBanco', 'EntAbrev', 'Entidad']);
  return rows.slice(headerIdx + 1)
    .filter((r) => r[0] != null && toInt(r[0]) != null)
    .map((r) => ({
      IdBanco: toInt(r[0]),
      EntAbrev: r[1] ? String(r[1]).trim() : null,
      Entidad: r[2] ? String(r[2]).trim() : null,
    }));
}

function parseObraSocial(rows) {
  const headerIdx = findHeaderIndex(rows, ['IdObrasoc', 'Obra Social', 'Original']);
  return rows.slice(headerIdx + 1)
    .filter((r) => r[0] != null && toInt(r[0]) != null)
    .map((r) => ({
      IdObrasoc: toInt(r[0]),
      denominacion: r[1] ? String(r[1]).trim() : null,
      nombreOriginal: r[2] ? String(r[2]).trim() : null,
    }));
}

function parseActividad(rows) {
  const headerIdx = findHeaderIndex(rows, ['IdActividad', 'Actividad']);
  return rows.slice(headerIdx + 1)
    .filter((r) => r[0] != null && toInt(r[0]) != null && r[1])
    .map((r) => ({
      IdActividad: toInt(r[0]),
      Actividad: String(r[1]).trim(),
    }));
}

function parseLocalidad(rows) {
  const headerIdx = findHeaderIndex(rows, ['IdLocal', 'PROVINCIA', 'DES_PROVIN', 'PARTIDO', 'LOCALIDAD', 'CP', 'CPA', 'PREFIJO']);
  return rows.slice(headerIdx + 1)
    .filter((r) => r[0] != null && toInt(r[0]) != null)
    .map((r) => ({
      IdLocal: toInt(r[0]),
      ProvinciaCodigo: r[1] ? String(r[1]).trim() : null,
      ProvinciaNombre: r[2] ? String(r[2]).trim() : null,
      Partido: r[3] ? String(r[3]).trim() : null,
      Localidad: r[4] ? String(r[4]).trim() : null,
      CP: r[5] != null ? toInt(r[5]) : null,
      CPA: r[6] ? String(r[6]).trim() : null,
      Prefijo: r[7] ? String(r[7]).trim() : null,
    }));
}

async function run() {
  const dir = parseArgs();
  console.log('Directorio de archivos:', dir);

  for (const file of Object.values(FILES)) {
    const filePath = path.join(dir, file);
    if (!fs.existsSync(filePath)) {
      console.error(`Archivo no encontrado: ${filePath}`);
      process.exit(1);
    }
  }

  const sequelize = initSequelize({ sync: false });
  await sequelize.authenticate();
  console.log('Conectado a base master');

  await prepareDictionaryTables(sequelize);
  console.log('Esquema de diccionarios listo');
  await ensureMasterTable(sequelize, __dirname);
  console.log('Tabla master lista');

  await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
  try {
    for (const loader of [...LOADERS].reverse()) {
      const model = sequelize.models[loader.modelKey || loader.name];
      await sequelize.query(`TRUNCATE TABLE \`${model.getTableName()}\``);
    }

    for (const loader of LOADERS) {
      console.log(`\nCargando ${loader.name}...`);
      const model = sequelize.models[loader.modelKey || loader.name];
      const rows = readSheet(path.join(dir, loader.file));
      const data = loader.parse(rows);
      const count = await bulkInsert(model, data, loader.pk);
      const dbCount = await model.count();
      console.log(`${loader.name}: ${count} filas cargadas, total en DB: ${dbCount}`);
    }
  } finally {
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
  }

  await syncDatabase(sequelize);
  console.log('Esquema sincronizado (sin FKs)');

  await sequelize.close();
  console.log('\nCarga de diccionarios finalizada.');
  process.exit(0);
}

run().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
