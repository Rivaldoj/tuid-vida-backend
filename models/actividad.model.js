const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Model = sequelize.define('actividad', {
    IdActividad: { type: DataTypes.MEDIUMINT.UNSIGNED, primaryKey: true },
    Actividad: { type: DataTypes.STRING(1024), allowNull: false },
  }, {
    tableName: 'actividad',
    timestamps: false,
  });
  return Model;
};
