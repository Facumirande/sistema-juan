# 07 · Reglas de negocio

> **Propósito:** reunir en un único catálogo numerado todas las reglas que el sistema debe hacer cumplir (validaciones, cálculos, controles y registros de auditoría) y la resolución de los casos borde. Cada regla tiene un número que citan el código y las pruebas.

## Contenido

1. [Cómo leer el catálogo](#1-cómo-leer-el-catálogo)
2. [Catálogo de reglas](#2-catálogo-de-reglas)
   - [2.1 Catálogo de productos](#21-catálogo-de-productos)
   - [2.2 Clientes](#22-clientes)
   - [2.3 Pedidos](#23-pedidos)
   - [2.4 Jornada](#24-jornada)
   - [2.5 Lista de compras](#25-lista-de-compras)
   - [2.6 Compras](#26-compras)
   - [2.7 Precios de compra](#27-precios-de-compra)
   - [2.8 Precios de venta](#28-precios-de-venta)
   - [2.9 Créditos y pagos a proveedores](#29-créditos-y-pagos-a-proveedores)
   - [2.10 Preparación](#210-preparación)
   - [2.11 Entregas y documentos](#211-entregas-y-documentos)
   - [2.12 Facturación](#212-facturación)
   - [2.13 Seguridad y auditoría](#213-seguridad-y-auditoría)
   - [2.14 Avisos entre las personas](#214-avisos-entre-las-personas)
   - [2.15 Cobros a clientes, gastos y balance del dinero](#215-cobros-a-clientes-gastos-y-balance-del-dinero)
3. [Casos borde y su resolución](#3-casos-borde-y-su-resolución)
4. [Parámetros configurables por empresa](#4-parámetros-configurables-por-empresa)
5. [Permisos referenciados](#5-permisos-referenciados)

---

## 1. Cómo leer el catálogo

| Efecto | Significado | Implementación esperada |
|---|---|---|
| **BLOQUEA** | La operación no se puede completar si no se cumple la regla (salvo el permiso de excepción que se indique). | Validación en el servidor (Zod + verificación en la acción/transacción); la interfaz solo anticipa el mensaje. |
| **ADVIERTE** | La operación se puede completar, pero el usuario ve un aviso claro y, cuando se indica, debe confirmar. | Respuesta del servidor con advertencias; la confirmación viaja como parámetro explícito. |
| **CALCULA** | El sistema calcula o deriva un valor automáticamente; el usuario no lo carga. | Función de dominio con pruebas unitarias. |
| **AUDITA** | Se registra en `auditoria`: usuario, fecha y hora, entidad, valores anteriores y nuevos, motivo. | Misma transacción que el cambio. |

Una regla puede tener más de un efecto (ej.: BLOQUEA + AUDITA). Las reglas se citan desde `04-procesos-y-flujos.md`, `05-precios-y-margenes.md` y `06-creditos-y-pagos.md`.

---

## 2. Catálogo de reglas

### 2.1 Catálogo de productos

| ID | Regla | Cuándo se aplica | Efecto |
|---|---|---|---|
| RN-001 | Todo producto tiene exactamente una `unidad_base` (kg, unidad, atado, maple, bandeja…). No se puede cambiar si el producto ya tiene pedidos o compras. | Alta y edición de producto | BLOQUEA |
| RN-002 | Toda presentación tiene `factor_a_base` > 0 y al menos uno de los indicadores `usable_en_compra` / `usable_en_venta`. | Alta y edición de presentación | BLOQUEA |
| RN-003 | El `factor_a_base` de una presentación usada en pedidos o compras no se modifica: se crea una presentación nueva y se desactiva la anterior. | Edición de presentación | BLOQUEA |
| RN-004b | **Código y dibujo automáticos (06/10/2026):** al crear un producto, si no se escribe un código se arma con el nombre: las 4 primeras letras de la primera palabra y la inicial de la segunda ("Tomate redondo" → `TOMA-R`), sin acentos ni palabras vacías; si ya existe se le agrega un número (`TOMA-R2`). El código sirve para buscar el producto y para identificarlo en las planillas de Excel. El dibujo del producto no se elige: sale solo de su nombre (🍅 para "tomate", 🫛 para "chaucha"…) y, si el nombre no dice nada, del grupo de su categoría (🥦 verdura, 🍎 fruta, 📦 otro). (`src/dominio/catalogo/productos.ts`) | Alta y edición de producto; toda pantalla que lo muestra | CALCULA |
| RN-004 | El nombre y el código de producto son únicos por empresa (sin distinguir mayúsculas). Calidades distintas se cargan como productos distintos ("Tomate redondo primera" / "segunda"). | Alta y edición de producto | BLOQUEA |
| RN-005 | Todo producto pertenece a una categoría. Si se elige "Ninguna", va a "Sin categoría" (RN-154). | Alta y edición de producto | BLOQUEA + CALCULA |
| RN-006 | Todo producto tiene alícuota de IVA; si no se indica, toma la de la empresa. | Alta de producto | CALCULA |
| RN-007 | Un producto desactivado no se ofrece en pedidos, compras ni listas nuevas; su historial queda intacto. Si tiene pedidos en curso, se advierte al desactivarlo. | Desactivación; carga de pedidos y compras | BLOQUEA (uso nuevo) + ADVIERTE |
| RN-008 | `cantidad_base = cantidad × factor_a_base` de la presentación elegida (o = cantidad si se carga en unidad base). Todo cálculo interno se hace en unidad base. | Pedidos, compras, entregas | CALCULA |
| RN-009 | Si el producto no admite fracción (`admite_fraccion = false`, ej. lechuga por unidad), las cantidades en unidad base son enteras; el reparto de faltantes usa paso 1 (o 0,1 si admite fracción). | Carga de cantidades; reparto de faltantes | BLOQUEA + CALCULA |
| RN-154 | Una categoría existe para la persona solo si tiene al menos un producto activo: nace al asignársela a un producto (al cargarlo, desde la planilla o al moverlo), y cuando se queda sin productos activos se oculta sola (`activo = false`); si se vuelve a usar su nombre o se reactiva uno de sus productos, reaparece la misma (con su orden y su ganancia). Hay categorías preelegidas por cómo se manipula la mercadería, con su orden de carga: Duras (1), Blandas (2), De hoja (3), Aromáticas (4), Frágiles (5), Secos (6); "Sin categoría" (99) va siempre al final y las nuevas antes de ella. | Alta, edición, movimiento, baja y reactivación de productos | CALCULA |
| RN-155 | La carga desde la planilla modelo crea solo los productos nuevos (sin repetir nombres que ya existen ni repetidos en la planilla), todos en una transacción. El código se arma solo con el nombre (o se usa el de la planilla si está libre); el dibujo sale del nombre; si la categoría o la forma de vender quedaron vacías, se proponen por el nombre (la categoría vacía sin propuesta queda "Sin categoría"; "Ninguna" la deja sin categoría). Se avisa solo lo importante que falta: cómo se vende (vacío o no reconocido) y un envase sin lo que trae; lo opcional mal escrito (ganancia) se ignora. Hasta 500 productos por vez. | Cargar productos desde una planilla | CALCULA + ADVIERTE |
| RN-159 | **Productos para revisar (07/10/2026):** se avisa en la campanita todo producto activo que no tiene precio de compra en ningún puesto, que tiene ganancia negativa, o que a algún cliente se le vende por debajo de lo que cuesta (precio pactado menor al costo, o ganancia especial negativa). Lo que compara contra el costo lo ve solo quien puede ver costos y márgenes. | Campanita | ADVIERTE | `productos.ver` (`precios.ver_costos` y `precios.ver_margenes` para los costos) | — | "A Hospital se le vende a $900 y cuesta $1.000: se pierde plata en cada venta." |
| RN-192 | **Los envases como unidad:** un producto se puede contar por **cajón, caja, bolsa, jaula, bolsón o ristra** (además de kilo, unidad, atado, maple, bandeja, docena, paquete o litro): entonces se compra y se vende en esos envases y **no hace falta decir cuántos kilos traen**. Al dar de alta un producto por kilo con un envase sin decir cuánto trae, si el envase es uno de esos el producto queda contado en ese envase (`envaseComoUnidad`, `src/dominio/catalogo/productos.ts`). Solo lo que se registra por kilo se mide en kilos. Cómo se vende un producto no se cambia después del alta. | Alta de producto, planilla de productos | CALCULA |

### 2.2 Clientes

| ID | Regla | Cuándo se aplica | Efecto |
|---|---|---|---|
| RN-010 | Un cliente necesita nombre y al menos un `punto_entrega` activo para que se le carguen pedidos. | Alta de cliente; confirmación de pedido | BLOQUEA |
| RN-011 | El identificador fiscal (CUIT/RUT), si se carga, es único por empresa. | Alta y edición de cliente | BLOQUEA |
| RN-012 | Un cliente desactivado no admite pedidos nuevos; los pedidos en curso siguen su circuito; al desactivar se listan sus pedidos futuros para decidir. | Desactivación; carga de pedidos | BLOQUEA (nuevos) + ADVIERTE |
| RN-013 | Cada cliente tiene `prioridad_faltantes` de 1 (máxima) a 5 para el reparto de faltantes; por defecto 3. | Alta de cliente; preparación | CALCULA |
| RN-014 | Cada cliente tiene periodicidad de facturación `POR_ENTREGA`, `SEMANAL`, `QUINCENAL` o `MENSUAL`; por defecto `POR_ENTREGA`. | Alta de cliente; facturación | CALCULA |
| RN-015 | Los cambios de recargo del cliente, prioridad y datos fiscales se auditan. | Edición de cliente | AUDITA |
| RN-016 | Un punto de entrega con entregas no finalizadas no se puede desactivar. | Edición de punto de entrega | BLOQUEA |

### 2.3 Pedidos

| ID | Regla | Cuándo se aplica | Efecto |
|---|---|---|---|
| RN-017 | Un pedido requiere cliente activo, punto de entrega activo de ese cliente y jornada (fecha de entrega) no `CERRADA` y con fecha ≥ hoy. Si el cliente tiene `requiere_orden_compra`, la referencia del cliente (orden de compra) es obligatoria para confirmar. | Crear y confirmar pedido | BLOQUEA |
| RN-018 | Un pedido se guarda en `CONFIRMADO` (no hay confirmación a mano) y debe tener al menos una línea no cancelada con cantidad > 0. | Confirmar | BLOQUEA |
| RN-018b | **Nunca un pedido vacío (29/09/2026):** la carga visual guarda el pedido con todos sus productos, la prioridad, el horario y la nota en una sola operación, o no guarda nada. Un pedido sin productos no se confirma ni pasa a la lista de compras, y el aviso ofrece el botón para agregarle productos. | Cargar, confirmar o armar la lista | BLOQUEA + explica cómo seguir |
| RN-018c | **Pedidos desde una planilla (06/10/2026):** una planilla de Excel (o CSV) con una fila por producto se convierte en pedidos: las filas del mismo cliente y día forman un pedido; el producto se identifica por su código o, si no hay código, por su nombre exacto (sin distinguir mayúsculas ni acentos); el cliente, por su nombre; la fecha vacía vale el día elegido al subirla; la cantidad va en la unidad del producto o en el envase de venta que se indique. Primero se revisa sin guardar: si alguna fila no se entiende (cliente o producto que no existe, cantidad que no es un número o con decimales en un producto que va por unidad, fecha pasada o día cerrado, cliente sin lugar de entrega) no se carga ningún pedido y cada problema se informa con su fila y cómo arreglarlo. Al cargar, todos los pedidos se guardan en una sola transacción y quedan como los cargados a mano (RN-018b). Que un cliente ya tenga un pedido ese día se avisa, pero no lo impide (RN-022). (`src/dominio/pedidos/planilla.ts`) | Subir una planilla de pedidos | BLOQUEA |
| RN-157 | **Pedidos frecuentes (07/10/2026):** un pedido del historial de un cliente se marca con la estrella como frecuente (`pedido.frecuente`). Al cargarle un pedido nuevo, los productos que se sugieren salen de sus pedidos frecuentes; si no marcó ninguno, de los que más pide. Son sugerencias: no se agregan solos. | Nuevo pedido | CALCULA | `pedidos.crear` | — | — |
| RN-019 | La presentación elegida en una línea debe pertenecer al producto y ser `usable_en_venta`. | Carga de línea | BLOQUEA |
| RN-020 | La `cantidad_base` de cada línea se calcula al guardar (RN-008). | Carga de línea | CALCULA |
| RN-021 | Si un producto se repite en el mismo pedido, se ofrece sumar las cantidades en una sola línea. | Carga de línea | ADVIERTE |
| RN-022 | Si el cliente ya tiene otro pedido para la misma jornada y punto de entrega, se avisa posible duplicado y se ofrece agregar las líneas al existente. Si se mantienen separados, van a la misma entrega. | Crear pedido | ADVIERTE |
| RN-023 | Sin uso: no se controla la cantidad atípica. | Carga de línea | ADVIERTE |
| RN-024 | Solo se permiten las transiciones de estado del diagrama del pedido (`04-procesos-y-flujos.md` §5.b). | Todo cambio de estado | BLOQUEA |
| RN-025 | Los pedidos `BORRADOR` y `CONFIRMADO` se modifican con `pedidos.editar`. | Modificación | BLOQUEA (sin permiso) |
| RN-026 | Un pedido `EN_COMPRA` solo se modifica con `pedidos.editar_en_curso`; la lista de compras queda marcada como desactualizada. | Modificación | BLOQUEA (sin permiso) + ADVIERTE + AUDITA |
| RN-027 | Un pedido `EN_PREPARACION` solo se modifica con `pedidos.editar_en_curso` y el cambio se traslada a la línea de la entrega (con nueva versión de documentos si ya se habían emitido). Desde `PREPARADO` el pedido no se modifica: las diferencias se registran en la entrega y los agregados se cargan como pedido complementario. | Modificación | BLOQUEA + AUDITA |
| RN-028 | Solo se cancela desde `BORRADOR`, `CONFIRMADO` o `EN_COMPRA`, con `pedidos.cancelar`; desde `CONFIRMADO` o `EN_COMPRA` el motivo es obligatorio. Lo ya comprado queda como sobrante previsto. | Cancelación | BLOQUEA + AUDITA |
| RN-029 | Un pedido cargado con la jornada en `COMPRANDO` se marca como tardío y la lista de compras queda desactualizada. | Confirmar | CALCULA + ADVIERTE |
| RN-030 | Cargar un pedido para una jornada `PREPARANDO` o `REPARTIENDO` requiere `pedidos.editar_en_curso`. | Crear y confirmar | BLOQUEA (sin permiso) + ADVIERTE |
| RN-031 | No se cargan pedidos para una jornada `CERRADA` ni para fechas pasadas; se propone la próxima jornada. | Crear pedido | BLOQUEA |
| RN-032 | Cada línea tiene precio estimado (`05-precios-y-margenes.md` §5.8), visible solo con `precios.ver_venta`; el costo, con `precios.ver_costos`; recargo y margen, con `precios.ver_margenes`. No es vinculante hasta la emisión de documentos. | Carga y confirmación | CALCULA |
| RN-033 | Duplicar un pedido crea un `BORRADOR` en la jornada elegida con las líneas de productos activos; omite los desactivados con aviso; los precios se recalculan. | Duplicar | CALCULA + ADVIERTE |
| RN-034 | Al mandar pedidos a la lista de compras (o al empezar a preparar), los que quedaron `BORRADOR` con productos se completan solos; los que no se pueden completar quedan afuera con el motivo. | Generar lista; iniciar preparación | CALCULA + ADVIERTE |
| RN-184 | **Nuevo pedido:** los productos que se van agregando al pedido pasan arriba de todo, en la lista de frecuentes y en la de todos, en el orden en que se agregaron (`agregadosPrimero` en `src/dominio/pedidos/carga.ts`); al agregar uno se borra lo escrito en el buscador. El buscador no distingue mayúsculas ni tildes y encuentra el singular escrito en plural ("tomates", "limones"). | Nuevo pedido y Cambiar productos | CALCULA |
| RN-189 | **Eliminar un pedido en proceso:** desde la tarjeta abierta se elimina un pedido en cualquier paso antes de entregarlo. Se deshace lo que se hizo con él: si salió, vuelve del reparto (RN-174); si se estaba preparando, se anula su preparación con el remito; si estaba en la lista de compras, la lista queda para recalcular. Queda `CANCELADO` con el motivo y en Actividad como "eliminó el pedido". Desde ahí (o desde su tarjeta) **se recupera**: vuelve a Pedidos (`CONFIRMADO`, o `BORRADOR` si no tiene productos) con todo lo que llevaba. Uno entregado no se elimina: antes se vuelve atrás la entrega. Con el día cerrado, tampoco. | Eliminar (`pedidos.cancelar`, y si hace falta `preparacion.registrar` o `repartos.gestionar`); recuperar (`pedidos.editar`) | BLOQUEA + AUDITA |

### 2.4 Jornada

| ID | Regla | Cuándo se aplica | Efecto |
|---|---|---|---|
| RN-035 | Hay una sola jornada por fecha y empresa; se crea automáticamente al cargar el primer pedido de esa fecha. | Crear pedido o jornada | BLOQUEA (duplicado) + CALCULA |
| RN-036 | La jornada solo avanza: `ABIERTA` → `COMPRANDO` → `PREPARANDO` → `REPARTIENDO` → `CERRADA` (única excepción: RN-041). | Cambio de estado | BLOQUEA |
| RN-037 | Pasa a `COMPRANDO` al armar la lista de compras; requiere al menos un pedido con productos. | Generar lista | BLOQUEA |
| RN-038 | Se puede empezar a preparar aunque falte comprar algo: lo que no alcanza queda como faltante y se reparte (RN-115). | Iniciar preparación | ADVIERTE |
| RN-039 | Pasa a `REPARTIENDO` automáticamente cuando sale el primer reparto. | Salida de reparto | CALCULA |
| RN-040 | Para cerrar: todas las entregas `ENTREGADA` o `ANULADA`; todos los pedidos `ENTREGADO` o `CANCELADO`; documentos de la última versión emitidos. Líneas de lista sin justificar, compras sin conciliar y márgenes negativos se advierten. | Cerrar jornada | BLOQUEA + ADVIERTE |
| RN-041 | Una jornada `CERRADA` es de solo lectura. Solo quien tenga `jornada.reabrir` puede reabrirla; cerrarla requiere `jornada.cerrar`. Se reabre desde la pantalla de cierre (con el motivo que se escriba) o con un toque desde el tablero ("🔓 Reabrir el día", que anota el motivo "Reabierto desde el tablero"); queda en `REPARTIENDO` y se audita. | Cualquier operación sobre la jornada | BLOQUEA + AUDITA |
| RN-042 | Las operaciones permitidas en cada estado de la jornada son las de la tabla de `04-procesos-y-flujos.md` §4.3. | Toda operación ligada a una jornada | BLOQUEA |
| RN-182 | **El día elegido se comparte entre pantallas:** el día que se elige en el tablero (o en la lista de compras, la preparación, los remitos o Logística) queda recordado en ese aparato por 12 horas; las demás pantallas del día abren en ese día cuando la dirección no trae otro, y las etapas del menú muestran el avance de ese día. Con ‹ › en el menú se cambia el día: el menú (el día de arriba y sus etapas) y la pantalla del día que se está mirando pasan juntos al día nuevo. **El menú cambia en el momento:** apenas se elige otro día (en la fila de días, en el calendario o con ‹ ›) muestra esa fecha y los enlaces a ese día, y pide por su cuenta solo el avance de sus etapas, sin esperar a que llegue la pantalla ni volver a pedirla entera. | Tablero, pantallas del día, menú | CALCULA |

### 2.5 Lista de compras

| ID | Regla | Cuándo se aplica | Efecto |
|---|---|---|---|
| RN-043 | La lista incluye solo líneas de pedidos `CONFIRMADO` y `EN_COMPRA` de la jornada. | Generar y regenerar | CALCULA |
| RN-044 | Necesidad por producto = Σ `cantidad_base` de esas líneas. | Generar y regenerar | CALCULA |
| RN-045 | Sin uso: no hay stock de sobrantes (la necesidad neta es la necesidad menos lo ya comprado). | — | — |
| RN-046 | Presentaciones a comprar = techo(pendiente ÷ `factor_a_base`); sobrante previsto = presentaciones × factor − pendiente. | Generar y regenerar | CALCULA |
| RN-047 | El proveedor sugerido se elige según la estrategia de costo de la empresa y el crédito disponible proyectado (`04-procesos-y-flujos.md` §5.c.2). | Generar y regenerar | CALCULA |
| RN-048 | Un producto sin oferta vigente queda en la lista como "sin proveedor / sin precio". | Generar; lista general de precios | ADVIERTE |
| RN-049 | Hay una lista vigente por jornada; regenerar crea una nueva versión, registra las diferencias y **nunca** modifica ni anula compras registradas. | Regenerar | CALCULA |
| RN-050 | Un proveedor asignado a mano y una cantidad ajustada a mano (`ajuste_manual`, con motivo) se conservan al regenerar; si la necesidad cambió, la línea se marca `necesidad_modificada`. Ajustar requiere `lista_compra.editar`. | Regenerar; edición de la lista | CALCULA + BLOQUEA (sin permiso) |
| RN-051b | **Tilde de comprado (06/10/2026):** un producto de la lista se puede tildar a mano como comprado sin anotar la compra (`lista_compra.editar`), desde la tarjeta del tablero o desde la lista; queda `COMPRADO` con `tildado = true`. Pasar una tarjeta a "Comprado" tilda todo lo suyo que estaba pendiente o parcial (lo `NO_CONSEGUIDO` queda así); devolverla saca esos tildes. El tilde es del producto en la lista del día: vale para todos los pedidos que lo llevan. Vale para lo que hacía falta cuando se puso: si al rearmar la lista hace falta más, se pierde y la línea queda marcada "cambió un pedido después de comprar". Marcar `NO_CONSEGUIDO` saca el tilde; anotar la compra por todo lo necesario lo vuelve innecesario; volver a tildar saca el aviso de que cambió un pedido. No genera compra, deuda ni costo real. Una línea comprada con su compra anotada no se destilda: se anula la compra. | Tablero, lista de compras, rearmado de la lista | CALCULA |
| RN-158 | **Orden de la lista de compras (07/10/2026):** la lista se puede ordenar a mano (arrastrando) y ese orden queda guardado para el día (`lista_compra_item.orden_manual`); lo que nunca se ordenó va al final. La compra producto por producto sigue ese orden. También se puede ver alfabética (preferencia de cada aparato). | Lista de compras | CALCULA | `lista_compra.editar` | — | — |
| RN-051 | El estado de cada línea se calcula con lo comprado (`PENDIENTE`, `PARCIAL`, `COMPRADO`, comparando con `necesidad_neta_base`); `NO_CONSEGUIDO` se marca a mano (`lista_compra.editar`) con motivo obligatorio y se revierte si luego se completa la compra. | Registro y anulación de compras; marca manual | CALCULA + BLOQUEA (sin motivo) |
| RN-052 | Si los pedidos cambiaron después de la última versión, la lista se muestra "desactualizada" (pantalla y `DOC-01`). | Cambios en pedidos | ADVIERTE |
| RN-053 | `DOC-01` muestra la fecha y hora en que se armó la lista; incluye precios solo si quien imprime tiene `precios.ver_costos` (también se puede imprimir sin precios). | Impresión | CALCULA + BLOQUEA (precios sin permiso) |
| RN-186 | **Destildar una compra anotada:** tocar ✓ en un producto que ya tiene su compra anotada (en la lista o en las tarjetas) avisa qué se anula y pide confirmar. Al confirmar se anulan las compras de ese producto en el día, con lo que se les pagó solo a ellas (también lo pagado con el interruptor de RN-179), y el producto vuelve a quedar por comprar. Una compra que además tiene otros productos no se anula desde acá: se dice cuál es y se anula desde su ficha. | Lista de compras y tarjetas (`compras.anular`) | BLOQUEA + AUDITA |
| RN-187 | **El puesto de cada renglón:** en cada renglón sin comprar se elige el puesto donde se va a comprar (o "Sin puesto", en efectivo). Si ese puesto ya lo vende, toma su último precio y su envase. Queda elegido a mano: al rearmar la lista se respeta, aunque el puesto todavía no tenga precio de ese producto. La lista se ve en orden **Manual** (arrastrando), **A-Z**, **Por puesto** (los puestos por dónde quedan en el mercado; lo que va sin puesto, al final) o **Por grupo** (por categoría). | Lista de compras (`lista_compra.editar`) | CALCULA |

### 2.6 Compras

| ID | Regla | Cuándo se aplica | Efecto |
|---|---|---|---|
| RN-054 | Una compra requiere proveedor activo, jornada no `CERRADA`, al menos un ítem, cantidades > 0 y precios ≥ 0. | Registrar compra | BLOQUEA |
| RN-055 | La presentación de cada ítem debe pertenecer al producto y ser `usable_en_compra`. | Registrar compra | BLOQUEA |
| RN-056 | Un ítem con precio $0 (bonificación) pide confirmación. | Registrar compra | ADVIERTE |
| RN-057 | `cantidad_base` = cantidad × factor; `costo_unitario_base` = precio ÷ factor (4 decimales); subtotal = cantidad × precio redondeado al peso (desde el 28/09/2026; antes, a 2 decimales); total = Σ subtotales. | Registrar compra | CALCULA |
| RN-058 | Si el precio difiere del vigente del proveedor en más del umbral de variación brusca (30 % por defecto), se pide confirmación explícita. | Registrar compra | ADVIERTE |
| RN-059 | Registrar una compra actualiza la oferta vigente del proveedor (o la crea), marca `compra_item.actualizo_precio_lista` y agrega historial con origen `COMPRA`; si el precio es igual, solo actualiza `fecha_actualizacion`. Vale igual para todas las formas de anotar una compra (la compra suelta, la compra producto por producto y "💲 Precio y puesto" en el renglón de la lista): el precio y el puesto quedan en la ficha del producto y en la del proveedor, y un puesto que todavía no vendía ese producto pasa a figurar como que lo vende. | Registrar compra | CALCULA + AUDITA |
| RN-060 | Un producto comprado sin necesidad en la lista se marca "compra sin pedido" y se suma a la lista como sobrante previsto. | Registrar compra | ADVIERTE + CALCULA |
| RN-061 | Si lo comprado de un producto supera la necesidad en más de un bulto de la presentación comprada, se destaca para revisión. | Registrar compra; conciliación | ADVIERTE |
| RN-062 | `CONTADO` genera un pago automático por el total; `CREDITO` no genera pago; `MIXTA` exige 0 < pagado en el momento < total. | Registrar compra | CALCULA + BLOQUEA |
| RN-063 | Control de límite de crédito sobre el saldo proyectado (`06-creditos-y-pagos.md` §9): superar el límite bloquea salvo `compras.exceder_limite` con motivo (queda `compra.excede_limite`, motivo y quién autorizó); quedar en `ROJO` advierte. | Registrar compra `CREDITO` o `MIXTA` | BLOQUEA + ADVIERTE + AUDITA |
| RN-064 | Una compra registrada no se edita: se corrige anulándola y anotando otra. | Edición | BLOQUEA |
| RN-065 | Anular una compra requiere `compras.anular` y motivo; genera `ANULACION_COMPRA`, libera imputaciones, recalcula lista y costo real, y revierte la oferta del proveedor si su precio vigente provenía de esa compra y no cambió después. | Anular compra | AUDITA + CALCULA |
| RN-066 | La fecha de la compra no puede ser futura; toda compra pertenece a una jornada (por defecto, la jornada en `COMPRANDO` más próxima, o la de hoy). | Registrar compra | BLOQUEA + CALCULA |
| RN-191 | **Con puesto, a cuenta; sin puesto, en efectivo:** al anotar una compra desde la lista (o producto por producto), elegir el puesto la deja **a cuenta** de entrada (se puede cambiar a pagado). Sin puesto va a un puesto genérico (el que el negocio ya tenga llamado "EFECTIVO" o "Sin puesto"; si no hay, se crea "Sin puesto (efectivo)") y queda **pagada en efectivo**: para el balance cuenta el valor, no dónde se compró. | Lista de compras, compra producto por producto | CALCULA |

### 2.7 Precios de compra

| ID | Regla | Cuándo se aplica | Efecto |
|---|---|---|---|
| RN-067 | Hay una sola oferta vigente por proveedor + producto + presentación. | Alta y edición de oferta | BLOQUEA |
| RN-068 | Todo cambio de precio de compra agrega una fila a `historial_precio_compra` (precio, costo por unidad base, variación, origen `MANUAL`/`COMPRA`/`IMPORTACION`, referencia, usuario, vigencia) y cierra la vigencia de la fila anterior; el historial no se edita. Se registra también `CAMBIO_PRECIO_COMPRA` en `auditoria`. | Toda actualización | AUDITA |
| RN-069 | Un precio sin actualizar ni confirmar hace más de N días (`dias_alerta_precio_desactualizado`, 7 por defecto) se muestra como desactualizado. | Lista general, plan de compra, costo de referencia | ADVIERTE |
| RN-070 | Un cambio de precio de compra con variación mayor al umbral (30 % por defecto) pide confirmación. | Actualización de precio | ADVIERTE |
| RN-071 | Sin uso: no hay actualización masiva por porcentaje. | Actualización masiva | BLOQUEA (sin vista previa) + AUDITA |
| RN-072 | Sin uso: no hay importación de planillas de precios. | Importación | BLOQUEA (por fila) |
| RN-073 | Cada producto tiene como máximo un proveedor preferido. | Marcar preferido | BLOQUEA |
| RN-074 | Los precios de compra y costos solo se muestran a usuarios con `precios.ver_costos`; se editan con `precios.editar_compra`. | Consultas y edición | BLOQUEA |
| RN-075 | "Confirmar sin cambios" actualiza `fecha_actualizacion` de la oferta sin cambiar el precio y sin crear historial. Una oferta marcada `disponible = false` queda fuera del mínimo y de las sugerencias. | Actualización rápida | CALCULA |

### 2.8 Precios de venta

| ID | Regla | Cuándo se aplica | Efecto |
|---|---|---|---|
| RN-076 | Precio de venta = costo de referencia × (1 + recargo ÷ 100), redondeado según la empresa. El "porcentaje de ganancia" es un recargo sobre el costo. | Todo cálculo de precio | CALCULA |
| RN-077 | Precedencia de 7 niveles: precio fijo cliente + producto; recargo cliente + producto; recargo cliente + categoría; recargo del cliente; recargo del producto; recargo de la categoría; recargo global. Siempre se muestra el origen. | Todo cálculo de precio | CALCULA |
| RN-077b | **Ganancias especiales (29/09/2026):** la pantalla de precios de venta muestra solo los clientes, productos y categorías que tienen una ganancia propia (para cambiarla o quitarla) y un botón para dársela a otro; lo demás usa la general. Las reglas de precedencia (RN-077) no cambian. | Precios de venta | CALCULA |
| RN-078 | La vigencia de las reglas se evalúa con la fecha de la jornada (fecha de entrega). | Todo cálculo de precio | CALCULA |
| RN-079 | No puede haber dos reglas del mismo tipo con vigencias superpuestas para el mismo cliente y el mismo producto (o categoría). | Alta y edición de `regla_precio` | BLOQUEA |
| RN-080 | El costo de referencia sale de la estrategia de la empresa (`PREFERIDO`, `MINIMO`, `ULTIMO_COSTO_REAL`); si la jornada ya tiene compras del producto, se usa el costo real (promedio ponderado). | Todo cálculo de precio | CALCULA |
| RN-081 | El redondeo (`empresa.redondeo_modo` `NINGUNO`/`ARRIBA`/`CERCANO`/`ABAJO` y `redondeo_multiplo`) se aplica a precios por recargo; un precio fijo se respeta exacto. | Todo cálculo de precio | CALCULA |
| RN-082 | Si la línea usa una presentación de venta, se redondea el precio de la presentación y el precio por unidad base se guarda con 4 decimales. | Todo cálculo de precio | CALCULA |
| RN-082b | **Pesos enteros (28/09/2026, pedido del usuario):** los importes (subtotales de pedidos, compras y entregas, IVA de cada línea, costos y totales) se redondean al peso, la mitad hacia arriba, y todos los precios e importes se muestran sin decimales ("$114.400"). Con redondeo `NINGUNO`, el precio también queda en pesos enteros. La base sigue guardando `numeric(14,2)` (con ,00) y los precios por unidad base con 4 decimales, que no se muestran. Los porcentajes sí llevan decimales. | Todo cálculo y toda pantalla o documento con dinero | CALCULA |
| RN-083 | El recargo se aplica sobre el costo neto de IVA; los precios de venta se expresan con o sin IVA según la configuración de la empresa. | Todo cálculo de precio | CALCULA |
| RN-084 | Un recargo menor que 0 % o mayor que 300 % pide confirmación y se audita. | Edición de recargos y reglas | ADVIERTE + AUDITA |
| RN-085 | Margen sobre venta menor al mínimo de la empresa (`margen_minimo_pct`, 15 % por defecto) genera alerta `MARGEN_BAJO`. | Cálculo de precio | ADVIERTE |
| RN-086 | Precio menor al costo genera alerta `MARGEN_NEGATIVO`; al emitir documentos se pide confirmación explícita. | Cálculo de precio; emisión | ADVIERTE |
| RN-087 | Una línea sin costo y sin precio fijo queda sin precio; no se pueden emitir los documentos de su entrega hasta resolverlo (compra, oferta u override). | Emisión de documentos | BLOQUEA |
| RN-088 | Los precios no congelados de la jornada se recalculan al registrar o anular compras del producto y al cambiar reglas, recargos u ofertas. | Eventos indicados | CALCULA |
| RN-089 | Al emitir documentos se congelan en `entrega_item` costo, recargo, origen y precio unitario; cambios posteriores de reglas o costos no alteran documentos emitidos. | Emisión de documentos | CALCULA + BLOQUEA (cambios) |
| RN-090 | Un override manual de precio requiere `precios.override_linea` y motivo; los recálculos no lo modifican. | Edición de precio de línea | BLOQUEA (sin permiso) + AUDITA |
| RN-091 | Todo cambio en reglas de precio y en recargos (cliente, producto, categoría, global) se audita. | Edición | AUDITA |
| RN-188 | **Ponerle precio sobre la marcha:** a un producto que todavía no tiene precio (recién se sabe en el mercado) se le pone desde la tarjeta abierta, en cualquier paso antes de entregarlo; queda como precio a mano de esa línea (RN-090, auditado) y el remito lo usa. El precio de compra anotado desde la lista de compras queda en el puesto y se aplica también a los pedidos que ya se están preparando y no tenían precio (`recalcularPedidosPendientes`). La tarjeta del tablero marca "💲 N sin precio" hasta que lo tienen. | Tarjeta abierta (`precios.override_linea`); compras | CALCULA + AUDITA |

### 2.9 Créditos y pagos a proveedores

| ID | Regla | Cuándo se aplica | Efecto |
|---|---|---|---|
| RN-092 | La cuenta corriente es un libro de movimientos inmutables; los errores se corrigen con movimientos compensatorios. | Todo cambio de deuda | BLOQUEA (edición) |
| RN-093 | Saldo neto = Σ importes con signo de los movimientos del proveedor. | Toda consulta de saldo | CALCULA |
| RN-094 | Tipos y signos: `SALDO_INICIAL` +, `CARGO_COMPRA` +, `PAGO` −, `ANULACION_COMPRA` −, `ANULACION_PAGO` +, `AJUSTE_DEBITO` +, `AJUSTE_CREDITO` −. | Creación de movimientos | CALCULA |
| RN-095 | Un pago requiere monto > 0, fecha no futura y medio (`EFECTIVO`, `TRANSFERENCIA`, `CHEQUE`, `TARJETA`, `OTRO`); la referencia es opcional (cheque: número, banco y fecha de cobro). | Registrar pago | BLOQUEA |
| RN-096 | La imputación por defecto es FIFO: compras con pendiente, la más antigua primero (fecha, luego número). | Registrar pago | CALCULA |
| RN-097 | En la imputación manual cada importe ≤ pendiente de la compra y la suma ≤ monto del pago. | Imputación manual | BLOQUEA |
| RN-097b | "Pagué esta compra" registra un pago de hoy por todo lo pendiente de esa compra, imputado a ella; si ya no queda nada pendiente, avisa que está pagada; el mismo toque repetido devuelve el mismo pago. | Pagar una compra | CALCULA + BLOQUEA |
| RN-097c | **Pagar eligiendo las compras:** la pantalla de pago propone todo lo que se debe (todas las compras tildadas y el importe ya cargado con su suma). Al tildar o destildar, el importe pasa a ser la suma de lo elegido; el pago se aplica justo a esas compras (imputación manual, RN-097): si se paga menos, de la más vieja de las elegidas a la más nueva; lo que se pague de más queda a favor (RN-098). Sin ninguna elegida, lo que se pague va a las más viejas (RN-096). | Registrar un pago | CALCULA |
| RN-098 | Lo no imputado de un pago es saldo a favor y se aplica automáticamente a las próximas compras a crédito (configurable). | Registrar pago y compras | CALCULA |
| RN-099 | Estado de pago de la compra: `PAGADA` si pendiente = 0; `PENDIENTE` si pagado = 0; si no, `PARCIAL`. | Toda consulta | CALCULA |
| RN-100 | Anular un pago requiere `pagos.anular` y motivo; genera `ANULACION_PAGO`, desactiva sus imputaciones y advierte si el saldo supera el límite. | Anular pago | AUDITA + ADVIERTE |
| RN-101 | Al anular una compra con pagos imputados, esas imputaciones se desactivan, los importes quedan como saldo a favor y se reimputan FIFO; si era `CONTADO`, se pregunta si el proveedor devolvió el dinero (en ese caso se anula también el pago). | Anular compra | CALCULA + AUDITA |
| RN-102 | Los ajustes de débito y crédito requieren `pagos.ajustar`, tipo, monto y motivo; pueden referenciar una compra (un ajuste de crédito con compra relacionada se imputa a ella). | Registrar ajuste | BLOQUEA + AUDITA |
| RN-103 | `limite_credito` vacío = sin límite (sin control ni semáforo); 0 = solo contado (cualquier deuda es `EXCEDIDO`). | Control de límite; semáforo | CALCULA |
| RN-104 | Semáforo por porcentaje de uso (umbrales por empresa `semaforo_amarillo_pct` y `semaforo_rojo_pct`): `VERDE` < 70 %; `AMARILLO` 70 % a < 90 %; `ROJO` 90 % a 100 %; `EXCEDIDO` > 100 %; `SIN_LIMITE` si no hay límite. | Toda consulta | CALCULA |
| RN-105 | Cambiar el límite de crédito o el plazo de pago requiere `proveedores.editar_limite` y se audita (`CAMBIO_LIMITE_CREDITO`); bajarlo por debajo del saldo actual se permite con advertencia y deja al proveedor `EXCEDIDO`. | Edición de proveedor | ADVIERTE + AUDITA |
| RN-106 | Vencimiento de una compra = fecha + `plazo_pago_dias` del proveedor, fijado al registrarla; vencida si tiene pendiente y hoy > vencimiento. | Registrar compra; consultas | CALCULA |
| RN-107 | La deuda vencida y la que vence en los próximos N días (`dias_aviso_vencimiento`, 3 por defecto) se muestran como alertas en el tablero. | Tablero; ficha del proveedor | ADVIERTE |
| RN-108 | Desactivar un proveedor con saldo ≠ 0 se advierte; desactivado no admite compras nuevas, pero sigue en el resumen de deudas y admite pagos y ajustes. | Desactivación; compras; pagos | ADVIERTE + BLOQUEA (compras) |
| RN-109 | La verificación de límite y el registro de la compra ocurren en la misma transacción con bloqueo de la fila del proveedor. | Registrar compra | BLOQUEA (concurrencia) |
| RN-108b | El alias del proveedor tiene de 6 a 20 letras, números, puntos o guiones; el CBU o CVU, 22 dígitos con sus dos dígitos verificadores correctos. Uno mal escrito no se guarda. | Alta y edición de proveedor | BLOQUEA |
| RN-110 | El saldo inicial se carga una vez por proveedor como compra de tipo `SALDO_INICIAL` (sin líneas ni jornada) más su movimiento `SALDO_INICIAL`; una segunda carga requiere ADMIN. | Puesta en marcha | BLOQUEA + AUDITA |
| RN-179 | **Pagado o a cuenta desde la lista de compras:** al final de cada renglón con compras anotadas, un interruptor dice si ya están pagadas. *Pagado* anota un pago en efectivo de hoy por lo que falta de cada compra de ese producto en el día, imputado a ella (`pagos.registrar`). *A cuenta* anula los pagos de esas compras con el motivo "quedó a cuenta desde la lista de compras" (`pagos.anular`); si un pago cubre también otras compras no se toca y se explica que se anula desde su ficha. Lo que el proveedor tenga a favor se vuelve a aplicar como en RN-098. | Lista de compras | REGISTRA + AUDITA |

### 2.10 Preparación

| ID | Regla | Cuándo se aplica | Efecto |
|---|---|---|---|
| RN-111 | Al empezar a preparar se crea una entrega por cliente + punto de entrega + jornada con pedidos `CONFIRMADO` o `EN_COMPRA` (los que quedaron sin terminar y tienen productos se completan antes); cada línea referencia su `pedido_item`. | Iniciar preparación; pedidos tardíos | CALCULA |
| RN-112 | La cantidad preparada se registra en unidad base (peso real o unidades contadas). | Preparación | CALCULA |
| RN-113 | Una diferencia entre preparado y pedido dentro de la tolerancia (3 % por defecto) no se considera diferencia; fuera de ella pide confirmación y marca la línea. | Preparación | ADVIERTE |
| RN-114 | Si lo preparado de un producto supera lo comprado se pide confirmación con motivo. | Preparación | ADVIERTE |
| RN-115b | Un producto tildado como comprado sin compra anotada (RN-051b) se toma como que alcanza: se propone preparar lo pedido, igual que cuando en el día no se anotó ninguna compra, y no se pide confirmar por preparar más de lo comprado. | Iniciar preparación, registrar lo preparado | CALCULA |
| RN-115 | Si lo disponible no alcanza, se reparte según `empresa.politica_faltantes`: `PRIORIDAD_CLIENTE` (por defecto: por prioridad del cliente y, dentro del primer grupo que no alcanza, prorrateo proporcional), `PROPORCIONAL` o `MANUAL` (`04-procesos-y-flujos.md` §5.e.1). **Ampliada (28/09/2026):** con `PRIORIDAD_CLIENTE` manda primero la prioridad del pedido que se elige en el tablero (Urgente, Normal, Sin apuro) y, dentro de cada una, la del cliente. | Preparación | CALCULA |
| RN-116 | El reparto propuesto se cambia a mano cargando otra cantidad en el cliente (preparar por cliente o por producto). | Preparación | CALCULA + AUDITA |
| RN-117 | Una sustitución requiere producto sustituto, cantidad y motivo; si el cliente no acepta sustituciones, se debe registrar quién la autorizó. El precio del sustituto se calcula con sus propias reglas. | Preparación | BLOQUEA (sin datos) + ADVIERTE |
| RN-118 | Una entrega pasa a `PREPARADA` solo si todas sus líneas tienen cantidad preparada (0 con motivo). | Marcar preparada | BLOQUEA |
| RN-119 | Las pantallas, APIs y documentos de preparación nunca devuelven precios ni costos. | Preparación | BLOQUEA |

### 2.11 Entregas y documentos

| ID | Regla | Cuándo se aplica | Efecto |
|---|---|---|---|
| RN-120 | `DOC-02` (lista de entrega sin precios) y `DOC-03` (lista contable) se emiten siempre juntos, de la misma entrega y la misma versión. | Emisión | BLOQUEA |
| RN-121 | La emisión congela los precios (RN-089) y exige que todas las líneas tengan precio (RN-087). | Emisión | BLOQUEA + CALCULA |
| RN-122 | Una entrega no pasa a `EN_REPARTO` sin documentos emitidos de su versión vigente. Un reparto sale con todas sus paradas preparadas y con sus documentos; si no se eligió quién lo hace, queda a cargo de quien lo manda a salir. | Salida del reparto | BLOQUEA |
| RN-123 | Una entrega pertenece a un solo reparto a la vez, de su misma jornada. | Armado de repartos | BLOQUEA |
| RN-124 | Las rutas y consultas de documentos y vistas sin precios no leen campos de precio ni costo (control en el servidor, no solo en la interfaz). | `DOC-02`, `DOC-04`, `DOC-07`, vistas de preparación y reparto | BLOQUEA |
| RN-125 | La confirmación exige nombre de quien recibe; la hora la registra el servidor. | Confirmar entrega | BLOQUEA |
| RN-126 | La cantidad entregada no puede superar la preparada; toda diferencia requiere `motivo_diferencia` por línea (`RECHAZO_CALIDAD`, `FALTANTE`, `NO_CONSEGUIDO`, `ERROR_PREPARACION`, `CAMBIO_CLIENTE`, `OTRO`) y detalle si es `OTRO`. | Confirmar entrega | BLOQUEA |
| RN-127 | `con_diferencias` = verdadero si alguna línea entregada difiere de la pedida fuera de la tolerancia de peso (RN-113), hubo sustitución o rechazo. | Confirmar entrega | CALCULA |
| RN-128 | Todo cambio posterior a la emisión incrementa `entrega.version` y reemite ambos documentos; las versiones anteriores quedan `REEMPLAZADO`. Las correcciones administrativas requieren `entregas.corregir`. | Corrección, sustitución, tardío, diferencias | CALCULA + AUDITA |
| RN-129 | La lista contable definitiva usa `cantidad_entregada`. | Confirmación; reemisión | CALCULA |
| RN-130 | La mercadería rechazada vuelve como devolución y se suma al sobrante de la jornada. | Confirmar entrega | CALCULA |
| RN-131 | Un REPARTIDOR ve solo los repartos asignados a él (`repartos.ver_propios`). | Consultas de reparto | BLOQUEA |
| RN-132 | Anular una entrega requiere `entregas.anular` y motivo; si está `FACTURADA`, antes se anula la factura; sus líneas se reasignan a una entrega nueva o correcta. | Anular entrega | BLOQUEA + AUDITA |
| RN-133 | Reimprimir una versión ya emitida no genera versión nueva (las reimpresiones no se registran). | Reimpresión | CALCULA |
| RN-134 | Si el cliente no recibe nada (cerrado o cancela en la puerta o después de preparado), la entrega se confirma con todas las cantidades en 0 y motivo `CAMBIO_CLIENTE` u `OTRO` con detalle; total $0. | Confirmar entrega | CALCULA |
| RN-153 | **Sale ahora** (de Preparando a En camino en un paso): las entregas de los pedidos elegidos (que ya tienen su preparación armada) se completan con lo propuesto en las líneas sin tildar solo si la persona lo confirma (motivo `FALTANTE` si va menos de lo pedido), pasan a `PREPARADA`, se emiten sus documentos si faltan (RN-121; sin precio no sale nada y se ofrece cargarlo) y salen: las que están en un reparto armado salen con ese reparto (todas sus paradas tienen que estar listas, RN-122); las sueltas se suman a ese reparto si hay uno solo entre las elegidas, o salen juntas en un reparto nuevo a cargo de quien las manda (RN-123). Todo en una transacción. Exige `repartos.gestionar` (y `preparacion.registrar` / `entregas.emitir_documentos` si hay que preparar o emitir). Las ya salidas no cambian. | Tablero (arrastrar o elegir), tarjeta abierta, preparación | BLOQUEA + CALCULA |
| RN-156 | **Avanzar desde el tablero (07/10/2026):** cada tarjeta avanza de a un paso, arrastrándola o con su botón verde: a la lista de compras, a Preparando (desde la lista de compras, lo que faltaba tildar queda como comprado, RN-195; se prepara **solo ese pedido**; si al cliente ya le salió o se le entregó lo de ese día, lo que pide después va en **otra entrega**, porque solo puede haber una entrega abierta por cliente, lugar y día), a En camino (RN-153) y a Entregados (entrega completa, sin diferencias). Lo que sale bien no muestra carteles; lo que no se puede hacer dice por qué y qué hacer. | Tablero de pedidos | CALCULA + BLOQUEA | — | Segunda entrega: `entrega` con el mismo cliente, punto y jornada. | "Este pedido todavía no salió a entregar: primero pasalo a En camino…" |
| RN-195 | **La columna Retiro está guardada por ahora (10/10/2026):** el tablero muestra Pedidos · Lista de compras · Preparando · En camino · Entregados. Un pedido con todo lo suyo comprado se queda en Lista de compras, todo tildado; al pasarlo a Preparando (arrastrándolo o con su botón verde, "✓ Comprado: a preparar") lo que le faltaba tildar queda como comprado —lo que hacía el paso a Retiro; lo marcado "no se consiguió" queda así— y empieza su preparación. Volver atrás desde Preparando lo deja en Lista de compras. Mientras está guardada no se ofrece elegir quién se encarga de Retiro (lo elegido antes se conserva). La columna vuelve con `RETIRO_A_LA_VISTA` en `src/dominio/pedidos/tablero.ts`: el resto del sistema ya la contempla. | Tablero de pedidos | CALCULA |
| RN-176 | **El recorrido del día** es una sola lista con las entregas que están en camino y los destinos que se le suman, en el orden en que se va a ir. El orden se guarda entero cada vez que se arrastra un destino o se calcula el mejor recorrido (`entrega.orden_en_recorrido` y `parada_extra.orden`, una misma numeración); lo que sale o se suma después queda al final hasta que se lo acomode. La hoja de ruta de cada reparto que está en la calle sigue ese mismo orden, y ordenar un reparto acomoda sus paradas en el recorrido del día sin mover lo demás. Con el día cerrado no se cambia. | Ordenar el recorrido (`repartos.gestionar`) | BLOQUEA |
| RN-177 | **Destinos extra y favoritos.** Al recorrido de un día se le suman destinos que no son entregas (el banco, un taller): llevan un nombre (hasta 60 letras) y la dirección o la ubicación marcada, se marcan como hechos y se pueden quitar (no son documentos). Un destino se guarda como **favorito** con el nombre que se le quiera dar; dos favoritos no llevan el mismo nombre (sin distinguir mayúsculas). Un favorito se renombra o se quita sin tocar los recorridos donde ya se usó, que conservan el nombre y el lugar con los que se sumó. | Agregar, marcar o quitar un destino; favoritos (`repartos.gestionar`) | BLOQUEA |
| RN-178 | **Quién recibió las otras veces:** al confirmar una entrega se ofrecen, para elegir con un toque, las personas (nombre y cargo) que recibieron las últimas entregas de ese cliente, de la más reciente a la más vieja (hasta 6). No cuentan las entregas marcadas desde el tablero sin decir quién recibió ni las que nadie recibió. | Confirmar entrega | CALCULA |
| RN-185 | **Mapas en Tucumán:** las direcciones se buscan primero adentro de la provincia de Tucumán (la zona del negocio, `ZONA_DEL_NEGOCIO` en `src/dominio/entregas/ubicacion.ts`) y, si ahí no aparece nada, en todo el país. El mapa para marcar un lugar arranca en el depósito si está en esa zona o, si no, en San Miguel de Tucumán. | Buscar una dirección, marcar en el mapa | CALCULA |
| RN-193 | **Buscar un lugar mientras se escribe:** al escribir una dirección (cliente nuevo, ficha del cliente, depósito, destinos y salida de Logística) aparecen, un instante después de la última tecla, los lugares que coinciden, primero dentro de Tucumán y si no en todo el país (Photon, de OpenStreetMap, consultado desde el servidor; `sugerirLugares` y `lugaresDePhoton`). Elegir uno lleva el mapa a ese lugar con el punto puesto, para afinarlo y guardarlo. Es la misma pieza en toda la aplicación y en todos los aparatos. | Marcar una ubicación | CALCULA |

### 2.12 Facturación

| ID | Regla | Cuándo se aplica | Efecto |
|---|---|---|---|
| RN-135 | Al confirmar una entrega queda registrada la venta con estado de facturación `SIN_FACTURAR`. | Confirmar entrega | CALCULA |
| RN-136 | Una factura solo incluye entregas `ENTREGADA` y `SIN_FACTURAR`, todas del mismo cliente, con total > 0. | Emitir factura | BLOQUEA |
| RN-137 | Total de la factura = Σ totales de la última versión de cada entrega incluida. | Emitir factura | CALCULA |
| RN-138 | Una entrega `FACTURADA` no se modifica ni se reemite; para corregirla se anula el comprobante. | Corrección de entrega | BLOQUEA |
| RN-139 | Anular una factura requiere `facturacion.anular` y motivo; sus entregas vuelven a `SIN_FACTURAR`. | Anular factura | AUDITA |
| RN-140 | El comprobante interno lleva la leyenda "Documento no válido como factura". | Emisión e impresión | CALCULA |
| RN-141 | "Facturar período" propone una factura por cliente según su periodicidad con las entregas pendientes del período. | Facturación periódica | CALCULA |
| RN-142 | La exportación para el contador incluye los documentos del período; los anulados figuran marcados como tales. | Exportación | CALCULA |
| RN-143 | Para clientes `POR_ENTREGA`, la factura se genera automáticamente al confirmar la entrega (configurable por empresa). | Confirmar entrega | CALCULA |

### 2.13 Seguridad y auditoría

| ID | Regla | Cuándo se aplica | Efecto |
|---|---|---|---|
| RN-144 | Toda tabla de negocio lleva `empresa_id` y se aísla con Row Level Security: ningún usuario ve datos de otra empresa. | Toda consulta y escritura | BLOQUEA |
| RN-145 | Los permisos (`modulo.accion`) se verifican en el servidor en cada acción, no solo ocultando botones. | Toda acción | BLOQUEA |
| RN-146 | La visibilidad de precios, costos y márgenes depende de los permisos `precios.ver_venta`, `precios.ver_costos` y `precios.ver_margenes`, que los roles PREPARADOR y REPARTIDOR nunca otorgan; sus pantallas se arman con consultas que no leen precios. | Toda consulta con precios | BLOQUEA |
| RN-147 | Se auditan: cambios de precios de compra, reglas y recargos, overrides, anulaciones de documentos, excesos de límite, cambios de límite, reaperturas de jornada, reimputaciones, ajustes, accesos de usuarios y cambios de configuración. | Eventos indicados | AUDITA |
| RN-148 | La auditoría no se edita ni se borra (no hay pantalla para consultarla: se lee en la base). | Consulta de auditoría | BLOQUEA |
| RN-149 | Los números de documento (PED, LC, COM, PAG, REP, ENT, FAC, COB) son correlativos por empresa y tipo, se asignan desde `secuencia` en la transacción que confirma el documento, y un documento anulado conserva su número. | Confirmación de documentos | CALCULA |
| RN-150 | Sin uso: no hay control de concurrencia; vale el último que guarda y cada cambio queda en la actividad. | Edición de pedidos, entregas, maestros | BLOQUEA |
| RN-151 | Los documentos (pedidos, compras, pagos, entregas, facturas, cobros) nunca se borran: se anulan con motivo. Los maestros (productos, clientes, proveedores) se desactivan. | Toda eliminación | BLOQUEA |
| RN-152 | Una moneda por empresa; montos con 2 decimales, precios unitarios y costos con 4 decimales internos (se muestran con 2), cantidades con 3, porcentajes con 3. | Todo cálculo y almacenamiento | CALCULA |

### 2.14 Avisos entre las personas

| ID | Regla | Cuándo se aplica | Efecto |
|---|---|---|---|
| RN-160 | Todo lo que se carga o se cambia deja un registro en `actividad` en la misma transacción (quién, qué, sobre qué), sin importes. Ese registro es el aviso para las demás personas: nadie recibe aviso de lo que hizo él mismo. | Toda alta o cambio (lista en 08 §5.13) | REGISTRA |
| RN-161 | Para cada persona es **nuevo** lo que hicieron las demás después de la última vez que abrió la campanita (`usuario.avisos_vistos_en`; la primera vez, lo de las últimas 24 horas), más las notas sin leer dirigidas a ella o a todos. Abrir la campanita deja vista la actividad; las notas siguen contando hasta que se leen. Solo se cuenta lo que la persona puede ver según sus permisos. | Campanita, consulta periódica | CALCULA |
| RN-162 | Un aviso es **para alguien en particular** cuando la acción lo nombra (`actividad.para_usuario_id`: le pasaron un pedido) o es una nota dirigida a esa persona; se destaca como "Para vos". Un aviso suelto ("pedirle algo") es una nota sobre la persona a la que va dirigido. | Asignar responsable, notas, pedir algo | REGISTRA |
| RN-163 | Varios tildes seguidos de la misma persona en la misma lista de compras se muestran como un solo aviso con la cantidad; en la base queda un registro por cada uno. | Campanita | CALCULA |
| RN-183 | **Las pantallas se ponen al día solas:** cada transacción que guarda algo sube un contador (`interno.pulso`, migración 0023). Cada pantalla abierta lo pregunta cada 5 segundos (solo con la pestaña a la vista) y, si cambió, se vuelve a dibujar con los datos nuevos y la campanita busca las novedades. No se redibuja mientras se escribe en un campo, se arrastra o se está guardando, ni hasta 1,5 segundos después de tocar algo; las pantallas de carga, pago, configuración e impresión no se redibujan solas. | Toda pantalla de la aplicación | CALCULA |
| RN-190 | **Quién se encarga de cada paso:** en la configuración se elige, de manera fija, una persona para cada parte del proceso (Pedidos, Lista de compras, Preparación, Reparto; y Retiro, cuando esa columna está a la vista, RN-195). Se ve en el encabezado de su columna del tablero y le llega un aviso **para vos** cuando le toca: al armarse la lista de compras (Lista de compras), al pasar un pedido a Retiro (con esa columna a la vista), al empezar a prepararse (Preparación) y al quedar preparado para salir (Reparto). Sin nadie elegido, no hay aviso dirigido. | Configuración (`configuracion.editar`) | REGISTRA |

### 2.15 Cobros a clientes, gastos y balance del dinero

| ID | Regla | Cuándo se aplica | Efecto |
|---|---|---|---|
| RN-164 | **A cobrar:** lo que debe un cliente = lo que debía antes de usar el sistema (`cliente.saldo_inicial`) + el importe de sus entregas `ENTREGADA` − sus cobros `REGISTRADO`. Lo entregado y no cobrado es el espejo de lo retirado y no pagado a un proveedor. Si pagó de más, la diferencia queda a su favor. | Toda consulta de la cuenta de un cliente y del balance | CALCULA |
| RN-165 | Un cobro requiere importe > 0, medio de pago (`EFECTIVO`, `TRANSFERENCIA`, `CHEQUE`, `TARJETA`, `OTRO`) y fecha no posterior a hoy. Sin importe, es **todo lo que debe** (o todo lo que falta de la entrega elegida); si ya no debe nada, avisa que está todo cobrado. El cliente queda bloqueado mientras se anota: dos toques seguidos no cobran dos veces. Lleva número correlativo `COB-`. | Anotar un cobro (`cobranzas.registrar`) | BLOQUEA + CALCULA + AUDITA |
| RN-166 | **Reparto de lo cobrado:** un cobro hecho por una entrega paga primero esa entrega; todo lo demás (y lo que sobre) cancela de lo más viejo a lo más nuevo, empezando por lo que debía de antes y siguiendo por las entregas según su día. De ahí sale el estado de cobro de cada entrega: `COBRADA`, `PARCIAL` o `PENDIENTE`. No se guarda: se calcula cada vez (`src/dominio/cuentas/clientes.ts`). | Toda consulta de la cuenta | CALCULA |
| RN-167 | Un cobro no se edita ni se borra: se anula con motivo (`cobranzas.anular`) y lo que cancelaba vuelve a quedar por cobrar. | Anular un cobro | BLOQUEA (edición) + AUDITA |
| RN-168 | Lo que un cliente debía antes de empezar a usar el sistema se carga en su cuenta (`cobranzas.registrar`); no puede ser negativo y es lo primero que cancelan sus cobros. | Puesta en marcha | BLOQUEA + AUDITA |
| RN-169 | **Gastos e ingresos generales:** cada anotación va a un rubro y lleva importe > 0, fecha no posterior a hoy y medio de pago; si el rubro se cuenta en algo (litros, km), admite además una cantidad > 0. El tipo (`GASTO` o `INGRESO`) se copia del rubro al anotar: si después cambia el rubro, lo anotado no. No se edita ni se borra: se anula con motivo (`pagos.anular`). No pasa por las compras ni por las cuentas de proveedores. | Anotar o anular (`pagos.registrar`, `pagos.anular`) | BLOQUEA + AUDITA |
| RN-170 | Los rubros se crean libremente con un dibujo y un título, como gasto o como ingreso; no puede haber dos del mismo tipo con el mismo nombre (sin distinguir mayúsculas). Se cambian y se dan de baja (dejan de ofrecerse; lo anotado queda); no se borran. La primera vez que se abre la pantalla se crean los predefinidos (Nafta —en litros—, Peajes y estacionamiento, Arreglos del vehículo, Bolsas y envases, Ayudantes y jornales, Comidas y viáticos, Café, Impuestos y servicios, Otros gastos; Venta de cajones y envases y Otros ingresos). | Rubros (`pagos.registrar`) | BLOQUEA |
| RN-171 | **Balance del dinero** (`src/dominio/reportes/dinero.ts`). **Real** (lo que ya se movió, en las fechas elegidas) = lo cobrado a clientes + otros ingresos − lo pagado a proveedores − gastos. **Pendiente** (lo que todavía no se movió pero ya se debe, a hoy) = a cobrar (RN-164) − a pagar (el saldo con los proveedores, RN-093). **Total** = real + pendiente: lo que quedaría si hoy se cobrara y se pagara todo. Los cobros, pagos, gastos e ingresos anulados no cuentan. | Balance (pantalla y Excel de cada mes) | CALCULA |
| RN-172 | **Compras y ventas, lo saldado y lo pendiente** (de las fechas elegidas). Compras: lo retirado de los proveedores = lo ya pagado + lo que quedó a pagar (crédito), en total y por proveedor. Ventas: lo entregado a los clientes = lo ya cobrado + lo que quedó a cobrar, en total y por cliente (con el reparto de RN-166). Lo saldado nunca se dibuja mayor que el total ni menor que cero. | Balance | CALCULA |
| RN-173 | **El día no se da por terminado con pedidos esperando:** como se puede preparar de a un pedido (RN-156), la preparación y el reparto del día no figuran terminados mientras quede algún pedido cargado sin empezar a preparar; "ahora toca" no pasa al cierre y lo que falta se muestra como pendiente (`src/dominio/jornadas/pasos.ts`). | Paso a paso, etapas del menú | CALCULA |
| RN-174 | **Volver una tarjeta un paso atrás** (por si se pasó de columna sin querer; de a un paso por vez). De *Preparando* a donde estaba: la preparación armada se anula con el motivo "se pasó por error" y sus pedidos vuelven a la compra (o a Pedidos, si ese día no tiene lista de compras); lo que todavía no se había empezado a separar conserva su estado (`preparacion.registrar`). De *En camino* a *Preparando*: la entrega vuelve a `PREPARADA`, con su remito, y sale del reparto; un reparto que queda sin paradas se anula solo (`repartos.gestionar`). De *Entregados* a *En camino*: la entrega deja de estar `ENTREGADA` (se borra quién recibió y lo entregado), sus pedidos vuelven a `EN_REPARTO`, el reparto que había terminado vuelve a estar en curso y el comprobante que se le hizo solo se anula; no se puede si se entregó con diferencias, si ya se anotó un cobro de esa entrega o si está en un comprobante junto con otras (`entregas.confirmar`). Nunca con el día cerrado: antes se reabre (RN-041). | Arrastrar una tarjeta hacia atrás, o "↩" en la tarjeta abierta | BLOQUEA + AUDITA |
| RN-175 | En un formulario, un número obligatorio que llega vacío o mal escrito se rechaza con su propio mensaje ("Escribí cuánto se pagó.") y corta ahí la validación: las comprobaciones que siguen (mayor que cero, no negativo) no se evalúan sobre un valor vacío. | Toda acción con importes o cantidades | BLOQUEA |
| RN-180 | **El resumen balance** (el cartel de arriba del tablero, de cada día; `src/dominio/reportes/resumen-balance.ts`). **Gastos** = lo comprado para ese día + los gastos anotados con esa fecha. **Crédito** = lo que falta pagar de esas compras (lo comprado a cuenta). **Pagado** = el resto: lo ya pagado de esas compras y los gastos de la fecha, que siempre salen de la caja. Pagado + Crédito = Gastos, siempre, en pesos enteros; pagar después una compra que estaba a cuenta la pasa de Crédito a Pagado sin cambiar los Gastos. Lo ve quien puede ver costos y pagos (`precios.ver_costos`, `pagos.ver`). | Tablero | CALCULA |
| RN-181 | **Pendientes en el menú:** junto a *A cobrar*, la cantidad de clientes que deben algo (RN-164); junto a *A pagar*, la cantidad de proveedores a los que se les debe. Sin nada pendiente no se muestra número. Cada uno, solo con el permiso de ver esa pantalla. | Menú | CALCULA |
| RN-194 | **La caja inicial del día:** la plata con la que se cuenta ese día. Se carga tocándola en el resumen balance (`pagos.registrar`), una por día (`jornada.caja_inicial`; si el día todavía no tenía nada, se crea con la caja); vacía queda sin cargar, y a un día cerrado no se le cambia. **Si los Gastos del día (RN-180) superan la caja inicial, se avisa:** el resumen balance se marca en rojo con la diferencia ("Los gastos superan la caja inicial por $X") y la campanita lo lista en **Avisos**, con su signo en rojo, para los días sin cerrar de ayer a una semana; con la pantalla tapada y el permiso dado, también como aviso del navegador. Gastar justo la caja no es superarla; sin caja cargada no hay con qué comparar y no se avisa. Un día que ya pasó y quedó sin empezar y sin ningún pedido (solo con la caja cargada) deja de ofrecerse en la fila de días. | Tablero, campanita | CALCULA + ADVIERTE |

---

## 3. Casos borde y su resolución

Datos de los ejemplos: escenario de `04-procesos-y-flujos.md` §2.

| # | Caso | Qué pasa / riesgo | Resolución | Reglas |
|---|---|---|---|---|
| 1 | **Pedido aumentado después de comprar.** El restaurante agrega 10 kg de cebolla cuando ya se compraron 4 bolsas de 20 kg (80 kg para 73 kg). | La necesidad pasa a 83 kg y faltan 3 kg. | El cambio requiere `pedidos.editar_en_curso`; la lista de compras queda desactualizada y lo avisa. Al volver a calcularla: pendiente 3 kg → 1 bolsa más. Si el comprador ya salió del mercado, se reparte lo disponible con el algoritmo de faltantes o se hace una compra adicional. | RN-026, RN-049, RN-052, RN-115 |
| 2 | **Pedido reducido o cancelado después de comprar.** La verdulería cancela sus 30 lechugas con las 9 jaulas ya compradas. | Mercadería comprada sin destino. | La cancelación (motivo obligatorio) no toca las compras; la línea sigue `COMPRADO` y el excedente pasa a sobrante previsto (40 u en total). El costo queda en el resumen de la jornada. | RN-028, RN-049 |
| 3 | **Producto no conseguido.** No hubo lechuga criolla en el mercado. | Clientes sin un producto pedido. | El comprador marca la línea `NO_CONSEGUIDO` con motivo. En preparación las líneas quedan en 0 con motivo y se ofrece sustituir (ej. mantecosa). Los documentos muestran solo lo entregado; el pedido registra el faltante. | RN-051, RN-115, RN-117 |
| 4 | **Compra mayor a lo necesario.** Se compraron 8 bolsas de papa (200 kg) de más por una oferta. | Costo sin venta asociada. | Se destaca al registrar (más de un bulto de excedente). El exceso es sobrante previsto; su costo figura en "sobrantes" del resumen del día. | RN-060, RN-061 |
| 5 | **Compra de un producto partida entre proveedores.** A tenía 10 cajones de tomate y B completó 5. | Dos precios distintos para el mismo producto. | La lista suma todo en unidad base (PARCIAL → COMPRADO). El costo real es el promedio ponderado ($925/kg). Cada compra impacta en la cuenta corriente de su proveedor. | RN-044, RN-051, RN-080 |
| 6 | **Precio de compra distinto al estimado.** B cobró el cajón $17.550 en vez de $17.100. | Precios estimados desactualizados. | Se registra el precio real; la oferta de B se actualiza con historial (+2,63 %); los precios no congelados de la jornada se recalculan con el costo real. Si la variación superara 30 %, se pediría confirmación. | RN-058, RN-059, RN-088 |
| 7 | **Precio fijo menor que el costo.** Hospital con tomate a $1.150 y costo real $1.200. | Venta a pérdida. | Se respeta el precio pactado; alerta `MARGEN_NEGATIVO` en pedido, precios de venta y resumen; al emitir se pide confirmación explícita. El reporte de alertas de margen sustenta la renegociación. Un override con permiso y motivo es posible pero excepcional. | RN-086, RN-089, RN-090 |
| 8 | **Anulación de una compra `CONTADO` ya pagada.** | El dinero ya se entregó. | Se pregunta si el proveedor devolvió el dinero. Sí → se anulan compra y pago (efecto neto 0). No → el pago queda como saldo a favor y se aplica a la próxima compra. | RN-065, RN-101 |
| 9 | **Anulación de una compra a crédito con pagos parciales imputados.** | Pagos imputados a una compra que ya no existe. | Se anulan las imputaciones; los importes quedan como saldo a favor y se reimputan FIFO a otras compras pendientes. | RN-065, RN-101 |
| 10 | **Pago mayor a la deuda.** Se pagan $200.000 con deuda de $170.000. | Saldo negativo. | Los $30.000 quedan como saldo a favor; el disponible supera el límite; se aplican automáticamente a la próxima compra a crédito (`06-creditos-y-pagos.md` §12, pasos 11 y 12). | RN-097b | "Pagué esta compra" registra un pago de hoy por todo lo pendiente de esa compra, imputado a ella; si ya no queda nada pendiente, avisa que está pagada; el mismo toque repetido devuelve el mismo pago. | Pagar una compra | CALCULA + BLOQUEA |
| RN-098 |
| 11 | **Rechazo parcial en la entrega.** La verdulería rechaza 4 kg de tomate golpeado. | Documentos emitidos con cantidades que no se entregaron. | El repartidor registra 50 kg entregados y motivo `RECHAZO_CALIDAD` ("4 kg golpeados"); versión 2 de `DOC-02` y `DOC-03` con la cantidad entregada ($222.770 en vez de $227.410); los 4 kg vuelven como devolución. | RN-126, RN-128, RN-129, RN-130 |
| 12 | **Rechazo total o cliente cerrado.** | Mercadería vuelve completa. | Se confirma la entrega con todas las cantidades en 0 y motivo `OTRO` con detalle "cliente cerrado"; total $0, no se factura. Si el cliente la quiere otro día: nuevo pedido (duplicar). | RN-134, RN-136 |
| 13 | **Cliente con dos pedidos el mismo día para el mismo punto.** El hospital pide a la mañana y agrega a la tarde. | Duplicados o dos remitos. | Aviso de posible duplicado al cargar el segundo. Ambos pedidos van a la misma entrega: un solo `DOC-02` y un solo `DOC-03`, con una línea por producto (se suman las cantidades); en el sistema cada `entrega_item` conserva su pedido de origen. | RN-022, RN-111 |
| 14 | **Cliente con dos pedidos el mismo día para distintos puntos** (cocina central y cocina de pediatría). | — | Dos entregas y dos juegos de documentos, uno por punto. En la facturación ambas entregas pueden ir en la misma factura (mismo cliente). | RN-111, RN-136 |
| 15 | **Cambio de recargo después de emitir documentos.** El 25/09 se sube el tomate de 25 % a 30 %. | ¿Cambian los remitos emitidos? | No: los precios quedaron congelados en `entrega_item`. El nuevo recargo afecta a precios no congelados. Si se quiere aplicar a una entrega ya emitida y sin facturar, se hace override por línea con motivo, que genera nueva versión. | RN-089, RN-090, RN-091 |
| 16 | **Proveedor desactivado con deuda.** | Deuda "oculta". | Se advierte al desactivar. No admite compras nuevas, pero sigue en el resumen de deudas, en las alertas de vencimiento y admite pagos y ajustes hasta saldo 0. | RN-108 |
| 17 | **Producto sin precio de ningún proveedor.** Producto nuevo (ej. kale) pedido por el restaurante. | No se puede calcular el precio. | Lista de compras con "sin proveedor / sin precio"; el pedido se guarda con alerta `SIN_PRECIO`. Al registrar la compra aparece el costo real y el precio se calcula solo. Si no se compró ni hay precio fijo, no se pueden emitir documentos hasta cargar oferta u override. | RN-048, RN-087, RN-088 |
| 18 | **Límite de crédito bajado por debajo del saldo actual.** Límite de $500.000 a $400.000 con saldo $470.000. | Proveedor en exceso sin haber comprado. | Se permite con advertencia ("quedará EXCEDIDO, 117,5 %") y se audita. Nuevas compras a crédito bloqueadas salvo permiso; contado y pagos normales. | RN-105, RN-063 |
| 19 | **Pedido para una jornada ya cerrada.** | Registro en un día cerrado. | Bloqueado; se propone la próxima jornada. Si la mercadería ya se entregó ese día fuera del sistema, el ADMIN reabre la jornada con motivo, carga el pedido y la entrega, y vuelve a cerrar. | RN-031, RN-041 |
| 20 | **Pedido tardío con la preparación ya iniciada.** | La mercadería puede no alcanzar. | Requiere `pedidos.editar_en_curso`; el sistema indica si alcanza con el sobrante previsto. Se suma a la entrega del cliente si no salió (con nueva versión si ya tenía documentos) o se crea una entrega nueva en la misma jornada. | RN-030, RN-111, RN-128 |
| 21 | **Peso real distinto del pedido.** Pedido 36 kg, balanza 36,4 kg. | ¿Qué se cobra? | Dentro de la tolerancia (3 %) no es diferencia; se registra y se cobra el peso real (36,4 kg). Fuera de tolerancia se pide confirmación y la línea queda marcada. | RN-112, RN-113, RN-129 |
| 22 | **Sustitución de producto.** Lechuga mantecosa por criolla. | Cliente que no aceptó el cambio. | Sustitución con motivo; si el cliente no acepta sustituciones se registra quién la autorizó. El sustituto se cobra con su propio precio y los documentos dicen "en reemplazo de…". | RN-117 |
| 23 | **Precio de compra mal tipeado** ($1.620 en vez de $16.200). | Costo real y precios de venta erróneos. | La confirmación por variación brusca lo detecta al cargar. Si se registró igual: se anula y se anota de nuevo; la oferta del proveedor vuelve al precio anterior. | RN-058, RN-064, RN-065 |
| 24 | **Compra registrada al proveedor equivocado.** | Deuda asignada a otro proveedor. | Anular con motivo y registrar con el proveedor correcto; los movimientos compensatorios dejan bien ambas cuentas. | RN-064, RN-065, RN-092 |
| 25 | **Faltante: se compró menos de lo necesario.** 84 lechugas para 98 pedidas. | ¿Quién se queda sin? | Reparto por prioridad (hospital completo) y prorrateo en el grupo siguiente (restaurante 14, verdulería 22); ajustable a mano. | RN-115, RN-116 |
| 26 | **Error detectado en una entrega ya facturada.** | Factura con datos incorrectos. | La entrega no se modifica: se anula la factura con motivo, se corrige la entrega (nueva versión) y se vuelve a facturar. | RN-138, RN-139 |
| 27 | **Precio fijo que vence sin renovarse.** La licitación vence el 28/02. | El precio salta sin aviso. | Alerta `PRECIO_FIJO_POR_VENCER` 15 días antes. Desde el 01/03 rige el siguiente nivel de la cascada (ej. recargo del cliente) y el origen lo muestra. | RN-077, RN-078 |
| 28 | **Dos usuarios editan el mismo pedido a la vez.** | Un cambio pisa al otro. | No hay bloqueo: vale el último que guarda. Cada cambio queda en el historial del pedido (actividad) con el nombre de quien lo hizo. | RN-150 |
| 30 | **Compra en una presentación distinta de la sugerida.** Cajón 18 kg en vez de bolsa 20 kg. | — | Sin problema: la conciliación y el costo real se calculan en unidad base. | RN-044, RN-057 |
| 31 | **Cliente desactivado con pedidos futuros.** | Pedidos de un cliente que ya no se atiende. | Al desactivar se listan sus pedidos futuros para cancelarlos con motivo o mantenerlos; los que están en curso siguen. | RN-012 |
| 32 | **Cheque rechazado.** | Deuda que parecía pagada. | Se anula el pago con motivo "cheque rechazado": las compras vuelven a pendientes y el saldo sube. Gastos bancarios que cobre el proveedor: ajuste de débito. | RN-100, RN-102 |
| 33 | **El cliente cancela después de iniciada la preparación.** | Un pedido `EN_PREPARACION` o posterior no pasa a `CANCELADO` (estados de `PARAMETROS-DEL-PROYECTO.md` §6). | Se confirma la entrega con cantidades 0 y motivo `CAMBIO_CLIENTE` (total $0); la mercadería vuelve como sobrante. Decidido así (D-05). | RN-027, RN-134 |
| 34 | **Producto desactivado con pedidos en curso.** | — | Los pedidos en curso siguen normalmente; no se puede agregar a pedidos ni compras nuevas; duplicar un pedido lo omite con aviso. | RN-007, RN-033 |
| 35 | **Dos compradores registran compras al mismo proveedor a la vez.** | Ambas pasan el control de límite por separado y juntas lo superan. | Verificación y registro en la misma transacción con bloqueo de la fila del proveedor: la segunda compra ve el saldo actualizado. | RN-109 |
| 36 | **Compra adicional después de emitir documentos de algunas entregas.** | El costo real cambia a mitad de la jornada. | Los precios ya congelados no cambian; las entregas aún no emitidas usan el nuevo costo real. Puede haber dos precios por recargo para el mismo producto en la jornada; el reporte de margen por entrega usa el costo congelado y el resumen del día usa el costo real final. | RN-088, RN-089 |
| 37 | **Mercadería que llega después del cierre de la jornada.** El proveedor la trajo al día siguiente. | Compra sin jornada abierta. | Se registra en la jornada siguiente como compra sin pedido; si correspondía a la jornada cerrada, el ADMIN puede reabrirla. | RN-041, RN-060 |
| 38 | **Se usa sobrante del día anterior para un pedido** (sin stock). Quedaban 10 kg de papa. | Lo preparado supera lo comprado. | Se compra menos; en preparación se registra la cantidad real y el sistema pide confirmar "preparado mayor a comprado" con motivo "sobrante anterior". La línea de la lista se justifica al cierre. | RN-114, RN-040 |


---

## 4. Parámetros configurables por empresa

Todos los parámetros son campos de `empresa` (`03-modelo-de-datos.md` §4.1) con el nombre y el valor por defecto indicados; los valores por defecto están en `PARAMETROS-DEL-PROYECTO.md` §11 y se cambian en Configuración. La empresa de los ejemplos usa recargo global 25 % y redondeo `ARRIBA` a $10.

| Parámetro | Campo | Valor por defecto | Reglas que lo usan |
|---|---|---|---|
| Moneda | `moneda` | `ARS` | RN-152 |
| Hora de corte de pedidos | `hora_corte_pedidos` | Vacío (opcional); ejemplos: 20:00 del día anterior | RN-029 |
| Estrategia de costo de referencia | `estrategia_costo` | `PREFERIDO` | RN-047, RN-080 |
| Recargo global | `recargo_global` | 30 % | RN-077 |
| Redondeo: modo y múltiplo | `redondeo_modo`, `redondeo_multiplo` | `CERCANO`, $1 | RN-081, RN-082 |
| Margen mínimo (sobre venta) | `margen_minimo_pct` | 15 % | RN-085 |
| Precios de venta con IVA incluido | `precios_incluyen_iva` | No | RN-083 |
| Alícuota de IVA por defecto | `alicuota_iva_default` | 0 % | RN-006 |
| Días para precio desactualizado | `dias_alerta_precio_desactualizado` | 7 | RN-069 |
| Umbrales del semáforo | `semaforo_amarillo_pct`, `semaforo_rojo_pct` | 70 %, 90 % | RN-104 |
| Días de aviso "por vencer" | `dias_aviso_vencimiento` | 3 | RN-107 |
| Política de faltantes | `politica_faltantes` | `PRIORIDAD_CLIENTE` | RN-115 |
| Imputación de pagos por defecto | `imputacion_pagos_default` | `FIFO` | RN-096 |
| Módulos habilitados (stock, cobranzas…) | `modulos_habilitados` | Ninguno | RN-045 |
| Precios de compra con IVA incluido | `precios_compra_incluyen_iva` | No | RN-083 |
| Variación brusca de precio | `variacion_brusca_pct` | 30 % | RN-058, RN-070 |
| Preferido caro (aviso) | `preferido_caro_pct` | 10 % | `05-precios-y-margenes.md` §2.4 |
| Aviso de vencimiento de precio fijo | `dias_aviso_precio_fijo` | 15 días | `05-precios-y-margenes.md` §5.4 |
| Aplicar saldo a favor automáticamente | `aplicar_saldo_a_favor_auto` | Sí | RN-097b | "Pagué esta compra" registra un pago de hoy por todo lo pendiente de esa compra, imputado a ella; si ya no queda nada pendiente, avisa que está pagada; el mismo toque repetido devuelve el mismo pago. | Pagar una compra | CALCULA + BLOQUEA |
| RN-098 |
| Tolerancia de peso | `tolerancia_peso_pct` | 3 % | RN-113, RN-127 |
| Multiplicador de cantidad atípica | `cantidad_atipica_multiplicador`, `cantidad_atipica_semanas` | 3 × promedio de 8 semanas | RN-023 |
| Emitir documentos al marcar entrega preparada | `emitir_documentos_al_preparar` | Sí | `04-procesos-y-flujos.md` §5.e |
| Facturar automáticamente clientes `POR_ENTREGA` | `facturar_automatico_por_entrega` | Sí | RN-143 |

---

## 5. Permisos referenciados

Claves del catálogo de `02-usuarios-roles-y-permisos.md` que usan los documentos 04 a 07, con las reglas que las exigen. La asignación a roles es la matriz de ese documento.

| Permiso | Para qué se usa en estos documentos | Reglas |
|---|---|---|
| `clientes.editar` | Alta y edición de clientes y puntos de entrega (sin recargos) | RN-010 a RN-016 |
| `productos.editar` | Alta de productos (también desde la planilla), presentaciones, categorías y proveedor preferido | RN-001 a RN-009, RN-073, RN-154, RN-155 |
| `proveedores.editar` | Alta y edición de proveedores | RN-108 |
| `proveedores.ver_credito` | Ver límite, disponible, semáforo y deuda vencida | RN-104, RN-107 |
| `proveedores.editar_limite` | Cambiar límite de crédito y plazo de pago | RN-105 |
| `precios.ver_costos` | Ver precios de compra, costos, lista general y comparador | RN-053, RN-074 |
| `precios.ver_venta` | Ver precios de venta estimados y congelados, importes | RN-032, RN-146 |
| `precios.ver_margenes` | Ver recargos, reglas, márgenes y alertas de margen | RN-032, RN-085, RN-086 |
| `precios.editar_compra` | Actualizar precios de compra (en línea, rápida, masiva, importación) | RN-067 a RN-075 |
| `precios.editar_reglas` | Editar recargos y reglas de precio de venta | RN-079, RN-084, RN-091 |
| `precios.override_linea` | Cambiar a mano el precio de una línea | RN-090 |
| `pedidos.crear`, `pedidos.editar`, `pedidos.confirmar` | Cargar, modificar (`BORRADOR`/`CONFIRMADO`) y confirmar pedidos | RN-017 a RN-025 |
| `pedidos.editar_en_curso` | Modificar pedidos `EN_COMPRA`/`EN_PREPARACION`; cargar pedidos en jornadas `PREPARANDO`/`REPARTIENDO` | RN-026, RN-027, RN-030 |
| `pedidos.cancelar` | Cancelar pedidos o líneas | RN-028 |
| `jornada.gestionar` | Iniciar la preparación y avanzar la jornada a mano | RN-036 a RN-039 |
| `jornada.cerrar` | Cerrar la jornada | RN-040 |
| `jornada.reabrir` | Reabrir una jornada cerrada | RN-041 |
| `lista_compra.generar` | Generar y regenerar la lista de compras | RN-043 a RN-049 |
| `lista_compra.editar` | Ajustar cantidades, proveedor, comprador asignado; marcar `NO_CONSEGUIDO`; tildar productos como comprados y pasar tarjetas a "Comprado" | RN-050, RN-051, RN-051b |
| `compras.registrar` | Registrar compras (incluye el pago en el momento) | RN-054 a RN-062 |
| `compras.anular` | Anular y corregir compras | RN-064, RN-065 |
| `compras.exceder_limite` | Confirmar compras que superan el límite de crédito | RN-063 |
| `pagos.ver` | Ver cuenta corriente, pagos, imputaciones y vencimientos; ver los gastos e ingresos generales | RN-093, RN-099, RN-169 |
| `pagos.registrar` | Registrar pagos posteriores e imputarlos; anotar gastos e ingresos y manejar sus rubros | RN-095 a RN-098, RN-169, RN-170 |
| `pagos.anular` | Anular pagos y reimputar; anular un gasto o un ingreso | RN-100, RN-169 |
| `cobranzas.ver` | Ver lo que debe cada cliente ("A cobrar") y su cuenta | RN-164, RN-166 |
| `cobranzas.registrar` | Anotar cobros y la deuda anterior al sistema | RN-165, RN-168 |
| `cobranzas.anular` | Anular un cobro | RN-167 |
| `pagos.ajustar` | Registrar ajustes y saldo inicial | RN-102, RN-110 |
| `preparacion.registrar` | Registrar cantidades preparadas y pasar la entrega a `PREPARADA` | RN-111 a RN-118 |
| `preparacion.asignar_faltantes` | Ajustar el reparto de faltantes | RN-116 |
| `repartos.gestionar` | Armar repartos, ordenar el recorrido, sumarle destinos y manejar los favoritos, mandar pedidos a En camino ("Sale ahora") | RN-123, RN-153, RN-176, RN-177 |
| `repartos.ver_propios` | El repartidor ve solo sus repartos | RN-131 |
| `entregas.gestionar` | Armar entregas y pasarlas a `EN_REPARTO` | RN-122 |
| `entregas.emitir_documentos` | Emitir y reemitir `DOC-02` y `DOC-03` de una entrega | RN-120, RN-121 |
| `entregas.confirmar` | Confirmar entregas, registrar diferencias y rechazos | RN-125 a RN-127 |
| `entregas.corregir` | Corregir una entrega con documentos emitidos (nueva versión) | RN-128 |
| `entregas.anular` | Anular una entrega | RN-132 |
| `documentos.imprimir_compra` | Imprimir `DOC-01` y `DOC-06` | RN-053 |
| `documentos.imprimir_entrega` | Imprimir `DOC-02`, `DOC-04` y `DOC-07` (sin precios) | RN-124 |
| `documentos.imprimir_contable` | Imprimir `DOC-03` y `DOC-08` | RN-120, RN-140 |
| `documentos.imprimir_cuenta` | Imprimir `DOC-05` | — |
| `facturacion.emitir`, `facturacion.anular`, `facturacion.exportar` | Comprobantes internos y exportación al contador | RN-135 a RN-143 |
| `auditoria.ver` | Consultar la auditoría | RN-148 |
| `configuracion.editar` | Parámetros de la empresa (sección 4) | — |

