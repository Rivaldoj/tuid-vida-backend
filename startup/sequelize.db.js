const { initSequelize } = require('./sequelize.init');

// master (62M filas) no se sincroniza al arrancar: un ALTER TABLE ahi bloquea todas las lecturas del padron
// Los diccionarios tampoco se alteran al boot: el esquema ya está creado (usar loadDictionaries / syncDatabase en scripts)
module.exports = function () {
  global.SEQUELIZE = initSequelize({ sync: false });
  global.SEQUELIZE.authenticate()
    .then(() => console.log('Sequelize connected.'))
    .catch((err) => console.log('Failed to connect db: ' + err.message));
};
