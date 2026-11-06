const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Model = sequelize.define('nacionalidad', {
    IdNacionalidad: { type: DataTypes.SMALLINT.UNSIGNED, primaryKey: true },
    Nacionalidad: { type: DataTypes.STRING(160), allowNull: true },
    Pais: { type: DataTypes.STRING(160), allowNull: true },
  }, {
    tableName: 'nacionalidad',
    timestamps: false,
  });
  return Model;
};
