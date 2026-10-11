import { dec, redondearPesos, type Decimal, type ValorDecimal } from "../dinero/decimal";

// El resumen balance del tablero (pedido del usuario, 10 y 11/10/2026): cuatro números del día que
// se mira, en dos apartados, y la caja inicial.
//
// - Pagado: lo que ya se pagó. Las compras de ese día que se pagaron (en efectivo o por
//   transferencia) y los gastos anotados con esa fecha, que siempre salen de la caja.
// - Crédito: lo que se retiró de los proveedores ese día y todavía falta pagar (el "retirado sin
//   pagar" del balance).
// - Ganancia: lo que ya se cobró de lo entregado ese día menos lo pagado. Mientras no se cobra es
//   negativa: es plata que salió y todavía no volvió.
// - A cobrar: lo entregado ese día que los clientes todavía no pagaron.
// - Caja inicial: la plata con la que se cuenta ese día. Si los gastos del día (lo pagado más lo
//   que quedó a crédito) la superan, `exceso` dice por cuánto: es lo que se avisa.

const mayor = (a: Decimal, b: Decimal) => (a.gt(b) ? a : b);
const menor = (a: Decimal, b: Decimal) => (a.lt(b) ? a : b);

export interface ResumenBalance {
  pagado: Decimal;
  credito: Decimal;
  /** Lo ya cobrado menos lo pagado; negativa mientras salió más plata de la que volvió. */
  ganancia: Decimal;
  aCobrar: Decimal;
  /** Lo pagado más el crédito: lo que se compara con la caja inicial. No se muestra en el cartel. */
  gastos: Decimal;
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
  /** Lo que los clientes ya pagaron de lo entregado ese día. */
  cobrado: ValorDecimal;
  /** Lo entregado ese día que todavía no pagaron. */
  aCobrar: ValorDecimal;
  cajaInicial: ValorDecimal | null;
}): ResumenBalance {
  const compras = mayor(dec(datos.compras), dec(0));
  const pagadoDeCompras = menor(mayor(dec(datos.pagadoDeCompras), dec(0)), compras);
  const gastos = redondearPesos(compras.plus(datos.gastos));
  const credito = menor(redondearPesos(compras.minus(pagadoDeCompras)), gastos);
  const pagado = gastos.minus(credito);
  const cajaInicial = datos.cajaInicial === null ? null : redondearPesos(datos.cajaInicial);
  return {
    pagado,
    credito,
    ganancia: redondearPesos(mayor(dec(datos.cobrado), dec(0))).minus(pagado),
    aCobrar: redondearPesos(mayor(dec(datos.aCobrar), dec(0))),
    gastos,
    cajaInicial,
    exceso: cajaInicial !== null && gastos.gt(cajaInicial) ? gastos.minus(cajaInicial) : null,
  };
}
