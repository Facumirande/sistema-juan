import { dec, sumar, type Decimal, type ValorDecimal } from "@/dominio/dinero/decimal";

// La cuenta de un cliente ("A cobrar"): lo que se le entregó, lo que pagó y lo que queda. No hay que
// decir a qué entrega va cada cobro: lo cobrado cancela siempre lo más viejo, así que lo que queda
// sin cobrar es lo más nuevo. Si un cobro se hizo por una entrega en particular ("💵 Cobrado" en esa
// entrega), paga primero esa.

export type EstadoDeCobro = "COBRADA" | "PARCIAL" | "PENDIENTE";

export interface EntregaACobrar {
  id: string;
  /** Día de la entrega (AAAA-MM-DD): lo más viejo se cobra primero. */
  fecha: string;
  importe: ValorDecimal;
}

export interface CobroHecho {
  monto: ValorDecimal;
  /** La entrega por la que se cobró, si se cobró por una en particular. */
  entregaId: string | null;
}

export interface CuentaDeCliente {
  entregas: { id: string; fecha: string; importe: Decimal; cobrado: Decimal; pendiente: Decimal; estado: EstadoDeCobro }[];
  /** Lo que queda sin cobrar de lo que debía antes de empezar a usar el sistema. */
  saldoInicialPendiente: Decimal;
  /** Todo lo que debió alguna vez: lo de antes más lo entregado. */
  total: Decimal;
  cobrado: Decimal;
  /** Lo que falta cobrar. */
  aCobrar: Decimal;
  /** Lo que pagó de más (queda a su favor). */
  aFavor: Decimal;
}

const menor = (a: Decimal, b: Decimal) => (a.lt(b) ? a : b);

/**
 * Reparte lo cobrado entre lo que debe el cliente: primero cada cobro hecho por una entrega paga esa
 * entrega; lo demás (y lo que sobre) cancela de lo más viejo a lo más nuevo, empezando por lo que
 * debía de antes. Un cobro por una entrega que ya no cuenta (se anuló) va a lo más viejo.
 */
export function repartirCobros(saldoInicial: ValorDecimal, entregas: readonly EntregaACobrar[], cobros: readonly CobroHecho[]): CuentaDeCliente {
  const enOrden = [...entregas].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const pendiente = new Map(enOrden.map((e) => [e.id, dec(e.importe)]));
  // 1. Los cobros hechos por una entrega: pagan esa entrega; lo que pase de su importe queda para repartir.
  let paraRepartir = dec(0);
  for (const c of cobros) {
    const debe = c.entregaId ? pendiente.get(c.entregaId) : undefined;
    const aplica = debe ? menor(dec(c.monto), debe) : dec(0);
    if (debe && c.entregaId) pendiente.set(c.entregaId, debe.minus(aplica));
    paraRepartir = paraRepartir.plus(dec(c.monto).minus(aplica));
  }
  // 2. Lo demás cancela lo más viejo: primero lo que debía de antes, después cada entrega por fecha.
  let saldoInicialPendiente = dec(saldoInicial);
  const aLoDeAntes = menor(paraRepartir, saldoInicialPendiente);
  saldoInicialPendiente = saldoInicialPendiente.minus(aLoDeAntes);
  paraRepartir = paraRepartir.minus(aLoDeAntes);
  for (const e of enOrden) {
    const debe = pendiente.get(e.id)!;
    const aplica = menor(paraRepartir, debe);
    pendiente.set(e.id, debe.minus(aplica));
    paraRepartir = paraRepartir.minus(aplica);
  }
  const detalle = enOrden.map((e) => {
    const importe = dec(e.importe);
    const falta = pendiente.get(e.id)!;
    const estado: EstadoDeCobro = falta.isZero() ? "COBRADA" : falta.eq(importe) ? "PENDIENTE" : "PARCIAL";
    return { id: e.id, fecha: e.fecha, importe, cobrado: importe.minus(falta), pendiente: falta, estado };
  });
  const total = dec(saldoInicial).plus(sumar(enOrden.map((e) => e.importe)));
  const cobrado = sumar(cobros.map((c) => c.monto));
  return {
    entregas: detalle,
    saldoInicialPendiente,
    total,
    cobrado,
    aCobrar: saldoInicialPendiente.plus(sumar(detalle.map((e) => e.pendiente))),
    aFavor: paraRepartir,
  };
}

/** Desde cuándo debe: el día de la entrega más vieja con algo sin cobrar (nulo si no debe entregas). */
export function debeDesde(cuenta: CuentaDeCliente): string | null {
  return cuenta.entregas.find((e) => !e.pendiente.isZero())?.fecha ?? null;
}
