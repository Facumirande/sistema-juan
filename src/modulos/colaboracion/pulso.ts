import { sql } from "drizzle-orm";

import type { BaseDatos } from "@/db/tipos";

// El pulso de los cambios (pedido del usuario, 08/10/2026: que las pantallas se pongan al día solas
// para que las dos personas vean enseguida lo que hace la otra). Es un número que sube cada vez que
// una transacción guarda algo (`src/db/conexion.ts`, migración 0023). Las pantallas abiertas lo
// preguntan cada pocos segundos y se vuelven a dibujar solo cuando cambió: preguntar es una consulta
// cortísima, sin transacción ni cambio de rol, que no lee datos del negocio.

/** El pulso actual, como texto (puede superar el máximo de un número de JavaScript). */
export async function pulsoDeCambios(db: BaseDatos): Promise<string> {
  const resultado: unknown = await db.execute(sql`select public.pulso_de_cambios()::text as n`);
  // postgres.js devuelve las filas directamente; PGlite (pruebas), dentro de `rows`.
  const filas = (Array.isArray(resultado) ? resultado : (resultado as { rows: unknown[] }).rows) as { n: string }[];
  return filas[0]?.n ?? "0";
}
