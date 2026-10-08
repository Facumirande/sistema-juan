import { and, count, eq, inArray, ne, sql } from "drizzle-orm";

import { compra, documentoEmitido, entrega, jornada, listaCompra, listaCompraItem, pedido, reparto } from "@/db/esquema";
import type { Transaccion } from "@/db/tipos";
import { ErrorDeNegocio } from "@/dominio/errores";
import type { FechaISO } from "@/dominio/fechas/fechas";

import { PATRON_FECHA } from "./comun";

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
  if (!PATRON_FECHA.test(fecha)) throw new ErrorDeNegocio("VALIDACION", "Elegí el día de entrega.");
  // El día se busca por su fecha dentro de cada consulta: así todas las cuentas salen juntas, en una
  // sola ida a la base, sin tener que averiguar antes cuál es el día.
  const delDia = () => tx.select({ id: jornada.id }).from(jornada).where(eq(jornada.fecha, fecha));
  const vigentes = and(inArray(entrega.jornadaId, delDia()), ne(entrega.estado, "ANULADA"));
  const [[j], pedidos, [l], [c], entregas, [docs], repartos] = await Promise.all([
    tx
      .select({ estado: jornada.estado, compra: jornada.compraIniciadaEn, preparacion: jornada.preparacionIniciadaEn, reparto: jornada.repartoIniciadoEn, cierre: jornada.cerradaEn })
      .from(jornada)
      .where(eq(jornada.fecha, fecha)),
    tx.select({ estado: pedido.estado, n: count() }).from(pedido).where(inArray(pedido.jornadaId, delDia())).groupBy(pedido.estado),
    tx
      .select({
        desactualizada: listaCompra.desactualizada,
        lineas: sql<number>`(select count(*) from ${listaCompraItem} i where i.lista_compra_id = lista_compra.id)`,
        compradas: sql<number>`(select count(*) from ${listaCompraItem} i where i.lista_compra_id = lista_compra.id and i.estado in ('COMPRADO', 'NO_CONSEGUIDO'))`,
      })
      .from(listaCompra)
      .where(inArray(listaCompra.jornadaId, delDia())),
    tx.select({ n: count() }).from(compra).where(and(inArray(compra.jornadaId, delDia()), eq(compra.estado, "REGISTRADA"))),
    tx.select({ estado: entrega.estado, n: count() }).from(entrega).where(vigentes).groupBy(entrega.estado),
    // Con una sola tabla, Drizzle escribe las columnas sin el nombre de la tabla: en la subconsulta
    // van con el nombre completo.
    tx
      .select({
        conDocumentos: sql<number>`count(*) filter (where entrega.version > 0 and exists (select 1 from ${documentoEmitido} d where d.entrega_id = entrega.id and d.tipo = 'DOC_02' and d.version = entrega.version and d.evento = 'EMISION'))`,
        sinReparto: sql<number>`count(*) filter (where entrega.reparto_id is null and entrega.estado <> 'ENTREGADA')`,
      })
      .from(entrega)
      .where(vigentes),
    tx.select({ estado: reparto.estado, n: count() }).from(reparto).where(and(inArray(reparto.jornadaId, delDia()), ne(reparto.estado, "ANULADO"))).groupBy(reparto.estado),
  ]);
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
  return {
    fecha,
    estado: j.estado,
    pasos: { compra: j.compra, preparacion: j.preparacion, reparto: j.reparto, cierre: j.cierre },
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
