import { obtenerBaseDatos } from "@/db/cliente";
import { esErrorDeNegocio } from "@/dominio/errores";
import { hoyEnEmpresa } from "@/dominio/fechas/fechas";
import { planillaXlsx } from "@/lib/planilla";
import { libroDelMes } from "@/modulos/reportes/balance-mensual";
import { obtenerAuthUserId, obtenerSesion } from "@/modulos/seguridad/sesion";

/** Descarga del balance de un mes en Excel (`?mes=2026-10`): resumen, gráficos, día por día, clientes y productos. */
export async function GET(pedido: Request): Promise<Response> {
  const authUserId = await obtenerAuthUserId();
  const sesion = await obtenerSesion();
  if (!authUserId || !sesion) return new Response("Ingresá de nuevo.", { status: 401 });
  const mes = new URL(pedido.url).searchParams.get("mes") ?? "";
  try {
    const libro = await libroDelMes(obtenerBaseDatos(), authUserId, mes, hoyEnEmpresa(new Date(), sesion.zonaHoraria));
    return new Response(Buffer.from(planillaXlsx(libro.hojas)), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="balance_${libro.rango.mes}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (esErrorDeNegocio(error)) return new Response(error.message, { status: error.codigo === "SIN_PERMISO" ? 403 : 400 });
    throw error;
  }
}
