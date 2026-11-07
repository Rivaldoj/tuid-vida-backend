-- Paso previo para pasar las claves del panel de SHA1 (40 caracteres) a scrypt con sal (~100 caracteres).
-- 1) Ejecutar esto. 2) Recien despues poner "security.passwordHash": "scrypt" en la configuracion y reiniciar.
-- Las claves viejas siguen sirviendo y se convierten solas en el proximo ingreso correcto de cada persona.
ALTER TABLE cliente MODIFY password VARCHAR(255) NULL;
ALTER TABLE `password` MODIFY password VARCHAR(255) NULL;
