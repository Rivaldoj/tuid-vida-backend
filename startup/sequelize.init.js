const Sequelize = require('sequelize');

const SYNC_ORDER = ['provincia', 'nacionalidad', 'relacionLaboral', 'banco', 'obraSocial', 'localidad', 'actividad', 'empleador', 'padron'];

function attachHelpers(sequelize) {
  sequelize.getPagination = (page, size) => {
    const limit = size ? +size : 20;
    const offset = page ? page * limit : 0;
    return { limit, offset };
  };

  sequelize.getPagingData = (data, page, limit) => {
    const { count: totalItems, rows: list } = data;
    const currentPage = page ? +page : 0;
    const totalPages = Math.ceil(totalItems / limit);
    return { totalItems, list, totalPages, currentPage };
  };
}

async function migrateDictionaryColumns(sequelize) {
  const alters = [
    'ALTER TABLE provincia MODIFY IdProvincia CHAR(1) NOT NULL',
    'ALTER TABLE nacionalidad MODIFY IdNacionalidad SMALLINT UNSIGNED NOT NULL',
    'ALTER TABLE relacion_laboral MODIFY IdRelLab TINYINT UNSIGNED NOT NULL',
    'ALTER TABLE banco MODIFY IdBanco MEDIUMINT UNSIGNED NOT NULL',
    'ALTER TABLE obra_social MODIFY IdObrasoc INT NOT NULL',
    'ALTER TABLE localidad MODIFY IdLocal MEDIUMINT UNSIGNED NOT NULL',
    'ALTER TABLE actividad MODIFY IdActividad MEDIUMINT UNSIGNED NOT NULL',
    'ALTER TABLE dic_emple MODIFY CUIT BIGINT UNSIGNED NOT NULL, ADD PRIMARY KEY (CUIT)',
  ];
  for (const sql of alters) {
    try {
      await sequelize.query(sql);
    } catch (err) {
      if (![1060, 1054, 1068].includes(err.original?.errno)) {
        console.log('Column migrate warning:', err.original?.sqlMessage || err.message);
      }
    }
  }
}

async function syncDatabase(sequelize) {
  await migrateDictionaryColumns(sequelize);
  for (const name of SYNC_ORDER) {
    await sequelize.models[name].sync();
  }
}

function initSequelize({ sync = false, poolAcquire = 30000 } = {}) {
  const dbConfig = CONFIG.get('padron').db;

  const sequelize = new Sequelize(dbConfig.database, dbConfig.user, dbConfig.password, {
    host: dbConfig.host,
    port: dbConfig.port,
    dialect: 'mysql',
    dialectOptions: { decimalNumbers: true },
    define: { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
    logging: dbConfig.debug || false,
    pool: {
      max: dbConfig.connectionLimit || 10,
      min: 0,
      acquire: poolAcquire,
      idle: 10000,
    },
  });

  require('../models/banco.model')(sequelize);
  require('../models/localidad.model')(sequelize);
  require('../models/nacionalidad.model')(sequelize);
  require('../models/obraSocial.model')(sequelize);
  require('../models/provincia.model')(sequelize);
  require('../models/relacionLaboral.model')(sequelize);
  require('../models/actividad.model')(sequelize);
  require('../models/empleador.model')(sequelize);
  require('../models/padron.model')(sequelize);

  attachHelpers(sequelize);

  if (sync) {
    syncDatabase(sequelize)
      .then(() => console.log('Sequelize synced db.'))
      .catch((err) => console.log('Failed to sync db: ' + err.message));
  }

  return sequelize;
}

const DICT_SYNC_ORDER = SYNC_ORDER.slice(0, -1);

async function prepareDictionaryTables(sequelize) {
  await migrateDictionaryColumns(sequelize);
  for (const name of DICT_SYNC_ORDER) {
    await sequelize.models[name].sync();
  }
}

module.exports = {
  initSequelize,
  syncDatabase,
  prepareDictionaryTables,
};
