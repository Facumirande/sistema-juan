import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  integer,
  numeric,
  pgTable,
  smallint,
  text,
  time,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { camposComunes, monto, porcentaje } from "./comunes";
import { periodicidadFacturacion, tipoCliente } from "./enums";

/** 03 §7.1 */
export const cliente = pgTable(
  "cliente",
  {
    ...camposComunes(),
    codigo: text("codigo"),
    nombre: text("nombre").notNull(),
    tipoCliente: tipoCliente("tipo_cliente").notNull().default("OTRO"),
    razonSocial: text("razon_social"),
    identificacionFiscal: text("identificacion_fiscal"),
    condicionFiscal: text("condicion_fiscal"),
    direccionFiscal: text("direccion_fiscal"),
    telefono: text("telefono"),
    email: text("email"),
    emailContable: text("email_contable"),
    contactoNombre: text("contacto_nombre"),
    /** Nivel 4 de la precedencia de precios (iteración 3). */
    recargoDefault: porcentaje("recargo_default"),
    prioridadFaltantes: smallint("prioridad_faltantes").notNull().default(3),
    periodicidadFacturacion: periodicidadFacturacion("periodicidad_facturacion").notNull().default("POR_ENTREGA"),
    requiereOrdenCompra: boolean("requiere_orden_compra").notNull().default(false),
    aceptaSustituciones: boolean("acepta_sustituciones").notNull().default(true),
    requiereFirma: boolean("requiere_firma").notNull().default(false),
    plazoCobroDias: integer("plazo_cobro_dias"),
    limiteCredito: monto("limite_credito"),
    observaciones: text("observaciones"),
    activo: boolean("activo").notNull().default(true),
  },
  (t) => [
    unique("cliente_empresa_id_id").on(t.empresaId, t.id),
    uniqueIndex("cliente_nombre_unico").on(t.empresaId, sql`lower(${t.nombre})`),
    uniqueIndex("cliente_codigo_unico").on(t.empresaId, sql`upper(${t.codigo})`).where(sql`${t.codigo} is not null`),
    uniqueIndex("cliente_identificacion_fiscal_unica")
      .on(t.empresaId, t.identificacionFiscal)
      .where(sql`${t.identificacionFiscal} is not null`),
    check("cliente_nombre_no_vacio", sql`char_length(trim(${t.nombre})) > 0`),
    check("cliente_prioridad_faltantes", sql`${t.prioridadFaltantes} between 1 and 5`),
    check("cliente_recargo", sql`${t.recargoDefault} > -100`),
  ],
);

/** 03 §7.2 — dirección o servicio donde se entrega; uno principal por cliente. */
export const puntoEntrega = pgTable(
  "punto_entrega",
  {
    ...camposComunes(),
    clienteId: uuid("cliente_id").notNull(),
    nombre: text("nombre").notNull(),
    direccion: text("direccion").notNull(),
    localidad: text("localidad"),
    referencias: text("referencias"),
    latitud: numeric("latitud", { precision: 9, scale: 6 }),
    longitud: numeric("longitud", { precision: 9, scale: 6 }),
    contactoNombre: text("contacto_nombre"),
    contactoTelefono: text("contacto_telefono"),
    horarioDesde: time("horario_desde"),
    horarioHasta: time("horario_hasta"),
    /** 1 = lunes … 7 = domingo. */
    diasEntrega: smallint("dias_entrega").array(),
    instruccionesEntrega: text("instrucciones_entrega"),
    esPrincipal: boolean("es_principal").notNull().default(false),
    activo: boolean("activo").notNull().default(true),
  },
  (t) => [
    unique("punto_entrega_empresa_id_id").on(t.empresaId, t.id),
    unique("punto_entrega_empresa_cliente_id").on(t.empresaId, t.clienteId, t.id),
    uniqueIndex("punto_entrega_nombre_unico").on(t.clienteId, sql`lower(${t.nombre})`),
    uniqueIndex("punto_entrega_principal_unico").on(t.clienteId).where(sql`${t.esPrincipal} and ${t.activo}`),
    foreignKey({ name: "punto_entrega_cliente_fk", columns: [t.empresaId, t.clienteId], foreignColumns: [cliente.empresaId, cliente.id] }),
    check("punto_entrega_nombre_no_vacio", sql`char_length(trim(${t.nombre})) > 0`),
    check("punto_entrega_direccion_no_vacia", sql`char_length(trim(${t.direccion})) > 0`),
    check("punto_entrega_dias", sql`${t.diasEntrega} <@ array[1,2,3,4,5,6,7]::smallint[]`),
  ],
);
