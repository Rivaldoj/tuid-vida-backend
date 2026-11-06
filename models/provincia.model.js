const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Model = sequelize.define('provincia', {
    IdProvincia: { type: DataTypes.CHAR(1), primaryKey: true },
    Provincia: { type: DataTypes.STRING(160), allowNull: false },
  }, {
    tableName: 'provincia',
    timestamps: false,
  });
  return Model;
};
