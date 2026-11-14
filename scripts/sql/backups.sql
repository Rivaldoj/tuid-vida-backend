-- Registro de los backups que hace el servidor (base de datos en S3 y copias de RDS).
-- Los backups de fuentes los sube la PC de TUID directo a S3 y se listan desde el bucket.
CREATE TABLE IF NOT EXISTS backups (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tipo VARCHAR(20) NOT NULL,              -- 'db' (volcado SQL a S3) | 'snapshot' (copia de RDS)
  origen VARCHAR(20) NOT NULL,            -- 'programado' | 'manual'
  nombre VARCHAR(120) NOT NULL,           -- base o instancia respaldada
  estado VARCHAR(20) NOT NULL,            -- 'en_curso' | 'ok' | 'error'
  bytes BIGINT NULL,
  clave_s3 VARCHAR(255) NULL,
  detalle VARCHAR(500) NULL,              -- filas/tablas o mensaje de error
  usuario VARCHAR(100) NULL,
  dia_programado DATE NULL,               -- evita que dos servidores hagan el mismo backup programado
  iniciado DATETIME NOT NULL,
  terminado DATETIME NULL,
  KEY (tipo, iniciado),
  UNIQUE KEY uq_programado (tipo, nombre, dia_programado)
);
INSERT IGNORE INTO configuracion (clave, valor, actualizado_por, actualizado_en) VALUES ('backup_activo', 'ON', 'migracion', NOW());
INSERT IGNORE INTO configuracion (clave, valor, actualizado_por, actualizado_en) VALUES ('backup_hora', '3', 'migracion', NOW());
