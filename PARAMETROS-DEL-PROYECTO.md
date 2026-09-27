# Parámetros del proyecto

Fuente de verdad de las decisiones fijas del proyecto. Se actualiza cada vez que se toma, cambia o descarta una decisión; el detalle completo del diseño está en [docs/plan/](docs/plan/).

**Última actualización:** 2026-09-27

---

## 1. Estado del proyecto

| Campo | Valor |
|---|---|
| Uso | **Interno, para un solo negocio** (el del hermano del desarrollador). Sin formalidades: no hay equipo contratado, presupuesto, calendario, demos ni aprobaciones firmadas. Las decisiones abiertas se toman con valores por defecto razonables que se cambian desde la configuración cuando haga falta |
| Etapa actual | Construcción del MVP. Iteraciones 1 a 6 construidas y probadas: acceso, catálogo, proveedores, clientes, precios de compra y de venta, pedidos, lista de compra (DOC-01), compras con límite de crédito, cuentas corrientes con proveedores (DOC-05), preparación con reparto de faltantes (DOC-07), repartos con hoja de ruta (DOC-04) y entregas con lista de entrega y lista contable versionadas (DOC-02, DOC-03). La base de Supabase está al día (migraciones 0000 a 0010). Siguiente: iteración 7 (facturación interna, cierre de jornada y reportes) |
| Código | Next.js 16 en la raíz del repositorio; guía técnica en `README.md` y `docs/tecnico/` |
| Documentación del plan | [docs/plan/](docs/plan/) — el índice es `docs/plan/README.md` |
| Nombre del sistema | "Sistema Juan". Es de uso interno: no lleva nombre comercial (decisión D-02) |
| País y moneda | Argentina, pesos argentinos (`AR`, `ARS`, zona horaria `America/Argentina/Buenos_Aires`) (decisión D-01) |
| Repositorio git | Rama `main`; repositorio remoto en GitHub pendiente (crear `sistema-juan` privado en la cuenta Facumirande y hacer push) |
| Proyecto de Supabase | `sistema-juan-dev` (ref `zdtbxsdgbkiaesjczgav`, región São Paulo `sa-east-1`) en la organización "Near". Es el entorno de desarrollo; producción será un proyecto aparte (plan gratuito mientras alcance). Migraciones 0000 a 0010 aplicadas con el conector de Supabase y registradas en `drizzle.__drizzle_migrations` (27/09); esquema verificado igual al local. Asesor de seguridad: solo el aviso de contraseñas filtradas (opción del plan pago). Clave secreta cargada y probada (26/09). `DATABASE_MIGRACIONES_URL` (opcional) permite aplicar las próximas migraciones desde la terminal con `pnpm db:aplicar` |
| Idioma | Español: interfaz, documentación y nombres del modelo de datos |

## 2. Negocio

- **Destinatarios:** personas o empresas que compran frutas y verduras en el mercado y las distribuyen a sus clientes (hospitales, restaurantes, comercios).
- **Circuito que cubre el sistema:** Clientes → Pedidos → Lista de compra → Compra a proveedores → Control de créditos/deudas → Preparación → Entrega → Facturación/contabilidad.
- **Flujo de 12 pasos:** pedido → registro → cantidades a comprar → consulta de proveedores y precios → registro de compras → pago contado o crédito → actualización de deuda con proveedores → preparación por cliente → lista de entrega sin precios → entrega → lista contable con precios → actualización de la venta.

## 3. Tipo de aplicación y tecnología

- **Tipo:** aplicación web responsive instalable como PWA. Un solo código y un solo backend para computadora y celular. Sin app nativa en las primeras fases.
- **Diseño de pantallas:** las operativas (lista de compra en el mercado, registrar compra, preparación, entrega, carga rápida de pedidos) son mobile-first; las administrativas (precios, márgenes, cuentas corrientes, reportes, configuración) son desktop-first pero usables en celular.
- **Conectividad:** el MVP requiere conexión; el modo offline (consultar lista de compra y encolar compras) es fase 2.

| Pieza | Elección |
|---|---|
| Framework | Next.js (App Router) + TypeScript |
| Interfaz | Tailwind CSS + shadcn/ui |
| Base de datos | PostgreSQL gestionado en Supabase (también Auth, Storage de PDFs y backups) |
| ORM / validación | Drizzle / Zod |
| Hosting | Vercel |
| PDF | Del lado servidor con @react-pdf/renderer |
| Impresión | Vistas HTML optimizadas (CSS `@media print`, A4) + botón Imprimir |
| Multi-empresa | Preparado desde el inicio: `empresa_id` en toda tabla de negocio + Row Level Security |
| Versiones | Next.js 16 (`proxy.ts` en lugar de middleware), React 19, Drizzle 0.45, Zod 4, Tailwind 4. Node.js 22 LTS recomendado (mínimo 20.9) |
| Pruebas | Vitest 3 (compatible con Node 20; Vitest 5 exige Node 22.12) y PGlite (PostgreSQL en memoria) para las pruebas de base de datos, sin Docker |
| Roles de base de datos | La aplicación se conecta como `app_servidor` (sin BYPASSRLS, NOINHERIT) y cada transacción cambia a `app_negocio`, `app_operativo` (sin precios) o `app_alta` (solo alta de empresas). Detalle en `docs/tecnico/base-de-datos.md` |

## 4. Convenciones de datos

- Claves primarias uuid; tablas en snake_case singular (ej. `pedido_item`).
- Campos comunes: `id`, `empresa_id`, `creado_en`, `creado_por`, `actualizado_en`, `actualizado_por`.
- Tipos: montos `numeric(14,2)`; precios unitarios `numeric(14,4)` (se muestran con 2 decimales); cantidades `numeric(12,3)`; porcentajes `numeric(7,3)`.
- Una moneda por empresa (configurable).
- Los documentos (pedidos, compras, pagos, entregas, facturas, cobros) **nunca se borran: se anulan con motivo**. Los maestros (productos, clientes, proveedores) se desactivan.
- Numeración correlativa por empresa y tipo de documento (tabla `secuencia`).
- Auditoría de cambios sensibles (precios, recargos, overrides, anulaciones, excesos de límite) en la tabla `auditoria`.

## 5. Entidades canónicas (nombres de tabla)

| Dominio | Tablas |
|---|---|
| Seguridad | `empresa`, `usuario`, `rol`, `usuario_rol`, `secuencia`, `auditoria` |
| Catálogo | `categoria`, `producto`, `presentacion` |
| Proveedores y precios de compra | `proveedor`, `proveedor_producto`, `historial_precio_compra` |
| Clientes y precios de venta | `cliente`, `punto_entrega`, `regla_precio` |
| Pedidos y jornada | `jornada`, `pedido`, `pedido_item` |
| Compra | `lista_compra`, `lista_compra_item`, `compra`, `compra_item` |
| Créditos y pagos | `pago_proveedor`, `imputacion_pago_proveedor`, `movimiento_cuenta_proveedor` |
| Entregas | `reparto`, `entrega`, `entrega_item`, `documento_emitido` |
| Ventas y cobranzas | `factura`, `factura_entrega`, `cobro_cliente`, `imputacion_cobro_cliente`, `movimiento_cuenta_cliente` |
| Stock (fase 2) | `ajuste_stock` |

**Unidades:** cada producto tiene una `unidad_base` (kg, unidad, atado, maple, bandeja…) y todos los cálculos internos se hacen en esa unidad. Una `presentacion` (ej. "Cajón 18 kg", `factor_a_base` = 18) define cómo se compra o vende. Costo por unidad base = precio de la presentación ÷ `factor_a_base`. La lista de compra redondea hacia arriba a presentaciones completas; el excedente queda como sobrante previsto.

**Jornada:** una fecha operativa (fecha de entrega) que agrupa pedidos, lista de compra, compras, preparación, repartos y entregas del día.

## 6. Estados canónicos

| Entidad | Estados |
|---|---|
| jornada | ABIERTA → COMPRANDO → PREPARANDO → REPARTIENDO → CERRADA |
| pedido | BORRADOR → CONFIRMADO → EN_COMPRA → EN_PREPARACION → PREPARADO → EN_REPARTO → ENTREGADO; CANCELADO (solo desde BORRADOR, CONFIRMADO o EN_COMPRA) |
| lista_compra_item | PENDIENTE → PARCIAL → COMPRADO; NO_CONSEGUIDO |
| compra | REGISTRADA, ANULADA · condición: CONTADO, CREDITO, MIXTA · estado de pago (calculado): PAGADA, PARCIAL, PENDIENTE |
| entrega | BORRADOR → EN_PREPARACION → PREPARADA → EN_REPARTO → ENTREGADA; ANULADA · flag `con_diferencias` · facturación: SIN_FACTURAR, FACTURADA |
| factura | EMITIDA, ANULADA · estado de cobro (calculado): COBRADA, PARCIAL, PENDIENTE |
| reparto (agregado por el diseño) | PLANIFICADO → EN_CURSO → FINALIZADO; ANULADO |
| documento_emitido (agregado por el diseño) | VIGENTE, REEMPLAZADO, ANULADO |

## 7. Precios de venta y márgenes

- **Fórmula:** el "porcentaje de ganancia" es un **recargo sobre el costo**: `precio_venta = costo_referencia × (1 + recargo / 100)`, luego se redondea según la regla de la empresa. Los reportes muestran además el margen sobre venta: `(venta − costo) / venta`.
- **Precedencia** (gana la primera regla vigente que exista; el sistema siempre muestra cuál se aplicó):
  1. Precio fijo pactado cliente + producto (`regla_precio` PRECIO_FIJO).
  2. Recargo cliente + producto.
  3. Recargo cliente + categoría.
  4. Recargo general del cliente (`cliente.recargo_default`).
  5. Recargo del producto (`producto.recargo_default`).
  6. Recargo de la categoría (`categoria.recargo_default`).
  7. Recargo global de la empresa.
- **Costo de referencia:** estrategia configurable por empresa: PREFERIDO (proveedor preferido), MINIMO (menor precio vigente) o ULTIMO_COSTO_REAL. Si la jornada ya tiene compras del producto, se usa el costo real (promedio ponderado de esas compras).
- **Ciclo de vida del precio:** estimado en el pedido → recalculado con el costo real → **congelado** en `entrega_item` al emitir los documentos de entrega. Cambios posteriores no alteran documentos emitidos.
- **Override manual** de una línea: solo con permiso `precios.override_linea`, con motivo, auditado.
- **Alertas:** margen por debajo del mínimo configurado y margen negativo.

## 8. Créditos y pagos a proveedores

- Cuenta corriente por proveedor como libro de movimientos: toda compra genera un CARGO por su total y todo pago genera un PAGO. Los movimientos no se editan: se compensan.
- CONTADO = compra + pago automático por el total. CREDITO = todo pendiente. MIXTA = pago parcial + resto pendiente.
- Imputación de pagos: automática FIFO por defecto, o manual. Un pago mayor a la deuda deja saldo a favor.
- `saldo_pendiente` (= crédito utilizado) = cargos − pagos · `credito_disponible` = `limite_credito` − `saldo_pendiente` · `limite_credito` nulo = sin límite.
- Semáforo por porcentaje de uso del límite: **VERDE** < 70 % · **AMARILLO** 70 % a < 90 % · **ROJO** 90 % a 100 % · **EXCEDIDO** > 100 %.
- Una compra a crédito que haga superar el límite se bloquea; solo la confirma quien tenga `compras.exceder_limite`, con motivo auditado.
- `plazo_pago_dias` por proveedor para calcular vencimientos y alertar deudas vencidas.

## 9. Entregas y documentos imprimibles

- Una entrega es la mercadería para un cliente (y punto de entrega) en una jornada; puede agrupar varios pedidos del mismo cliente. `entrega_item` guarda cantidad pedida, preparada y entregada.
- De la **misma entrega y la misma versión** salen la lista de entrega (sin precios) y la lista contable (con precios y totales). La lista contable definitiva usa la cantidad entregada.
- Si la entrega cambia después de emitir documentos, sube `entrega.version` y se reemiten ambos; cada emisión queda en `documento_emitido`.
- Los documentos sin precios **no consultan precios en el servidor** (no alcanza con ocultarlos en la pantalla).

| ID | Documento |
|---|---|
| DOC-01 | Lista de compra |
| DOC-02 | Lista de entrega (sin precios) |
| DOC-03 | Lista contable (remito valorizado) |
| DOC-04 | Hoja de ruta de reparto |
| DOC-05 | Estado de cuenta de proveedor |
| DOC-06 | Lista general de precios de compra |
| DOC-07 | Hoja de preparación por cliente (sin precios) |
| DOC-08 | Comprobante interno de venta (no fiscal, leyenda "Documento no válido como factura") |

Reservados para fases posteriores (PROPUESTO): DOC-09 Estado de cuenta de cliente y DOC-10 Recibo de cobro.

## 10. Roles y permisos

Un usuario puede tener varios roles; los permisos son granulares con claves `modulo.accion`.

**Uso real:** el sistema lo usan **dos personas, las dos ADMIN** (el dueño y su esposa). La interfaz no muestra roles: todo usuario que se agrega es ADMIN. Los roles y permisos siguen en la base por si algún día entra alguien con acceso limitado.

**Cuentas:** el primer uso lo hizo Facundo (el desarrollador), que administra y mejora el sistema. Las demás personas entran **por su cuenta**: con **Google** o con **"Crear una cuenta"** (nombre, usuario y contraseña). Toda cuenta nueva queda como **pedido de acceso** y no ve nada hasta que alguien habilitado la aprueba en Usuarios (queda ADMIN); rechazar bloquea la cuenta. Hay como mucho 5 pedidos sin responder, para que nadie llene la lista. Se entra las veces que haga falta y desde cualquier dispositivo; la sesión queda abierta. Si alguien con usuario olvida su contraseña, "Darle una clave provisoria" y la persona elige una nueva al entrar. No hay correos del sistema.

| Rol | Alcance |
|---|---|
| ADMIN | Dueño; todo. Puede operar el circuito completo como usuario único |
| VENDEDOR | Clientes y pedidos |
| COMPRADOR | Lista de compra, compras, precios de compra, proveedores |
| PREPARADOR | Preparación; **nunca ve precios** |
| REPARTIDOR | Solo sus repartos (marca salida y regreso) y la confirmación de sus entregas; **nunca ve precios** |
| ADMINISTRATIVO | Pagos a proveedores, cobranzas, facturación, reportes, documentos contables |

## 11. Parámetros configurables por empresa

Valores por defecto con los que se crea la empresa (campos de `empresa`, `docs/plan/03-modelo-de-datos.md` §4.1). Se adoptan los que propone el plan (D-03) y se cambian desde la configuración cuando el negocio lo pida.

| Parámetro | Valor por defecto | Estado |
|---|---|---|
| Umbrales del semáforo de crédito | 70 % / 90 % / 100 % | Fijado |
| Estrategia de costo de referencia | PREFERIDO | Adoptado |
| Recargo global | 30 % | Adoptado |
| Margen mínimo para alerta (sobre venta) | 15 % | Adoptado |
| Regla de redondeo del precio de venta | Al múltiplo de $1 más cercano (los ejemplos del plan usan $10 hacia arriba) | Adoptado |
| Precios de venta con o sin IVA | Sin IVA: los precios son los que se cobran; alícuota por defecto 0 %; el IVA de compras no se computa (D-04) | Adoptado |
| Días para considerar un precio de compra desactualizado | 7 | Adoptado |
| Porcentaje de variación brusca de precio | 30 % | Adoptado |
| Moneda | ARS (pesos argentinos) | Fijado (D-01) |
| Otros (preferido caro, avisos, tolerancia de peso, faltantes, facturación automática…) | Ver `docs/plan/07-reglas-de-negocio.md` §4 | Adoptado |

## 12. Alcance por fases

- **Fase 1 (MVP):** todo lo pedido explícitamente. Incluye catálogo, clientes, proveedores, precios de compra y venta con márgenes, pedidos, lista de compra, compras, créditos y pagos con límite, preparación, entregas y los documentos imprimibles. La facturación del MVP es un registro de venta por entrega, un comprobante interno no fiscal y una exportación para el contador.
- **Plan de construcción del MVP** (`docs/plan/10-plan-de-implementacion.md`): las 8 iteraciones en el orden del circuito, sin fechas ni presupuesto. Se empieza a usar por partes apenas cada una sirve: R1 pedidos, lista de compra y compras; R2 preparación y reparto; R3 facturación y cierre (MVP completo). La facturación del MVP es interna (no fiscal).
- **Fases posteriores (PROPUESTO, no pedido explícitamente):** cuenta corriente y cobranzas de clientes, facturación fiscal electrónica (ARCA/AFIP en Argentina, DGI/CFE en Uruguay), modo offline, stock y sobrantes, pedidos habituales, portal de clientes, integración con WhatsApp, reportes avanzados, multi-empresa comercial.

## 13. Decisiones

No quedan decisiones pendientes que frenen la construcción. Como es un sistema interno, las que eran formales se cerraron con la propuesta del plan; cualquiera se puede revisar cuando el uso real lo pida. Detalle en `docs/plan/10-plan-de-implementacion.md` §11.

- **D-01 · País y moneda (2026-09-24):** Argentina, pesos argentinos. Si algún día hace falta facturación fiscal, será con ARCA/AFIP.
- **D-02 · Nombre y dominio (2026-09-24):** sin nombre comercial. El dominio se ve al publicar (puede ser el gratuito del hosting).
- **D-03 · Valores por defecto (2026-09-26):** los de la sección 11, cambiables desde la configuración.
- **D-04 · IVA (2026-09-26):** precios sin IVA (son los que se cobran), alícuota 0 %, el IVA de compras no se computa. Sin consulta al contador: el sistema no emite facturas fiscales.
- **D-05 · Cancelar un pedido en preparación (2026-09-26):** como propone el plan: la entrega queda con cantidad 0.
- **D-06 · Envío automático de DOC-03 (2026-09-26):** no; se imprime o se comparte a mano.
- **D-07 · Copias de DOC-02 (2026-09-26):** dos (una para el cliente y una firmada para el negocio), como propone el plan.
- **D-08 · Volumen del negocio (2026-09-26):** no se releva; se asume un negocio chico (pocos usuarios, decenas de clientes y proveedores). No cambia el diseño.
- **D-09 · Modo offline antes de tiempo (2026-09-26):** no; se evalúa si en el mercado falta señal.
- **D-10 · Equipo y presupuesto (2026-09-26):** no aplica: lo desarrolla el hermano del dueño con Claude, sin presupuesto ni calendario.

## 14. Registro de cambios

| Fecha | Cambio |
|---|---|
| 2026-09-23 | Creación del archivo con las decisiones base del diseño (el contrato de diseño usado para generar `docs/plan/`). |
| 2026-09-24 | Plan completado: documentos 08 (pantallas), 09 (documentos imprimibles), 10 (plan de implementación) e índice `docs/plan/README.md`. Se agrega DOC-08 Comprobante interno de venta y se reservan DOC-09 y DOC-10 (PROPUESTO). Estados de `reparto` y `documento_emitido` incorporados a la sección 6. El REPARTIDOR puede marcar la salida y el regreso de sus propios repartos. Valores por defecto propuestos en la sección 11. Decisiones pendientes ampliadas (D-01 a D-10). Armonización de nombres entre documentos: permisos según el catálogo de 02 (`jornada.*`, `pagos.ajustar`, `proveedores.editar_limite`, `entregas.emitir_documentos`), imputaciones con `activa` y partidas de ajuste en 03, lista de compra de una fila por jornada, enum `motivo_diferencia` y `REAL_JORNADA`. |
| 2026-09-24 | Decisiones D-01 (Argentina, ARS) y D-02 (sin nombre comercial, uso interno). Proyecto Supabase de desarrollo `sistema-juan-dev` creado en São Paulo con las migraciones 0000 a 0002 (la 0002 fija el `search_path` de las funciones internas, aviso del asesor de Supabase) y el usuario de conexión `app_servidor`. |
| 2026-09-24 | Inicio de la construcción. Repositorio git local; proyecto Next.js 16 con Supabase SSR, Drizzle, Zod y decimal.js. Fase 0 e iteración 1 (base): dominio de dinero, fechas, unidades y numeración; catálogo de 67 permisos y roles de sistema; tablas `empresa`, `usuario`, `rol`, `usuario_rol`, `secuencia`, `auditoria` con RLS forzado; alta de empresa; ingreso y menú por permisos. Decisiones técnicas: pruebas de base con PGlite en lugar de Supabase local con Docker (no hay Docker en la máquina de desarrollo), Vitest 3 por compatibilidad con Node 20, roles de base `app_servidor`/`app_negocio`/`app_operativo`/`app_alta`. El ingreso por nombre de usuario (personal sin correo, 02 §10.2) queda para la pantalla de usuarios. |
| 2026-09-26 | **Uso interno, sin formalidades:** el sistema es para el negocio del hermano del desarrollador. Se cierran D-03 a D-10 con las propuestas del plan (sección 13) y el plan 10 queda sin equipo, costos, cronograma, demos ni aprobaciones. **Sin pasos a mano en Supabase:** el negocio y el primer ADMIN se crean en la pantalla de configuración inicial (empresa principal con id fijo, se puede hacer una sola vez); el ADMIN crea los usuarios en la pantalla Usuarios con nombre de usuario o correo, sin invitaciones ni recuperación por correo; ingreso con "usuario o correo"; pantalla "Mi cuenta" para cambiar la contraseña. Se quita el script de alta por terminal. Nueva variable `SUPABASE_SECRET_KEY` (solo servidor). |
| 2026-09-26 | **Iteración 2:** tablas `categoria`, `producto`, `presentacion`, `proveedor`, `proveedor_producto`, `historial_precio_compra`, `cliente`, `punto_entrega` (migraciones 0003 y 0004, con RLS; el historial solo admite completar `vigente_hasta`). Pantallas P-10, P-11, P-12, P-15, P-16, P-20, P-21, P-25, P-26, P-29 y DOC-06. Decisiones técnicas: la comparación de ofertas (mejor precio, % sobre el mejor, desactualizado) se calcula en `src/dominio/precios/compra.ts` en lugar de las vistas `v_oferta_vigente` y `v_comparador_precios`; los números se escriben a la argentina ("17.550", "1.234,56"); `historial_precio_compra.variacion_pct` es `numeric(10,3)` para que un error de tipeo no rompa el guardado; volver a agregar una oferta quitada la reactiva con su historial; el recargo de productos, categorías y clientes se edita en la iteración 3. Quedan para más adelante: actualización masiva por porcentaje (P-27), importar planilla (P-28), comparador rápido del celular (P-30) y el registro de DOC-06 en `documento_emitido`. Nueva variable opcional `DATABASE_POOL_MAX`. |
| 2026-09-26 | **Dos usuarios, sin formalidades:** lo usan solo el dueño y su esposa, los dos ADMIN. El primer uso crea a las dos personas a la vez; la pantalla Usuarios queda sin roles (agregar, cambiar contraseña, quitar acceso); el ingreso es "usuario y contraseña" con botón para ver la contraseña (sin campo de repetir); el menú muestra solo lo que ya funciona y el inicio tiene accesos directos. |
| 2026-09-26 | **Cada uno inventa su contraseña:** el primer uso crea solo al desarrollador (entra primero a probar). A los demás se los agrega con nombre y usuario; reciben una clave provisoria de 8 letras y en su primer ingreso eligen su contraseña (pantalla `/crear-clave`, usa `usuario.debe_cambiar_clave`). "Darle una clave provisoria" reemplaza a "cambiar su contraseña". |
| 2026-09-26 | **Iteración 3:** tablas `regla_precio` (con restricciones de exclusión por vigencia, extensión `btree_gist`), `jornada`, `pedido`, `pedido_item` (migraciones 0005 y 0006; las líneas solo se borran en BORRADOR, por trigger). Cálculo del precio de venta de 05 §5.8 en `src/dominio/precios/venta.ts` (7 niveles, redondeo, IVA, alertas, costo de referencia), probado con los ejemplos del plan. Pantallas: Pedidos por día (P-40), carga y detalle de pedido (P-41/P-42), Jornadas (P-45), Precios de venta con recargos y lista de precios por cliente (P-32 simplificada), precios del cliente (P-33) en su ficha. Decisiones técnicas: el número `PED-` se asigna al crear (también a los borradores); crear una regla que empieza después de otra vigente sin fin cierra la anterior el día antes ("nuevo precio desde"); todo cambio de precio de compra, preferido, regla o recargo recalcula los pedidos pendientes (RN-088). Quedan para más adelante: matriz producto × cliente, simulador, cantidad atípica (RN-023) y el costo real de la jornada (llega con las compras). |
| 2026-09-26 | **Acceso por cuenta propia:** cada persona entra con Google o con "Crear una cuenta" y queda como pedido de acceso hasta que un administrador la habilita (Usuarios → Habilitar / Rechazar; aviso en el inicio). Se quita "Agregar una persona". Los pedidos usan las columnas `invitacion_enviada_en` / `invitacion_aceptada_en` de `usuario` (en el código, `accesoPedidoEn` / `accesoAprobadoEn`) para no migrar la base todavía. "Entrar con Google" aparece solo cuando el proveedor Google está activado en Supabase. |
| 2026-09-26 | **Iteración 4:** tablas `lista_compra`, `lista_compra_item`, `compra`, `compra_item`, `pago_proveedor`, `movimiento_cuenta_proveedor`, `imputacion_pago_proveedor` (migraciones 0007 y 0008; movimientos e ítems de compra sin `UPDATE`, compras y pagos solo con las columnas de anulación editables). Lista de compra por puesto con sugerencia de proveedor por costo y crédito, compras CONTADO/CREDITO/MIXTA con bloqueo por límite (RN-063) y confirmación de precios con variación brusca (RN-058), anulación con movimiento compensatorio y reimputación FIFO del pago liberado, deuda anterior al sistema (saldo inicial) y costo real de la jornada para los precios de venta. Pantallas P-50, P-55, P-56, P-57, P-60 (resumen), cuenta en la ficha del proveedor y DOC-01. Una línea ya comprada muestra el sobrante real (comprado − necesidad), no el previsto. |
| 2026-09-27 | **Iteración 5:** cuentas corrientes con proveedores sin tablas nuevas. Pagos posteriores con imputación FIFO o elegida a mano (RN-096, RN-097) y vista previa de qué compras cancela; saldo a favor que se aplica solo a la próxima compra a crédito (RN-098); reimputar y anular pagos (RN-100); ajustes de débito y crédito con compra relacionada (RN-102); anular una compra de contado preguntando si el proveedor devolvió la plata (06 §6.1); vencimientos, deuda vencida y por vencer con aviso en el inicio (RN-106, RN-107). Pantallas P-60 (con filtros, vencido y último pago), P-61, P-62, P-63, P-64 y DOC-05; el detalle de compra muestra qué pagos la cancelan. Aceptación: los 12 pasos de 06 §12 dan los mismos saldos, estados e imputaciones. Decisiones por uso interno: la referencia del pago es opcional para cualquier medio, y la deuda anterior al sistema se puede cargar en varias boletas sin pedir permiso especial. Quedan para cuando se publique: el control nocturno de consistencia y la tarea programada de alertas (hoy los avisos se calculan al abrir el inicio). Corrección: las subconsultas de "lo imputado" y del contador de reglas por cliente daban 0 cuando la consulta tenía una sola tabla (Drizzle omite el nombre de la tabla); ahora se escriben con el nombre completo. **Supabase al día:** migraciones 0003 a 0008 aplicadas con el conector y registradas para Drizzle. |
| 2026-09-27 | **Iteración 6:** tablas `reparto`, `entrega`, `entrega_item`, `documento_emitido` (migraciones 0009 y 0010; lo emitido solo admite cambiar estado, anulación, PDF y envío). Preparación: una entrega por cliente y punto con las líneas de los pedidos (RN-111), propuesta con el reparto de faltantes por prioridad y prorrateo (RN-115, 48/22/14 del plan), peso real con tolerancia (RN-113), exceso sobre lo comprado con confirmación (RN-114), reemplazos (RN-117) y "marcar preparada" (RN-118). Emisión de DOC-02 y DOC-03 juntos con precios congelados y versiones (RN-120, RN-121, RN-128): una línea sin precio deja los documentos pendientes; con margen negativo, confirmación. Repartos con paradas ordenables, salida que exige documentos al día (RN-122) y regreso; "Mi reparto" y confirmación en el celular (completa, con diferencias o no recibió; RN-125 a RN-134); corrección y anulación desde la oficina. Pantallas P-46, P-70, P-71, P-72, P-75 a P-80 y DOC-02, DOC-03, DOC-04, DOC-07. Aceptación: restaurante | 2026-09-27 | **Iteración 5:** cuentas corrientes con proveedores sin tablas nuevas. Pagos posteriores con imputación FIFO o elegida a mano (RN-096, RN-097) y vista previa de qué compras cancela; saldo a favor que se aplica solo a la próxima compra a crédito (RN-098); reimputar y anular pagos (RN-100); ajustes de débito y crédito con compra relacionada (RN-102); anular una compra de contado preguntando si el proveedor devolvió la plata (06 §6.1); vencimientos, deuda vencida y por vencer con aviso en el inicio (RN-106, RN-107). Pantallas P-60 (con filtros, vencido y último pago), P-61, P-62, P-63, P-64 y DOC-05; el detalle de compra muestra qué pagos la cancelan. Aceptación: los 12 pasos de 06 §12 dan los mismos saldos, estados e imputaciones. Decisiones por uso interno: la referencia del pago es opcional para cualquier medio, y la deuda anterior al sistema se puede cargar en varias boletas sin pedir permiso especial. Quedan para cuando se publique: el control nocturno de consistencia y la tarea programada de alertas (hoy los avisos se calculan al abrir el inicio). Corrección: las subconsultas de "lo imputado" y del contador de reglas por cliente daban 0 cuando la consulta tenía una sola tabla (Drizzle omite el nombre de la tabla); ahora se escriben con el nombre completo. **Supabase al día:** migraciones 0003 a 0008 aplicadas con el conector y registradas para Drizzle. |
14.400; verdulería $227.410 que pasa a $222.770 en la versión 2. Decisiones por uso interno: se puede iniciar la preparación sin haber armado la lista de compra (la jornada pasa de ABIERTA a PREPARANDO); si en la jornada no se registró ninguna compra se propone preparar lo pedido; el repartidor ve solo sus repartos y entregas aunque tenga `entregas.ver` (RN-131). Quedan para más adelante: PDF en Storage y envío por correo, foto del remito y firma, registro de reimpresiones, P-73 (ajuste manual de faltantes), P-92 (documentos emitidos), el rol de base `app_operativo` con las vistas `v_op_*` (hoy los documentos sin precios se arman con consultas que no leen precios, verificado por prueba). |
