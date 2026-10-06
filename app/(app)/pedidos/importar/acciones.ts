"use server";

import type { LineaElegida } from "@/dominio/pedidos/carga";
import { MAXIMO_BYTES_PLANILLA } from "@/dominio/pedidos/planilla";
import type { PedidoCargado } from "@/modulos/pedidos/pedidos";
import { importarPedidos, revisarPlanillaDePedidos, type RevisionDePlanilla } from "@/modulos/pedidos/planilla";
import { ejecutarAccion } from "@/ui/accion-servidor";
import { campo, type EstadoAccion } from "@/ui/estado-accion";

// Acciones de "Pedidos en Excel". Los permisos los verifica cada caso de uso.

/** Lee la planilla que subió la persona y devuelve qué pedidos saldrían y qué hay que corregir. No carga nada. */
export async function revisarPlanillaAccion(datos: FormData): Promise<EstadoAccion & { revision?: RevisionDePlanilla }> {
  let revision: RevisionDePlanilla | undefined;
  const resultado = await ejecutarAccion(async ({ db, authUserId }) => {
    const archivo = datos.get("archivo");
    if (!(archivo instanceof File) || archivo.size === 0) return { ok: false, mensaje: "Elegí el archivo de Excel con los pedidos." };
    if (archivo.size > MAXIMO_BYTES_PLANILLA) return { ok: false, mensaje: "El archivo es muy grande: dejá solo la hoja de los pedidos y volvé a subirlo." };
    revision = await revisarPlanillaDePedidos(db, authUserId, { bytes: new Uint8Array(await archivo.arrayBuffer()), fecha: campo(datos, "fecha") });
    return { ok: true, mensaje: null };
  });
  return revision ? { ...resultado, revision } : resultado;
}

/** Carga los pedidos ya revisados, todos juntos o ninguno. */
export async function importarPedidosAccion(pedidos: { fecha: string; clienteId: string; lineas: LineaElegida[] }[]): Promise<EstadoAccion & { cargados?: PedidoCargado[] }> {
  let cargados: PedidoCargado[] | undefined;
  const resultado = await ejecutarAccion(async ({ db, authUserId }) => {
    cargados = await importarPedidos(db, authUserId, pedidos);
    return { ok: true, mensaje: null };
  });
  return cargados ? { ...resultado, cargados } : resultado;
}
