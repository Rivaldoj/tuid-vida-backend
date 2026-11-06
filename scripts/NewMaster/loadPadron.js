global.APP_PATH = __dirname + '/../..';
process.env.NODE_CONFIG_DIR = APP_PATH + '/config/';
global.CONFIG = require('config');

const fs = require('fs');
const path = require('path');
const dbfDriver = require('dbffile');
const { initSequelize } = require('../../startup/sequelize.init');
const { ensureMasterTable } = require('./masterSchema');
const {
  BATCH_SIZE,
  dedupeByCuil,
  writeRejectedCsv,
  bulkUpsert,
} = require('./padronBulkShared');
const DEFAULT_DIR = path.join(__dirname, '..', 'padron');
const DBF_PATTERN = /\.dbf$/i;
const PROCESSED_DIR_NAME = 'processed';
const REJECTED_DIR_NAME = 'rejected';
const PROGRESS_FILE_NAME = 'progress.json';

function parseArgs() {
  const fileIdx = process.argv.indexOf('--file');
  const dirIdx = process.argv.indexOf('--dir');

  if (fileIdx !== -1) {
    const filePath = path.resolve(process.argv[fileIdx + 1]);
    return { files: [filePath], dir: path.dirname(filePath) };
  }

  const dir = dirIdx !== -1 ? path.resolve(process.argv[dirIdx + 1]) : DEFAULT_DIR;
  const files = fs.readdirSync(dir)
    .filter((name) => DBF_PATTERN.test(name))
    .filter((name) => fs.statSync(path.join(dir, name)).isFile())
    .sort()
    .map((name) => path.join(dir, name));

  return { files, dir };
}

function progressFilePath(dir) {
  if (path.basename(dir) === PROCESSED_DIR_NAME) {
    return path.join(path.dirname(dir), PROGRESS_FILE_NAME);
  }
  return path.join(dir, PROGRESS_FILE_NAME);
}

function readProgress(progressPath) {
  try {
    return JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

function writeProgress(progressPath, data) {
  const tmp = `${progressPath}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
  fs.renameSync(tmp, progressPath);
}

function getLastCuil(progress, name) {
  const entry = progress[name];
  return entry && entry.lastCuil != null ? Number(entry.lastCuil) : null;
}

function setLastCuil(progressPath, name, lastCuil) {
  const progress = readProgress(progressPath);
  progress[name] = { lastCuil, updatedAt: new Date().toISOString() };
  writeProgress(progressPath, progress);
}

function clearProgress(progressPath, name) {
  const progress = readProgress(progressPath);
  if (!Object.prototype.hasOwnProperty.call(progress, name)) return;
  delete progress[name];
  writeProgress(progressPath, progress);
}

function trim(val) {
  if (val == null) return null;
  const s = String(val).trim();
  return s === '' ? null : s;
}

function toInt(val) {
  const s = trim(val);
  if (s == null) return null;
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? null : n;
}

function toBigInt(val) {
  const s = trim(val);
  if (s == null) return null;
  const n = Math.trunc(parseFloat(s));
  return Number.isNaN(n) ? null : n;
}

function zeroToNull(n) {
  return n == null || n === 0 ? null : n;
}

function clampUnsigned(n, max, zeroAsNull = true) {
  if (n == null || Number.isNaN(n) || n < 0 || n > max) {
    return zeroAsNull ? null : 0;
  }
  if (n === 0 && zeroAsNull) return null;
  return n;
}

function parseDate(val) {
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    return val.toISOString().slice(0, 10);
  }
  const s = trim(val);
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const slash = s.match(/^(\d{4})\/(\d{2})\/(\d{2})/);
  if (slash) return `${slash[1]}-${slash[2]}-${slash[3]}`;
  return null;
}

function truncate(val, maxLen) {
  const s = trim(val);
  if (s == null) return null;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function parseRecord(rec) {
  const cuil = toBigInt(rec.CUIL);
  if (cuil == null) return null;

  const idProvincia = truncate(rec.IDPROVIN, 1);

  return {
    CUIL: cuil,
    Apellido_Nombre: truncate(rec.APENOM, 160),
    Apellido: truncate(rec.APELLIDO, 60),
    Nombre: truncate(rec.NOMBRE, 60),
    Sexo: truncate(rec.SEXO, 1),
    DNI: clampUnsigned(toInt(rec.DNI), 4294967295),
    IdActividad: clampUnsigned(toInt(rec.IDACTIVIDA), 16777215),
    Baja: truncate(rec.BAJA, 1),
    CUIT_Baja: rec.CUILREEMPL ? truncate(String(Math.trunc(rec.CUILREEMPL)), 11) : null,
    FechaNac: parseDate(rec.FECHANAC),
    CP: clampUnsigned(toInt(rec.CP), 65535),
    IdProvincia: idProvincia ? idProvincia.toUpperCase() : null,
    FechaFalle: parseDate(rec.FECHAFALLE),
    Fallecido: clampUnsigned(toInt(rec.FALLECIDO), 255, false),
    IdNacionalidad: clampUnsigned(toInt(rec.IDNACIONAL), 65535),
    Domicilio: truncate(rec.DOMICILIO, 60),
    Idlocal: clampUnsigned(toInt(rec.IDLOCAL), 16777215),
    Familiar: truncate(rec.FAMILIAR, 60),
    IdRelLab: clampUnsigned(toInt(rec.IDRELLAB), 255),
    cuitemplea: zeroToNull(toBigInt(rec.CUITEMPLEA)),
    IdBanco: clampUnsigned(toInt(rec.IDBANCO), 16777215, false),
    IdObrasoc: 0,
    Telefono: truncate(rec.TELEFONO, 13),
    Celular: truncate(rec.CELULAR, 13),
    email: truncate(rec.EMAIL, 60),
    OB: clampUnsigned(toInt(rec.OB), 255, false),
    IdLote: clampUnsigned(toInt(rec.IDLOTE), 255, false),
  };
}

function moveToProcessed(filePath) {
  const processedDir = path.join(path.dirname(filePath), PROCESSED_DIR_NAME);
  fs.mkdirSync(processedDir, { recursive: true });
  let dest = path.join(processedDir, path.basename(filePath));
  if (fs.existsSync(dest)) {
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);
    dest = path.join(processedDir, `${base}_${Date.now()}${ext}`);
  }
  fs.renameSync(filePath, dest);
  return dest;
}

async function readAndSortFile(filePath) {
  const dbf = await dbfDriver.DBFFile.open(filePath, { readMode: 'loose' });
  const name = path.basename(filePath);
  console.log(`  ${name}: ${dbf.recordCount} registros, campos: ${dbf.fields.map((f) => f.name).join(', ')}`);

  const rows = [];
  let skipped = 0;
  let index = 0;
  const readStart = Date.now();

  while (index < dbf.recordCount) {
    const records = await dbf.readRecords(BATCH_SIZE);
    if (!records.length) break;
    index += records.length;

    for (const rec of records) {
      const row = parseRecord(rec);
      if (!row) {
        skipped += 1;
        continue;
      }
      rows.push(row);
    }

    if (index % 200000 === 0 || index === dbf.recordCount) {
      console.log(`  ${name}: leídas ${index}/${dbf.recordCount}`);
    }
  }

  console.log(`  ${name}: lectura ${Date.now() - readStart}ms, ordenando ${rows.length} filas por CUIL...`);
  const sortStart = Date.now();
  const unique = dedupeByCuil(rows);
  unique.sort((a, b) => a.CUIL - b.CUIL);
  console.log(`  ${name}: orden + dedupe ${Date.now() - sortStart}ms (${unique.length} CUIL únicos)`);

  return { rows: unique, skipped, recordCount: dbf.recordCount };
}

async function upsertPreparedFile(filePath, prepared, model, progressPath) {
  let { rows, skipped, recordCount } = prepared;
  const name = path.basename(filePath);
  const stem = path.basename(filePath, path.extname(filePath));
  const rejectedDir = path.join(path.dirname(filePath), REJECTED_DIR_NAME);
  const fileStart = Date.now();

  const lastCuil = getLastCuil(readProgress(progressPath), name);
  if (lastCuil != null) {
    const before = rows.length;
    rows = rows.filter((row) => row.CUIL > lastCuil);
    console.log(`  ${name}: retoma después de CUIL ${lastCuil} (salta ${before - rows.length} filas)`);
  }

  let total = 0;
  let rejected = 0;
  let lastTs = Date.now();

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    try {
      total += await bulkUpsert(model, batch);
      setLastCuil(progressPath, name, batch[batch.length - 1].CUIL);
      const now = Date.now();
      console.log(`  ${name}: ${total} filas procesadas (${Math.min(i + batch.length, rows.length)}/${rows.length}) ${now - lastTs}ms`);
      lastTs = now;
    } catch (err) {
      const errorMsg = err.original?.sqlMessage || err.message;
      const csvPath = path.join(rejectedDir, `${stem}_batch-${i}.csv`);
      writeRejectedCsv(csvPath, batch, errorMsg);
      rejected += batch.length;
      const now = Date.now();
      console.error(`  ${name}: lote ${i}-${i + batch.length} rechazado (${errorMsg}) → ${csvPath} ${now - lastTs}ms`);
      lastTs = now;
    }
  }

  console.log(`  ${name}: escritura completa en ${Date.now() - fileStart}ms`);
  return { total, skipped, rejected, recordCount };
}

function prefetchFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return Promise.reject(new Error(`Archivo no encontrado: ${filePath}`));
  }
  console.log(`  Prefetch ${path.basename(filePath)}: lectura + orden en paralelo`);
  return readAndSortFile(filePath);
}

async function run() {
  const { files, dir } = parseArgs();
  const progressPath = progressFilePath(dir);

  if (!files.length) {
    console.error(`No se encontraron archivos .DBF. Usá --file <ruta> o --dir <carpeta> (default: ${DEFAULT_DIR}).`);
    process.exit(1);
  }

  console.log('Archivos a cargar:');
  files.forEach((file) => console.log(`  - ${file}`));
  console.log('Progreso:', progressPath);

  const sequelize = initSequelize({ sync: false });
  await sequelize.authenticate();
  console.log('Conectado a base master');

  await ensureMasterTable(sequelize, __dirname);
  console.log('Tabla master lista');

  const model = sequelize.models.padron;
  let grandTotal = 0;
  let grandSkipped = 0;
  let grandRejected = 0;
  let pending = prefetchFile(files[0]);

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    console.log(`\nCargando ${file}...`);
    try {
      const prepared = await pending;
      pending = files[i + 1] ? prefetchFile(files[i + 1]) : null;
      const { total, skipped, rejected } = await upsertPreparedFile(file, prepared, model, progressPath);
      grandTotal += total;
      grandSkipped += skipped;
      grandRejected += rejected;
      const dest = moveToProcessed(file);
      clearProgress(progressPath, path.basename(file));
      console.log(`${path.basename(file)}: ${total} filas upsert, ${skipped} omitidas, ${rejected} rechazadas`);
      console.log(`  Movido a ${dest}`);
    } catch (err) {
      console.error(`${path.basename(file)}: error al procesar, no se mueve. ${err.original?.sqlMessage || err.message}`);
      pending = files[i + 1] ? prefetchFile(files[i + 1]) : null;
    }
  }

  console.log('\nResumen:');
  console.log(`  Filas procesadas: ${grandTotal}`);
  console.log(`  Filas omitidas (sin CUIL): ${grandSkipped}`);
  console.log(`  Filas rechazadas (CSV): ${grandRejected}`);

  await sequelize.close();
  console.log('\nCarga de padrón finalizada.');
  process.exit(0);
}

run().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
