import Decimal from "decimal.js";

import { dec, redondear2, sumar, type ValorDecimal } from "../dinero/decimal";
import { ErrorDeNegocio } from "../errores";
import { diasEntre, type FechaISO } from "../fechas/fechas";

// Crédito con proveedores (06 §8 y §9). Montos con signo: positivo = se le debe al proveedor.

export type Semaforo = "SIN_LIMITE" | "VERDE" | "AMARILLO" | "ROJO" | "EXCEDIDO";
export type EstadoPagoCompra = "PAGADA" | "PARCIAL" | "PENDIENTE";

export interface Umbrales {
  amarilloPct: ValorDecimal;
  rojoPct: ValorDecimal;
}

export interface IndicadoresCredito {
  saldoNeto: Decimal;
  /** = crédito utilizado. */
  saldoPendiente: Decimal;
  saldoAFavor: Decimal;
  /** Nulo si no tiene límite. */
  disponible: Decimal | null;
  /** % de uso del límite (2 decimales); nulo sin límite o con límite 0. */
  usoPct: Decimal | null;
  semaforo: Semaforo;
}

/** Semáforo por % de uso del límite (RN-104): VERDE < 70 ≤ AMARILLO < 90 ≤ ROJO ≤ 100 < EXCEDIDO. */
export function semaforoPorUso(usoPct: ValorDecimal, u: Umbrales): Semaforo {
  const uso = dec(usoPct);
  if (uso.gt(100)) return "EXCEDIDO";
  if (uso.gte(dec(u.rojoPct))) return "ROJO";
  if (uso.gte(dec(u.amarilloPct))) return "AMARILLO";
  return "VERDE";
}

/** Indicadores de la cuenta de un proveedor (06 §8.3, RN-103). */
export function indicadoresCredito(saldoNeto: ValorDecimal, limite: ValorDecimal | null, u: Umbrales): IndicadoresCredito {
  const neto = dec(saldoNeto);
  const saldoPendiente = Decimal.max(neto, 0);
  const saldoAFavor = Decimal.max(neto.neg(), 0);
  if (limite === null) return { saldoNeto: neto, saldoPendiente, saldoAFavor, disponible: null, usoPct: null, semaforo: "SIN_LIMITE" };
  const lim = dec(limite);
  const disponible = lim.minus(neto);
  if (lim.isZero()) {
    return { saldoNeto: neto, saldoPendiente, saldoAFavor, disponible, usoPct: null, semaforo: saldoPendiente.gt(0) ? "EXCEDIDO" : "VERDE" };
  }
  const usoPct = redondear2(saldoPendiente.div(lim).times(100));
  return { saldoNeto: neto, saldoPendiente, saldoAFavor, disponible, usoPct, semaforo: semaforoPorUso(usoPct, u) };
}

export type ResultadoLimite =
  | { resultado: "OK" }
  | { resultado: "ADVERTENCIA"; usoProyectadoPct: Decimal }
  | { resultado: "BLOQUEO"; exceso: Decimal; saldoProyectado: Decimal };

/**
 * Control del límite al registrar una compra (06 §9.2, RN-063): bloquea si la parte a crédito
 * hace superar el límite; advierte si queda en ROJO. `exceso` es lo que habría que pagar en el
 * momento para no pasarse.
 */
export function verificarLimite(p: {
  limite: ValorDecimal | null;
  saldoActual: ValorDecimal;
  totalCompra: ValorDecimal;
  pagadoEnElActo: ValorDecimal;
  rojoPct: ValorDecimal;
}): ResultadoLimite {
  if (p.limite === null) return { resultado: "OK" };
  const aCredito = dec(p.totalCompra).minus(p.pagadoEnElActo);
  if (aCredito.lte(0)) return { resultado: "OK" };
  const limite = dec(p.limite);
  const saldoProyectado = dec(p.saldoActual).plus(aCredito);
  if (saldoProyectado.gt(limite)) return { resultado: "BLOQUEO", exceso: saldoProyectado.minus(limite), saldoProyectado };
  const usoProyectadoPct = redondear2(saldoProyectado.div(limite).times(100));
  return usoProyectadoPct.gte(dec(p.rojoPct)) ? { resultado: "ADVERTENCIA", usoProyectadoPct } : { resultado: "OK" };
}

/** Estado de pago de una compra según lo imputado (RN-099). */
export function estadoPagoCompra(total: ValorDecimal, pagado: ValorDecimal): EstadoPagoCompra {
  const pendiente = dec(total).minus(pagado);
  if (pendiente.lte(0)) return "PAGADA";
  if (dec(pagado).lte(0)) return "PENDIENTE";
  return "PARCIAL";
}

export interface PartidaDeudora {
  id: string;
  pendiente: ValorDecimal;
}

/**
 * Imputación FIFO (RN-096): recorre las partidas en el orden recibido (la más vieja primero) y
 * reparte el monto. Devuelve las imputaciones y lo que sobra (saldo a favor, RN-098).
 */
export function imputarFIFO(partidas: readonly PartidaDeudora[], monto: ValorDecimal): { imputaciones: { id: string; monto: Decimal }[]; sobrante: Decimal } {
  let resto = dec(monto);
  const imputaciones: { id: string; monto: Decimal }[] = [];
  for (const p of partidas) {
    if (resto.lte(0)) break;
    const pendiente = dec(p.pendiente);
    if (pendiente.lte(0)) continue;
    const aplicado = Decimal.min(pendiente, resto);
    imputaciones.push({ id: p.id, monto: aplicado });
    resto = resto.minus(aplicado);
  }
  return { imputaciones, sobrante: resto };
}

/** Costo real ponderado (05 §4.2): Σ subtotales ÷ Σ cantidades base, 4 decimales. Nulo si no se compró nada. */
export function costoRealPonderado(items: readonly { cantidadBase: ValorDecimal; subtotal: ValorDecimal }[]): Decimal | null {
  const cantidad = sumar(items.map((i) => i.cantidadBase));
  if (cantidad.lte(0)) return null;
  return sumar(items.map((i) => i.subtotal))
    .div(cantidad)
    .toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}

/**
 * Aplica lo no imputado de pagos y créditos a las deudas pendientes (RN-098, 06 §4.4): cada
 * crédito (el más viejo primero) cancela deudas por FIFO. Devuelve los pares a imputar.
 */
export function conciliarFIFO(
  acreedoras: readonly { id: string; libre: ValorDecimal }[],
  deudoras: readonly PartidaDeudora[],
): { acreedorId: string; deudorId: string; monto: Decimal }[] {
  const pendientes = deudoras.map((d) => ({ id: d.id, pendiente: dec(d.pendiente) }));
  const pares: { acreedorId: string; deudorId: string; monto: Decimal }[] = [];
  for (const a of acreedoras) {
    const { imputaciones } = imputarFIFO(pendientes, a.libre);
    for (const i of imputaciones) {
      pares.push({ acreedorId: a.id, deudorId: i.id, monto: i.monto });
      const d = pendientes.find((x) => x.id === i.id)!;
      d.pendiente = d.pendiente.minus(i.monto);
    }
  }
  return pares;
}

/**
 * Imputación manual de un pago (RN-097): cada importe mayor que 0 y no mayor que lo pendiente de
 * esa deuda; la suma no mayor que el pago. Devuelve lo que queda a favor.
 */
export function validarImputacionManual(
  pendientes: readonly PartidaDeudora[],
  asignaciones: readonly { id: string; monto: ValorDecimal }[],
  montoPago: ValorDecimal,
): Decimal {
  for (const a of asignaciones) {
    const p = pendientes.find((x) => x.id === a.id);
    if (!p) throw new ErrorDeNegocio("VALIDACION", "Una de las compras elegidas ya no tiene deuda pendiente.");
    if (dec(a.monto).lte(0)) throw new ErrorDeNegocio("VALIDACION", "Cada importe asignado tiene que ser mayor que $0.");
    if (dec(a.monto).gt(p.pendiente)) throw new ErrorDeNegocio("VALIDACION", "No se puede asignar a una compra más de lo que tiene pendiente (RN-097).");
  }
  const asignado = sumar(asignaciones.map((a) => a.monto));
  if (asignado.gt(montoPago)) throw new ErrorDeNegocio("VALIDACION", "Lo asignado a las compras supera el monto del pago (RN-097).");
  return dec(montoPago).minus(asignado);
}

/** Días de atraso de una deuda (06 §7): nulo si no venció o no tiene vencimiento. */
export function diasDeAtraso(vence: FechaISO | null, hoy: FechaISO): number | null {
  if (vence === null) return null;
  const dias = diasEntre(vence, hoy);
  return dias > 0 ? dias : null;
}

export interface ResumenVencimientos {
  vencida: Decimal;
  /** Vence entre hoy y hoy + días de aviso (inclusive). */
  porVencer: Decimal;
  proximo: { fecha: FechaISO; monto: Decimal } | null;
  maxDiasAtraso: number | null;
}

/** Deuda vencida, por vencer y próximo vencimiento de un proveedor (06 §7, RN-106, RN-107). */
export function resumenVencimientos(partidas: readonly { pendiente: ValorDecimal; vence: FechaISO | null }[], hoy: FechaISO, diasAviso: number): ResumenVencimientos {
  let vencida = dec(0);
  let porVencer = dec(0);
  let maxDiasAtraso: number | null = null;
  const futuras = new Map<FechaISO, Decimal>();
  for (const p of partidas) {
    const pendiente = dec(p.pendiente);
    if (pendiente.lte(0) || p.vence === null) continue;
    const atraso = diasDeAtraso(p.vence, hoy);
    if (atraso !== null) {
      vencida = vencida.plus(pendiente);
      maxDiasAtraso = Math.max(maxDiasAtraso ?? 0, atraso);
      continue;
    }
    if (diasEntre(hoy, p.vence) <= diasAviso) porVencer = porVencer.plus(pendiente);
    futuras.set(p.vence, (futuras.get(p.vence) ?? dec(0)).plus(pendiente));
  }
  const [fecha] = [...futuras.keys()].sort();
  return { vencida, porVencer, proximo: fecha ? { fecha, monto: futuras.get(fecha)! } : null, maxDiasAtraso };
}

/** Libro con Debe, Haber y saldo acumulado (06 §11, DOC-05). */
export function libroConSaldo(saldoInicial: ValorDecimal, movimientos: readonly { importe: ValorDecimal }[]): { debe: Decimal; haber: Decimal; saldo: Decimal }[] {
  let saldo = dec(saldoInicial);
  return movimientos.map((m) => {
    const importe = dec(m.importe);
    saldo = saldo.plus(importe);
    return { debe: importe.gt(0) ? importe : dec(0), haber: importe.lt(0) ? importe.neg() : dec(0), saldo };
  });
}
