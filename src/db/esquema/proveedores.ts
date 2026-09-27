import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, integer, numeric, pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { presentacion, producto } from "./catalogo";
import { camposComunes, marcaDeTiempo, monto, precioUnitario } from "./comunes";
import { condicionPago, origenPrecioCompra } from "./enums";

/** 03 §6.1 — puesto o mayorista. El crédito disponible y el semáforo se calculan, no se guardan. */
export const proveedor = pgTable(
  "proveedor",
  {
    ...camposComunes(),
    codigo: text("codigo"),
    nombre: text("nombre").notNull(),
    razonSocial: text("razon_social"),
    identificacionFiscal: text("identificacion_fiscal"),
    telefono: text("telefono"),
    email: text("email"),
    contactoNombre: text("contacto_nombre"),
    ubicacionMercado: text("ubicacion_mercado"),
    direccion: text("direccion"),
    datosBancarios: text("datos_bancarios"),
    /** Nulo = sin límite. */
    limiteCredito: monto("limite_credito"),
    plazoPagoDias: integer("plazo_pago_dias"),
    condicionPagoHabitual: condicionPago("condicion_pago_habitual").notNull().default("CREDITO"),
    observaciones: text("observaciones"),
    /** Caché del saldo del libro de movimientos (iteración 5). */
    saldoActual: monto("saldo_actual").notNull().default("0.00"),
    activo: boolean("activo").notNull().default(true),
  },
  (t) => [
    unique("proveedor_empresa_id_id").on(t.empresaId, t.id),
    uniqueIndex("proveedor_nombre_unico").on(t.empresaId, sql`lower(${t.nombre})`),
    uniqueIndex("proveedor_codigo_unico").on(t.empresaId, sql`upper(${t.codigo})`).where(sql`${t.codigo} is not null`),
    check("proveedor_nombre_no_vacio", sql`char_length(trim(${t.nombre})) > 0`),
    check("proveedor_limite_credito", sql`${t.limiteCredito} >= 0`),
    check("proveedor_plazo_pago", sql`${t.plazoPagoDias} >= 0`),
  ],
);

/** 03 §6.2 — oferta vigente: qué vende un proveedor, en qué presentación y a qué precio. */
export const proveedorProducto = pgTable(
  "proveedor_producto",
  {
    ...camposComunes(),
    proveedorId: uuid("proveedor_id").notNull(),
    productoId: uuid("producto_id").notNull(),
    presentacionId: uuid("presentacion_id").notNull(),
    /** Precio de la presentación (ej. $21.600 el cajón). */
    precioVigente: precioUnitario("precio_vigente").notNull(),
    /** Precio ÷ factor a unidad base (ej. $1.200/kg). */
    costoBase: precioUnitario("costo_base").notNull(),
    precioAnterior: precioUnitario("precio_anterior"),
    /** Última carga o confirmación del precio (RN-069, RN-075). */
    fechaActualizacion: marcaDeTiempo("fecha_actualizacion").notNull().defaultNow(),
    fuenteActualizacion: origenPrecioCompra("fuente_actualizacion").notNull().default("MANUAL"),
    disponible: boolean("disponible").notNull().default(true),
    codigoProveedor: text("codigo_proveedor"),
    observaciones: text("observaciones"),
    activo: boolean("activo").notNull().default(true),
  },
  (t) => [
    unique("proveedor_producto_empresa_id_id").on(t.empresaId, t.id),
    unique("proveedor_producto_unico").on(t.empresaId, t.proveedorId, t.productoId, t.presentacionId),
    index("proveedor_producto_producto").on(t.empresaId, t.productoId).where(sql`${t.activo}`),
    index("proveedor_producto_proveedor").on(t.empresaId, t.proveedorId).where(sql`${t.activo}`),
    index("proveedor_producto_fecha").on(t.empresaId, t.fechaActualizacion),
    index("proveedor_producto_presentacion").on(t.presentacionId),
    foreignKey({ name: "proveedor_producto_proveedor_fk", columns: [t.empresaId, t.proveedorId], foreignColumns: [proveedor.empresaId, proveedor.id] }),
    foreignKey({ name: "proveedor_producto_producto_fk", columns: [t.empresaId, t.productoId], foreignColumns: [producto.empresaId, producto.id] }),
    foreignKey({
      name: "proveedor_producto_presentacion_fk",
      columns: [t.productoId, t.presentacionId],
      foreignColumns: [presentacion.productoId, presentacion.id],
    }),
    check("proveedor_producto_precio", sql`${t.precioVigente} >= 0 and ${t.costoBase} >= 0`),
  ],
);

/** 03 §6.3 — libro de precios de compra: solo se completa `vigente_hasta` de la fila anterior. */
export const historialPrecioCompra = pgTable(
  "historial_precio_compra",
  {
    ...camposComunes(),
    proveedorProductoId: uuid("proveedor_producto_id").notNull(),
    proveedorId: uuid("proveedor_id").notNull(),
    productoId: uuid("producto_id").notNull(),
    presentacionId: uuid("presentacion_id").notNull(),
    precio: precioUnitario("precio").notNull(),
    costoBase: precioUnitario("costo_base").notNull(),
    /** Respecto del precio anterior; nulo en el primero. Más amplio que un porcentaje configurable: un error de tipeo puede dar miles de %. */
    variacionPct: numeric("variacion_pct", { precision: 10, scale: 3 }),
    vigenteDesde: marcaDeTiempo("vigente_desde").notNull().defaultNow(),
    vigenteHasta: marcaDeTiempo("vigente_hasta"),
    origen: origenPrecioCompra("origen").notNull(),
    /** FK a `compra_item` cuando exista (iteración 4). */
    compraItemId: uuid("compra_item_id"),
    loteId: uuid("lote_id"),
    referencia: text("referencia"),
    observacion: text("observacion"),
  },
  (t) => [
    index("historial_precio_compra_oferta").on(t.proveedorProductoId, t.vigenteDesde.desc()),
    index("historial_precio_compra_producto").on(t.empresaId, t.productoId, t.vigenteDesde.desc()),
    foreignKey({
      name: "historial_precio_compra_oferta_fk",
      columns: [t.empresaId, t.proveedorProductoId],
      foreignColumns: [proveedorProducto.empresaId, proveedorProducto.id],
    }),
    check("historial_precio_compra_vigencia", sql`${t.vigenteHasta} is null or ${t.vigenteHasta} >= ${t.vigenteDesde}`),
  ],
);
