import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as esquema from "./esquema";
import { clienteRapido } from "./conexion";
import type { BaseDatos } from "./tipos";

let instancia: BaseDatos | undefined;

/**
 * Conexión del servidor como `app_servidor` (sin BYPASSRLS) por el pooler de Supabase en
 * modo transacción; por eso `prepare: false` y los valores escritos en la consulta (`conexion.ts`,
 * que además ahorra idas a la base en cada transacción). Se crea al primer uso para que el build no
 * necesite la variable de entorno. `DATABASE_POOL_MAX` ajusta las conexiones por instancia: por
 * defecto 10, porque una pantalla pide varias cosas a la vez, cada una en su transacción (el tablero
 * con una tarjeta abierta, unas diez), y con menos conexiones hacen fila en vez de salir juntas. No
 * conviene bajarlo en Vercel: una misma instancia atiende varios pedidos a la vez y el pooler de
 * Supabase reparte las conexiones reales.
 */
export function obtenerBaseDatos(): BaseDatos {
  if (!instancia) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("Falta la variable de entorno DATABASE_URL.");
    const max = Number(process.env.DATABASE_POOL_MAX) || 10;
    instancia = drizzle(
      clienteRapido(postgres(url, { prepare: false, max }), {
        // En Vercel el proceso puede congelarse al terminar de responder: ahí se espera siempre el "commit".
        esperarCommit: Boolean(process.env.VERCEL),
        transaccionSimple: process.env.DATABASE_TRANSACCION_SIMPLE === "1",
      }),
      { schema: esquema },
    );
  }
  return instancia;
}
