const fs = require('fs');
const path = require('path');

function readMasterDdl(dir) {
  const ddlPath = path.join(dir, 'Struc_Master.txt');
  let ddl = fs.readFileSync(ddlPath, 'utf8');
  ddl = ddl.replace(/`Master`/g, '`master`');
  ddl = ddl.replace('CREATE TABLE', 'CREATE TABLE IF NOT EXISTS');
  return ddl;
}

async function ensureMasterTable(sequelize, dir = __dirname) {
  const [tables] = await sequelize.query(
    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'master' AND TABLE_NAME = 'master'"
  );
  if (tables.length) return;

  try {
    await sequelize.query(readMasterDdl(dir));
  } catch (err) {
    if (err.original && err.original.code === 'ER_UNKNOWN_COLLATION') {
      await sequelize.models.padron.sync();
      return;
    }
    throw err;
  }
}

module.exports = { ensureMasterTable, readMasterDdl };
