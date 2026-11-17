# Carga mensual (padron + fallecidos) — sin ayuda

Archivos del mes: copiar a `C:\TUID\DB_Actu\` con estos nombres: `padronac.dbf` (personas nuevas) y `pdfallem.dbf` (fallecidos del mes).

1. Doble clic en `1_VER_CARGA_MENSUAL.bat`: muestra que cambiaria. NO escribe nada. Revisar los numeros (descartados, altas, conflictos).
2. Sacar un snapshot de la base `master` (RDS > master > Acciones > Tomar instantanea), o por consola:
   `aws rds create-db-snapshot --db-instance-identifier master --db-snapshot-identifier master-antes-AAAA-MM-DD`
   (con `set AWS_CA_BUNDLE=C:\TUID\Recuperacion\backend\windows-roots.pem`). Esperar a que figure "available".
3. Doble clic en `2_APLICAR_CARGA_MENSUAL.bat` y escribir SI. Hace PRIMERO el padron y SOLO si sale bien, los fallecidos.

Si algo sale mal: `node scripts/actualizarPadron.js --revertir <lote>` y `node scripts/cargarFallecidos.js --revertir <lote>`
(el lote se muestra al terminar; revertir primero fallecidos y despues padron). Informes CSV en `C:\TUID\DB_Actu\informes\`.
