# Despliegue: período de empresa, usuarios con CUIL y "Mi empresa" (2026-11-14)

NADA de esto fue ejecutado. Cada paso lo corre el titular (o Claude con OK explícito paso a paso).
Versión que corre hoy: `v-20261113-errores` (ese es el punto de marcha atrás).

## Qué trae
- Encabezado del panel: "Empresa · Nombre del usuario" junto al avatar.
- Empresas: subtítulo Período (inicio, fin, próxima validación, registros) y, debajo de cada empresa, ABM de usuarios con CUIL obligatorio.
- Menú nuevo "Mi empresa" para el Administrador de una empresa cliente (solo su empresa, solo usuarios con rol `U`).
- Subir archivo: empresa automática y período obligatorio; se guarda en `empresa` y la cantidad se verifica contra el archivo.
- `getEmail` ahora devuelve correo, empresa y nombre.

## Paquetes listos
| Pieza | Archivo |
|---|---|
| Backend (zip completo = versión actual + 4 archivos cambiados, con `config/local.json`) | `C:\TUID\secrets\produccion-actual\nuevo-empresas-cuil.zip` (61 MB; NO subir a ningún repositorio: lleva claves) |
| Panel compilado (producción, sin `.map`, apunta a `api.autenticartuid.com`) | `C:\TUID\panel-vida\paquete-panel-2026-11-14` |
| SQL | `C:\TUID\backend-propio\scripts\sql\empresa_periodo_cliente_cuil.sql` |

Archivos de backend modificados: `routes/vidaAdmin.js`, `services/vida/admin/empresas.js`, `services/vida/admin/user.js`, `utils/empresas.js`.

## Orden (sin SQL: ver paso 2)
Variable necesaria en cada consola: `export AWS_CA_BUNDLE=C:/TUID/Recuperacion/backend/windows-roots.pem`

### 0. Verificación previa (solo lectura)
```sql
SHOW COLUMNS FROM cliente;   -- ¿existen cuil (char 11) y nombre (varchar 80)?
SHOW COLUMNS FROM empresa;   -- ¿existen fecha_actual, fecha_proxima? (faltan fecha_fin y cantidad_registros)
SELECT id_usuario, email, empresa, cuil FROM cliente WHERE cuil IS NULL OR cuil NOT REGEXP '^[0-9]{11}$';  -- cuentas con CUIL de relleno
```

### 1. Respaldo de la base
```bash
aws rds create-db-snapshot --db-instance-identifier tuid-vida --db-snapshot-identifier tuid-vida-antes-empresas-cuil-2026-11-14 --region us-east-1
```
Esperar a que el snapshot esté `available`.

### 2. SQL: NO HACE FALTA (paso 0 hecho el 2026-11-14, solo lectura)
La base de producción ya tiene las columnas: `cliente.CUIL char(11)` y `cliente.Nombre varchar(80)`; `empresa.Fecha_actual`, `Fecha_fin`, `Fecha_proxima` (date) y `Cantidad` (int).
El código ya usa esos nombres. Las 62 cuentas tienen CUIL de relleno (1 a 62, no son 11 dígitos), 61 sin nombre, sin CUIL repetidos por empresa:
el panel las marca "CUIL provisorio" hasta que se cargue el real. El script `empresa_periodo_cliente_cuil.sql` queda solo como referencia.
La base se pudo consultar desde esta PC sin tocar el grupo de seguridad.

### 3. Backend
```bash
aws s3 cp C:/TUID/secrets/produccion-actual/nuevo-empresas-cuil.zip s3://elasticbeanstalk-us-east-1-369680393310/v-20261114-empresas-cuil.zip --region us-east-1
aws elasticbeanstalk create-application-version --application-name TuidNew --version-label v-20261114-empresas-cuil --source-bundle S3Bucket=elasticbeanstalk-us-east-1-369680393310,S3Key=v-20261114-empresas-cuil.zip --region us-east-1
aws elasticbeanstalk update-environment --environment-name TuidNew-env --version-label v-20261114-empresas-cuil --region us-east-1
```
Esperar `Green/Ok`. Marcha atrás:
```bash
aws elasticbeanstalk update-environment --environment-name TuidNew-env --version-label v-20261113-errores --region us-east-1
```

### 4. Panel
```bash
# respaldo del bucket actual
aws s3 sync s3://web-tuid-vida C:/TUID/panel-vida/respaldo-bucket-2026-11-14 --region us-east-1
# subir los archivos nuevos (index.html al final)
aws s3 sync C:/TUID/panel-vida/paquete-panel-2026-11-14 s3://web-tuid-vida --exclude index.html --region us-east-1
aws s3 cp C:/TUID/panel-vida/paquete-panel-2026-11-14/index.html s3://web-tuid-vida/index.html --region us-east-1
aws cloudfront create-invalidation --distribution-id E302A509H8TZFG --paths "/*"
```
Después borrar del bucket los archivos con hash viejos que ya no se usan y cualquier `*.map`. Marcha atrás: `aws s3 sync` del respaldo y nueva invalidación.

## Verificación (con el panel real)
- [ ] Encabezado: Empresa · Nombre (si la cuenta aún no tiene nombre, muestra el correo).
- [ ] Administrador de TuID: menú Empresas, "Período" en cada empresa, botón USUARIOS, alta con CUIL válido y rechazo de uno inválido.
- [ ] Cuentas con CUIL de relleno marcadas "CUIL provisorio".
- [ ] Administrador de una empresa cliente (cuenta real de prueba): menú "Mi empresa", sin selector de rol, ve solo su empresa.
- [ ] Subir archivo con una empresa de prueba (no una real): exige fechas y cantidad, y guarda el período.
  OJO: la subida BORRA y reemplaza los registros de `usuario_empresa` de esa empresa; usar la empresa de prueba.
- [ ] "Gestionar usuarios" (pantalla anterior) sigue funcionando.

## Notas
- Ya existía la pantalla "Gestionar usuarios"; no se tocó y convive con la nueva.
- Las altas nuevas envían un correo con código (48 h) para fijar la clave; las cuentas viejas no cambian.
