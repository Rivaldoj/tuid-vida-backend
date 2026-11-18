# Carga mensual (padron + fallecidos) — sin ayuda

## Que es cada tabla (para entender que se actualiza)

- **`padron.master`**: el universo de CUIL (altas, bajas, fallecidos). Es la fuente de verdad y lo unico que se mantiene al dia todos los meses.
- **`tuid_vida.usuario_empresa`**: lo que las empresas (cajas previsionales) informan que deben dar fe de vida en el periodo. **Cada vez que una empresa sube un listado nuevo se pisa**, y con el se pierden sus marcas de fallecido. Por eso no es fuente de verdad.
- **`tuid_vida.usuario`**: los beneficiarios registrados que usan la app. `fecha_fallecido` es la **fecha real de fallecimiento** (no la de deteccion ni fin de mes).

El informe de Fallecidos del panel, las notificaciones push y el correo masivo **consultan `master`** (por CUIL, por tandas) para saber quien esta fallecido: no dependen de las marcas de `usuario_empresa` ni de `usuario`. Si `master` no responde, notificaciones y correo se detienen y no envian nada.

## Los dos archivos de fallecidos

| Archivo | Que trae | Cuando usarlo |
|---|---|---|
| `pdfallem.dbf` | fallecidos **del mes** (decenas de miles) | todos los meses |
| `pdfallet.dbf` | **total historico** (unos 10 millones) | solo para ponerse al dia (primera vez, o si se sospecha que faltan meses anteriores) |

Usar el equivocado fue el error de noviembre de 2026: se cargo `pdfallem` y los meses anteriores no quedaron reflejados.

## Cada mes

Archivos del mes: copiar a `C:\TUID\DB_Actu\` con estos nombres: `padronac.dbf` (personas nuevas) y `pdfallem.dbf` (fallecidos del mes).

1. Subir la base `master` de tamano (ver "Tamano de la base" mas abajo). Con `db.t3.micro` las cargas grandes la tiran por falta de memoria.
2. Doble clic en `1_VER_CARGA_MENSUAL.bat`: muestra que cambiaria. NO escribe nada. Revisar los numeros (descartados, altas, conflictos).
3. Sacar un snapshot de la base `master` (RDS > master > Acciones > Tomar instantanea), o por consola:
   `aws rds create-db-snapshot --db-instance-identifier master --db-snapshot-identifier master-antes-AAAA-MM-DD`
   (con `set AWS_CA_BUNDLE=C:\TUID\Recuperacion\backend\windows-roots.pem`). Esperar a que figure "available".
4. Doble clic en `2_APLICAR_CARGA_MENSUAL.bat` y escribir SI. Hace PRIMERO el padron y SOLO si sale bien, los fallecidos.
5. Bajar `master` otra vez a `db.t3.micro`.

Si algo sale mal: `node scripts/actualizarPadron.js --revertir <lote>` y `node scripts/cargarFallecidos.js --revertir <lote>`
(el lote se muestra al terminar; revertir primero fallecidos y despues padron). Informes CSV en `C:\TUID\DB_Actu\informes\`.

## Tamano de la base `master`

Subir antes de la carga y bajar al terminar (cada cambio tarda unos 6 minutos y reinicia la base; hacerlo en horario de poco uso). Con `set AWS_CA_BUNDLE=C:\TUID\Recuperacion\backend\windows-roots.pem`:

```
aws rds modify-db-instance --db-instance-identifier master --db-instance-class db.t3.large --apply-immediately
aws rds modify-db-instance --db-instance-identifier master --db-instance-class db.t3.micro --apply-immediately
```

Esperar a que `aws rds describe-db-instances --db-instance-identifier master` muestre `available` y la clase pedida.
(Con la `large`, 270.000 altas tardaron unos 8 minutos; con la `micro` se cortaba.)

## Si la carga se corta

- **Padron**: repetir con `--continuar` (`node scripts/cargaMensual.js --apply --altas --continuar`). No duplica nada: retoma el mismo lote. Si el contador final dice "en esta corrida", el total del lote es el que figura como "Altas del lote".
- **Fallecidos**: el script reconecta solo (hasta 5 intentos). Si igual se corta, repetir el mismo comando: lo ya marcado queda como esta. Cada marca se anota en `fallecidos_carga_log` **antes** de escribirse, asi que se puede deshacer aunque se haya cortado a medias, y completar leyendo ese registro.

## Ponerse al dia con el historico (`pdfallet.dbf`)

Solo cuando hace falta. Es pesado: leer y comparar 10 millones de registros lleva mas de media hora y necesita memoria.

```
node --max-old-space-size=10240 scripts/cargarFallecidos.js --archivo C:/TUID/DB_Actu/pdfallet.dbf                     (solo mirar)
node --max-old-space-size=10240 scripts/cargarFallecidos.js --archivo C:/TUID/DB_Actu/pdfallet.dbf --destinos master --apply
```

Aplicar **solo en `master`** (`--destinos master`): es lo que se mantiene al dia. Antes de aplicar, `master` debe estar actualizado con el padron del mes.

## Fechas de fallecimiento en `usuario`

Si la vista previa muestra "CONFLICTO de fecha" en `usuario` (la fecha de `usuario` difiere de la del padron), la carga no las pisa. Para pasarlas a la fecha real del padron, con registro para deshacer:

```
node scripts/corregirFechaFallecidoUsuario.js --informe C:/TUID/DB_Actu/informes/fallecidos_AAAA-MM-DD_<archivo>.csv           (solo mirar)
node scripts/corregirFechaFallecidoUsuario.js --informe ... --apply --lote AAAA-MM-DD_fecha_usuario
node scripts/corregirFechaFallecidoUsuario.js --revertir AAAA-MM-DD_fecha_usuario
```

## Restaurar marcas desde un CSV o Excel

`cargarFallecidos.js` acepta un `.csv` con columnas `CUIL;FECHAFALLE` (fecha `AAAA-MM-DD`) en lugar del DBF: sirve para volver a marcar personas desde un listado. Misma mecanica: sin `--apply` solo mira; con `--destinos` se limita a una tabla.
