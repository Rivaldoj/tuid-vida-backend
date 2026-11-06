const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Model = sequelize.define('obraSocial', {
    IdObrasoc: { type: DataTypes.INTEGER, primaryKey: true },
    denominacion: { type: DataTypes.STRING(320), allowNull: true },
    nombreOriginal: { type: DataTypes.STRING(320), allowNull: true },
  }, {
    tableName: 'obra_social',
    timestamps: false,
  });
  return Model;
};
