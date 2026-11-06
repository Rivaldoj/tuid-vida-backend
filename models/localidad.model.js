const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Model = sequelize.define('localidad', {
    IdLocal: { type: DataTypes.MEDIUMINT.UNSIGNED, primaryKey: true },
    ProvinciaCodigo: { type: DataTypes.CHAR(1), allowNull: true },
    ProvinciaNombre: { type: DataTypes.STRING(160), allowNull: true },
    Partido: { type: DataTypes.STRING(160), allowNull: true },
    Localidad: { type: DataTypes.STRING(160), allowNull: true },
    CP: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: true },
    CPA: { type: DataTypes.STRING(24), allowNull: true },
    Prefijo: { type: DataTypes.STRING(16), allowNull: true },
  }, {
    tableName: 'localidad',
    timestamps: false,
  });
  return Model;
};
