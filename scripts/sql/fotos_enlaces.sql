-- Enlaces para que una persona vea la foto de SU certificacion observada (mensajes de Auditoria por WhatsApp y correo).
-- El codigo es largo y no adivinable; el enlace vence y se bloquea tras varios intentos fallidos con el CUIL.
CREATE TABLE IF NOT EXISTS fotos_enlaces (
  id INT AUTO_INCREMENT PRIMARY KEY,
  codigo VARCHAR(40) NOT NULL,
  id_validacion INT NOT NULL,
  id_usuario INT NOT NULL,
  creado_por VARCHAR(100) NULL,
  creado_en DATETIME NOT NULL,
  vence_en DATETIME NOT NULL,
  intentos_fallidos INT NOT NULL DEFAULT 0,
  accesos INT NOT NULL DEFAULT 0,
  ultimo_acceso DATETIME NULL,
  UNIQUE KEY uk_codigo (codigo),
  KEY (id_validacion)
);
