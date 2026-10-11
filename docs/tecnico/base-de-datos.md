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

Se crea **antes** de aplicar las migraciones: la 0023 le da permiso para leer el pulso de los cambios (`public.pulso_de_cambios()`) solo si ya existe. Si se creara después, hay que darle ese permiso a mano (`grant execute on function public.pulso_de_cambios() to app_servidor;`); sin él las pantallas no se ponen al día solas, pero todo lo demás anda.

## Conexión

- Por el pooler de Supabase en modo transacción, con el usuario `app_servidor.<ref del proyecto>` (puerto 6543) y `prepare: false` (`src/db/cliente.ts`). La conexión se crea al primer uso, así el build no necesita la variable.
- `DATABASE_POOL_MAX` (opcional, 10 por defecto) fija las conexiones por instancia. Una pantalla pide varias cosas a la vez, cada una en su transacción (el tablero con una tarjeta abierta, unas diez): con menos conexiones hacen fila en vez de salir juntas. **En Vercel no conviene bajarlo** (una misma instancia atiende varios pedidos a la vez y el pooler de Supabase reparte las conexiones reales): si la variable quedó en 1, hay que sacarla.
- Si la base no responde (por ejemplo, el proyecto gratuito de Supabase se pausó por una semana sin uso: el pooler contesta "tenant/user … not found"), la pantalla de ingreso muestra que el sistema no está disponible en vez de un error.

## Velocidad: pocas idas a la base

Lo que tarda una pantalla o un botón es, casi todo, la cantidad de **idas a la base**: desde una computadora del negocio cada ida a Supabase (São Paulo) son unos 50 ms; publicado en Vercel en la misma región, 1 a 3 ms. Por eso el código está hecho para ir pocas veces:

| Qué | Dónde | Por qué |
|---|---|---|
| Los valores van escritos dentro de la consulta, como literales de SQL | `src/db/literales.ts` | El pooler en modo transacción no admite consultas preparadas; con parámetros sueltos el driver hace dos idas por consulta y no puede mandar varias juntas. El escapado es chico y estricto (textos como `E'…'`, se rechaza el carácter nulo) y tiene sus pruebas (`tests/seguridad/literales-sql.test.ts`). |
| No se espera el `begin`, ni el `commit` de una transacción que solo leyó | `src/db/conexion.ts` (`clienteRapido`, `esDeLectura`) | El `begin` sale junto con las primeras consultas, sobre una conexión reservada. Si la transacción escribió o tomó un bloqueo (`for update`), el `commit` sí se espera. Pruebas en `tests/seguridad/conexion.test.ts`. |
| Las consultas que no dependen entre sí se mandan juntas | `Promise.all([...])` en cada caso de uso | Sobre una misma conexión viajan en un solo paquete y se responden en orden. Las pantallas del día (tablero, lista de compras, preparación, menú, campanita) salen en dos o tres idas; las subconsultas van por la fecha del día para no tener que pedir antes la jornada. Lo mismo lo que **acompaña** a una pantalla: las deudas por vencer y las notas sin leer que salen con el tablero, y el pedido, sus notas y su actividad de la tarjeta abierta (10/10/2026: antes hacían hasta 7 idas cada una, de a una consulta, y eran lo que demoraba la pantalla). |
| Los ids se generan en el servidor de la aplicación | `randomUUID()` | Así las filas que dependen de otra (un pedido y sus líneas, una compra y su movimiento) se insertan juntas, sin esperar el id. |
| El menú cambia de día sin volver a pedir la pantalla | `src/ui/dia-en-curso.ts`, `src/ui/etapas-vivas.tsx`, `app/(app)/etapas/route.ts` | Al elegir otro día, el navegador lo recuerda (`elegirDia`: la cookie `dia` y un aviso al menú) y el menú pide solo sus etapas (`/etapas?dia=`, dos idas a la base), a la vez que llega la pantalla. Antes la pantalla cargaba, guardaba el día y se volvía a pedir entera (con el menú) para que el menú se enterara: dos cargas completas por cada cambio de día. |
| El tablero no pide lo que no muestra | `jornadas/dia.ts` (`diaDeTrabajo`) | Con el tablero no se piden los importes del paso a paso, y el resumen balance usa tres consultas chicas (antes el cartel recalculaba las cuentas de todos los clientes). |

**Dos cuidados al juntar consultas:**

- Dentro de un `Promise.all`, una función `async` manda su consulta apenas se la llama (al armar el arreglo), y una consulta de Drizzle suelta recién sale cuando `Promise.all` la espera: **las funciones salen antes que las consultas sueltas**. Cuando el orden importa (por ejemplo, fijar `app.empresa_id` antes de leer), la consulta suelta se envuelve con `enOrden(...)` (`src/db/transaccion.ts`), que la manda en el lugar donde está escrita.
- Lo que valida o bloquea va antes de lo que escribe: primero el lote que lee y bloquea las filas (`for update`), después el lote que escribe.

**El pulso de los cambios** (RN-183, migración 0023): antes del `commit` de toda transacción que escribió, `clienteRapido` manda (junto con el `commit`, sin esperarlo) `nextval('interno.pulso')` dentro de un bloque que no falla nunca (`SUBIR_PULSO` en `src/db/conexion.ts`): si la secuencia no existe o el rol no puede usarla, la transacción se guarda igual. Las pantallas preguntan el número cada 5 segundos por `/pulso` (`src/modulos/colaboracion/pulso.ts`: una sola consulta como `app_servidor`, sin transacción ni cambio de rol, a la función `public.pulso_de_cambios()`, `SECURITY DEFINER`, que no lee datos del negocio) y, si cambió, se redibujan (`src/ui/pulso.tsx`). El número es uno solo para toda la base: un cambio de otra empresa también hace redibujar (con una sola empresa no importa). Además, si una consulta falló dentro de una transacción y el código siguió de largo, el `commit` termina en `ROLLBACK`: `clienteRapido` lo detecta y avisa en vez de darlo por guardado.

**Variables:** en Vercel (`VERCEL` definida) siempre se espera el `commit`, porque la función puede congelarse apenas responde. `DATABASE_TRANSACCION_SIMPLE=1` vuelve a las transacciones comunes del driver (esperando `begin` y `commit`), por si hiciera falta descartar esta capa ante un problema.

**Para que no se pierda:** `tests/integracion/velocidad.test.ts` cuenta las idas de cada paso del día (guardar un pedido, mandarlo a la lista, tildar, empezar a preparar, separar, sale ahora, entregar, anotar una compra, abrir cada pantalla) con `medirIdas` (`tests/integracion/base-de-prueba.ts`) y falla si alguno pasa de su máximo. Las consultas que viajan juntas cuentan como una ida; el `begin` no cuenta y el `commit` cuenta solo si la transacción escribió.

| Paso | Máximo de idas a la base |
|---|---|
| Abrir una transacción con su contexto (usuario, empresa, permisos) | 1 |
| El tablero del día · la lista de compras · la preparación | 2 · 3 · 3 |
| Lo que acompaña al tablero (deudas por vencer · notas sin leer) | 2 · 2 |
| La tarjeta abierta (el pedido · sus notas · su actividad) | 2 · 2 · 3 |
| Las etapas del menú de un día elegido · precios de hoy | 2 · 2 |
| Guardar la caja inicial | 4 |
| Guardar un pedido | 5 |
| Mandarlo a la lista de compras | 7 |
| Tildar un producto · pasar la tarjeta a Comprado | 4 · 5 |
| Empezar a prepararlo | 9 |
| Tildar un producto separado | 4 |
| Marcar preparado (hace el remito) | 11 |
| Sale ahora (marca preparado, hace el remito y sale el reparto) | 17 |
| Ya se entregó | 12 |
| Anotar una compra con precio y puesto | 18 |

## Aislamiento por empresa

- Cada transacción hace `SET LOCAL ROLE` y `set_config('app.empresa_id', …, true)` (`src/db/transaccion.ts`).
- Toda tabla con `empresa_id` pasa por `interno.habilitar_aislamiento(tabla)`: RLS habilitada y forzada, política `aislamiento_empresa` para `app_negocio` y `app_operativo`, permisos `SELECT, INSERT, UPDATE` (y `DELETE` solo si se indica), sin permisos para `anon` y `authenticated` de Supabase y trigger de `actualizado_en`.
- Sin empresa fijada, `interno.empresa_actual()` es nulo y las políticas no devuelven filas (falla cerrada), también en una conexión reutilizada.
- La sesión se resuelve con la política `usuario_propio`: el servidor fija `app.auth_user_id` con el usuario verificado por Supabase Auth y solo puede leer esa fila de `usuario`; con ella obtiene la empresa (`src/modulos/seguridad/contexto.ts`). Ese arranque de cada transacción viaja en una sola ida a la base: las consultas se mandan juntas sobre la misma conexión (postgres.js las ejecuta en orden).
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
| `0018_segunda_entrega_frecuentes_y_orden` | `pedido.frecuente`, `lista_compra_item.orden_manual` y el índice único `entrega_cliente_punto_jornada`, que ahora vale solo para las entregas abiertas (`BORRADOR`, `EN_PREPARACION`, `PREPARADA`): si ya salió o se entregó, el cliente puede tener otra entrega ese mismo día |
| `0019_cobros_gastos_e_ingresos`, `0020_cobros_gastos_rls` | `cobro_cliente` (lo que pagó cada cliente), `rubro_gasto` y `movimiento_extra` (gastos e ingresos generales), el enum `tipo_movimiento_extra` y `cliente.saldo_inicial` (lo que debía antes de usar el sistema, con check `>= 0`). La 0020 les pone el aislamiento por empresa y deja los cobros y los movimientos solo anulables. |
| `0021_recorrido_y_destinos`, `0022_recorrido_rls` | `destino_favorito` (lugares a los que se va seguido, con nombre propio; único entre los activos) y `parada_extra` (destinos que se suman al recorrido de un día), y `entrega.orden_en_recorrido` (el lugar de cada entrega en el recorrido del día). La 0022 les pone el aislamiento por empresa; `parada_extra` admite `DELETE` (no es un documento). |
| `0025_unidades_por_envase`, `0026_responsables_por_etapa` | Los valores `CAJON`, `CAJA`, `BOLSA`, `JAULA`, `BOLSON` y `RISTRA` del enum `unidad_medida` (un producto contado en ese envase, sin kilos) y `empresa.responsables_etapa` (jsonb, quién se encarga de cada paso). Solo agregan. |
| `0027_caja_inicial` | `jornada.caja_inicial` (la plata con la que se cuenta cada día, para el resumen balance del tablero; nula = sin cargar) con su check `>= 0`. Solo agrega. |
| `0023_pulso_de_cambios`, `0024_pulso_solo_la_app` | La secuencia `interno.pulso` (sube con cada transacción que guarda algo; la usan `app_negocio`, `app_operativo` y `app_alta`) y la función `public.pulso_de_cambios()` (`SECURITY DEFINER`, devuelve el número; 0 si nunca subió), que solo puede llamar `app_servidor`. La 0024 se la quita a `anon` y `authenticated`, los roles de la API de Supabase, que reciben solos permiso sobre toda función nueva de `public`. Sin tablas ni datos. |

- Esquema en `src/db/esquema/*.ts` (Drizzle). `pnpm db:generar --name=<nombre>` crea la migración SQL de los cambios de tablas.
- SQL que Drizzle no genera (políticas, funciones, triggers, permisos): `pnpm db:migracion-sql --name=<nombre>` crea un archivo vacío registrado en el orden de migraciones.
- Aplicar en un entorno: `pnpm db:aplicar` (usa `DATABASE_MIGRACIONES_URL` de `.env.local`).
- Desarrollo: proyecto `sistema-juan-dev` (ref `zdtbxsdgbkiaesjczgav`), con 0000 a 0027 aplicadas y registradas en `drizzle.__drizzle_migrations`. Producción será un proyecto aparte: se crea `app_servidor` y se aplican todas con `pnpm db:aplicar`.

## Lo que la base no deja cambiar

- **Libros:** `movimiento_cuenta_proveedor`, `compra_item` y `actividad` no admiten `UPDATE` (se compensan, no se editan); `actividad` además tiene el trigger `impedir_modificacion`. `auditoria` solo admite insertar y leer.
- **Documentos:** en `compra`, `pago_proveedor` e `imputacion_pago_proveedor` solo se pueden cambiar las columnas de anulación o desactivación (`GRANT UPDATE (...)` por columna). `documento_emitido` solo admite cambiar estado y anulación (y las columnas de PDF y envío, sin uso); un comprobante (`factura`), solo anulación, `exportada_en`, observaciones y su PDF (sin uso); `factura_entrega`, solo `activa`. `historial_precio_compra` solo admite completar `vigente_hasta`.
- **Cobros, gastos e ingresos:** en `cobro_cliente` y `movimiento_extra` solo se pueden cambiar el estado y las columnas de anulación (`GRANT UPDATE (...)` por columna): se anulan con motivo, no se editan. Los rubros (`rubro_gasto`) sí se editan y se desactivan.
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
| Pedidos | `pedidos/carga.ts` (`agregadosPrimero`: lo agregado pasa arriba, RN-184; `coincideBusqueda`: sin mayúsculas ni tildes y con el plural), `pedidos/tablero.ts` (`columnaParaEmpezar`: en qué columna arranca el tablero del celular; `columnaDeTarjeta`: "Comprado" con todo lo suyo comprado, "Preparando" con la entrega armada; `accionAlMover` y `porQueNoSeMueve`: qué pasa al soltar una tarjeta en cada columna —de Preparando a En camino es "SALIR"— y dónde se hace lo que no se puede) | `pedidos/pedidos.ts` (`cargarPedido` guarda en `CONFIRMADO`), `pedidos/completar.ts` (completa los `BORRADOR` con productos antes de la lista o la preparación), `pedidos/tablero.ts` |
| Lista de compras y compras | `compras/lista.ts`, `compras/credito.ts` (semáforo, límite, FIFO, costo ponderado) | `compras/lista-compra.ts`, `compras/compras.ts` (bloquea la fila del proveedor con `FOR UPDATE` y acepta `claveIdempotencia`), `compras/compra-desde-lista.ts` ("✓ Lo compré": valida la línea y el puesto y llama a `registrarCompra` con una sola línea) |
| Cuentas con proveedores | `compras/credito.ts` (`imputarFIFO`, `conciliarFIFO`, `validarImputacionManual`, `resumenVencimientos`, `libroConSaldo`), `proveedores/transferencia.ts` (alias y CBU con sus dígitos verificadores) | `compras/imputaciones.ts`, `compras/pagos.ts` (`pagarDeuda`: "Pagué esta compra"; `pagadoDesdeLaLista`: el interruptor Pagado / A cuenta de la lista de compras, RN-179), `compras/cuenta.ts`, `compras/cuenta-corriente.ts` |
| Preparación y entregas | `entregas/entregas.ts` (`distribuirFaltante`, `evaluarPreparado`, `avisoDeFaltante`, `totalesEntrega`, `entregaConDiferencias`, `ordenarParadas`), `entregas/salida.ts` (`planDeSalida`: qué repartos salen con "Sale ahora", RN-153) | `entregas/preparacion.ts`, `entregas/entregas.ts` (`remitosDelDia`, `documentosDelDia`: los remitos del día en una consulta), `entregas/repartos.ts` (`mandarEnCamino` y `salirDeReparto` comparten `salirEnTransaccion`), `entregas/panel.ts` |
| Documentos | — | `entregas/documentos.ts`: el contenido de DOC-02 y DOC-03 se guarda en `documento_emitido.contenido` al emitir (desde el 08/10/2026 también la condición de IVA del negocio y del cliente, el CUIT del cliente y el día en que se cargó el pedido; lo emitido antes no los tiene y se dibuja sin ellos, en `app/(app)/entregas/documentos-impresos.tsx`); DOC-02 se arma con `lineasOperativas`, que no lee precios (RN-124); `reemitirSiCorresponde` sube la versión cuando cambia una entrega ya emitida (RN-128); `documentosAlDiaDe` consulta de una vez si cada entrega de una lista tiene el remito al día |
| Recorrido del día (Logística) | `entregas/recorrido.ts` (mejor orden, kilómetros y minutos de cada tramo), `entregas/navegacion.ts` (enlaces al GPS) | `entregas/viaje.ts`: `viajeDelDia` trae en una sola ida a la base lo que falta llevar, el recorrido (entregas en camino y destinos extra, por `orden_en_recorrido` / `parada_extra.orden`; lo que no tiene lugar va al final) y los favoritos; busca direcciones en Nominatim (OpenStreetMap, solo desde el servidor, sin datos personales; primero adentro de Tucumán, `ZONA_DEL_NEGOCIO` en `src/dominio/entregas/ubicacion.ts`, y si no aparece nada en todo el país, RN-185) y sigue enlaces cortos de Google Maps solo si son de `goo.gl` o `google.com(.ar)` por https. `entregas/recorrido.ts` (módulo): guardar el orden, sumar, marcar y quitar destinos, favoritos. El mapa para marcar ubicaciones (`app/(app)/viaje/mapa-para-marcar.tsx`) usa Leaflet (dependencia `leaflet`, cargada solo al abrir el mapa) con los mapas de `tile.openstreetmap.org` en el navegador |
| Facturación | — | `facturacion/facturacion.ts`, `facturacion/exportacion.ts`; `src/lib/planilla.ts` escribe el .xlsx (o los CSV en .zip) con `fflate`, con fecha fija en el zip para que el mismo período dé los mismos bytes |
| Cierre del día | `jornadas/resumen.ts` (probado con 04 §5.h), `jornadas/pasos.ts` (el paso a paso), `jornadas/etapas.ts` (las etapas del día en el menú) | `jornadas/cierre.ts`, `jornadas/dia.ts` (`procesoEnCurso`: las etapas del día elegido —RN-182, la cookie `dia` de `src/ui/dia-elegido.ts`, que escribe `src/ui/recordar-dia.tsx`— o del día en curso; `diasCercanos`: hoy y los próximos 7, con los que tienen pedidos; `diasDelMes`: las marcas del calendario) |
| Resumen balance (tablero) y caja inicial | `reportes/resumen-balance.ts` (`resumenBalance`: gastos, pagado, crédito, caja inicial y por cuánto se la supera, RN-180 y RN-194) | `jornadas/caja.ts`: `resumenBalanceDelDia` (las compras del día con lo ya pagado de cada una, los gastos de la fecha y la caja; sale junto con el tablero, en la misma ida a la base), `guardarCajaInicial` (crea el día si no existía; no cambia un día cerrado) y `diasConCajaSuperada` (lo que avisa la campanita, dentro de `colaboracion/avisos.ts`) |
| Números del menú (A cobrar, A pagar) | — | `cuentas-clientes/pendientes.ts` (`pendientesDelMenu`, RN-181); `app/(app)/pendientes-del-menu.tsx` los busca aparte para no demorar la pantalla |
| Reportes y balance | `reportes/periodos.ts` | `reportes/reportes.ts`, `reportes/balance.ts` (los importes dependen de los permisos de precios). El balance de un día es el mismo cálculo con `desde = hasta`; los gráficos son todos de barras y ocupan todo el ancho (`GraficoBarras` en `src/ui/graficos.tsx`). Excel de cada mes: `reportes/meses.ts` (qué meses se ofrecen —los últimos 24— y qué fechas abarca cada uno) y `reportes/balance-mensual.ts` (`balancesPorMes`, `libroDelMes`); `src/lib/planilla.ts` dibuja los gráficos de barras dentro del .xlsx (`Hoja.graficos`) y ajusta el ancho de las columnas |
| Notas y actividad | `colaboracion/` | `colaboracion/`: `registro.ts` escribe la actividad en la misma transacción de cada caso de uso; `entidades.ts` exige poder ver lo que nombra cada nota |
| Avisos (campanita) | `colaboracion/avisos.ts` (`agruparAvisos`: los tildes seguidos cuentan como uno; `textoDeNovedades`: el texto del cartel) | `colaboracion/avisos.ts` (`avisosPara`: actividad de los demás desde `avisos_vistos_en` + notas sin leer; `marcarAvisosVistos`). La pantalla (`app/(app)/actividad/campanita.tsx`) consulta `/avisos` cada 30 segundos y cuando el pulso avisa un cambio (evento `sistema:cambio`); redibujar las pantallas lo hace `src/ui/pulso.tsx` |
| Tildes de compra | `compras/lista.ts` (`estadoLineaLista` con `tildada`, `tildeSigueValiendo`) | `compras/lista-compra.ts` (`tildarLinea`, `marcarPedidoComprado`, `desmarcarPedidoComprado`, `productosTildados`, que usa la preparación para proponer lo pedido; `hojaDeListaDeCompras` arma la planilla de la lista para Excel o CSV) |
| Pedidos en Excel | `pedidos/planilla.ts` (`filasDePedidos`: encuentra los títulos y lee las filas; `leerFechaDePlanilla`; `interpretarPedidos`: arma los pedidos contra clientes y productos y explica cada fila que no entiende) | `pedidos/planilla.ts` (`revisarPlanillaDePedidos`, `importarPedidos`, `hojaDePedidos`, `planillaModelo`); `pedidos/pedidos.ts` (`cargarPedidos`: todos en una transacción); `src/lib/planilla-lectura.ts` lee la primera hoja de un .xlsx (descomprime con `fflate` y lee el XML de la hoja y de los textos compartidos) o un .csv |
| Código y dibujo del producto | `catalogo/productos.ts` (`codigoSugerido`, `dibujoDeProducto`: del nombre o del grupo, sin elegir) | `catalogo/productos.ts` (`crearProducto` arma el código si no viene) |
| Lista de productos en Excel | `catalogo/importacion.ts` (`COLUMNAS_PLANILLA`: las mismas columnas que la planilla modelo) | `catalogo/planilla.ts` (`hojaDeProductos`: la lista para bajar; la ganancia solo con `precios.ver_margenes`). La carga desde la planilla modelo está en la fila Catálogo (`catalogo/importacion.ts`). `planillas/comun.ts` (`leerTabla`, `parecido`) lo usan las planillas de pedidos |
| Productos para revisar | `catalogo/revision.ts` (`problemasDeProducto`: sin precio de compra, ganancia negativa, precio pactado por debajo del costo) | `catalogo/revision.ts` (`productosParaRevisar`), dentro de `colaboracion/avisos.ts` (campanita) |
| Tablero: avanzar una tarjeta | `pedidos/tablero.ts` (`PASO_SIGUIENTE`, `accionAlMover`, `porQueNoSeMueve`) | `entregas/preparacion.ts` (`iniciarPreparacion` con `pedidoIds`, `separarLinea`), `entregas/entregas.ts` (`entregarPedido`), `jornadas/cierre.ts` |
| Tablero: volver una tarjeta un paso atrás | `pedidos/tablero.ts` (`PASO_ANTERIOR`; `accionAlMover` devuelve `DEJAR_DE_PREPARAR`, `VOLVER_DE_CAMINO` o `DESHACER_ENTREGA`) | `entregas/volver-atras.ts` (`volverAtras`: bloquea el pedido con `FOR UPDATE`, anula la preparación, saca la entrega del reparto o deshace la confirmación; anula el comprobante propio y acomoda el reparto), `jornadas/cierre.ts` (`reabrirJornada`) |
| Lista de compras: puesto de cada renglón, sin puesto y destildar | — | `compras/lista-compra.ts` (`elegirPuestoDeLinea`; al rearmar la lista se respeta el puesto elegido aunque no tenga precio, RN-187), `compras/sin-puesto.ts` (`proveedorSinPuesto`: el puesto genérico, RN-191), `compras/compra-desde-lista.ts` (`comprarDeLaLista` con `sinPuesto`; `destildarConCompra`: anula las compras de ese producto en el día y sus pagos propios, RN-186), `compras/pagos.ts` (`pagosDeLasCompras`: qué pagos cubren solo esas compras), `compras/compras.ts` (`anularCompraEnTransaccion`) |
| Precio sobre la marcha | — | `pedidos/pedidos.ts` (`ponerPrecioALinea`, RN-188; `recalcularPedidosPendientes` también recalcula los pedidos en proceso que tienen algo sin precio) |
| Eliminar y recuperar pedidos | — | `entregas/volver-atras.ts` (`eliminarPedido`: vuelve del reparto, deshace la preparación y cancela; `recuperarPedido`, RN-189); `colaboracion/entidades.ts` marca los pedidos cancelados para el "Deshacer" de Actividad |
| Columnas del tablero (y la de Retiro, guardada) | `pedidos/tablero.ts`: `RETIRO_A_LA_VISTA` (el interruptor, RN-195), `COLUMNAS_A_LA_VISTA`, `columnaEnCompra`, `PASO_SIGUIENTE` y `PASO_ANTERIOR` | `pedidos/tablero.ts` arma solo las columnas a la vista; la acción de mover (`app/(app)/inicio/acciones.ts`) tilda lo que faltaba (`marcarPedidoComprado`) antes de empezar a preparar un pedido que viene de la lista de compras |
| Quién se encarga de cada paso | `pedidos/responsables.ts` (`ETAPAS_CON_RESPONSABLE`, `ETAPAS_PARA_ELEGIR`, `leerResponsables`) | `configuracion/empresa.ts` (`responsablesDelNegocio`, `guardarResponsables`); el contexto de cada transacción (`seguridad/contexto.ts`) trae `responsables` en la misma ida y los avisos "para vos" salen de ahí (RN-190) |
| Envases como unidad | `catalogo/productos.ts` (`UNIDADES_ENVASE`, `envaseComoUnidad`, RN-192) | La acción del alta guiada (`app/(app)/productos/acciones.ts`) |
| Lugares mientras se escribe | `entregas/ubicacion.ts` (`lugaresDePhoton`) | `entregas/viaje.ts` (`sugerirLugares`: Photon desde el servidor, primero en Tucumán, RN-193); la pieza es `app/(app)/viaje/buscador-de-lugar.tsx` |
| Pagar eligiendo las compras | `compras/credito.ts` (`imputarFIFO`: reparte el importe entre las compras elegidas) | `compras/pagos.ts` (`registrarPago` en modo manual). La pantalla es `app/(app)/cuentas-proveedores/pago-con-deudas.tsx` |
| Validación de formularios | — | `validacion.ts` (`numeroObligatorio` corta la validación si el número falta: lo que se le encadene no corre sobre un valor vacío; `tests/seguridad/validacion.test.ts`) |
| Nuevo pedido: historial y frecuentes | — | `pedidos/carga.ts` (`historialDeCliente`, `marcarPedidoFrecuente`; las sugerencias y `ultimaVez` de cada producto salen de `datosParaCargarPedido`) |
| Lista de compras: orden a mano | — | `compras/lista-compra.ts` (`ordenarLista`) |
| Lista de compras: precio y puesto en el renglón | — | `compras/lista-compra.ts` (`obtenerListaCompra` con `paraComprar`: trae de una vez, por renglón, las compras ya anotadas, los puestos que lo venden con su precio y sus envases, y la lista de proveedores), `compras/compra-desde-lista.ts` (`comprarDeLaLista`), `precios-compra/ofertas.ts` (`actualizarOfertaPorCompra`: deja el precio en la oferta del puesto, la crea si no existía y agrega el historial, RN-059) |
| A cobrar (cuentas de clientes) | `cuentas/clientes.ts` (`repartirCobros`: lo cobrado cancela lo más viejo, salvo el cobro de una entrega en particular; `debeDesde`) | `cuentas-clientes/cuentas.ts` (`cuentasDeClientes`, `listarCuentasClientes`, `cuentaDeCliente`, `registrarCobro` —bloquea la fila del cliente con `FOR UPDATE`—, `anularCobro`, `guardarSaldoInicialDeCliente`) |
| Gastos e ingresos | — | `gastos/gastos.ts` (`gastosEIngresos`, `totalesPorRubro`, `registrarMovimientoExtra`, `anularMovimientoExtra`, `guardarRubro`, `cambiarEstadoDeRubro`; `RUBROS_PREDEFINIDOS` se crean la primera vez) |
| Balance del dinero | `reportes/dinero.ts` (`balanceDeDinero`: real, pendiente y total; `partesDe`: de un total, lo saldado y lo pendiente, para las barras) | `reportes/balance.ts` (todo el balance en un lote de consultas: suma los cobros, los pagos y los gastos e ingresos de las fechas, y lo que falta cobrar y pagar hoy, por cliente y por proveedor), `reportes/balance-mensual.ts` (las hojas "A cobrar", "A pagar" y "Gastos e ingresos" del Excel) |
| Checklist de productos | — | `pedidos/tablero.ts` (`consultasDeAvance`: las mismas consultas para todo el día o para un pedido; `lineasConAvance`: cada producto con su avance de compra y de preparación), `compras/lista-compra.ts` (`tildarLinea`), `entregas/preparacion.ts` (`separarLinea`). La pieza es `src/ui/checklist.tsx`; `app/(app)/inicio/checklist-vivo.tsx` la conecta con las acciones y muestra el tilde al instante |

**Cuentas con proveedores:** las deudas son compras vigentes (también las de saldo inicial) y movimientos `AJUSTE_DEBITO`; los créditos, pagos vigentes y movimientos `AJUSTE_CREDITO`. En el código se identifican con una clave (`C:`, `D:`, `P:`, `A:` + id). Las imputaciones no se editan: para sumar a una existente se desactiva y se crea otra con el total. Después de toda operación que libera deuda o crédito se aplica el saldo a favor por FIFO (RN-098), así se mantiene el invariante de 06 §2.2. La fecha que cuenta en el libro es `coalesce(fecha_origen, fecha)` en la zona de la empresa.

## Cuidado con Drizzle

En una consulta de una sola tabla Drizzle escribe las columnas sin el nombre de la tabla (`"id"`), así que dentro de una subconsulta correlacionada `${tabla.id}` apunta a la tabla de adentro. En esas subconsultas se escribe la referencia completa (`compra.id`).

## Pruebas sin Docker

- Las pruebas de integración (`tests/integracion`) usan PGlite: PostgreSQL en memoria dentro de Node, con `btree_gist` (`@electric-sql/pglite/contrib/btree_gist`). Aplican las mismas migraciones y corren como `app_servidor`, por lo que verifican RLS, permisos e inmutabilidad reales. Las migraciones usan solo SQL estándar compatible con el PostgreSQL de Supabase.
- La aceptación usa la jornada del 24/09 completa (`tests/integracion/escenario-24-09.ts`).
- Las pruebas de la conexión (`tests/seguridad/conexion.test.ts`) levantan PGlite detrás de un socket con `@electric-sql/pglite-socket` (dependencia de desarrollo) para probar el cliente real de postgres.js: `begin` y `commit` sin esperar, vuelta atrás ante un error y conexiones que se cortan.
- **Para recorrer pantallas con datos sin tocar Supabase:** una base PostgreSQL local (o PGlite servida con `@electric-sql/pglite-socket`, `maxConnections` mayor que 1) con las migraciones, el rol `app_servidor` y datos cargados con los casos de uso; `next dev` con `DATABASE_URL` local. Para no depender de Supabase Auth, `NEXT_PUBLIC_SUPABASE_URL` puede apuntar a un servidor local mínimo que responda `/auth/v1/user` (y `/auth/v1/settings`) y la cookie `sb-localhost-auth-token` llevar una sesión con un token HS256 cuyo `sub` sea el `auth_user_id` del usuario: `getClaims` le pregunta a ese servidor. Así se recorren las pantallas con Chromium (Playwright) juntando los errores de la consola. Next 16 permite un solo `next dev` por carpeta.
