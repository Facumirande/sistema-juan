import { strToU8 } from "fflate";

import { obtenerBaseDatos } from "@/db/cliente";
import { esErrorDeNegocio } from "@/dominio/errores";
import { hojaCsv, planillaXlsx } from "@/lib/planilla";
import { planillaModeloDeProductos } from "@/modulos/catalogo/importacion";
import { hojaDeProductos } from "@/modulos/catalogo/planilla";
import { obtenerAuthUserId } from "@/modulos/seguridad/sesion";

/**
 * Descargas de productos en Excel. Sin parámetros: la planilla modelo para cargarlos (RN-155), con
 * listas para elegir y "Ninguna". Con `?lista=1`: la lista de productos ya cargados (o, con
 * `&formato=csv`, un CSV).
 */
export async function GET(pedido: Request): Promise<Response> {
  const authUserId = await obtenerAuthUserId();
  if (!authUserId) return new Response("Ingresá de nuevo.", { status: 401 });
  const url = new URL(pedido.url);
  const lista = url.searchParams.get("lista") === "1";
  const csv = lista && url.searchParams.get("formato") === "csv";
  try {
    const db = obtenerBaseDatos();
    const archivo = !lista ? planillaXlsx(await planillaModeloDeProductos(db, authUserId)) : csv ? strToU8(hojaCsv(await hojaDeProductos(db, authUserId))) : planillaXlsx([await hojaDeProductos(db, authUserId)]);
    return new Response(Buffer.from(archivo), {
      headers: {
        "Content-Type": csv ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${lista ? "productos" : "planilla-de-productos"}.${csv ? "csv" : "xlsx"}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (esErrorDeNegocio(error)) return new Response(error.message, { status: error.codigo === "SIN_PERMISO" ? 403 : 400 });
    throw error;
  }
}
