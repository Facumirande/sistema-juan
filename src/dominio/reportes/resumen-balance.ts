import { dec, redondearPesos, type Decimal, type ValorDecimal } from "../dinero/decimal";

// El resumen balance del tablero (pedido del usuario, 10/10/2026): lo gastado en un día, separado
// en lo ya pagado y lo que quedó a crédito, frente a la caja inicial (la plata con la que se cuenta).
//
// - Gastos: lo comprado para ese día más los gastos anotados con esa fecha.
// - Crédito: lo que falta pagar de esas compras (lo comprado a cuenta).
// - Pagado: el resto. Lo ya pagado de esas compras y los gastos, que siempre salen de la caja.
// - Pagado + Crédito = Gastos, siempre (en pesos enteros).
// - Si los gastos superan la caja inicial, `exceso` dice por cuánto: es lo que se avisa.

const mayor = (a: Decimal, b: Decimal) => (a.gt(b) ? a : b);
const menor = (a: Decimal, b: Decimal) => (a.lt(b) ? a : b);

export interface ResumenBalance {
  gastos: Decimal;
  pagado: Decimal;
  credito: Decimal;
  /** La plata con la que se cuenta ese día; nula si todavía no se cargó. */
  cajaInicial: Decimal | null;
  /** Por cuánto superan los gastos a la caja inicial; nulo si no la superan o si no está cargada. */
  exceso: Decimal | null;
}

export function resumenBalance(datos: {
  /** El total de las compras del día. */
  compras: ValorDecimal;
  /** Lo que ya se pagó de esas compras. */
  pagadoDeCompras: ValorDecimal;
  /** Los gastos anotados con esa fecha (nafta, peajes…). */
  gastos: ValorDecimal;
  cajaInicial: ValorDecimal | null;
}): ResumenBalance {
  const compras = mayor(dec(datos.compras), dec(0));
  const pagadoDeCompras = menor(mayor(dec(datos.pagadoDeCompras), dec(0)), compras);
  const gastos = redondearPesos(compras.plus(datos.gastos));
  const credito = menor(redondearPesos(compras.minus(pagadoDeCompras)), gastos);
  const cajaInicial = datos.cajaInicial === null ? null : redondearPesos(datos.cajaInicial);
  return {
    gastos,
    pagado: gastos.minus(credito),
    credito,
    cajaInicial,
    exceso: cajaInicial !== null && gastos.gt(cajaInicial) ? gastos.minus(cajaInicial) : null,
  };
}
