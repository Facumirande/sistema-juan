# Plan del sistema de gestión para distribuidores de frutas y verduras

Índice del plan de diseño de "Sistema Juan" (sistema de uso interno, sin nombre comercial). Las decisiones fijas del proyecto están resumidas en [`PARAMETROS-DEL-PROYECTO.md`](../../PARAMETROS-DEL-PROYECTO.md); estos documentos tienen el detalle completo.

**Estado:** el sistema está construido (iteraciones 1 a 7 y la interfaz de uso diario); falta la puesta en marcha (`10-plan-de-implementacion.md` §3). Los documentos describen lo que existe.
**Última actualización:** 29/09/2026.

---

## Qué resuelve el sistema

Un distribuidor compra frutas y verduras en el mercado y las lleva a sus clientes (hospitales, restaurantes, comercios). El sistema acompaña el circuito completo del día:

```mermaid
flowchart LR
    A["Pedidos de clientes"] --> B["Lista de compras"]
    B --> C["Compras en el mercado<br/>contado o crédito"]
    C --> D["Deuda con proveedores<br/>límite y semáforo"]
    C --> E["Preparación por cliente<br/>peso real"]
    E --> F["Entrega<br/>lista sin precios"]
    F --> G["Lista contable<br/>con precios y totales"]
    G --> H["Venta registrada<br/>y exportada al contador"]
```

Es una aplicación web que se usa desde el navegador del celular o de la computadora: las pantallas del mercado, el depósito y el reparto están pensadas para el celular; las de precios, cuentas y balance, para la computadora. Lo usan dos personas (el dueño y su esposa), las dos con acceso completo.

---

## Documentos

| # | Documento | De qué trata | Para quién es más útil |
|---|---|---|---|
| 01 | [Tipo de aplicación y arquitectura](01-tipo-de-aplicacion-y-arquitectura.md) | Tipo de aplicación, tecnología, módulos, estructura del código, seguridad, respaldos, riesgos técnicos. | Desarrollo |
| 02 | [Usuarios, roles y permisos](02-usuarios-roles-y-permisos.md) | Cuentas y acceso, los roles y el catálogo de permisos `modulo.accion`, y cómo se garantiza que preparación y reparto nunca muestren precios. | Desarrollo |
| 03 | [Modelo de datos](03-modelo-de-datos.md) | Todas las tablas, campos, estados, restricciones e índices. **Fuente de verdad de nombres.** | Desarrollo |
| 04 | [Procesos y flujos](04-procesos-y-flujos.md) | El circuito de 12 pasos, la jornada y cada proceso paso a paso, con excepciones. | Dueño, desarrollo |
| 05 | [Precios y márgenes](05-precios-y-margenes.md) | Precios de compra y su actualización, comparación entre proveedores, costo de referencia, precio de venta con 7 niveles de reglas, redondeo, IVA, alertas. | Dueño, desarrolladores |
| 06 | [Créditos y pagos](06-creditos-y-pagos.md) | Cuenta corriente de proveedores, pagos e imputación, límite de crédito y semáforo, vencimientos. | Dueño, desarrollo |
| 07 | [Reglas de negocio](07-reglas-de-negocio.md) | Catálogo RN-001 a RN-152, casos borde resueltos, parámetros por empresa. | Dueño, desarrollo |
| 08 | [Pantallas y acciones](08-pantallas-y-acciones.md) | Las pantallas construidas: tablero, carga de pedidos, lista de compras, preparación, viaje de entrega, cuentas, facturación y balance, con sus acciones, permisos y reglas. | Dueño, desarrollo |
| 09 | [Documentos imprimibles](09-documentos-imprimibles.md) | DOC-01 a DOC-08: contenido, permisos, versiones, ejemplos impresos y cómo se generan. | Dueño, desarrollo |
| 10 | [Plan de implementación](10-plan-de-implementacion.md) | Estado de las iteraciones, puesta en marcha, pruebas, carga de los datos reales y decisiones tomadas. | Dueño, desarrollo |

### Cómo leerlo

- **Para entender el negocio en el sistema:** este índice → 04 §3 (los 12 pasos) → 08 §5.1 (el tablero) → 08 §5.8 y §5.10 (lista de compras y preparación) → 09 DOC-02 y DOC-03.
- **Para validar las reglas:** 07; cada regla tiene un número y los casos borde tienen ejemplo.
- **Para desarrollar:** 01 → 03 → 02 → 04 → 05 → 06 → 07 → 08 → 09 → 10, y `docs/tecnico/`.

---

## Vocabulario básico

| Término | Significado |
|---|---|
| Jornada | La fecha de entrega (el "día de trabajo"). Agrupa los pedidos, la lista de compras, las compras, la preparación y las entregas de ese día. |
| Unidad base | Unidad en la que se hacen todos los cálculos de un producto (kg, unidad, atado…). |
| Presentación | Cómo se compra o vende (cajón 18 kg, bolsa 25 kg, jaula 12 u) y cuántas unidades base contiene. |
| Recargo | El "porcentaje de ganancia": se suma sobre el costo. Precio = costo × (1 + recargo/100), redondeado. |
| Margen | (Precio − costo) ÷ precio. Se muestra en los reportes. |
| Precio congelado | El precio de venta queda fijo al emitir los documentos de la entrega; después no cambia. |
| Semáforo de crédito | Uso del límite con cada proveedor: VERDE < 70 %, AMARILLO 70 % a < 90 %, ROJO 90 % a 100 %, EXCEDIDO > 100 %. |

Identificadores usados en todo el plan: módulos **M01–M20** (01), permisos **`modulo.accion`** (02), reglas **RN-001–RN-152** (07), pantallas **P-01–P-96** (08), documentos **DOC-01–DOC-08** (09), riesgos **RT-xx** (01), decisiones **D-01–D-10** (10).

---

## Ejemplos numéricos

Los documentos 04 a 10 usan el mismo escenario: la jornada del jueves 24/09/2026 con Hospital San Martín, Restaurante La Esquina y Verdulería Don Pepe, y los proveedores A a E (04 §2). Los números se pueden seguir de un documento a otro y son la base de las pruebas de aceptación (10 §4). El documento 03 §19 usa un escenario propio más chico (Hospital Central, Puesto Don Carlos, Hortícola Los Hermanos) para mostrar cómo quedan las filas de cada tabla; no hay que combinar sus números con los de 04.

---

## Nombres canónicos

Cuando dos documentos nombran distinto lo mismo, vale:

- **Tablas, campos, enums y vistas:** `03-modelo-de-datos.md`.
- **Permisos:** el catálogo de `02-usuarios-roles-y-permisos.md` §4.
- **Estados:** los de `PARAMETROS-DEL-PROYECTO.md` §6.

En la revisión del 24/09/2026 se unificaron los nombres que diferían:

| Antes (en algún documento) | Nombre canónico |
|---|---|
| `jornadas.gestionar`, `jornadas.reabrir` | `jornada.gestionar` (avanzar a mano), `jornada.cerrar` (cerrar), `jornada.reabrir` |
| `pagos.ajustar_cuenta` | `pagos.ajustar` |
| `proveedores.editar_credito` | `proveedores.editar_limite` |
| Emitir documentos con `entregas.gestionar` | `entregas.emitir_documentos` (`entregas.gestionar` arma entregas y las pasa a `EN_REPARTO`) |
| `COSTO_REAL_JORNADA` | `REAL_JORNADA` (enum `origen_costo`) |
| Motivos `MAL_ESTADO`, `CALIBRE_O_CALIDAD`, etc. | Enum `motivo_diferencia`: `RECHAZO_CALIDAD`, `FALTANTE`, `NO_CONSEGUIDO`, `ERROR_PREPARACION`, `CAMBIO_CLIENTE`, `OTRO` |
| Imputaciones con `estado = 'VIGENTE'` y `movimiento_ajuste_id` | `activa` (booleano), `movimiento_acreedor_id` (ajuste de crédito) y `movimiento_deudor_id` (ajuste de débito) |
| Lista de compra "una fila por versión, una vigente" | Una fila por jornada que incrementa `version` |
| `entrega.documentos_version` | No existe: `entrega.version` = 0 sin documentos; la primera emisión la lleva a 1 (09 §4.2) |
| `empresa.dias_precio_desactualizado` | `empresa.dias_alerta_precio_desactualizado` |

---

## Decisiones

Todas tomadas (D-01 a D-10): están en `10-plan-de-implementacion.md` §6 y en `PARAMETROS-DEL-PROYECTO.md` §13.
