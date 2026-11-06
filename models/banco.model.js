const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Model = sequelize.define('banco', {
    IdBanco: { type: DataTypes.MEDIUMINT.UNSIGNED, primaryKey: true },
    EntAbrev: { type: DataTypes.STRING(64), allowNull: true },
    Entidad: { type: DataTypes.STRING(255), allowNull: true },
  }, {
    tableName: 'banco',
    timestamps: false,
  });
  return Model;
};
