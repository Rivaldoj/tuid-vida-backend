-- Tablas minimas de PRUEBA (solo las columnas que usan las consultas de Vida v2). Datos 100% ficticios.
DROP TABLE IF EXISTS auditoria;
DROP TABLE IF EXISTS usuario_empresa;
DROP TABLE IF EXISTS empresa;
DROP TABLE IF EXISTS usuario;

CREATE TABLE usuario (
  id_usuario INT AUTO_INCREMENT PRIMARY KEY,
  dni VARCHAR(20), sexo CHAR(1), cuil VARCHAR(15),
  nombre VARCHAR(100), apellido VARCHAR(100), nacimiento VARCHAR(20),
  estado VARCHAR(20), fecha DATETIME, fecha_fallecido DATETIME NULL,
  auditor VARCHAR(255) NULL, id_device VARCHAR(500) NULL,
  email VARCHAR(100) NULL, telefono VARCHAR(30) NULL,
  emailVrf TINYINT NULL, telefonoVrf TINYINT NULL, fecha_valida DATETIME NULL,
  KEY (cuil), KEY (dni, sexo)
);
CREATE TABLE empresa (
  id VARCHAR(50) PRIMARY KEY, tipo CHAR(1), periodicidad INT, img VARCHAR(255) NULL, link VARCHAR(255) NULL
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
  session_id VARCHAR(100) NULL, liveness_confidence DOUBLE NULL, auditor VARCHAR(255) NULL,
  KEY (id_usuario), KEY (session_id)
);
