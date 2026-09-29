# 02 — Usuarios, roles y permisos

**Propósito:** definir quién usa el sistema, qué puede ver y hacer cada persona, cómo se garantiza en el servidor que el personal de preparación y reparto nunca vea precios ni deudas, y cómo se administran los usuarios.

**Contenido**

1. [Principios](#1-principios)
2. [Roles](#2-roles)
3. [Uso real](#3-uso-real)
4. [Catálogo de permisos](#4-catálogo-de-permisos)
5. [Matriz rol × permiso](#5-matriz-rol--permiso)
6. [Permisos prohibidos para PREPARADOR y REPARTIDOR](#6-permisos-prohibidos-para-preparador-y-repartidor)
7. [Visibilidad a nivel de campo](#7-visibilidad-a-nivel-de-campo)
8. [Cómo se garantiza en el servidor](#8-cómo-se-garantiza-en-el-servidor)
9. [Combinación de roles](#9-combinación-de-roles)
10. [Cuentas y acceso](#10-cuentas-y-acceso)
11. [Sesiones](#11-sesiones)
12. [Casos de prueba de permisos](#12-casos-de-prueba-de-permisos)

Documentos relacionados: 01-tipo-de-aplicacion-y-arquitectura.md (seguridad técnica), 03-modelo-de-datos.md (tablas `usuario`, `rol`, `usuario_rol`, `auditoria`), 08-pantallas-y-acciones.md (qué pantalla requiere cada permiso), 09-documentos-imprimibles.md (DOC-01 a DOC-08).

---

## 1. Principios

1. **Rol = paquete de permisos.** Los permisos son granulares, con claves `modulo.accion` (ej. `compras.exceder_limite`). Un rol es un conjunto de claves; un usuario puede tener **varios roles** y sus permisos efectivos son la **unión** de todos.
2. **El servidor decide.** Cada pantalla, acción, PDF y exportación verifica el permiso en el servidor. Ocultar un botón en la interfaz es solo comodidad, nunca la protección.
3. **Pantallas operativas sin precios por diseño.** Preparación, reparto, confirmación de entrega y los documentos DOC-02, DOC-04 y DOC-07 **nunca** muestran precios, costos, márgenes ni deudas, **sin importar quién los abra** (incluso el ADMIN). No es un filtro por usuario: esas vistas directamente no leen esos campos.
4. **Mínimo privilegio.** Cada rol trae solo lo necesario para su tarea; el ADMIN puede agregar permisos opcionales.
5. **Todo cambio de permisos queda auditado.**
6. **Siempre hay al menos un ADMIN activo** por empresa.

---

## 2. Roles

Roles canónicos (creados automáticamente en cada empresa como roles de sistema; no se pueden borrar):

| Rol | Quién es en la vida real | Qué hace en el circuito (pasos de R13) | Dispositivo principal | Nunca puede |
|---|---|---|---|---|
| **ADMIN** | El dueño (o socio a cargo). | Todo: configura precios y márgenes, autoriza excesos de límite, corrige y anula documentos, ve reportes de rentabilidad. | PC en la oficina y celular en el mercado. | — (tiene todos los permisos). |
| **VENDEDOR** | Quien atiende a los clientes y toma pedidos por teléfono, WhatsApp o correo. | Pasos 1–2: carga pedidos, mantiene datos de clientes y puntos de entrega, informa al cliente el precio estimado y el estado del pedido. | Celular (con WhatsApp al lado) o PC. | Ver costos, márgenes, precios de compra, deudas con proveedores; registrar compras o pagos. |
| **COMPRADOR** | Quien va al mercado de madrugada. | Pasos 3–6: genera y usa la lista de compra, compara proveedores, registra compras (contado, crédito o mixta), actualiza precios de compra, ve el crédito disponible de cada proveedor. | Celular (una mano, poca luz, apuro). | Ver precios de venta y márgenes (salvo opcional), cambiar límites de crédito, exceder un límite sin autorización. |
| **PREPARADOR** | Personal del depósito que arma la mercadería de cada cliente. | Paso 8: usa la hoja de preparación (DOC-07), carga cantidades preparadas (pesadas o contadas), informa faltantes, imprime la lista de entrega (DOC-02). | Tablet o celular en el depósito, o la hoja impresa. | Ver cualquier precio, costo, margen o deuda. |
| **REPARTIDOR** | Chofer o persona que entrega. | Pasos 9–10: sigue su hoja de ruta (DOC-04), entrega con la lista de entrega sin precios (DOC-02), confirma la entrega (quién recibió, hora, firma o foto, diferencias). | Celular. | Ver cualquier precio, costo, margen o deuda; ver repartos de otros repartidores. |
| **ADMINISTRATIVO** | Persona de administración / contable interna. | Pasos 7, 11–12: registra pagos a proveedores, controla cuentas corrientes y vencimientos, emite la lista contable (DOC-03) y el comprobante interno, exporta ventas para el contador, reportes. | PC con impresora. | Cambiar reglas de precios o configuración (salvo que el ADMIN se lo otorgue). |

---

## 3. Uso real

Lo usan **dos personas, las dos ADMIN** (el dueño y su esposa); Facundo, el desarrollador, también es ADMIN. La interfaz no muestra roles: toda persona que se habilita queda ADMIN. Los roles y permisos que siguen están en la base y en el código por si algún día entra alguien con acceso limitado (por ejemplo, un repartidor que solo vea sus entregas).

---

## 4. Catálogo de permisos

Columna **Auditado**: la acción deja registro en `auditoria` con usuario, fecha, valores antes/después y, cuando corresponde, motivo obligatorio. Columna **Clase de datos**: ver sección 7.

### 4.1 Catálogo, clientes y proveedores

| Clave | Descripción | Auditado | Clase de datos |
|---|---|---|---|
| `productos.ver` | Ver el catálogo de productos, categorías y presentaciones (sin precios; los precios se ven solo con los permisos de `precios.*`). | No | O |
| `productos.editar` | Crear, editar y desactivar productos, categorías y presentaciones (nombre, unidad base, presentaciones y factor, alícuota de IVA, proveedor preferido). | Sí | O |
| `clientes.ver` | Ver la ficha de clientes y puntos de entrega (contacto, dirección, horario, datos fiscales). | No | O |
| `clientes.editar` | Crear, editar y desactivar clientes y puntos de entrega (incluye prioridad para faltantes y periodicidad de facturación; **no** incluye recargos). | Sí | O |
| `proveedores.ver` | Ver proveedores, ubicación en el mercado y qué productos vende cada uno. | No | O |
| `proveedores.editar` | Crear, editar y desactivar proveedores (datos generales) y dar de alta sus ofertas (qué productos vende y en qué presentación; el precio requiere `precios.editar_compra`). | Sí | O |
| `proveedores.ver_credito` | Ver límite de crédito, crédito utilizado, crédito disponible, semáforo y deuda vencida de cada proveedor. | No | F |
| `proveedores.editar_limite` | Modificar `limite_credito` y `plazo_pago_dias` de un proveedor. | Sí | F |

### 4.2 Precios

| Clave | Descripción | Auditado | Clase de datos |
|---|---|---|---|
| `precios.ver_costos` | Ver precios de compra, costo por unidad base, costo de referencia y costo real, historial de precios, comparador entre proveedores, lista general de precios de compra (DOC-06). | No | C |
| `precios.ver_venta` | Ver precios de venta estimados y congelados, importes de pedidos, entregas y facturas, y el **origen** de la regla aplicada (nivel y descripción). | No | V |
| `precios.ver_margenes` | Ver recargos aplicados, reglas de precio, margen en $ y % por línea, entrega, cliente y producto; alertas de margen. | No | M |
| `precios.editar_compra` | Actualizar precios de compra: individual, masivo, "confirmar sin cambios" e importación de planilla. | Sí | C |
| `precios.editar_reglas` | Crear y modificar recargos (global, categoría, producto, cliente) y reglas por cliente (RECARGO y PRECIO_FIJO). | Sí | M |
| `precios.override_linea` | Fijar manualmente el precio de una línea de pedido o de entrega, con motivo obligatorio. | Sí | V |

### 4.3 Pedidos, jornada y lista de compra

| Clave | Descripción | Auditado | Clase de datos |
|---|---|---|---|
| `pedidos.ver` | Ver pedidos de todos los clientes y su estado. | No | O (V si además tiene `precios.ver_venta`) |
| `pedidos.crear` | Crear pedidos (BORRADOR) y cargar líneas. | No | O |
| `pedidos.editar` | Modificar pedidos en BORRADOR o CONFIRMADO (líneas, cantidades, observaciones, punto de entrega). | Solo si está CONFIRMADO | O |
| `pedidos.confirmar` | Pasar un pedido de BORRADOR a CONFIRMADO (entra en la lista de compra). | No | O |
| `pedidos.editar_en_curso` | Modificar pedidos EN_COMPRA; cargar pedidos (o agregar líneas) en jornadas PREPARANDO o REPARTIENDO (afecta la lista de compra o la preparación en curso). | Sí | O |
| `pedidos.cancelar` | Cancelar pedidos en BORRADOR, CONFIRMADO o EN_COMPRA, con motivo. | Sí | O |
| `jornada.ver` | Ver jornadas y su estado. | No | O |
| `jornada.gestionar` | Iniciar la preparación y avanzar manualmente el estado de la jornada cuando no lo hace una acción (ver 04-procesos-y-flujos.md). | Sí | O |
| `jornada.cerrar` | Cerrar la jornada (REPARTIENDO → CERRADA) con sus validaciones y resumen. | Sí | O |
| `jornada.reabrir` | Reabrir una jornada CERRADA (para correcciones), con motivo. | Sí | O |
| `lista_compra.ver` | Ver la lista de compra (productos y cantidades; los precios sugeridos solo con `precios.ver_costos`). | No | O |
| `lista_compra.generar` | Generar o regenerar la lista de compra de una jornada a partir de los pedidos. | Sí | O |
| `lista_compra.editar` | Ajustar cantidad a comprar, presentación o proveedor sugerido, asignar comprador, marcar NO_CONSEGUIDO. | Sí | O |

### 4.4 Compras y cuentas corrientes de proveedores

| Clave | Descripción | Auditado | Clase de datos |
|---|---|---|---|
| `compras.ver` | Ver compras registradas con sus importes y estado de pago. | No | C |
| `compras.registrar` | Registrar compras (CONTADO, CREDITO o MIXTA), incluido el pago en el momento. | Sí (si cambia el precio de lista) | C |
| `compras.anular` | Anular una compra con motivo (genera movimiento compensatorio en la cuenta del proveedor). | Sí | C |
| `compras.exceder_limite` | Confirmar una compra a crédito que supera el límite del proveedor, con motivo. | Sí | F |
| `pagos.ver` | Ver la cuenta corriente de cada proveedor: movimientos, pagos, imputaciones, vencimientos, historial. | No | F |
| `pagos.registrar` | Registrar pagos a proveedores e imputarlos (FIFO automático o manual). | Sí | F |
| `pagos.anular` | Anular un pago con motivo (genera movimiento compensatorio) y reimputar pagos. | Sí | F |
| `pagos.ajustar` | Registrar ajustes de cuenta corriente (débito/crédito, ej. nota de crédito del proveedor) y saldos iniciales. | Sí | F |

### 4.5 Preparación, repartos y entregas

| Clave | Descripción | Auditado | Clase de datos |
|---|---|---|---|
| `preparacion.ver` | Ver la hoja de preparación por cliente (sin precios). | No | O |
| `preparacion.registrar` | Iniciar la preparación de una entrega, cargar cantidades preparadas, faltantes y sustituciones, pasar la entrega a PREPARADA. | No | O |
| `preparacion.asignar_faltantes` | Decidir cómo se reparte un producto faltante entre clientes (por prioridad o manual). | Sí | O |
| `repartos.ver` | Ver todos los repartos (hojas de ruta) de una jornada. | No | O |
| `repartos.ver_propios` | Ver solo los repartos asignados al propio usuario y marcar su salida ("Salir") y su regreso. | No | O |
| `repartos.gestionar` | Crear hojas de ruta, asignar repartidor, vehículo, entregas y orden de visita. | No | O |
| `entregas.ver` | Ver entregas, sus cantidades y su estado (datos operativos). | No | O |
| `entregas.gestionar` | Armar entregas a partir de pedidos (agrupar pedidos del mismo cliente y punto de entrega) y pasarlas a EN_REPARTO. | No | O |
| `entregas.emitir_documentos` | Emitir y reemitir los documentos de una entrega: genera **juntos** DOC-02 y DOC-03 de la misma versión y congela los precios. Quien emite sin `documentos.imprimir_contable` recibe solo DOC-02; DOC-03 queda guardado para quien pueda verlo. | Sí | O |
| `entregas.confirmar` | Confirmar la entrega en el lugar: quién recibió, hora, firma o foto, diferencias y rechazos. | Sí (si hay diferencias) | O |
| `entregas.corregir` | Corregir una entrega cuyos documentos ya se emitieron (nueva versión y reemisión de DOC-02 y DOC-03). | Sí | O |
| `entregas.anular` | Anular una entrega con motivo. | Sí | O |

### 4.6 Documentos, facturación, cobranzas y stock

| Clave | Descripción | Auditado | Clase de datos |
|---|---|---|---|
| `documentos.imprimir_compra` | Imprimir/descargar DOC-01 Lista de compra y DOC-06 Lista general de precios de compra (los precios solo aparecen si además tiene `precios.ver_costos`). | No | O / C |
| `documentos.imprimir_entrega` | Ver, imprimir y descargar DOC-02 Lista de entrega, DOC-04 Hoja de ruta y DOC-07 Hoja de preparación (todos sin precios). | Sí (reimpresión) | O |
| `documentos.imprimir_contable` | Ver, imprimir y descargar DOC-03 Lista contable (remito valorizado), DOC-08 Comprobante interno de venta y demás documentos valorizados de venta. | Sí (reimpresión) | V |
| `documentos.imprimir_cuenta` | Imprimir/descargar DOC-05 Estado de cuenta de proveedor. | No | F |
| `documentos.anular` | Anular un documento emitido (queda registrado como ANULADO, no se borra). | Sí | O |
| `facturacion.ver` | Ver ventas por entrega, entregas sin facturar y comprobantes. | No | V |
| `facturacion.emitir` | Emitir el comprobante interno que agrupa una o más entregas. | Sí | V |
| `facturacion.anular` | Anular un comprobante con motivo (las entregas vuelven a SIN_FACTURAR). | Sí | V |
| `facturacion.exportar` | Exportar ventas y comprobantes para el contador (CSV/Excel). | Sí | V |
| `cobranzas.ver` | Reservado, sin uso. Ver cuenta corriente de clientes y cobros. | No | F |
| `cobranzas.registrar` | Reservado, sin uso. Registrar cobros de clientes e imputarlos a comprobantes. | Sí | F |
| `cobranzas.anular` | Reservado, sin uso. Anular cobros con motivo. | Sí | F |
| `stock.ver` | Reservado, sin uso. Ver sobrantes y mermas (cantidades). | No | O |
| `stock.ajustar` | Reservado, sin uso. Registrar sobrantes, mermas y devoluciones. | Sí | O |

### 4.7 Reportes, configuración, usuarios y auditoría

| Clave | Descripción | Auditado | Clase de datos |
|---|---|---|---|
| `reportes.ver` | Ver reportes (los montos visibles dependen de `precios.ver_venta`, `precios.ver_costos` y `precios.ver_margenes`). | No | V / C / M |
| `reportes.exportar` | Exportar reportes a CSV/Excel. | Sí | V / C / M |
| `configuracion.ver` | Ver la configuración de la empresa. | No | M |
| `configuracion.editar` | Modificar configuración: moneda, zona horaria, recargo global, estrategia de costo, redondeo, umbrales del semáforo, margen mínimo, numeración, módulos habilitados. | Sí | M |
| `usuarios.administrar` | Dar de alta, desactivar y reactivar usuarios; asignar roles; crear y editar roles personalizados; cerrar sesiones de otros. | Sí | P |
| `auditoria.ver` | Consultar el registro de auditoría. | No | P |

**Notas y actividad (28/09/2026).** No tienen permisos propios: cualquiera con sesión puede escribir notas y ver la actividad, pero una nota o una entrada de actividad solo se muestra —y solo se puede escribir una nota— si la persona puede ver lo que nombra (pedido → `pedidos.ver`, cliente → `clientes.ver`, proveedor → `proveedores.ver`, producto → `productos.ver`, compra → `compras.ver`, pago → `pagos.ver`, entrega → `entregas.ver`, reparto → `repartos.ver`, día → `jornada.ver`, lista de compra → `lista_compra.ver`, comprobante → `facturacion.ver`, usuario → `usuarios.administrar`; el REPARTIDOR, solo las entregas de sus repartos). Una nota la borra solo quien la escribió. Marcar la ubicación de un punto de entrega pide `clientes.editar` o `entregas.confirmar` (el repartidor en el lugar); la del depósito, `configuracion.editar`.

---

## 5. Matriz rol × permiso

Referencias: **Sí** = incluido por defecto en el rol. **Opc.** = no viene por defecto, pero el ADMIN puede agregarlo al rol o darle al usuario un rol adicional. **—** = no corresponde a la tarea (se puede agregar solo mediante otro rol). **Nunca** = el sistema impide agregarlo a este rol (ver sección 6). ADMIN tiene todos los permisos, incluidos los futuros.

| Permiso | ADMIN | VENDEDOR | COMPRADOR | PREPARADOR | REPARTIDOR | ADMINISTRATIVO |
|---|---|---|---|---|---|---|
| productos.ver | Sí | Sí | Sí | Opc. | — | Sí |
| productos.editar | Sí | — | Sí | — | — | Opc. |
| clientes.ver | Sí | Sí | — | — | — | Sí |
| clientes.editar | Sí | Sí | — | — | — | Sí |
| proveedores.ver | Sí | — | Sí | — | — | Sí |
| proveedores.editar | Sí | — | Sí | — | — | Opc. |
| proveedores.ver_credito | Sí | — | Sí | Nunca | Nunca | Sí |
| proveedores.editar_limite | Sí | — | — | Nunca | Nunca | Opc. |
| precios.ver_costos | Sí | — | Sí | Nunca | Nunca | Sí |
| precios.ver_venta | Sí | Sí | Opc. | Nunca | Nunca | Sí |
| precios.ver_margenes | Sí | — | — | Nunca | Nunca | Opc. |
| precios.editar_compra | Sí | — | Sí | Nunca | Nunca | — |
| precios.editar_reglas | Sí | — | — | Nunca | Nunca | — |
| precios.override_linea | Sí | Opc. | — | Nunca | Nunca | — |
| pedidos.ver | Sí | Sí | Opc. | — | — | Sí |
| pedidos.crear | Sí | Sí | — | — | — | Opc. |
| pedidos.editar | Sí | Sí | — | — | — | Opc. |
| pedidos.confirmar | Sí | Sí | — | — | — | Opc. |
| pedidos.editar_en_curso | Sí | Opc. | — | — | — | — |
| pedidos.cancelar | Sí | Sí | — | — | — | Opc. |
| jornada.ver | Sí | Sí | Sí | Sí | Sí | Sí |
| jornada.gestionar | Sí | — | Opc. | Sí | — | Opc. |
| jornada.cerrar | Sí | — | — | — | — | Sí |
| jornada.reabrir | Sí | — | — | — | — | — |
| lista_compra.ver | Sí | Opc. | Sí | Opc. | — | Opc. |
| lista_compra.generar | Sí | Opc. | Sí | — | — | — |
| lista_compra.editar | Sí | — | Sí | — | — | — |
| compras.ver | Sí | — | Sí | Nunca | Nunca | Sí |
| compras.registrar | Sí | — | Sí | Nunca | Nunca | Sí |
| compras.anular | Sí | — | Opc. | Nunca | Nunca | Sí |
| compras.exceder_limite | Sí | — | Opc. | Nunca | Nunca | — |
| pagos.ver | Sí | — | Opc. | Nunca | Nunca | Sí |
| pagos.registrar | Sí | — | Opc. | Nunca | Nunca | Sí |
| pagos.anular | Sí | — | — | Nunca | Nunca | Sí |
| pagos.ajustar | Sí | — | — | Nunca | Nunca | Sí |
| preparacion.ver | Sí | — | Opc. | Sí | — | — |
| preparacion.registrar | Sí | — | — | Sí | — | — |
| preparacion.asignar_faltantes | Sí | — | Opc. | Opc. | — | — |
| repartos.ver | Sí | Opc. | — | Opc. | — | Opc. |
| repartos.ver_propios | Sí | — | — | — | Sí | — |
| repartos.gestionar | Sí | — | — | Opc. | — | Sí |
| entregas.ver | Sí | Sí | — | Sí | Sí | Sí |
| entregas.gestionar | Sí | — | — | Sí | — | Opc. |
| entregas.emitir_documentos | Sí | — | — | Sí | — | Sí |
| entregas.confirmar | Sí | — | — | — | Sí | Opc. |
| entregas.corregir | Sí | — | — | — | — | Sí |
| entregas.anular | Sí | — | — | — | — | Opc. |
| documentos.imprimir_compra | Sí | — | Sí | — | — | Opc. |
| documentos.imprimir_entrega | Sí | Sí | — | Sí | Sí | Sí |
| documentos.imprimir_contable | Sí | Opc. | — | Nunca | Nunca | Sí |
| documentos.imprimir_cuenta | Sí | — | Opc. | Nunca | Nunca | Sí |
| documentos.anular | Sí | — | — | — | — | Opc. |
| facturacion.ver | Sí | Opc. | — | Nunca | Nunca | Sí |
| facturacion.emitir | Sí | — | — | Nunca | Nunca | Sí |
| facturacion.anular | Sí | — | — | Nunca | Nunca | Opc. |
| facturacion.exportar | Sí | — | — | Nunca | Nunca | Sí |
| cobranzas.ver (reservado) | Sí | Opc. | — | Nunca | Nunca | Sí |
| cobranzas.registrar (reservado) | Sí | — | — | Nunca | Nunca | Sí |
| cobranzas.anular (reservado) | Sí | — | — | Nunca | Nunca | Opc. |
| stock.ver (reservado) | Sí | — | Sí | Sí | — | Opc. |
| stock.ajustar (reservado) | Sí | — | Opc. | Opc. | — | — |
| reportes.ver | Sí | Opc. | Opc. | Nunca | Nunca | Sí |
| reportes.exportar | Sí | — | — | Nunca | Nunca | Sí |
| configuracion.ver | Sí | — | — | Nunca | Nunca | Opc. |
| configuracion.editar | Sí | — | — | Nunca | Nunca | — |
| usuarios.administrar | Sí | — | — | Nunca | Nunca | — |
| auditoria.ver | Sí | — | — | Nunca | Nunca | Opc. |

Observaciones:

- `reportes.ver` para VENDEDOR o COMPRADOR muestra solo los montos que sus otros permisos habilitan (el VENDEDOR ve ventas pero no costos ni márgenes; el COMPRADOR ve compras pero no ventas).
- `compras.exceder_limite` como opcional del COMPRADOR se recomienda solo para un comprador de confianza (en la práctica, el dueño cuando compra él mismo ya lo tiene como ADMIN).
- El pago en el momento de una compra CONTADO o MIXTA se registra con `compras.registrar`; los pagos posteriores requieren `pagos.registrar`.
- Los valores por defecto recogen las sugerencias de roles de 07-reglas-de-negocio.md (sección "Permisos referenciados"); esta matriz es la asignación definitiva.
- `precios.ver_venta` muestra el precio y el **origen** de la regla (nivel y descripción, ej. "Precio fijo — Licitación 45/2026"); el porcentaje de recargo, el recargo equivalente y el margen requieren `precios.ver_margenes`.

---

## 6. Permisos prohibidos para PREPARADOR y REPARTIDOR

Los roles de sistema PREPARADOR y REPARTIDOR **no tienen** ningún permiso de las clases V, C, M, F o P (sección 7). Concretamente: todos los `precios.*`, `proveedores.ver_credito`, `proveedores.editar_limite`, `compras.*`, `pagos.*`, `documentos.imprimir_contable`, `documentos.imprimir_cuenta`, `facturacion.*`, `cobranzas.*`, `reportes.*`, `configuracion.*`, `usuarios.administrar`, `auditoria.ver`.

Si una persona necesita, por ejemplo, preparar y además facturar, se le asignan **dos roles** (PREPARADOR + ADMINISTRATIVO). Aun así, en las pantallas de preparación y reparto esa persona **no verá precios**, porque esas pantallas no los consultan (principio 3).

---

## 7. Visibilidad a nivel de campo

### 7.1 Clases de datos

| Clase | Qué incluye (campos de 03-modelo-de-datos.md) | Permiso que habilita verla | PREPARADOR / REPARTIDOR |
|---|---|---|---|
| **O — Operativo** | Producto (nombre, presentación, unidad base), cantidades (pedida, preparada, entregada), cliente (nombre), punto de entrega (dirección, horario, contacto, instrucciones), observaciones, estados, orden en el reparto, vehículo, quién recibió. | El permiso del módulo (`preparacion.ver`, `repartos.ver_propios`, `entregas.ver`, etc.). | Sí, solo lo necesario para su tarea. |
| **V — Precio de venta** | `pedido_item.precio_estimado`, `subtotal_estimado`, `origen_regla_estimada`; `pedido.total_estimado`; `entrega_item.precio_unitario`, `importe`, `origen_regla`; `entrega.importe_neto`, `importe_iva`, `importe_total`; `factura.importe_*`; `factura_entrega.importe_total`. | `precios.ver_venta` | **Nunca** |
| **C — Costo** | `proveedor_producto.precio_vigente`, `costo_base`, `precio_anterior`; todo `historial_precio_compra`; `compra.total`, `monto_pagado_en_el_acto`; `compra_item.precio_unitario`, `costo_base`, `subtotal`; `lista_compra_item.precio_sugerido`, `costo_estimado`; `pedido_item.costo_estimado`; `entrega_item.costo_unitario`; `entrega.costo_total`. | `precios.ver_costos` | **Nunca** |
| **M — Margen y reglas** | `recargo_default` de empresa, categoría, producto y cliente; `empresa.recargo_global`, `margen_minimo_pct`; toda `regla_precio`; `pedido_item.recargo_estimado`; `entrega_item.recargo_aplicado`; alertas de margen (`alertas` de `pedido_item` y `entrega_item`); margen en $ y %. | `precios.ver_margenes` (ver) / `precios.editar_reglas` (editar) | **Nunca** |
| **F — Financiero** | `proveedor.limite_credito`, `plazo_pago_dias`, `saldo_actual`; saldo pendiente, crédito disponible, semáforo, deuda vencida; `pago_proveedor`, `imputacion_pago_proveedor`, `movimiento_cuenta_proveedor`; estado de pago de compras. | `proveedores.ver_credito`, `pagos.ver`, `cobranzas.ver` | **Nunca** |
| **P — Personal y seguridad** | Usuarios, roles, permisos, auditoría, direcciones IP y dispositivos. | `usuarios.administrar`, `auditoria.ver` | **Nunca** |

### 7.2 Qué ve cada rol en pantallas compartidas (ejemplos)

| Pantalla / documento | ADMIN | VENDEDOR | COMPRADOR | PREPARADOR | REPARTIDOR | ADMINISTRATIVO |
|---|---|---|---|---|---|---|
| Detalle de pedido | Todo | Cantidades + precio estimado + origen de la regla | Cantidades (si tiene `pedidos.ver`) | No accede | No accede | Cantidades + precio estimado |
| Lista de compra (pantalla y DOC-01) | Todo | Cantidades (si Opc.) | Cantidades + proveedor sugerido + precio sugerido + crédito disponible | Cantidades (si Opc.) | No accede | Cantidades (si Opc.) |
| Hoja de preparación (DOC-07) | Solo cantidades | No accede | Solo cantidades (si Opc.) | Solo cantidades | No accede | No accede |
| Hoja de ruta (DOC-04) y confirmación | Solo operativo | No accede | No accede | Solo operativo (si Opc.) | Solo operativo, solo sus repartos | Solo operativo (si Opc.) |
| Lista de entrega (DOC-02) | Sin precios | Sin precios | No accede | Sin precios | Sin precios | Sin precios |
| Lista contable (DOC-03) | Con precios | Con precios (si Opc.) | No accede | No accede (403) | No accede (403) | Con precios |
| Ficha de proveedor | Todo | No accede | Datos + productos + precios + crédito | No accede | No accede | Datos + precios + cuenta corriente |
| Ficha de producto (R14) | Todo | Datos + precio de venta por cliente | Datos + proveedores + precios de compra | Datos básicos (si Opc.) | No accede | Datos + costos + ventas |

---

## 8. Cómo se garantiza en el servidor

"Ocultar en la pantalla" no alcanza: cualquier dato enviado al navegador (incluido el payload interno de React) puede verse con las herramientas del navegador. Por eso la regla es: **lo que un usuario no puede ver, nunca sale del servidor**.

| # | Capa | Cómo funciona |
|---|---|---|
| 1 | **Consultas operativas sin precios** | Las pantallas de preparación, reparto y confirmación, y los documentos DOC-02, DOC-04 y DOC-07, se arman con consultas que seleccionan columnas explícitas sin precio, costo, margen ni deuda (`lineasOperativas` y las de `src/modulos/entregas`). Vale para todos los usuarios, incluido el ADMIN. |
| 2 | **Permiso en cada acción y página** | Cada caso de uso abre su transacción con el permiso que exige (`ejecutarComoUsuario(…, "compras.registrar", …)`); sin el permiso responde "sin permiso" y no graba nada. Las páginas piden su permiso al cargarse. |
| 3 | **Frontera servidor/navegador** | Los Server Components pasan a los componentes del navegador solo los datos que la pantalla muestra, nunca filas completas. |
| 4 | **Documentos del servidor** | Las vistas de impresión usan las mismas consultas operativas o valorizadas según el documento; la de DOC-03 exige `documentos.imprimir_contable`. |
| 5 | **Sin caché compartida** | Las páginas con sesión son dinámicas: nada se cachea entre usuarios. |
| 6 | **Pruebas de fuga** | Las pruebas de integración recorren las consultas de preparación y reparto y fallan si aparece un precio o un importe. |

Alcance por filas además de columnas:

- **REPARTIDOR:** solo ve sus repartos y las entregas de esos repartos, aunque tenga `entregas.ver` (RN-131). Si intenta abrir otro, recibe "no encontrado".
- **Empresa:** todo queda limitado por `empresa_id` con RLS (01 §8).

## 9. Combinación de roles

Un usuario puede tener varios roles; sus permisos son la unión. Las pantallas de preparación y reparto siguen sin precios aunque la persona tenga permisos de precios por otro rol.

---

## 10. Cuentas y acceso

No hay correos del sistema: ni invitaciones ni recuperación de contraseña por correo.

### 10.1 Primer uso

Mientras el sistema no está configurado, el ingreso lleva a `/configuracion-inicial`: nombre, usuario y contraseña de quien lo abre por primera vez y, opcional, el nombre del negocio. El servidor crea la cuenta en Supabase Auth, la empresa principal (id fijo: se puede crear una sola vez) y el usuario ADMIN, y entra directo. Después esa pantalla deja de existir.

### 10.2 Cada persona entra por su cuenta

Quien quiere entrar toca **Entrar con Google** (vuelve por `/auth/callback`; el botón aparece solo si Google está activado en Supabase) o **Crear una cuenta** (`/crear-cuenta`: nombre, usuario y contraseña). En los dos casos queda un **pedido de acceso** y la persona ve `/acceso-pendiente` hasta que alguien con `usuarios.administrar` lo **habilita** en Usuarios (queda ADMIN) o lo **rechaza** (la cuenta queda bloqueada). Como mucho 5 pedidos sin responder; el inicio avisa cuando hay pedidos.

Un nombre de usuario se guarda en Supabase Auth como un correo interno que no se entrega (`nombre@sistema-juan.interno`); al entrar se escribe solo el nombre. Las cuentas las crea el servidor con la clave secreta de Supabase, nunca el navegador.

### 10.3 Reglas

| # | Regla |
|---|---|
| 1 | Solo quien tiene `usuarios.administrar` habilita, rechaza o quita el acceso. |
| 2 | Siempre queda **al menos un ADMIN activo**: el sistema no deja quitarle el acceso al último. |
| 3 | **Quitar el acceso** no borra a la persona: su nombre sigue en pedidos, compras y auditoría. |
| 4 | **Olvidó la contraseña:** "Darle una clave provisoria" (8 letras fáciles de dictar, se muestra una vez); en el próximo ingreso la persona elige una nueva (`/crear-clave`). Cada uno cambia la suya en "Mi cuenta". |

---

## 11. Sesiones

| Tema | Definición |
|---|---|
| Duración | La sesión queda abierta en cada dispositivo (Supabase renueva el acceso solo): en el mercado de madrugada no hay que volver a escribir la contraseña. Se entra desde cualquier dispositivo, las veces que haga falta. |
| Salir | "Salir" en la barra de arriba cierra la sesión de ese dispositivo. |
| Qué se audita de usuarios | Habilitar o rechazar un pedido de acceso, clave provisoria nueva, quitar el acceso. |

---

## 12. Casos de prueba de permisos

Estos casos están automatizados como pruebas de integración.

| # | Usuario | Acción | Resultado esperado |
|---|---|---|---|
| 1 | PREPARADOR | Abre la hoja de preparación de la jornada 24/09. | Ve productos, cantidades, clientes y observaciones; ningún campo de precio en la respuesta ni en el payload. |
| 2 | PREPARADOR | Escribe a mano la dirección de la lista contable (DOC-03) de una entrega. | Sin permiso, sin datos. |
| 3 | REPARTIDOR | Abre un reparto asignado a otro repartidor. | 404. |
| 4 | REPARTIDOR | Confirma una entrega con 2 lechugas rechazadas. | Se registra la diferencia; la pantalla de confirmación no muestra importes. |
| 5 | VENDEDOR | Abre la lista general de precios de compra (DOC-06). | 403. |
| 6 | VENDEDOR | Abre un pedido. | Ve precio estimado y origen de la regla; no ve costo ni recargo. |
| 7 | COMPRADOR | Registra una compra a crédito que supera el límite del proveedor. | Bloqueo con mensaje de límite; no se graba. |
| 8 | ADMIN | Misma compra, con motivo. | Se graba; `compra.excede_limite = true`; fila en auditoría `EXCESO_LIMITE`. |
| 9 | Usuario con PREPARADOR + VENDEDOR | Abre la preparación y luego un pedido. | Preparación sin precios; pedido con precio estimado. |
| 10 | ADMIN | Intenta desactivarse siendo el único ADMIN. | Rechazado. |
| 11 | Usuario desactivado | Hace cualquier pedido al servidor con una sesión abierta. | 401 y sesión cerrada. |
| 12 | Usuario de la empresa A | Abre la entrega de la empresa B por id. | 404 (RLS no devuelve filas). |
