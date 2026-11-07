# Rotación de secretos — TuID Vida (backend)

Estado al 2026-11-07. **Ningún valor real figura en este documento.**

## 1. Qué se hizo en el código

Ningún secreto queda escrito en los archivos que van al repositorio. Todos salen de la configuración (`config/*.json`, que está en `.gitignore`).

| Antes (en el código) | Ahora (clave de configuración) | Archivo |
|---|---|---|
| Usuario y clave SMTP de SES dentro de `forgot` | **Eliminado**: el correo de "recuperar contraseña" sale por la API de SES con las credenciales del servidor (`utils/mail.js` → `sendHtmlAsync`) | `services/vida/admin/user.js` |
| Clave AES histórica | `security.aesKey` (32 caracteres, **obligatoria**: si falta el servidor no arranca) | `utils/tokenizer.js` |
| Usuario y clave del servicio de SMS | `sms.username`, `sms.password` | `utils/sms.js` |
| Token de WhatsApp (Meta) | `whatsapp.authorization` (valor completo del encabezado, por ejemplo `Bearer …`) | `utils/whatsapp.js` |
| Licencia del lector PDF417 (Dynamsoft) | `dynamsoft.productKeys` | `utils/pdf417.js`, `services/vida/manualRegister.js`, 2 × `registrations.js` |
| URL de SISA con credenciales | `sisa.url` (con `{document}` donde va el DNI) | `utils/sisa.js` |
| Clave de FCM en el código | `fcm.serviceAccountFile` (ruta al `.json` de la cuenta de servicio, **fuera** del repositorio) | `utils/push.js` |
| Claves de administradores en SHA1 sin sal | `security.passwordHash: "scrypt"` (ver sección 3) | `utils/password.js` |

Además: se dejó de escribir en el log el código de recuperación de clave y el usuario SMTP viejo ya no existe en el código.

**Para que el servidor arranque con este código, la configuración de producción tiene que tener estas claves.** En esta máquina quedaron en `config/local.json` (ignorado por git). No copiar ese archivo a ningún repositorio.

## 2. Qué hay que rotar (lo hace el titular, en cada servicio)

Hay que rotar todo lo que alguna vez estuvo escrito en código, en un chat o en un archivo compartido. Marcamos en orden de urgencia.

| Prioridad | Secreto | Dónde se rota | Después de rotar |
|---|---|---|---|
| Alta | Clave de la base de datos (RDS `tuid_vida`) y las de `newMaster` / `padron` | RDS / MySQL | Actualizar `vida.db.password`, `newMaster.db.password`, `padron.db.password` |
| Alta | Usuario SMTP de SES que estaba en `forgot` | IAM → usuarios → **eliminar** el usuario SMTP (ya no se usa) | Nada más |
| Alta | Clave vieja de FCM (API heredada) | Firebase / Google Cloud → credenciales → eliminar la clave | Nada más (ya se usa la cuenta de servicio) |
| Alta | Cuenta de servicio de Firebase (si el `.json` se compartió o se copió) | Firebase → Cuentas de servicio → generar clave nueva y **eliminar la anterior** | Reemplazar el archivo en el servidor |
| Alta | Usuario y clave del servicio de SMS | Panel del proveedor de SMS | `sms.username`, `sms.password` |
| Alta | Token de WhatsApp | Meta for Developers → usuario del sistema → regenerar | `whatsapp.authorization` |
| Media | Claves JWT (`jwt.key`, `jwt.authenticatorAdmin.key`, `jwt.vidaAdmin.key`) | Se inventan nuevas (largas, aleatorias) | Al cambiarlas se cierran todas las sesiones del panel |
| Media | Tokens de marca blanca (`whitebrands`) | Los emite TUID: uno por cliente/instalación | Avisar a cada cliente |
| Media | Clave de HubSpot, FTP | En cada servicio | `hubspot.key`, `ftp.password` |
| Media | Licencia Dynamsoft | Con el proveedor | `dynamsoft.productKeys` |
| Media | Credenciales de SISA | Con el organismo | `sisa.url` |
| Media | Clave AES (`security.aesKey`) | Se inventa una nueva de 32 caracteres (sección 4) | Solo invalida registros en curso; sin migración |

Mientras no se rote, esos valores **siguen estando en el historial de git** de este repositorio. El repositorio es local; no se debe subir con ese historial a ningún sitio. Si algún día se publica, hay que crear uno nuevo desde cero (sin historial) o reescribir el historial.

## 3. Claves de administradores: de SHA1 a scrypt

Las claves del panel estaban guardadas con SHA1 sin sal. Ahora el código sabe guardar y verificar `scrypt` con sal, y **sigue aceptando las viejas** (se convierten solas en el siguiente ingreso correcto de cada persona).

Orden obligatorio (si se invierte, falla el guardado de claves):

1. Ejecutar `scripts/sql/claves_scrypt.sql` (amplía las columnas de `cliente.password` y `password.password` a 255 caracteres).
2. Poner `"security": { "passwordHash": "scrypt" }` en la configuración y reiniciar.
3. A partir de ahí: cada ingreso correcto convierte esa cuenta; cambios y reseteos de clave se guardan en scrypt.

Reglas nuevas de clave (reseteo y cambio): 8 a 100 caracteres, con letras y números. No se puede repetir ninguna clave del historial.

Para forzar que todos cambien su clave después de la migración, basta poner `fecha_ultima = NULL` a las cuentas (el panel obliga a cambiarla al ingresar).

## 4. Clave AES (`security.aesKey`)

Se usa solo para cifrar `id_respuesta` dentro del `authToken` que el servicio `authenticator` devuelve en el registro (`register.js`, `v2/register.js`) y que `chance.js` descifra en la "revancha". Se verificó en el código que **ese valor cifrado no se guarda en la base**: en la tabla `usuarios` se guarda la respuesta en claro y el cifrado viaja solo dentro del token. Por eso **no hace falta ningún script de migración**.

Para rotarla:

1. Generar una clave nueva de exactamente 32 caracteres aleatorios.
2. Ponerla en `security.aesKey` y reiniciar.
3. Efecto: los `authToken` emitidos antes y todavía en uso quedan sin poder descifrar la respuesta (solo afecta a quien esté justo en el paso "revancha"; esa persona repite el registro). No se pierde ningún dato.

## 5. Lista de control para el despliegue

- [ ] Configuración de producción con todas las claves de la sección 1.
- [ ] `fcm.serviceAccountFile` apuntando a un archivo privado del servidor.
- [ ] Ejecutar `scripts/sql/claves_scrypt.sql`, luego activar `security.passwordHash`.
- [ ] Ejecutar `scripts/sql/notificaciones_log.sql` (historial de notificaciones).
- [ ] Rotar lo de la sección 2 y actualizar la configuración.
- [ ] Probar: ingreso al panel, "recuperar contraseña", una notificación a un solo usuario, un SMS.
