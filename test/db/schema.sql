-- Tablas minimas de PRUEBA (solo las columnas que usan las consultas de Vida v2). Datos 100% ficticios.
DROP TABLE IF EXISTS auditoria;
DROP TABLE IF EXISTS usuario_empresa;
DROP TABLE IF EXISTS empresa;
DROP TABLE IF EXISTS usuario;
DROP TABLE IF EXISTS cliente;
DROP TABLE IF EXISTS password;
DROP TABLE IF EXISTS logueo;

CREATE TABLE usuario (
  id_usuario INT AUTO_INCREMENT PRIMARY KEY,
  dni VARCHAR(20), sexo CHAR(1), cuil VARCHAR(15),
  nombre VARCHAR(100), apellido VARCHAR(100), nacimiento VARCHAR(20),
  estado VARCHAR(20), fecha DATETIME, fecha_fallecido DATETIME NULL,
  auditor VARCHAR(255) NULL, id_device VARCHAR(500) NULL, empresa VARCHAR(50) NULL, extra VARCHAR(1000) NULL,
  email VARCHAR(100) NULL, telefono VARCHAR(30) NULL,
  emailVrf TINYINT NULL, telefonoVrf TINYINT NULL, fecha_valida DATETIME NULL, similitud FLOAT NULL,
  KEY (cuil), KEY (dni, sexo)
);
CREATE TABLE empresa (
  id VARCHAR(50) NOT NULL, nombre VARCHAR(100) DEFAULT NULL, direcciones TINYINT(1) DEFAULT 0, costo_validacion DOUBLE DEFAULT 0.2,
  periodicidad TINYINT UNSIGNED DEFAULT 1, fecha_actual DATE DEFAULT NULL, fecha_proxima DATE DEFAULT NULL, entidad INT DEFAULT NULL,
  visible TINYINT(1) DEFAULT 0, img VARCHAR(255) DEFAULT NULL, emails TINYINT(1) DEFAULT 0, telefonos TINYINT(1) DEFAULT 0,
  ultimo_archivo DATETIME DEFAULT NULL, ultima_notificacion DATETIME DEFAULT NULL, notificaciones TINYINT NOT NULL DEFAULT 0,
  email VARCHAR(100) DEFAULT NULL, tipo CHAR(1) NOT NULL DEFAULT 'E', link VARCHAR(255) DEFAULT NULL, PRIMARY KEY (id)
);
CREATE TABLE usuario_empresa (
  id INT AUTO_INCREMENT PRIMARY KEY, cuil VARCHAR(15), empresa VARCHAR(50),
  fecha_recordatorio DATE NULL, notificacion DATE NULL, proxima DATE NULL, KEY (cuil)
);
CREATE TABLE auditoria (
  id_validacion INT AUTO_INCREMENT PRIMARY KEY, id_usuario INT, fecha DATETIME,
  id_device VARCHAR(500) NULL, similitud DOUBLE NULL, empresa VARCHAR(50) NULL,
  latitud VARCHAR(30) NULL, longitud VARCHAR(30) NULL, version VARCHAR(50) NULL, os VARCHAR(100) NULL,
  direccion VARCHAR(500) NULL, cuil VARCHAR(15) NULL, appversion VARCHAR(30) NULL,
  session_id VARCHAR(100) NULL, liveness_confidence DOUBLE NULL, auditor VARCHAR(255) NULL, fechaAuditoria DATE NULL,
  KEY (id_usuario), KEY (session_id)
);

CREATE TABLE cliente (id_usuario INT AUTO_INCREMENT PRIMARY KEY, email VARCHAR(100), password VARCHAR(255) NULL, empresa VARCHAR(50), rol CHAR(1), activo TINYINT DEFAULT 1,
  fecha_ultima DATETIME NULL, resetPasswordToken VARCHAR(64) NULL, resetPasswordExpires DATETIME NULL, reintento INT DEFAULT 0);
CREATE TABLE password (id INT AUTO_INCREMENT PRIMARY KEY, id_usuario INT, fecha DATETIME, password VARCHAR(255), KEY (id_usuario));
CREATE TABLE logueo (id INT AUTO_INCREMENT PRIMARY KEY, id_usuario INT, fecha DATETIME);
