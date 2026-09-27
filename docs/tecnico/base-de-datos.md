# Base de datos: roles, aislamiento y migraciones

Cómo se implementa lo definido en `docs/plan/01-tipo-de-aplicacion-y-arquitectura.md` §11 y `docs/plan/02-usuarios-roles-y-permisos.md` §8.

## Roles de PostgreSQL

| Rol | Login | Para qué |
|---|---|---|
| Dueño de las tablas (`postgres` en Supabase) | Sí | Solo aplica migraciones (`DATABASE_MIGRACIONES_URL`). La aplicación nunca lo usa. |
| `app_servidor` | Sí, `NOINHERIT`, sin `BYPASSRLS` | Conexión de la aplicación (`DATABASE_URL`). Por sí mismo no puede leer ninguna tabla. |
| `app_negocio` | No | Rol de cada transacción normal: `SET LOCAL ROLE app_negocio`. |
| `app_operativo` | No | Rol de las pantallas y documentos sin precios (preparación, reparto; se completa en la iteración 6 con permisos por columna). |
| `app_alta` | No | Solo puede crear la fila de una empresa nueva (alta de empresa). |

Los tres roles sin login se crean en la migración `0001_seguridad_rls.sql`. `app_servidor` se crea a mano, una vez por entorno, porque lleva una clave:

```sql
create role app_servidor login noinherit nobypassrls password '<clave larga y aleatoria>';
grant app_negocio, app_operativo, app_alta to app_servidor;
```

En Supabase se conecta por el pooler en modo transacción con el usuario `app_servidor.<ref del proyecto>` (puerto 6543) y `prepare: false` (ver `src/db/cliente.ts`).

## Aislamiento por empresa

- Cada transacción hace `SET LOCAL ROLE` y `set_config('app.empresa_id', …, true)` (`src/db/transaccion.ts`).
- Toda tabla con `empresa_id` pasa por `interno.habilitar_aislamiento(tabla)`: RLS habilitada y forzada, política `aislamiento_empresa` para `app_negocio` y `app_operativo`, permisos `SELECT, INSERT, UPDATE` (y `DELETE` solo si se indica), sin permisos para `anon` y `authenticated` de Supabase y trigger de `actualizado_en`.
- Sin empresa fijada, `interno.empresa_actual()` es nulo y las políticas no devuelven filas (falla cerrada), también después de la primera transacción de una conexión reutilizada.
- La sesión se resuelve con la política `usuario_propio`: el servidor fija `app.auth_user_id` con el usuario verificado por Supabase Auth y solo puede leer esa fila de `usuario`; con ella obtiene la empresa (`src/modulos/seguridad/contexto.ts`).
- Nada depende de que el dueño de las tablas saltee RLS: la aplicación y el alta de empresas usan roles sin privilegios.

**Regla para cada migración nueva:** después de crear una tabla de negocio, llamar a `select interno.habilitar_aislamiento('<tabla>');` (con `true` como segundo argumento solo si la tabla admite borrado físico, 03 §1.5). La prueba `toda tabla con empresa_id tiene RLS habilitada, forzada y la política de aislamiento` falla si se olvida.

## Migraciones

- Esquema en `src/db/esquema/*.ts` (Drizzle). `pnpm db:generar --name=<nombre>` crea la migración SQL de los cambios de tablas.
- SQL que Drizzle no genera (políticas, funciones, triggers, permisos): `pnpm db:migracion-sql --name=<nombre>` crea un archivo vacío registrado en el orden de migraciones.
- La CI falla si el esquema cambió sin generar la migración.
- Aplicar en un entorno: `pnpm exec drizzle-kit migrate` con `DATABASE_MIGRACIONES_URL`.
- Proyecto de desarrollo `sistema-juan-dev` (ref `zdtbxsdgbkiaesjczgav`): las migraciones 0000 a 0002 se aplicaron desde la integración de Supabase (quedan registradas en `supabase_migrations.schema_migrations`, no en la tabla de Drizzle). Desde la 0003 se aplican desde la terminal con `DATABASE_MIGRACIONES_URL`; antes de la primera vez hay que registrar 0000 a 0002 en `drizzle.__drizzle_migrations` para que Drizzle no las repita. Pooler: `aws-0-sa-east-1.pooler.supabase.com`, puerto 6543.

## Configuración inicial y cuentas de usuario

- **Empresa principal:** la pantalla `/configuracion-inicial` crea la empresa con el id fijo `00000000-0000-4000-8000-000000000001` (`EMPRESA_PRINCIPAL_ID`). Se ofrece solo mientras esa fila no existe (`app_alta` la busca con la empresa fijada, sin saltear RLS) y la clave primaria impide crearla dos veces aunque dos personas lo intenten a la vez. Al publicar en producción, entrar enseguida a hacer la configuración inicial: hasta entonces cualquiera con la dirección podría hacerla.
- **Cuentas de Supabase Auth:** las crea y administra el servidor con `SUPABASE_SECRET_KEY` (`src/lib/supabase/cuentas.ts`), detrás de la interfaz `ServicioCuentas` que las pruebas reemplazan por una simulada. Desactivar un usuario también bloquea su cuenta en Auth; la llamada a Auth es el último paso de la transacción, así que si falla no queda nada a medias. Al crear, si la base falla después de crear la cuenta, la cuenta se borra.
- **Nombre de usuario:** se guarda en Auth como `<usuario>@sistema-juan.interno` (dominio inexistente: nunca se envía nada) y en `usuario.nombre_usuario`. El ingreso acepta el usuario solo o un correo (`src/seguridad/identificacion.ts`).

## Pedidos de acceso

- Una cuenta nueva (Google o "Crear una cuenta") genera una fila de `usuario` **inactiva** en la empresa principal con `invitacion_enviada_en` (en el código `accesoPedidoEn`). La escribe el servidor con la empresa fijada, después de verificar la cuenta con Supabase Auth; el navegador nunca elige la empresa.
- Habilitar: `activo = true`, `invitacion_aceptada_en` (`accesoAprobadoEn`) y rol ADMIN. Rechazar: se borra `invitacion_enviada_en` y se bloquea la cuenta en Auth.
- La cuenta ve su propio estado con la política `usuario_propio` (`src/modulos/usuarios/acceso.ts`).
- Pendiente de una migración futura: renombrar esas dos columnas a `acceso_pedido_en` / `acceso_aprobado_en`.

## Iteración 6: preparación, repartos, entregas y documentos

- Migraciones `0009_entregas_y_repartos` (tablas) y `0010_entregas_rls`: aislamiento de las 4 tablas; `documento_emitido` solo admite `UPDATE` de estado, anulación, `pdf_path`, `pdf_sha256` y `enviado_a` (lo emitido no cambia). Una entrega vigente por cliente, punto y jornada (índice único parcial); el reparto de una entrega es de su misma jornada (FK compuesta `empresa_id, jornada_id, reparto_id`); nunca se entrega más de lo preparado (check).
- Reglas puras en `src/dominio/entregas/entregas.ts` (`distribuirFaltante`, `evaluarPreparado`, `totalesEntrega`, `entregaConDiferencias`, `ordenarParadas`) y casos de uso en `src/modulos/entregas/` (preparación, documentos, repartos, entregas, panel).
- El contenido de DOC-02 y DOC-03 se guarda en `documento_emitido.contenido` al emitir y las pantallas de impresión lo dibujan desde ahí. DOC-02 se arma con `lineasOperativas`, que elige columna por columna y no lee precios (RN-124); una prueba busca importes en el contenido guardado y en la preparación.
- `reemitirSiCorresponde` sube la versión y reemite en la misma transacción cuando cambia una entrega que ya tenía documentos (RN-128).
- La prueba de aceptación usa la jornada del 24/09 completa (`tests/integracion/escenario-24-09.ts`: pedidos, lista y compras).

## Iteración 5: cuentas corrientes con proveedores

- Sin tablas nuevas: pagos, imputaciones y ajustes usan las de la iteración 4. Las deudas son compras vigentes (también las de saldo inicial) y movimientos `AJUSTE_DEBITO`; los créditos, pagos vigentes y movimientos `AJUSTE_CREDITO`. En el código se identifican con una clave (`C:`, `D:`, `P:`, `A:` + id) para repartirlos con las funciones puras de `src/dominio/compras/credito.ts` (`imputarFIFO`, `conciliarFIFO`, `validarImputacionManual`, `resumenVencimientos`, `libroConSaldo`).
- Las imputaciones no se editan: si hace falta sumar a una existente, se desactiva y se crea otra con el total (hay un índice único de imputación activa por par crédito–deuda). `src/modulos/compras/imputaciones.ts` concentra esa lógica.
- Después de toda operación que libera deuda o crédito (compra a crédito, anulación, ajuste, saldo inicial, anulación de un pago) se aplica el saldo a favor por FIFO (RN-098); así se mantiene el invariante de 06 §2.2, que verifican las pruebas.
- La fecha que cuenta en el libro es `coalesce(fecha_origen, fecha)` en la zona de la empresa: una deuda anterior o un pago cargado días después quedan en su día.
- Cuidado con Drizzle: en una consulta de una sola tabla escribe las columnas sin el nombre de la tabla (`"id"`), así que dentro de una subconsulta correlacionada `${tabla.id}` apunta a la tabla de adentro. En esas subconsultas se escribe la referencia completa (`compra.id`).
- Migraciones en Supabase: la 0000 a la 0010 se aplicaron con el conector (apply_migration, el contenido exacto de cada archivo) y se registraron en `drizzle.__drizzle_migrations` con el hash de Drizzle. Se verificó que columnas, restricciones, índices, políticas, triggers, permisos y RLS dan la misma huella (md5) que una base local migrada con Drizzle.

## Iteración 4: lista de compra, compras y cuenta de proveedores

- Migraciones `0007_compras_y_cuentas` (tablas) y `0008_compras_rls`: aislamiento de las 7 tablas; `movimiento_cuenta_proveedor` y `compra_item` sin `UPDATE` (se compensan, no se editan); en `compra`, `pago_proveedor` e `imputacion_pago_proveedor` solo se pueden cambiar las columnas de anulación o desactivación (`GRANT UPDATE (...)` por columna). `historial_precio_compra.compra_item_id` apunta al ítem que cambió el precio.
- El saldo de cada proveedor es la suma de sus movimientos (positivo = se le debe); `proveedor.saldo_actual` es una copia que se actualiza en la misma transacción. Las reglas de crédito (semáforo, límite, FIFO, costo ponderado) son funciones puras en `src/dominio/compras/credito.ts`; la lista de compra, en `src/dominio/compras/lista.ts`.
- Registrar una compra bloquea la fila del proveedor (`FOR UPDATE`) para que dos compras simultáneas no pasen el límite, y acepta una `claveIdempotencia` para no duplicarla si se reenvía el formulario.
- Para probar pantallas con datos: base local PGlite con `@electric-sql/pglite-socket` (`maxConnections` mayor que 1) y el escenario de 04 §2 cargado con los casos de uso (ver `tests/integracion/compras.test.ts`).

## Iteración 3: precios de venta y pedidos

- Migraciones `0005_pedidos_y_precios_venta` (tablas) y `0006_pedidos_rls`: extensión `btree_gist` (en el esquema `extensions` de Supabase), restricciones de exclusión `regla_precio_sin_superposicion_fijo` y `..._recargo` (RN-079), aislamiento de las 4 tablas y trigger `pedido_item_solo_borrador` (las líneas se borran solo en BORRADOR; después se cancelan).
- Las pruebas cargan `btree_gist` en PGlite (`@electric-sql/pglite/contrib/btree_gist`).
- El precio de venta lo calcula `calcularPrecioVenta` (`src/dominio/precios/venta.ts`); `src/modulos/precios-venta/calculo.ts` junta costos, reglas y recargos con pocas consultas. El costo real de la jornada (`REAL_JORNADA`) se suma cuando existan las compras (iteración 4).

## Iteración 2: catálogo, proveedores y clientes

- Migraciones `0003_catalogo_proveedores_clientes` (tablas) y `0004_catalogo_rls` (aislamiento de las 8 tablas; `historial_precio_compra` solo admite `UPDATE` de `vigente_hasta` y `actualizado_por`).
- Relaciones "del mismo padre" con claves compuestas (03 §15.1): la presentación de una oferta es del mismo producto (`(producto_id, presentacion_id)`), y el punto de entrega declara `(empresa_id, cliente_id, id)` para los pedidos.
- Las vistas `v_oferta_vigente` y `v_comparador_precios` de 03 §17 no se crearon: la consulta trae las ofertas activas y la comparación (mejor precio, % sobre el mejor, puesto, días sin actualizar) la calcula `compararOfertas` en `src/dominio/precios/compra.ts`, con pruebas sobre los números de 05 §2.1.
- Conexiones: `DATABASE_POOL_MAX` (opcional, 5 por defecto) fija las conexiones por instancia; en Vercel conviene 1.

## Pruebas sin Docker

Las pruebas de integración (`tests/integracion`) usan PGlite: PostgreSQL 18 en memoria dentro de Node. Aplican las mismas migraciones y corren como `app_servidor`, por lo que verifican RLS, permisos e inmutabilidad reales. Supabase usa PostgreSQL 17; las migraciones usan solo SQL estándar compatible con ambos.
