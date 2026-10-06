import { obtenerBaseDatos } from "@/db/cliente";
import { avisosPara } from "@/modulos/colaboracion/avisos";
import { obtenerAuthUserId } from "@/modulos/seguridad/sesion";

/** La campanita pregunta cada tanto si hay algo nuevo: los avisos de quien mira, en JSON. */
export async function GET(): Promise<Response> {
  const authUserId = await obtenerAuthUserId();
  if (!authUserId) return new Response(null, { status: 401 });
  try {
    return Response.json(await avisosPara(obtenerBaseDatos(), authUserId), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    // Todavía sin acceso habilitado, o la base no responde: no hay avisos que mostrar.
    console.error("No se pudieron leer los avisos:", error);
    return new Response(null, { status: 503 });
  }
}
