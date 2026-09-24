# Parámetros del proyecto

Fuente de verdad de las decisiones fijas del proyecto. Se actualiza cada vez que se toma, cambia o descarta una decisión; el detalle completo del diseño está en [docs/plan/](docs/plan/).

**Última actualización:** 2026-09-24

---

## 1. Estado del proyecto

| Campo | Valor |
|---|---|
| Etapa actual | Construcción del MVP: fase 0 hecha (proyecto base, pruebas, CI) y base de la iteración 1 (seguridad, permisos, datos de empresa y usuarios) construida, probada y con la base de datos creada en Supabase. Falta dar de alta la empresa y el primer usuario |
| Código | Next.js 16 en la raíz del repositorio; guía técnica en `README.md` y `docs/tecnico/` |
| Documentación del plan | [docs/plan/](docs/plan/) — el índice es `docs/plan/README.md` |
| Nombre del sistema | "Sistema Juan". Es de uso interno: no lleva nombre comercial (decisión D-02) |
| País y moneda | Argentina, pesos argentinos (`AR`, `ARS`, zona horaria `America/Argentina/Buenos_Aires`) (decisión D-01) |
| Repositorio git | Rama `main`; repositorio remoto en GitHub pendiente |
| Proyecto de Supabase | `sistema-juan-dev` (ref `zdtbxsdgbkiaesjczgav`, región São Paulo `sa-east-1`) en la organización "Near". Es el entorno de desarrollo; producción será un proyecto aparte. Migraciones 0000 a 0002 aplicadas; asesor de seguridad sin avisos |
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

| Rol | Alcance |
|---|---|
| ADMIN | Dueño; todo. Puede operar el circuito completo como usuario único |
| VENDEDOR | Clientes y pedidos |
| COMPRADOR | Lista de compra, compras, precios de compra, proveedores |
| PREPARADOR | Preparación; **nunca ve precios** |
| REPARTIDOR | Solo sus repartos (marca salida y regreso) y la confirmación de sus entregas; **nunca ve precios** |
| ADMINISTRATIVO | Pagos a proveedores, cobranzas, facturación, reportes, documentos contables |

## 11. Parámetros configurables por empresa

Valores por defecto con los que se crea una empresa (campos de `empresa`, `docs/plan/03-modelo-de-datos.md` §4.1). "Propuesto" = lo propone el plan y falta que el dueño lo confirme (decisión D-03).

| Parámetro | Valor por defecto | Estado |
|---|---|---|
| Umbrales del semáforo de crédito | 70 % / 90 % / 100 % | Fijado |
| Estrategia de costo de referencia | PREFERIDO | Propuesto |
| Recargo global | 30 % | Propuesto |
| Margen mínimo para alerta (sobre venta) | 15 % | Propuesto |
| Regla de redondeo del precio de venta | Al múltiplo de $1 más cercano (los ejemplos del plan usan $10 hacia arriba) | Propuesto |
| Precios de venta con o sin IVA | Sin IVA incluido; alícuota por defecto 0 % | Propuesto (a confirmar con el contador, D-04) |
| Días para considerar un precio de compra desactualizado | 7 | Propuesto |
| Porcentaje de variación brusca de precio | 30 % | Propuesto |
| Moneda | ARS (pesos argentinos) | Fijado (D-01) |
| Otros (preferido caro, avisos, tolerancia de peso, faltantes, facturación automática…) | Ver `docs/plan/07-reglas-de-negocio.md` §4 | Propuesto |

## 12. Alcance por fases

- **Fase 1 (MVP):** todo lo pedido explícitamente. Incluye catálogo, clientes, proveedores, precios de compra y venta con márgenes, pedidos, lista de compra, compras, créditos y pagos con límite, preparación, entregas y los documentos imprimibles. La facturación del MVP es un registro de venta por entrega, un comprobante interno no fiscal y una exportación para el contador.
- **Plan de construcción del MVP** (`docs/plan/10-plan-de-implementacion.md`): fase 0 de preparación y 8 iteraciones; ≈ 30 semanas y 1.620 a 2.220 horas con 2 desarrolladores (estimación de orden de magnitud). Uso por partes: R1 pedidos, lista de compra y compras; R2 preparación y reparto; R3 facturación y cierre (MVP completo).
- **Fases posteriores (PROPUESTO, no pedido explícitamente):** cuenta corriente y cobranzas de clientes, facturación fiscal electrónica (ARCA/AFIP en Argentina, DGI/CFE en Uruguay), modo offline, stock y sobrantes, pedidos habituales, portal de clientes, integración con WhatsApp, reportes avanzados, multi-empresa comercial.

## 13. Decisiones pendientes

Detalle, fecha límite y propuesta de cada una en `docs/plan/10-plan-de-implementacion.md` §11.

- ~~D-01 · País de operación y moneda~~ → **Resuelta (2026-09-24):** Argentina, pesos argentinos. La facturación fiscal futura será con ARCA/AFIP.
- ~~D-02 · Nombre comercial del sistema y dominio~~ → **Resuelta (2026-09-24):** no hace falta nombre comercial (uso interno). El dominio se define al publicar en producción.
- D-03 · Confirmar los valores por defecto de la sección 11.
- D-04 · Precios de venta con o sin IVA, alícuotas por producto y si el IVA de compras se computa.
- D-05 · Si se permite cancelar un pedido que ya está en preparación (caso borde 33 de `07-reglas-de-negocio.md`).
- D-06 · Envío automático de la lista contable (DOC-03) por correo al confirmar cada entrega.
- D-07 · Una o dos copias de la lista de entrega (DOC-02).
- D-08 · Volumen real del negocio (clientes, productos, proveedores, pedidos por día, usuarios).
- D-09 · Adelantar el modo offline a una fase 1b (se decide con el piloto de compras).
- D-10 · Equipo de desarrollo y presupuesto.

## 14. Registro de cambios

| Fecha | Cambio |
|---|---|
| 2026-09-23 | Creación del archivo con las decisiones base del diseño (el contrato de diseño usado para generar `docs/plan/`). |
| 2026-09-24 | Plan completado: documentos 08 (pantallas), 09 (documentos imprimibles), 10 (plan de implementación) e índice `docs/plan/README.md`. Se agrega DOC-08 Comprobante interno de venta y se reservan DOC-09 y DOC-10 (PROPUESTO). Estados de `reparto` y `documento_emitido` incorporados a la sección 6. El REPARTIDOR puede marcar la salida y el regreso de sus propios repartos. Valores por defecto propuestos en la sección 11. Decisiones pendientes ampliadas (D-01 a D-10). Armonización de nombres entre documentos: permisos según el catálogo de 02 (`jornada.*`, `pagos.ajustar`, `proveedores.editar_limite`, `entregas.emitir_documentos`), imputaciones con `activa` y partidas de ajuste en 03, lista de compra de una fila por jornada, enum `motivo_diferencia` y `REAL_JORNADA`. |
| 2026-09-24 | Decisiones D-01 (Argentina, ARS) y D-02 (sin nombre comercial, uso interno). Proyecto Supabase de desarrollo `sistema-juan-dev` creado en São Paulo con las migraciones 0000 a 0002 (la 0002 fija el `search_path` de las funciones internas, aviso del asesor de Supabase) y el usuario de conexión `app_servidor`. |
| 2026-09-24 | Inicio de la construcción. Repositorio git local; proyecto Next.js 16 con Supabase SSR, Drizzle, Zod y decimal.js. Fase 0 e iteración 1 (base): dominio de dinero, fechas, unidades y numeración; catálogo de 67 permisos y roles de sistema; tablas `empresa`, `usuario`, `rol`, `usuario_rol`, `secuencia`, `auditoria` con RLS forzado; alta de empresa; ingreso y menú por permisos. Decisiones técnicas: pruebas de base con PGlite en lugar de Supabase local con Docker (no hay Docker en la máquina de desarrollo), Vitest 3 por compatibilidad con Node 20, roles de base `app_servidor`/`app_negocio`/`app_operativo`/`app_alta`. El ingreso por nombre de usuario (personal sin correo, 02 §10.2) queda para la pantalla de usuarios. |
