import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  smallint,
  text,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
  type PgTableExtraConfigValue,
} from "drizzle-orm/pg-core";

import { presentacion, producto } from "./catalogo";
import { camposAnulacion, camposComunes, cantidad, marcaDeTiempo, monto, precioUnitario } from "./comunes";
import {
  condicionPago,
  estadoCompra,
  estadoListaCompraItem,
  estadoRegistro,
  medioPago,
  modoImputacion,
  origenPago,
  tipoCompra,
  tipoMovimientoProveedor,
} from "./enums";
import { jornada } from "./pedidos";
import { proveedor, proveedorProducto } from "./proveedores";
import { usuario } from "./seguridad";

/** 03 §9.1 — una por jornada; se regenera (versión + 1) conservando lo comprado. */
export const listaCompra = pgTable(
  "lista_compra",
  {
    ...camposComunes(),
    numero: bigint("numero", { mode: "number" }).notNull(),
    jornadaId: uuid("jornada_id").notNull(),
    version: integer("version").notNull().default(1),
    desactualizada: boolean("desactualizada").notNull().default(false),
    generadaEn: marcaDeTiempo("generada_en").notNull().defaultNow(),
    generadaPor: uuid("generada_por").references((): AnyPgColumn => usuario.id),
    costoEstimadoTotal: monto("costo_estimado_total").notNull().default("0.00"),
    observaciones: text("observaciones"),
  },
  (t) => [
    unique("lista_compra_empresa_id_id").on(t.empresaId, t.id),
    unique("lista_compra_empresa_numero").on(t.empresaId, t.numero),
    unique("lista_compra_empresa_jornada").on(t.empresaId, t.jornadaId),
    foreignKey({ name: "lista_compra_jornada_fk", columns: [t.empresaId, t.jornadaId], foreignColumns: [jornada.empresaId, jornada.id] }),
  ],
);

/** 03 §9.2 — una línea por producto: cuánto se necesita, cuánto se compró, cuánto falta y a quién. */
export const listaCompraItem = pgTable(
  "lista_compra_item",
  {
    ...camposComunes(),
    listaCompraId: uuid("lista_compra_id").notNull(),
    productoId: uuid("producto_id").notNull(),
    necesidadBase: cantidad("necesidad_base").notNull(),
    sobranteDisponibleBase: cantidad("sobrante_disponible_base").notNull().default("0.000"),
    necesidadNetaBase: cantidad("necesidad_neta_base").notNull(),
    compradoBase: cantidad("comprado_base").notNull().default("0.000"),
    presentacionSugeridaId: uuid("presentacion_sugerida_id"),
    cantidadPresentaciones: cantidad("cantidad_presentaciones"),
    aComprarBase: cantidad("a_comprar_base"),
    sobrantePrevistoBase: cantidad("sobrante_previsto_base").notNull().default("0.000"),
    ajusteManual: boolean("ajuste_manual").notNull().default(false),
    motivoAjuste: text("motivo_ajuste"),
    proveedorSugeridoId: uuid("proveedor_sugerido_id"),
    proveedorProductoSugeridoId: uuid("proveedor_producto_sugerido_id"),
    asignacionManual: boolean("asignacion_manual").notNull().default(false),
    precioSugerido: precioUnitario("precio_sugerido"),
    costoEstimado: monto("costo_estimado"),
    estado: estadoListaCompraItem("estado").notNull().default("PENDIENTE"),
    motivoNoConseguido: text("motivo_no_conseguido"),
    sinPedido: boolean("sin_pedido").notNull().default(false),
    alertas: text("alertas").array().notNull().default(sql`'{}'::text[]`),
    compradorAsignadoId: uuid("comprador_asignado_id").references((): AnyPgColumn => usuario.id),
    necesidadModificada: boolean("necesidad_modificada").notNull().default(false),
    justificacion: text("justificacion"),
    observaciones: text("observaciones"),
  },
  (t) => [
    unique("lista_compra_item_empresa_id_id").on(t.empresaId, t.id),
    unique("lista_compra_item_producto").on(t.listaCompraId, t.productoId),
    index("lista_compra_item_estado").on(t.listaCompraId, t.estado),
    index("lista_compra_item_proveedor").on(t.proveedorSugeridoId),
    foreignKey({ name: "lista_compra_item_lista_fk", columns: [t.empresaId, t.listaCompraId], foreignColumns: [listaCompra.empresaId, listaCompra.id] }),
    foreignKey({ name: "lista_compra_item_producto_fk", columns: [t.empresaId, t.productoId], foreignColumns: [producto.empresaId, producto.id] }),
    foreignKey({
      name: "lista_compra_item_presentacion_fk",
      columns: [t.productoId, t.presentacionSugeridaId],
      foreignColumns: [presentacion.productoId, presentacion.id],
    }),
    foreignKey({ name: "lista_compra_item_proveedor_fk", columns: [t.empresaId, t.proveedorSugeridoId], foreignColumns: [proveedor.empresaId, proveedor.id] }),
    foreignKey({
      name: "lista_compra_item_oferta_fk",
      columns: [t.empresaId, t.proveedorProductoSugeridoId],
      foreignColumns: [proveedorProducto.empresaId, proveedorProducto.id],
    }),
    check("lista_compra_item_ajuste", sql`not ${t.ajusteManual} or char_length(trim(coalesce(${t.motivoAjuste}, ''))) >= 3`),
    check("lista_compra_item_no_conseguido", sql`${t.estado} <> 'NO_CONSEGUIDO' or char_length(trim(coalesce(${t.motivoNoConseguido}, ''))) >= 3`),
  ],
);

/** 03 §10.1 — compra a un proveedor: genera el cargo en su cuenta y, si se paga algo, el pago. */
export const compra = pgTable(
  "compra",
  {
    ...camposComunes(),
    ...camposAnulacion(),
    numero: bigint("numero", { mode: "number" }).notNull(),
    tipo: tipoCompra("tipo").notNull().default("MERCADERIA"),
    jornadaId: uuid("jornada_id"),
    proveedorId: uuid("proveedor_id").notNull(),
    fechaCompra: marcaDeTiempo("fecha_compra").notNull().defaultNow(),
    condicionPago: condicionPago("condicion_pago").notNull(),
    total: monto("total").notNull(),
    montoPagadoEnElActo: monto("monto_pagado_en_el_acto").notNull().default("0.00"),
    medioPagoEnElActo: medioPago("medio_pago_en_el_acto"),
    fechaVencimiento: date("fecha_vencimiento"),
    numeroComprobanteProveedor: text("numero_comprobante_proveedor"),
    fotoComprobantePath: text("foto_comprobante_path"),
    estado: estadoCompra("estado").notNull().default("REGISTRADA"),
    excedeLimite: boolean("excede_limite").notNull().default(false),
    motivoExcesoLimite: text("motivo_exceso_limite"),
    excesoAutorizadoPor: uuid("exceso_autorizado_por").references((): AnyPgColumn => usuario.id),
    excesoSinAutorizacion: boolean("exceso_sin_autorizacion").notNull().default(false),
    registradaSinConexion: boolean("registrada_sin_conexion").notNull().default(false),
    observaciones: text("observaciones"),
    claveIdempotencia: uuid("clave_idempotencia"),
  },
  (t): PgTableExtraConfigValue[] => [
    unique("compra_empresa_id_id").on(t.empresaId, t.id),
    unique("compra_empresa_numero").on(t.empresaId, t.numero),
    uniqueIndex("compra_clave_idempotencia").on(t.claveIdempotencia).where(sql`${t.claveIdempotencia} is not null`),
    index("compra_jornada").on(t.empresaId, t.jornadaId),
    index("compra_proveedor_fecha").on(t.empresaId, t.proveedorId, t.fechaCompra.desc()),
    index("compra_vencimiento").on(t.empresaId, t.proveedorId, t.fechaVencimiento).where(sql`${t.estado} = 'REGISTRADA'`),
    foreignKey({ name: "compra_jornada_fk", columns: [t.empresaId, t.jornadaId], foreignColumns: [jornada.empresaId, jornada.id] }),
    foreignKey({ name: "compra_proveedor_fk", columns: [t.empresaId, t.proveedorId], foreignColumns: [proveedor.empresaId, proveedor.id] }),
    check("compra_jornada_mercaderia", sql`${t.tipo} <> 'MERCADERIA' or ${t.jornadaId} is not null`),
    check("compra_total", sql`${t.total} >= 0`),
    check(
      "compra_pago_en_el_acto",
      sql`(${t.condicionPago} = 'CONTADO' and ${t.montoPagadoEnElActo} = ${t.total})
       or (${t.condicionPago} = 'CREDITO' and ${t.montoPagadoEnElActo} = 0)
       or (${t.condicionPago} = 'MIXTA' and ${t.montoPagadoEnElActo} > 0 and ${t.montoPagadoEnElActo} < ${t.total})`,
    ),
    check("compra_medio_pago", sql`${t.montoPagadoEnElActo} = 0 or ${t.medioPagoEnElActo} is not null`),
    check("compra_exceso", sql`not ${t.excedeLimite} or ${t.excesoSinAutorizacion} or char_length(trim(coalesce(${t.motivoExcesoLimite}, ''))) >= 5`),
    check("compra_anulacion", sql`${t.estado} <> 'ANULADA' or char_length(trim(coalesce(${t.motivoAnulacion}, ''))) >= 5`),
  ],
);

/** 03 §10.2 */
export const compraItem = pgTable(
  "compra_item",
  {
    ...camposComunes(),
    compraId: uuid("compra_id").notNull(),
    linea: smallint("linea").notNull(),
    productoId: uuid("producto_id").notNull(),
    presentacionId: uuid("presentacion_id").notNull(),
    factorABase: cantidad("factor_a_base").notNull(),
    cantidad: cantidad("cantidad").notNull(),
    cantidadBase: cantidad("cantidad_base").notNull(),
    /** Precio pagado por presentación (0 = bonificación). */
    precioUnitario: precioUnitario("precio_unitario").notNull(),
    costoBase: precioUnitario("costo_base").notNull(),
    subtotal: monto("subtotal").notNull(),
    listaCompraItemId: uuid("lista_compra_item_id"),
    sinPedido: boolean("sin_pedido").notNull().default(false),
    proveedorProductoId: uuid("proveedor_producto_id"),
    actualizoPrecioLista: boolean("actualizo_precio_lista").notNull().default(false),
    observaciones: text("observaciones"),
  },
  (t) => [
    unique("compra_item_empresa_id_id").on(t.empresaId, t.id),
    unique("compra_item_linea").on(t.compraId, t.linea),
    index("compra_item_producto").on(t.empresaId, t.productoId),
    index("compra_item_lista").on(t.listaCompraItemId),
    index("compra_item_presentacion").on(t.presentacionId),
    foreignKey({ name: "compra_item_compra_fk", columns: [t.empresaId, t.compraId], foreignColumns: [compra.empresaId, compra.id] }),
    foreignKey({ name: "compra_item_producto_fk", columns: [t.empresaId, t.productoId], foreignColumns: [producto.empresaId, producto.id] }),
    foreignKey({ name: "compra_item_presentacion_fk", columns: [t.productoId, t.presentacionId], foreignColumns: [presentacion.productoId, presentacion.id] }),
    foreignKey({ name: "compra_item_lista_fk", columns: [t.empresaId, t.listaCompraItemId], foreignColumns: [listaCompraItem.empresaId, listaCompraItem.id] }),
    foreignKey({ name: "compra_item_oferta_fk", columns: [t.empresaId, t.proveedorProductoId], foreignColumns: [proveedorProducto.empresaId, proveedorProducto.id] }),
    check("compra_item_cantidades", sql`${t.cantidad} > 0 and ${t.cantidadBase} > 0 and ${t.factorABase} > 0`),
    check("compra_item_importes", sql`${t.precioUnitario} >= 0 and ${t.costoBase} >= 0 and ${t.subtotal} >= 0`),
  ],
);

/** 03 §10.3 */
export const pagoProveedor = pgTable(
  "pago_proveedor",
  {
    ...camposComunes(),
    ...camposAnulacion(),
    numero: bigint("numero", { mode: "number" }).notNull(),
    proveedorId: uuid("proveedor_id").notNull(),
    fechaPago: marcaDeTiempo("fecha_pago").notNull().defaultNow(),
    monto: monto("monto").notNull(),
    medioPago: medioPago("medio_pago").notNull(),
    referencia: text("referencia"),
    chequeBanco: text("cheque_banco"),
    chequeFechaCobro: date("cheque_fecha_cobro"),
    origen: origenPago("origen").notNull().default("POSTERIOR"),
    compraId: uuid("compra_id"),
    modoImputacion: modoImputacion("modo_imputacion").notNull().default("FIFO"),
    comprobantePath: text("comprobante_path"),
    estado: estadoRegistro("estado").notNull().default("REGISTRADO"),
    observaciones: text("observaciones"),
    claveIdempotencia: uuid("clave_idempotencia"),
  },
  (t) => [
    unique("pago_proveedor_empresa_id_id").on(t.empresaId, t.id),
    unique("pago_proveedor_empresa_numero").on(t.empresaId, t.numero),
    uniqueIndex("pago_proveedor_clave_idempotencia").on(t.claveIdempotencia).where(sql`${t.claveIdempotencia} is not null`),
    index("pago_proveedor_proveedor_fecha").on(t.empresaId, t.proveedorId, t.fechaPago.desc()),
    index("pago_proveedor_compra").on(t.compraId),
    foreignKey({ name: "pago_proveedor_proveedor_fk", columns: [t.empresaId, t.proveedorId], foreignColumns: [proveedor.empresaId, proveedor.id] }),
    foreignKey({ name: "pago_proveedor_compra_fk", columns: [t.empresaId, t.compraId], foreignColumns: [compra.empresaId, compra.id] }),
    check("pago_proveedor_monto", sql`${t.monto} > 0`),
    check("pago_proveedor_en_compra", sql`${t.origen} <> 'EN_COMPRA' or ${t.compraId} is not null`),
    check("pago_proveedor_anulacion", sql`${t.estado} <> 'ANULADO' or char_length(trim(coalesce(${t.motivoAnulacion}, ''))) >= 5`),
  ],
);

/** 03 §10.5 — libro de la cuenta corriente: inmutable, los errores se compensan (RN-092). */
export const movimientoCuentaProveedor = pgTable(
  "movimiento_cuenta_proveedor",
  {
    ...camposComunes(),
    proveedorId: uuid("proveedor_id").notNull(),
    fecha: marcaDeTiempo("fecha").notNull().defaultNow(),
    tipo: tipoMovimientoProveedor("tipo").notNull(),
    /** Con signo: + aumenta la deuda, − la baja. */
    importe: monto("importe").notNull(),
    compraId: uuid("compra_id"),
    pagoProveedorId: uuid("pago_proveedor_id"),
    movimientoCompensadoId: uuid("movimiento_compensado_id"),
    fechaVencimiento: date("fecha_vencimiento"),
    fechaOrigen: date("fecha_origen"),
    descripcion: text("descripcion").notNull(),
    motivo: text("motivo"),
  },
  (t): PgTableExtraConfigValue[] => [
    unique("movimiento_cuenta_proveedor_empresa_id_id").on(t.empresaId, t.id),
    uniqueIndex("movimiento_cuenta_proveedor_compensado").on(t.movimientoCompensadoId).where(sql`${t.movimientoCompensadoId} is not null`),
    index("movimiento_cuenta_proveedor_fecha").on(t.proveedorId, t.fecha),
    index("movimiento_cuenta_proveedor_compra").on(t.compraId),
    index("movimiento_cuenta_proveedor_pago").on(t.pagoProveedorId),
    foreignKey({ name: "movimiento_proveedor_fk", columns: [t.empresaId, t.proveedorId], foreignColumns: [proveedor.empresaId, proveedor.id] }),
    foreignKey({ name: "movimiento_compra_fk", columns: [t.empresaId, t.compraId], foreignColumns: [compra.empresaId, compra.id] }),
    foreignKey({ name: "movimiento_pago_fk", columns: [t.empresaId, t.pagoProveedorId], foreignColumns: [pagoProveedor.empresaId, pagoProveedor.id] }),
    foreignKey({
      name: "movimiento_compensado_fk",
      columns: [t.empresaId, t.movimientoCompensadoId],
      foreignColumns: [movimientoCuentaProveedor.empresaId, movimientoCuentaProveedor.id],
    }),
    check(
      "movimiento_signo",
      sql`(${t.tipo} in ('SALDO_INICIAL', 'CARGO_COMPRA', 'ANULACION_PAGO', 'AJUSTE_DEBITO') and ${t.importe} > 0)
       or (${t.tipo} in ('PAGO', 'ANULACION_COMPRA', 'AJUSTE_CREDITO') and ${t.importe} < 0)`,
    ),
    check("movimiento_compra", sql`${t.tipo} not in ('SALDO_INICIAL', 'CARGO_COMPRA', 'ANULACION_COMPRA') or ${t.compraId} is not null`),
    check("movimiento_pago", sql`${t.tipo} not in ('PAGO', 'ANULACION_PAGO') or ${t.pagoProveedorId} is not null`),
    check(
      "movimiento_motivo",
      sql`${t.tipo} not in ('AJUSTE_DEBITO', 'AJUSTE_CREDITO', 'ANULACION_COMPRA', 'ANULACION_PAGO') or char_length(trim(coalesce(${t.motivo}, ''))) >= 5`,
    ),
  ],
);

/** 03 §10.4 — qué parte de cada pago (o crédito) cancela qué compra (o débito). */
export const imputacionPagoProveedor = pgTable(
  "imputacion_pago_proveedor",
  {
    ...camposComunes(),
    proveedorId: uuid("proveedor_id").notNull(),
    pagoProveedorId: uuid("pago_proveedor_id"),
    movimientoAcreedorId: uuid("movimiento_acreedor_id"),
    compraId: uuid("compra_id"),
    movimientoDeudorId: uuid("movimiento_deudor_id"),
    monto: monto("monto").notNull(),
    modo: modoImputacion("modo").notNull().default("FIFO"),
    activa: boolean("activa").notNull().default(true),
    desactivadaEn: marcaDeTiempo("desactivada_en"),
    motivoDesactivacion: text("motivo_desactivacion"),
  },
  (t) => [
    unique("imputacion_pago_proveedor_empresa_id_id").on(t.empresaId, t.id),
    uniqueIndex("imputacion_pago_proveedor_unica")
      .on(sql`coalesce(${t.pagoProveedorId}, ${t.movimientoAcreedorId})`, sql`coalesce(${t.compraId}, ${t.movimientoDeudorId})`)
      .where(sql`${t.activa}`),
    index("imputacion_compra").on(t.compraId).where(sql`${t.activa}`),
    index("imputacion_pago").on(t.pagoProveedorId).where(sql`${t.activa}`),
    index("imputacion_deudor").on(t.movimientoDeudorId).where(sql`${t.activa}`),
    index("imputacion_acreedor").on(t.movimientoAcreedorId).where(sql`${t.activa}`),
    foreignKey({ name: "imputacion_proveedor_fk", columns: [t.empresaId, t.proveedorId], foreignColumns: [proveedor.empresaId, proveedor.id] }),
    foreignKey({ name: "imputacion_pago_fk", columns: [t.empresaId, t.pagoProveedorId], foreignColumns: [pagoProveedor.empresaId, pagoProveedor.id] }),
    foreignKey({ name: "imputacion_compra_fk", columns: [t.empresaId, t.compraId], foreignColumns: [compra.empresaId, compra.id] }),
    foreignKey({
      name: "imputacion_acreedor_fk",
      columns: [t.empresaId, t.movimientoAcreedorId],
      foreignColumns: [movimientoCuentaProveedor.empresaId, movimientoCuentaProveedor.id],
    }),
    foreignKey({
      name: "imputacion_deudor_fk",
      columns: [t.empresaId, t.movimientoDeudorId],
      foreignColumns: [movimientoCuentaProveedor.empresaId, movimientoCuentaProveedor.id],
    }),
    check("imputacion_acreedor_unico", sql`num_nonnulls(${t.pagoProveedorId}, ${t.movimientoAcreedorId}) = 1`),
    check("imputacion_deudor_unico", sql`num_nonnulls(${t.compraId}, ${t.movimientoDeudorId}) = 1`),
    check("imputacion_monto", sql`${t.monto} > 0`),
    check("imputacion_desactivacion", sql`${t.activa} or char_length(trim(coalesce(${t.motivoDesactivacion}, ''))) >= 5`),
  ],
);
