global.APP_PATH = __dirname + '/../..';
process.env.NODE_CONFIG_DIR = APP_PATH + '/config/';
global.CONFIG = require('config');

const fs = require('fs');
const path = require('path');
const csv = require('fast-csv');
const { initSequelize } = require('../../startup/sequelize.init');
const { ensureMasterTable } = require('./masterSchema');
const {
  BATCH_SIZE,
  dedupeByCuil,
  writeRejectedCsv,
  bulkUpsert,
} = require('./padronBulkShared');

const DEFAULT_REJECTED_DIR = path.join(__dirname, '..', 'padron', 'rejected');
const PROGRESS_FILE_NAME = 'rejected-progress.json';
const POOL_ACQUIRE_MS = 120000;

function parseArgs() {
  const dryRun = process.argv.includes('--dry-run');
  const files = [];
  for (let i = 0; i < process.argv.length; i += 1) {
    if (process.argv[i] === '--file' && process.argv[i + 1]) {
      files.push(path.resolve(process.argv[i + 1]));
      i += 1;
    }
  }

  const dirIdx = process.argv.indexOf('--dir');
  const rejectedDir = dirIdx !== -1
    ? path.resolve(process.argv[dirIdx + 1])
    : DEFAULT_REJECTED_DIR;

  if (!files.length) {
    if (!fs.existsSync(rejectedDir)) {
      return { files: [], rejectedDir, dryRun };
    }
    const names = fs.readdirSync(rejectedDir)
      .filter((name) => /\.csv$/i.test(name))
      .filter((name) => fs.statSync(path.join(rejectedDir, name)).isFile())
      .sort();
    names.forEach((name) => files.push(path.join(rejectedDir, name)));
  }

  return { files, rejectedDir, dryRun };
}

function progressFilePath(rejectedDir) {
  return path.join(path.dirname(rejectedDir), PROGRESS_FILE_NAME);
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

function getLastBatchIndex(progress, fileName) {
  const entry = progress[fileName];
  return entry && entry.lastBatchIndex != null ? Number(entry.lastBatchIndex) : -1;
}

function setLastBatchIndex(progressPath, fileName, lastBatchIndex) {
  const progress = readProgress(progressPath);
  progress[fileName] = { lastBatchIndex, updatedAt: new Date().toISOString() };
  writeProgress(progressPath, progress);
}

function clearProgressEntry(progressPath, fileName) {
  const progress = readProgress(progressPath);
  if (!Object.prototype.hasOwnProperty.call(progress, fileName)) return;
  delete progress[fileName];
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

function parseDateOnly(val) {
  const s = trim(val);
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}

function normalizeCsvRow(raw) {
  const cuil = toBigInt(raw.CUIL);
  if (cuil == null) return null;

  const idProvincia = trim(raw.IdProvincia);

  return {
    CUIL: cuil,
    Apellido_Nombre: trim(raw.Apellido_Nombre),
    Apellido: trim(raw.Apellido),
    Nombre: trim(raw.Nombre),
    Sexo: trim(raw.Sexo),
    DNI: toInt(raw.DNI),
    IdActividad: toInt(raw.IdActividad),
    Baja: trim(raw.Baja),
    CUIT_Baja: trim(raw.CUIT_Baja),
    FechaNac: parseDateOnly(raw.FechaNac),
    CP: toInt(raw.CP),
    IdProvincia: idProvincia ? idProvincia.toUpperCase() : null,
    FechaFalle: parseDateOnly(raw.FechaFalle),
    Fallecido: toInt(raw.Fallecido) ?? 0,
    IdNacionalidad: toInt(raw.IdNacionalidad),
    Domicilio: trim(raw.Domicilio),
    Idlocal: toInt(raw.Idlocal),
    Familiar: trim(raw.Familiar),
    IdRelLab: toInt(raw.IdRelLab),
    cuitemplea: toBigInt(raw.cuitemplea),
    IdBanco: toInt(raw.IdBanco) ?? 0,
    IdObrasoc: toInt(raw.IdObrasoc) ?? 0,
    Telefono: trim(raw.Telefono),
    Celular: trim(raw.Celular),
    email: trim(raw.email),
    OB: toInt(raw.OB) ?? 0,
  };
}

function readCsvRows(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    let skipped = 0;

    fs.createReadStream(filePath)
      .pipe(csv.parse({ headers: true, trim: true, ignoreEmpty: true }))
      .on('error', reject)
      .on('data', (raw) => {
        const row = normalizeCsvRow(raw);
        if (row) rows.push(row);
        else skipped += 1;
      })
      .on('end', () => {
        const unique = dedupeByCuil(rows);
        unique.sort((a, b) => a.CUIL - b.CUIL);
        resolve({ rows: unique, skipped });
      });
  });
}

async function processCsvFile(filePath, model, progressPath, rejectedDir) {
  const name = path.basename(filePath);
  const stem = path.basename(filePath, path.extname(filePath));
  const { rows, skipped } = await readCsvRows(filePath);

  console.log(`  ${name}: ${rows.length} filas (${skipped} omitidas sin CUIL)`);

  const lastCompleted = getLastBatchIndex(readProgress(progressPath), name);
  const startBatch = lastCompleted + 1;
  if (startBatch > 0) {
    console.log(`  ${name}: retoma desde lote ${startBatch} (último completado: ${lastCompleted})`);
  }

  let total = 0;
  let rejected = 0;
  let fileFailed = false;
  let lastTs = Date.now();

  for (let batchIndex = startBatch; batchIndex * BATCH_SIZE < rows.length; batchIndex += 1) {
    const i = batchIndex * BATCH_SIZE;
    const batch = rows.slice(i, i + BATCH_SIZE);
    try {
      total += await bulkUpsert(model, batch);
      setLastBatchIndex(progressPath, name, batchIndex);
      const now = Date.now();
      console.log(`  ${name}: ${total} filas procesadas (${Math.min(i + batch.length, rows.length)}/${rows.length}) ${now - lastTs}ms`);
      lastTs = now;
    } catch (err) {
      fileFailed = true;
      const errorMsg = err.original?.sqlMessage || err.message;
      const ts = Date.now();
      const csvPath = path.join(rejectedDir, `${stem}_retry-${ts}_batch-${i}.csv`);
      writeRejectedCsv(csvPath, batch, errorMsg);
      rejected += batch.length;
      console.error(`  ${name}: lote ${batchIndex} rechazado (${errorMsg}) → ${csvPath}`);
      break;
    }
  }

  return { total, skipped, rejected, fileFailed, rowCount: rows.length };
}

async function run() {
  const { files, rejectedDir, dryRun } = parseArgs();
  const progressPath = progressFilePath(rejectedDir);

  if (!files.length) {
    console.error(`No se encontraron CSV en ${rejectedDir}. Usá --file <ruta> o --dir <carpeta>.`);
    process.exit(1);
  }

  console.log('CSV a reintentar:');
  files.forEach((file) => console.log(`  - ${file}`));
  console.log('Progreso:', progressPath);

  if (dryRun) {
    let grandRows = 0;
    let grandSkipped = 0;
    for (const file of files) {
      const { rows, skipped } = await readCsvRows(file);
      grandRows += rows.length;
      grandSkipped += skipped;
      console.log(`${path.basename(file)}: ${rows.length} filas únicas, ${skipped} omitidas`);
    }
    console.log(`\nDry-run: ${grandRows} filas listas para upsert, ${grandSkipped} omitidas.`);
    process.exit(0);
  }

  const sequelize = initSequelize({ sync: false, poolAcquire: POOL_ACQUIRE_MS });
  await sequelize.authenticate();
  console.log('Conectado a base master');

  await ensureMasterTable(sequelize, __dirname);
  const model = sequelize.models.padron;

  let grandTotal = 0;
  let grandSkipped = 0;
  let grandRejected = 0;
  let filesDeleted = 0;

  try {
    for (const file of files) {
      console.log(`\nCargando ${file}...`);
      if (!fs.existsSync(file)) {
        console.error(`  Archivo no encontrado, se omite.`);
        continue;
      }

      const result = await processCsvFile(file, model, progressPath, rejectedDir);
      grandTotal += result.total;
      grandSkipped += result.skipped;
      grandRejected += result.rejected;

      if (result.fileFailed) {
        console.log(`${path.basename(file)}: incompleto (${result.total} upsert, ${result.rejected} rechazadas en último lote)`);
        continue;
      }

      if (result.rowCount === 0) {
        fs.unlinkSync(file);
        clearProgressEntry(progressPath, path.basename(file));
        console.log(`${path.basename(file)}: vacío, eliminado`);
        filesDeleted += 1;
        continue;
      }

      fs.unlinkSync(file);
      clearProgressEntry(progressPath, path.basename(file));
      filesDeleted += 1;
      console.log(`${path.basename(file)}: ${result.total} filas upsert, ${result.skipped} omitidas — eliminado`);
    }

    console.log('\nResumen:');
    console.log(`  Filas procesadas: ${grandTotal}`);
    console.log(`  Filas omitidas (sin CUIL): ${grandSkipped}`);
    console.log(`  Filas rechazadas (CSV retry): ${grandRejected}`);
    console.log(`  CSV eliminados: ${filesDeleted}`);
  } finally {
    await sequelize.close();
  }

  console.log('\nCarga de rejected finalizada.');
  process.exit(grandRejected > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
