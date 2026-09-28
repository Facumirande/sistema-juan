import { obtenerBaseDatos } from "@/db/cliente";
import { esErrorDeNegocio } from "@/dominio/errores";
import { planillasCsvZip, planillaXlsx } from "@/lib/planilla";
import { hojasParaElContador } from "@/modulos/facturacion/exportacion";
import { obtenerAuthUserId } from "@/modulos/seguridad/sesion";

const PATRON = /^\d{4}-\d{2}-\d{2}$/;

/** Descarga de P-88: el .xlsx (o los CSV en un .zip) del período; marca los comprobantes como exportados. */
export async function GET(pedido: Request): Promise<Response> {
  const authUserId = await obtenerAuthUserId();
  if (!authUserId) return new Response("Ingresá de nuevo.", { status: 401 });
  const url = new URL(pedido.url);
  const desde = url.searchParams.get("desde") ?? "";
  const hasta = url.searchParams.get("hasta") ?? "";
  if (!PATRON.test(desde) || !PATRON.test(hasta) || hasta < desde) return new Response("Elegí un período válido.", { status: 400 });
  try {
    const hojas = await hojasParaElContador(obtenerBaseDatos(), authUserId, { desde, hasta }, true);
    const csv = url.searchParams.get("formato") === "csv";
    const archivo = csv ? planillasCsvZip(hojas) : planillaXlsx(hojas);
    const nombre = `ventas-y-compras_${desde}_${hasta}.${csv ? "zip" : "xlsx"}`;
    return new Response(Buffer.from(archivo), {
      headers: {
        "Content-Type": csv ? "application/zip" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${nombre}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (esErrorDeNegocio(error)) return new Response(error.message, { status: error.codigo === "SIN_PERMISO" ? 403 : 400 });
    throw error;
  }
}
