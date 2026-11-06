-- Configuracion global editable por el Administrador (sin tocar codigo ni desplegar).
-- Hoy contiene un solo valor: si las certificaciones deben ser aprobadas por Auditoria antes de llegar a los clientes.
--   auditoria_certificaciones = 'ON'  -> (por defecto) las certificaciones esperan la aprobacion de Auditoria
--   auditoria_certificaciones = 'OFF' -> pasan directo; se guardan con auditor = 'Liveness'
-- Si esta tabla no existe o falla la lectura, el sistema se comporta como ON (lo mas seguro).
CREATE TABLE IF NOT EXISTS configuracion (
  clave VARCHAR(60) NOT NULL PRIMARY KEY,
  valor VARCHAR(255) NOT NULL,
  actualizado_por VARCHAR(100) NULL,
  actualizado_en DATETIME NULL
);
CREATE TABLE IF NOT EXISTS configuracion_historial (
  id INT AUTO_INCREMENT PRIMARY KEY,
  clave VARCHAR(60) NOT NULL,
  valor_anterior VARCHAR(255) NULL,
  valor_nuevo VARCHAR(255) NOT NULL,
  usuario VARCHAR(100) NULL,
  fecha DATETIME NOT NULL,
  KEY (clave, fecha)
);
INSERT IGNORE INTO configuracion (clave, valor, actualizado_por, actualizado_en)
VALUES ('auditoria_certificaciones', 'ON', 'migracion', NOW());
