-- Columnas para los datos extra del body de POST /vida/v2/signup (base vida)
ALTER TABLE usuario
  ADD COLUMN latitud varchar(20) NULL,
  ADD COLUMN longitud varchar(20) NULL,
  ADD COLUMN appversion varchar(20) NULL,
  ADD COLUMN serial_number varchar(30) NULL,
  ADD COLUMN barcode text NULL,
  ADD COLUMN mrz varchar(255) NULL;
