-- Modulo de Textos: mensajes de WhatsApp, correos y notificaciones push editables por el Administrador (sin tocar codigo).
-- Variables que se reemplazan al usar un texto: {{nombre}} {{apellido}} {{nombre_completo}} {{cuil}} {{empresa}} {{fecha}} {{auditor}}
-- canal: 'whatsapp' | 'email' | 'push'. Para 'email' y 'push' el campo asunto es el asunto / el titulo.
CREATE TABLE IF NOT EXISTS textos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  clave VARCHAR(60) NOT NULL,
  canal VARCHAR(10) NOT NULL,
  formato VARCHAR(10) NOT NULL DEFAULT 'texto',
  nombre VARCHAR(100) NOT NULL,
  asunto VARCHAR(200) NULL,
  cuerpo MEDIUMTEXT NOT NULL,
  activo TINYINT NOT NULL DEFAULT 1,
  actualizado_por VARCHAR(100) NULL,
  actualizado_en DATETIME NULL,
  UNIQUE KEY uk_clave (clave),
  KEY (canal, activo)
);
CREATE TABLE IF NOT EXISTS textos_historial (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_texto INT NOT NULL,
  formato VARCHAR(10) NOT NULL DEFAULT 'texto',
  asunto VARCHAR(200) NULL,
  cuerpo MEDIUMTEXT NOT NULL,
  activo TINYINT NOT NULL,
  usuario VARCHAR(100) NULL,
  fecha DATETIME NOT NULL,
  KEY (id_texto, fecha)
);

-- Textos iniciales (se pueden editar o desactivar desde el panel)
INSERT IGNORE INTO textos (clave, canal, nombre, asunto, cuerpo, actualizado_por, actualizado_en) VALUES
('AUDITORIA_OBSERVADA_WHATSAPP', 'whatsapp', 'Certificación observada (WhatsApp)', NULL,
 'Hola {{nombre}}, le escribimos de TuID Vida. Su certificación de Fe de Vida del {{fecha}} fue observada y necesitamos que la realice nuevamente. Puede ver su foto acá: {{enlace_foto}} (el enlace vence en 7 días). Puede repetir su Fe de Vida desde la aplicación, en un lugar con buena luz y sin anteojos. Ante cualquier duda respondanos por este medio.', 'migracion', NOW()),
('AUDITORIA_OBSERVADA_EMAIL', 'email', 'Certificación observada (correo)', 'TuID Vida: necesitamos que repita su Fe de Vida',
 'Hola {{nombre}} {{apellido}},\n\nLe escribimos de TuID Vida. Su certificación de Fe de Vida del {{fecha}} fue observada por no cumplir con las condiciones de calidad requeridas.\n\nLe pedimos que la realice nuevamente desde la aplicación, en un lugar con buena luz y sin anteojos.\n\nSi tiene alguna duda, responda este correo.\n\nSaludos,\nEquipo TuID Vida', 'migracion', NOW()),
('REGISTRO_INCOMPLETO_WHATSAPP', 'whatsapp', 'Registración incompleta (WhatsApp)', NULL,
 'Hola {{nombre}}, le escribimos de TuID Vida. Su registración (CUIL {{cuil}}) no fue completada. Para poder ayudarlo necesitamos que nos confirme sus datos. Quedamos atentos.', 'migracion', NOW()),
('REGISTRO_INCOMPLETO_EMAIL', 'email', 'Registración incompleta (correo)', 'TuID Vida: su registración está incompleta',
 'Hola {{nombre}} {{apellido}},\n\nSu registración en TuID Vida (CUIL {{cuil}}) no fue completada.\n\nPara ayudarlo, responda este correo o escríbanos por WhatsApp.\n\nSaludos,\nEquipo TuID Vida', 'migracion', NOW()),
('RECORDATORIO_FE_DE_VIDA_PUSH', 'push', 'Recordatorio de Fe de Vida', 'TuID Vida',
 'Recuerde realizar su Fe de Vida para mantener sus beneficios al día.', 'migracion', NOW()),
('FE_DE_VIDA_VENCIDA_PUSH', 'push', 'Fe de Vida vencida', 'TuID Vida',
 'Su Fe de Vida está vencida. Realícela hoy desde la aplicación para evitar la suspensión de su beneficio.', 'migracion', NOW());
