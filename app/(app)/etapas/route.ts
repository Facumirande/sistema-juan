import { obtenerBaseDatos } from "@/db/cliente";
import { esErrorDeNegocio } from "@/dominio/errores";
import { procesoEnCurso } from "@/modulos/jornadas/dia";
import { obtenerAuthUserId } from "@/modulos/seguridad/sesion";

/**
 * Cómo va cada etapa de un día, en JSON: lo pide el menú apenas se cambia de día (`src/ui/etapas-vivas.tsx`),
 * sin esperar a que llegue la pantalla. Una consulta chica: el permiso lo verifica el caso de uso.
 */
export async function GET(pedido: Request): Promise<Response> {
  const authUserId = await obtenerAuthUserId();
  if (!authUserId) return new Response(null, { status: 401 });
  const dia = new URL(pedido.url).searchParams.get("dia") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return new Response(null, { status: 400 });
  try {
    const p = await procesoEnCurso(obtenerBaseDatos(), authUserId, dia);
    return Response.json(p ? { fecha: p.fecha, etapas: p.etapas } : null, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (esErrorDeNegocio(error)) return new Response(null, { status: 403 });
    // La base no responde: el menú queda con los enlaces del día, sin el avance.
    console.error("No se pudieron leer las etapas del día:", error);
    return new Response(null, { status: 503 });
  }
}
