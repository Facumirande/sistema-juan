import { numeric, timestamp, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";

import { empresa, usuario } from "./seguridad";

export const marcaDeTiempo = (nombre: string) => timestamp(nombre, { withTimezone: true, mode: "date" });

/**
 * Campos comunes de toda tabla de negocio (03 §1.2). Es una función porque cada tabla
 * necesita sus propias columnas. `actualizado_en` lo mantiene un trigger.
 */
export function camposComunes() {
  return {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references((): AnyPgColumn => empresa.id),
    creadoEn: marcaDeTiempo("creado_en").notNull().defaultNow(),
    creadoPor: uuid("creado_por").references((): AnyPgColumn => usuario.id),
    actualizadoEn: marcaDeTiempo("actualizado_en").notNull().defaultNow(),
    actualizadoPor: uuid("actualizado_por").references((): AnyPgColumn => usuario.id),
  };
}

// Tipos numéricos de 03 §1.4. Drizzle los devuelve como texto: se operan con decimal.js.

export const monto = (nombre: string) => numeric(nombre, { precision: 14, scale: 2 });

export const precioUnitario = (nombre: string) => numeric(nombre, { precision: 14, scale: 4 });

export const cantidad = (nombre: string) => numeric(nombre, { precision: 12, scale: 3 });

export const porcentaje = (nombre: string) => numeric(nombre, { precision: 7, scale: 3 });
