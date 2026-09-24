import { pgEnum } from "drizzle-orm/pg-core";

// 03-modelo-de-datos.md §3. Se agregan acá a medida que las tablas de cada iteración los usan.

export const estrategiaCosto = pgEnum("estrategia_costo", ["PREFERIDO", "MINIMO", "ULTIMO_COSTO_REAL"]);

export const modoRedondeo = pgEnum("modo_redondeo", ["NINGUNO", "CERCANO", "ARRIBA", "ABAJO"]);

export const politicaFaltantes = pgEnum("politica_faltantes", ["PRIORIDAD_CLIENTE", "PROPORCIONAL", "MANUAL"]);

export const modoImputacion = pgEnum("modo_imputacion", ["FIFO", "MANUAL"]);

export const tipoSecuencia = pgEnum("tipo_secuencia", [
  "PEDIDO",
  "LISTA_COMPRA",
  "COMPRA",
  "PAGO_PROVEEDOR",
  "REPARTO",
  "ENTREGA",
  "FACTURA",
  "COBRO_CLIENTE",
  "AJUSTE_STOCK",
]);

export const accionAuditoria = pgEnum("accion_auditoria", [
  "CREAR",
  "MODIFICAR",
  "CAMBIO_ESTADO",
  "CANCELAR",
  "ANULAR",
  "CAMBIO_PRECIO_COMPRA",
  "CAMBIO_RECARGO",
  "CAMBIO_REGLA_PRECIO",
  "OVERRIDE_PRECIO",
  "EXCESO_LIMITE",
  "CAMBIO_LIMITE_CREDITO",
  "CORRECCION_ENTREGA",
  "EMISION_DOCUMENTO",
  "REAPERTURA_JORNADA",
  "CAMBIO_CONFIGURACION",
  "CAMBIO_PERMISOS",
  "INICIO_SESION",
  "EXPORTACION",
]);

/** Acciones de auditoría que exigen motivo (03 §4.6). */
export const ACCIONES_CON_MOTIVO = [
  "ANULAR",
  "CANCELAR",
  "OVERRIDE_PRECIO",
  "EXCESO_LIMITE",
  "CORRECCION_ENTREGA",
  "REAPERTURA_JORNADA",
] as const;
