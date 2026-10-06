# Base de datos y guía técnica

Cómo está implementado lo que definen `docs/plan/01-tipo-de-aplicacion-y-arquitectura.md` §8 (multi-empresa) y `docs/plan/02-usuarios-roles-y-permisos.md` §8 (precios que no salen del servidor), y dónde está cada cálculo.

## Roles de PostgreSQL

| Rol | Login | Para qué |
|---|---|---|
| Dueño de las tablas (`postgres` en Supabase) | Sí | Solo aplica migraciones (`DATABASE_MIGRACIONES_URL`). La aplicación nunca lo usa. |
| `app_servidor` | Sí, `NOINHERIT`, sin `BYPASSRLS` | Conexión de la aplicación (`DATABASE_URL`). Por sí mismo no puede leer ninguna tabla. |
| `app_negocio` | No | Rol de cada transacción normal: `SET LOCAL ROLE app_negocio`. |
| `app_operativo` | No | Reservado, sin uso: las pantallas sin precios se arman con consultas que no leen precios (02 §8). |
| `app_alta` | No | Solo puede crear la fila de una empresa nueva (configuración inicial). |

Los tres roles sin login se crean en la migración `0001_seguridad_rls.sql`. `app_servidor` se crea a mano, una vez por entorno, porque lleva una clave:

```sql
create role app_servidor login noinherit nobypassrls password '<clave larga y aleatoria>';
grant app_negocio, app_operativo, app_alta to app_servidor;
```

## Conexión

- Por el pooler de Supabase en modo transacción, con el usuario `app_servidor.<ref del proyecto>` (puerto 6543) y `prepare: false` (`src/db/cliente.ts`). La conexión se crea al primer uso, así el build no necesita la variable.
- `DATABASE_POOL_MAX` (opcional, 5 por defecto) fija las conexiones por instancia; en Vercel conviene 1.
- Si la base no responde (por ejemplo, el proyecto gratuito de Supabase se pausó por una semana sin uso: el pooler contesta "tenant/user … not found"), la pantalla de ingreso muestra que el sistema no está disponible en vez de un error.

## Aislamiento por empresa

- Cada transacción hace `SET LOCAL ROLE` y `set_config('app.empresa_id', …, true)` (`src/db/transaccion.ts`).
- Toda tabla con `empresa_id` pasa por `interno.habilitar_aislamiento(tabla)`: RLS habilitada y forzada, política `aislamiento_empresa` para `app_negocio` y `app_operativo`, permisos `SELECT, INSERT, UPDATE` (y `DELETE` solo si se indica), sin permisos para `anon` y `authenticated` de Supabase y trigger de `actualizado_en`.
- Sin empresa fijada, `interno.empresa_actual()` es nulo y las políticas no devuelven filas (falla cerrada), también en una conexión reutilizada.
- La sesión se resuelve con la política `usuario_propio`: el servidor fija `app.auth_user_id` con el usuario verificado por Supabase Auth y solo puede leer esa fila de `usuario`; con ella obtiene la empresa (`src/modulos/seguridad/contexto.ts`). Para que cada pantalla y cada botón respondan rápido, ese arranque de cada transacción viaja en dos tandas a la base en lugar de siete: las consultas se mandan juntas sobre la misma conexión (postgres.js las ejecuta en orden).
- Nada depende de que el dueño de las tablas saltee RLS.

**Regla para cada migración nueva:** después de crear una tabla de negocio, llamar a `select interno.habilitar_aislamiento('<tabla>');` (con `true` como segundo argumento solo si la tabla admite borrado físico, 03 §1.5). La prueba `toda tabla con empresa_id tiene RLS habilitada, forzada y la política de aislamiento` falla si se olvida.

## Migraciones

| Archivo | Contenido |
|---|---|
| `0000_seguridad_tablas`, `0001_seguridad_rls`, `0002_funciones_search_path` | Empresa, usuarios, roles, secuencia y auditoría; roles de base y aislamiento; `search_path` fijo en las funciones internas. |
| `0003_catalogo_proveedores_clientes`, `0004_catalogo_rls` | Categorías, productos, presentaciones, proveedores, precios de compra con historial, clientes y lugares de entrega. |
| `0005_pedidos_y_precios_venta`, `0006_pedidos_rls` | Reglas de precio (extensión `btree_gist` para que no se superpongan las vigencias, RN-079), jornadas, pedidos y líneas. |
| `0007_compras_y_cuentas`, `0008_compras_rls` | Lista de compras, compras, pagos, imputaciones y libro de la cuenta de cada proveedor. |
| `0009_entregas_y_repartos`, `0010_entregas_rls` | Repartos, entregas, líneas y documentos emitidos. |
| `0011_facturacion`, `0012_facturacion_rls` | Comprobantes internos y sus entregas. |
| `0013_tablero_notas_actividad`, `0014_tablero_notas_actividad_rls` | Prioridad y responsable del pedido, notas, lecturas, actividad y ubicación del punto de salida. |
| `0015_datos_transferencia` | Alias, CBU y titular de la cuenta del proveedor, con sus checks. |
| `0016_avisos_tildes_y_dibujos`, `0017_quitar_dibujo_de_producto` | `lista_compra_item.tildado` (comprado sin anotar la compra; check: solo con estado `COMPRADO`), `actividad.para_usuario_id` (a quién va dirigido el aviso), `usuario.avisos_vistos_en` (hasta dónde vio la campanita). La 0016 también pone "Sistema Repartos" como nombre del negocio que había quedado con el nombre por defecto anterior, y creó `producto.dibujo` (un emoji elegido a mano), que la 0017 quitó: el dibujo sale siempre solo. |

- Esquema en `src/db/esquema/*.ts` (Drizzle). `pnpm db:generar --name=<nombre>` crea la migración SQL de los cambios de tablas.
- SQL que Drizzle no genera (políticas, funciones, triggers, permisos): `pnpm db:migracion-sql --name=<nombre>` crea un archivo vacío registrado en el orden de migraciones.
- Aplicar en un entorno: `pnpm db:aplicar` (usa `DATABASE_MIGRACIONES_URL` de `.env.local`).
- Desarrollo: proyecto `sistema-juan-dev` (ref `zdtbxsdgbkiaesjczgav`), con 0000 a 0017 aplicadas y registradas en `drizzle.__drizzle_migrations`. Producción será un proyecto aparte: se crea `app_servidor` y se aplican todas con `pnpm db:aplicar`.

## Lo que la base no deja cambiar

- **Libros:** `movimiento_cuenta_proveedor`, `compra_item` y `actividad` no admiten `UPDATE` (se compensan, no se editan); `actividad` además tiene el trigger `impedir_modificacion`. `auditoria` solo admite insertar y leer.
- **Documentos:** en `compra`, `pago_proveedor` e `imputacion_pago_proveedor` solo se pueden cambiar las columnas de anulación o desactivación (`GRANT UPDATE (...)` por columna). `documento_emitido` solo admite cambiar estado y anulación (y las columnas de PDF y envío, sin uso); un comprobante (`factura`), solo anulación, `exportada_en`, observaciones y su PDF (sin uso); `factura_entrega`, solo `activa`. `historial_precio_compra` solo admite completar `vigente_hasta`.
- **Pedidos:** las líneas se borran solo en `BORRADOR` (trigger `pedido_item_solo_borrador`); después se cancelan.
- **Unicidad:** una entrega vigente por cliente, punto y jornada; una entrega en un solo comprobante vigente; una imputación activa por par crédito–deuda (índices únicos parciales).
- **Mismo padre:** claves compuestas para que la presentación de una oferta sea del mismo producto, el lugar de entrega del mismo cliente y el reparto de una entrega de su misma jornada (03 §15.1). Nunca se entrega más de lo preparado (check).

## Cuentas y acceso

- **Empresa principal:** `/configuracion-inicial` crea la empresa con el id fijo `00000000-0000-4000-8000-000000000001` (`EMPRESA_PRINCIPAL_ID`). Se ofrece solo mientras esa fila no existe (`app_alta` la busca con la empresa fijada) y la clave primaria impide crearla dos veces. Al publicar en producción, hacer enseguida la configuración inicial: hasta entonces cualquiera con la dirección podría hacerla.
- **Cuentas de Supabase Auth:** las crea y administra el servidor con `SUPABASE_SECRET_KEY` (`src/lib/supabase/cuentas.ts`), detrás de la interfaz `ServicioCuentas` que las pruebas reemplazan por una simulada. La llamada a Auth es el último paso de la transacción: si falla, no queda nada a medias; si la base falla después de crear la cuenta, la cuenta se borra.
- **Nombre de usuario:** se guarda en Auth como `<usuario>@sistema-juan.interno` (dominio inexistente: nunca se envía nada; conserva el nombre anterior del sistema porque cambiarlo dejaría sin entrar a las cuentas que ya existen) y en `usuario.nombre_usuario`. El ingreso acepta el usuario solo o un correo (`src/seguridad/identificacion.ts`).
- **Pedidos de acceso:** una cuenta nueva (Google o "Crear una cuenta") genera una fila de `usuario` **inactiva** con `invitacion_enviada_en` (en el código `accesoPedidoEn`); la escribe el servidor después de verificar la cuenta. Habilitar: `activo = true`, `invitacion_aceptada_en` (`accesoAprobadoEn`) y rol ADMIN. Rechazar: se borra `invitacion_enviada_en` y se bloquea la cuenta en Auth (`src/modulos/usuarios/acceso.ts`). Las dos columnas conservan el nombre viejo para no migrar la base.

## Dónde está cada cálculo

Los cálculos son funciones puras en `src/dominio` (cubiertas al 100 % por pruebas); los casos de uso en `src/modulos` juntan los datos y graban.

| Tema | Dominio | Casos de uso |
|---|---|---|
| Dinero en pesos enteros | `dinero/decimal.ts` (`redondearPesos`; las columnas siguen en `numeric(14,2)`) | — |
| Precios de compra | `precios/compra.ts` (`compararOfertas`: mejor precio, % sobre el mejor, desactualizado) | `precios-compra/ofertas.ts` |
| Precio de venta | `precios/venta.ts` (`calcularPrecioVenta`: 7 niveles, redondeo, alertas) | `precios-venta/calculo.ts` (costos, reglas y recargos con pocas consultas) |
| Catálogo | `catalogo/productos.ts` (`dibujoDeProducto`, `grupoDeProducto`: fruta o verdura por el nombre, `codigoSugerido`, `interpretarUnidad`, `unidadSugerida`), `catalogo/categorias.ts` (categorías preelegidas, "Sin categoría", `categoriaSugerida` por el nombre, `esNinguna`), `catalogo/importacion.ts` (`filasDePlanilla`: títulos o nombres apilados; `interpretarProductos`: código, dibujo, propuestas y lo que falta, RN-155) | `catalogo/productos.ts` (`crearProductoEnTransaccion`), `catalogo/categorias.ts` (`resolverCategoria`, `ocultarCategoriasVacias`, `moverProductoDeCategoria`: RN-154), `catalogo/importacion.ts` (planilla modelo, vista previa y carga en una transacción); `src/lib/planilla.ts` escribe la planilla con listas para elegir (validación de datos) y hoja oculta, y lee .xlsx (`leerXlsx`, sin dependencias nuevas: `fflate` + expresiones regulares) y .csv (`leerCsv`) |
| Pedidos | `pedidos/carga.ts`, `pedidos/tablero.ts` (`columnaDeTarjeta`: "Comprado" con todo lo suyo comprado, "Preparando" con la entrega armada; `accionAlMover` y `porQueNoSeMueve`: qué pasa al soltar una tarjeta en cada columna —de Preparando a En camino es "SALIR"— y dónde se hace lo que no se puede) | `pedidos/pedidos.ts` (`cargarPedido` guarda en `CONFIRMADO`), `pedidos/completar.ts` (completa los `BORRADOR` con productos antes de la lista o la preparación), `pedidos/tablero.ts` |
| Lista de compras y compras | `compras/lista.ts`, `compras/credito.ts` (semáforo, límite, FIFO, costo ponderado) | `compras/lista-compra.ts`, `compras/compras.ts` (bloquea la fila del proveedor con `FOR UPDATE` y acepta `claveIdempotencia`), `compras/compra-desde-lista.ts` ("✓ Lo compré": valida la línea y el puesto y llama a `registrarCompra` con una sola línea) |
| Cuentas con proveedores | `compras/credito.ts` (`imputarFIFO`, `conciliarFIFO`, `validarImputacionManual`, `resumenVencimientos`, `libroConSaldo`), `proveedores/transferencia.ts` (alias y CBU con sus dígitos verificadores) | `compras/imputaciones.ts`, `compras/pagos.ts` (`pagarDeuda`: "Pagué esta compra"), `compras/cuenta.ts`, `compras/cuenta-corriente.ts` |
| Preparación y entregas | `entregas/entregas.ts` (`distribuirFaltante`, `evaluarPreparado`, `avisoDeFaltante`, `totalesEntrega`, `entregaConDiferencias`, `ordenarParadas`), `entregas/salida.ts` (`planDeSalida`: qué repartos salen con "Sale ahora", RN-153) | `entregas/preparacion.ts`, `entregas/entregas.ts` (`remitosDelDia`, `documentosDelDia`: los remitos del día en una consulta), `entregas/repartos.ts` (`mandarEnCamino` y `salirDeReparto` comparten `salirEnTransaccion`), `entregas/panel.ts` |
| Documentos | — | `entregas/documentos.ts`: el contenido de DOC-02 y DOC-03 se guarda en `documento_emitido.contenido` al emitir; DOC-02 se arma con `lineasOperativas`, que no lee precios (RN-124); `reemitirSiCorresponde` sube la versión cuando cambia una entrega ya emitida (RN-128); `documentosAlDiaDe` consulta de una vez si cada entrega de una lista tiene el remito al día |
| Viaje de entrega | `entregas/recorrido.ts` (mejor orden), `entregas/navegacion.ts` (enlaces al GPS) | `entregas/viaje.ts`: busca direcciones en Nominatim (OpenStreetMap, solo desde el servidor, sin datos personales) y sigue enlaces cortos de Google Maps solo si son de `goo.gl` o `google.com(.ar)` por https. El mapa para marcar ubicaciones (`app/(app)/viaje/mapa-para-marcar.tsx`) usa Leaflet (dependencia `leaflet`, cargada solo al abrir el mapa) con los mapas de `tile.openstreetmap.org` en el navegador |
| Facturación | — | `facturacion/facturacion.ts`, `facturacion/exportacion.ts`; `src/lib/planilla.ts` escribe el .xlsx (o los CSV en .zip) con `fflate`, con fecha fija en el zip para que el mismo período dé los mismos bytes |
| Cierre del día | `jornadas/resumen.ts` (probado con 04 §5.h), `jornadas/pasos.ts` (el paso a paso), `jornadas/etapas.ts` (las etapas del día en el menú) | `jornadas/cierre.ts`, `jornadas/dia.ts` (`procesoEnCurso`: el día en curso para el menú) |
| Reportes y balance | `reportes/periodos.ts` | `reportes/reportes.ts`, `reportes/balance.ts` (los importes dependen de los permisos de precios). El balance de un día es el mismo cálculo con `desde = hasta`; los gráficos son todos de barras y ocupan todo el ancho (`GraficoBarras` en `src/ui/graficos.tsx`). Excel de cada mes: `reportes/meses.ts` (qué meses se ofrecen —los últimos 24— y qué fechas abarca cada uno) y `reportes/balance-mensual.ts` (`balancesPorMes`, `libroDelMes`); `src/lib/planilla.ts` dibuja los gráficos de barras dentro del .xlsx (`Hoja.graficos`) y ajusta el ancho de las columnas |
| Notas y actividad | `colaboracion/` | `colaboracion/`: `registro.ts` escribe la actividad en la misma transacción de cada caso de uso; `entidades.ts` exige poder ver lo que nombra cada nota |
| Avisos (campanita) | `colaboracion/avisos.ts` (`agruparAvisos`: los tildes seguidos cuentan como uno; `textoDeNovedades`: el texto del cartel) | `colaboracion/avisos.ts` (`avisosPara`: actividad de los demás desde `avisos_vistos_en` + notas sin leer; `marcarAvisosVistos`). La pantalla (`app/(app)/actividad/campanita.tsx`) consulta `/avisos` cada 30 segundos y redibuja las pantallas del día con `router.refresh()` |
| Tildes de compra | `compras/lista.ts` (`estadoLineaLista` con `tildada`, `tildeSigueValiendo`) | `compras/lista-compra.ts` (`tildarLinea`, `marcarPedidoComprado`, `desmarcarPedidoComprado`, `productosTildados`, que usa la preparación para proponer lo pedido; `hojaDeListaDeCompras` arma la planilla de la lista para Excel o CSV) |
| Pedidos en Excel | `pedidos/planilla.ts` (`filasDePedidos`: encuentra los títulos y lee las filas; `leerFechaDePlanilla`; `interpretarPedidos`: arma los pedidos contra clientes y productos y explica cada fila que no entiende) | `pedidos/planilla.ts` (`revisarPlanillaDePedidos`, `importarPedidos`, `hojaDePedidos`, `planillaModelo`); `pedidos/pedidos.ts` (`cargarPedidos`: todos en una transacción); `src/lib/planilla-lectura.ts` lee la primera hoja de un .xlsx (descomprime con `fflate` y lee el XML de la hoja y de los textos compartidos) o un .csv |
| Código y dibujo del producto | `catalogo/productos.ts` (`codigoSugerido`, `dibujoDeProducto`: del nombre o del grupo, sin elegir) | `catalogo/productos.ts` (`crearProducto` arma el código si no viene) |
| Lista de productos en Excel | `catalogo/importacion.ts` (`COLUMNAS_PLANILLA`: las mismas columnas que la planilla modelo) | `catalogo/planilla.ts` (`hojaDeProductos`: la lista para bajar; la ganancia solo con `precios.ver_margenes`). La carga desde la planilla modelo está en la fila Catálogo (`catalogo/importacion.ts`). `planillas/comun.ts` (`leerTabla`, `parecido`) lo usan las planillas de pedidos |

**Cuentas con proveedores:** las deudas son compras vigentes (también las de saldo inicial) y movimientos `AJUSTE_DEBITO`; los créditos, pagos vigentes y movimientos `AJUSTE_CREDITO`. En el código se identifican con una clave (`C:`, `D:`, `P:`, `A:` + id). Las imputaciones no se editan: para sumar a una existente se desactiva y se crea otra con el total. Después de toda operación que libera deuda o crédito se aplica el saldo a favor por FIFO (RN-098), así se mantiene el invariante de 06 §2.2. La fecha que cuenta en el libro es `coalesce(fecha_origen, fecha)` en la zona de la empresa.

## Cuidado con Drizzle

En una consulta de una sola tabla Drizzle escribe las columnas sin el nombre de la tabla (`"id"`), así que dentro de una subconsulta correlacionada `${tabla.id}` apunta a la tabla de adentro. En esas subconsultas se escribe la referencia completa (`compra.id`).

## Pruebas sin Docker

- Las pruebas de integración (`tests/integracion`) usan PGlite: PostgreSQL en memoria dentro de Node, con `btree_gist` (`@electric-sql/pglite/contrib/btree_gist`). Aplican las mismas migraciones y corren como `app_servidor`, por lo que verifican RLS, permisos e inmutabilidad reales. Las migraciones usan solo SQL estándar compatible con el PostgreSQL de Supabase.
- La aceptación usa la jornada del 24/09 completa (`tests/integracion/escenario-24-09.ts`).
- **Para recorrer pantallas con datos sin tocar Supabase:** una base PostgreSQL local (o PGlite servida con `@electric-sql/pglite-socket`, `maxConnections` mayor que 1) con las migraciones, el rol `app_servidor` y datos cargados con los casos de uso; `next dev` con `DATABASE_URL` local. Para no depender de Supabase Auth, `NEXT_PUBLIC_SUPABASE_URL` puede apuntar a un servidor local mínimo que responda `/auth/v1/user` (y `/auth/v1/settings`) y la cookie `sb-localhost-auth-token` llevar una sesión con un token HS256 cuyo `sub` sea el `auth_user_id` del usuario: `getClaims` le pregunta a ese servidor. Así se recorren las pantallas con Chromium (Playwright) juntando los errores de la consola. Next 16 permite un solo `next dev` por carpeta.
