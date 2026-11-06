const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Model = sequelize.define('relacionLaboral', {
    IdRelLab: { type: DataTypes.TINYINT.UNSIGNED, primaryKey: true },
    denominacion: { type: DataTypes.STRING(255), allowNull: true },
    codigo: { type: DataTypes.CHAR(1), allowNull: true },
  }, {
    tableName: 'relacion_laboral',
    timestamps: false,
  });
  return Model;
};
