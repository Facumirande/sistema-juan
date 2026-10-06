import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgTable, text, unique, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";

import { camposComunes, marcaDeTiempo } from "./comunes";
import { tipoEntidad } from "./enums";
import { jornada } from "./pedidos";
import { empresa, usuario } from "./seguridad";

// Trabajo entre las personas del negocio (uso interno, 28/09/2026): notas en las tarjetas del
// tablero y en las fichas, quién las leyó, y el registro de lo que hace cada uno.

/** Nota sobre un pedido, cliente, proveedor, producto… El autor es `creado_por`. */
export const nota = pgTable(
  "nota",
  {
    ...camposComunes(),
    entidadTipo: tipoEntidad("entidad_tipo").notNull(),
    entidadId: uuid("entidad_id").notNull(),
    texto: text("texto").notNull(),
    /** Para quién es; nulo = para todos. */
    paraUsuarioId: uuid("para_usuario_id"),
  },
  (t) => [
    unique("nota_empresa_id_id").on(t.empresaId, t.id),
    index("nota_entidad").on(t.empresaId, t.entidadTipo, t.entidadId, t.creadoEn),
    index("nota_para").on(t.empresaId, t.paraUsuarioId, t.creadoEn.desc()),
    foreignKey({ name: "nota_para_fk", columns: [t.empresaId, t.paraUsuarioId], foreignColumns: [usuario.empresaId, usuario.id] }),
    check("nota_texto", sql`char_length(trim(${t.texto})) between 1 and 2000`),
  ],
);

/** Quién leyó cada nota (una fila por nota y persona). */
export const notaLectura = pgTable(
  "nota_lectura",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references((): AnyPgColumn => empresa.id),
    notaId: uuid("nota_id").notNull(),
    usuarioId: uuid("usuario_id").notNull(),
    leidaEn: marcaDeTiempo("leida_en").notNull().defaultNow(),
  },
  (t) => [
    unique("nota_lectura_unica").on(t.notaId, t.usuarioId),
    index("nota_lectura_usuario").on(t.empresaId, t.usuarioId),
    foreignKey({ name: "nota_lectura_nota_fk", columns: [t.empresaId, t.notaId], foreignColumns: [nota.empresaId, nota.id] }).onDelete("cascade"),
    foreignKey({ name: "nota_lectura_usuario_fk", columns: [t.empresaId, t.usuarioId], foreignColumns: [usuario.empresaId, usuario.id] }),
  ],
);

/**
 * Lo que hizo cada persona ("María confirmó el pedido PED-000012"). Se escribe en la misma
 * transacción que el cambio y no se modifica. `resumen` no lleva importes: la actividad la ve
 * cualquiera que pueda ver la entidad, aunque no vea precios.
 */
export const actividad = pgTable(
  "actividad",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references((): AnyPgColumn => empresa.id),
    ocurridaEn: marcaDeTiempo("ocurrida_en").notNull().defaultNow(),
    usuarioId: uuid("usuario_id").notNull(),
    accion: text("accion").notNull(),
    entidadTipo: tipoEntidad("entidad_tipo").notNull(),
    entidadId: uuid("entidad_id"),
    /** Día de trabajo al que corresponde, si corresponde a uno. */
    jornadaId: uuid("jornada_id"),
    resumen: text("resumen").notNull(),
    /** A quién le toca enterarse en particular (le pasaron un pedido, lo habilitaron…); nulo = a todos. */
    paraUsuarioId: uuid("para_usuario_id"),
  },
  (t) => [
    index("actividad_empresa_fecha").on(t.empresaId, t.ocurridaEn.desc()),
    index("actividad_entidad").on(t.empresaId, t.entidadTipo, t.entidadId, t.ocurridaEn.desc()),
    index("actividad_usuario").on(t.empresaId, t.usuarioId, t.ocurridaEn.desc()),
    foreignKey({ name: "actividad_usuario_fk", columns: [t.empresaId, t.usuarioId], foreignColumns: [usuario.empresaId, usuario.id] }),
    foreignKey({ name: "actividad_para_fk", columns: [t.empresaId, t.paraUsuarioId], foreignColumns: [usuario.empresaId, usuario.id] }),
    foreignKey({ name: "actividad_jornada_fk", columns: [t.empresaId, t.jornadaId], foreignColumns: [jornada.empresaId, jornada.id] }),
    check("actividad_resumen", sql`char_length(trim(${t.resumen})) > 0`),
  ],
);
