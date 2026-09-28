import { sql } from "drizzle-orm";
import { bigint, boolean, check, date, foreignKey, index, integer, jsonb, pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { cliente } from "./clientes";
import { camposAnulacion, camposComunes, marcaDeTiempo, monto } from "./comunes";
import { entrega } from "./entregas";
import { estadoFactura, tipoComprobante } from "./enums";

/**
 * 03 §12.1 — comprobante de venta que agrupa entregas del mismo cliente. En el MVP es interno y no
 * fiscal (RN-140); los campos fiscales quedan para la facturación electrónica.
 */
export const factura = pgTable(
  "factura",
  {
    ...camposComunes(),
    ...camposAnulacion(),
    numero: bigint("numero", { mode: "number" }).notNull(),
    tipoComprobante: tipoComprobante("tipo_comprobante").notNull().default("INTERNO"),
    clienteId: uuid("cliente_id").notNull(),
    fechaEmision: date("fecha_emision").notNull(),
    periodoDesde: date("periodo_desde"),
    periodoHasta: date("periodo_hasta"),
    fechaVencimiento: date("fecha_vencimiento"),
    clienteNombre: text("cliente_nombre"),
    clienteRazonSocial: text("cliente_razon_social"),
    clienteIdentificacionFiscal: text("cliente_identificacion_fiscal"),
    clienteCondicionFiscal: text("cliente_condicion_fiscal"),
    clienteDireccionFiscal: text("cliente_direccion_fiscal"),
    importeNeto: monto("importe_neto").notNull(),
    importeIva: monto("importe_iva").notNull().default("0.00"),
    importeTotal: monto("importe_total").notNull(),
    estado: estadoFactura("estado").notNull().default("EMITIDA"),
    exportadaEn: marcaDeTiempo("exportada_en"),
    pdfPath: text("pdf_path"),
    observaciones: text("observaciones"),
    puntoVenta: integer("punto_venta"),
    tipoFiscal: text("tipo_fiscal"),
    numeroFiscal: bigint("numero_fiscal", { mode: "number" }),
    cae: text("cae"),
    caeVencimiento: date("cae_vencimiento"),
    datosFiscales: jsonb("datos_fiscales"),
  },
  (t) => [
    unique("factura_empresa_id_id").on(t.empresaId, t.id),
    unique("factura_empresa_numero").on(t.empresaId, t.numero),
    index("factura_cliente_fecha").on(t.empresaId, t.clienteId, t.fechaEmision),
    index("factura_fecha").on(t.empresaId, t.fechaEmision),
    foreignKey({ name: "factura_cliente_fk", columns: [t.empresaId, t.clienteId], foreignColumns: [cliente.empresaId, cliente.id] }),
    check("factura_importes", sql`${t.importeNeto} >= 0 and ${t.importeIva} >= 0 and ${t.importeTotal} = ${t.importeNeto} + ${t.importeIva}`),
    check("factura_periodo", sql`${t.periodoDesde} is null or ${t.periodoHasta} is null or ${t.periodoHasta} >= ${t.periodoDesde}`),
    check("factura_anulacion", sql`${t.estado} <> 'ANULADA' or char_length(trim(coalesce(${t.motivoAnulacion}, ''))) >= 5`),
  ],
);

/** 03 §12.2 — entregas incluidas en un comprobante, con la versión y el total facturados. */
export const facturaEntrega = pgTable(
  "factura_entrega",
  {
    ...camposComunes(),
    facturaId: uuid("factura_id").notNull(),
    entregaId: uuid("entrega_id").notNull(),
    entregaVersion: integer("entrega_version").notNull(),
    importeTotal: monto("importe_total").notNull(),
    activa: boolean("activa").notNull().default(true),
  },
  (t) => [
    unique("factura_entrega_empresa_id_id").on(t.empresaId, t.id),
    // Una entrega está en un solo comprobante vigente (RN-136).
    uniqueIndex("factura_entrega_vigente").on(t.entregaId).where(sql`${t.activa}`),
    index("factura_entrega_factura").on(t.facturaId),
    foreignKey({ name: "factura_entrega_factura_fk", columns: [t.empresaId, t.facturaId], foreignColumns: [factura.empresaId, factura.id] }),
    foreignKey({ name: "factura_entrega_entrega_fk", columns: [t.empresaId, t.entregaId], foreignColumns: [entrega.empresaId, entrega.id] }),
    check("factura_entrega_importe", sql`${t.importeTotal} > 0`),
    check("factura_entrega_version", sql`${t.entregaVersion} >= 1`),
  ],
);
