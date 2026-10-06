import { obtenerBaseDatos } from "@/db/cliente";
import { esErrorDeNegocio } from "@/dominio/errores";
import { planillaXlsx } from "@/lib/planilla";
import { planillaModeloDeProductos } from "@/modulos/catalogo/importacion";
import { obtenerAuthUserId } from "@/modulos/seguridad/sesion";

/** La planilla modelo de productos para bajar (RN-155): con listas para elegir y "Ninguna". */
export async function GET(): Promise<Response> {
  const authUserId = await obtenerAuthUserId();
  if (!authUserId) return new Response("Ingresá de nuevo.", { status: 401 });
  try {
    const archivo = planillaXlsx(await planillaModeloDeProductos(obtenerBaseDatos(), authUserId));
    return new Response(Buffer.from(archivo), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="planilla-de-productos.xlsx"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (esErrorDeNegocio(error)) return new Response(error.message, { status: error.codigo === "SIN_PERMISO" ? 403 : 400 });
    throw error;
  }
}
