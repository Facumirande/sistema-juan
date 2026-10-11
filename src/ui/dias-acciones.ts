"use server";

import { obtenerBaseDatos } from "@/db/cliente";
import { diasDelMes } from "@/modulos/jornadas/dia";
import { obtenerAuthUserId } from "@/modulos/seguridad/sesion";

import type { DiaParaElegir } from "./selector-de-dia";

/** Los días de un mes con su estado y sus pedidos, para marcarlos en el calendario del selector de día. */
export async function diasDelMesAccion(mes: string): Promise<DiaParaElegir[]> {
  const authUserId = await obtenerAuthUserId();
  if (!authUserId || !/^\d{4}-\d{2}$/.test(mes)) return [];
  try {
    return await diasDelMes(obtenerBaseDatos(), authUserId, mes);
  } catch {
    // Sin marcas: el calendario igual deja elegir cualquier día.
    return [];
  }
}
