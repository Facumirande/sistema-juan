import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as esquema from "./esquema";
import type { BaseDatos } from "./tipos";

let instancia: BaseDatos | undefined;

/**
 * Conexión del servidor como `app_servidor` (sin BYPASSRLS) por el pooler de Supabase en
 * modo transacción; por eso `prepare: false`. Se crea al primer uso para que el build no
 * necesite la variable de entorno. `DATABASE_POOL_MAX` ajusta las conexiones por instancia
 * (en funciones serverless conviene 1; el pooler de Supabase reparte).
 */
export function obtenerBaseDatos(): BaseDatos {
  if (!instancia) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("Falta la variable de entorno DATABASE_URL.");
    const max = Number(process.env.DATABASE_POOL_MAX) || 5;
    instancia = drizzle(postgres(url, { prepare: false, max }), { schema: esquema });
  }
  return instancia;
}
