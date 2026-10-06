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
| Barra superior | Nombre del sistema ("Sistema Repartos"), 🔔 campanita de avisos (§5.13), la persona (lleva a Mi cuenta) y "Salir". | Igual; el panel de avisos ocupa el ancho de la pantalla. |
| Elegir el día | En el tablero, el paso a paso y la lista de compras: una fila de días (Hoy, Mañana y los que tienen pedidos, cada uno con cuántos pedidos) y "📅 Otros días". | Igual; la fila se desliza de costado. |
| Imprimir | Botón **🖨️ Imprimir** en cada pantalla con documento: abre la vista A4 y el diálogo del navegador ("Guardar como PDF" para compartir). | Igual. |

### 2.2 Menú

| Grupo | Pantallas | Visible si el usuario tiene… |
|---|---|---|
| Día de trabajo | Tablero de pedidos · **＋ Nuevo pedido** (destacado) · 🛒 Lista de compras · 🚚 Logística · Mi reparto (solo para quien no maneja todos los repartos) · Actividad y notas | Sesión · `pedidos.crear` · `lista_compra.ver` · `repartos.ver` · `repartos.ver_propios` sin `repartos.gestionar` · Sesión |
| Registros | Clientes · Productos · Proveedores | `clientes.ver` · `productos.ver` · `proveedores.ver` |
| Cuentas | Balance · Deudas con proveedores · Facturación | `reportes.ver` · `pagos.ver` · `facturacion.ver` |

Los grupos sin ninguna pantalla visible no aparecen. Lo demás se abre desde donde se usa:

| Pantalla | Se llega desde |
|---|---|
| El día paso a paso | Pestaña "☰ Paso a paso" del tablero |
| Otros días y cierre del día | "📅 Otros días" del tablero; paso "Cierre" |
| Compras anotadas | Lista de compras |
| Preparación | Columnas "Comprado" y "Preparando" del tablero; tarjeta abierta; paso a paso |
| Armar un reparto y entregas | Logística, preparación, paso a paso |
| Precios de compra | Productos, ficha del proveedor |
| Precios de venta | Productos ("Precios de venta") |
| Pedidos en Excel | Botón "📊 Excel" del tablero; "📥 Cargar desde Excel" en Nuevo pedido |
| Productos en Excel | Botón "📊 Excel" de Productos |
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
| P-13 | Productos en Excel (subir y bajar) | `/productos/importar`; descargas en `/productos/planilla`, `?formato=csv` y `?modelo=1` | D | `productos.ver` (subir: `productos.editar`) | O +M |
| P-12 | Categorías | `/productos/categorias` | D | `productos.ver` | O +M |
| P-15 | Clientes (y nuevo cliente) | `/clientes`, `/clientes/nuevo` | M/D | `clientes.ver` | O |
| P-16 | Ficha de cliente | `/clientes/[id]` | M/D | `clientes.ver` | O +V +M |
| P-20 | Proveedores (y nuevo proveedor) | `/proveedores`, `/proveedores/nuevo` | D | `proveedores.ver` | O +F |
| P-21 | Ficha de proveedor | `/proveedores/[id]` | D | `proveedores.ver` | O +C +F |
| P-25 | Lista general de precios de compra | `/precios/compra` | D | `precios.ver_costos` | C +F |
| P-26 | Precios en el puesto | `/precios/compra/rapida` | M | `precios.editar_compra` | C |
| P-29 | Historial de precios de un producto | `/precios/compra/historial/[id]` | D | `precios.ver_costos` | C |
| P-32 | Precios de venta | `/precios/venta` | D | `precios.ver_margenes` | M +V +C |
| P-41 | Nuevo pedido y cambiar productos | `/pedidos/nuevo`, `/pedidos/[id]/cambiar` | M | `pedidos.crear` o `pedidos.editar` | O +V |
| P-42 | Detalle de pedido | `/pedidos/[id]` | M/D | `pedidos.ver` | O +V +C +M |
| P-43 | Pedidos en Excel (subir y bajar) | `/pedidos/importar`; descargas en `/pedidos/planilla?fecha=` y `?modelo=1` | D | `pedidos.ver` (subir: `pedidos.crear`) | O |
| P-45 | Otros días | `/jornadas` | M/D | `jornada.ver` | O |
| P-47 | Cierre del día | `/jornadas/[fecha]/cierre` | D | `jornada.cerrar` | O V C M F |
| P-50 | Lista de compras | `/lista-compra`; descarga en `/lista-compra/planilla?fecha=` | M | `lista_compra.ver` | O +C +F |
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
| P-76 | Armar reparto | `/repartos/[id]` | D | `repartos.gestionar` | O |
| P-77 | Mi reparto | `/repartos/mios` | M | `repartos.ver_propios` | O |
| P-78 | Confirmar entrega | `/repartos/mios/entrega/[id]` | M | `entregas.confirmar` | O |
| P-78b | Logística (viaje de entrega) | `/viaje` | M/D | `repartos.ver` | O |
| P-79 | Entregas y remitos del día | `/entregas`, `/entregas/remitos` | M/D | `entregas.ver` | O +V |
| P-80 | Detalle de entrega | `/entregas/[id]` | D | `entregas.ver` | O +V +C +M |
| P-85 | Facturación (y facturar período) | `/facturacion` | D | `facturacion.ver` | V |
| P-87 | Detalle de comprobante | `/facturacion/[id]` | D | `facturacion.ver` | V |
| P-88 | Exportar para el contador | `/facturacion/exportar` | D | `facturacion.exportar` | V C F |
| P-90 | Reportes | `/reportes` | D | `reportes.ver` | según reporte |
| P-91 | Balance, balance del día y Excel de cada mes | `/balance`, `?desde=&hasta=`, `?dia=`; `/balance/planilla?mes=` | D | `reportes.ver` | V C M F |
| P-93 | Movimientos | `/balance/movimientos` | D | `reportes.ver` | V C F |
| P-94 | Actividad y notas | `/actividad` | M/D | Sesión | O |
| P-95 | Configuración del negocio | `/configuracion` | D | `configuracion.ver` | M |
| P-96 | Usuarios | `/usuarios` | D | `usuarios.administrar` | P |

Las vistas de impresión se describen en 09. Las direcciones viejas `/pedidos`, `/jornadas/[fecha]` y `/repartos` llevan al tablero, al paso a paso y al viaje de entrega.

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

Imita la presentación de Trello sobre una imagen de campo: cada lista es de un color vivo (el de su etapa) y cada tarjeta lleva arriba una franja del tono fuerte de ese color con el nombre del cliente, y sus productos en un recuadro del tono claro. Los colores están en `app/globals.css` (clases `color-azul`, `color-violeta`…, con su versión para el modo oscuro).

| Lista | Qué tiene | Color |
|---|---|---|
| **Pedidos** | Los pedidos cargados. Se mandan a la lista de compras cuando se quiera. Al pie, "＋ Nuevo pedido". | Azul |
| **Lista de compras** | Los que se están comprando. En la misma tarjeta se **tilda** cada producto: ✓ ya se compró, ✕ no se consiguió. | Violeta |
| **Comprado** | Ya está todo lo suyo (tildado, con la compra anotada o marcado "no se consiguió"): listo para preparar. Los tildes se pueden sacar desde acá. | Naranja |
| **Preparando** | Tienen armada su preparación. Se ven **todos** sus productos con ✓ (separado) o ⬜ y, en naranja, lo que falta y por qué ("Va 6 kg de 30 kg · no se consiguió", "Alcanza para 126 kg de 160 kg"). | Amarillo |
| **En camino** | Salieron en un reparto. | Verde |
| **Entregados** | Ya se entregaron. | Rosa |

- **Tarjeta:** franja de color con el dibujo del tipo de cliente, el nombre, el número y quién se encarga; etiquetas (tipo de cliente, "Urgente", "Llegó tarde"); lo que lleva con el dibujo de cada producto (hasta 4, "y N más"; en Lista de compras, Comprado y Preparando, todos, con **scroll dentro de la tarjeta** si la lista es larga); ⏰ plazo (rojo vencido, amarillo pronto, verde listo), 💬 notas, ☑ avance y total estimado. Una tarjeta sin productos lo dice y lleva a cargarlos.
- **Tildar la compra en la tarjeta** (Lista de compras y Comprado, `lista_compra.editar`): cada producto tiene una casilla ✓ ("ya se compró", sin anotar puesto ni precio) y una ✕ ("no se consiguió"); tocarlas de nuevo lo deja por comprar. El tilde es del producto en la lista del día: vale para todas las tarjetas que lo llevan. Una compra anotada con su precio no se destilda desde acá (se anula en Compras anotadas). Con todo lo suyo resuelto, la tarjeta pasa sola a Comprado.
- **Arrastrar** (con el mouse, o manteniendo el dedo apretado un instante en el celular): la tarjeta se levanta inclinada y con sombra, la columna donde se puede soltar se marca y, cerca de los bordes, el tablero se corre solo. Queda en su lugar nuevo al instante, mientras se guarda.

  | De → a | Qué hace |
  |---|---|
  | Pedidos → Lista de compras | La manda a la lista de compras. |
  | Lista de compras → Comprado | Tilda todo lo que le faltaba, **sin necesidad de tildar producto por producto** (por ejemplo, si se compró con la lista impresa). Lo marcado "no se consiguió" queda así. |
  | Pedidos → Comprado | Las dos cosas juntas. |
  | Comprado → Lista de compras | Saca los tildes puestos a mano en lo suyo. |
  | Lista de compras o Comprado → Pedidos | La saca de la lista. |
  | Pedidos, Lista de compras o Comprado → Preparando | Empieza a preparar **el día entero** (pregunta antes: no es solo esa tarjeta). |
  | Preparando, En camino, Entregados | Avanzan solas al preparar, salir a repartir y entregar: al soltarlas en otro lado se explica dónde se hace ese paso, con el botón para ir. |
- **Elegir pedidos:** "☑ Elegir pedidos" pone casillas; "🛒 Elegir todos los pedidos para la lista" marca de una vez los de la columna Pedidos (sin los vacíos, diciendo cuáles son). Con elegidos aparece una barra: **🛒 Mandar a la lista de compras**, sacar de la lista, prioridad o quién se encarga.
- **Tarjeta abierta** (`?pedido=`): **Lo que lleva** en recuadros con su avance y lo que falta, **✏️ Cambiar productos**, dónde se entrega (Google Maps y Waze), la nota, las notas entre las personas y el historial. Al costado: mandar a la lista, **✓ Pasar a Comprado** o volver a Pedidos, **📦 Preparar su pedido** (cuando está comprado o preparándose), ver el pedido completo, prioridad, quién se encarga y horario.
- **Filtros:** por persona y "Urgentes". **📊 Excel** abre Pedidos en Excel (P-43). En el celular, "＋" flotante para un pedido nuevo.
- Arriba, los avisos como píldoras: notas sin leer, pedidos de acceso, deuda que vence.
- El tablero se vuelve a dibujar solo cuando la otra persona carga o cambia algo (lo detecta la campanita, §5.13).

Los pedidos **no se confirman a mano**: se cargan completos y, al mandarlos a la lista o al empezar a preparar, los que quedaron sin terminar pero tienen productos se completan solos.

#### P-02 El día paso a paso (pestaña "☰ Paso a paso")

Seis pasos en tarjetas de colores vivos (los mismos de las columnas del tablero), con "Ahora toca: …" y la barra de avance:

| Paso | Hecho cuando… | Acción principal |
|---|---|---|
| 📝 Pedidos | hay pedidos cargados y ninguno sin terminar | ＋ Nuevo pedido |
| 🛒 Lista de compras | la lista está armada y al día | Armar o actualizar la lista · imprimir |
| 🧺 Compras en el mercado | todo lo de la lista está comprado o no conseguido | 🛒 Abrir la lista de compras · anotar otra compra |
| 📦 Preparación y remitos | todos los clientes están preparados y con su remito | 📦 Empezar a preparar o seguir · imprimir para separar |
| 🚚 Reparto y entrega | todo se entregó | Logística · imprimir los remitos del día · confirmar entregas |
| 🔒 Cierre del día | el día está cerrado | Revisar y cerrar el día |

"Ahora toca" es el paso más avanzado sin terminar; lo que quedó a medias antes aparece como "Quedó pendiente de antes" dentro del paso actual, con su botón. La regla está en `src/dominio/jornadas/pasos.ts`.

#### P-03 Mi cuenta

Nombre y color del avatar (con vista previa), cambio de contraseña y, para quien administra, **Administración**: Usuarios y Configuración del negocio.

---

### 5.2 Catálogo de productos

#### P-10 Productos

Tarjetas agrupadas por categoría (o "☰ Lista"): dibujo, **código**, en qué se cuenta, envase de compra, "Desde $X el kg", cuántos puestos lo venden y el preferido. El buscador encuentra por nombre o por código. Arriba, **📊 Excel** (P-13) y **Precios de venta**.

**＋ Nuevo producto** (tres preguntas): qué es y su categoría; cómo se vende (kilo, unidad, atado, docena u "otra forma"); en qué envase se compra ("Suelto", los sugeridos u "Otro envase…"). La ganancia con su cuenta de ejemplo, si se pide en partes, poner otro código y las notas quedan en "Más opciones".

- **Código:** se arma solo con el nombre ("Tomate redondo" → `TOMA-R`; si ya existe, `TOMA-R2`) y se muestra mientras se escribe. Sirve para buscar el producto (en Productos y en Nuevo pedido) y para las planillas de Excel (P-43).
- **Dibujo:** un emoji para reconocer el producto de un vistazo en el tablero, los pedidos y las listas. **No se elige: sale solo** del nombre (🍅 para "tomate", 🥔 para "papa", 🫛 para "chaucha"…) y, si el nombre no dice nada, del grupo de su categoría (🥦 verdura, 🍎 fruta, 📦 otro). La lista de palabras está en `src/dominio/catalogo/productos.ts` (RN-004b).

| Acción | Permiso | Reglas | Resultado |
|---|---|---|---|
| Nuevo producto | `productos.editar` | RN-001, RN-004 a RN-006 | Crea el producto con su envase de unidad base y el de compra. |
| Desactivar / reactivar | `productos.editar` | RN-007 | Advierte si tiene pedidos en curso. |

#### P-11 Ficha de producto

**🏪 ¿Dónde se compra y a cuánto?**: una tarjeta por puesto que lo vende, con el precio del envase en grande, la frase "Te sale $X el kg", hace cuánto se cargó el precio y las marcas "★ El que preferís", "✓ El más barato" o "X % más caro que el más barato". A la vista, **¿Cambió el precio?** con "Guardar el precio nuevo"; plegado en "Más opciones de este puesto", cada botón con su explicación: "✓ Hoy sigue al mismo precio", "🚫 Hoy no tiene", "★ Es el que prefiero", "📈 Ver cómo fue cambiando el precio" y "Este puesto ya no lo vende". Debajo, "＋ Agregar otro puesto que lo vende" (qué puesto, en qué envase, a cuánto). **📦 ¿En qué envases viene?**: envases como tarjetas ("1 cajón = 18 kg", para comprar / para vender). Además, precio de venta por cliente y notas. Los datos y el código se editan desde "✏️ Editar los datos del producto (o darlo de baja)" (plegado).

#### P-12 Categorías

Nombre, grupo (fruta, verdura, otro), orden y ganancia de la categoría.

#### P-13 Productos en Excel

Para cargar muchos productos de una vez (por ejemplo, al empezar) y para sacar la lista de los que ya están. Se abre con "📊 Excel" en Productos.

- **📥 Subir productos desde Excel** (`productos.editar`): se baja la **planilla modelo** (hoja "Productos" con los títulos, "Cómo llenarla" y "Categorías" con las que ya existen), se escribe **una fila por producto** y se sube el archivo (.xlsx o .csv, hasta 900 KB). Columnas, reconocidas por su título y en cualquier orden: **Producto** y **Categoría** (obligatorias), **Código** (vacío = se arma solo), **Se vende por** (kg, unidad, atado, docena, maple, bandeja, paquete o litro; vacío = kg), **Envase de compra** y **Trae** ("Cajón" y 18 → "Cajón 18 kg"; vacíos = se compra suelto), **Se pide en partes** (sí o no), **Ganancia %** y **Notas**.
- **Primero se revisa:** muestra los productos nuevos con su dibujo, las categorías que se van a crear y los que ya estaban cargados (se saltean: la planilla no cambia productos que ya existen). Si hay algo que no entiende lo dice **fila por fila** con cómo arreglarlo ("no existe la categoría… ¿Quisiste decir…?", "falta cuántos kg trae el envase", "está repetido en la fila 5") y **no carga nada**.
- **✓ Cargar estos N productos** los crea todos juntos (o ninguno), con sus categorías nuevas. Los precios de cada puesto se cargan después, en la ficha o solos con la primera compra.
- **📤 Bajar la lista de productos** (`productos.ver`): todos los productos, uno por fila, en Excel o CSV, con las mismas columnas más si están activos. La ganancia sale solo para quien puede ver márgenes. Esa misma planilla se puede volver a subir después de agregarle filas.

| Acción | Permiso | Reglas | Resultado |
|---|---|---|---|
| Revisar una planilla | `productos.editar` | RN-004c | Los productos que se crearían y los problemas por fila; no guarda nada. |
| Cargar los productos | `productos.editar` (y `precios.editar_reglas` si trae ganancias) | RN-004b, RN-004c | Todos en una transacción; cada uno queda registrado en la actividad. |
| Bajar la lista o la planilla modelo | `productos.ver` | — | Un .xlsx (o .csv). |

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

**＋ Nuevo proveedor** (cuatro preguntas): nombre y dónde está en el mercado; cómo se le paga (En el momento / A cuenta, con hasta cuánto se le puede deber y el plazo: a la semana, 15 o 30 días); el teléfono; **cómo se le transfiere** (alias, a nombre de quién está la cuenta y CBU o CVU, RN-108b). Contacto, CUIT y demás en "Más datos".

#### P-21 Ficha de proveedor

**🏦 Para transferirle** (alias, CBU y titular, cada uno con 📋 Copiar; si faltan, "Cargarlos →"), productos y precios (cada uno se cambia desde "✏️ Cambiar"; "Otro producto" para agregar), la cuenta (P-61), notas; los datos, plegados.

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
3. **¿Qué lleva?** Recuadros de productos por categoría (con su dibujo y su código; el buscador encuentra por nombre o por código); arriba **⭐ Lo que suele pedir** y **↺ Repetir su último pedido**. Al tocar uno se agrega y se agranda: − y + grandes, la cantidad para escribir, por kilo o por envase, cantidades rápidas y una nota.
4. **El pedido** (al costado en la PC, abajo en el celular): lo elegido, ¿es urgente?, ¿tiene un horario?, la nota (sale en el remito) y **✓ Guardar el pedido**.

Se guarda todo junto o nada: **nunca queda un pedido vacío**. Antes de guardar, marca en rojo lo que falta con la explicación. Al terminar: "Pedido guardado", **＋ Cargar otro pedido**, **Ver en el tablero** o **Cambiar algo**. Al cambiar un pedido que ya está en la lista de compras, lo que se saca queda cancelado con el motivo y la lista se marca para actualizar.

#### P-42 Detalle de pedido

Se abre desde la tarjeta ("Ver el pedido completo"). Tiene las líneas con su precio estimado y origen, **✏️ Cambiar productos**, **Ver en el tablero** y:

| Acción | Permiso | Reglas | Resultado |
|---|---|---|---|
| Cancelar pedido | `pedidos.cancelar` | RN-028 | Mientras no se empezó a preparar; motivo obligatorio. Lo ya comprado queda como sobrante previsto. |
| Pasar a otro día | `pedidos.editar` | 04 §5.b | Si ya está en la lista de compras, primero hay que sacarlo desde el tablero. |
| Duplicar | `pedidos.crear` | RN-033 | — |

#### P-43 Pedidos en Excel

Para quien prefiere armar los pedidos en una planilla, y para sacar del sistema lo que ya está cargado. Se abre con "📊 Excel" en el tablero o "📥 Cargar desde Excel" en Nuevo pedido.

- **📥 Subir pedidos desde Excel** (`pedidos.crear`): se baja la **planilla modelo** (hoja "Pedidos" con los títulos, "Cómo llenarla", "Productos" con su código y sus envases, y "Clientes"), se escribe **una fila por producto** y se sube el archivo (.xlsx o .csv, hasta 900 KB). Columnas, reconocidas por su título y en cualquier orden: **Fecha de entrega** (opcional: vacía vale el día elegido en la pantalla), **Cliente**, **Código** o **Producto** (alcanza con uno), **Cantidad**, **Unidad o envase** (vacía = por kilo, unidad…; o el nombre de un envase del producto) y **Nota**. El cliente y la fecha vacíos valen los de la fila de arriba. Las filas del mismo cliente y día forman un pedido.
- **Primero se revisa:** el sistema muestra los pedidos que entendió (cliente, día y lo que lleva) y avisa si un cliente ya tiene un pedido ese día. Si hay algo que no entiende, lo dice **fila por fila** con cómo arreglarlo ("No hay ningún cliente que se llame… ¿Quisiste decir…?", "se pide en unidades enteras", "esa fecha ya pasó") y **no carga nada**: se corrige el Excel y se vuelve a subir.
- **✓ Cargar estos N pedidos** los guarda todos juntos (o ninguno) y quedan en la columna Pedidos, igual que los cargados a mano.
- **📤 Bajar los pedidos a Excel** (`pedidos.ver`): los pedidos de un día, una fila por producto, con las mismas columnas más el número de pedido y en qué etapa está. Esa misma planilla se puede volver a subir.

| Acción | Permiso | Reglas | Resultado |
|---|---|---|---|
| Revisar una planilla | `pedidos.crear` | RN-018c | Los pedidos que saldrían y los problemas por fila; no guarda nada. |
| Cargar los pedidos | `pedidos.crear` y `pedidos.confirmar` | RN-018b, RN-018c | Todos en una transacción; cada uno queda registrado en la actividad. |
| Bajar pedidos o la planilla modelo | `pedidos.ver` / `pedidos.crear` | — | Un .xlsx. |

#### P-45 Otros días y P-47 Cierre del día

"Otros días" lista los días con pedidos y su estado; cada uno abre su tablero. El **cierre** tiene dos partes (04 §5.h): **Falta resolver** (entregas sin confirmar, pedidos sin terminar, remitos sin hacer, cada uno con su botón) y **Para revisar** (lo no comprado, márgenes negativos); después, el resumen del día (vendido, costo, ganancia, sobrantes, resultado, deuda) y **Cerrar el día** (`jornada.cerrar`), que lo deja en solo lectura con el resumen guardado. **Reabrir** pide motivo (`jornada.reabrir`, RN-041).

---

### 5.8 Lista de compras y compras

#### P-50 Lista de compras (celular, en el mercado)

Todo lo que hay que comprar para los pedidos de un día, junto. Dentro del cartel de color, **👀 Ver la lista completa** despliega la lista entera de ese día para leerla de un vistazo (producto, puesto, para quién, cuánto y si ya se compró), sea la de hoy, la de mañana o la de cualquier día. De arriba hacia abajo:

1. **¿De qué día querés ver la lista?** La misma fila de días que el tablero (Hoy, Mañana, los que tienen pedidos con su cantidad, y "📅 Otros días"). Sin elegir, abre el día que se está trabajando.
2. **El cartel de qué lista es**, grande y de color, para no confundir la de hoy con la de otro día: **HOY** (verde, "Lista de hoy, martes 06/10"), **MAÑANA** (azul, aclara que todavía no es la de hoy), **YA PASÓ** (amarillo, "para comprar ahora, elegí Hoy") o **MÁS ADELANTE** (violeta). Dice para qué día de entrega es, cuántos pedidos y productos tiene, cuántos faltan comprar (con la barra de avance) y cuánto se calcula gastar.
3. **Lo que se usa siempre:** 🖨️ Imprimir (DOC-01: abre la hoja con la lista completa del día —lo que falta y lo ya comprado, con para quién es cada cosa— y el diálogo de impresión; ahí se puede dejar solo lo que falta o sacar los precios), **📊 Bajar a Excel** y cómo ordenarla: **Todo junto** o **Por puesto** (en el orden de los puestos del mercado).
4. **❓ Cómo se usa esta lista** (abierto mientras no se compró nada): mirar lo que falta; marcarlo con "✓ Lo compré" o "☑ Solo tildar"; si no había, "No lo conseguí".
5. **🛒 Falta comprar** y, debajo, **✓ Ya resuelto**.
6. **⚙️ Más opciones** (plegado, lo secundario): compras anotadas de ese día, anotar otra compra (varias cosas de un puesto), bajar como CSV, volver a calcular la lista (RN-049, RN-052: nunca toca lo comprado ni lo tildado) y cuándo se armó.

Sin lista para ese día, explica cómo se arma (desde el tablero, o acá con todos los pedidos del día).

- Cada producto es una tarjeta: dibujo, **Hay que comprar N × envase** (redondeado a envases completos, RN-044), **Conviene en** el puesto sugerido con su precio (por costo y crédito disponible, RN-047), **👥 Para:** qué clientes lo llevan y cuánto cada uno, y los avisos (sin proveedor, crédito insuficiente, precio viejo).
- **✓ Lo compré** abre, en la misma tarjeta: ¿en qué puesto? (los que lo venden, u "Otro puesto…" con proveedor y envase), cuántos, a cuánto cada uno, **📒 Queda a cuenta** o **💵 Le pagué en efectivo**, y el total. **Anotar la compra** la registra como una compra común (cuenta del proveedor, precio del puesto, límite) y la línea pasa a **Ya resuelto**.
- **☑ Solo tildar** marca el producto como comprado sin anotar puesto ni precio (lo mismo que el ✓ de la tarjeta del tablero). Queda en **Ya resuelto** como "✓ Tildado como comprado · sin anotar puesto ni precio"; en sus "Otras opciones" están **↩ Destildar** y **🧾 Anotar puesto y precio** (el mismo formulario de "✓ Lo compré", por si después se quiere dejar registrada la compra).
- **Otras opciones** (plegado en cada producto): no lo conseguí o cambiar la cantidad, con motivo (RN-050, RN-051), y cuánto se necesita en total.
- **Bajar a Excel o CSV** (`/lista-compra/planilla?fecha=`, `&formato=csv`): una fila por producto en el orden de los puestos, con puesto, código, producto, cuánto comprar y en qué envase, cuánto se necesita, para quién, cómo va (falta, comprado, tildado, no se consiguió), lo ya comprado y las notas; el precio del envase y lo que se calcula gastar salen solo para quien puede ver costos.

| Acción | Permiso | Reglas | Resultado |
|---|---|---|---|
| ✓ Lo compré | `compras.registrar` | RN-054 a RN-063 | Una compra de contado o a cuenta con su movimiento, el precio del puesto al día y el avance de la lista. Si supera el límite, lo explica y ofrece seguir con motivo a quien tiene `compras.exceder_limite`. |
| ☑ Solo tildar / destildar | `lista_compra.editar` | RN-051b | El producto cuenta como comprado para el tablero y para preparar; no genera compra, deuda ni costo real. |
| No lo conseguí | `lista_compra.editar` | RN-051 | Motivo obligatorio. |
| Cambiar la cantidad | `lista_compra.editar` | RN-050 | Motivo obligatorio. |

#### P-55 Anotar una compra suelta

Para lo que no está en la lista o para anotar varias cosas de un puesto de una vez: primero el puesto (con los que tienen algo de la lista arriba), después lo que la lista dice comprarle ahí; **＋ Agregar otro producto** para sumar más. **¿Cómo pagaste?** Pagué todo / Queda a cuenta / Pagué una parte. Si el precio varía mucho, pide confirmar (RN-058).

#### P-56 Compras anotadas y P-57 Detalle de compra

Lista con total, pagado, pendiente y estado de pago. El detalle muestra las líneas, qué pagos la cancelan, el vencimiento y, si falta pagar, **💵 Pagué en efectivo** / **🏦 Pagué por transferencia** (RN-097b).

| Acción | Permiso | Reglas | Resultado |
|---|---|---|---|
| Anular | `compras.anular` | RN-065, RN-101 | Motivo. Si era de contado, pregunta si el proveedor devolvió la plata. Recalcula la lista, el costo real y los precios. |
| Pagar esta compra | `pagos.registrar` | RN-097 | Abre P-62 con esta compra elegida. |

---

### 5.9 Cuentas con proveedores

Convención de 06 §10: pagado verde, pendiente ámbar, vencido rojo con reloj, saldo a favor con la leyenda "a favor"; siempre con texto.

- **P-60 Deudas con proveedores:** una fila por proveedor con límite, deuda, disponible, % de uso, semáforo, vencido, próximo vencimiento y último pago; totales al pie; filtros "con deuda", "vencidos", "en rojo". Por fila: Pagar, Cuenta, Estado de cuenta (DOC-05).
- **P-61 Cuenta del proveedor:** la tarjeta **🏦 Para transferirle**; las compras sin pagar con su vencimiento y, en cada una, **💵 Pagué en efectivo** y **🏦 Pagué por transferencia**, que pagan lo que falta de esa compra con un toque (pide confirmar el importe, RN-097b); movimientos con saldo acumulado y pagos. Botones: **Otro pago (una parte o varias compras)**, **Ajuste o deuda anterior**, **Estado de cuenta**.
- **P-62 Otro pago:** para pagar una parte o varias compras juntas, con la tarjeta para transferir arriba. Importe, medio, referencia opcional; imputación automática (de la compra más vieja a la más nueva) o elegida a mano, con la vista previa de qué compras cancela (RN-096, RN-097). Lo que sobra queda a favor (RN-098).
- **P-63 Ajuste o deuda anterior:** débito o crédito con motivo y compra relacionada (RN-102); la deuda anterior al sistema, en una o varias boletas.
- **P-64 Detalle de pago:** qué compras cancela; **Reimputar** y **Anular** con motivo (RN-100).

---

### 5.10 Preparación

#### P-70 Preparación del día

Lo que hay que separar para cada cliente. **Empezar a preparar** arma una tarjeta por cliente y punto de entrega con lo que pidió (RN-111); si algo de lo comprado no alcanza para todos, se reparte empezando por los urgentes y la prioridad de cada cliente (RN-115), y queda anotado qué falta. "Sumar los pedidos nuevos" agrega los que llegaron después.

- **👤 Por cliente:** cada cliente es una tarjeta con **todos** sus productos: ✓ separado o ⬜ por separar, la cantidad y, en naranja, lo que falta y por qué. Botón **📦 Preparar este pedido** (o "Seguir preparando", "Ver o corregir").
- **🥬 Por producto:** comprado, pedido, preparado y si sobra o falta; cada producto abre P-72.
- **🖨️ Imprimir para separar** (DOC-07) y **🚚 Logística (viaje de entrega)**.

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

#### P-78b Logística (viaje de entrega)

En el menú figura como **🚚 Logística**. Las entregas que faltan llevar, el mejor orden y el GPS:

- **🚚 En camino:** las entregas que ya salieron, en el orden del reparto, cada una con **✅ Entregar**, que abre la confirmación (quién recibió, diferencias) y vuelve al viaje. Es el camino corto para quien reparte desde el celular; el mismo botón está en cada parada de "Armar reparto".

- **🏬 De dónde salen los repartos (depósito o mercado):** se marca una vez, de tres formas numeradas: 1) "Estoy en el lugar" (GPS del celular), 2) escribiendo la dirección y eligiendo el resultado (la dirección buscada queda guardada), 3) pegando un enlace de Google Maps o las coordenadas.
- **📍 Lugares sin la ubicación marcada:** cartel amarillo que nombra cada cliente y lugar de entrega del día al que le falta, con su dirección; al tocarlo se marca ahí mismo con las mismas tres formas.
- **¿De dónde salís?** (al calcular): tres botones grandes, "🏬 Del depósito", "📱 De donde estoy ahora" (GPS) o "✍️ De otra dirección" (se escribe y se busca, o se pega un enlace).
- **Calcular el viaje:** empezar por una parada o por la más cómoda, y volver o no. El orden es el de menos kilómetros (exacto hasta 8 paradas; con más, el vecino más cercano mejorado). Cada tramo con kilómetros y minutos aproximados. Las paradas sin ubicación van al final y el aviso las nombra una por una.
- Ajuste a mano con ↑ ↓; por parada **Ir** (Google Maps), **Waze** y 📞; "Abrir todo el viaje en Google Maps".
- **Armar el reparto con este orden** o **Guardar este orden**.
- La búsqueda de direcciones usa OpenStreetMap desde el servidor, solo al tocar "Buscar".

#### P-76 Armar reparto

Se abre desde "Repartos armados" del viaje de entrega: las entregas sin reparto a un lado y las paradas ordenadas al otro, la tarjeta "Recorrido y GPS", **🖨️ Hoja de ruta** (DOC-04), **Hacer los remitos que faltan**, **Salir** (exige los remitos al día, RN-122) y **Anular** (sin entregas confirmadas, con motivo).

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

- **📁 El balance de cada mes, en Excel** (al final de P-91): una lista con un renglón por mes —nombre del mes, de qué fecha a qué fecha, lo vendido, lo comprado y la ganancia—, del mes en curso hacia atrás, con **Ver en pantalla** y **⬇ Bajar el Excel** (`/balance/planilla?mes=aaaa-mm`). Cada archivo trae las hojas Resumen, Gráficos (barras a todo lo ancho: vendido y comprado, ganancia y deuda, una barra por día), Por día, Clientes y Productos (estas dos con su gráfico). Cada mes nuevo aparece solo; se listan los últimos 24 meses y los más viejos salen solos de la lista. Los archivos no se guardan: se arman al bajarlos con lo registrado.
- **Gráficos a todo el ancho:** la pantalla del balance usa todo el ancho disponible, con un gráfico por renglón; las barras se reparten ese ancho y, cuando son anchas, cada una lleva su valor escrito.
- **P-91 Balance:** se elige qué fechas ver con botones: **Hoy**, **Ayer**, Últimos 7 días, Este mes, Últimos 30 días (lo que abre por defecto) y Este año; "📅 Elegir otras fechas" (plegado) permite cualquier rango y si cada barra es un día, una semana o un mes. Arriba, una frase que lo resume ("El martes 06/10 se vendieron $X en N entregas, se compraron $Y de mercadería y quedaron de ganancia $Z"); cuatro tarjetas con dibujo —**Se vendió**, **Se compró**, **Quedó de ganancia** ("N de cada 100 pesos vendidos") y **Se les debe a los proveedores**—, las tres primeras con ▲/▼ contra los días anteriores; en una línea chica, lo pagado a proveedores y lo entregado sin facturar; **¿Cuánto queda de lo que se vende?** (de cada $100 vendidos, cuánto pagó la mercadería y cuánto quedó, en una barra). Los gráficos son **todos de barras** (`GraficoBarras` en `src/ui/graficos.tsx`), cada uno con una explicación de una línea y su tabla plegada ("Ver los números en una tabla"): **Lo que se vendió y lo que se compró** (dos barras por período, azul y naranja, con leyenda), **Lo que quedó de ganancia** (hacia abajo y en rojo si se perdió) y **Lo que se les debe a los proveedores** (al terminar cada período); con una sola serie, el valor va escrito sobre la barra más alta y sobre la última, y el resto se lee al pasar el dedo o el mouse. Abajo, **A quién se le vendió más** (con medallas) y **Qué se vendió más** (con el dibujo de cada producto), en barras horizontales. Cada importe respeta los permisos de precios.
- **Balance del día** (`/balance?dia=aaaa-mm-dd`, botones Hoy y Ayer, o "💰 Balance del día" en el tablero): el mismo balance para un solo día —título "Balance de hoy, martes 06/10"—, con "← Día anterior", "Día siguiente →" y "Ver otro día". Muestra lo vendido, lo comprado y lo ganado ese día comparado con el día anterior, las barras de **ese día junto a los seis anteriores**, y **las ventas del día**: a quién se le vendió y qué se vendió. "Movimientos del día" abre el detalle. Si todavía no se entregó nada, lo dice.
- **P-93 Movimientos:** ventas, compras, pagos y ajustes del período, del más nuevo al más viejo, con totales por tipo; cada fila lleva a su documento.
- **P-90 Reportes:** ventas y margen por cliente y por producto, compras por proveedor y por producto, días cerrados, deuda por antigüedad, faltantes y diferencias.
- **P-94 Actividad y notas:** lo que hizo cada persona en palabras ("María mandó a la lista de compras el pedido PED-000012") y las notas, por día; una tarjeta por persona arriba; filtros por persona y "solo notas".
- **🔔 Campanita de avisos** (en todas las pantallas, RN-160 a RN-163): el número rojo cuenta lo que hicieron **las otras personas** desde la última vez que se abrió, más las notas sin leer. Al tocarla se abre el panel con las novedades, de la más nueva a la más vieja (quién, qué y cuándo, cada una lleva a lo que nombra); lo dirigido a uno —una nota "para vos", un pedido que te pasaron— va con la etiqueta **👉 Para vos**. Varios tildes seguidos de la lista de compras se muestran como un solo aviso ("marcó 5 productos en la lista de compras"). Abrir el panel deja vista la actividad; las notas siguen contando hasta que se leen ("Marcar las notas como leídas"). Abajo, **✍️ Pedirle o avisarle algo a…** deja un aviso suelto para otra persona, y "Avisarme también cuando tengo la pantalla tapada" pide permiso para las notificaciones del navegador (en la computadora).
- **Mientras el sistema está abierto**, la campanita pregunta cada 30 segundos: si llegó algo nuevo aparece un cartel arriba ("María cargó el pedido…", o "María hizo 3 cosas nuevas") y las pantallas del día (tablero, paso a paso, lista de compras, preparación, viaje, actividad) se vuelven a dibujar solas.
- **Qué genera un aviso:** todo lo que se carga o se cambia queda en la actividad en el mismo momento: pedidos (cargar, cambiar productos o datos, cancelar, prioridad, plazo, responsable, importar de Excel), lista de compras (armar, sacar, tildar, no conseguido), compras y pagos (y sus anulaciones y ajustes), preparación, repartos y entregas, comprobantes, cierre del día, clientes, proveedores y productos (alta, cambios, baja, lugares de entrega, precios de compra y ganancias), categorías, configuración y accesos de usuarios.

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
