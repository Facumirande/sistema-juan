import { obtenerBaseDatos } from "@/db/cliente";
import { esErrorDeNegocio } from "@/dominio/errores";
import { planillaXlsx } from "@/lib/planilla";
import { hojaDePedidos, planillaModelo } from "@/modulos/pedidos/planilla";
import { obtenerAuthUserId } from "@/modulos/seguridad/sesion";

const PATRON = /^\d{4}-\d{2}-\d{2}$/;

/** Descarga en Excel: los pedidos de un día (`?fecha=`) o la planilla modelo para cargarlos (`?modelo=1`). */
export async function GET(pedido: Request): Promise<Response> {
  const authUserId = await obtenerAuthUserId();
  if (!authUserId) return new Response("Ingresá de nuevo.", { status: 401 });
  const url = new URL(pedido.url);
  const modelo = url.searchParams.get("modelo") === "1";
  const fecha = url.searchParams.get("fecha") ?? "";
  if (!modelo && !PATRON.test(fecha)) return new Response("Elegí un día válido.", { status: 400 });
  try {
    const db = obtenerBaseDatos();
    const archivo = planillaXlsx(modelo ? await planillaModelo(db, authUserId) : [await hojaDePedidos(db, authUserId, fecha)]);
    return new Response(Buffer.from(archivo), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${modelo ? "planilla-de-pedidos" : `pedidos_${fecha}`}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (esErrorDeNegocio(error)) return new Response(error.message, { status: error.codigo === "SIN_PERMISO" ? 403 : 400 });
    throw error;
  }
}
