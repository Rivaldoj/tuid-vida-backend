const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Model = sequelize.define('padron', {
    CUIL: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true },
    Apellido_Nombre: { type: DataTypes.STRING(160), allowNull: true },
    Apellido: { type: DataTypes.STRING(60), allowNull: true },
    Nombre: { type: DataTypes.STRING(60), allowNull: true },
    Sexo: { type: DataTypes.CHAR(1), allowNull: true },
    DNI: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    IdActividad: { type: DataTypes.MEDIUMINT.UNSIGNED, allowNull: true },
    Baja: { type: DataTypes.CHAR(1), allowNull: true },
    CUIT_Baja: { type: DataTypes.STRING(11), allowNull: true },
    FechaNac: { type: DataTypes.DATEONLY, allowNull: true },
    CP: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: true },
    IdProvincia: { type: DataTypes.CHAR(1), allowNull: true },
    FechaFalle: { type: DataTypes.DATEONLY, allowNull: true },
    Fallecido: { type: DataTypes.TINYINT.UNSIGNED, allowNull: true },
    IdNacionalidad: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: true },
    Domicilio: { type: DataTypes.STRING(60), allowNull: true },
    Idlocal: { type: DataTypes.MEDIUMINT.UNSIGNED, allowNull: true },
    Familiar: { type: DataTypes.STRING(60), allowNull: true },
    IdRelLab: { type: DataTypes.TINYINT.UNSIGNED, allowNull: true },
    cuitemplea: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    IdBanco: { type: DataTypes.MEDIUMINT.UNSIGNED, allowNull: true, defaultValue: 0 },
    IdObrasoc: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 },
    Telefono: { type: DataTypes.STRING(13), allowNull: true },
    Celular: { type: DataTypes.STRING(13), allowNull: true },
    email: { type: DataTypes.STRING(60), allowNull: true },
    IdPrefijo: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    OB: { type: DataTypes.TINYINT.UNSIGNED, allowNull: true, defaultValue: 0 },
    IdLote: { type: DataTypes.TINYINT.UNSIGNED, allowNull: true, defaultValue: null },
  }, {
    tableName: 'master',
    timestamps: false,
  });
  return Model;
};
