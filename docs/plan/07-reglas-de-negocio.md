# 07 · Reglas de negocio

> **Propósito:** reunir en un único catálogo numerado todas las reglas que el sistema debe hacer cumplir (validaciones, cálculos, controles y registros de auditoría) y la resolución de los casos borde, para que el dueño las valide y el equipo de desarrollo las implemente y las pruebe una por una.

## Contenido

1. [Cómo leer el catálogo](#1-cómo-leer-el-catálogo)
2. [Catálogo de reglas](#2-catálogo-de-reglas)
   - [2.1 Catálogo de productos](#21-catálogo-de-productos)
   - [2.2 Clientes](#22-clientes)
   - [2.3 Pedidos](#23-pedidos)
   - [2.4 Jornada](#24-jornada)
   - [2.5 Lista de compra](#25-lista-de-compra)
   - [2.6 Compras](#26-compras)
   - [2.7 Precios de compra](#27-precios-de-compra)
   - [2.8 Precios de venta](#28-precios-de-venta)
   - [2.9 Créditos y pagos a proveedores](#29-créditos-y-pagos-a-proveedores)
   - [2.10 Preparación](#210-preparación)
   - [2.11 Entregas y documentos](#211-entregas-y-documentos)
   - [2.12 Facturación](#212-facturación)
   - [2.13 Seguridad y auditoría](#213-seguridad-y-auditoría)
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
| RN-004 | El nombre y el código de producto son únicos por empresa (sin distinguir mayúsculas). Calidades distintas se cargan como productos distintos ("Tomate redondo primera" / "segunda"). | Alta y edición de producto | BLOQUEA |
| RN-005 | Todo producto pertenece a una categoría. | Alta y edición de producto | BLOQUEA |
| RN-006 | Todo producto tiene alícuota de IVA; si no se indica, toma la de la empresa. | Alta de producto | CALCULA |
| RN-007 | Un producto desactivado no se ofrece en pedidos, compras ni listas nuevas; su historial queda intacto. Si tiene pedidos en curso, se advierte al desactivarlo. | Desactivación; carga de pedidos y compras | BLOQUEA (uso nuevo) + ADVIERTE |
| RN-008 | `cantidad_base = cantidad × factor_a_base` de la presentación elegida (o = cantidad si se carga en unidad base). Todo cálculo interno se hace en unidad base. | Pedidos, compras, entregas | CALCULA |
| RN-009 | Si el producto no admite fracción (`admite_fraccion = false`, ej. lechuga por unidad), las cantidades en unidad base son enteras; el reparto de faltantes usa paso 1 (o 0,1 si admite fracción). | Carga de cantidades; reparto de faltantes | BLOQUEA + CALCULA |

### 2.2 Clientes

| ID | Regla | Cuándo se aplica | Efecto |
|---|---|---|---|
| RN-010 | Un cliente necesita nombre y al menos un `punto_entrega` activo para que se le confirme un pedido. | Alta de cliente; confirmación de pedido | BLOQUEA |
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
| RN-018 | Para confirmar (`pedidos.confirmar`), el pedido debe tener al menos una línea no cancelada con cantidad > 0. | Confirmar | BLOQUEA |
| RN-018b | **Nunca un pedido vacío (29/09/2026):** la carga visual guarda el pedido con todos sus productos, la prioridad, el horario y la nota en una sola operación, o no guarda nada. Un pedido sin productos no se confirma ni pasa a la lista de compra, y el aviso ofrece el botón para agregarle productos. | Cargar, confirmar o armar la lista | BLOQUEA + explica cómo seguir |
| RN-019 | La presentación elegida en una línea debe pertenecer al producto y ser `usable_en_venta`. | Carga de línea | BLOQUEA |
| RN-020 | La `cantidad_base` de cada línea se calcula al guardar (RN-008). | Carga de línea | CALCULA |
| RN-021 | Si un producto se repite en el mismo pedido, se ofrece sumar las cantidades en una sola línea. | Carga de línea | ADVIERTE |
| RN-022 | Si el cliente ya tiene otro pedido para la misma jornada y punto de entrega, se avisa posible duplicado y se ofrece agregar las líneas al existente. Si se mantienen separados, van a la misma entrega. | Crear pedido | ADVIERTE |
| RN-023 | Una cantidad mayor a 3 veces el promedio del cliente para ese producto (últimas 8 semanas) pide confirmación. | Carga de línea | ADVIERTE |
| RN-024 | Solo se permiten las transiciones de estado del diagrama del pedido (`04-procesos-y-flujos.md` §5.b). | Todo cambio de estado | BLOQUEA |
| RN-025 | Los pedidos `BORRADOR` y `CONFIRMADO` se modifican con `pedidos.editar`. | Modificación | BLOQUEA (sin permiso) |
| RN-026 | Un pedido `EN_COMPRA` solo se modifica con `pedidos.editar_en_curso`; la lista de compra queda marcada como desactualizada y se avisa al comprador. | Modificación | BLOQUEA (sin permiso) + ADVIERTE + AUDITA |
| RN-027 | Un pedido `EN_PREPARACION` solo se modifica con `pedidos.editar_en_curso` y el cambio se traslada a la línea de la entrega (con nueva versión de documentos si ya se habían emitido). Desde `PREPARADO` el pedido no se modifica: las diferencias se registran en la entrega y los agregados se cargan como pedido complementario. | Modificación | BLOQUEA + AUDITA |
| RN-028 | Solo se cancela desde `BORRADOR`, `CONFIRMADO` o `EN_COMPRA`, con `pedidos.cancelar`; desde `CONFIRMADO` o `EN_COMPRA` el motivo es obligatorio. Lo ya comprado queda como sobrante previsto. | Cancelación | BLOQUEA + AUDITA |
| RN-029 | Un pedido confirmado con la jornada en `COMPRANDO` se marca como tardío y la lista de compra queda desactualizada. | Confirmar | CALCULA + ADVIERTE |
| RN-030 | Cargar o confirmar un pedido para una jornada `PREPARANDO` o `REPARTIENDO` requiere `pedidos.editar_en_curso`; se informa si alcanza con el sobrante previsto. | Crear y confirmar | BLOQUEA (sin permiso) + ADVIERTE |
| RN-031 | No se cargan pedidos para una jornada `CERRADA` ni para fechas pasadas; se propone la próxima jornada. | Crear pedido | BLOQUEA |
| RN-032 | Cada línea tiene precio estimado (`05-precios-y-margenes.md` §5.8), visible solo con `precios.ver_venta`; el costo, con `precios.ver_costos`; recargo y margen, con `precios.ver_margenes`. No es vinculante hasta la emisión de documentos. | Carga y confirmación | CALCULA |
| RN-033 | Duplicar un pedido crea un `BORRADOR` en la jornada elegida con las líneas de productos activos; omite los desactivados con aviso; los precios se recalculan. | Duplicar | CALCULA + ADVIERTE |
| RN-034 | Al generar la lista de compra, los pedidos `BORRADOR` de la jornada no se incluyen y se listan para confirmarlos o dejarlos fuera. | Generar lista | ADVIERTE |

### 2.4 Jornada

| ID | Regla | Cuándo se aplica | Efecto |
|---|---|---|---|
| RN-035 | Hay una sola jornada por fecha y empresa; se crea automáticamente al cargar el primer pedido de esa fecha. | Crear pedido o jornada | BLOQUEA (duplicado) + CALCULA |
| RN-036 | La jornada solo avanza: `ABIERTA` → `COMPRANDO` → `PREPARANDO` → `REPARTIENDO` → `CERRADA` (única excepción: RN-041). | Cambio de estado | BLOQUEA |
| RN-037 | Pasa a `COMPRANDO` al generar la lista de compra; requiere al menos un pedido `CONFIRMADO`. | Generar lista | BLOQUEA |
| RN-038 | Pasar a `PREPARANDO` con líneas de la lista `PENDIENTE` o `PARCIAL` pide confirmación. | Iniciar preparación | ADVIERTE |
| RN-039 | Pasa a `REPARTIENDO` automáticamente cuando sale el primer reparto. | Salida de reparto | CALCULA |
| RN-040 | Para cerrar: todas las entregas `ENTREGADA` o `ANULADA`; todos los pedidos `ENTREGADO` o `CANCELADO`; documentos de la última versión emitidos. Líneas de lista sin justificar, compras sin conciliar y márgenes negativos se advierten. | Cerrar jornada | BLOQUEA + ADVIERTE |
| RN-041 | Una jornada `CERRADA` es de solo lectura. Solo quien tenga `jornada.reabrir` (ADMIN) puede reabrirla a `REPARTIENDO`, con motivo. Avanzarla a mano requiere `jornada.gestionar` y cerrarla, `jornada.cerrar`. | Cualquier operación sobre la jornada | BLOQUEA + AUDITA |
| RN-042 | Las operaciones permitidas en cada estado de la jornada son las de la tabla de `04-procesos-y-flujos.md` §4.3. | Toda operación ligada a una jornada | BLOQUEA |

### 2.5 Lista de compra

| ID | Regla | Cuándo se aplica | Efecto |
|---|---|---|---|
| RN-043 | La lista incluye solo líneas de pedidos `CONFIRMADO` y `EN_COMPRA` de la jornada. | Generar y regenerar | CALCULA |
| RN-044 | Necesidad por producto = Σ `cantidad_base` de esas líneas. | Generar y regenerar | CALCULA |
| RN-045 | (Fase 2) Necesidad neta = necesidad − stock disponible de sobrantes. | Generar y regenerar | CALCULA |
| RN-046 | Presentaciones a comprar = techo(pendiente ÷ `factor_a_base`); sobrante previsto = presentaciones × factor − pendiente. | Generar y regenerar | CALCULA |
| RN-047 | El proveedor sugerido se elige según la estrategia de costo de la empresa y el crédito disponible proyectado (`04-procesos-y-flujos.md` §5.c.2). | Generar y regenerar | CALCULA |
| RN-048 | Un producto sin oferta vigente queda en la lista como "sin proveedor / sin precio". | Generar; lista general de precios | ADVIERTE |
| RN-049 | Hay una lista vigente por jornada; regenerar crea una nueva versión, registra las diferencias y **nunca** modifica ni anula compras registradas. | Regenerar | CALCULA |
| RN-050 | Un proveedor asignado a mano y una cantidad ajustada a mano (`ajuste_manual`, con motivo) se conservan al regenerar; si la necesidad cambió, la línea se marca `necesidad_modificada`. Ajustar requiere `lista_compra.editar`. | Regenerar; edición de la lista | CALCULA + BLOQUEA (sin permiso) |
| RN-051 | El estado de cada línea se calcula con lo comprado (`PENDIENTE`, `PARCIAL`, `COMPRADO`, comparando con `necesidad_neta_base`); `NO_CONSEGUIDO` se marca a mano (`lista_compra.editar`) con motivo obligatorio y se revierte si luego se completa la compra. | Registro y anulación de compras; marca manual | CALCULA + BLOQUEA (sin motivo) |
| RN-052 | Si los pedidos cambiaron después de la última versión, la lista se muestra "desactualizada" (pantalla y `DOC-01`). | Cambios en pedidos | ADVIERTE |
| RN-053 | `DOC-01` muestra versión, fecha y hora de generación; incluye precios solo si quien imprime tiene `precios.ver_costos` (opción de imprimir sin precios). | Impresión | CALCULA + BLOQUEA (precios sin permiso) |

### 2.6 Compras

| ID | Regla | Cuándo se aplica | Efecto |
|---|---|---|---|
| RN-054 | Una compra requiere proveedor activo, jornada no `CERRADA`, al menos un ítem, cantidades > 0 y precios ≥ 0. | Registrar compra | BLOQUEA |
| RN-055 | La presentación de cada ítem debe pertenecer al producto y ser `usable_en_compra`. | Registrar compra | BLOQUEA |
| RN-056 | Un ítem con precio $0 (bonificación) pide confirmación. | Registrar compra | ADVIERTE |
| RN-057 | `cantidad_base` = cantidad × factor; `costo_unitario_base` = precio ÷ factor (4 decimales); subtotal = cantidad × precio redondeado al peso (desde el 28/09/2026; antes, a 2 decimales); total = Σ subtotales. | Registrar compra | CALCULA |
| RN-058 | Si el precio difiere del vigente del proveedor en más del umbral de variación brusca (30 % por defecto), se pide confirmación explícita. | Registrar compra | ADVIERTE |
| RN-059 | Registrar una compra actualiza la oferta vigente del proveedor (o la crea), marca `compra_item.actualizo_precio_lista` y agrega historial con origen `COMPRA`; si el precio es igual, solo actualiza `fecha_actualizacion`. | Registrar compra | CALCULA + AUDITA |
| RN-060 | Un producto comprado sin necesidad en la lista se marca "compra sin pedido" y se suma a la lista como sobrante previsto. | Registrar compra | ADVIERTE + CALCULA |
| RN-061 | Si lo comprado de un producto supera la necesidad en más de un bulto de la presentación comprada, se destaca para revisión. | Registrar compra; conciliación | ADVIERTE |
| RN-062 | `CONTADO` genera un pago automático por el total; `CREDITO` no genera pago; `MIXTA` exige 0 < pagado en el momento < total. | Registrar compra | CALCULA + BLOQUEA |
| RN-063 | Control de límite de crédito sobre el saldo proyectado (`06-creditos-y-pagos.md` §9): superar el límite bloquea salvo `compras.exceder_limite` con motivo (queda `compra.excede_limite`, motivo y quién autorizó); quedar en `ROJO` advierte. | Registrar compra `CREDITO` o `MIXTA` | BLOQUEA + ADVIERTE + AUDITA |
| RN-064 | Una compra registrada no se edita; se corrige anulando y registrando otra ("Corregir" hace ambas cosas en un paso). | Edición | BLOQUEA |
| RN-065 | Anular una compra requiere `compras.anular` y motivo; genera `ANULACION_COMPRA`, libera imputaciones, recalcula lista y costo real, y revierte la oferta del proveedor si su precio vigente provenía de esa compra y no cambió después. | Anular compra | AUDITA + CALCULA |
| RN-066 | La fecha de la compra no puede ser futura; toda compra pertenece a una jornada (por defecto, la jornada en `COMPRANDO` más próxima, o la de hoy). | Registrar compra | BLOQUEA + CALCULA |

### 2.7 Precios de compra

| ID | Regla | Cuándo se aplica | Efecto |
|---|---|---|---|
| RN-067 | Hay una sola oferta vigente por proveedor + producto + presentación. | Alta y edición de oferta | BLOQUEA |
| RN-068 | Todo cambio de precio de compra agrega una fila a `historial_precio_compra` (precio, costo por unidad base, variación, origen `MANUAL`/`COMPRA`/`IMPORTACION`, referencia, usuario, vigencia) y cierra la vigencia de la fila anterior; el historial no se edita. Se registra también `CAMBIO_PRECIO_COMPRA` en `auditoria`. | Toda actualización | AUDITA |
| RN-069 | Un precio sin actualizar ni confirmar hace más de N días (`dias_alerta_precio_desactualizado`, 7 por defecto) se muestra como desactualizado. | Lista general, plan de compra, costo de referencia | ADVIERTE |
| RN-070 | Una edición manual, masiva o importada con variación mayor al umbral (30 % por defecto) pide confirmación. | Actualización de precio | ADVIERTE |
| RN-071 | La actualización masiva exige vista previa y confirmación; genera historial por línea (origen `MANUAL`, con la observación del lote) y un evento en `auditoria`. | Actualización masiva | BLOQUEA (sin vista previa) + AUDITA |
| RN-072 | En la importación, las filas con error no se aplican; se informa el resumen de aplicadas, omitidas y con error. | Importación | BLOQUEA (por fila) |
| RN-073 | Cada producto tiene como máximo un proveedor preferido. | Marcar preferido | BLOQUEA |
| RN-074 | Los precios de compra y costos solo se muestran a usuarios con `precios.ver_costos`; se editan con `precios.editar_compra`. | Consultas y edición | BLOQUEA |
| RN-075 | "Confirmar sin cambios" actualiza `fecha_actualizacion` de la oferta sin cambiar el precio y sin crear historial. Una oferta marcada `disponible = false` queda fuera del mínimo y de las sugerencias. | Actualización rápida | CALCULA |

### 2.8 Precios de venta

| ID | Regla | Cuándo se aplica | Efecto |
|---|---|---|---|
| RN-076 | Precio de venta = costo de referencia × (1 + recargo ÷ 100), redondeado según la empresa. El "porcentaje de ganancia" es un recargo sobre el costo. | Todo cálculo de precio | CALCULA |
| RN-077 | Precedencia de 7 niveles: precio fijo cliente + producto; recargo cliente + producto; recargo cliente + categoría; recargo del cliente; recargo del producto; recargo de la categoría; recargo global. Siempre se muestra el origen. | Todo cálculo de precio | CALCULA |
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

### 2.9 Créditos y pagos a proveedores

| ID | Regla | Cuándo se aplica | Efecto |
|---|---|---|---|
| RN-092 | La cuenta corriente es un libro de movimientos inmutables; los errores se corrigen con movimientos compensatorios. | Todo cambio de deuda | BLOQUEA (edición) |
| RN-093 | Saldo neto = Σ importes con signo de los movimientos del proveedor. | Toda consulta de saldo | CALCULA |
| RN-094 | Tipos y signos: `SALDO_INICIAL` +, `CARGO_COMPRA` +, `PAGO` −, `ANULACION_COMPRA` −, `ANULACION_PAGO` +, `AJUSTE_DEBITO` +, `AJUSTE_CREDITO` −. | Creación de movimientos | CALCULA |
| RN-095 | Un pago requiere monto > 0, fecha no futura y medio (`EFECTIVO`, `TRANSFERENCIA`, `CHEQUE`, `TARJETA`, `OTRO`); referencia obligatoria para `TRANSFERENCIA` y `CHEQUE` (cheque: número, banco y fecha de cobro). | Registrar pago | BLOQUEA |
| RN-096 | La imputación por defecto es FIFO: compras con pendiente, la más antigua primero (fecha, luego número). | Registrar pago | CALCULA |
| RN-097 | En la imputación manual cada importe ≤ pendiente de la compra y la suma ≤ monto del pago. | Imputación manual | BLOQUEA |
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
| RN-110 | El saldo inicial se carga una vez por proveedor como compra de tipo `SALDO_INICIAL` (sin líneas ni jornada) más su movimiento `SALDO_INICIAL`; una segunda carga requiere ADMIN. | Puesta en marcha | BLOQUEA + AUDITA |

### 2.10 Preparación

| ID | Regla | Cuándo se aplica | Efecto |
|---|---|---|---|
| RN-111 | Al iniciar la preparación se crea una entrega por cliente + punto de entrega + jornada con pedidos `EN_COMPRA`; cada línea referencia su `pedido_item`. | Iniciar preparación; pedidos tardíos | CALCULA |
| RN-112 | La cantidad preparada se registra en unidad base (peso real o unidades contadas). | Preparación | CALCULA |
| RN-113 | Una diferencia entre preparado y pedido dentro de la tolerancia (3 % por defecto) no se considera diferencia; fuera de ella pide confirmación y marca la línea. | Preparación | ADVIERTE |
| RN-114 | Si lo preparado de un producto supera lo comprado (más stock en fase 2), se pide confirmación con motivo. | Preparación | ADVIERTE |
| RN-115 | Si lo disponible no alcanza, se reparte según `empresa.politica_faltantes`: `PRIORIDAD_CLIENTE` (por defecto: por prioridad del cliente y, dentro del primer grupo que no alcanza, prorrateo proporcional), `PROPORCIONAL` o `MANUAL` (`04-procesos-y-flujos.md` §5.e.1). **Ampliada (28/09/2026):** con `PRIORIDAD_CLIENTE` manda primero la prioridad del pedido que se elige en el tablero (Urgente, Normal, Sin apuro) y, dentro de cada una, la del cliente. | Preparación | CALCULA |
| RN-116 | El reparto propuesto de faltantes se puede ajustar a mano con `preparacion.asignar_faltantes`; queda registrado quién lo ajustó. | Preparación | CALCULA + AUDITA |
| RN-117 | Una sustitución requiere producto sustituto, cantidad y motivo; si el cliente no acepta sustituciones, se debe registrar quién la autorizó. El precio del sustituto se calcula con sus propias reglas. | Preparación | BLOQUEA (sin datos) + ADVIERTE |
| RN-118 | Una entrega pasa a `PREPARADA` solo si todas sus líneas tienen cantidad preparada (0 con motivo). | Marcar preparada | BLOQUEA |
| RN-119 | Las pantallas, APIs y documentos de preparación nunca devuelven precios ni costos. | Preparación | BLOQUEA |

### 2.11 Entregas y documentos

| ID | Regla | Cuándo se aplica | Efecto |
|---|---|---|---|
| RN-120 | `DOC-02` (lista de entrega sin precios) y `DOC-03` (lista contable) se emiten siempre juntos, de la misma entrega y la misma versión. | Emisión | BLOQUEA |
| RN-121 | La emisión congela los precios (RN-089) y exige que todas las líneas tengan precio (RN-087). | Emisión | BLOQUEA + CALCULA |
| RN-122 | Una entrega no pasa a `EN_REPARTO` sin documentos emitidos de su versión vigente. | Salida del reparto | BLOQUEA |
| RN-123 | Una entrega pertenece a un solo reparto a la vez, de su misma jornada. | Armado de repartos | BLOQUEA |
| RN-124 | Las rutas y consultas de documentos y vistas sin precios no leen campos de precio ni costo (control en el servidor, no solo en la interfaz). | `DOC-02`, `DOC-04`, `DOC-07`, vistas de preparación y reparto | BLOQUEA |
| RN-125 | La confirmación exige nombre de quien recibe; la hora la registra el servidor; firma o foto son opcionales salvo que el cliente las requiera. | Confirmar entrega | BLOQUEA |
| RN-126 | La cantidad entregada no puede superar la preparada; toda diferencia requiere `motivo_diferencia` por línea (`RECHAZO_CALIDAD`, `FALTANTE`, `NO_CONSEGUIDO`, `ERROR_PREPARACION`, `CAMBIO_CLIENTE`, `OTRO`) y detalle si es `OTRO`. | Confirmar entrega | BLOQUEA |
| RN-127 | `con_diferencias` = verdadero si alguna línea entregada difiere de la pedida fuera de la tolerancia de peso (RN-113), hubo sustitución o rechazo. | Confirmar entrega | CALCULA |
| RN-128 | Todo cambio posterior a la emisión incrementa `entrega.version` y reemite ambos documentos; las versiones anteriores quedan `REEMPLAZADO`. Las correcciones administrativas requieren `entregas.corregir`. | Corrección, sustitución, tardío, diferencias | CALCULA + AUDITA |
| RN-129 | La lista contable definitiva usa `cantidad_entregada`. | Confirmación; reemisión | CALCULA |
| RN-130 | La mercadería rechazada vuelve como devolución y se suma al sobrante de la jornada (fase 2: `ajuste_stock`). | Confirmar entrega | CALCULA |
| RN-131 | Un REPARTIDOR ve solo los repartos asignados a él (`repartos.ver_propios`). | Consultas de reparto | BLOQUEA |
| RN-132 | Anular una entrega requiere `entregas.anular` y motivo; si está `FACTURADA`, antes se anula la factura; sus líneas se reasignan a una entrega nueva o correcta. | Anular entrega | BLOQUEA + AUDITA |
| RN-133 | Reimprimir una versión ya emitida no genera versión nueva; queda registrada en `documento_emitido` con evento `REIMPRESION`. | Reimpresión | CALCULA |
| RN-134 | Si el cliente no recibe nada (cerrado o cancela en la puerta o después de preparado), la entrega se confirma con todas las cantidades en 0 y motivo `CAMBIO_CLIENTE` u `OTRO` con detalle; total $0. | Confirmar entrega | CALCULA |

### 2.12 Facturación

| ID | Regla | Cuándo se aplica | Efecto |
|---|---|---|---|
| RN-135 | Al confirmar una entrega queda registrada la venta con estado de facturación `SIN_FACTURAR`. | Confirmar entrega | CALCULA |
| RN-136 | Una factura solo incluye entregas `ENTREGADA` y `SIN_FACTURAR`, todas del mismo cliente, con total > 0. | Emitir factura | BLOQUEA |
| RN-137 | Total de la factura = Σ totales de la última versión de cada entrega incluida. | Emitir factura | CALCULA |
| RN-138 | Una entrega `FACTURADA` no se modifica ni se reemite; para corregirla se anula la factura (o, en la fase fiscal, nota de crédito). | Corrección de entrega | BLOQUEA |
| RN-139 | Anular una factura requiere `facturacion.anular` y motivo; sus entregas vuelven a `SIN_FACTURAR`. | Anular factura | AUDITA |
| RN-140 | El comprobante interno del MVP lleva la leyenda "Documento no válido como factura". | Emisión e impresión | CALCULA |
| RN-141 | "Facturar período" propone una factura por cliente según su periodicidad con las entregas pendientes del período. | Facturación periódica | CALCULA |
| RN-142 | La exportación para el contador incluye los documentos del período; los anulados figuran marcados como tales. | Exportación | CALCULA |
| RN-143 | Para clientes `POR_ENTREGA`, la factura se genera automáticamente al confirmar la entrega (configurable por empresa). | Confirmar entrega | CALCULA |

### 2.13 Seguridad y auditoría

| ID | Regla | Cuándo se aplica | Efecto |
|---|---|---|---|
| RN-144 | Toda tabla de negocio lleva `empresa_id` y se aísla con Row Level Security: ningún usuario ve datos de otra empresa. | Toda consulta y escritura | BLOQUEA |
| RN-145 | Los permisos (`modulo.accion`) se verifican en el servidor en cada acción, no solo ocultando botones. | Toda acción | BLOQUEA |
| RN-146 | La visibilidad de precios, costos y márgenes depende de los permisos `precios.ver_venta`, `precios.ver_costos` y `precios.ver_margenes`, que los roles PREPARADOR y REPARTIDOR nunca otorgan; sus pantallas usan vistas operativas sin precios (`v_op_*`). | Toda consulta con precios | BLOQUEA |
| RN-147 | Se auditan: cambios de precios de compra (masivos e importados), reglas y recargos, overrides, anulaciones de documentos, excesos de límite, cambios de límite, reaperturas de jornada, reimputaciones, ajustes, cambios de roles y permisos. | Eventos indicados | AUDITA |
| RN-148 | La auditoría no se edita ni se borra; la consulta requiere `auditoria.ver` (ADMIN). | Consulta de auditoría | BLOQUEA |
| RN-149 | Los números de documento (PED, LC, COM, PAG, REP, ENT, FAC) son correlativos por empresa y tipo, se asignan desde `secuencia` en la transacción que confirma el documento, y un documento anulado conserva su número. | Confirmación de documentos | CALCULA |
| RN-150 | Control de concurrencia optimista: si el registro cambió desde que el usuario lo abrió (`actualizado_en`), el guardado se rechaza y se pide recargar. | Edición de pedidos, entregas, maestros | BLOQUEA |
| RN-151 | Los documentos (pedidos, compras, pagos, entregas, facturas, cobros) nunca se borran: se anulan con motivo. Los maestros (productos, clientes, proveedores) se desactivan. | Toda eliminación | BLOQUEA |
| RN-152 | Una moneda por empresa; montos con 2 decimales, precios unitarios y costos con 4 decimales internos (se muestran con 2), cantidades con 3, porcentajes con 3. | Todo cálculo y almacenamiento | CALCULA |

---

## 3. Casos borde y su resolución

Datos de los ejemplos: escenario de `04-procesos-y-flujos.md` §2.

| # | Caso | Qué pasa / riesgo | Resolución | Reglas |
|---|---|---|---|---|
| 1 | **Pedido aumentado después de comprar.** El restaurante agrega 10 kg de cebolla cuando ya se compraron 4 bolsas de 20 kg (80 kg para 73 kg). | La necesidad pasa a 83 kg y faltan 3 kg. | El cambio requiere `pedidos.editar_en_curso`; la lista queda desactualizada y el comprador recibe el aviso. Al regenerar: pendiente 3 kg → 1 bolsa más. Si el comprador ya salió del mercado, se reparte lo disponible con el algoritmo de faltantes o se hace una compra adicional. | RN-026, RN-049, RN-052, RN-115 |
| 2 | **Pedido reducido o cancelado después de comprar.** La verdulería cancela sus 30 lechugas con las 9 jaulas ya compradas. | Mercadería comprada sin destino. | La cancelación (motivo obligatorio) no toca las compras; la línea sigue `COMPRADO` y el excedente pasa a sobrante previsto (40 u en total). El costo queda en el resumen de la jornada. | RN-028, RN-049 |
| 3 | **Producto no conseguido.** No hubo lechuga criolla en el mercado. | Clientes sin un producto pedido. | El comprador marca la línea `NO_CONSEGUIDO` con motivo. En preparación las líneas quedan en 0 con motivo y se ofrece sustituir (ej. mantecosa). Los documentos muestran solo lo entregado; el pedido registra el faltante. | RN-051, RN-115, RN-117 |
| 4 | **Compra mayor a lo necesario.** Se compraron 8 bolsas de papa (200 kg) de más por una oferta. | Costo sin venta asociada. | Se destaca al registrar (más de un bulto de excedente). El exceso es sobrante previsto; su costo figura en "sobrantes" del resumen del día. En fase 2 pasa a stock. | RN-060, RN-061 |
| 5 | **Compra de un producto partida entre proveedores.** A tenía 10 cajones de tomate y B completó 5. | Dos precios distintos para el mismo producto. | La lista suma todo en unidad base (PARCIAL → COMPRADO). El costo real es el promedio ponderado ($925/kg). Cada compra impacta en la cuenta corriente de su proveedor. | RN-044, RN-051, RN-080 |
| 6 | **Precio de compra distinto al estimado.** B cobró el cajón $17.550 en vez de $17.100. | Precios estimados desactualizados. | Se registra el precio real; la oferta de B se actualiza con historial (+2,63 %); los precios no congelados de la jornada se recalculan con el costo real. Si la variación superara 30 %, se pediría confirmación. | RN-058, RN-059, RN-088 |
| 7 | **Precio fijo menor que el costo.** Hospital con tomate a $1.150 y costo real $1.200. | Venta a pérdida. | Se respeta el precio pactado; alerta `MARGEN_NEGATIVO` en pedido, matriz y resumen; al emitir se pide confirmación explícita. El reporte de alertas de margen sustenta la renegociación. Un override con permiso y motivo es posible pero excepcional. | RN-086, RN-089, RN-090 |
| 8 | **Anulación de una compra `CONTADO` ya pagada.** | El dinero ya se entregó. | Se pregunta si el proveedor devolvió el dinero. Sí → se anulan compra y pago (efecto neto 0). No → el pago queda como saldo a favor y se aplica a la próxima compra. | RN-065, RN-101 |
| 9 | **Anulación de una compra a crédito con pagos parciales imputados.** | Pagos imputados a una compra que ya no existe. | Se anulan las imputaciones; los importes quedan como saldo a favor y se reimputan FIFO a otras compras pendientes. | RN-065, RN-101 |
| 10 | **Pago mayor a la deuda.** Se pagan $200.000 con deuda de $170.000. | Saldo negativo. | Los $30.000 quedan como saldo a favor; el disponible supera el límite; se aplican automáticamente a la próxima compra a crédito (`06-creditos-y-pagos.md` §12, pasos 11 y 12). | RN-098 |
| 11 | **Rechazo parcial en la entrega.** La verdulería rechaza 4 kg de tomate golpeado. | Documentos emitidos con cantidades que no se entregaron. | El repartidor registra 50 kg entregados y motivo `RECHAZO_CALIDAD` ("4 kg golpeados"); versión 2 de `DOC-02` y `DOC-03` con la cantidad entregada ($222.770 en vez de $227.410); los 4 kg vuelven como devolución. | RN-126, RN-128, RN-129, RN-130 |
| 12 | **Rechazo total o cliente cerrado.** | Mercadería vuelve completa. | Se confirma la entrega con todas las cantidades en 0 y motivo `OTRO` con detalle "cliente cerrado"; total $0, no se factura. Si el cliente la quiere otro día: nuevo pedido (duplicar). | RN-134, RN-136 |
| 13 | **Cliente con dos pedidos el mismo día para el mismo punto.** El hospital pide a la mañana y agrega a la tarde. | Duplicados o dos remitos. | Aviso de posible duplicado al cargar el segundo. Ambos pedidos van a la misma entrega: un solo `DOC-02` y un solo `DOC-03`, con una línea por producto (se suman las cantidades); en el sistema cada `entrega_item` conserva su pedido de origen. | RN-022, RN-111 |
| 14 | **Cliente con dos pedidos el mismo día para distintos puntos** (cocina central y cocina de pediatría). | — | Dos entregas y dos juegos de documentos, uno por punto. En la facturación ambas entregas pueden ir en la misma factura (mismo cliente). | RN-111, RN-136 |
| 15 | **Cambio de recargo después de emitir documentos.** El 25/09 se sube el tomate de 25 % a 30 %. | ¿Cambian los remitos emitidos? | No: los precios quedaron congelados en `entrega_item`. El nuevo recargo afecta a precios no congelados. Si se quiere aplicar a una entrega ya emitida y sin facturar, se hace override por línea con motivo, que genera nueva versión. | RN-089, RN-090, RN-091 |
| 16 | **Proveedor desactivado con deuda.** | Deuda "oculta". | Se advierte al desactivar. No admite compras nuevas, pero sigue en el resumen de deudas, en las alertas de vencimiento y admite pagos y ajustes hasta saldo 0. | RN-108 |
| 17 | **Producto sin precio de ningún proveedor.** Producto nuevo (ej. kale) pedido por el restaurante. | No se puede calcular el precio. | Lista de compra con "sin proveedor / sin precio"; el pedido se confirma con alerta `SIN_PRECIO`. Al registrar la compra aparece el costo real y el precio se calcula solo. Si no se compró ni hay precio fijo, no se pueden emitir documentos hasta cargar oferta u override. | RN-048, RN-087, RN-088 |
| 18 | **Límite de crédito bajado por debajo del saldo actual.** Límite de $500.000 a $400.000 con saldo $470.000. | Proveedor en exceso sin haber comprado. | Se permite con advertencia ("quedará EXCEDIDO, 117,5 %") y se audita. Nuevas compras a crédito bloqueadas salvo permiso; contado y pagos normales. | RN-105, RN-063 |
| 19 | **Pedido para una jornada ya cerrada.** | Registro en un día cerrado. | Bloqueado; se propone la próxima jornada. Si la mercadería ya se entregó ese día fuera del sistema, el ADMIN reabre la jornada con motivo, carga el pedido y la entrega, y vuelve a cerrar. | RN-031, RN-041 |
| 20 | **Pedido tardío con la preparación ya iniciada.** | La mercadería puede no alcanzar. | Requiere `pedidos.editar_en_curso`; el sistema indica si alcanza con el sobrante previsto. Se suma a la entrega del cliente si no salió (con nueva versión si ya tenía documentos) o se crea una entrega nueva en la misma jornada. | RN-030, RN-111, RN-128 |
| 21 | **Peso real distinto del pedido.** Pedido 36 kg, balanza 36,4 kg. | ¿Qué se cobra? | Dentro de la tolerancia (3 %) no es diferencia; se registra y se cobra el peso real (36,4 kg). Fuera de tolerancia se pide confirmación y la línea queda marcada. | RN-112, RN-113, RN-129 |
| 22 | **Sustitución de producto.** Lechuga mantecosa por criolla. | Cliente que no aceptó el cambio. | Sustitución con motivo; si el cliente no acepta sustituciones se registra quién la autorizó. El sustituto se cobra con su propio precio y los documentos dicen "en reemplazo de…". | RN-117 |
| 23 | **Precio de compra mal tipeado** ($1.620 en vez de $16.200). | Costo real y precios de venta erróneos. | La confirmación por variación brusca lo detecta al cargar. Si se registró igual: "Corregir" (anula y registra de nuevo); la oferta del proveedor vuelve al precio anterior. | RN-058, RN-064, RN-065 |
| 24 | **Compra registrada al proveedor equivocado.** | Deuda asignada a otro proveedor. | Anular con motivo y registrar con el proveedor correcto; los movimientos compensatorios dejan bien ambas cuentas. | RN-064, RN-065, RN-092 |
| 25 | **Faltante: se compró menos de lo necesario.** 84 lechugas para 98 pedidas. | ¿Quién se queda sin? | Reparto por prioridad (hospital completo) y prorrateo en el grupo siguiente (restaurante 14, verdulería 22); ajustable a mano. | RN-115, RN-116 |
| 26 | **Error detectado en una entrega ya facturada.** | Factura con datos incorrectos. | La entrega no se modifica: se anula la factura con motivo, se corrige la entrega (nueva versión) y se vuelve a facturar. En la fase fiscal: nota de crédito. | RN-138, RN-139 |
| 27 | **Precio fijo que vence sin renovarse.** La licitación vence el 28/02. | El precio salta sin aviso. | Alerta `PRECIO_FIJO_POR_VENCER` 15 días antes. Desde el 01/03 rige el siguiente nivel de la cascada (ej. recargo del cliente) y el origen lo muestra. | RN-077, RN-078 |
| 28 | **Dos usuarios editan el mismo pedido a la vez.** | Un cambio pisa al otro. | Concurrencia optimista: el segundo en guardar recibe "el pedido cambió, recargá" y no pierde su pantalla hasta recargar. | RN-150 |
| 29 | **Compra sin conexión que excede el límite** (fase 2). | La compra ya ocurrió. | Al sincronizar se registra igual, con marca "excedió límite sin autorización" y aviso al ADMIN. | RN-063 |
| 30 | **Compra en una presentación distinta de la sugerida.** Cajón 18 kg en vez de bolsa 20 kg. | — | Sin problema: la conciliación y el costo real se calculan en unidad base. | RN-044, RN-057 |
| 31 | **Cliente desactivado con pedidos futuros.** | Pedidos de un cliente que ya no se atiende. | Al desactivar se listan sus pedidos futuros para cancelarlos con motivo o mantenerlos; los que están en curso siguen. | RN-012 |
| 32 | **Cheque rechazado.** | Deuda que parecía pagada. | Se anula el pago con motivo "cheque rechazado": las compras vuelven a pendientes y el saldo sube. Gastos bancarios que cobre el proveedor: ajuste de débito. | RN-100, RN-102 |
| 33 | **El cliente cancela después de iniciada la preparación.** | El contrato no permite pasar a `CANCELADO` un pedido `EN_PREPARACION` o posterior. | Se confirma la entrega con cantidades 0 y motivo `CAMBIO_CLIENTE` (total $0); la mercadería vuelve como sobrante. Ver punto a revisar en el contrato (nota al pie de esta tabla). | RN-027, RN-134 |
| 34 | **Producto desactivado con pedidos en curso.** | — | Los pedidos en curso siguen normalmente; no se puede agregar a pedidos ni compras nuevas; duplicar un pedido lo omite con aviso. | RN-007, RN-033 |
| 35 | **Dos compradores registran compras al mismo proveedor a la vez.** | Ambas pasan el control de límite por separado y juntas lo superan. | Verificación y registro en la misma transacción con bloqueo de la fila del proveedor: la segunda compra ve el saldo actualizado. | RN-109 |
| 36 | **Compra adicional después de emitir documentos de algunas entregas.** | El costo real cambia a mitad de la jornada. | Los precios ya congelados no cambian; las entregas aún no emitidas usan el nuevo costo real. Puede haber dos precios por recargo para el mismo producto en la jornada; el reporte de margen por entrega usa el costo congelado y el resumen del día usa el costo real final. | RN-088, RN-089 |
| 37 | **Mercadería que llega después del cierre de la jornada.** El proveedor la trajo al día siguiente. | Compra sin jornada abierta. | Se registra en la jornada siguiente como compra sin pedido; si correspondía a la jornada cerrada, el ADMIN puede reabrirla. | RN-041, RN-060 |
| 38 | **Se usa sobrante del día anterior para un pedido** (MVP sin stock). Quedaban 10 kg de papa. | Lo preparado supera lo comprado. | Se compra menos; en preparación se registra la cantidad real y el sistema pide confirmar "preparado mayor a comprado" con motivo "sobrante anterior". La línea de la lista se justifica al cierre. En fase 2 se resuelve con stock (`ajuste_stock`). | RN-114, RN-040 |

> **Nota sobre el caso 33:** con los estados del contrato un pedido que entra en preparación solo puede terminar `ENTREGADO`. La resolución propuesta (entrega con cantidad 0) respeta el contrato pero deja el pedido como "entregado con diferencias". Se sugiere al revisor evaluar permitir `EN_PREPARACION`/`PREPARADO` → `CANCELADO` con un permiso específico y motivo. Queda como decisión pendiente D-05 en `10-plan-de-implementacion.md` §11.

---

## 4. Parámetros configurables por empresa

Todos los parámetros son campos de `empresa` (`03-modelo-de-datos.md` §4.1) con el nombre y el valor por defecto indicados; los valores por defecto son propuestas del plan que el dueño debe confirmar (`PARAMETROS-DEL-PROYECTO.md` §11). La empresa de los ejemplos usa recargo global 25 % y redondeo `ARRIBA` a $10.

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
| Aplicar saldo a favor automáticamente | `aplicar_saldo_a_favor_auto` | Sí | RN-098 |
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
| `productos.editar` | Alta de productos, presentaciones y proveedor preferido | RN-001 a RN-009, RN-073 |
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
| `lista_compra.generar` | Generar y regenerar la lista de compra | RN-043 a RN-049 |
| `lista_compra.editar` | Ajustar cantidades, proveedor, comprador asignado; marcar `NO_CONSEGUIDO` | RN-050, RN-051 |
| `compras.registrar` | Registrar compras (incluye el pago en el momento) | RN-054 a RN-062 |
| `compras.anular` | Anular y corregir compras | RN-064, RN-065 |
| `compras.exceder_limite` | Confirmar compras que superan el límite de crédito | RN-063 |
| `pagos.ver` | Ver cuenta corriente, pagos, imputaciones y vencimientos | RN-093, RN-099 |
| `pagos.registrar` | Registrar pagos posteriores e imputarlos | RN-095 a RN-098 |
| `pagos.anular` | Anular pagos y reimputar | RN-100 |
| `pagos.ajustar` | Registrar ajustes y saldo inicial | RN-102, RN-110 |
| `preparacion.registrar` | Registrar cantidades preparadas y pasar la entrega a `PREPARADA` | RN-111 a RN-118 |
| `preparacion.asignar_faltantes` | Ajustar el reparto de faltantes | RN-116 |
| `repartos.gestionar` | Armar repartos, ordenar paradas | RN-123 |
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

