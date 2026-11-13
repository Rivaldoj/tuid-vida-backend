-- Migracion del Modulo de Textos para correos en formato HTML (produccion: MariaDB). Se puede correr mas de una vez.
-- formato: 'texto' (el comportamiento de siempre) o 'html' (solo canal email). El cuerpo pasa a MEDIUMTEXT para entrar el HTML.
ALTER TABLE textos ADD COLUMN IF NOT EXISTS formato VARCHAR(10) NOT NULL DEFAULT 'texto' AFTER canal;
ALTER TABLE textos MODIFY cuerpo MEDIUMTEXT NOT NULL;
ALTER TABLE textos_historial ADD COLUMN IF NOT EXISTS formato VARCHAR(10) NOT NULL DEFAULT 'texto' AFTER id_texto;
ALTER TABLE textos_historial MODIFY cuerpo MEDIUMTEXT NOT NULL;
