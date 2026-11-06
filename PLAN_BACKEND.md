# Plan de backend (pedido del 2026-11-06)

Estado: análisis hecho sobre el código de `backend-propio` (copia del backend desplegado). Nada de esto está desplegado.

## 1. Auditoría opcional por configuración — HECHO (probado en la BD local, no desplegado)
Origen: se implementó la auditoría cuando aparecieron intentos de fraude con videos animados; los clientes antes recibían la
certificación en tiempo real y ahora esperan la aprobación. Con AWS Face Liveness se pidió un interruptor.
- **Interruptor global** `auditoria_certificaciones` en la tabla nueva `configuracion` (`scripts/sql/configuracion.sql`):
  - **ON** (por defecto): las certificaciones esperan la aprobación de Auditoria (comportamiento de hoy).
  - **OFF**: pasan directo. Al certificar (`saveLogin` del flujo v2 con AWS Liveness) se guarda `auditoria.auditor = 'Liveness'`
    y `fechaAuditoria = hoy`. Como las descargas y envíos a clientes ya exigen `auditor IS NOT NULL AND NOT LIKE 'ALERTA%'`,
    las reciben en tiempo real sin tocar esas consultas.
  - Fail-safe: si la tabla no existe o falla la lectura, se comporta como ON.
  - Cambia solo desde 15 s después (caché) y cada cambio queda en `configuracion_historial` (quién, cuándo, valor anterior).
- **API del panel (solo Administrador de TUID, permiso nuevo `CONFIGURACION`):**
  `GET  /vida/admin/auth/configuracion/auditoria` → `{ obligatoria: true|false }`
  `POST /vida/admin/auth/configuracion/auditoria` con `{ "obligatoria": false }` (apaga) o `true` (enciende).
  Falta el botón en la pantalla del panel (el código del panel no está en este repositorio).
- No cambia: la auditoría del registro de usuarios (`usuario.auditor`), el flujo anterior sin AWS Liveness, ni las observadas (`ALERTA%`),
  que nunca se envían. Las certificaciones auto-aprobadas ya no aparecen en la cola de pendientes de Auditoria (tienen auditor).
- Pruebas: `node test/db/auditoria_liveness.test.js` (5 casos).

## 2. Botones WhatsApp / email en la ficha de auditoría
- La pantalla del panel de administración NO está en este repositorio (el backend solo expone la API).
- Propuesta: endpoint `GET /vida/admin/auth/auditoria/contacto/:id_validacion` que devuelve los datos del usuario y los enlaces
  ya armados: `https://wa.me/<telefono>?text=<texto>` y `mailto:<email>?subject=...&body=...`. El botón del panel solo hace
  `window.open(enlace, '_blank')`. Los textos salen de la tabla de textos editables (solo Administrador).
- Necesito saber dónde está el código del panel para agregar los botones.

## 3. ABM de empresas y sus administradores
- Existe: ABM de administradores (`cliente`: email, password, empresa, rol) en `services/vida/admin/user.js`, pero limitado a la
  empresa del administrador logueado, y la contraseña se guarda con SHA-1 sin sal (débil).
- Falta: alta/baja/modificación de empresas (`empresa`, `usuario_empresa`, parámetros como periodicidad y auditoría) y de sus
  administradores por parte de un Administrador general (empresa `TUID`), con permisos y registro de cambios.
- Cambios de esquema y pantallas del panel; requiere ver el esquema real de `empresa` y `cliente`.
- Mejora a incluir: contraseñas con bcrypt/scrypt y migración al primer inicio de sesión.

## 4. Notificaciones push
- **Hallazgo:** `utils/push.js` y `services/vida/admin/user.js` usan la API *legacy* de FCM (`fcm.googleapis.com/fcm/send`) con una
  clave de servidor escrita en el código. Google dio de baja esa API en 2024: es muy probable que las notificaciones **no se estén
  entregando**. Hay que migrar a FCM HTTP v1 con una cuenta de servicio de Firebase (la debe generar el titular en la consola de Firebase).
- Bug corregido: si el envío fallaba, `body` venía vacío y `body.success` tiraba el proceso de Node.
- Falta pedido: rangos de fecha (hoy el envío masivo usa `dias` de no verificados) y combo de mensajes prearmados (tabla de textos editables).
- Verificación real: enviar una notificación de prueba desde la consola de Firebase al token de un teléfono de prueba.

## 6. Rotación de secretos y claves fijas
| Qué | Dónde | Estado |
|---|---|---|
| Clave AES de cifrado | `utils/tokenizer.js` | Ya se lee de `security.aesKey`; si falta usa la histórica y avisa. Al rotarla hay que re-cifrar `id_respuesta` del servicio `authenticator`. |
| Clave FCM | `utils/push.js`, `user.js` | Ya se lee de `fcm.serverKey`; se reemplaza igual por la cuenta de servicio v1. |
| Secretos de `config/default.json` (BD, JWT, tokens de marca blanca, AWS, SES) | configuración | Rotar en cada servicio y desplegar la configuración nueva. |
| Contraseña de la BD (compartida por chat) | RDS | Rotar. |
| Contraseñas de administradores | `cliente.password` (SHA-1) | Migrar a hash fuerte. |
| Token de marca blanca de la app | `ServiceGenerator.java` (v1) y `vida.whitebrands` | Es el mismo para todos los usuarios; evaluar token por instalación. |

Rotar exige acceso de escritura a AWS/Firebase/RDS: lo ejecuta el titular o alguien de su confianza.

## Orden propuesto
1. (Hecho hoy) Claves fuera del código con compatibilidad hacia atrás.
2. Migración de esquema (SQL revisable) en la BD local de prueba: `auditoria_obligatoria`, textos editables, mensajes de notificaciones.
3. Auditoría opcional + contacto por WhatsApp/email (API) + ABM de empresas/administradores.
4. Push v1 (necesita la cuenta de servicio) con rangos de fecha y mensajes prearmados.
5. Paquete de despliegue único con instrucciones.
