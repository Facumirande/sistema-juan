import Decimal from "decimal.js";

import { dec, redondearPesos, sumar, type ValorDecimal } from "../dinero/decimal";
import { presentacionesNecesarias } from "../unidades/unidades";

import type { EstadoLineaLista } from "./lista";

// Lo que cuesta la compra de un día, y cuánto va en efectivo y cuánto a crédito (pedido del usuario,
// 13/10/2026: "que calcules bien el costo total de la compra en efectivo y cuánto en crédito").
//
// - Lo ya anotado se cuenta a lo que salió: de cada compra, lo que ya está pagado va en efectivo y lo
//   que falta pagarle al puesto, a crédito (una compra pagada en parte reparte cada producto en esa
//   misma proporción).
// - Lo que todavía falta comprar —o lo que se tildó sin anotar el precio— se calcula con el último
//   precio del puesto elegido, por lo que falta de verdad (no por lo que faltaba al armar la lista).
//   Va en efectivo si el producto no tiene puesto y a crédito si lo tiene, que es como queda la compra
//   al anotarla si no se dice otra cosa (RN-191).
// - Lo que no se consiguió no cuesta nada, y un producto sin precio no entra en la cuenta: se avisa.

export interface RenglonParaCostear {
  estado: EstadoLineaLista;
  /** Cada compra anotada de ese producto: lo que salió y cuánto de eso ya está pagado. */
  compras: readonly { subtotal: ValorDecimal; pagado: ValorDecimal }[];
  /** Lo ya comprado y lo que falta, en la unidad del producto. */
  compradoBase: ValorDecimal;
  pendienteBase: ValorDecimal;
  /** Cuánto trae el envase en el que se compra y a cuánto está en el puesto elegido (nulo: sin precio). */
  factor: ValorDecimal;
  precioSugerido: ValorDecimal | null;
  /** Lo calculado al armar la lista: vale mientras no se compró nada (respeta la cantidad puesta a mano). */
  costoEstimado: ValorDecimal | null;
  /** Sin puesto (o en el puesto genérico de efectivo): lo que falta se paga en el momento. */
  enEfectivo: boolean;
}

/** Un importe partido en lo que ya está anotado y lo que se calcula. */
export interface ParteDelCosto {
  anotado: Decimal;
  calculado: Decimal;
  total: Decimal;
}

export interface CostoDeLaLista {
  total: ParteDelCosto;
  efectivo: ParteDelCosto;
  credito: ParteDelCosto;
  /** Productos que faltan comprar (o se tildaron) y no tienen precio: no entran en la cuenta. */
  sinPrecio: number;
}

const CERO = new Decimal(0);

/** Lo que sale lo que falta de un producto, en pesos; nulo si no hay con qué calcularlo. Cero si no falta nada. */
export function costoDeLoQueFalta(r: RenglonParaCostear): Decimal | null {
  const pendiente = dec(r.pendienteBase);
  if (r.estado === "NO_CONSEGUIDO" || pendiente.lte(0)) return CERO;
  const comprado = dec(r.compradoBase);
  // Sin nada comprado todavía, vale lo calculado al armar la lista.
  if (comprado.lte(0) && r.costoEstimado !== null && dec(r.costoEstimado).gt(0)) return redondearPesos(r.costoEstimado);
  if (r.precioSugerido !== null && dec(r.precioSugerido).gt(0)) return redondearPesos(presentacionesNecesarias(pendiente, r.factor).cantidad.times(r.precioSugerido));
  // Sin precio en el puesto, pero ya se compró una parte: se sigue con lo que salió eso.
  const gastado = sumar(r.compras.map((k) => k.subtotal));
  if (comprado.gt(0) && gastado.gt(0)) return redondearPesos(pendiente.times(gastado).div(comprado));
  return null;
}

/** El costo de la compra del día: total, en efectivo y a crédito, separando lo anotado de lo calculado. */
export function costoDeLaLista(renglones: readonly RenglonParaCostear[]): CostoDeLaLista {
  const acumulado = { efectivoAnotado: CERO, creditoAnotado: CERO, efectivoCalculado: CERO, creditoCalculado: CERO };
  let sinPrecio = 0;
  for (const r of renglones) {
    for (const k of r.compras) {
      const subtotal = Decimal.max(dec(k.subtotal), 0);
      const pagado = redondearPesos(Decimal.min(Decimal.max(dec(k.pagado), 0), subtotal));
      acumulado.efectivoAnotado = acumulado.efectivoAnotado.plus(pagado);
      acumulado.creditoAnotado = acumulado.creditoAnotado.plus(subtotal.minus(pagado));
    }
    const falta = costoDeLoQueFalta(r);
    if (falta === null) sinPrecio++;
    else if (r.enEfectivo) acumulado.efectivoCalculado = acumulado.efectivoCalculado.plus(falta);
    else acumulado.creditoCalculado = acumulado.creditoCalculado.plus(falta);
  }
  const parte = (anotado: Decimal, calculado: Decimal): ParteDelCosto => ({ anotado, calculado, total: anotado.plus(calculado) });
  const efectivo = parte(acumulado.efectivoAnotado, acumulado.efectivoCalculado);
  const credito = parte(acumulado.creditoAnotado, acumulado.creditoCalculado);
  return { efectivo, credito, total: parte(efectivo.anotado.plus(credito.anotado), efectivo.calculado.plus(credito.calculado)), sinPrecio };
}

/**
 * Reparte lo pagado de una compra entre sus productos, en proporción a lo que salió cada uno (la
 * compra se paga entera, no producto por producto). Todo en pesos enteros y sin perder ninguno: la
 * suma da justo lo pagado.
 */
export function repartirLoPagado(subtotales: readonly ValorDecimal[], total: ValorDecimal, pagado: ValorDecimal): Decimal[] {
  const t = dec(total);
  if (t.lte(0)) return subtotales.map(() => CERO);
  let restante = redondearPesos(Decimal.min(Decimal.max(dec(pagado), 0), t));
  const pagadoDeLaCompra = restante;
  return subtotales.map((s, i) => {
    const subtotal = Decimal.max(dec(s), 0);
    // El último se lleva lo que queda, para que el redondeo no pierda ni invente un peso.
    const parte = Decimal.min(i === subtotales.length - 1 ? restante : redondearPesos(subtotal.times(pagadoDeLaCompra).div(t)), subtotal, restante);
    restante = restante.minus(parte);
    return parte;
  });
}
