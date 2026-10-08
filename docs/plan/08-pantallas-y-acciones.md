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
| 2 | **Grande y despejado** | Botones de al menos 48 px y **letra grande**: 18 px de base en la computadora y 17 en el celular, y ningún texto por debajo de unos 15 px (el tamaño base y los textos chicos se fijan una sola vez en `app/globals.css`). Recuadros grandes con dibujos, sin renglones vacíos de relleno: lo opcional se agrega cuando hace falta ("＋ Agregar otro producto", "Otro puesto…") o queda plegado en "Más opciones". El texto de un botón va centrado y la flecha "→" nunca queda sola en otro renglón. |
| 3 | **El servidor decide qué se ve** | Cada pantalla recibe solo lo que el usuario puede ver (02 §8). |
| 4 | **Preparación y reparto sin precios, siempre** | Aunque las abra el dueño (02 §1, principio 3). |
| 5 | **Nada se borra** | Los documentos se anulan con motivo; clientes, productos y proveedores se desactivan. Solo se sacan productos de un pedido que todavía no se preparó. |
| 6 | **Estados con color, dibujo y texto** | Nunca solo color. Colores pastel por etapa, como las etiquetas de Trello. |
| 7 | **El precio dice de dónde sale** | Todo precio de venta lleva su origen ("Ganancia del cliente") y, si todavía puede cambiar, "estimado" (05 §7). |
| 8 | **Confirmar solo cuando hace falta** | Los avisos se muestran en línea; piden un toque más solo cuando la regla lo exige (variación brusca, margen negativo, límite de crédito). |
| 9 | **Guardado seguro** | Pedidos: se guardan completos o nada. Compras, pagos y confirmaciones: clave de idempotencia (un doble toque no duplica). |
| 10 | **Idioma** | Español rioplatense con voseo; números a la argentina ("17.550", "1.234,56"); pesos sin decimales en pantalla. |
| 11 | **Poco texto y preciso** | Cada ayuda es una frase corta que dice qué hacer ("Tildá cada producto.", "Se hace el remito.", "Pasa a En camino."); sin explicaciones largas ni frases repetidas. |

---

## 2. Navegación

### 2.1 Disposición

| Elemento | En la PC | En el celular |
|---|---|---|
| Menú | Lateral izquierdo, con dibujo en cada entrada; la pantalla actual queda marcada. **Se guarda y se vuelve a abrir** con el botón « (arriba del menú) y el ☰ (en la barra): guardado, la pantalla usa todo el ancho; queda como se lo dejó la última vez (se recuerda en ese navegador). | Botón **☰** arriba a la izquierda: el menú se despliega como un cajón sobre la pantalla y se guarda solo al elegir a dónde ir, al tocar afuera o con «. |
| Barra superior | Nombre del sistema ("Sistema Repartos"), 🔔 campanita de avisos (§5.13), la persona (lleva a Mi cuenta) y "Salir". | Igual; el panel de avisos ocupa el ancho de la pantalla. |
| Elegir el día | En el tablero, el paso a paso y la lista de compras: una fila de días (Hoy, Mañana y los que tienen pedidos, cada uno con cuántos pedidos) y "📅 Otros días". | Igual; la fila se desliza de costado. |
| Imprimir | Botón **🖨️ Imprimir** en cada pantalla con documento: abre la vista A4 y el diálogo del navegador ("Guardar como PDF" para compartir). | Igual. |

### 2.2 Menú

| Grupo | Pantallas | Visible si el usuario tiene… |
|---|---|---|
| Día de trabajo | **📋 Tablero de pedidos** (el botón destacado, en verde lleno: es la pantalla del día) · **＋ Nuevo pedido** (debajo, también llamativo, con borde verde) · **Etapas del día**: 🛒 Lista de compras · 📦 Preparación · 🧾 Remitos · Logística (y 🔒 Cierre del día cuando hay un día en curso) · Mi reparto (solo para quien no maneja todos los repartos) · Actividad y notas | Sesión · `pedidos.crear` · `lista_compra.ver` · `preparacion.ver` · `documentos.imprimir_entrega` · `repartos.ver` (· `jornada.cerrar`) · `repartos.ver_propios` sin `repartos.gestionar` · Sesión |
| Registros | Clientes · Productos · Precios de hoy · Proveedores | `clientes.ver` · `productos.ver` · `precios.ver_costos` · `proveedores.ver` |
| Cuentas | Balance · 🤝 **A cobrar** (lo que deben los clientes) · 📤 **A pagar** (lo que se les debe a los proveedores) · 💸 **Gastos e ingresos** · Facturación | `reportes.ver` · `cobranzas.ver` · `pagos.ver` · `pagos.ver` · `facturacion.ver` |

Los grupos sin ninguna pantalla visible no aparecen.

**Etapas del día (06/10):** con un día en curso (el mismo que abre el tablero: ya tiene pedidos cargados o pasó de "abierto", y no está cerrado), debajo de **Tablero de pedidos** y de **Nuevo pedido** aparecen sus etapas, cada una con un círculo de estado (✓ hecha, ● la que toca, … a medias, ○ falta), su avance en pocas palabras ("5 de 5 comprados", "2 de 3 listos", "2 hechos", "1 en camino · 1 entregado") y el enlace directo a esa etapa de ese día, sin pasar por el tablero. Se buscan aparte del resto de la pantalla (no la demoran); mientras tanto, y si no hay un día en curso, se ven Lista de compras, Preparación, Remitos y Logística sueltos. Como se puede preparar de a un pedido, mientras queden pedidos sin empezar la Preparación figura a medias y lo dice ("1 de 1 listos · 2 pedidos sin empezar"), y el día no pasa al cierre. La regla está en `src/dominio/jornadas/etapas.ts`.

Lo demás se abre desde donde se usa:

| Pantalla | Se llega desde |
|---|---|
| El día paso a paso | Pestaña "☰ Paso a paso" del tablero |
| Otros días y cierre del día | "📅 Otros días" del tablero; paso "Cierre" |
| Compras anotadas | Lista de compras |
| Preparación y remitos de otro día | Columnas "Comprado" y "Preparando" del tablero; tarjeta abierta; paso a paso; ← → en cada pantalla |
| El reparto y sus entregas | Logística ("Todavía no salieron"), preparación, paso a paso |
| Cargar productos desde una planilla y categorías | Productos |
| Precios de compra | Productos, ficha del proveedor |
| Precios de venta | Productos ("Precios de venta") |
| Pedidos en Excel | Botón "📊 Excel" del tablero; "📥 Cargar desde Excel" en Nuevo pedido |
| Bajar la lista de productos a Excel | Botón "📊 Bajar a Excel" de Productos |
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
| P-13 | Lista de productos en Excel (bajar) | `/productos/planilla?lista=1`, `&formato=csv` | D | `productos.ver` | O +M |
| P-12 | Categorías | `/productos/categorias` | D | `productos.ver` | O +M |
| P-28 | Cargar productos desde una planilla | `/productos/cargar` (la planilla modelo se baja de `/productos/planilla`) | D | `productos.editar` | O |
| P-15 | Clientes (y nuevo cliente) | `/clientes`, `/clientes/nuevo` | M/D | `clientes.ver` | O |
| P-16 | Ficha de cliente | `/clientes/[id]` | M/D | `clientes.ver` | O +V +M |
| P-20 | Proveedores (y nuevo proveedor) | `/proveedores`, `/proveedores/nuevo` | D | `proveedores.ver` | O +F |
| P-21 | Ficha de proveedor | `/proveedores/[id]` | D | `proveedores.ver` | O +C +F |
| P-25 | Lista general de precios de compra | `/precios/compra` | D | `precios.ver_costos` | C +F |
| P-26 | Precios en el puesto | `/precios/compra/rapida` | M | `precios.editar_compra` | C |
| P-27 | Precios de hoy | `/precios/hoy` | M/D | `precios.ver_costos` (cambiar: `precios.editar_compra`) | C |
| P-29 | Historial de precios de un producto | `/precios/compra/historial/[id]` | D | `precios.ver_costos` | C |
| P-32 | Precios de venta | `/precios/venta` | D | `precios.ver_margenes` | M +V +C |
| P-41 | Nuevo pedido y cambiar productos | `/pedidos/nuevo`, `/pedidos/[id]/cambiar` | M | `pedidos.crear` o `pedidos.editar` | O +V |
| P-42 | Detalle de pedido | `/pedidos/[id]` | M/D | `pedidos.ver` | O +V +C +M |
| P-43 | Pedidos en Excel (subir y bajar) | `/pedidos/importar`; descargas en `/pedidos/planilla?fecha=` y `?modelo=1` | D | `pedidos.ver` (subir: `pedidos.crear`) | O |
| P-45 | Otros días | `/jornadas` | M/D | `jornada.ver` | O |
| P-47 | Cierre del día | `/jornadas/[fecha]/cierre` | D | `jornada.cerrar` | O V C M F |
| P-50 | Lista de compras | `/lista-compra`; descarga en `/lista-compra/planilla?fecha=` | M | `lista_compra.ver` | O +C +F |
| P-51 | La compra, producto por producto | `/lista-compra/comprar?fecha=&item=` | M | `compras.registrar` | O +C |
| P-55 | Anotar una compra suelta | `/compras/nueva` | M | `compras.registrar` | C +F |
| P-56 | Compras anotadas | `/compras` | D | `compras.ver` | C +F |
| P-57 | Detalle de compra | `/compras/[id]` | M/D | `compras.ver` | C +F |
| P-60 | A pagar (lo que se les debe a los proveedores) | `/cuentas-proveedores` | D | `pagos.ver` | F |
| P-61 | Cuenta del proveedor | `/cuentas-proveedores/[id]` | D | `pagos.ver` | F C |
| P-62 | Registrar pago | `/cuentas-proveedores/[id]/pago` | D | `pagos.registrar` | F |
| P-63 | Ajuste o deuda anterior | `/cuentas-proveedores/[id]/ajuste` | D | `pagos.ajustar` | F |
| P-64 | Detalle de pago | `/cuentas-proveedores/pagos/[id]` | D | `pagos.ver` | F |
| P-65 | A cobrar (lo que deben los clientes) | `/cuentas-clientes` | M/D | `cobranzas.ver` | V F |
| P-65b | Cuenta del cliente | `/cuentas-clientes/[id]` | M/D | `cobranzas.ver` (anotar: `cobranzas.registrar`; anular: `cobranzas.anular`) | V F |
| P-66 | Gastos e ingresos | `/gastos`, `?desde=&hasta=` | M/D | `pagos.ver` (anotar y rubros: `pagos.registrar`; anular: `pagos.anular`) | F |
| P-70 | Preparación del día | `/preparacion/[fecha]` | M | `preparacion.ver` | O |
| P-71 | Preparar el pedido de un cliente | `/preparacion/[fecha]/entrega/[id]` | M | `preparacion.ver` (cargar: `preparacion.registrar`) | O |
| P-72 | Preparar por producto | `/preparacion/[fecha]/producto/[id]` | M | `preparacion.registrar` | O |
| P-76 | Reparto | `/repartos/[id]` | D | `repartos.gestionar` | O |
| P-77 | Mi reparto | `/repartos/mios` | M | `repartos.ver_propios` | O |
| P-78 | Confirmar entrega | `/repartos/mios/entrega/[id]` | M | `entregas.confirmar` | O |
| P-78b | Logística (el recorrido del día) | `/viaje` | M/D | `repartos.ver` | O |
| P-79 | Entregas del día | `/entregas` | M/D | `entregas.ver` | O +V |
| P-81 | Remitos del día (y todos juntos para imprimir) | `/entregas/remitos`, `/entregas/remitos/imprimir` | M/D | `documentos.imprimir_entrega` (con precios: `documentos.imprimir_contable`) | O (+V) |
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

Las vistas de impresión se describen en 09. Las direcciones viejas `/pedidos`, `/jornadas/[fecha]` y `/repartos` llevan al tablero, al paso a paso y a Logística.

---

## 4. Piezas comunes

| Pieza | Comportamiento |
|---|---|
| **Formulario con respuesta** | Si algo falla, dice por qué, cómo seguir y trae el botón para ir a arreglarlo (§7). Lo escrito queda para corregir. |
| **Obligatorios en rojo** | Lo que hay que completar sí o sí lleva un asterisco rojo en su título. Si se toca Guardar con alguno vacío, no se manda nada: esos casilleros quedan **marcados en rojo**, se abre el desplegable donde estén, el cursor va al primero y abajo dice "Falta completar el casillero marcado en rojo". Al escribir, el rojo se va. Lo hace `FormularioAccion` (`src/ui/formulario-accion.tsx`) con cualquier campo `required`; los paneles propios (Precio y puesto, Gastos) hacen lo mismo. |
| **Checklist de productos** | Una sola pieza (`src/ui/checklist.tsx`) para tildar productos, igual en la tarjeta cerrada del tablero, en la tarjeta abierta y en Preparación: casilla ✓ grande a la izquierda, el **dibujo y el nombre del producto del mismo tamaño, grandes y en negrita**, y la cantidad (debajo del nombre en la tarjeta angosta, a la derecha donde hay lugar). Al comprar suma una ✕ ("no se consiguió"); al preparar, solo la ✓. Lo que falta y por qué va en naranja bajo el producto. El tilde se ve al instante y se guarda mientras tanto; si no se pudo, vuelve atrás y explica por qué. |
| **Fecha grande** | El día del que se trata se lee de un vistazo: un cartel de color (HOY verde, MAÑANA azul, YA PASÓ amarillo, MÁS ADELANTE violeta) y la fecha en letra grande ("Jueves 08/10") en lista de compras, preparación, remitos y Logística; y la fecha de entrega en letra grande en cada remito, lista contable, hoja de preparación y lista de compras impresa (`src/ui/fecha-grande.tsx`). |
| **Pregunta guiada** | Las altas (cliente, proveedor, producto) son tres preguntas numeradas con botones grandes y una tarjeta de "Así va a quedar" al costado. |
| **Tarjeta** | Registros, tablero y listas se ven como tarjetas (con opción "☰ Lista" donde conviene). |
| **Semáforo de crédito** | Color, dibujo, texto y porcentaje (06 §8.3). Solo con `proveedores.ver_credito`. |
| **Avatar** | Iniciales con el color que eligió cada persona; muestra quién se encarga de cada pedido. |
| **Notas** | En las tarjetas de pedido y en las fichas: se elige "Para" quién es; se borran solo por quien las escribió. |
| **Gráficos** | SVG propios con tabla ("Ver tabla") y valores al pasar el dedo o el mouse. |
| **Estado vacío** | Explica qué falta y ofrece la acción siguiente ("Todavía no hay pedidos. ＋ Nuevo pedido"). |
| **Flecha de navegación** | Todo lo que lleva a un lugar (el recorrido, cómo llegar, abrir el GPS) usa la flecha de navegación del GPS (un dibujo SVG propio, `src/ui/iconos.tsx`), en azul o del color del botón. |
| **Marcar una ubicación** | En la computadora (mouse) hay una sola forma: **🗺️ Marcar en el mapa**, un mapa incrustado (Leaflet con OpenStreetMap) donde se hace clic en el lugar, se arrastra el punto para afinarlo y se guarda; arriba, un campo para llevar el mapa a una calle. En el celular (dedo), además: **📱 Estoy en el lugar** (GPS), **🔎 Buscar la dirección** y pegar un enlace de Google Maps. Qué se ve lo decide el tipo de puntero con CSS. |
| **🚚 Sale ahora** | Manda pedidos de Preparando a En camino en un paso (RN-153): si falta tildar algo pide confirmar, se marca preparado, se hace el remito y sale el reparto. Está en el tablero (arrastrar o elegir), la tarjeta abierta, la preparación y el viaje. |

---

## 5. Detalle de pantallas

### 5.1 Acceso, inicio y cuenta

#### P-01 Ingreso

Usuario (o correo) y contraseña con botón para verla; **Entrar con Google** siempre a la vista (también "Seguir con Google" al crear una cuenta); **Creá una cuenta**. Si Google todavía no está activado en Supabase, al tocarlo vuelve al ingreso con el aviso "Entrar con Google todavía no está activado en este sistema…" (los pasos para activarlo están en 10 §3). Las cuentas nuevas esperan en `/acceso-pendiente` hasta que las habiliten (02 §10). El primer uso (`/configuracion-inicial`) crea el negocio y al primer ADMIN.

#### P-02 Tablero de pedidos (pantalla principal)

Imita la presentación de Trello sobre una imagen de campo: cada lista es de un color vivo (el de su etapa) y cada tarjeta lleva arriba una franja del tono fuerte de ese color con el nombre del cliente, y sus productos en un recuadro del tono claro. Los colores están en `app/globals.css` (clases `color-azul`, `color-violeta`…, con su versión para el modo oscuro).

**La página no se desplaza:** el tablero ocupa justo el alto de la pantalla y lo que se desplaza es **cada columna por dentro** (y, si hace falta, la lista de productos de una tarjeta). Las seis columnas se reparten el ancho disponible: si el tablero tiene lugar (unos 1150 px de ancho libre) van las seis en una fila; si no, en dos filas de tres. **En el celular las columnas van una al lado de la otra y se deslizan de costado** con el dedo (cada una ocupa casi toda la pantalla y se acomoda sola al soltar; arriba hay una fila de botones para saltar a cada columna); no se amontonan una debajo de la otra. Lo decide el ancho del tablero, no el de la ventana (consultas de contenedor de CSS). Los pedidos cancelados van en una tira debajo de las columnas.

| Lista | Qué tiene | Color |
|---|---|---|
| **Pedidos** | Los pedidos cargados. Se mandan a la lista de compras cuando se quiera. | Azul |
| **Lista de compras** | Los que se están comprando. En la misma tarjeta se **tilda** cada producto: ✓ ya se compró, ✕ no se consiguió. | Violeta |
| **Comprado** | Ya está todo lo suyo (tildado, con la compra anotada o marcado "no se consiguió"): listo para preparar. Los tildes se pueden sacar desde acá. | Naranja |
| **Preparando** | Tienen armada su preparación. Se ven **todos** sus productos con ✓ (separado) o ⬜ y, en naranja, lo que falta y por qué ("Va 6 kg de 30 kg · no se consiguió", "Alcanza para 126 kg de 160 kg"). Cuando salen, se arrastran a En camino. | Amarillo |
| **En camino** | Salieron a entregar. Vacía, dice "Arrastrá acá desde Preparando lo que sale a entregar". | Verde |
| **Entregados** | Ya se entregaron. | Rosa |

- **Tarjeta:** franja de color con el nombre del cliente, el número y quién se encarga; etiquetas (tipo de cliente, "Urgente", "Llegó tarde"); lo que lleva como **checklist de productos** (§4; hasta 4 y "y N más" en Pedidos, En camino y Entregados; todos en Lista de compras, Comprado y Preparando, con desplazamiento dentro de la tarjeta solo si la lista es muy larga); ⏰ plazo (rojo vencido, amarillo pronto, verde listo), 💬 notas, ☑ avance y total estimado; y abajo **un solo botón**, el verde que la pasa al paso que sigue. La tarjeta **se acomoda al ancho de su columna**: en una columna angosta el nombre del producto ocupa todo el ancho (se corta entre palabras, nunca por la mitad), y la cantidad y la ✕ van en el renglón de abajo; donde la columna es ancha, la letra y las casillas crecen y aparece el dibujo del tipo de cliente. Una tarjeta sin productos lo dice y lleva a cargarlos.
- **Tildar la compra en la tarjeta** (Lista de compras y Comprado, `lista_compra.editar`): cada producto tiene una casilla ✓ ("ya se compró", sin anotar puesto ni precio) y una ✕ ("no se consiguió"); tocarlas de nuevo lo deja por comprar. El tilde es del producto en la lista del día: vale para todas las tarjetas que lo llevan. Una compra anotada con su precio no se destilda desde acá (se anula en Compras anotadas). Con todo lo suyo resuelto, la tarjeta pasa sola a Comprado.
- **Tildar lo separado en la tarjeta** (Preparando, `preparacion.registrar`): cada producto tiene su casilla ✓; al tildarla queda separado con lo pedido (o lo que alcanzó) y se puede destildar mientras no haya salido. Para anotar que falta algo y por qué está la pantalla de preparación.
- **El botón verde de cada tarjeta** la hace avanzar al paso que sigue, sin arrastrar: 🛒 Mandar a la lista de compras → ✓ Ya está todo comprado → 📦 Empezar a prepararlo → 🚚 Sale ahora → ✅ Ya se entregó. Es verde claro con letra grande y oscura, para leerlo de un vistazo, y su texto va centrado. El subtítulo de cada columna dice qué hay que hacer en ese paso.
- **Sin carteles de más:** lo que sale bien se ve en el tablero y no muestra ningún mensaje. Solo aparece un aviso arriba de las tarjetas cuando algo **no se pudo hacer** o hay que confirmar: dice por qué y qué hacer, con su botón.
- **Cerrar el día:** cuando todos los pedidos están en Entregados, al pie de esa columna aparece **✓ Está todo entregado: cerrar el día**; si algo lo impide, lo dice y lleva al cierre. Con el día cerrado, **abajo, fijo al pie de la pantalla**, queda el cartel "🔒 Día cerrado." con el botón **🔓 Reabrir el día** (`jornada.reabrir`), que lo reabre en un toque para corregir algo o volver atrás un pedido.
- **Arrastrar** (con el mouse, o manteniendo el dedo apretado un instante en el celular): la tarjeta se levanta inclinada y con sombra y la columna donde se puede soltar se marca. Cerca de un borde el tablero se corre solo: de costado en el celular, y hacia arriba o abajo cuando las columnas van en dos filas. Queda en su lugar nuevo al instante, mientras se guarda.

  | De → a | Qué hace |
  |---|---|
  | Pedidos → Lista de compras | La manda a la lista de compras. |
  | Lista de compras → Comprado | Tilda todo lo que le faltaba, **sin necesidad de tildar producto por producto** (por ejemplo, si se compró con la lista impresa). Lo marcado "no se consiguió" queda así. |
  | Pedidos → Comprado | Las dos cosas juntas. |
  | Comprado → Lista de compras | Saca los tildes puestos a mano en lo suyo. |
  | Lista de compras o Comprado → Pedidos | La saca de la lista. |
  | Pedidos, Lista de compras o Comprado → Preparando | Empieza a preparar **ese pedido** (los demás siguen donde están), sin preguntar. Si al cliente ya le salió lo de ese día, se le arma otra entrega. |
  | Preparando → En camino | **Sale a entregar** (RN-153): lo que falte tildar se confirma en el aviso ("Confirmar"), se marca preparado, se hace el remito y sale el reparto (el armado en el que estaba, o uno nuevo a cargo de quien la arrastra). |
  | En camino → Entregados | Queda **entregado completo** (todo lo preparado, sin diferencias). Si hubo diferencias o no lo recibieron, se anota desde Logística. |
  | Preparando → Comprado, Lista de compras o Pedidos | **Vuelve atrás** (RN-174), por si se pasó sin querer: la preparación armada se anula y el pedido queda donde estaba antes (en la lista de compras, o en Pedidos si ese día no tiene lista). |
  | En camino → Preparando | **No salió:** queda preparado y con su remito, fuera del reparto (si el reparto queda sin paradas, se anula solo). |
  | Entregados → En camino | **No se entregó:** deja de figurar entregado y de estar a cobrar; el comprobante que se le hizo solo se anula. No se puede si se entregó con diferencias, si ya se anotó un cobro de esa entrega o si está en un comprobante con otras: el aviso dice dónde resolverlo. |
  | Más de un paso hacia atrás de una vez (por ejemplo, de Entregados a Preparando) | No se mueve: se vuelve de a un paso, y el aviso lo explica. |
- **Elegir pedidos:** "☑ Elegir pedidos" pone casillas (en Pedidos, Lista de compras y Preparando); "🛒 Elegir todos los pedidos para la lista" marca de una vez los de la columna Pedidos (sin los vacíos, diciendo cuáles son). Con elegidos aparece una barra: **🛒 Mandar a la lista de compras**, **🚚 Salen ahora** (los de Preparando, juntos en un reparto), sacar de la lista, prioridad o quién se encarga.
- **Tarjeta abierta** (`?pedido=`): arriba, en qué columna está y **el día de entrega en letra grande**. **Lo que lleva** es el mismo checklist, más amplio, con la barra de avance: en Lista de compras y Comprado se tilda ✓ lo comprado o ✕ lo que no se consiguió; en Preparando, ✓ lo separado; todo queda guardado y se ve igual en la tarjeta cerrada. Mientras se compra, cada producto tiene además, a la izquierda, un botón amarillo con un **$**: despliega ahí mismo el panel de **precio y proveedor** de la lista de compras (P-50) para anotar a quién se le compró y a cuánto; ese precio queda guardado para ese proveedor (`compras.registrar`). Cuando el producto ya tiene su compra anotada, el botón **queda oscuro, con un ✓ verde**: de un vistazo se sabe a cuáles ya se les puso el precio. **✏️ Cambiar productos**, dónde se entrega (Cómo llegar con Google Maps y Waze), la nota, las notas entre las personas y el historial. Al costado, **el mismo botón verde** de la tarjeta (el paso que sigue) y, debajo, **Otras acciones** sin repetirlo: ↩ Volver a Pedidos (mientras se compra), **↩ volver un paso atrás** ("Todavía no se prepara", "No salió", "No se entregó", RN-174), ✏️ Anotar lo que falta (o un reemplazo) (en Preparando), 🧾 Ver o imprimir el remito (preparado o después) y ver el pedido completo; después, prioridad, quién se encarga y horario.
- Las columnas no tienen botones al pie (repetían el de cada tarjeta): arriba a la derecha de cada una hay un enlace chico a su pantalla ("Lista ›", "Abrir ›" la preparación, "Ver recorrido ›", "Remitos ›"). El único pie que queda es el de **Cerrar el día**. En el tablero, con el menú a la vista, "＋ Nuevo pedido" no se repite arriba: está en el menú.
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
| 📦 Preparación y remitos | todos los clientes están preparados y con su remito, y no queda ningún pedido sin empezar a preparar | 📦 Empezar a preparar o seguir · imprimir para separar |
| 🚚 Reparto y entrega | todo se entregó (y no queda ningún pedido sin preparar) | Logística · imprimir los remitos del día · confirmar entregas |
| 🔒 Cierre del día | el día está cerrado | Revisar y cerrar el día |

"Ahora toca" es el paso más avanzado sin terminar; lo que quedó a medias antes aparece como "Quedó pendiente de antes" dentro del paso actual, con su botón (por ejemplo, "2 pedidos todavía no se empezaron a preparar", con el botón al tablero, cuando ya se entregó otro). La regla está en `src/dominio/jornadas/pasos.ts`.

#### P-03 Mi cuenta

Nombre y color del avatar (con vista previa), cambio de contraseña y, para quien administra, **Administración**: Usuarios y Configuración del negocio.

---

### 5.2 Catálogo de productos

#### P-10 Productos

Tarjetas agrupadas por categoría (o "☰ Lista"): dibujo, en qué se cuenta, envase de compra, "Desde $X el kg" (o ⚠ "Sin precio de compra"), cuántos puestos lo venden y el preferido; la franja es naranja para las frutas y verde para las verduras (según el nombre). Solo se ven las categorías con productos (RN-154). Arriba, **＋ Nuevo producto**, **📥 Cargar desde una planilla** (P-28), **📊 Bajar a Excel** (P-13), Categorías y los precios. El buscador encuentra por nombre o por código.

- **Cambiar de categoría:** se arrastra la tarjeta a otra categoría (con el mouse, o en el celular manteniendo el dedo apretado un momento) o se toca **↔** en la tarjeta y se elige: las que ya se usan, las preelegidas (Duras, Blandas, De hoja, Aromáticas, Frágiles, Secos), otra escrita o **Ninguna**. Soltarla en **＋ Nueva categoría** abre la misma elección con las que todavía no se usan. La categoría que queda vacía desaparece.

**＋ Nuevo producto** (tres preguntas): qué es y su categoría (mientras no se elija, se propone una por el nombre: papa → Duras, frutilla → Frágiles; se puede elegir otra, una preelegida, "Ninguna" u "Otra…"); cómo se vende (kilo, unidad, atado, docena u "otra forma"; también se propone por el nombre hasta que se elige: huevos → maple, perejil → atado); en qué envase se compra ("Suelto", los sugeridos u "Otro envase…"). La ganancia con su cuenta de ejemplo, si se pide en partes, el código y las notas quedan en "Más opciones". No hace falta crear antes ninguna categoría.

- **Código:** se arma solo con el nombre ("Tomate redondo" → `TOMA-R`; si ya existe, `TOMA-R2`) y se muestra mientras se escribe. Sirve para buscar el producto (en Productos y en Nuevo pedido) y para las planillas de Excel (P-43).
- **Dibujo:** un emoji para reconocer el producto de un vistazo en el tablero, los pedidos y las listas. **No se elige: sale solo** del nombre (🍅 para "tomate", 🥔 para "papa", 🫛 para "chaucha"…) y, si el nombre no dice nada, del grupo de su categoría (🥦 verdura, 🍎 fruta, 📦 otro). La lista de palabras está en `src/dominio/catalogo/productos.ts` (RN-004b).

| Acción | Permiso | Reglas | Resultado |
|---|---|---|---|
| Nuevo producto | `productos.editar` | RN-001, RN-004 a RN-006, RN-154 | Crea el producto con su envase de unidad base y el de compra; la categoría elegida se crea o reaparece. |
| Mover a otra categoría | `productos.editar` | RN-154 | La de destino se crea o reaparece; la que queda vacía se oculta. |
| Desactivar / reactivar | `productos.editar` | RN-007, RN-154 | Advierte si tiene pedidos en curso; su categoría se oculta si queda vacía y reaparece al reactivarlo. |

#### P-11 Ficha de producto

**🏪 ¿Dónde se compra y a cuánto?**: una tarjeta por puesto que lo vende, con el precio del envase en grande, la frase "Te sale $X el kg", hace cuánto se cargó el precio y las marcas "★ El que preferís", "✓ El más barato" o "X % más caro que el más barato". A la vista, **¿Cambió el precio?** con "Guardar el precio nuevo"; plegado en "Más opciones de este puesto", cada botón con su explicación: "✓ Hoy sigue al mismo precio", "🚫 Hoy no tiene", "★ Es el que prefiero" y "Este puesto ya no lo vende". En cada puesto, **📈 Historial de precios** (desplegable) muestra los últimos cambios: fecha, precio, cuánto subió o bajó, cómo se cargó y quién. Después, **💰 ¿A cuánto se vende?**: la cuenta a la vista (cuesta $X en tal puesto + ganancia Y % = se vende a $Z, en verde; en rojo si la ganancia es negativa) y, debajo, "Ganancia de este producto (%)" con el botón **Guardar la ganancia** (vacío = la de su categoría o la general). Debajo, **"＋ Agregar puesto que lo vende"** (qué puesto, en qué envase, a cuánto), que ya viene abierto si todavía no lo vende ninguno; cuando ya hay alguno dice "＋ Agregar otro puesto que lo vende". El precio de cada puesto se actualiza solo cada vez que se anota una compra (también desde "Precio y puesto" de la lista de compras, P-50): queda escrito "(al anotar una compra)" y en su historial; y si se le compra a un puesto que todavía no figuraba, se agrega solo a esta lista y a la ficha de ese proveedor (RN-059). **📦 ¿En qué envases viene?**: envases como tarjetas ("1 cajón = 18 kg", para comprar / para vender). Además, precio de venta por cliente y notas. Los datos y el código se editan desde "✏️ Editar los datos del producto (o darlo de baja)" (plegado).

La categoría del producto se elige (en "✏️ Editar los datos del producto") entre las que se usan, las preelegidas y "Ninguna".

#### P-12 Categorías

Las categorías con productos, con su cantidad (abre Productos filtrado), y **Cambiar nombre u orden** (nombre, grupo fruta/verdura/otro, orden). El orden es el de las listas impresas: lo duro primero (va abajo en el cajón), lo frágil al final. Arriba, las preelegidas que todavía no se usan con para qué sirve cada una. No se crean categorías vacías ni se desactivan a mano: nacen con su primer producto y desaparecen solas (RN-154). La ganancia de cada categoría se edita en Precios de venta.

#### P-28 Cargar productos desde una planilla

Para cargar toda la lista de frutas y verduras de una vez (RN-155), en tres pasos:

1. **📄 Bajar la planilla (.xlsx):** hoja **Productos** con las columnas Producto · Categoría · Se vende por · Envase en que se compra · Cuánto trae el envase · Ganancia % · Código; Categoría, Se vende por y Envase tienen **listas para elegir** (las categorías preelegidas, las del negocio y **Ninguna**; kilo, unidad, atado… y Ninguna; cajón, bolsa, caja… y Ninguno), con una ayuda al pararse en la celda. Hoja **Cómo llenarla** con un ejemplo; las listas van en una hoja oculta.
2. **Completarla** en Excel, LibreOffice o Google Sheets: alcanza con los nombres uno debajo del otro (también sirve un .csv o una hoja sin títulos).
3. **Subirla y revisar:** cada fila como va a quedar: dibujo, nombre, **código que se arma solo** (o el de la planilla si está libre), categoría y cómo se vende (con "(propuesta)" si lo puso el sistema, y para cambiar ahí mismo), el envase y la ganancia. En naranja, solo **lo importante que falta**: cómo se vende (si quedó vacío o no se entiende, se propone y se avisa) o un envase sin lo que trae. Lo que ya existe o se repite en la planilla se muestra apagado y no se carga. **✓ Cargar N productos** los crea todos juntos (si algo falla, ninguno); después, el aviso de que les falta el precio de compra con el botón a Precios en el puesto.

#### P-13 Lista de productos en Excel

**📊 Bajar a Excel**, en Productos (`productos.ver`): todos los productos, uno por fila, en un .xlsx (o .csv con `&formato=csv`), con las mismas columnas que la planilla modelo de P-28 (Producto · Categoría · Se vende por · Envase en que se compra · Cuánto trae el envase · Ganancia % · Código) más si están activos. La ganancia sale solo para quien puede ver márgenes. Sirve para tener la lista en un archivo o imprimirla; los productos nuevos se cargan con P-28.

---

### 5.3 Clientes

#### P-15 Clientes

Tarjetas agrupadas por tipo (hospital, restaurante, comercio…) con dirección, "Sin ubicación en el mapa" si falta, horario, teléfono y el próximo pedido.

**＋ Nuevo cliente** (tres preguntas): cómo se llama y qué es; dónde se le entrega y a qué hora recibe (Cuando sea, Temprano, A la mañana, A la tarde u Otro horario); el teléfono. En "Más opciones": a quién se le completa primero si falta mercadería, cada cuánto se le hace el comprobante, reemplazos, remito firmado, orden de compra, contacto, cómo llegar y datos fiscales.

#### P-16 Ficha de cliente

Arriba, **🤝 Su cuenta (lo que debe y lo que pagó)** abre la cuenta del cliente (P-65b), deba o no. Datos (plegados en "✏️ Editar los datos del cliente"), **Dónde se le entrega** (cada lugar con Cómo llegar en Google Maps y Waze y su ubicación: desde la computadora, solo **🗺️ Marcar en el mapa** incrustado; en el celular, además "Estoy en el lugar" con el GPS, buscar la dirección o pegar un enlace de Google Maps), pedidos recientes, **Ganancia propia** y precios pactados (P-33), notas.

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

**🏦 Para transferirle** (alias, CBU y titular, cada uno con 📋 Copiar; si faltan, "Cargarlos →"), productos y precios (cada uno se cambia desde "✏️ Cambiar"; "Otro producto" para agregar), la cuenta (P-61), notas; los datos, plegados. Los precios de esta lista se actualizan solos con cada compra que se le anota, y un producto que se le compra por primera vez se agrega solo (RN-059).

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

Se elige el puesto y se escriben solo los precios que cambiaron (los vacíos siguen igual y quedan confirmados hoy); "No hay hoy" por producto.

#### P-27 Precios de hoy

En el menú (Registros → **💲 Precios de hoy**), porque los precios del mercado cambian todos los días. Un recuadro por producto, con el nombre grande, y adentro un renglón por puesto: "Hoy está a $X ($Y el kg) · cargado hace N días" (en rojo y con ⚠ si es viejo), la marca "el más barato" y, al lado, **Precio nuevo $** con su botón **Guardar**. Buscador por producto o puesto y el filtro "⚠ N precios viejos". Cada cambio queda en el historial (se ve en la ficha del producto, P-11) y vuelve a calcular solo el precio de venta.

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

Pensada para no tener que desplazarse: el **cliente** (1) y el **día** (2) van a la misma altura y **¿Qué lleva?** (3) queda a la vista; a la derecha, el pedido.

1. **¿Para quién es?** Buscador, **🕘 Clientes recientes** (los últimos a los que se les cargó un pedido, con la fecha) y **Clientes** (todos, en recuadros chicos dentro de una lista con scroll). Elegido, queda su nombre y dirección con "Cambiar"; si tiene varios lugares de entrega, se elige cuál.
2. **¿Para qué día?** Los próximos siete días en botones chicos (los cerrados no se pueden elegir) y "Otro día". Avisa si el cliente ya tiene un pedido para ese día, con el botón para cambiarlo.
3. **¿Qué lleva?** Buscador por nombre o código y **una sola lista** con scroll, en hasta tres columnas, sin separar por categorías y con **una única división**:
   - Arriba, **⭐ Productos frecuentes** del cliente (salen de sus pedidos marcados como frecuentes; si no marcó ninguno, de lo que más pide).
   - Debajo de una raya, **la lista completa** de productos, del que se pidió hace menos al que se pidió hace más.
   - Cada producto muestra su dibujo y su nombre grandes, del mismo tamaño, y **＋ Agregar**. Agregado, queda marcado con ✓ en el mismo lugar con su cantidad; ✕ lo saca.
   - **La cantidad** se cambia fácil: **−** y **+** grandes y, en el medio, el número en grande, que al tocarlo queda seleccionado para escribir otro encima.
   - **En qué se pide:** si el producto tiene **una sola medida**, va esa (kg, unidad, atado…) escrita al lado, sin nada que elegir. Solo si se lo cargó con **varias** (por kilo y además por cajón o bolsa) aparecen como botones para cambiar ("kg" · "Cajón 18 kg" · "Bolsa 20 kg").
   - **🕘 Historial de pedidos** del cliente: sus últimos 30 pedidos con lo que llevó cada uno; la **estrella** lo guarda como pedido frecuente y "＋ Usar" suma sus productos al pedido. **⭐ Pedidos frecuentes** muestra solo los marcados.
- **🧺 El pedido** (a la derecha, abajo en el celular): arriba, fijos mientras se recorre el panel, cuántos productos lleva y el botón **✓ Guardar el pedido**, que se ve **siempre en la primera pantalla** sin desplazarse (se guarda completo o nada, RN-018b); si falta algo, el aviso sale ahí mismo. Debajo, cada producto con su nombre, la misma cantidad con − y +, la medida (o sus botones), una nota opcional y 🗑; y, plegado en **⚙️ Urgencia, horario y nota (opcional)**, la prioridad, el horario y la nota del pedido (se abre solo si ya tienen algo). En una ventana chica o en el celular el botón de guardar va en una **barra fija abajo**, también siempre a la vista. El día elegido se lee en letra grande.
- Arriba a la derecha, **← Volver al tablero** en verde. Al guardar, la pantalla confirma el pedido con **← Volver al tablero** como botón principal (abre el tablero de ese día, sin ninguna tarjeta abierta) y, debajo, "＋ Cargar otro pedido" y "Cambiar algo de este pedido".

La misma pantalla sirve para **Cambiar productos** de un pedido (`/pedidos/[id]/cambiar`).

#### P-42 Detalle de pedido

Se abre desde la tarjeta ("Ver el pedido completo"). Va de más a menos: arriba, **← Volver al tablero** (el botón principal, verde; abre el tablero sin la tarjeta) y **✏️ Cambiar productos**; después tres recuadros con lo que importa —**qué día se entrega**, **en qué está** y el **total estimado**— y **🧺 Lo que lleva**, un renglón grande por producto con su dibujo y nombre, la cantidad, a cuánto se le cobra (y de dónde sale ese precio) y lo que suma. En cada producto, **✏️ Cambiar la cantidad** despliega solo la cantidad, la nota y su botón; sacar el producto del pedido y cobrarle otro precio a mano quedan plegados adentro. Lo demás —datos del pedido (día, lugar, notas), recalcular precios, duplicarlo y cancelarlo— va plegado en **⚙️ Más opciones**:

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
Un día cerrado también se reabre desde su tablero, con el botón **🔓 Reabrir el día** del cartel que queda al pie de la pantalla (un toque, sin escribir el motivo).

---

### 5.8 Lista de compras y compras

#### P-50 Lista de compras (celular, en el mercado)

Lo más importante de la pantalla es **la lista**: un renglón por producto, para leerla y tildar rápido.

- **Arriba:** el día en letra grande con su cartel (HOY, MAÑANA, YA PASÓ o MÁS ADELANTE) y la fila de días, cuántos pedidos y productos tiene, y los botones **🖨️ Imprimir** (DOC-01, la lista completa), **📊 Excel** y **🛒 Empezar la compra** (P-51).
- **Cada renglón:** el **dibujo y el nombre del producto en grande**, debajo cuánto es en envases ("≈ 3 × Bolsa 20 kg") o el puesto que conviene, a la derecha **cuánto hay que comprar** ("63 kg"), para **cuántos clientes** es y la casilla **✓** para tildarlo como comprado con un toque (se puede destildar; una compra anotada con precio, no). Lo ya comprado queda tachado y, debajo del nombre, dice a quién se le compró y a cuánto ("La Quinta · 4 × Bolsa 20 kg a $13.600 · a cuenta"); si falta una parte, lo dice.
- **💲 Precio y puesto** (a la derecha de cada renglón, separado del resto por una raya; `compras.registrar`): un desplegable para anotar **en el mismo lugar** a quién se le compró y a cuánto, y así hacer todo el proceso junto. Trae el **puesto** en una lista (primero los que ya lo venden, con su último precio; se puede elegir cualquier otro), la **cantidad** con − y +, el **precio por envase** (propone el último de ese puesto y dice cuánto sale por kilo), el **envase** como botones si hay más de uno, **Pagado** o **A cuenta** (según cómo se le paga a ese puesto) y el total. **✓ Guardar la compra** la anota igual que la compra producto por producto: tacha el renglón, suma la deuda si quedó a cuenta y **deja ese precio en la ficha del producto y en la del proveedor** (RN-059; si ese puesto todavía no lo vendía, lo agrega). Si falta el puesto o el precio, quedan en rojo. En un renglón ya comprado el botón dice "💲 Otra compra", para sumar lo que se compró en otro puesto.
- **En pesos:** cada renglón muestra lo que sale ese producto: lo anotado al comprarlo ("$249.750 · salió", en verde) o, si todavía no se compró, lo que se calcula con el último precio ("se calcula"). Arriba de la lista, tres totales: **Toda la lista sale** (lo ya comprado a lo que salió y lo demás calculado), **Ya comprado (anotado)** y **Falta comprar (se calcula)**. Se ven con `precios.ver_costos`.
- **Detalle de un renglón** (se despliega al tocarlo): para quién es y cuánto lleva cada cliente, dónde conviene comprarlo y a qué precio, los avisos (precio viejo, sin puesto, cambió un pedido), **🧾 Anotar la compra (puesto y precio)** y **✕ No lo conseguí** / "Volver a buscarlo".
- **Orden:** **Manual** (se arrastra cada renglón por su manija ⠿ para dejarlos como conviene recorrer el mercado; el orden queda guardado para ese día) o **Alfabético** (se recuerda en cada aparato). **Buscador** por nombre.
- **Avisos que aparecen solo si hacen falta:** "Cambió un pedido después de armar la lista" con **Actualizar la lista** (también con repartos ya en la calle; con el día cerrado, no) y "✓ Ya está todo comprado" con el botón para seguir a la preparación. Lo que sale bien no muestra carteles; lo que no se puede hacer explica por qué.
- **⚙️ Más opciones** (plegado): compras anotadas de ese día, anotar una compra de varias cosas en un puesto, bajar como CSV y volver a calcular la lista.

Sin lista para ese día, explica cómo se arma y ofrece armarla con todos los pedidos.

#### P-51 La compra, producto por producto

Para el celular, en el mercado. Se abre con **🛒 Empezar la compra** (arranca por el primer producto pendiente, en el orden de la lista) o desde el detalle de un renglón.

- Arriba: "‹ Lista" y "3 de 14 pendientes". **Estás comprando** + el nombre del producto bien grande y para quién es. Tres datos: **Pedido**, **Ya comprado** y **Falta**.
- **Proveedor (puesto)** (primero los que lo venden), **Forma de pago** (💵 Efectivo o 📒 A cuenta, con qué pasa en cada caso), **Presentación** (los envases del producto, como botones), **Cantidad** con − y + grandes y **Precio por envase**, con el último precio cargado y cuánto sale por kilo o unidad.
- Abajo, fijo: el **total de esta compra**, **Guardar** (vuelve a la lista) y **Guardar y seguir →** (pasa al próximo pendiente). También "☑ Ya lo compré (sin anotar precio)", "✕ No lo conseguí" y "Saltear por ahora".
- Si al producto le falta el envase de compra, lo dice y lleva a su ficha para cargarlo.

#### P-55 Anotar una compra suelta

Para lo que no está en la lista o para anotar varias cosas de un puesto de una vez: primero el puesto (con los que tienen algo de la lista arriba), después lo que la lista dice comprarle ahí; **＋ Agregar otro producto** para sumar más. **¿Cómo pagaste?** Pagué todo / Queda a cuenta / Pagué una parte. Si el precio varía mucho, pide confirmar (RN-058).

#### P-56 Compras anotadas y P-57 Detalle de compra

Lista con total, pagado, pendiente y estado de pago. El detalle muestra las líneas, qué pagos la cancelan, el vencimiento y, si falta pagar, **💵 Pagué en efectivo** / **🏦 Pagué por transferencia** (RN-097b).

| Acción | Permiso | Reglas | Resultado |
|---|---|---|---|
| Anular | `compras.anular` | RN-065, RN-101 | Motivo. Si era de contado, pregunta si el proveedor devolvió la plata. Recalcula la lista, el costo real y los precios. |
| Pagar esta compra | `pagos.registrar` | RN-097 | Abre P-62 con esta compra elegida. |

---

### 5.9 A pagar, a cobrar y gastos

Son las dos cuentas de la plata que todavía no se movió: **A pagar** es lo que se retiró de un proveedor y no se le pagó (queda como crédito); **A cobrar** es lo mismo del otro lado, lo que se le entregó a un cliente y no pagó. Las dos alimentan el dinero pendiente del Balance (§5.13).

Convención de 06 §10: pagado verde, pendiente ámbar, vencido rojo con reloj, saldo a favor con la leyenda "a favor"; siempre con texto.

- **P-60 A pagar:** una fila por proveedor con límite, lo que **le debemos**, disponible, % de uso, semáforo, vencido, próximo vencimiento y último pago; totales al pie; filtros "con deuda", "vencidos", "en rojo". Por fila: Pagar, Cuenta, Estado de cuenta (DOC-05). En todas las pantallas se dice quién le debe a quién: "Le debemos $X" o "Nos debe (a favor nuestro)".
- **P-61 Cuenta del proveedor:** la tarjeta **🏦 Para transferirle**; las compras sin pagar con su vencimiento y, en cada una, **💵 Pagué en efectivo** y **🏦 Pagué por transferencia**, que pagan lo que falta de esa compra con un toque (pide confirmar el importe, RN-097b); movimientos con saldo acumulado y pagos. Botones: **💵 Pagarle (elegís qué compras)** —en verde cuando le debemos—, **Ajuste o deuda anterior**, **Estado de cuenta**.
- **P-62 Pagarle a un proveedor:** arriba, en grande y de color, **quién le debe a quién** ("📤 Nosotros le debemos a La Quinta $278.550", o "🤝 La Quinta nos debe a nosotros" si hay plata a favor) y la tarjeta para transferir. **1. ¿Qué compras le pagás?**: cada compra sin pagar es un renglón con su tilde, su fecha y lo que se debe; vienen todas tildadas y se toca cada una para sumarla o sacarla ("☑ Todas", "☐ Ninguna"). **2. ¿Cuánto le pagás?**: el importe **ya viene cargado** con la suma de lo elegido y se recalcula solo al tildar; si se paga otra cantidad se escribe encima, y cada renglón dice si queda pagado o cuánto queda (menos de lo elegido se descuenta de lo más viejo; más queda a nuestro favor, RN-098). Después, cómo se pagó y, plegado en "Más datos", otro día, la referencia, el cheque y las notas. **✓ Registrar el pago** deja el pago aplicado justo a las compras elegidas (RN-097c), para que el registro diga qué pagó cada pago.
- **P-63 Ajuste o deuda anterior:** débito o crédito con motivo y compra relacionada (RN-102); la deuda anterior al sistema, en una o varias boletas.
- **P-64 Detalle de pago:** qué compras cancela; **Reimputar** y **Anular** con motivo (RN-100).

#### P-65 A cobrar y P-65b Cuenta del cliente

- **P-65 A cobrar** (`/cuentas-clientes`): arriba, **Falta cobrar en total** en grande y cuántos clientes lo deben (en verde cuando nadie debe nada). Después, una tarjeta por cliente que debe, del que más debe al que menos: cuánto, cuántas entregas tiene sin cobrar y desde qué día, una barra con su parte del total y tres botones: **💵 Pagó todo en efectivo**, **🏦 Pagó todo por transferencia** (un toque: anotan un cobro por todo lo que debe) y **Pagó una parte · ver su cuenta**. Los clientes con plata a favor se listan aparte. A la cuenta de un cliente que no debe nada (para ver lo que pagó o cargarle lo que debía de antes) se llega desde su ficha, en Clientes.
- **P-65b Cuenta del cliente** (`/cuentas-clientes/[id]`): tres números (se le entregó, pagó, **falta cobrarle**); **Anotar un cobro** con los dos botones de "pagó todo" y, plegado, **Pagó otro importe** (cuánto —obligatorio—, cómo pagó, qué día y una nota); **Lo que se le entregó**, una fila por entrega con su fecha en grande, el estado (Sin cobrar, Cobrada en parte con lo que falta, ✓ Cobrada), el importe y, si falta cobrarla, **💵 La cobré en efectivo** / **🏦 Por transferencia** para cobrar justo esa; **Lo que pagó**, cada cobro con su número (COB-…), cómo pagó y quién lo anotó, y **Anular este cobro** con motivo; y, plegado, **¿Ya debía plata antes de empezar a usar el sistema?** para cargar esa deuda anterior, que queda como lo más viejo de su cuenta.

| Acción | Permiso | Reglas | Resultado |
|---|---|---|---|
| Anotar un cobro (todo, una parte o una entrega) | `cobranzas.registrar` | RN-164 a RN-166 | Cancela lo más viejo que debe (o esa entrega primero); lo que sobra queda a favor. Un segundo toque seguido no cobra dos veces. |
| Anular un cobro | `cobranzas.anular` | RN-167 | Con motivo; lo que cancelaba vuelve a quedar por cobrar. |
| Cargar la deuda anterior al sistema | `cobranzas.registrar` | RN-168 | Se audita. |

#### P-66 Gastos e ingresos

Lo que se gasta o entra **por fuera de la mercadería** (nafta, peajes, arreglos, otros ingresos), para que el Balance lo tenga en cuenta.

- **＋ Anotar un gasto o un ingreso:** se toca el **rubro** (recuadros grandes con su dibujo: ⛽ Nafta, 🛣️ Peajes y estacionamiento, 🔧 Arreglos del vehículo, 📦 Bolsas y envases, 👷 Ayudantes y jornales, 🍽️ Comidas y viáticos, ☕ Café, 🧾 Impuestos y servicios, 💸 Otros gastos; y como ingresos ♻️ Venta de cajones y envases y 💵 Otros ingresos) y se abre ahí mismo su formulario: **¿Cuánto fue?** (obligatorio), la **cantidad** si el rubro se cuenta en algo ("¿Cuántos litros?"), el día, un detalle y con qué se pagó (Efectivo, Transferencia, Tarjeta, Otro). **✓ Guardar el gasto** (o el ingreso).
- **Las fechas:** Hoy, Últimos 7 días, Este mes (lo que abre), El mes pasado, Este año; el rango elegido se lee en letra grande. Tres tarjetas: **Se gastó**, **Entró por otras cosas** y la diferencia. **En qué se gastó** y **Por qué entró plata**, en barras por rubro, con cuántas veces y la cantidad sumada ("3 veces · 120 litros"). **Lo anotado**, del más nuevo al más viejo, con su rubro, día, medio, cantidad, detalle y quién lo anotó; cada uno se **anula** con motivo (queda tachado). "Ver en el Balance" abre el balance de esas fechas.
- **⚙️ Rubros** (plegado): se crean **libremente** con un dibujo (de una fila de emojis o cualquier otro que se escriba), un título, si es un gasto o un ingreso y, si se quiere, en qué se cuenta (litros, km, horas). Cada rubro se cambia o se da de baja (deja de ofrecerse; lo ya anotado queda). La primera vez se crean solos los predefinidos.

| Acción | Permiso | Reglas | Resultado |
|---|---|---|---|
| Anotar un gasto o un ingreso | `pagos.registrar` | RN-169 | Queda en la actividad y entra en el dinero real del Balance. |
| Anular lo anotado | `pagos.anular` | RN-169 | Con motivo; no se borra ni se edita. |
| Crear, cambiar o dar de baja un rubro | `pagos.registrar` | RN-170 | No puede haber dos rubros del mismo tipo con el mismo nombre. |

---

### 5.10 Preparación

#### P-70 Preparación del día

Lo que hay que separar para cada cliente, con **los tres pasos siempre a la vista** (el que toca, resaltado): **1 📦 Separar** (tildar cada producto), **2 🧾 Marcar preparado** (el remito se hace solo) y **3 🚚 Sale** (pasa a En camino). Antes de empezar, una tarjeta explica qué hace **📦 Empezar a preparar**: arma una tarjeta por cliente y punto de entrega con lo que pidió (RN-111); si algo de lo comprado no alcanza para todos, se reparte empezando por los urgentes y la prioridad de cada cliente (RN-115), y queda anotado qué falta. Si llegaron pedidos después, un aviso con **Sumar los pedidos nuevos**.

- **Resumen:** 📦 por separar · ✓ listos para salir · 🚚 en camino o entregados, con la barra de avance.
- **👤 Por cliente,** en tres grupos: **1. Por separar** (tarjeta con **todos** sus productos en el mismo **checklist** del tablero, §4: se tilda ✓ cada producto ahí mismo, sin entrar a otra pantalla, y lo tildado se ve también en la tarjeta del tablero; en naranja, lo que falta y por qué; abajo **✏️ Anotar lo que falta (o un reemplazo)**, que abre P-71, y, con todo tildado, **🧾 Marcar como preparado** en un toque), **2. Listos para salir** (con su remito: **🚚 Sale ahora**, **🧾 Remito** y **✏️ Ver o corregir**; arriba, **🚚 Salen todos**; si falta un precio para el remito, el aviso con "Ver qué falta") y **3. En camino y entregados**.
- **🥬 Por producto:** comprado, pedido, separado y si sobra o falta; cada producto abre P-72.
- Arriba: **🖨️ Imprimir para separar** (DOC-07), **🧾 Remitos del día** y **Logística** (el recorrido).

#### P-71 Preparar el pedido de un cliente

Arriba, los tres pasos con el que toca. Mientras se separa: "Separados N de M productos" con su barra y **✓ Está todo en los que faltan**; ya preparado, una tarjeta verde con **🧾 Ver o imprimir el remito**, **🚚 Sale ahora (pasa a En camino)** y los bultos; después de salir, "Ya salió" con el remito. Si falta algo, **Lo que falta (para avisarle al cliente)**. Cada producto es una tarjeta:

- **Separar 36 kg** (y el envase pedido), el estado (⬜ Por separar, ✓ la cantidad, ⚠ Faltó) y el aviso en naranja ("Alcanza para 30 kg de 36 kg", "Va 30 kg de 36 kg · no se consiguió").
- **✓ Está todo (36 kg)** en un toque; si no alcanzó, **✓ Separé 30 kg (lo que hay)**, o **✗ No va (no hay)**.
- **⚠ Falta algo o pesa distinto** (plegado): ¿cuánto se manda? y **si falta, ¿por qué?** con botones: No se consiguió · No alcanzó lo comprado · Estaba en mal estado · Error al preparar · El cliente lo sacó · Otro motivo. Dentro, **🔁 Mandar otro producto en su lugar** (RN-117).
- Abajo, fijo mientras se separa: en qué paso está ("Paso 1: faltan separar 2 productos" / "Paso 2: todo separado"), ¿cuántos bultos? y **🧾 Marcar como preparado**: el remito sin precios y la lista con precios se hacen solos.

| Acción | Permiso | Reglas | Resultado |
|---|---|---|---|
| Está todo / cuánto se manda | `preparacion.registrar` | RN-113, RN-114 | Peso real con tolerancia; si falta de verdad, el motivo es obligatorio; más de lo comprado pide confirmar. La entrega y sus pedidos pasan a preparándose. |
| Mandar otro producto | `preparacion.registrar` | RN-117 | Si el cliente no acepta reemplazos, pide quién lo autorizó. |
| Marcar como preparado | `preparacion.registrar` | RN-118, RN-120, RN-121 | Emite DOC-02 y DOC-03 con los precios congelados; una línea sin precio deja los remitos pendientes; con margen negativo, pide confirmar. |
| 🚚 Sale ahora | `repartos.gestionar` | RN-122, RN-123, RN-153 | Pasa a En camino: hace el remito si falta y sale el reparto (el armado en el que estaba o uno nuevo). |

#### P-72 Preparar por producto

Un producto para todos los clientes: cuánto le toca a cada uno, con la misma carga y los mismos motivos.

---

### 5.11 Repartos y entregas

#### P-78b Logística (el recorrido del día)

En el menú figura como **Logística**; desde el tablero se llega con **Ver recorrido ›**, en la columna En camino. Es **una sola lista** con todo lo que hace falta para salir a entregar (pedido del usuario, 08/10/2026):

- **Recorrido:** los destinos en el orden en que se va a ir, numerados. Cada entrega que está en camino tiene el cliente, la dirección, el horario en que recibe, **Ir ▶** (Google Maps), **Waze**, 📞 y **✅ Entregar** (abre la confirmación y vuelve al recorrido). Entre un destino y el siguiente, los kilómetros y minutos aproximados. Lo ya entregado queda arriba, tachado.
- **Salís de:** tres botones en el primer renglón: 🏬 Depósito, 📱 Donde estoy (el GPS) o ✍️ Otra dirección (se escribe y se busca, o se pega un enlace de Google Maps).
- **Arrastrar para ordenar:** cada destino se agarra de ⠿ y se lleva a su lugar (con el dedo en el celular; con las flechas ↑ ↓ del teclado en la computadora). El orden **queda guardado al soltar**, sin botón de guardar (RN-176).
- **＋ Agregar destino:** para sumar un lugar que no es una entrega (el banco, un taller, un proveedor). Arriba, los **⭐ favoritos**: se toca uno y se suma. Para otro lugar: el **nombre** que se le quiera poner, la dirección con **🔎 Buscar** (o un enlace de Google Maps pegado), **🗺️ Marcar en el mapa** o, en el celular, **📱 Estoy acá**; y la casilla **⭐ Guardarlo como favorito**. Un destino sumado tiene **✓ Listo** (ya pasé), **✕ Quitar** y **⭐** para guardarlo como favorito después. Desde el mismo panel, "✏️ Cambiar nombres o quitar" renombra o saca favoritos (RN-177).
- **🧮 Calcular el mejor recorrido** (al final de la lista): acomoda los destinos al instante en el orden de menos kilómetros (exacto hasta 8; con más, el vecino más cercano mejorado) y lo deja guardado; después se puede seguir cambiando a mano. Opciones al lado: "Dejar primero el de arriba" y "Volver al depósito". Los destinos sin ubicación marcada quedan al final y el aviso los nombra.
- **Total aprox.** en kilómetros y tiempo de manejo, y **Abrir todo el viaje en Google Maps**.
- **📍 Falta marcar la ubicación de N lugares** (plegado, en amarillo): nombra cada cliente y lugar de entrega del día al que le falta y se marca ahí mismo (el mapa; en el celular, también GPS, dirección o enlace).
- **📦 Todavía no salieron N entregas** (plegado; se abre solo si no hay nada en camino): los repartos armados con su estado (preparándose, ✓ listo para salir, 🚚 en camino), **🚚 Salir** y **Abrir el reparto**; y las entregas sin reparto, en la misma lista ordenable, con **Armar el reparto con este orden**.
- **🏬 De dónde salen los repartos** (plegado; depósito o mercado): se marca una vez. **En la computadora, solo en el mapa incrustado** (se lleva el mapa a una calle o barrio y se hace clic en el lugar; el punto se puede arrastrar). En el celular, además: "Estoy en el lugar" (GPS), escribiendo la dirección y eligiendo el resultado, o pegando un enlace de Google Maps o las coordenadas. La dirección que se buscó queda guardada.
- La búsqueda de direcciones usa OpenStreetMap (Nominatim) desde el servidor, solo al tocar "Buscar" o al abrir el mapa para marcar (lo lleva a la dirección escrita); los mapas incrustados usan los mapas de OpenStreetMap.

| Acción | Permiso | Reglas | Resultado |
|---|---|---|---|
| Ordenar el recorrido (arrastrando o calculando) | `repartos.gestionar` | RN-176 | Queda guardado al instante; la hoja de ruta de cada reparto en camino sigue ese orden. |
| Agregar, marcar como hecho o quitar un destino | `repartos.gestionar` | RN-177 | Con el día abierto. Un destino nuevo pide nombre y dirección o ubicación. |
| Guardar, renombrar o quitar un favorito | `repartos.gestionar` | RN-177 | Dos favoritos no llevan el mismo nombre. |

#### P-76 Reparto

Se abre desde "Todavía no salieron" de Logística. Arriba, una tarjeta dice en qué está y qué hacer: **🧾 Hacer los remitos que faltan** si falta alguno, **🚚 Salir: pasan a En camino** (exige todas las paradas preparadas y con su remito, RN-122; si no se eligió quién lo hace, lo hace quien toca Salir) y, ya en camino, **Regresé**. Después: quién lo hace, vehículo y hora; y **una sola tarjeta "Recorrido"** con sus paradas en orden (la misma lista de Logística: se arrastran, **🧮 Calcular el mejor recorrido**, kilómetros y tiempo, Ir ▶, Waze, 📞, **✅ Entregar**, y en cada parada sus bultos, su estado, el enlace a la entrega y su 🧾 remito, o "sin remito" en rojo). Sin salir todavía, cada parada tiene **✕ Quitar** y está "Ordenar por horario". Abajo, las entregas sin reparto para agregar; **🖨️ Hoja de ruta** (DOC-04) y **Anular** (sin entregas confirmadas, con motivo).

#### P-77 Mi reparto y P-78 Confirmar entrega (celular)

Solo los repartos de la persona (RN-131). Por parada: llamar, Ir, Waze, **Entregar**. Al confirmar: **Entregado completo** (pide quién recibió), **Con diferencias** (por producto: cuánto se entregó, motivo y detalle) o **No recibió**. **Quién recibió se elige con un toque:** arriba del nombre aparecen, como botones, las personas que recibieron las últimas entregas de ese cliente (nombre y cargo); si es otra, se escribe y queda para la próxima (RN-178). Nunca muestra importes. Si hubo diferencias, sube la versión y se rehacen los remitos; a los clientes que facturan por entrega se les hace el comprobante (RN-143). **Regresé** cierra el reparto.

#### P-81 Remitos del día

En el menú (etapa "Remitos") y desde la preparación, el tablero y el paso a paso (pedido del usuario, 06/10/2026: darles importancia y poder verlos o imprimirlos fácil). Explica qué es el remito (la lista de entrega que firma el cliente, sin precios) y cuándo se hace. Arriba, cuántos están hechos y **🖨️ Imprimir todos** (abre la impresión sola), **🖨️ Todos con 2 copias (cliente y negocio)**, **👁 Ver todos** y, con permiso, **💲 Listas con precios** (DOC-03). Después, una tarjeta por cliente en el orden del reparto: estado (sin preparar, preparándose, listo para salir, en camino, entregado), cuándo se hizo el remito y **👁 Ver**, **🖨️ Imprimir**, **🖨️ 2 copias** y **💲 Con precios**; si todavía no está, por qué ("se hace solo al marcar preparado", "suele faltar un precio", "el pedido cambió: hay que rehacerlo") con el botón para arreglarlo. Un repartidor ve solo los de sus repartos. La impresión de todos juntos es `/entregas/remitos/imprimir` (una o dos copias, o las listas con precios); cada remito suelto, `/entregas/[id]/documento/lista-entrega` (con `?imprimir=1` abre el diálogo solo, `?copias=2` dos copias).

#### P-79 Entregas y P-80 Detalle de entrega

Entregas del día con su estado, reparto, diferencias, facturación y el remito (🧾 Ver). El detalle muestra arriba **🧾 Remito y lista con precios** (👁 Ver el remito, 🖨️ Imprimir el remito, 💲 Lista con precios, o **🧾 Hacer el remito** si falta), las líneas (pedida, propuesta, preparada, entregada, motivos y, con permisos, precio congelado, importe y margen), las versiones de los documentos y quién recibió.

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

- **📁 El balance de cada mes, en Excel** (al final de P-91): una lista con un renglón por mes —nombre del mes, de qué fecha a qué fecha, lo vendido, lo comprado y la ganancia—, del mes en curso hacia atrás, con **Ver en pantalla** y **⬇ Bajar el Excel** (`/balance/planilla?mes=aaaa-mm`). Cada archivo trae las hojas Resumen (con el dinero real, el pendiente y el total, y las compras y ventas partidas en saldado y pendiente), Gráficos (barras a todo lo ancho: vendido y compras, ganancia, lo que entró y lo que salió, y lo que queda a pagar, una barra por día), Por día (con "Entró", "Salió" y "A pagar"), Clientes y Productos (estas dos con su gráfico), **A cobrar** (por cliente), **A pagar** (por proveedor) y **Gastos e ingresos** (por rubro). Cada mes nuevo aparece solo; se listan los últimos 24 meses y los más viejos salen solos de la lista. Los archivos no se guardan: se arman al bajarlos con lo registrado.
- **Gráficos a todo el ancho:** la pantalla del balance usa todo el ancho disponible, con un gráfico por renglón; las barras se reparten ese ancho y, cuando son anchas, cada una lleva su valor escrito.
- **P-91 Balance:** se elige qué fechas ver con botones: **Hoy**, **Ayer**, Últimos 7 días, Este mes, Últimos 30 días (lo que abre por defecto) y Este año; "📅 Elegir otras fechas" (plegado) permite cualquier rango y si cada barra es un día, una semana o un mes. Arriba, una frase que lo resume ("El martes 06/10 se vendieron $X en N entregas, las compras fueron de $Y y quedaron de ganancia $Z"); cinco tarjetas con dibujo —**Se vendió**, **Compras** (con "Pagado $X · quedó a pagar $Y"), **Quedó de ganancia** ("N de cada 100 pesos vendidos"), **A cobrar** (entregado y sin cobrar, a hoy; abre P-65) y **A pagar** (retirado y sin pagar, a hoy; abre P-60)—, las tres primeras con ▲/▼ contra los días anteriores; en una línea chica, lo pagado a proveedores y lo entregado sin facturar.
- **💵 El dinero: el real, el pendiente y el total** (RN-171; `app/(app)/balance/dinero.tsx`), en tres tarjetas:
  - **Dinero real · en estas fechas:** la plata que ya se movió. **Entró** (lo cobrado a clientes + otros ingresos) y **Salió** (lo pagado a proveedores + gastos), cada uno con su barra llena, y el resultado en grande: "Quedó en mano" (verde) o "Salió más de lo que entró" (rojo).
  - **Dinero pendiente · a hoy:** la plata que todavía no se movió pero ya se debe. **A cobrar** (entregado a los clientes y sin cobrar) y **A pagar** (retirado de los proveedores y sin pagar), cada uno con su barra **rayada** y el enlace a su pantalla, y el resultado: "Pendiente a favor" o "Se debe más de lo que falta cobrar".
  - **Balance total:** real + pendiente, con la cuenta escrita: lo que quedaría si hoy se cobrara todo lo que falta y se pagara todo lo que se debe.
  - Lo que ya se movió va en **color lleno** y lo pendiente en **rayado**, para no distinguirlos solo por el color; azul es lo que entra (o va a entrar) y naranja lo que sale (o va a salir).
- **🔁 Compras y ventas: lo saldado y lo pendiente** (RN-172), dos tarjetas que se leen igual, una al lado de la otra:
  - **Compras · en estas fechas:** "Se retiró de los proveedores $X" y una barra partida en dos: **Pagado** (lleno) y **Retirado sin pagar (a pagar)** (rayado), con sus importes y porcentajes; debajo, el detalle por proveedor (retirado, pagado, a pagar).
  - **Ventas · en estas fechas:** "Se entregó a los clientes $X" y la misma barra: **Cobrado** (lleno) y **Entregado sin cobrar (a cobrar)** (rayado); debajo, por cliente.
- **A cobrar, por cliente** y **A pagar, por proveedor** (a hoy): cada uno con su total y una barra rayada por nombre, del que más al que menos ("debe desde el jueves 08/10"), con "Ver y anotar cobros →" / "Ver y anotar pagos →".
- **💸 Gastos e ingresos generales · en estas fechas:** en qué se gastó y por qué entró plata, por rubro (con su dibujo, cuántas veces y la cantidad), y "Anotar un gasto o un ingreso →" (P-66).
- **¿Cuánto queda de lo que se vende?** (de cada $100 vendidos, cuánto pagó la mercadería y cuánto quedó, en una barra). Los gráficos son **todos de barras** (`GraficoBarras` en `src/ui/graficos.tsx`), cada uno con una explicación de una línea y su tabla plegada ("Ver los números en una tabla"): **Lo que se vendió y las compras** (dos barras por período, azul y naranja, con leyenda), **Lo que quedó de ganancia** (hacia abajo y en rojo si se perdió), **La plata que entró y la que salió** (el dinero real de cada período) y **Lo que queda a pagar a los proveedores** (al terminar cada período); con una sola serie, el valor va escrito sobre la barra más alta y sobre la última, y el resto se lee al pasar el dedo o el mouse. Abajo, **A quién se le vendió más** (con medallas) y **Qué se vendió más** (con el dibujo de cada producto), en barras horizontales. Cada importe respeta los permisos: el dinero y lo pendiente se ven con los de precios de venta, costos, crédito de proveedores, cobranzas y pagos.
- **Balance del día** (`/balance?dia=aaaa-mm-dd`, botones Hoy y Ayer, o "💰 Balance del día" en el tablero): el mismo balance para un solo día —título "Balance de hoy, martes 06/10"—, con "← Día anterior", "Día siguiente →" y "Ver otro día". Muestra lo vendido, lo comprado y lo ganado ese día comparado con el día anterior, las barras de **ese día junto a los seis anteriores**, y **las ventas del día**: a quién se le vendió y qué se vendió. "Movimientos del día" abre el detalle. Si todavía no se entregó nada, lo dice.
- **P-93 Movimientos:** ventas, compras, pagos y ajustes del período, del más nuevo al más viejo, con totales por tipo; cada fila lleva a su documento.
- **P-90 Reportes:** ventas y margen por cliente y por producto, compras por proveedor y por producto, días cerrados, deuda por antigüedad, faltantes y diferencias.
- **P-94 Actividad y notas:** lo que hizo cada persona en palabras ("María mandó a la lista de compras el pedido PED-000012") y las notas, por día; una tarjeta por persona arriba; filtros por persona y "solo notas".
- **🔔 Campanita de avisos** (en todas las pantallas, RN-160 a RN-163): el número rojo cuenta lo que hicieron **las otras personas** desde la última vez que se abrió, más las notas sin leer. Al tocarla se abre el panel con las novedades, de la más nueva a la más vieja (quién, qué y cuándo, cada una lleva a lo que nombra); lo dirigido a uno —una nota "para vos", un pedido que te pasaron— va con la etiqueta **👉 Para vos**. Varios tildes seguidos de la lista de compras se muestran como un solo aviso ("marcó 5 productos en la lista de compras"). Abrir el panel deja vista la actividad; las notas siguen contando hasta que se leen ("Marcar las notas como leídas"). Abajo, **✍️ Pedirle o avisarle algo a…** deja un aviso suelto para otra persona, y "Avisarme también cuando tengo la pantalla tapada" pide permiso para las notificaciones del navegador (en la computadora).
- **Mientras el sistema está abierto**, la campanita pregunta cada 30 segundos: lo nuevo suma en su número y, en las pantallas del día (tablero, lista de compras, preparación, Logística, actividad), los datos se vuelven a dibujar solos. No hay carteles emergentes dentro de la app. Arriba del panel, **⚠ Productos para revisar**: los que no tienen precio de compra o se venden por debajo de lo que cuestan (ganancia negativa, o un precio pactado menor al costo), cada uno con qué le pasa y el enlace a su ficha; si no hay novedades pero sí productos para revisar, la campanita muestra un "!".
- **Qué genera un aviso:** todo lo que se carga o se cambia queda en la actividad en el mismo momento: pedidos (cargar, cambiar productos o datos, cancelar, prioridad, plazo, responsable, importar de Excel), lista de compras (armar, sacar, tildar, no conseguido), compras y pagos (y sus anulaciones y ajustes), preparación, repartos y entregas, comprobantes, cierre del día, clientes, proveedores y productos (alta, cambios, baja, lugares de entrega, precios de compra y ganancias), categorías, configuración y accesos de usuarios.

---

### 5.14 Configuración y usuarios

#### P-95 Configuración del negocio

`configuracion.ver` para ver, `configuracion.editar` para guardar; cada cambio se audita. Si cambian el redondeo o el margen mínimo, se recalculan los pedidos pendientes.

| Grupo | Campos |
|---|---|
| Datos del negocio | Nombre, CUIT, dirección, teléfono y correo (salen en los documentos). |
| Precios | Cómo se redondea el precio de venta, margen mínimo para avisar, variación de precio de compra que pide confirmar, días para marcar un precio como viejo. La ganancia general se cambia en Precios de venta. |
| A pagar a los proveedores | Colores del semáforo (amarillo < rojo), días de aviso antes de un vencimiento. |
| Pedidos y preparación | Hora de corte de pedidos (después, un pedido para el día siguiente llega tarde), diferencia de peso aceptada al preparar. |

#### P-96 Usuarios

Pedidos de acceso con **Habilitar** / **Rechazar**; las personas con acceso, con **Darle una clave provisoria** y **Quitarle el acceso** (02 §10). Sin roles a la vista: todos son ADMIN.

---

## 6. Acceso por rol

Hoy todos los usuarios son ADMIN y ven todo. Si algún día entra alguien con un rol limitado, cada pantalla y cada entrada del menú dependen del permiso de la tabla de §3 (02 §5): por ejemplo, un REPARTIDOR ve solo "Día de trabajo" con Mi reparto y los remitos de sus repartos, y nunca pantallas con precios.

---

## 7. Mensajes

- Todo mensaje nombra **qué** (el pedido, el cliente o el producto) y dice **cómo seguir** ("Restaurante La Esquina (PED-000009): este pedido todavía no tiene productos: agregale al menos uno.").
- Cuando hay una pantalla donde se arregla, trae **el botón** para ir ("Agregar productos →", "Cargar la dirección →"): el error de negocio lo manda en `detalle.enlace`.
- Los códigos de reglas y referencias al plan ("(RN-018)") **no se muestran** (`textoParaPersona`).
- Si falla algo del sistema, no aparece el error técnico: "No se pudo completar por un problema del sistema (no es un error tuyo). Probá de nuevo en un momento; si vuelve a pasar, avisale a Facundo qué estabas haciendo." Si falla una pantalla entera, una página con **Probar de nuevo** e **Ir al tablero**.
- Mejor que avisar es no dejar que pase: no se puede guardar un pedido sin productos, el tablero no manda a la lista una tarjeta vacía (la abre para cargarle los productos).
- Lo obligatorio que quedó vacío se marca **en rojo** en el mismo casillero, antes de mandar nada (§4).
- Un importe o una cantidad obligatorios que llegan vacíos al servidor avisan qué falta ("Escribí cuánto se pagó."); nunca terminan en "problema del sistema".

| Código | Mensaje (ejemplo) | Qué se ofrece |
|---|---|---|
| `NO_AUTENTICADO` | "Tu sesión terminó. Ingresá de nuevo." | Ir al ingreso. |
| `SIN_PERMISO` | "No tenés permiso para anular compras." | — |
| `VALIDACION` | "Lechuga criolla se pide en unidades enteras: poné una cantidad sin coma." | Corregir el campo. |
| `TRANSICION_INVALIDA` | "Ese pedido ya se está preparando: no se puede cancelar." | La alternativa (anotar la diferencia en la entrega). |
| `JORNADA_CERRADA` | "Ese día ya está cerrado: para seguir con sus pedidos, primero reabrilo desde “Cierre del día”." | Reabrir. |
| `LIMITE_CREDITO_EXCEDIDO` | Límite, deuda, compra, deuda después y exceso (06 §9.3). | Pagar el exceso, pagar todo o seguir con motivo (con permiso). |
| `PRECIO_SIN_COSTO` | "No se puede hacer el remito de Hospital San Martín: falta el precio de Kale. Cargale el precio de compra y volvé a mandarlo." | "Poner el precio de Kale →" (su ficha). |

---

## 8. Metas de uso

| Tarea | Meta | Pantalla |
|---|---|---|
| Anotar algo que se compró de la lista | 3 toques y el precio | P-50 |
| Cargar un pedido de 10 productos | Menos de 2 minutos | P-41 |
| Separar un producto que está completo | 1 toque ("✓ Está todo") | P-71 |
| Mandar un pedido preparado a En camino | 1 arrastre o 1 toque ("🚚 Sale ahora") | P-02, P-70, P-71 |
| Imprimir todos los remitos del día | 2 toques desde el menú (Remitos → Imprimir todos) | P-81 |
| Cargar la lista de productos del negocio | Bajar la planilla, escribir los nombres, subirla y "Cargar" | P-28 |
| Confirmar una entrega sin diferencias | 3 toques y el nombre de quien recibe | P-78 |
| Encontrar lo que se le debe a un proveedor | 2 toques desde el menú | P-60 → P-61 |
| Pagarle todo a un proveedor | Abrir "Pagarle" y tocar "Registrar el pago" (el importe ya viene cargado) | P-61 → P-62 |
| Volver atrás una tarjeta que se pasó sin querer | Arrastrarla a la columna anterior, o 1 toque en la tarjeta abierta | P-02 |
| Guardar un pedido nuevo | El botón está siempre a la vista, sin desplazarse | P-41 |
| Anotar que un cliente pagó todo | 2 toques desde el menú (A cobrar → "Pagó todo en efectivo") | P-65 |
| Anotar un gasto de nafta | Tocar el rubro, escribir el importe y Guardar | P-66 |
| Anotar el precio y el puesto de algo de la lista | En el mismo renglón: "💲 Precio y puesto", precio y Guardar | P-50 |
| Tildar lo separado de un cliente | 1 toque por producto, en la tarjeta o en Preparación | P-02, P-70 |
| Que preparación y reparto no muestren precios | Nunca | P-70 a P-78 (prueba automática, 02 §8) |
