# 08 · Pantallas y acciones

> **Propósito:** qué pantallas tiene el sistema, qué muestra cada una, qué se puede hacer (con el permiso y la regla que la controla) y cómo se llega. Describe lo que está construido.

## Contenido

1. [Principios de diseño](#1-principios-de-diseño)
2. [Navegación](#2-navegación)
3. [Mapa de pantallas](#3-mapa-de-pantallas)
4. [Piezas comunes](#4-piezas-comunes)
5. [Detalle de pantallas](#5-detalle-de-pantallas)
6. [Acceso por rol](#6-acceso-por-rol)
7. [Mensajes](#7-mensajes)
8. [Metas de uso](#8-metas-de-uso)

Documentos relacionados: 02 (permisos), 04 (qué hace cada paso), 05 (precios), 06 (cuentas con proveedores), 07 (reglas RN-xxx), 09 (documentos imprimibles).

---

## 1. Principios de diseño

| # | Principio | Cómo se aplica |
|---|---|---|
| 1 | **Celular y computadora** | Lo que se usa en el mercado, el depósito y el reparto (tablero, carga de pedidos, lista de compras, preparación, viaje, confirmar entrega) se piensa primero para el celular; precios, cuentas, facturación y balance, para la PC, y se reacomodan en el celular. |
| 2 | **Grande y despejado** | Botones de al menos 48 px, texto de 16 px o más, recuadros grandes con dibujos, sin renglones vacíos de relleno: lo opcional se agrega cuando hace falta ("＋ Agregar otro producto", "Otro puesto…") o queda plegado en "Más opciones". |
| 3 | **El servidor decide qué se ve** | Cada pantalla recibe solo lo que el usuario puede ver (02 §8). |
| 4 | **Preparación y reparto sin precios, siempre** | Aunque las abra el dueño (02 §1, principio 3). |
| 5 | **Nada se borra** | Los documentos se anulan con motivo; clientes, productos y proveedores se desactivan. Solo se sacan productos de un pedido que todavía no se preparó. |
| 6 | **Estados con color, dibujo y texto** | Nunca solo color. Colores pastel por etapa, como las etiquetas de Trello. |
| 7 | **El precio dice de dónde sale** | Todo precio de venta lleva su origen ("Ganancia del cliente") y, si todavía puede cambiar, "estimado" (05 §7). |
| 8 | **Confirmar solo cuando hace falta** | Los avisos se muestran en línea; piden un toque más solo cuando la regla lo exige (variación brusca, margen negativo, límite de crédito). |
| 9 | **Guardado seguro** | Pedidos: se guardan completos o nada. Compras, pagos y confirmaciones: clave de idempotencia (un doble toque no duplica). |
| 10 | **Idioma** | Español rioplatense con voseo; números a la argentina ("17.550", "1.234,56"); pesos sin decimales en pantalla. |

---

## 2. Navegación

### 2.1 Disposición

| Elemento | En la PC | En el celular |
|---|---|---|
| Menú | Lateral izquierdo, con dibujo en cada entrada; la pantalla actual queda marcada. | Botón "Menú" arriba. |
| Barra superior | Nombre del sistema, 🔔 notas sin leer, la persona (lleva a Mi cuenta) y "Salir". | Igual. |
| Elegir el día | En el tablero: Hoy, Mañana y "📅 Otros días". | Igual. |
| Imprimir | Botón **🖨️ Imprimir** en cada pantalla con documento: abre la vista A4 y el diálogo del navegador ("Guardar como PDF" para compartir). | Igual. |

### 2.2 Menú

| Grupo | Pantallas | Visible si el usuario tiene… |
|---|---|---|
| Día de trabajo | Tablero de pedidos · **＋ Nuevo pedido** (destacado) · 🛒 Lista de compras · Viaje de entrega · Mi reparto (solo para quien no maneja todos los repartos) · Actividad y notas | Sesión · `pedidos.crear` · `lista_compra.ver` · `repartos.ver` · `repartos.ver_propios` sin `repartos.gestionar` · Sesión |
| Registros | Clientes · Productos · Proveedores | `clientes.ver` · `productos.ver` · `proveedores.ver` |
| Cuentas | Balance · Deudas con proveedores · Facturación | `reportes.ver` · `pagos.ver` · `facturacion.ver` |

Los grupos sin ninguna pantalla visible no aparecen. Lo demás se abre desde donde se usa:

| Pantalla | Se llega desde |
|---|---|
| El día paso a paso | Pestaña "☰ Paso a paso" del tablero |
| Otros días (jornadas) y cierre del día | "📅 Otros días" del tablero; paso "Cierre" |
| Compras anotadas | Lista de compras |
| Preparación | Columnas "Comprado" y "Preparando" del tablero; tarjeta abierta; paso a paso |
| Repartos y entregas | Viaje de entrega, preparación, paso a paso |
| Precios de compra | Productos, ficha del proveedor |
| Precios de venta | Productos ("Precios de venta") |
| Movimientos y reportes | Balance |
| Usuarios y configuración | Mi cuenta → Administración |

---

## 3. Mapa de pantallas

Enfoque: **M** = celular primero; **D** = PC primero (usable en celular); **M/D** = los dos. Clases de datos (02 §7): O operativo, V precio de venta, C costo, M margen, F financiero, P personal.

| ID | Pantalla | Ruta | Enfoque | Permiso para abrir | Datos |
|---|---|---|---|---|---|
| P-01 | Ingreso, crear cuenta, primer uso | `/login`, `/crear-cuenta`, `/crear-clave`, `/acceso-pendiente`, `/configuracion-inicial` | M/D | Pública | — |
| P-02 | Tablero de pedidos y el día paso a paso | `/inicio`, `?fecha=`, `?vista=pasos`, `?pedido=` | M/D | Sesión | O +V +C +F |
| P-03 | Mi cuenta | `/mi-cuenta` | M/D | Sesión | P (propios) |
| P-10 | Productos (y nuevo producto) | `/productos`, `/productos/nuevo` | D | `productos.ver` | O +C |
| P-11 | Ficha de producto | `/productos/[id]` | D | `productos.ver` | O +C +V +M |
| P-12 | Categorías | `/productos/categorias` | D | `productos.ver` | O +M |
| P-15 | Clientes (y nuevo cliente) | `/clientes`, `/clientes/nuevo` | M/D | `clientes.ver` | O |
| P-16 | Ficha de cliente | `/clientes/[id]` | M/D | `clientes.ver` | O +V +M |
| P-20 | Proveedores (y nuevo proveedor) | `/proveedores`, `/proveedores/nuevo` | D | `proveedores.ver` | O +F |
| P-21 | Ficha de proveedor | `/proveedores/[id]` | D | `proveedores.ver` | O +C +F |
| P-25 | Lista general de precios de compra | `/precios/compra` | D | `precios.ver_costos` | C +F |
| P-26 | Precios en el puesto | `/precios/compra/rapida` | M | `precios.editar_compra` | C |
| P-29 | Historial de precios de un producto | `/precios/compra/historial/[id]` | D | `precios.ver_costos` | C |
| P-32 | Precios de venta | `/precios/venta` | D | `precios.ver_margenes` | M +V +C |
| P-40 | Lista de pedidos | `/pedidos` | M/D | `pedidos.ver` | O +V |
| P-41 | Nuevo pedido y cambiar productos | `/pedidos/nuevo`, `/pedidos/[id]/cambiar` | M | `pedidos.crear` o `pedidos.editar` | O +V |
| P-42 | Detalle de pedido | `/pedidos/[id]` | M/D | `pedidos.ver` | O +V +C +M |
| P-45 | Otros días | `/jornadas` | M/D | `jornada.ver` | O |
| P-46 | Resumen de un día | `/jornadas/[fecha]` | M/D | `jornada.ver` | O +V +C |
| P-47 | Cierre del día | `/jornadas/[fecha]/cierre` | D | `jornada.cerrar` | O V C M F |
| P-50 | Lista de compras | `/lista-compra` | M | `lista_compra.ver` | O +C +F |
| P-55 | Anotar una compra suelta | `/compras/nueva` | M | `compras.registrar` | C +F |
| P-56 | Compras anotadas | `/compras` | D | `compras.ver` | C +F |
| P-57 | Detalle de compra | `/compras/[id]` | M/D | `compras.ver` | C +F |
| P-60 | Deudas con proveedores | `/cuentas-proveedores` | D | `pagos.ver` | F |
| P-61 | Cuenta del proveedor | `/cuentas-proveedores/[id]` | D | `pagos.ver` | F C |
| P-62 | Registrar pago | `/cuentas-proveedores/[id]/pago` | D | `pagos.registrar` | F |
| P-63 | Ajuste o deuda anterior | `/cuentas-proveedores/[id]/ajuste` | D | `pagos.ajustar` | F |
| P-64 | Detalle de pago | `/cuentas-proveedores/pagos/[id]` | D | `pagos.ver` | F |
| P-70 | Preparación del día | `/preparacion/[fecha]` | M | `preparacion.ver` | O |
| P-71 | Preparar el pedido de un cliente | `/preparacion/[fecha]/entrega/[id]` | M | `preparacion.ver` (cargar: `preparacion.registrar`) | O |
| P-72 | Preparar por producto | `/preparacion/[fecha]/producto/[id]` | M | `preparacion.registrar` | O |
| P-75 | Repartos | `/repartos` | D | `repartos.ver` | O |
| P-76 | Armar reparto | `/repartos/[id]` | D | `repartos.gestionar` | O |
| P-77 | Mi reparto | `/repartos/mios` | M | `repartos.ver_propios` | O |
| P-78 | Confirmar entrega | `/repartos/mios/entrega/[id]` | M | `entregas.confirmar` | O |
| P-78b | Viaje de entrega | `/viaje` | M/D | `repartos.ver` | O |
| P-79 | Entregas y remitos del día | `/entregas`, `/entregas/remitos` | M/D | `entregas.ver` | O +V |
| P-80 | Detalle de entrega | `/entregas/[id]` | D | `entregas.ver` | O +V +C +M |
| P-85 | Facturación (y facturar período) | `/facturacion` | D | `facturacion.ver` | V |
| P-87 | Detalle de comprobante | `/facturacion/[id]` | D | `facturacion.ver` | V |
| P-88 | Exportar para el contador | `/facturacion/exportar` | D | `facturacion.exportar` | V C F |
| P-90 | Reportes | `/reportes` | D | `reportes.ver` | según reporte |
| P-91 | Balance | `/balance` | D | `reportes.ver` | V C M F |
| P-93 | Movimientos | `/balance/movimientos` | D | `reportes.ver` | V C F |
| P-94 | Actividad y notas | `/actividad` | M/D | Sesión | O |
| P-95 | Configuración del negocio | `/configuracion` | D | `configuracion.ver` | M |
| P-96 | Usuarios | `/usuarios` | D | `usuarios.administrar` | P |

Las vistas de impresión se describen en 09.

---

## 4. Piezas comunes

| Pieza | Comportamiento |
|---|---|
| **Formulario con respuesta** | Al guardar muestra qué pasó y, si algo falla, cómo seguir y el botón para ir a arreglarlo (§7). Lo escrito queda para corregir. |
| **Pregunta guiada** | Las altas (cliente, proveedor, producto) son tres preguntas numeradas con botones grandes y una tarjeta de "Así va a quedar" al costado. |
| **Tarjeta** | Registros, tablero y listas se ven como tarjetas (con opción "☰ Lista" donde conviene). |
| **Semáforo de crédito** | Color, dibujo, texto y porcentaje (06 §8.3). Solo con `proveedores.ver_credito`. |
| **Avatar** | Iniciales con el color que eligió cada persona; muestra quién se encarga de cada pedido. |
| **Notas** | En las tarjetas de pedido y en las fichas: se elige "Para" quién es; se borran solo por quien las escribió. |
| **Gráficos** | SVG propios con tabla ("Ver tabla") y valores al pasar el dedo o el mouse. |
| **Estado vacío** | Explica qué falta y ofrece la acción siguiente ("Todavía no hay pedidos. ＋ Nuevo pedido"). |

---

## 5. Detalle de pantallas

### 5.1 Acceso, inicio y cuenta

#### P-01 Ingreso

Usuario (o correo) y contraseña con botón para verla; **Entrar con Google** si está activado; **Creá una cuenta**. Las cuentas nuevas esperan en `/acceso-pendiente` hasta que las habiliten (02 §10). El primer uso (`/configuracion-inicial`) crea el negocio y al primer ADMIN.

#### P-02 Tablero de pedidos (pantalla principal)

Imita la presentación de Trello sobre una imagen de campo: listas con una franja del color de su etapa y tarjetas grandes.

| Lista | Qué tiene | Color |
|---|---|---|
| **Pedidos** | Los pedidos cargados. Se mandan a la lista de compras cuando se quiera. Al pie, "＋ Nuevo pedido". | Azul |
| **Lista de compras** | Los que se están comprando: falta algo de lo suyo. Cada producto con ✓ (comprado) o ⬜. | Violeta |
| **Comprado** | Ya está todo lo suyo: listo para preparar. | Naranja |
| **Preparando** | Tienen armada su preparación. Se ven **todos** sus productos con ✓ (separado) o ⬜ y, en naranja, lo que falta y por qué ("Va 6 kg de 30 kg · no se consiguió", "Alcanza para 126 kg de 160 kg"). | Amarillo |
| **En camino** | Salieron en un reparto. | Verde |
| **Entregados** | Ya se entregaron. | Rosa |

- **Tarjeta:** etiquetas (tipo de cliente, "Urgente", "Llegó tarde"), dibujo del tipo de cliente, nombre y número, lo que lleva (hasta 4 productos, "y N más"; en Preparando, todos), ⏰ plazo (rojo vencido, amarillo pronto, verde listo), 💬 notas, ☑ avance, total estimado y quién se encarga. Una tarjeta sin productos lo dice y lleva a cargarlos.
- **Arrastrar** de Pedidos a Lista de compras la manda a la lista; de vuelta, la saca. Lo demás avanza solo cuando se hace cada paso.
- **Elegir pedidos:** "☑ Elegir pedidos" pone casillas; "🛒 Elegir todos los pedidos para la lista" marca de una vez los de la columna Pedidos (sin los vacíos, diciendo cuáles son). Con elegidos aparece una barra: **🛒 Mandar a la lista de compras**, sacar de la lista, prioridad o quién se encarga.
- **Tarjeta abierta** (`?pedido=`): **Lo que lleva** en recuadros con su avance y lo que falta, **✏️ Cambiar productos**, dónde se entrega (Google Maps y Waze), la nota, las notas entre las personas y el historial. Al costado: mandar a la lista o volver a Pedidos, **📦 Preparar su pedido** (cuando está comprado o preparándose), ver el pedido completo, prioridad, quién se encarga y horario.
- **Filtros:** por persona y "Urgentes". En el celular, "＋" flotante para un pedido nuevo.
- Arriba, los avisos como píldoras: notas sin leer, pedidos de acceso, deuda que vence.

Los pedidos **no se confirman a mano**: se cargan completos y, al mandarlos a la lista o al empezar a preparar, los que quedaron sin terminar pero tienen productos se completan solos.

#### P-02 El día paso a paso (pestaña "☰ Paso a paso")

Seis pasos en tarjetas de colores pastel, con "Ahora toca: …" y la barra de avance:

| Paso | Hecho cuando… | Acción principal |
|---|---|---|
| 📝 Pedidos | hay pedidos cargados y ninguno sin terminar | ＋ Nuevo pedido |
| 🛒 Lista de compras | la lista está armada y al día | Armar o actualizar la lista · imprimir |
| 🧺 Compras en el mercado | todo lo de la lista está comprado o no conseguido | 🛒 Abrir la lista de compras · anotar otra compra |
| 📦 Preparación y remitos | todos los clientes están preparados y con su remito | 📦 Empezar a preparar o seguir · imprimir para separar |
| 🚚 Reparto y entrega | todo se entregó | Viaje de entrega · imprimir los remitos del día · confirmar entregas |
| 🔒 Cierre del día | el día está cerrado | Revisar y cerrar el día |

"Ahora toca" es el paso más avanzado sin terminar; lo que quedó a medias antes aparece como "Quedó pendiente de antes" dentro del paso actual, con su botón. La regla está en `src/dominio/jornadas/pasos.ts`.

#### P-03 Mi cuenta

Nombre y color del avatar (con vista previa), cambio de contraseña y, para quien administra, **Administración**: Usuarios y Configuración del negocio.

---

### 5.2 Catálogo de productos

#### P-10 Productos

Tarjetas agrupadas por categoría (o "☰ Lista"): dibujo, en qué se cuenta, envase de compra, "Desde $X el kg", cuántos puestos lo venden y el preferido. Arriba, **Precios de venta**.

**＋ Nuevo producto** (tres preguntas): qué es y su categoría; cómo se vende (kilo, unidad, atado, docena u "otra forma"); en qué envase se compra ("Suelto", los sugeridos u "Otro envase…"). La ganancia con su cuenta de ejemplo, si se pide en partes, el código y las notas quedan en "Más opciones".

| Acción | Permiso | Reglas | Resultado |
|---|---|---|---|
| Nuevo producto | `productos.editar` | RN-001, RN-004 a RN-006 | Crea el producto con su envase de unidad base y el de compra. |
| Desactivar / reactivar | `productos.editar` | RN-007 | Advierte si tiene pedidos en curso. |

#### P-11 Ficha de producto

Envases como tarjetas ("1 cajón = 18 kg", para comprar / para vender), puestos que lo venden con su precio y el preferido, precio de venta por cliente, notas. Los datos se editan desde "✏️ Editar los datos del producto" (plegado).

#### P-12 Categorías

Nombre, grupo (fruta, verdura, otro), orden y ganancia de la categoría.

---

### 5.3 Clientes

#### P-15 Clientes

Tarjetas agrupadas por tipo (hospital, restaurante, comercio…) con dirección, "Sin ubicación en el mapa" si falta, horario, teléfono y el próximo pedido.

**＋ Nuevo cliente** (tres preguntas): cómo se llama y qué es; dónde se le entrega y a qué hora recibe (Cuando sea, Temprano, A la mañana, A la tarde u Otro horario); el teléfono. En "Más opciones": a quién se le completa primero si falta mercadería, cada cuánto se le hace el comprobante, reemplazos, remito firmado, orden de compra, contacto, cómo llegar y datos fiscales.

#### P-16 Ficha de cliente

Datos (plegados en "✏️ Editar los datos del cliente"), **Dónde se le entrega** (cada lugar con Cómo llegar en Google Maps y Waze y **Marcar en el mapa**: "Estoy en el lugar" con el GPS, buscar la dirección o pegar un enlace de Google Maps), pedidos recientes, **Ganancia propia** y precios pactados (P-33), notas.

| Acción | Permiso | Reglas | Resultado |
|---|---|---|---|
| Nuevo cliente / editar | `clientes.editar` | RN-010, RN-011, RN-013 a RN-015 | Sin dirección se guarda, con el aviso de que no se le pueden cargar pedidos. |
| Agregar / desactivar un lugar de entrega | `clientes.editar` | RN-016 | No se desactiva uno con entregas sin terminar. |
| Desactivar cliente | `clientes.editar` | RN-012 | — |
| Nuevo pedido para este cliente | `pedidos.crear` | — | Abre P-41 con el cliente elegido. |

---

### 5.4 Proveedores

#### P-20 Proveedores

Tarjetas separadas en "Con deuda" y "Al día", con una franja del color del semáforo, lugar en el mercado, cómo se le paga, cuántos productos vende y "Se le debe $X" con el % de uso del límite.

**＋ Nuevo proveedor** (tres preguntas): nombre y dónde está en el mercado; cómo se le paga (En el momento / A cuenta, con hasta cuánto se le puede deber y el plazo: a la semana, 15 o 30 días); el teléfono. Contacto, CBU, CUIT y demás en "Más datos".

#### P-21 Ficha de proveedor

Productos y precios (cada uno se cambia desde "✏️ Cambiar"; "Otro producto" para agregar), la cuenta (P-61), notas; los datos, plegados.

| Acción | Permiso | Reglas | Resultado |
|---|---|---|---|
| Editar datos / agregar un producto con su precio | `proveedores.editar` (el precio: `precios.editar_compra`) | RN-067 | Un precio por proveedor, producto y envase. |
| Cambiar límite o plazo | `proveedores.editar_limite` | RN-105 | Si el límite nuevo queda por debajo de la deuda, avisa cómo va a quedar; motivo obligatorio; se audita. |
| Desactivar | `proveedores.editar` | RN-108 | Advierte si se le debe; sigue admitiendo pagos. |

---

### 5.5 Precios de compra

#### P-25 Lista general de precios de compra

Por producto (el mejor precio resaltado y el % sobre el mejor) o por puesto; marca "desactualizado" (RN-069) y las variaciones bruscas. **🖨️ Imprimir** (DOC-06).

| Acción | Permiso | Reglas | Resultado |
|---|---|---|---|
| Cambiar un precio | `precios.editar_compra` | RN-067, RN-068, RN-070 | Guarda el historial, audita y recalcula los precios de venta no congelados (RN-088). Si la variación supera el umbral, pide confirmar. |
| "Sigue igual" | `precios.editar_compra` | RN-075 | Actualiza la fecha sin crear historial. |
| Marcar preferido | `productos.editar` | RN-073 | — |
| Quitar un precio | `proveedores.editar` | — | El historial queda; volver a agregarlo lo reactiva. |

#### P-26 Precios en el puesto (celular)

Se elige el puesto y aparecen solo sus productos con el precio actual y hace cuánto se actualizó; se escribe el nuevo (vacío = sin cambios) y **Guardar** aplica todo junto. Además, anotar una compra desde la lista de compras actualiza el precio de ese puesto.

#### P-29 Historial de precios

Para un producto: precio, costo por unidad base, variación, origen (a mano o por compra) y quién lo cambió.

---

### 5.6 Precios de venta

#### P-32 Precios de venta

La ganancia general del negocio, la de cada categoría, producto y cliente, y **Especiales** (precio fijo o ganancia para un cliente en un producto o una categoría, con vigencia). Cada precio muestra de qué nivel sale (05 §5.3). "＋ Darle una ganancia propia" agrega una excepción; no hay filas vacías.

| Acción | Permiso | Reglas | Resultado |
|---|---|---|---|
| Cambiar una ganancia | `precios.editar_reglas` | RN-084, RN-091 | Recalcula los pedidos no congelados; audita. |
| Precio fijo o ganancia especial | `precios.editar_reglas` | RN-079, RN-081 | "Nuevo precio desde…" cierra el anterior el día antes (05 §5.4). |
| Quitar un especial | `precios.editar_reglas` | RN-091 | Cierra su vigencia; no se borra. |

#### P-33 Precios del cliente

En la ficha del cliente: su ganancia propia, sus especiales y la lista de precios que le corresponde hoy.

---

### 5.7 Pedidos y días

#### P-41 Nuevo pedido y cambiar productos

La cargan siempre las mismas dos personas; es visual y en recuadros:

1. **¿Para quién es?** Recuadros con el dibujo del tipo de cliente, nombre y dirección, con buscador. Si tiene varios lugares de entrega, se elige con botones.
2. **¿Para qué día?** Los próximos 7 días (los cerrados, deshabilitados) y "Otro día". Si el cliente ya tiene un pedido ese día, lo avisa con el botón para sumarle productos a ese.
3. **¿Qué lleva?** Recuadros de productos por categoría; arriba **⭐ Lo que suele pedir** y **↺ Repetir su último pedido**. Al tocar uno se agrega y se agranda: − y + grandes, la cantidad para escribir, por kilo o por envase, cantidades rápidas y una nota.
4. **El pedido** (al costado en la PC, abajo en el celular): lo elegido, ¿es urgente?, ¿tiene un horario?, la nota (sale en el remito) y **✓ Guardar el pedido**.

Se guarda todo junto o nada: **nunca queda un pedido vacío**. Antes de guardar, marca en rojo lo que falta con la explicación. Al terminar: "Pedido guardado", **＋ Cargar otro pedido**, **Ver en el tablero** o **Cambiar algo**. Al cambiar un pedido que ya está en la lista de compras, lo que se saca queda cancelado con el motivo y la lista se marca para actualizar.

#### P-40 Lista de pedidos y P-42 Detalle de pedido

La lista muestra los pedidos de un día (para moverlos es más cómodo el tablero). El detalle tiene las líneas con su precio estimado y origen, **✏️ Cambiar productos**, **Ver en el tablero** y:

| Acción | Permiso | Reglas | Resultado |
|---|---|---|---|
| Cancelar pedido | `pedidos.cancelar` | RN-028 | Mientras no se empezó a preparar; motivo obligatorio. Lo ya comprado queda como sobrante previsto. |
| Pasar a otro día | `pedidos.editar` | 04 §5.b | Si ya está en la lista de compras, primero hay que sacarlo desde el tablero. |
| Duplicar | `pedidos.crear` | RN-033 | — |

#### P-45 Otros días, P-46 Resumen de un día y P-47 Cierre del día

"Otros días" lista las jornadas con su estado y sus pedidos. El resumen de un día muestra pedidos, compra, preparación y reparto con su avance. El **cierre** tiene dos partes (04 §5.h): **Falta resolver** (entregas sin confirmar, pedidos sin terminar, remitos sin hacer, cada uno con su botón) y **Para revisar** (lo no comprado, márgenes negativos); después, el resumen del día (vendido, costo, ganancia, sobrantes, resultado, deuda) y **Cerrar el día** (`jornada.cerrar`), que lo deja en solo lectura con el resumen guardado. **Reabrir** pide motivo (`jornada.reabrir`, RN-041).

---

### 5.8 Lista de compras y compras

#### P-50 Lista de compras (celular, en el mercado)

Todo lo que hay que comprar para el día, junto, con una barra de avance ("Falta 1 de 3 productos", "Se calcula gastar $…"). Dos vistas: **Todo junto** y **Por puesto** (en el orden de los puestos del mercado).

- Cada producto es una tarjeta: dibujo, **Hay que comprar N × envase** (redondeado a envases completos, RN-044), cuánto se necesita, **Conviene en** el puesto sugerido con su precio (por costo y crédito disponible, RN-047) y los avisos (sin proveedor, crédito insuficiente, precio viejo).
- **✓ Lo compré** abre, en la misma tarjeta: ¿en qué puesto? (los que lo venden, u "Otro puesto…" con proveedor y envase), cuántos, a cuánto cada uno, **📒 Queda a cuenta** o **💵 Le pagué en efectivo**, y el total. **Anotar la compra** la registra como una compra común (cuenta del proveedor, precio del puesto, límite) y la línea pasa a **Ya resuelto**.
- **No lo conseguí / cambiar la cantidad** (plegado): marcar no conseguido o ajustar la cantidad, con motivo (RN-050, RN-051).
- Arriba: **🖨️ Imprimir** (DOC-01) y **Compras anotadas**. Al pie, "Volver a calcular la lista con los pedidos de ahora" (RN-049, RN-052: nunca toca lo comprado).

| Acción | Permiso | Reglas | Resultado |
|---|---|---|---|
| ✓ Lo compré | `compras.registrar` | RN-054 a RN-063 | Una compra de contado o a cuenta con su movimiento, el precio del puesto al día y el avance de la lista. Si supera el límite, lo explica y ofrece seguir con motivo a quien tiene `compras.exceder_limite`. |
| No lo conseguí | `lista_compra.editar` | RN-051 | Motivo obligatorio. |
| Cambiar la cantidad | `lista_compra.editar` | RN-050 | Motivo obligatorio. |

#### P-55 Anotar una compra suelta

Para lo que no está en la lista o para anotar varias cosas de un puesto de una vez: primero el puesto (con los que tienen algo de la lista arriba), después lo que la lista dice comprarle ahí; **＋ Agregar otro producto** para sumar más. **¿Cómo pagaste?** Pagué todo / Queda a cuenta / Pagué una parte. Si el precio varía mucho, pide confirmar (RN-058).

#### P-56 Compras anotadas y P-57 Detalle de compra

Lista con total, pagado, pendiente y estado de pago. El detalle muestra las líneas, qué pagos la cancelan y el vencimiento.

| Acción | Permiso | Reglas | Resultado |
|---|---|---|---|
| Anular | `compras.anular` | RN-065, RN-101 | Motivo. Si era de contado, pregunta si el proveedor devolvió la plata. Recalcula la lista, el costo real y los precios. |
| Pagar esta compra | `pagos.registrar` | RN-097 | Abre P-62 con esta compra elegida. |

---

### 5.9 Cuentas con proveedores

Convención de 06 §10: pagado verde, pendiente ámbar, vencido rojo con reloj, saldo a favor con la leyenda "a favor"; siempre con texto.

- **P-60 Deudas con proveedores:** una fila por proveedor con límite, deuda, disponible, % de uso, semáforo, vencido, próximo vencimiento y último pago; totales al pie; filtros "con deuda", "vencidos", "en rojo". Por fila: Pagar, Cuenta, Estado de cuenta (DOC-05).
- **P-61 Cuenta del proveedor:** movimientos con saldo acumulado, compras pendientes con su vencimiento, pagos. Botones: **Registrar pago**, **Ajuste o deuda anterior**, **Estado de cuenta**.
- **P-62 Registrar pago:** importe, medio, referencia opcional; imputación automática (de la compra más vieja a la más nueva) o elegida a mano, con la vista previa de qué compras cancela (RN-096, RN-097). Lo que sobra queda a favor (RN-098).
- **P-63 Ajuste o deuda anterior:** débito o crédito con motivo y compra relacionada (RN-102); la deuda anterior al sistema, en una o varias boletas.
- **P-64 Detalle de pago:** qué compras cancela; **Reimputar** y **Anular** con motivo (RN-100).

---

### 5.10 Preparación

#### P-70 Preparación del día

Lo que hay que separar para cada cliente. **Empezar a preparar** arma una tarjeta por cliente y punto de entrega con lo que pidió (RN-111); si algo de lo comprado no alcanza para todos, se reparte empezando por los urgentes y la prioridad de cada cliente (RN-115), y queda anotado qué falta. "Sumar los pedidos nuevos" agrega los que llegaron después.

- **👤 Por cliente:** cada cliente es una tarjeta con **todos** sus productos: ✓ separado o ⬜ por separar, la cantidad y, en naranja, lo que falta y por qué. Botón **📦 Preparar este pedido** (o "Seguir preparando", "Ver o corregir").
- **🥬 Por producto:** comprado, pedido, preparado y si sobra o falta; cada producto abre P-72.
- **🖨️ Imprimir para separar** (DOC-07) y **🚚 Viaje de entrega**.

#### P-71 Preparar el pedido de un cliente

Arriba, "Separados N de M productos" con su barra, **✓ Está todo en los que faltan** y, si falta algo, **Lo que falta (para avisarle al cliente)**. Cada producto es una tarjeta:

- **Separar 36 kg** (y el envase pedido), el estado (⬜ Por separar, ✓ la cantidad, ⚠ Faltó) y el aviso en naranja ("Alcanza para 30 kg de 36 kg", "Va 30 kg de 36 kg · no se consiguió").
- **✓ Está todo (36 kg)** en un toque; si no alcanzó, **✓ Separé 30 kg (lo que hay)**, o **✗ No va (no hay)**.
- **⚠ Falta algo o pesa distinto** (plegado): ¿cuánto se manda? y **si falta, ¿por qué?** con botones: No se consiguió · No alcanzó lo comprado · Estaba en mal estado · Error al preparar · El cliente lo sacó · Otro motivo. Dentro, **🔁 Mandar otro producto en su lugar** (RN-117).
- Abajo, fijo: cuántos faltan, ¿cuántos bultos? y **📦 Marcar como preparado**: el remito sin precios y la lista con precios se hacen solos.

| Acción | Permiso | Reglas | Resultado |
|---|---|---|---|
| Está todo / cuánto se manda | `preparacion.registrar` | RN-113, RN-114 | Peso real con tolerancia; si falta de verdad, el motivo es obligatorio; más de lo comprado pide confirmar. La entrega y sus pedidos pasan a preparándose. |
| Mandar otro producto | `preparacion.registrar` | RN-117 | Si el cliente no acepta reemplazos, pide quién lo autorizó. |
| Marcar como preparado | `preparacion.registrar` | RN-118, RN-120, RN-121 | Emite DOC-02 y DOC-03 con los precios congelados; una línea sin precio deja los remitos pendientes; con margen negativo, pide confirmar. |

#### P-72 Preparar por producto

Un producto para todos los clientes: cuánto le toca a cada uno, con la misma carga y los mismos motivos.

---

### 5.11 Repartos y entregas

#### P-78b Viaje de entrega

Las entregas que faltan llevar, el mejor orden y el GPS:

- **De dónde se sale:** el depósito o el mercado (marcado con el GPS, buscando la dirección o con un enlace de Google Maps) o "donde estoy ahora".
- **Calcular el viaje:** empezar por una parada o por la más cómoda, y volver o no. El orden es el de menos kilómetros (exacto hasta 8 paradas; con más, el vecino más cercano mejorado). Cada tramo con kilómetros y minutos aproximados. Las paradas sin ubicación van al final con un aviso.
- Ajuste a mano con ↑ ↓; por parada **Ir** (Google Maps), **Waze** y 📞; "Abrir todo el viaje en Google Maps".
- **Armar el reparto con este orden** o **Guardar este orden**.
- La búsqueda de direcciones usa OpenStreetMap desde el servidor, solo al tocar "Buscar".

#### P-75 Repartos y P-76 Armar reparto

Repartos del día con sus paradas y estado. En "Armar reparto": las entregas sin reparto a un lado y las paradas ordenadas al otro, la tarjeta "Recorrido y GPS", **🖨️ Hoja de ruta** (DOC-04), **Hacer los remitos que faltan**, **Salir** (exige los remitos al día, RN-122) y **Anular** (sin entregas confirmadas, con motivo).

#### P-77 Mi reparto y P-78 Confirmar entrega (celular)

Solo los repartos de la persona (RN-131). Por parada: llamar, Ir, Waze, **Entregar**. Al confirmar: **Entregado completo** (pide quién recibió), **Con diferencias** (por producto: cuánto se entregó, motivo y detalle) o **No recibió**. Nunca muestra importes. Si hubo diferencias, sube la versión y se rehacen los remitos; a los clientes que facturan por entrega se les hace el comprobante (RN-143). **Regresé** cierra el reparto.

#### P-79 Entregas y remitos y P-80 Detalle de entrega

Entregas del día con su estado, reparto, diferencias, facturación y remitos. **Imprimir todos los remitos del día** (una o dos copias) o todas las listas contables (`/entregas/remitos`). El detalle muestra las líneas (pedida, propuesta, preparada, entregada, motivos y, con permisos, precio congelado, importe y margen), las versiones de los documentos y quién recibió.

| Acción | Permiso | Reglas | Resultado |
|---|---|---|---|
| Hacer los remitos | `entregas.emitir_documentos` | RN-087, RN-120, RN-121 | Congela precios en la primera emisión. |
| Cambiar el precio de una línea | `precios.override_linea` | RN-090 | Motivo; si ya había remitos, versión nueva. |
| Corregir entrega | `entregas.corregir` | RN-128, RN-138 | Sin facturar y con el día abierto; motivo; versión nueva. |
| Confirmar desde la oficina | `entregas.confirmar` | RN-125 | Queda registrado quién confirmó. |
| Anular entrega | `entregas.anular` | RN-132 | Sin facturar; motivo; los pedidos quedan libres. |

---

### 5.12 Facturación

- **P-85 Facturación:** lo entregado sin facturar agrupado por cliente y los comprobantes emitidos. **Facturar período** propone un comprobante por cliente con sus entregas pendientes según cada cuánto se le factura (RN-141).
- **P-87 Detalle de comprobante:** cliente, período, entregas incluidas y total. **🖨️ Imprimir** (DOC-08, "Documento no válido como factura") y **Anular** con motivo (las entregas vuelven a sin facturar, RN-139).
- **P-88 Exportar para el contador:** período → **Excel** o **CSV** con las seis hojas de 04 §5.g.3; el mismo período da siempre el mismo archivo (RN-142).

---

### 5.13 Balance, reportes y actividad

- **P-91 Balance:** vendido, ganancia y %, comprado, pagado, deuda con proveedores y lo entregado sin facturar; gráficos de ventas y compras, ganancia por período, deuda en el tiempo, clientes y productos que más vendieron, por día, semana o mes, cada uno con su tabla. Cada importe respeta los permisos de precios.
- **P-93 Movimientos:** ventas, compras, pagos y ajustes del período, del más nuevo al más viejo, con totales por tipo; cada fila lleva a su documento.
- **P-90 Reportes:** ventas y margen por cliente y por producto, compras por proveedor y por producto, días cerrados, deuda por antigüedad, faltantes y diferencias.
- **P-94 Actividad y notas:** lo que hizo cada persona en palabras ("María mandó a la lista de compras el pedido PED-000012") y las notas, por día; una tarjeta por persona arriba; filtros por persona y "solo notas". La 🔔 cuenta las notas sin leer.

---

### 5.14 Configuración y usuarios

#### P-95 Configuración del negocio

`configuracion.ver` para ver, `configuracion.editar` para guardar; cada cambio se audita. Si cambian el redondeo o el margen mínimo, se recalculan los pedidos pendientes.

| Grupo | Campos |
|---|---|
| Datos del negocio | Nombre, CUIT, dirección, teléfono y correo (salen en los documentos). |
| Precios | Cómo se redondea el precio de venta, margen mínimo para avisar, variación de precio de compra que pide confirmar, días para marcar un precio como viejo. La ganancia general se cambia en Precios de venta. |
| Deudas con proveedores | Colores del semáforo (amarillo < rojo), días de aviso antes de un vencimiento. |
| Pedidos y preparación | Hora de corte de pedidos (después, un pedido para el día siguiente llega tarde), diferencia de peso aceptada al preparar. |

#### P-96 Usuarios

Pedidos de acceso con **Habilitar** / **Rechazar**; las personas con acceso, con **Darle una clave provisoria** y **Quitarle el acceso** (02 §10). Sin roles a la vista: todos son ADMIN.

---

## 6. Acceso por rol

Hoy todos los usuarios son ADMIN y ven todo. Si algún día entra alguien con un rol limitado, cada pantalla y cada entrada del menú dependen del permiso de la tabla de §3 (02 §5): por ejemplo, un REPARTIDOR ve solo "Día de trabajo" con Mi reparto, y nunca pantallas con precios.

---

## 7. Mensajes

- Todo mensaje nombra **qué** (el pedido, el cliente o el producto) y dice **cómo seguir** ("Restaurante La Esquina (PED-000009): este pedido todavía no tiene productos: agregale al menos uno.").
- Cuando hay una pantalla donde se arregla, trae **el botón** para ir ("Agregar productos →", "Cargar la dirección →"): el error de negocio lo manda en `detalle.enlace`.
- Los códigos de reglas y referencias al plan ("(RN-018)") **no se muestran** (`textoParaPersona`).
- Si falla algo del sistema, no aparece el error técnico: "No se pudo completar por un problema del sistema (no es un error tuyo). Probá de nuevo en un momento; si vuelve a pasar, avisale a Facundo qué estabas haciendo." Si falla una pantalla entera, una página con **Probar de nuevo** e **Ir al tablero**.
- Mejor que avisar es no dejar que pase: no se puede guardar un pedido sin productos, el tablero no manda a la lista una tarjeta vacía (la abre para cargarle los productos).

| Código | Mensaje (ejemplo) | Qué se ofrece |
|---|---|---|
| `NO_AUTENTICADO` | "Tu sesión terminó. Ingresá de nuevo." | Ir al ingreso. |
| `SIN_PERMISO` | "No tenés permiso para anular compras." | — |
| `VALIDACION` | "Lechuga criolla se pide en unidades enteras: poné una cantidad sin coma." | Corregir el campo. |
| `TRANSICION_INVALIDA` | "Ese pedido ya se está preparando: no se puede cancelar." | La alternativa (anotar la diferencia en la entrega). |
| `JORNADA_CERRADA` | "Ese día ya está cerrado: para seguir con sus pedidos, primero reabrilo desde “Cierre del día”." | Reabrir. |
| `LIMITE_CREDITO_EXCEDIDO` | Límite, deuda, compra, deuda después y exceso (06 §9.3). | Pagar el exceso, pagar todo o seguir con motivo (con permiso). |
| `PRECIO_SIN_COSTO` | "No se pueden hacer los remitos: Kale no tiene precio." | Anotar la compra o fijar el precio. |

---

## 8. Metas de uso

| Tarea | Meta | Pantalla |
|---|---|---|
| Anotar algo que se compró de la lista | 3 toques y el precio | P-50 |
| Cargar un pedido de 10 productos | Menos de 2 minutos | P-41 |
| Separar un producto que está completo | 1 toque ("✓ Está todo") | P-71 |
| Confirmar una entrega sin diferencias | 3 toques y el nombre de quien recibe | P-78 |
| Encontrar lo que se le debe a un proveedor | 2 toques desde el menú | P-60 → P-61 |
| Que preparación y reparto no muestren precios | Nunca | P-70 a P-78 (prueba automática, 02 §8) |
