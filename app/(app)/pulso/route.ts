import { obtenerBaseDatos } from "@/db/cliente";
import { pulsoDeCambios } from "@/modulos/colaboracion/pulso";
import { obtenerAuthUserId } from "@/modulos/seguridad/sesion";

/** Las pantallas abiertas preguntan cada pocos segundos si alguien guardó algo (`src/ui/pulso.tsx`). */
export async function GET(): Promise<Response> {
  if (!(await obtenerAuthUserId())) return new Response(null, { status: 401 });
  try {
    return Response.json({ pulso: await pulsoDeCambios(obtenerBaseDatos()) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    // La base no responde, o falta la migración del pulso: las pantallas siguen como están.
    console.error("No se pudo leer el pulso de los cambios:", error);
    return new Response(null, { status: 503 });
  }
}
