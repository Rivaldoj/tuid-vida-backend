-- Registro de los envios de notificaciones push hechos desde el panel (quien, a quien, con que texto y cuantas salieron)
CREATE TABLE IF NOT EXISTS notificaciones_envios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fecha DATETIME NOT NULL,
  usuario VARCHAR(100) NULL,
  empresa VARCHAR(50) NULL,
  modo VARCHAR(10) NOT NULL,
  filtros VARCHAR(200) NULL,
  clave_texto VARCHAR(60) NULL,
  titulo VARCHAR(200) NULL,
  destinatarios INT NOT NULL DEFAULT 0,
  enviados INT NOT NULL DEFAULT 0,
  fallidos INT NOT NULL DEFAULT 0,
  detalle VARCHAR(400) NULL,
  invalidos INT NOT NULL DEFAULT 0,
  KEY (fecha), KEY (empresa)
);
