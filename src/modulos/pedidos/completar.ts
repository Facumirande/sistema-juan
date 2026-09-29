import type { BaseDatos } from "@/db/tipos";
import { esErrorDeNegocio, textoParaPersona } from "@/dominio/errores";
import type { FechaISO } from "@/dominio/fechas/fechas";

import { confirmarPedido, listarPedidos } from "./pedidos";

// Los pedidos no se confirman a mano (uso interno, 29/09/2026): antes de armar la lista de compras
// o de empezar a preparar, los que quedaron sin terminar pero ya tienen productos se completan
// solos. Los que no se pueden completar (les falta la orden de compra, el cliente está dado de
// baja…) quedan afuera, con el motivo para decírselo a la persona.

export async function completarPedidosDelDia(db: BaseDatos, authUserId: string, fecha: FechaISO): Promise<{ completados: number; problemas: string[] }> {
  const { pedidos } = await listarPedidos(db, authUserId, { fecha });
  let completados = 0;
  const problemas: string[] = [];
  for (const p of pedidos.filter((x) => x.estado === "BORRADOR" && x.lineas > 0)) {
    try {
      await confirmarPedido(db, authUserId, p.id);
      completados++;
    } catch (error) {
      if (!esErrorDeNegocio(error)) throw error;
      problemas.push(`${p.cliente} (${p.numero}): ${textoParaPersona(error.message)}`);
    }
  }
  return { completados, problemas };
}
