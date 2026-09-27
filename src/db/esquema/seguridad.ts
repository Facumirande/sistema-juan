import { sql } from "drizzle-orm";
import {
  bigint,
  index,
  boolean,
  char,
  check,
  foreignKey,
  inet,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  time,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import { camposComunes, marcaDeTiempo } from "./comunes";
import {
  accionAuditoria,
  estrategiaCosto,
  modoImputacion,
  modoRedondeo,
  politicaFaltantes,
  tipoSecuencia,
} from "./enums";

const porcentaje = (nombre: string) => numeric(nombre, { precision: 7, scale: 3 });

/** 03 §4.1 — configuración del negocio. Única tabla sin `empresa_id`. */
export const empresa = pgTable(
  "empresa",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nombre: text("nombre").notNull(),
    razonSocial: text("razon_social"),
    identificacionFiscal: text("identificacion_fiscal"),
    condicionFiscal: text("condicion_fiscal"),
    direccion: text("direccion"),
    telefono: text("telefono"),
    email: text("email"),
    logoPath: text("logo_path"),
    pais: char("pais", { length: 2 }).notNull().default("AR"),
    moneda: char("moneda", { length: 3 }).notNull().default("ARS"),
    simboloMoneda: text("simbolo_moneda").notNull().default("$"),
    zonaHoraria: text("zona_horaria").notNull().default("America/Argentina/Buenos_Aires"),
    recargoGlobal: porcentaje("recargo_global").notNull().default("30.000"),
    estrategiaCosto: estrategiaCosto("estrategia_costo").notNull().default("PREFERIDO"),
    redondeoModo: modoRedondeo("redondeo_modo").notNull().default("CERCANO"),
    redondeoMultiplo: numeric("redondeo_multiplo", { precision: 14, scale: 4 }).notNull().default("1.0000"),
    preciosIncluyenIva: boolean("precios_incluyen_iva").notNull().default(false),
    preciosCompraIncluyenIva: boolean("precios_compra_incluyen_iva").notNull().default(false),
    alicuotaIvaDefault: porcentaje("alicuota_iva_default").notNull().default("0.000"),
    margenMinimoPct: porcentaje("margen_minimo_pct").notNull().default("15.000"),
    semaforoAmarilloPct: porcentaje("semaforo_amarillo_pct").notNull().default("70.000"),
    semaforoRojoPct: porcentaje("semaforo_rojo_pct").notNull().default("90.000"),
    diasAlertaPrecioDesactualizado: integer("dias_alerta_precio_desactualizado").notNull().default(7),
    variacionBruscaPct: porcentaje("variacion_brusca_pct").notNull().default("30.000"),
    preferidoCaroPct: porcentaje("preferido_caro_pct").notNull().default("10.000"),
    diasAvisoPrecioFijo: integer("dias_aviso_precio_fijo").notNull().default(15),
    diasAvisoVencimiento: integer("dias_aviso_vencimiento").notNull().default(3),
    horaCortePedidos: time("hora_corte_pedidos"),
    cantidadAtipicaMultiplicador: porcentaje("cantidad_atipica_multiplicador").notNull().default("3.000"),
    cantidadAtipicaSemanas: integer("cantidad_atipica_semanas").notNull().default(8),
    toleranciaPesoPct: porcentaje("tolerancia_peso_pct").notNull().default("3.000"),
    politicaFaltantes: politicaFaltantes("politica_faltantes").notNull().default("PRIORIDAD_CLIENTE"),
    imputacionPagosDefault: modoImputacion("imputacion_pagos_default").notNull().default("FIFO"),
    aplicarSaldoAFavorAuto: boolean("aplicar_saldo_a_favor_auto").notNull().default(true),
    emitirDocumentosAlPreparar: boolean("emitir_documentos_al_preparar").notNull().default(true),
    facturarAutomaticoPorEntrega: boolean("facturar_automatico_por_entrega").notNull().default(true),
    modulosHabilitados: text("modulos_habilitados").array().notNull().default(sql`'{}'::text[]`),
    activa: boolean("activa").notNull().default(true),
    creadoEn: marcaDeTiempo("creado_en").notNull().defaultNow(),
    actualizadoEn: marcaDeTiempo("actualizado_en").notNull().defaultNow(),
    actualizadoPor: uuid("actualizado_por").references((): AnyPgColumn => usuario.id),
  },
  (t) => [
    check("empresa_umbrales_semaforo", sql`${t.semaforoAmarilloPct} > 0 and ${t.semaforoAmarilloPct} < ${t.semaforoRojoPct} and ${t.semaforoRojoPct} <= 100`),
    check("empresa_recargo_global", sql`${t.recargoGlobal} > -100`),
    check("empresa_redondeo_multiplo", sql`${t.redondeoMultiplo} > 0`),
    check("empresa_modulos", sql`${t.modulosHabilitados} <@ array['COBRANZAS','STOCK','OFFLINE','FACTURACION_FISCAL','PORTAL_CLIENTES']::text[]`),
  ],
);

/** 03 §4.2 — persona que usa el sistema, 1 a 1 con el usuario de Supabase Auth. */
export const usuario = pgTable(
  "usuario",
  {
    ...camposComunes(),
    authUserId: uuid("auth_user_id").notNull().unique(),
    nombre: text("nombre").notNull(),
    email: text("email").notNull(),
    nombreUsuario: text("nombre_usuario"),
    telefono: text("telefono"),
    activo: boolean("activo").notNull().default(true),
    // Pedidos de acceso (Google o "Crear una cuenta"). Usan las columnas que el plan pensó para
    // invitaciones por correo, que no se usan: renombrarlas cuando se pueda migrar la base.
    /** Cuándo la persona pidió acceso; nulo si no hay pedido (o fue rechazado). */
    accesoPedidoEn: marcaDeTiempo("invitacion_enviada_en"),
    /** Cuándo un administrador aprobó el pedido. */
    accesoAprobadoEn: marcaDeTiempo("invitacion_aceptada_en"),
    debeCambiarClave: boolean("debe_cambiar_clave").notNull().default(false),
    ultimoAccesoEn: marcaDeTiempo("ultimo_acceso_en"),
    preferencias: jsonb("preferencias").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [
    unique("usuario_empresa_id_id").on(t.empresaId, t.id),
    uniqueIndex("usuario_email_unico").on(sql`lower(${t.email})`),
    uniqueIndex("usuario_nombre_usuario_unico").on(t.empresaId, sql`lower(${t.nombreUsuario})`),
    check("usuario_nombre_no_vacio", sql`char_length(trim(${t.nombre})) > 0`),
  ],
);

/** 03 §4.3 — paquete de permisos. ADMIN = `{*}`. */
export const rol = pgTable(
  "rol",
  {
    ...camposComunes(),
    codigo: text("codigo").notNull(),
    nombre: text("nombre").notNull(),
    descripcion: text("descripcion"),
    permisos: text("permisos").array().notNull().default(sql`'{}'::text[]`),
    esSistema: boolean("es_sistema").notNull().default(false),
    activo: boolean("activo").notNull().default(true),
  },
  (t) => [
    unique("rol_empresa_id_id").on(t.empresaId, t.id),
    unique("rol_empresa_codigo").on(t.empresaId, t.codigo),
    check("rol_codigo_formato", sql`${t.codigo} ~ '^[A-Z][A-Z0-9_]*$'`),
  ],
);

/** 03 §4.4 */
export const usuarioRol = pgTable(
  "usuario_rol",
  {
    ...camposComunes(),
    usuarioId: uuid("usuario_id").notNull(),
    rolId: uuid("rol_id").notNull(),
  },
  (t) => [
    unique("usuario_rol_unico").on(t.usuarioId, t.rolId),
    index("usuario_rol_rol").on(t.rolId),
    foreignKey({ name: "usuario_rol_usuario_fk", columns: [t.empresaId, t.usuarioId], foreignColumns: [usuario.empresaId, usuario.id] }),
    foreignKey({ name: "usuario_rol_rol_fk", columns: [t.empresaId, t.rolId], foreignColumns: [rol.empresaId, rol.id] }),
  ],
);

/** 03 §4.5 — numeración correlativa sin huecos por empresa y tipo. */
export const secuencia = pgTable(
  "secuencia",
  {
    ...camposComunes(),
    tipo: tipoSecuencia("tipo").notNull(),
    prefijo: text("prefijo").notNull(),
    ultimoNumero: bigint("ultimo_numero", { mode: "number" }).notNull().default(0),
    relleno: smallint("relleno").notNull().default(6),
  },
  (t) => [
    unique("secuencia_empresa_tipo").on(t.empresaId, t.tipo),
    check("secuencia_ultimo_numero", sql`${t.ultimoNumero} >= 0`),
    check("secuencia_relleno", sql`${t.relleno} between 1 and 12`),
  ],
);

/** 03 §4.6 — registro inmutable de cambios sensibles. */
export const auditoria = pgTable(
  "auditoria",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references((): AnyPgColumn => empresa.id),
    ocurridoEn: marcaDeTiempo("ocurrido_en").notNull().defaultNow(),
    usuarioId: uuid("usuario_id").references((): AnyPgColumn => usuario.id),
    accion: accionAuditoria("accion").notNull(),
    entidad: text("entidad").notNull(),
    entidadId: uuid("entidad_id"),
    resumen: text("resumen").notNull(),
    datosAntes: jsonb("datos_antes").$type<Record<string, unknown>>(),
    datosDespues: jsonb("datos_despues").$type<Record<string, unknown>>(),
    motivo: text("motivo"),
    ip: inet("ip"),
    userAgent: text("user_agent"),
    requestId: uuid("request_id"),
  },
  (t) => [
    index("auditoria_empresa_fecha").on(t.empresaId, t.ocurridoEn.desc()),
    index("auditoria_entidad").on(t.empresaId, t.entidad, t.entidadId, t.ocurridoEn.desc()),
    index("auditoria_usuario").on(t.usuarioId, t.ocurridoEn.desc()),
    check(
      "auditoria_motivo_obligatorio",
      sql`${t.accion} not in ('ANULAR','CANCELAR','OVERRIDE_PRECIO','EXCESO_LIMITE','CORRECCION_ENTREGA','REAPERTURA_JORNADA') or char_length(trim(coalesce(${t.motivo}, ''))) >= 5`,
    ),
  ],
);
