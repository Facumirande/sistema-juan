import { timestamp, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";

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
