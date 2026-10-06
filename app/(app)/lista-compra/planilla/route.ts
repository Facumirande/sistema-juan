import { strToU8 } from "fflate";

import { obtenerBaseDatos } from "@/db/cliente";
import { esErrorDeNegocio } from "@/dominio/errores";
import { hojaCsv, planillaXlsx } from "@/lib/planilla";
import { hojaDeListaDeCompras } from "@/modulos/compras/lista-compra";
import { obtenerAuthUserId } from "@/modulos/seguridad/sesion";

const PATRON = /^\d{4}-\d{2}-\d{2}$/;

/** Descarga de la lista de compras de un día: Excel (`.xlsx`) o, con `formato=csv`, un CSV. */
export async function GET(pedido: Request): Promise<Response> {
  const authUserId = await obtenerAuthUserId();
  if (!authUserId) return new Response("Ingresá de nuevo.", { status: 401 });
  const url = new URL(pedido.url);
  const fecha = url.searchParams.get("fecha") ?? "";
  if (!PATRON.test(fecha)) return new Response("Elegí un día válido.", { status: 400 });
  try {
    const hoja = await hojaDeListaDeCompras(obtenerBaseDatos(), authUserId, fecha);
    if (!hoja) return new Response("Ese día todavía no tiene lista de compras.", { status: 404 });
    const csv = url.searchParams.get("formato") === "csv";
    return new Response(Buffer.from(csv ? strToU8(hojaCsv(hoja)) : planillaXlsx([hoja])), {
      headers: {
        "Content-Type": csv ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="lista-de-compras_${fecha}.${csv ? "csv" : "xlsx"}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (esErrorDeNegocio(error)) return new Response(error.message, { status: error.codigo === "SIN_PERMISO" ? 403 : 400 });
    throw error;
  }
}
