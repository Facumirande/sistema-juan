import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, integer, numeric, pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { camposComunes } from "./comunes";
import { jornada } from "./pedidos";

// El recorrido del día (07/10/2026): además de las entregas que salieron, se le pueden sumar otros
// destinos (pasar por el banco, por un proveedor, por un taller). Los que se usan seguido se guardan
// como favoritos, con el nombre que se les quiera dar.

const ubicacion = (latitud: Parameters<typeof sql>[1], longitud: Parameters<typeof sql>[1]) =>
  sql`(${latitud} is null) = (${longitud} is null) and coalesce(${latitud} between -90 and 90, true) and coalesce(${longitud} between -180 and 180, true)`;

/** Un lugar al que se va seguido, con nombre propio ("Banco", "Taller de Luis"). Se desactiva, no se borra. */
export const destinoFavorito = pgTable(
  "destino_favorito",
  {
    ...camposComunes(),
    nombre: text("nombre").notNull(),
    direccion: text("direccion"),
    latitud: numeric("latitud", { precision: 9, scale: 6 }),
    longitud: numeric("longitud", { precision: 9, scale: 6 }),
    activo: boolean("activo").notNull().default(true),
  },
  (t) => [
    unique("destino_favorito_empresa_id_id").on(t.empresaId, t.id),
    uniqueIndex("destino_favorito_nombre_unico")
      .on(t.empresaId, sql`lower(${t.nombre})`)
      .where(sql`${t.activo}`),
    check("destino_favorito_nombre_no_vacio", sql`char_length(trim(${t.nombre})) > 0`),
    check("destino_favorito_ubicacion", ubicacion(t.latitud, t.longitud)),
  ],
);

/**
 * Un destino que se suma al recorrido de un día y no es una entrega. Guarda el nombre y el lugar
 * tal como estaban al agregarlo (aunque venga de un favorito). No es un documento: se puede quitar.
 */
export const paradaExtra = pgTable(
  "parada_extra",
  {
    ...camposComunes(),
    jornadaId: uuid("jornada_id").notNull(),
    favoritoId: uuid("favorito_id"),
    nombre: text("nombre").notNull(),
    direccion: text("direccion"),
    latitud: numeric("latitud", { precision: 9, scale: 6 }),
    longitud: numeric("longitud", { precision: 9, scale: 6 }),
    /** Lugar en el recorrido del día, compartido con `entrega.orden_en_recorrido`. Nulo = al final. */
    orden: integer("orden"),
    /** Ya se pasó por ahí. */
    hecha: boolean("hecha").notNull().default(false),
  },
  (t) => [
    unique("parada_extra_empresa_id_id").on(t.empresaId, t.id),
    index("parada_extra_jornada").on(t.empresaId, t.jornadaId),
    foreignKey({ name: "parada_extra_jornada_fk", columns: [t.empresaId, t.jornadaId], foreignColumns: [jornada.empresaId, jornada.id] }),
    foreignKey({ name: "parada_extra_favorito_fk", columns: [t.empresaId, t.favoritoId], foreignColumns: [destinoFavorito.empresaId, destinoFavorito.id] }),
    check("parada_extra_nombre_no_vacio", sql`char_length(trim(${t.nombre})) > 0`),
    check("parada_extra_ubicacion", ubicacion(t.latitud, t.longitud)),
  ],
);
