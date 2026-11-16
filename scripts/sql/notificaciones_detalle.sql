-- Registro de envios de notificaciones: motivo de los fallos y tokens eliminados. Columnas nuevas, aditivas y repetibles (MariaDB).
-- Si no se corre, el sistema registra los envios como antes (solo enviados / fallidos). NO EJECUTADO en produccion.
ALTER TABLE notificaciones_envios
  ADD COLUMN IF NOT EXISTS detalle VARCHAR(400) NULL AFTER fallidos,
  ADD COLUMN IF NOT EXISTS invalidos INT NOT NULL DEFAULT 0 AFTER detalle;
-- Deshacer: ALTER TABLE notificaciones_envios DROP COLUMN detalle, DROP COLUMN invalidos;
