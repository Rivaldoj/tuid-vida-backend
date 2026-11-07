# Despliegue — TuID Vida (backend + panel de administración)

Estado al 2026-11-07. Esta guía la ejecuta **el titular** (nada se despliega ni se toca en producción desde el trabajo de mantenimiento).
Orden pensado para que, si algo sale mal, se pueda volver atrás sin perder datos.

> Nota: se asume que el backend corre en AWS (Elastic Beanstalk, `api.autenticartuid.com`) y el panel es un sitio estático en S3.
> Si su montaje real difiere, los pasos de configuración y de SQL valen igual.

## 0. Antes de empezar (respaldos)

- [ ] Snapshot de la base de datos `vida` (RDS) y de la del servicio `authenticator`.
- [ ] Copia de la versión actual del backend desplegada (el `.zip` de Beanstalk) y del contenido actual del bucket del panel.
- [ ] Anotar la configuración de producción actual (`config/production.json` o las variables de entorno del entorno).

## 1. Consultas de verificación en producción (solo lectura)

```sql
-- Cuentas deshabilitadas: con este código dejan de poder entrar al panel. ¿Alguna se usa hoy?
SELECT email, empresa FROM cliente WHERE activo = 0;
-- Cuentas con intentos fallidos acumulados: con este código quedarían bloqueadas.
SELECT email, retry FROM cliente WHERE retry >= 3;
-- Columnas de la tabla empresa (el ABM se adapta, pero conviene verlas).
SHOW COLUMNS FROM empresa;
```
Si hay cuentas bloqueadas que corresponde habilitar: `UPDATE cliente SET retry = 0 WHERE email = '…';`

## 2. SQL (en este orden, con respaldo hecho)

| Script | Qué hace | Se puede repetir |
|---|---|---|
| `scripts/sql/configuracion.sql` | Interruptor de Auditoría | Sí |
| `scripts/sql/textos.sql` | Textos editables (WhatsApp, correo, push) | Sí |
| `scripts/sql/fotos_enlaces.sql` | Enlaces a la foto de la certificación | Sí |
| `scripts/sql/notificaciones_log.sql` | Historial de notificaciones | Sí |
| `scripts/sql/claves_scrypt.sql` | Amplía las columnas de claves a 255 caracteres | Sí |
| `scripts/sql/vida_usuario_signup_v2.sql` | Columnas nuevas de `usuario` | **No** (falla si ya existen: mirar `SHOW COLUMNS FROM usuario` primero) |

Algunos de estos pueden ya estar aplicados si en su momento los ejecutó otra persona. Los que usan `IF NOT EXISTS` no hacen daño.

## 3. Configuración del servidor

Agregar a la configuración de producción (**no** al repositorio). Valores y rotación: ver `ROTACION_SECRETOS.md`.

| Clave | Contenido |
|---|---|
| `security.aesKey` | **Obligatoria**: 32 caracteres. Sin ella el servidor no arranca. |
| `sms.username`, `sms.password` | Servicio de SMS |
| `whatsapp.authorization` | Valor completo del encabezado, por ejemplo `Bearer …` |
| `dynamsoft.productKeys` | Licencia del lector PDF417 |
| `sisa.url` | URL de SISA con `{document}` donde va el DNI |
| `fcm.serviceAccountFile` | Ruta del `.json` de la cuenta de servicio de Firebase (archivo **fuera** del código) o variable `GOOGLE_APPLICATION_CREDENTIALS` |
| `aws.emailFrom` | Remitente verificado en SES (por defecto `contacto@autenticartuid.com`) |
| `security.passwordHash` | `"scrypt"` — **solo después** del paso 2 (`claves_scrypt.sql`). Puede activarse en un segundo reinicio. |

Rotar antes o en este mismo momento las claves de la sección 2 de `ROTACION_SECRETOS.md`.

## 4. Backend

1. Probar en el entorno de pruebas (QA) si existe: arrancar con la configuración nueva. Si falta una clave obligatoria, el arranque falla con un mensaje claro.
2. Desplegar el código (rama actual del repositorio local: último commit `35278db`).
3. Verificar, en este orden:
   - [ ] Arranca sin errores en los logs.
   - [ ] Ingreso al panel con una cuenta administradora (y que se actualice a scrypt si ya activó `passwordHash`).
   - [ ] "Recuperar contraseña" llega por correo desde `contacto@autenticartuid.com`.
   - [ ] Entra y se ve la app: una certificación de prueba completa.
   - [ ] Un SMS y un WhatsApp de prueba.
   - [ ] Una notificación push a **un solo** usuario de prueba (Panel → Notificaciones, por CUIL).

## 5. Panel de administración

1. Compilar (en `panel-vida/fuente`, con el Node 12 portátil incluido en `panel-vida/herramientas`):
   ```bash
   export PATH="/c/TUID/panel-vida/herramientas/node-v12.22.12-win-x64:$PATH"
   node node_modules/@angular/cli/bin/ng build --prod
   ```
   (`sourceMap` está en `false` en producción, pero revisar que la carpeta de salida **no** contenga archivos `.map`).
2. Subir el contenido compilado al bucket del panel.
3. **Borrar del bucket todos los archivos `*.map`** que hayan quedado de versiones anteriores (exponen el código fuente del panel).
4. Invalidar la caché de CloudFront si hay una distribución delante.
5. Verificar: ingreso, menú **Empresas** (visible solo para el administrador de TuID), **Notificaciones**, **Textos**.

## 6. Primera empresa nueva (prueba de punta a punta)

1. Panel → Empresas → **Nueva empresa**, con un correo de administrador propio de prueba.
2. Llega el correo de invitación (vence en 48 h). Abrir el enlace del panel, ingresar el código y elegir clave.
3. Con esa cuenta: Gestionar usuarios → alta de un usuario de la empresa; comprobar que no ve otras empresas.
4. Suspender y reactivar la empresa de prueba; comprobar que la cuenta no entra mientras está suspendida.

## 7. Si algo sale mal (marcha atrás)

- Código: volver a desplegar la versión anterior (paso 0). Las claves ya convertidas a scrypt **no** funcionan con el código viejo: si se activó `passwordHash`, hay que dejar un acceso de emergencia (resetear la clave de un administrador en SHA1) **antes** de revertir.
- SQL: los scripts solo agregan tablas/columnas o amplían columnas; no hace falta deshacerlos.
- Panel: restaurar la copia del bucket.

## 8. Pendientes que no bloquean el despliegue

- Servicio `authenticator`: sigue con claves de administrador en SHA1 (`services/authenticator/admin/login.js` y `users.js`).
- Re-cifrado AES: no hace falta (ver `ROTACION_SECRETOS.md`, sección 4).
- Token de marca blanca por instalación y textos de correos editables: ver `PLAN_BACKEND.md`.
