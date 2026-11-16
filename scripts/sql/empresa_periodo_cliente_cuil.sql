-- NO HACE FALTA CORRERLO EN PRODUCCION (verificado el 2026-11-14, solo lectura).
-- La base de produccion ya tiene las columnas que usa el panel:
--   cliente: CUIL char(11), Nombre varchar(80)
--   empresa: Fecha_actual, Fecha_fin, Fecha_proxima (date), Cantidad int
-- (MariaDB no distingue mayusculas en nombres de columna; el codigo usa esos nombres.)
-- Queda solo como referencia para armar una base nueva a partir de cero. Es repetible.
ALTER TABLE empresa
  ADD COLUMN IF NOT EXISTS Fecha_actual DATE NULL,
  ADD COLUMN IF NOT EXISTS Fecha_fin DATE NULL,
  ADD COLUMN IF NOT EXISTS Fecha_proxima DATE NULL,
  ADD COLUMN IF NOT EXISTS Cantidad INT NOT NULL DEFAULT 0;
ALTER TABLE cliente
  ADD COLUMN IF NOT EXISTS CUIL CHAR(11) NULL,
  ADD COLUMN IF NOT EXISTS Nombre VARCHAR(80) NULL;
-- Cuentas con CUIL de relleno (hoy: las 62, con numeros 1..62): el panel las marca "CUIL provisorio".
-- SELECT id_usuario, empresa, rol, CUIL, Nombre FROM cliente WHERE CUIL IS NULL OR CUIL NOT REGEXP '^[0-9]{11}$';
