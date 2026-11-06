const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Model = sequelize.define('empleador', {
    CUIT: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true },
    EMPLEADOR: { type: DataTypes.STRING(120), allowNull: true },
    TIPO_SOC: { type: DataTypes.STRING(50), allowNull: true },
  }, {
    tableName: 'dic_emple',
    timestamps: false,
  });
  return Model;
};
