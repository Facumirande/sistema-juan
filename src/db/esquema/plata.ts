import { sql } from "drizzle-orm";
import { bigint, boolean, check, date, foreignKey, index, integer, pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { cliente } from "./clientes";
import { camposAnulacion, camposComunes, cantidad, monto } from "./comunes";
import { entrega } from "./entregas";
import { estadoRegistro, medioPago, tipoMovimientoExtra } from "./enums";

// La plata que no pasa por las compras a proveedores (07/10/2026): lo que pagan los clientes
// ("A cobrar") y los gastos e ingresos generales del negocio (nafta, arreglos, otros ingresos).

/**
 * Un cobro a un cliente. Con `entrega_id` paga primero esa entrega; lo que sobra (o un cobro sin
 * entrega) cancela lo más viejo que deba. No se borra: se anula con motivo.
 */
export const cobroCliente = pgTable(
  "cobro_cliente",
  {
    ...camposComunes(),
    ...camposAnulacion(),
    numero: bigint("numero", { mode: "number" }).notNull(),
    clienteId: uuid("cliente_id").notNull(),
    entregaId: uuid("entrega_id"),
    fecha: date("fecha").notNull(),
    monto: monto("monto").notNull(),
    medioPago: medioPago("medio_pago").notNull().default("EFECTIVO"),
    estado: estadoRegistro("estado").notNull().default("REGISTRADO"),
    observaciones: text("observaciones"),
  },
  (t) => [
    unique("cobro_cliente_empresa_id_id").on(t.empresaId, t.id),
    unique("cobro_cliente_empresa_numero").on(t.empresaId, t.numero),
    index("cobro_cliente_cliente_fecha").on(t.empresaId, t.clienteId, t.fecha),
    index("cobro_cliente_fecha").on(t.empresaId, t.fecha),
    foreignKey({ name: "cobro_cliente_cliente_fk", columns: [t.empresaId, t.clienteId], foreignColumns: [cliente.empresaId, cliente.id] }),
    foreignKey({ name: "cobro_cliente_entrega_fk", columns: [t.empresaId, t.entregaId], foreignColumns: [entrega.empresaId, entrega.id] }),
    check("cobro_cliente_monto", sql`${t.monto} > 0`),
    check("cobro_cliente_anulacion", sql`${t.estado} <> 'ANULADO' or char_length(trim(coalesce(${t.motivoAnulacion}, ''))) >= 3`),
  ],
);

/** Un rubro de gastos o de ingresos, con su dibujo y su título: se crean libremente (Nafta, Peajes, Arreglos…). */
export const rubroGasto = pgTable(
  "rubro_gasto",
  {
    ...camposComunes(),
    nombre: text("nombre").notNull(),
    dibujo: text("dibujo").notNull().default("🧾"),
    tipo: tipoMovimientoExtra("tipo").notNull().default("GASTO"),
    /** En qué se cuenta, si además del importe se anota una cantidad (litros, km, horas…). */
    unidad: text("unidad"),
    orden: integer("orden").notNull().default(0),
    activo: boolean("activo").notNull().default(true),
  },
  (t) => [
    unique("rubro_gasto_empresa_id_id").on(t.empresaId, t.id),
    uniqueIndex("rubro_gasto_nombre_unico").on(t.empresaId, t.tipo, sql`lower(${t.nombre})`),
    check("rubro_gasto_nombre_no_vacio", sql`char_length(trim(${t.nombre})) > 0`),
  ],
);

/** Un gasto o un ingreso general: cuánto, cuándo, de qué rubro y, si el rubro lo pide, qué cantidad. Se anula con motivo. */
export const movimientoExtra = pgTable(
  "movimiento_extra",
  {
    ...camposComunes(),
    ...camposAnulacion(),
    rubroId: uuid("rubro_id").notNull(),
    /** El del rubro al anotarlo: si después el rubro cambia, lo anotado no. */
    tipo: tipoMovimientoExtra("tipo").notNull(),
    fecha: date("fecha").notNull(),
    monto: monto("monto").notNull(),
    cantidad: cantidad("cantidad"),
    detalle: text("detalle"),
    medioPago: medioPago("medio_pago").notNull().default("EFECTIVO"),
    estado: estadoRegistro("estado").notNull().default("REGISTRADO"),
  },
  (t) => [
    unique("movimiento_extra_empresa_id_id").on(t.empresaId, t.id),
    index("movimiento_extra_fecha").on(t.empresaId, t.fecha),
    index("movimiento_extra_rubro").on(t.empresaId, t.rubroId, t.fecha),
    foreignKey({ name: "movimiento_extra_rubro_fk", columns: [t.empresaId, t.rubroId], foreignColumns: [rubroGasto.empresaId, rubroGasto.id] }),
    check("movimiento_extra_monto", sql`${t.monto} > 0`),
    check("movimiento_extra_cantidad", sql`${t.cantidad} is null or ${t.cantidad} > 0`),
    check("movimiento_extra_anulacion", sql`${t.estado} <> 'ANULADO' or char_length(trim(coalesce(${t.motivoAnulacion}, ''))) >= 3`),
  ],
);
