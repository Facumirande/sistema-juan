# 10 · Plan de implementación

> **Propósito:** el orden en que se construyó el sistema, qué quedó hecho, cómo se prueba, cómo se cargan los datos reales y qué falta para empezar a usarlo en el negocio. Es un sistema de uso interno (lo desarrolla el hermano del dueño con Claude): no hay equipo, fechas, costos ni aprobaciones formales.

## Contenido

1. [Estado](#1-estado)
2. [Iteraciones construidas](#2-iteraciones-construidas)
3. [Iteración 8: puesta en marcha](#3-iteración-8-puesta-en-marcha)
4. [Pruebas](#4-pruebas)
5. [Carga de los datos reales](#5-carga-de-los-datos-reales)
6. [Decisiones tomadas](#6-decisiones-tomadas)
7. [Pendientes e ideas](#7-pendientes-e-ideas)

---

## 1. Estado

| Iteración | Contenido | Estado |
|---|---|---|
| I1 | Fundaciones y seguridad | Hecha |
| I2 | Catálogo, clientes, proveedores y precios de compra | Hecha |
| I3 | Precios de venta, pedidos y jornada | Hecha |
| I4 | Lista de compras y compras | Hecha |
| I5 | Cuentas con proveedores | Hecha |
| I6 | Preparación, repartos, entregas y documentos | Hecha |
| I7 | Facturación interna, cierre del día y reportes | Hecha |
| — | Interfaz para el uso diario: tablero de pedidos, paso a paso, carga visual de pedidos, lista de compras con "✓ Lo compré", preparación por cliente, "Sale ahora", etapas del día en el menú, remitos del día, planilla de productos | Hecha |
| — | Afinado del 06 y 07/10: código y dibujo automáticos de cada producto, productos y pedidos en Excel (subir y bajar), tablero de colores vivos con arrastre nuevo y tildes de compra en la tarjeta, lista de compras con cartel del día, "para quién" y descarga a Excel, balance con barras y balance del día, campanita de avisos | Hecha |
| — | Segundo afinado del 07/10: un solo checklist de productos (tarjeta cerrada, tarjeta abierta y preparación), precio y puesto en cada renglón de la lista de compras, Nuevo pedido con una sola lista y la cantidad fácil de cambiar, fechas grandes, obligatorios en rojo; **A cobrar**, **Gastos e ingresos** y el balance del dinero real, pendiente y total; y la aplicación mucho más rápida (pocas idas a la base) | Hecha |
| — | Tercer afinado del 07/10: letra más grande en todo el sistema, botones centrados, menú con el Tablero destacado, "Guardar" siempre a la vista en Nuevo pedido, detalle del pedido de más a menos, "$" de precio y proveedor en la tarjeta abierta, tarjetas que vuelven un paso atrás y reabrir el día desde el tablero, pago a proveedores eligiendo las compras con el importe precargado, y la lista de compras con lo que sale cada producto y el total | Hecha |
| — | Afinado del 08/10: el recorrido del día en una sola lista que se arrastra (con destinos extra, favoritos y "calcular el mejor recorrido" al final), el reparto con esa misma lista, quién recibió con un toque, el rubro Café, el menú que se guarda (cajón en el celular), el tablero sin desplazar la página (deslizando de costado en el celular) y el botón de precio que se oscurece cuando ya se cargó | Hecha |
| I8 | Puesta en marcha | En curso (§3) |

El orden siguió el circuito del negocio; cada iteración quedó usable antes de pasar a la siguiente.

```mermaid
flowchart LR
    I1["I1 Fundaciones"] --> I2["I2 Registros y precios de compra"]
    I2 --> I3["I3 Precios de venta, pedidos, jornada"]
    I3 --> I4["I4 Lista de compras y compras"]
    I4 --> I5["I5 Cuentas con proveedores"]
    I4 --> I6["I6 Preparación, entregas, documentos"]
    I5 --> I7["I7 Facturación, cierre, reportes"]
    I6 --> I7
    I7 --> I8["I8 Puesta en marcha"]
```

---

## 2. Iteraciones construidas

Cada una se da por terminada con sus pruebas automáticas en verde y los números del ejemplo del plan (04 §2, la jornada del 24/09) reproducidos exactamente.

| Iteración | Qué incluye | Cómo se verificó |
|---|---|---|
| I1 · Fundaciones | Tablas de seguridad, RLS forzado por empresa, roles de base (`app_servidor`, `app_negocio`, `app_operativo`, `app_alta`), permisos `modulo.accion`, auditoría, numeración, configuración inicial desde la app, ingreso con usuario o Google y pedidos de acceso. | Dos empresas: ningún listado muestra datos de la otra; la auditoría no se puede tocar con el rol de la aplicación. |
| I2 · Registros y precios de compra | Productos con sus envases, clientes con sus direcciones, proveedores, precios por puesto con historial, lista general de precios (DOC-06). | La lista general y la comparación de la cebolla dan lo de 05 §2.1 y §3. |
| I3 · Precios de venta y pedidos | Los 7 niveles de precio de venta, redondeo, alertas de margen, pedidos y jornada. | Los precios del ejemplo de 05 §5.3 y §10 salen exactos. |
| I4 · Lista de compras y compras | Lista del día con envases completos y el puesto que conviene, compras de contado, a crédito o mixtas con límite de crédito, costo real del día (DOC-01). | Lista de $646.300 y compras por $653.050; tomate a $925/kg. |
| I5 · Cuentas con proveedores | Pagos con imputación automática o elegida, saldo a favor, ajustes, anulaciones, vencimientos (DOC-05). | Los 12 pasos de 06 §12 dan los mismos saldos e imputaciones. |
| I6 · Preparación y entregas | Preparación por cliente con reparto de faltantes, peso real, reemplazos, remitos sin precios y con precios congelados (DOC-02, DOC-03), repartos, confirmación en el celular (DOC-04, DOC-07). | Faltante de lechuga 48/22/14; la verdulería pasa a $222.770 en la versión 2; ningún documento sin precios lee precios. |
| I7 · Facturación y cierre | Comprobante interno no fiscal (DOC-08) automático o por período, exportación al contador (Excel o CSV), cierre del día con resumen, reportes básicos, balance con gráficos. | Resumen del 24/09: vendido $806.370, margen $174.780, resultado $153.320, deuda $680.550. |
| Interfaz de uso diario | Tablero de pedidos (Pedidos → Lista de compras → Comprado → Preparando → En camino → Entregados), el día paso a paso, carga visual de pedidos, lista de compras para el mercado con "✓ Lo compré", preparación por cliente con "Está todo" o "Falta algo" y el motivo, el recorrido del día con GPS (destinos que se arrastran, destinos extra y favoritos), notas y actividad, pagar cada compra en un toque con los datos para transferir a la vista, balance con tarjetas de colores y comparación con el período anterior. Las etapas del día en curso en el menú de la izquierda, "🚚 Sale ahora" desde Preparando (arrastrando, eligiendo o con el botón) que arma el reparto y lo hace salir, la preparación explicada en tres pasos, los remitos del día en una pantalla para verlos o imprimirlos, la ubicación de los clientes en un mapa en la computadora, y los productos cargados de una vez desde la planilla modelo, con categorías que se arrastran. | Recorridas en el navegador con datos de ejemplo, en celular y computadora, sin errores en la consola; "Sale ahora" y la planilla con pruebas de integración. |
| La plata y la velocidad | Lo que debe cada cliente ("A cobrar") con cobros en un toque, gastos e ingresos generales por rubro, y el balance con el dinero real, el pendiente y el total, las compras pagadas y a pagar y las ventas cobradas y a cobrar. Cada pantalla y cada botón del día hacen pocas idas a la base (`docs/tecnico/base-de-datos.md`, "Velocidad"). | Pruebas de `tests/integracion/plata.test.ts` y `tests/dominio/cuentas-y-dinero.test.ts`; `tests/integracion/velocidad.test.ts` fija el máximo de idas de cada paso. Medido contra la base real desde la computadora de desarrollo: el tablero del día pasó de 2,5 s a 0,2 s; guardar un pedido, de 49 idas a 5; "Sale ahora", de 65 a 17. |

Los pedidos no se confirman a mano: se cargan completos y, al mandarlos a la lista de compras o al empezar a preparar, los que quedaron sin terminar pero tienen productos se completan solos.

---

## 3. Iteración 8: puesta en marcha

| Tarea | Estado |
|---|---|
| Cabeceras de seguridad (sin iframes, sin adivinar tipos, HSTS, permisos del navegador) | Hecha |
| Pantallas de error amables (la página y la aplicación entera) | Hecha |
| Ícono y manifiesto para agregarla a la pantalla de inicio del celular y abrirla sin la barra del navegador | Hecha |
| Configuración del negocio desde la app (datos para los documentos, redondeo, margen mínimo, avisos de precios, colores y avisos de deuda, hora de corte de pedidos, tolerancia de peso) | Hecha |
| Revisión de permisos y RLS | Hecha: las pruebas de integración recorren los permisos con dos empresas y el rol sin precios |
| Base de producción: se empieza con el proyecto de Supabase que ya existe (`sistema-juan-dev`, todavía sin datos reales, con las migraciones 0000 a 0022 aplicadas; el 08/10/2026 se reiniciaron los datos y quedaron solo ejemplos para probar: 12 productos, 3 proveedores con precios y 4 clientes ubicados). Pasar a un proyecto aparte queda para cuando haga falta separar pruebas de datos reales | Hecha |
| Publicar en Vercel (dominio gratuito de Vercel): importar el repositorio `Facumirande/sistema-juan` desde vercel.com, cargar las variables `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` y `DATABASE_URL` (las de `.env.local`) y desplegar. `vercel.json` ya fija la región São Paulo (`gru1`), la misma de la base. Después, en Supabase → Authentication → URL Configuration, poner la dirección de Vercel como Site URL y en Redirect URLs (para entrar con Google) | En curso: el código está listo; falta importar el repositorio en Vercel |
| Activar "Entrar con Google" (el botón ya está en el ingreso y en Crear una cuenta; mientras no se active, avisa que falta y ofrece entrar con usuario): en Google Cloud, crear un cliente OAuth "Aplicación web" con la dirección de retorno `https://<ref>.supabase.co/auth/v1/callback`; en Supabase, Authentication → Sign In / Providers → Google con ese Client ID y Client Secret, y en URL Configuration agregar `https://<dominio>/auth/callback` (y `http://localhost:3000/auth/callback` para probar). Hacerlo en el proyecto de desarrollo y repetirlo en el de producción | Pendiente (lo hace el usuario: necesita su cuenta de Google Cloud) |
| Primer uso en producción: configuración inicial, y habilitar al dueño y a su esposa desde Usuarios | Pendiente |
| Cargar los datos reales (§5) | Pendiente |
| Usar un día completo en paralelo con el papel y corregir lo que aparezca | Pendiente |

**Si algo falla el día que se empieza:** se sigue en papel con la lista de compras y los remitos ya impresos por el sistema; lo cargado no se pierde y se completa después.

---

## 4. Pruebas

| Nivel | Herramienta | Qué cubre |
|---|---|---|
| Dominio | Vitest | Todos los cálculos de `src/dominio` (dinero, precios, créditos, faltantes, pasos del día), con los ejemplos numéricos de 04 a 07. Cobertura del 100 %. |
| Integración | Vitest con PGlite (PostgreSQL en memoria con las mismas migraciones; `docs/tecnico/base-de-datos.md`) | RLS con dos empresas, rol sin precios, transacciones completas (registrar compra, preparar, emitir documentos, cerrar el día), inmutabilidad, idempotencia. |
| Fuga de precios | Integración | Los documentos y pantallas de preparación y reparto se arman con consultas que no leen precios. |
| Velocidad | Integración (`tests/integracion/velocidad.test.ts`) | Cuántas idas a la base hace cada paso del día y cada pantalla; falla si un cambio vuelve a poner consultas una detrás de otra. |
| Conexión | `tests/seguridad/conexion.test.ts`, con el cliente real de postgres.js contra PGlite por un socket | Transacciones sin esperar el `begin` ni el `commit` de las que solo leen, vuelta atrás ante un error y conexiones cortadas. |
| Pantallas | Navegador, con una base local de ejemplo | Recorrido en celular y computadora de lo que cambia. |

Cada prueba lleva en su nombre la regla o el caso que cubre (`RN-063`, `06 §12`). Antes de dar algo por terminado: `pnpm typecheck`, `pnpm lint` y `pnpm test`.

---

## 5. Carga de los datos reales

**Antes de cargar lo real:** la base tiene **datos de ejemplo** (productos, tres puestos con precios y cuatro clientes inventados, cargados el 08/10/2026 para probar). Se dan de baja desde cada ficha, o se vuelve a reiniciar la base antes de empezar (queda un respaldo de lo que había antes en `.respaldos/`, en la computadora de desarrollo).

| # | Qué | De dónde sale | Dónde se carga |
|---|---|---|---|
| 1 | Datos del negocio y valores por defecto | Dueño | Mi cuenta → Configuración del negocio |
| 2 | Productos con sus envases de compra y venta | Lista de precios actual | Productos → 📄 Cargar desde una planilla: bajar la planilla modelo, escribir los nombres uno debajo del otro (lo demás es opcional) y subirla; el sistema arma el código y el dibujo, propone la categoría y avisa lo importante que falta. De a uno, Productos → Nuevo producto |
| 3 | Proveedores (puesto, teléfono, límite de crédito, días para pagar) | Cuaderno de deudas | Proveedores → Nuevo proveedor |
| 4 | Precios de cada puesto | Última semana de compras | Precios de hoy (o "💲 Precio y puesto" en la lista de compras, que los actualiza) |
| 5 | Clientes con su dirección, horario y cada cuánto se les factura | Cuaderno de pedidos | Clientes → Nuevo cliente |
| 6 | Precios pactados y ganancias especiales | Dueño | Precios de venta y ficha del cliente |
| 7 | Deuda con cada proveedor al día de arranque (una boleta por fila) | Cuaderno de deudas, el día anterior | A pagar → el proveedor → Ajuste o deuda anterior |
| 8 | Lo que debe cada cliente al día de arranque | Cuaderno de fiados, el día anterior | Clientes → el cliente → 🤝 Su cuenta → "¿Ya debía plata antes de empezar a usar el sistema?" |

**Verificación con el dueño:** el saldo de cada proveedor y lo que debe cada cliente iguales a los de su cuaderno, y el precio de venta de una muestra de productos para 3 clientes igual al que cobra hoy (si no, se ajustan las ganancias antes de empezar).

---

## 6. Decisiones tomadas

Todas cerradas; cualquiera se revisa si el uso real lo pide. El detalle está en `PARAMETROS-DEL-PROYECTO.md` §13.

| ID | Decisión |
|---|---|
| D-01 | Argentina, pesos argentinos. |
| D-02 | Sin nombre comercial; el dominio es el que dé el hosting. |
| D-03 | Valores por defecto de `PARAMETROS-DEL-PROYECTO.md` §11, cambiables desde Configuración. |
| D-04 | Precios sin IVA (son los que se cobran); el IVA de compras no se computa. |
| D-05 | Cancelar un pedido que ya se está preparando deja su entrega en 0. |
| D-06 | La lista con precios no se manda sola: se imprime o se comparte a mano. |
| D-07 | Dos copias del remito sin precios (una firmada queda en el negocio). |
| D-08 | Negocio chico: no se releva el volumen. |
| D-09 | Sin modo offline por ahora; se revisa si falta señal en el mercado. |
| D-10 | Sin equipo ni presupuesto: desarrollo propio. |

---

## 7. Pendientes e ideas

**Pendiente (pedido del usuario, 05/10/2026): facturación legal.** La factura válida es la electrónica de ARCA con CAE; hoy el sistema emite un comprobante interno. Para conectarlo con ARCA falta saber si el negocio es monotributista (Factura C, compatible con precios sin IVA) o responsable inscripto (A/B con IVA, cambia D-04), su CUIT con clave fiscal nivel 3, un punto de venta para web service y el certificado digital (la solicitud la prepara el sistema). Se prueba primero en el entorno de homologación de ARCA.

**Pendiente de probar con el uso real (06/10/2026):** el arrastre de tarjetas con el dedo (se levanta manteniendo apretado un instante) se probó en la computadora; falta usarlo en los celulares del negocio y ajustar la espera si resulta corta o larga (`ESPERA_AL_TOCAR` en `app/(app)/inicio/tablero.tsx`). Las notificaciones fuera de la pestaña solo funcionan en la computadora: en el celular haría falta instalar un servicio de notificaciones (push), que no está hecho.

**Pendiente de probar en los celulares del negocio (07/10/2026):** ordenar la lista de compras arrastrando con el dedo, la compra producto por producto en el mercado y los tildes de "separado" en las tarjetas del tablero. Están probados en la computadora y con las pruebas automáticas.

**Para decidir con el uso (07/10/2026):** desde Excel se cargan productos y pedidos; cargar clientes, proveedores o los precios de cada puesto desde una planilla no está hecho. La planilla de productos solo crea productos nuevos: no cambia los que ya existen.

**Pendiente: activar "Entrar con Google"** en Supabase y Google Cloud (pasos en §3). Lo tiene que hacer el usuario porque necesita su cuenta de Google Cloud; el sistema ya está listo.

**Pendiente de probar con el uso real (07/10/2026):** las pantallas nuevas (A cobrar, Gastos e ingresos, el balance del dinero, "💲 Precio y puesto" en la lista y el checklist en Preparación) se recorrieron en la computadora con datos de ejemplo; falta usarlas en los celulares del negocio. Los rubros de gastos predefinidos se crean la primera vez que se abre la pantalla: conviene revisarlos ese día y dar de baja los que no se usen.

**Para decidir con el uso (07/10/2026):** lo que falta cobrar no tiene vencimiento ni aviso (el plazo de cobro del cliente no se usa); un gasto a pagar más adelante se anota recién cuando se paga; y "A cobrar" cuenta toda entrega confirmada, tenga o no hecho su comprobante. La velocidad se midió desde la computadora de desarrollo (unos 50 ms por ida a la base); publicado en Vercel, en la misma región que la base, cada ida baja a pocos milisegundos.
**Corregido el 07/10/2026 (por si reaparece algo parecido):** "Registrar pago" con el importe vacío mostraba "problema del sistema" en vez de avisar que faltaba el importe; el mismo defecto estaba en los otros formularios con un número obligatorio (cantidad de una compra, ajuste, lo preparado, etc.). Se arregló en un solo lugar (`numeroObligatorio`, RN-175) y quedó con su prueba.

**Pendiente de probar con el uso real (07/10/2026):** volver atrás una tarjeta arrastrándola con el dedo en el celular, y la letra más grande en los celulares del negocio (se revisó en la computadora, en ventana grande y chica). "Reabrir el día" desde el tablero se probó con las pruebas automáticas, no en pantalla.

**A tener en cuenta:** el mapa para marcar ubicaciones usa los mapas gratuitos de OpenStreetMap, que piden no abusar (un negocio chico está muy lejos del límite). Si algún día se cortan, las ubicaciones se siguen marcando desde el celular (estando ahí, buscando la dirección o pegando un enlace de Google Maps).

**Para revisar con el usuario (08/10/2026):** el lugar de salida de los repartos está marcado cerca de Posadas (Misiones), y el cliente de prueba que había antes del reinicio estaba en San Miguel de Tucumán, a unos 1.200 km. Los clientes de ejemplo se ubicaron en la zona del depósito para que los kilómetros tengan sentido. Si el negocio está en otra ciudad, hay que volver a marcar el depósito (Logística → 🏬 De dónde salen los repartos) y cambiar los ejemplos.

**Pendiente de probar en los celulares del negocio (08/10/2026):** arrastrar los destinos del recorrido con el dedo, el menú como cajón, el tablero deslizando de costado y los botones de quién recibió. Se recorrieron en la computadora (ventana grande y tamaño de celular) con datos de ejemplo y con las pruebas automáticas (`tests/integracion/recorrido.test.ts`). "Calcular el mejor recorrido" no cambió su cuenta (la misma de antes, con sus pruebas); falta verlo con ubicaciones reales.

**Ideas** (no pedidas; solo si el uso real las justifica):

- Consultar la lista de compras y anotar compras sin señal en el mercado.
- Sobrantes y mermas que se descuenten de la compra siguiente.
- Vencimiento y avisos de lo que falta cobrar a cada cliente.
- Pedidos habituales ("todos los lunes lo mismo").

