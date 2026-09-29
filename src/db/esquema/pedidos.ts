import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  jsonb,
  pgTable,
  smallint,
  text,
  time,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import { categoria, presentacion, producto } from "./catalogo";
import { cliente, puntoEntrega } from "./clientes";
import { camposComunes, cantidad, marcaDeTiempo, monto, porcentaje, precioUnitario } from "./comunes";
import { canalPedido, estadoJornada, estadoPedido, origenCosto, origenPrecioVenta, prioridadPedido, tipoReglaPrecio } from "./enums";
import { usuario } from "./seguridad";

/**
 * 03 §7.3 — condiciones de precio pactadas con un cliente (niveles 1 a 3). La no superposición
 * de vigencias (RN-079) la garantizan dos restricciones de exclusión (migración 0006).
 */
export const reglaPrecio = pgTable(
  "regla_precio",
  {
    ...camposComunes(),
    clienteId: uuid("cliente_id").notNull(),
    productoId: uuid("producto_id"),
    categoriaId: uuid("categoria_id"),
    tipo: tipoReglaPrecio("tipo").notNull(),
    /** RECARGO: % sobre el costo. PRECIO_FIJO: precio por unidad base. */
    valor: precioUnitario("valor").notNull(),
    vigenteDesde: date("vigente_desde").notNull().default(sql`current_date`),
    /** Nulo = sin vencimiento. */
    vigenteHasta: date("vigente_hasta"),
    referencia: text("referencia"),
    observaciones: text("observaciones"),
    activo: boolean("activo").notNull().default(true),
  },
  (t) => [
    unique("regla_precio_empresa_id_id").on(t.empresaId, t.id),
    index("regla_precio_cliente").on(t.empresaId, t.clienteId).where(sql`${t.activo}`),
    index("regla_precio_producto").on(t.productoId),
    index("regla_precio_categoria").on(t.categoriaId),
    foreignKey({ name: "regla_precio_cliente_fk", columns: [t.empresaId, t.clienteId], foreignColumns: [cliente.empresaId, cliente.id] }),
    foreignKey({ name: "regla_precio_producto_fk", columns: [t.empresaId, t.productoId], foreignColumns: [producto.empresaId, producto.id] }),
    foreignKey({ name: "regla_precio_categoria_fk", columns: [t.empresaId, t.categoriaId], foreignColumns: [categoria.empresaId, categoria.id] }),
    check("regla_precio_un_solo_objetivo", sql`num_nonnulls(${t.productoId}, ${t.categoriaId}) = 1`),
    check("regla_precio_fijo_por_producto", sql`${t.tipo} <> 'PRECIO_FIJO' or ${t.productoId} is not null`),
    check("regla_precio_valor", sql`(${t.tipo} = 'RECARGO' and ${t.valor} > -100) or (${t.tipo} = 'PRECIO_FIJO' and ${t.valor} >= 0)`),
    check("regla_precio_vigencia", sql`${t.vigenteHasta} is null or ${t.vigenteHasta} >= ${t.vigenteDesde}`),
  ],
);

/** 03 §8.1 — fecha operativa (= fecha de entrega) que agrupa todo lo del día. */
export const jornada = pgTable(
  "jornada",
  {
    ...camposComunes(),
    fecha: date("fecha").notNull(),
    estado: estadoJornada("estado").notNull().default("ABIERTA"),
    compraIniciadaEn: marcaDeTiempo("compra_iniciada_en"),
    preparacionIniciadaEn: marcaDeTiempo("preparacion_iniciada_en"),
    repartoIniciadoEn: marcaDeTiempo("reparto_iniciado_en"),
    cerradaEn: marcaDeTiempo("cerrada_en"),
    cerradaPor: uuid("cerrada_por").references((): AnyPgColumn => usuario.id),
    resumen: jsonb("resumen").$type<Record<string, unknown>>(),
    observaciones: text("observaciones"),
  },
  (t) => [unique("jornada_empresa_id_id").on(t.empresaId, t.id), unique("jornada_empresa_fecha").on(t.empresaId, t.fecha)],
);

/** 03 §8.2 */
export const pedido = pgTable(
  "pedido",
  {
    ...camposComunes(),
    numero: bigint("numero", { mode: "number" }).notNull(),
    jornadaId: uuid("jornada_id").notNull(),
    clienteId: uuid("cliente_id").notNull(),
    puntoEntregaId: uuid("punto_entrega_id").notNull(),
    fechaPedido: marcaDeTiempo("fecha_pedido").notNull().defaultNow(),
    canal: canalPedido("canal"),
    referenciaCliente: text("referencia_cliente"),
    estado: estadoPedido("estado").notNull().default("BORRADOR"),
    /** Tablero: qué pedido va primero. Con faltantes, ALTA se abastece antes (RN-115 ampliada). */
    prioridad: prioridadPedido("prioridad").notNull().default("NORMAL"),
    /** Tablero: quién se encarga del pedido (el "miembro" de la tarjeta). Nulo = quien lo cargó. */
    responsableId: uuid("responsable_id"),
    esTardio: boolean("es_tardio").notNull().default(false),
    entregaDesde: time("entrega_desde"),
    entregaHasta: time("entrega_hasta"),
    observaciones: text("observaciones"),
    observacionesInternas: text("observaciones_internas"),
    totalEstimado: monto("total_estimado").notNull().default("0.00"),
    confirmadoEn: marcaDeTiempo("confirmado_en"),
    confirmadoPor: uuid("confirmado_por").references((): AnyPgColumn => usuario.id),
    canceladoEn: marcaDeTiempo("cancelado_en"),
    canceladoPor: uuid("cancelado_por").references((): AnyPgColumn => usuario.id),
    motivoCancelacion: text("motivo_cancelacion"),
    claveIdempotencia: uuid("clave_idempotencia"),
  },
  (t) => [
    unique("pedido_empresa_id_id").on(t.empresaId, t.id),
    unique("pedido_empresa_numero").on(t.empresaId, t.numero),
    uniqueIndex("pedido_clave_idempotencia").on(t.claveIdempotencia).where(sql`${t.claveIdempotencia} is not null`),
    index("pedido_jornada_estado").on(t.empresaId, t.jornadaId, t.estado),
    index("pedido_cliente_fecha").on(t.empresaId, t.clienteId, t.fechaPedido.desc()),
    foreignKey({ name: "pedido_jornada_fk", columns: [t.empresaId, t.jornadaId], foreignColumns: [jornada.empresaId, jornada.id] }),
    foreignKey({ name: "pedido_responsable_fk", columns: [t.empresaId, t.responsableId], foreignColumns: [usuario.empresaId, usuario.id] }),
    foreignKey({ name: "pedido_cliente_fk", columns: [t.empresaId, t.clienteId], foreignColumns: [cliente.empresaId, cliente.id] }),
    foreignKey({
      name: "pedido_punto_entrega_fk",
      columns: [t.empresaId, t.clienteId, t.puntoEntregaId],
      foreignColumns: [puntoEntrega.empresaId, puntoEntrega.clienteId, puntoEntrega.id],
    }),
    check("pedido_total_estimado", sql`${t.totalEstimado} >= 0`),
  ],
);

/** 03 §8.3 — cada línea guarda lo que pidió el cliente y el precio estimado (se congela al emitir documentos). */
export const pedidoItem = pgTable(
  "pedido_item",
  {
    ...camposComunes(),
    pedidoId: uuid("pedido_id").notNull(),
    linea: smallint("linea").notNull(),
    productoId: uuid("producto_id").notNull(),
    /** Nulo = cantidad en unidad base. */
    presentacionId: uuid("presentacion_id"),
    cantidad: cantidad("cantidad").notNull(),
    cantidadBase: cantidad("cantidad_base").notNull(),
    costoEstimado: precioUnitario("costo_estimado"),
    origenCostoEstimado: origenCosto("origen_costo_estimado"),
    recargoEstimado: porcentaje("recargo_estimado"),
    origenReglaEstimada: origenPrecioVenta("origen_regla_estimada"),
    reglaPrecioId: uuid("regla_precio_id"),
    /** Por unidad base, neto de IVA. Nulo si no hay costo ni precio fijo (SIN_PRECIO). */
    precioEstimado: precioUnitario("precio_estimado"),
    subtotalEstimado: monto("subtotal_estimado"),
    alertas: text("alertas").array().notNull().default(sql`'{}'::text[]`),
    precioManual: precioUnitario("precio_manual"),
    motivoPrecioManual: text("motivo_precio_manual"),
    precioCalculadoEn: marcaDeTiempo("precio_calculado_en"),
    observaciones: text("observaciones"),
    cancelado: boolean("cancelado").notNull().default(false),
    motivoCancelacion: text("motivo_cancelacion"),
  },
  (t) => [
    unique("pedido_item_empresa_id_id").on(t.empresaId, t.id),
    unique("pedido_item_linea").on(t.pedidoId, t.linea),
    index("pedido_item_producto").on(t.empresaId, t.productoId),
    index("pedido_item_presentacion").on(t.presentacionId),
    index("pedido_item_regla").on(t.reglaPrecioId),
    foreignKey({ name: "pedido_item_pedido_fk", columns: [t.empresaId, t.pedidoId], foreignColumns: [pedido.empresaId, pedido.id] }),
    foreignKey({ name: "pedido_item_producto_fk", columns: [t.empresaId, t.productoId], foreignColumns: [producto.empresaId, producto.id] }),
    foreignKey({
      name: "pedido_item_presentacion_fk",
      columns: [t.productoId, t.presentacionId],
      foreignColumns: [presentacion.productoId, presentacion.id],
    }),
    foreignKey({ name: "pedido_item_regla_fk", columns: [t.empresaId, t.reglaPrecioId], foreignColumns: [reglaPrecio.empresaId, reglaPrecio.id] }),
    check("pedido_item_cantidades", sql`${t.cantidad} > 0 and ${t.cantidadBase} > 0`),
    check("pedido_item_precio_manual", sql`${t.precioManual} is null or char_length(trim(coalesce(${t.motivoPrecioManual}, ''))) >= 5`),
    check("pedido_item_cancelacion", sql`not ${t.cancelado} or char_length(trim(coalesce(${t.motivoCancelacion}, ''))) >= 5`),
  ],
);
