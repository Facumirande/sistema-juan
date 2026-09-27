import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
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
import { cliente, puntoEntrega } from "./clientes";
import { camposAnulacion, camposComunes, cantidad, marcaDeTiempo, monto, porcentaje, precioUnitario } from "./comunes";
import {
  estadoDocumento,
  estadoEntrega,
  estadoFacturacion,
  estadoReparto,
  eventoDocumento,
  motivoDiferencia,
  origenCosto,
  origenPrecioVenta,
  tipoDocumento,
  unidadMedida,
} from "./enums";
import { jornada, pedidoItem, reglaPrecio } from "./pedidos";
import { usuario } from "./seguridad";

/** 03 §11.1 — hoja de ruta: jornada + repartidor + vehículo. */
export const reparto = pgTable(
  "reparto",
  {
    ...camposComunes(),
    ...camposAnulacion(),
    numero: bigint("numero", { mode: "number" }).notNull(),
    jornadaId: uuid("jornada_id").notNull(),
    repartidorId: uuid("repartidor_id").references((): AnyPgColumn => usuario.id),
    vehiculo: text("vehiculo"),
    estado: estadoReparto("estado").notNull().default("PLANIFICADO"),
    salidaPrevistaEn: marcaDeTiempo("salida_prevista_en"),
    salidaEn: marcaDeTiempo("salida_en"),
    regresoEn: marcaDeTiempo("regreso_en"),
    observaciones: text("observaciones"),
  },
  (t) => [
    unique("reparto_empresa_id_id").on(t.empresaId, t.id),
    unique("reparto_empresa_jornada_id").on(t.empresaId, t.jornadaId, t.id),
    unique("reparto_empresa_numero").on(t.empresaId, t.numero),
    index("reparto_jornada").on(t.empresaId, t.jornadaId),
    index("reparto_repartidor").on(t.repartidorId),
    foreignKey({ name: "reparto_jornada_fk", columns: [t.empresaId, t.jornadaId], foreignColumns: [jornada.empresaId, jornada.id] }),
    check("reparto_anulacion", sql`${t.estado} <> 'ANULADO' or char_length(trim(coalesce(${t.motivoAnulacion}, ''))) >= 5`),
  ],
);

/**
 * 03 §11.2 — la mercadería de un cliente y punto de entrega en una jornada. De la misma entrega y
 * versión salen DOC-02 y DOC-03 (RN-120).
 */
export const entrega = pgTable(
  "entrega",
  {
    ...camposComunes(),
    ...camposAnulacion(),
    numero: bigint("numero", { mode: "number" }).notNull(),
    jornadaId: uuid("jornada_id").notNull(),
    clienteId: uuid("cliente_id").notNull(),
    puntoEntregaId: uuid("punto_entrega_id").notNull(),
    repartoId: uuid("reparto_id"),
    ordenEnReparto: smallint("orden_en_reparto"),
    estado: estadoEntrega("estado").notNull().default("BORRADOR"),
    conDiferencias: boolean("con_diferencias").notNull().default(false),
    estadoFacturacion: estadoFacturacion("estado_facturacion").notNull().default("SIN_FACTURAR"),
    /** 0 = sin documentos; la primera emisión la lleva a 1 y cada cambio posterior la incrementa (RN-128). */
    version: integer("version").notNull().default(0),
    preciosCongeladosEn: marcaDeTiempo("precios_congelados_en"),
    cantidadBultos: smallint("cantidad_bultos"),
    referenciaCliente: text("referencia_cliente"),
    observaciones: text("observaciones"),
    clienteNombre: text("cliente_nombre"),
    clienteRazonSocial: text("cliente_razon_social"),
    clienteIdentificacionFiscal: text("cliente_identificacion_fiscal"),
    puntoEntregaNombre: text("punto_entrega_nombre"),
    direccionEntrega: text("direccion_entrega"),
    importeNeto: monto("importe_neto").notNull().default("0.00"),
    importeIva: monto("importe_iva").notNull().default("0.00"),
    importeTotal: monto("importe_total").notNull().default("0.00"),
    costoTotal: monto("costo_total").notNull().default("0.00"),
    recibidoPor: text("recibido_por"),
    recibidoCargo: text("recibido_cargo"),
    recibidoEn: marcaDeTiempo("recibido_en"),
    firmaPath: text("firma_path"),
    fotoRemitoPath: text("foto_remito_path"),
    observacionesRecepcion: text("observaciones_recepcion"),
    confirmadaPor: uuid("confirmada_por").references((): AnyPgColumn => usuario.id),
  },
  (t): PgTableExtraConfigValue[] => [
    unique("entrega_empresa_id_id").on(t.empresaId, t.id),
    unique("entrega_empresa_numero").on(t.empresaId, t.numero),
    index("entrega_jornada_estado").on(t.empresaId, t.jornadaId, t.estado),
    index("entrega_reparto").on(t.repartoId),
    index("entrega_cliente").on(t.empresaId, t.clienteId),
    // Una entrega vigente por cliente, punto y jornada (RN-111).
    uniqueIndex("entrega_cliente_punto_jornada").on(t.empresaId, t.jornadaId, t.clienteId, t.puntoEntregaId).where(sql`${t.estado} <> 'ANULADA'`),
    foreignKey({ name: "entrega_jornada_fk", columns: [t.empresaId, t.jornadaId], foreignColumns: [jornada.empresaId, jornada.id] }),
    foreignKey({ name: "entrega_cliente_fk", columns: [t.empresaId, t.clienteId], foreignColumns: [cliente.empresaId, cliente.id] }),
    foreignKey({
      name: "entrega_punto_entrega_fk",
      columns: [t.empresaId, t.clienteId, t.puntoEntregaId],
      foreignColumns: [puntoEntrega.empresaId, puntoEntrega.clienteId, puntoEntrega.id],
    }),
    // El reparto es de la misma jornada (RN-123).
    foreignKey({ name: "entrega_reparto_fk", columns: [t.empresaId, t.jornadaId, t.repartoId], foreignColumns: [reparto.empresaId, reparto.jornadaId, reparto.id] }),
    check("entrega_version", sql`${t.version} >= 0`),
    check("entrega_bultos", sql`${t.cantidadBultos} is null or ${t.cantidadBultos} >= 0`),
    check("entrega_importes", sql`${t.importeNeto} >= 0 and ${t.importeIva} >= 0 and ${t.importeTotal} >= 0 and ${t.costoTotal} >= 0`),
    check("entrega_recepcion", sql`${t.estado} <> 'ENTREGADA' or char_length(trim(coalesce(${t.recibidoPor}, ''))) > 0`),
    check("entrega_anulacion", sql`${t.estado} <> 'ANULADA' or char_length(trim(coalesce(${t.motivoAnulacion}, ''))) >= 5`),
  ],
);

/**
 * 03 §11.3 — línea de la entrega, en unidad base. Los campos de precio son el snapshot congelado
 * al emitir los documentos (RN-089).
 */
export const entregaItem = pgTable(
  "entrega_item",
  {
    ...camposComunes(),
    entregaId: uuid("entrega_id").notNull(),
    linea: smallint("linea").notNull(),
    pedidoItemId: uuid("pedido_item_id"),
    productoId: uuid("producto_id").notNull(),
    esSustitucion: boolean("es_sustitucion").notNull().default(false),
    sustituyeProductoId: uuid("sustituye_producto_id"),
    sustitucionAutorizadaPor: text("sustitucion_autorizada_por"),
    presentacionId: uuid("presentacion_id"),
    factorABase: cantidad("factor_a_base"),
    productoNombre: text("producto_nombre").notNull(),
    unidadBase: unidadMedida("unidad_base").notNull(),
    cantidadPedida: cantidad("cantidad_pedida").notNull(),
    cantidadPropuesta: cantidad("cantidad_propuesta"),
    cantidadPreparada: cantidad("cantidad_preparada"),
    motivoFaltante: motivoDiferencia("motivo_faltante"),
    cantidadEntregada: cantidad("cantidad_entregada"),
    motivoDiferencia: motivoDiferencia("motivo_diferencia"),
    detalleDiferencia: text("detalle_diferencia"),
    costoUnitario: precioUnitario("costo_unitario"),
    origenCosto: origenCosto("origen_costo"),
    recargoAplicado: porcentaje("recargo_aplicado"),
    origenRegla: origenPrecioVenta("origen_regla"),
    reglaPrecioId: uuid("regla_precio_id"),
    precioUnitario: precioUnitario("precio_unitario"),
    alicuotaIva: porcentaje("alicuota_iva"),
    esOverride: boolean("es_override").notNull().default(false),
    motivoOverride: text("motivo_override"),
    importe: monto("importe"),
    alertas: text("alertas").array().notNull().default(sql`'{}'::text[]`),
    observaciones: text("observaciones"),
  },
  (t) => [
    unique("entrega_item_empresa_id_id").on(t.empresaId, t.id),
    unique("entrega_item_linea").on(t.entregaId, t.linea),
    index("entrega_item_pedido_item").on(t.pedidoItemId),
    index("entrega_item_producto").on(t.empresaId, t.productoId),
    index("entrega_item_presentacion").on(t.presentacionId),
    index("entrega_item_regla").on(t.reglaPrecioId),
    foreignKey({ name: "entrega_item_entrega_fk", columns: [t.empresaId, t.entregaId], foreignColumns: [entrega.empresaId, entrega.id] }),
    foreignKey({ name: "entrega_item_pedido_item_fk", columns: [t.empresaId, t.pedidoItemId], foreignColumns: [pedidoItem.empresaId, pedidoItem.id] }),
    foreignKey({ name: "entrega_item_producto_fk", columns: [t.empresaId, t.productoId], foreignColumns: [producto.empresaId, producto.id] }),
    foreignKey({ name: "entrega_item_sustituye_fk", columns: [t.empresaId, t.sustituyeProductoId], foreignColumns: [producto.empresaId, producto.id] }),
    foreignKey({ name: "entrega_item_presentacion_fk", columns: [t.presentacionId], foreignColumns: [presentacion.id] }),
    foreignKey({ name: "entrega_item_regla_fk", columns: [t.empresaId, t.reglaPrecioId], foreignColumns: [reglaPrecio.empresaId, reglaPrecio.id] }),
    check(
      "entrega_item_cantidades",
      sql`${t.cantidadPedida} >= 0 and coalesce(${t.cantidadPropuesta}, 0) >= 0 and coalesce(${t.cantidadPreparada}, 0) >= 0 and coalesce(${t.cantidadEntregada}, 0) >= 0`,
    ),
    // Nunca se entrega más de lo preparado (RN-126).
    check("entrega_item_entregada", sql`${t.cantidadEntregada} is null or ${t.cantidadEntregada} <= coalesce(${t.cantidadPreparada}, 0)`),
    check("entrega_item_sustitucion", sql`not ${t.esSustitucion} or ${t.sustituyeProductoId} is not null`),
    check("entrega_item_diferencia_otro", sql`${t.motivoDiferencia} is distinct from 'OTRO' or char_length(trim(coalesce(${t.detalleDiferencia}, ''))) > 0`),
    check("entrega_item_override", sql`not ${t.esOverride} or char_length(trim(coalesce(${t.motivoOverride}, ''))) >= 5`),
    check("entrega_item_importes", sql`coalesce(${t.precioUnitario}, 0) >= 0 and coalesce(${t.importe}, 0) >= 0`),
  ],
);

/** 03 §11.4 — cada emisión o reimpresión de un documento, con el contenido exacto que se imprimió. */
export const documentoEmitido = pgTable(
  "documento_emitido",
  {
    ...camposComunes(),
    ...camposAnulacion(),
    tipo: tipoDocumento("tipo").notNull(),
    entidad: text("entidad").notNull(),
    entidadId: uuid("entidad_id").notNull(),
    entregaId: uuid("entrega_id"),
    version: integer("version").notNull().default(1),
    evento: eventoDocumento("evento").notNull().default("EMISION"),
    numeroVisible: text("numero_visible").notNull(),
    estado: estadoDocumento("estado").notNull().default("VIGENTE"),
    emitidoEn: marcaDeTiempo("emitido_en").notNull().defaultNow(),
    emitidoPor: uuid("emitido_por").references((): AnyPgColumn => usuario.id),
    pdfPath: text("pdf_path"),
    pdfSha256: text("pdf_sha256"),
    contenido: jsonb("contenido").notNull(),
    enviadoA: text("enviado_a"),
  },
  (t) => [
    unique("documento_emitido_empresa_id_id").on(t.empresaId, t.id),
    uniqueIndex("documento_emitido_version").on(t.empresaId, t.tipo, t.entidadId, t.version).where(sql`${t.evento} = 'EMISION'`),
    index("documento_emitido_entidad").on(t.empresaId, t.entidad, t.entidadId),
    index("documento_emitido_entrega").on(t.entregaId),
    index("documento_emitido_fecha").on(t.empresaId, t.emitidoEn.desc()),
    foreignKey({ name: "documento_emitido_entrega_fk", columns: [t.empresaId, t.entregaId], foreignColumns: [entrega.empresaId, entrega.id] }),
    check("documento_emitido_version", sql`${t.version} >= 1`),
    check("documento_emitido_anulacion", sql`${t.estado} <> 'ANULADO' or char_length(trim(coalesce(${t.motivoAnulacion}, ''))) >= 5`),
  ],
);
