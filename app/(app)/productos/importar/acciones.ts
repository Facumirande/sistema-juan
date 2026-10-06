"use server";

import { MAXIMO_BYTES_PLANILLA } from "@/dominio/planillas/comun";
import { importarProductos, revisarPlanillaDeProductos, type ProductoAImportar, type RevisionDeProductos } from "@/modulos/catalogo/planilla";
import { ejecutarAccion } from "@/ui/accion-servidor";
import type { EstadoAccion } from "@/ui/estado-accion";

// Acciones de "Productos en Excel". Los permisos los verifica cada caso de uso.

/** Lee la planilla que subió la persona y devuelve qué productos saldrían y qué hay que corregir. No carga nada. */
export async function revisarProductosAccion(datos: FormData): Promise<EstadoAccion & { revision?: RevisionDeProductos }> {
  let revision: RevisionDeProductos | undefined;
  const resultado = await ejecutarAccion(async ({ db, authUserId }) => {
    const archivo = datos.get("archivo");
    if (!(archivo instanceof File) || archivo.size === 0) return { ok: false, mensaje: "Elegí el archivo de Excel con los productos." };
    if (archivo.size > MAXIMO_BYTES_PLANILLA) return { ok: false, mensaje: "El archivo es muy grande: dejá solo la hoja de los productos y volvé a subirlo." };
    revision = await revisarPlanillaDeProductos(db, authUserId, new Uint8Array(await archivo.arrayBuffer()));
    return { ok: true, mensaje: null };
  });
  return revision ? { ...resultado, revision } : resultado;
}

/** Carga los productos ya revisados, todos juntos o ninguno. */
export async function importarProductosAccion(productos: ProductoAImportar[]): Promise<EstadoAccion & { creados?: number; categorias?: string[] }> {
  let creados: number | undefined;
  let categorias: string[] = [];
  const resultado = await ejecutarAccion(async ({ db, authUserId }) => {
    const r = await importarProductos(db, authUserId, productos);
    creados = r.productos.length;
    categorias = r.categoriasCreadas;
    return { ok: true, mensaje: null };
  });
  return creados !== undefined ? { ...resultado, creados, categorias } : resultado;
}
