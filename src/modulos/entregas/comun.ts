import { and, eq, inArray } from "drizzle-orm";

import { empresa, entrega, entregaItem, jornada, pedido, pedidoItem } from "@/db/esquema";
import type { Transaccion } from "@/db/tipos";
import { ErrorDeNegocio } from "@/dominio/errores";
import { formatearNumeroDocumento } from "@/dominio/numeracion/numeracion";
import type { EstadoPedido } from "@/dominio/precios/venta";

// Piezas compartidas de preparación, repartos y entregas.

export const numeroEntrega = (n: number) => formatearNumeroDocumento("ENT-", n);
export const numeroReparto = (n: number) => formatearNumeroDocumento("REP-", n);

export const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export async function configuracionEmpresa(tx: Transaccion) {
  const [e] = await tx.select().from(empresa);
  if (!e) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró la configuración de la empresa.");
  return e;
}

export async function jornadaDeFecha(tx: Transaccion, fecha: string) {
  if (!PATRON_FECHA.test(fecha)) throw new ErrorDeNegocio("VALIDACION", "Elegí el día de entrega.");
  const [j] = await tx.select().from(jornada).where(eq(jornada.fecha, fecha));
  return j ?? null;
}

/** La entrega bloqueada hasta el final de la transacción (dos personas no la cambian a la vez). */
export async function entregaBloqueada(tx: Transaccion, entregaId: string) {
  const [e] = await tx.select().from(entrega).where(eq(entrega.id, entregaId)).for("update");
  if (!e) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró la entrega.");
  return e;
}

export function exigirJornadaAbierta(j: { estado: string } | undefined | null) {
  if (j?.estado === "CERRADA") throw new ErrorDeNegocio("JORNADA_CERRADA", "La jornada ya está cerrada (RN-041).");
}

/** Los pedidos de una entrega avanzan con ella (04 §5.e y §5.f); nunca retroceden desde ENTREGADO ni CANCELADO. */
export async function moverPedidosDeEntrega(tx: Transaccion, entregaId: string, desde: readonly EstadoPedido[], hasta: EstadoPedido): Promise<void> {
  await moverPedidosDeEntregas(tx, [entregaId], desde, hasta);
}

/** Lo mismo para varias entregas, en una sola consulta (una ida a la base): los pedidos con líneas en ellas. */
export async function moverPedidosDeEntregas(tx: Transaccion, entregaIds: readonly string[], desde: readonly EstadoPedido[], hasta: EstadoPedido): Promise<void> {
  if (entregaIds.length === 0) return;
  await tx
    .update(pedido)
    .set({ estado: hasta })
    .where(
      and(
        inArray(pedido.id, tx.selectDistinct({ id: pedidoItem.pedidoId }).from(entregaItem).innerJoin(pedidoItem, eq(pedidoItem.id, entregaItem.pedidoItemId)).where(inArray(entregaItem.entregaId, [...entregaIds]))),
        inArray(pedido.estado, [...desde]),
      ),
    );
}

/** La única fila de una consulta de agregados (count, sum). */
export function unico<T>(filas: readonly T[]): T {
  if (filas.length === 0) throw new Error("La consulta no devolvió filas.");
  return filas[0]!;
}
