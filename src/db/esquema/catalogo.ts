import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
  type PgTableExtraConfigValue,
} from "drizzle-orm/pg-core";

import { camposComunes, cantidad, porcentaje } from "./comunes";
import { grupoProducto, unidadMedida } from "./enums";
import { proveedor } from "./proveedores";

/** 03 §5.1 — agrupa productos; su orden es el del recorrido en el mercado y el depósito. */
export const categoria = pgTable(
  "categoria",
  {
    ...camposComunes(),
    nombre: text("nombre").notNull(),
    grupo: grupoProducto("grupo").notNull().default("VERDURA"),
    recargoDefault: porcentaje("recargo_default"),
    orden: integer("orden").notNull().default(0),
    activo: boolean("activo").notNull().default(true),
  },
  (t) => [
    unique("categoria_empresa_id_id").on(t.empresaId, t.id),
    uniqueIndex("categoria_nombre_unico").on(t.empresaId, sql`lower(${t.nombre})`),
    check("categoria_nombre_no_vacio", sql`char_length(trim(${t.nombre})) > 0`),
    check("categoria_recargo", sql`${t.recargoDefault} > -100`),
  ],
);

/** 03 §5.2 — ficha central del producto. Todo cálculo interno se hace en `unidad_base`. */
export const producto = pgTable(
  "producto",
  {
    ...camposComunes(),
    codigo: text("codigo").notNull(),
    nombre: text("nombre").notNull(),
    nombreCorto: text("nombre_corto"),
    categoriaId: uuid("categoria_id").notNull(),
    unidadBase: unidadMedida("unidad_base").notNull(),
    admiteFraccion: boolean("admite_fraccion").notNull().default(true),
    recargoDefault: porcentaje("recargo_default"),
    alicuotaIva: porcentaje("alicuota_iva").notNull().default("0.000"),
    proveedorPreferidoId: uuid("proveedor_preferido_id"),
    presentacionVentaDefaultId: uuid("presentacion_venta_default_id"),
    presentacionCompraDefaultId: uuid("presentacion_compra_default_id"),
    observaciones: text("observaciones"),
    imagenPath: text("imagen_path"),
    activo: boolean("activo").notNull().default(true),
  },
  (t): PgTableExtraConfigValue[] => [
    unique("producto_empresa_id_id").on(t.empresaId, t.id),
    uniqueIndex("producto_codigo_unico").on(t.empresaId, sql`upper(${t.codigo})`),
    uniqueIndex("producto_nombre_unico").on(t.empresaId, sql`lower(${t.nombre})`),
    index("producto_categoria").on(t.categoriaId),
    index("producto_proveedor_preferido").on(t.proveedorPreferidoId),
    foreignKey({ name: "producto_categoria_fk", columns: [t.empresaId, t.categoriaId], foreignColumns: [categoria.empresaId, categoria.id] }),
    foreignKey({
      name: "producto_proveedor_preferido_fk",
      columns: [t.empresaId, t.proveedorPreferidoId],
      foreignColumns: [proveedor.empresaId, proveedor.id],
    }),
    foreignKey({
      name: "producto_presentacion_venta_fk",
      columns: [t.id, t.presentacionVentaDefaultId],
      foreignColumns: [presentacion.productoId, presentacion.id],
    }),
    foreignKey({
      name: "producto_presentacion_compra_fk",
      columns: [t.id, t.presentacionCompraDefaultId],
      foreignColumns: [presentacion.productoId, presentacion.id],
    }),
    check("producto_codigo_no_vacio", sql`char_length(trim(${t.codigo})) > 0`),
    check("producto_nombre_no_vacio", sql`char_length(trim(${t.nombre})) > 0`),
    check("producto_recargo", sql`${t.recargoDefault} > -100`),
    check("producto_alicuota_iva", sql`${t.alicuotaIva} >= 0`),
  ],
);

/** 03 §5.3 — forma de comprar o vender un producto ("Cajón 18 kg" = 18 unidades base). */
export const presentacion = pgTable(
  "presentacion",
  {
    ...camposComunes(),
    productoId: uuid("producto_id").notNull(),
    nombre: text("nombre").notNull(),
    factorABase: cantidad("factor_a_base").notNull(),
    usableEnCompra: boolean("usable_en_compra").notNull().default(true),
    usableEnVenta: boolean("usable_en_venta").notNull().default(true),
    esUnidadBase: boolean("es_unidad_base").notNull().default(false),
    orden: integer("orden").notNull().default(0),
    activo: boolean("activo").notNull().default(true),
  },
  (t): PgTableExtraConfigValue[] => [
    unique("presentacion_empresa_id_id").on(t.empresaId, t.id),
    unique("presentacion_producto_id_id").on(t.productoId, t.id),
    uniqueIndex("presentacion_nombre_unico").on(t.productoId, sql`lower(${t.nombre})`),
    uniqueIndex("presentacion_unidad_base_unica").on(t.productoId).where(sql`${t.esUnidadBase}`),
    foreignKey({ name: "presentacion_producto_fk", columns: [t.empresaId, t.productoId], foreignColumns: [producto.empresaId, producto.id] }),
    check("presentacion_nombre_no_vacio", sql`char_length(trim(${t.nombre})) > 0`),
    check("presentacion_factor", sql`${t.factorABase} > 0`),
    check("presentacion_uso", sql`${t.usableEnCompra} or ${t.usableEnVenta}`),
    check("presentacion_unidad_base_factor", sql`not ${t.esUnidadBase} or ${t.factorABase} = 1`),
  ],
);
