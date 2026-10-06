import { enumerar } from "@/dominio/entregas/salida";
import type { ResultadoSalida } from "@/modulos/entregas/repartos";

import type { EstadoAccion } from "./estado-accion";

/** Qué pasó al mandar pedidos a "En camino", dicho para la persona, con el botón para seguir. */
export function resultadoDeSalida(r: ResultadoSalida): EstadoAccion {
  const partes = r.repartos.map((x) => `Salió el reparto ${x.numero} con ${enumerar(x.clientes)}.`);
  if (r.yaEnCamino.length) partes.push(`${enumerar(r.yaEnCamino)} ya ${r.yaEnCamino.length === 1 ? "estaba" : "estaban"} en camino.`);
  if (r.repartos.length === 0) return { ok: true, mensaje: partes.join(" ") || "No había nada para mandar." };
  return {
    ok: true,
    mensaje: `🚚 ${partes.join(" ")} Ya están En camino: al dejar cada pedido, tocá ✅ Entregar.`,
    enlace: { href: `/viaje?fecha=${r.fecha}`, texto: "Ver el viaje y el GPS" },
  };
}
