import { and, count, eq, ne, sql } from "drizzle-orm";

import { compra, documentoEmitido, entrega, jornada, listaCompra, listaCompraItem, pedido, reparto } from "@/db/esquema";
import type { Transaccion } from "@/db/tipos";
import type { FechaISO } from "@/dominio/fechas/fechas";

import { jornadaDeFecha } from "./comun";

// Cuánto falta en cada etapa de un día (lo usa el paso a paso del tablero).

export interface PanelJornada {
  fecha: FechaISO;
  estado: string | null;
  pasos: { compra: Date | null; preparacion: Date | null; reparto: Date | null; cierre: Date | null };
  pedidos: Record<string, number>;
  /** `fueraDeLista`: pedidos confirmados que no se agregaron a la lista (se eligen en el tablero). */
  lista: { armada: boolean; desactualizada: boolean; lineas: number; compradas: number; fueraDeLista: number };
  compras: number;
  entregas: Record<string, number>;
  /** Entregas vigentes con la lista de entrega emitida en su versión actual (RN-122). */
  conDocumentos: number;
  /** Entregas vigentes sin entregar que todavía no están en ningún reparto. */
  sinReparto: number;
  repartos: Record<string, number>;
}

const porEstado = (filas: { estado: string; n: number }[]) => Object.fromEntries(filas.map((f) => [f.estado, Number(f.n)]));

export async function panelEnTransaccion(tx: Transaccion, fecha: FechaISO): Promise<PanelJornada> {
  const j = await jornadaDeFecha(tx, fecha);
  if (!j) {
    return {
      fecha,
      estado: null,
      pasos: { compra: null, preparacion: null, reparto: null, cierre: null },
      pedidos: {},
      lista: { armada: false, desactualizada: false, lineas: 0, compradas: 0, fueraDeLista: 0 },
      compras: 0,
      entregas: {},
      conDocumentos: 0,
      sinReparto: 0,
      repartos: {},
    };
  }
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
  const vigentes = and(eq(entrega.jornadaId, j.id), ne(entrega.estado, "ANULADA"));
  const entregas = await tx.select({ estado: entrega.estado, n: count() }).from(entrega).where(vigentes).groupBy(entrega.estado);
  // Con una sola tabla, Drizzle escribe las columnas sin el nombre de la tabla: en la subconsulta
  // van con el nombre completo.
  const [docs] = await tx
    .select({
      conDocumentos: sql<number>`count(*) filter (where entrega.version > 0 and exists (select 1 from ${documentoEmitido} d where d.entrega_id = entrega.id and d.tipo = 'DOC_02' and d.version = entrega.version and d.evento = 'EMISION'))`,
      sinReparto: sql<number>`count(*) filter (where entrega.reparto_id is null and entrega.estado <> 'ENTREGADA')`,
    })
    .from(entrega)
    .where(vigentes);
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
    lista: {
      armada: Boolean(l),
      desactualizada: l?.desactualizada ?? false,
      lineas: Number(l?.lineas ?? 0),
      compradas: Number(l?.compradas ?? 0),
      fueraDeLista: l ? (porEstado(pedidos).CONFIRMADO ?? 0) : 0,
    },
    compras: Number(c?.n ?? 0),
    entregas: porEstado(entregas),
    conDocumentos: Number(docs?.conDocumentos ?? 0),
    sinReparto: Number(docs?.sinReparto ?? 0),
    repartos: porEstado(repartos),
  };
}
