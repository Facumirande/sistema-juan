import { asc } from "drizzle-orm";

import { usuario } from "@/db/esquema";
import type { Transaccion } from "@/db/tipos";
import { asignarColores } from "@/dominio/colaboracion/personas";

/**
 * El color de cada persona del negocio, sin repetir: el que eligió en "Mi cuenta" o el primero
 * libre, de la cuenta más antigua a la más nueva (así no cambia cuando se suma alguien).
 */
export async function coloresDelNegocio(tx: Transaccion): Promise<Map<string, string>> {
  const filas = await tx
    .select({ id: usuario.id, preferencias: usuario.preferencias })
    .from(usuario)
    .orderBy(asc(usuario.creadoEn), asc(usuario.id));
  return asignarColores(filas.map((u) => ({ id: u.id, elegido: u.preferencias?.color })));
}
