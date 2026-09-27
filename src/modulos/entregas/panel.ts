import { and, count, eq, ne, sql } from "drizzle-orm";

import { compra, entrega, jornada, listaCompra, listaCompraItem, pedido, reparto } from "@/db/esquema";
import type { BaseDatos } from "@/db/tipos";
import type { FechaISO } from "@/dominio/fechas/fechas";
import { ejecutarComoUsuario } from "@/modulos/seguridad/contexto";

import { jornadaDeFecha } from "./comun";

// P-46 Panel de la jornada: en qué paso está el día y cuánto falta en cada etapa.

export interface PanelJornada {
  fecha: FechaISO;
  estado: string | null;
  pasos: { compra: Date | null; preparacion: Date | null; reparto: Date | null; cierre: Date | null };
  pedidos: Record<string, number>;
  lista: { armada: boolean; desactualizada: boolean; lineas: number; compradas: number };
  compras: number;
  entregas: Record<string, number>;
  repartos: Record<string, number>;
}

const porEstado = (filas: { estado: string; n: number }[]) => Object.fromEntries(filas.map((f) => [f.estado, Number(f.n)]));

export async function panelDeJornada(db: BaseDatos, authUserId: string, fecha: FechaISO): Promise<PanelJornada> {
  return ejecutarComoUsuario(db, authUserId, "jornada.ver", async (tx) => {
    const j = await jornadaDeFecha(tx, fecha);
    if (!j) return { fecha, estado: null, pasos: { compra: null, preparacion: null, reparto: null, cierre: null }, pedidos: {}, lista: { armada: false, desactualizada: false, lineas: 0, compradas: 0 }, compras: 0, entregas: {}, repartos: {} };
    const pedidos = await tx.select({ estado: pedido.estado, n: count() }).from(pedido).where(eq(pedido.jornadaId, j.id)).groupBy(pedido.estado);
    const [l] = await tx
      .select({
        desactualizada: listaCompra.desactualizada,
        lineas: sql<number>`(select count(*) from ${listaCompraItem} i where i.lista_compra_id = lista_compra.id)`,
        compradas: sql<number>`(select count(*) from ${listaCompraItem} i where i.lista_compra_id = lista_compra.id and i.estado in ('COMPRADO', 'NO_CONSEGUIDO'))`,
      })
      .from(listaCompra)
      .where(eq(listaCompra.jornadaId, j.id));
    const [c] = await tx.select({ n: count() }).from(compra).where(and(eq(compra.jornadaId, j.id), eq(compra.estado, "REGISTRADA")));
    const entregas = await tx.select({ estado: entrega.estado, n: count() }).from(entrega).where(and(eq(entrega.jornadaId, j.id), ne(entrega.estado, "ANULADA"))).groupBy(entrega.estado);
    const repartos = await tx.select({ estado: reparto.estado, n: count() }).from(reparto).where(and(eq(reparto.jornadaId, j.id), ne(reparto.estado, "ANULADO"))).groupBy(reparto.estado);
    const [pasos] = await tx
      .select({ compra: jornada.compraIniciadaEn, preparacion: jornada.preparacionIniciadaEn, reparto: jornada.repartoIniciadoEn, cierre: jornada.cerradaEn })
      .from(jornada)
      .where(eq(jornada.id, j.id));
    return {
      fecha,
      estado: j.estado,
      pasos: pasos!,
      pedidos: porEstado(pedidos),
      lista: { armada: Boolean(l), desactualizada: l?.desactualizada ?? false, lineas: Number(l?.lineas ?? 0), compradas: Number(l?.compradas ?? 0) },
      compras: Number(c?.n ?? 0),
      entregas: porEstado(entregas),
      repartos: porEstado(repartos),
    };
  });
}
