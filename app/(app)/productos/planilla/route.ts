import { strToU8 } from "fflate";

import { obtenerBaseDatos } from "@/db/cliente";
import { esErrorDeNegocio } from "@/dominio/errores";
import { hojaCsv, planillaXlsx } from "@/lib/planilla";
import { hojaDeProductos, planillaModeloDeProductos } from "@/modulos/catalogo/planilla";
import { obtenerAuthUserId } from "@/modulos/seguridad/sesion";

/** Descarga en Excel: la lista de productos (o, con `formato=csv`, un CSV) o la planilla modelo para cargarlos (`?modelo=1`). */
export async function GET(pedido: Request): Promise<Response> {
  const authUserId = await obtenerAuthUserId();
  if (!authUserId) return new Response("Ingresá de nuevo.", { status: 401 });
  const url = new URL(pedido.url);
  const modelo = url.searchParams.get("modelo") === "1";
  const csv = !modelo && url.searchParams.get("formato") === "csv";
  try {
    const db = obtenerBaseDatos();
    const archivo = modelo ? planillaXlsx(await planillaModeloDeProductos(db, authUserId)) : csv ? strToU8(hojaCsv(await hojaDeProductos(db, authUserId))) : planillaXlsx([await hojaDeProductos(db, authUserId)]);
    return new Response(Buffer.from(archivo), {
      headers: {
        "Content-Type": csv ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${modelo ? "planilla-de-productos" : "productos"}.${csv ? "csv" : "xlsx"}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (esErrorDeNegocio(error)) return new Response(error.message, { status: error.codigo === "SIN_PERMISO" ? 403 : 400 });
    throw error;
  }
}
