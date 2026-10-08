import { dec, type Decimal, type ValorDecimal } from "@/dominio/dinero/decimal";

// El balance del dinero (pedido del usuario, 07/10/2026). Hay dos clases de plata:
//  - la REAL: la que ya entró o salió (lo que pagaron los clientes y los ingresos extra, menos lo
//    que se les pagó a los proveedores y los gastos);
//  - la PENDIENTE ("virtual"): la que todavía no se movió pero ya se debe: lo que falta cobrar
//    (se entregó y no se cobró) menos lo que falta pagar (se retiró del proveedor y no se pagó).
// El balance total es la suma de las dos: lo que quedaría si hoy se cobrara y se pagara todo.

export interface DatosDelDinero {
  /** Lo que pagaron los clientes. */
  cobrado: ValorDecimal;
  /** Ingresos extra (lo que no es venta de mercadería). */
  ingresos: ValorDecimal;
  /** Lo que se les pagó a los proveedores. */
  pagado: ValorDecimal;
  /** Gastos generales (nafta, arreglos…). */
  gastos: ValorDecimal;
  /** Lo entregado que todavía no se cobró. */
  aCobrar: ValorDecimal;
  /** Lo retirado de los proveedores que todavía no se pagó. */
  aPagar: ValorDecimal;
}

export interface BalanceDeDinero {
  entro: Decimal;
  salio: Decimal;
  /** Entró − salió. */
  real: Decimal;
  /** A cobrar − a pagar. */
  pendiente: Decimal;
  /** Real + pendiente. */
  total: Decimal;
}

export function balanceDeDinero(d: DatosDelDinero): BalanceDeDinero {
  const entro = dec(d.cobrado).plus(d.ingresos);
  const salio = dec(d.pagado).plus(d.gastos);
  const real = entro.minus(salio);
  const pendiente = dec(d.aCobrar).minus(d.aPagar);
  return { entro, salio, real, pendiente, total: real.plus(pendiente) };
}

export interface PartesDeUnTotal {
  saldado: Decimal;
  pendiente: Decimal;
  /** Para dibujar una barra de dos partes: enteros que suman 100 (0 y 0 si no hay nada). */
  pctSaldado: number;
  pctPendiente: number;
}

/**
 * De un total, cuánto ya está saldado (pagado o cobrado) y cuánto queda pendiente. Lo saldado nunca
 * pasa del total ni baja de cero: un pago de más no se dibuja como parte de estas compras.
 */
export function partesDe(total: ValorDecimal, saldado: ValorDecimal): PartesDeUnTotal {
  const t = dec(total);
  const hecho = dec(saldado).lt(0) ? dec(0) : dec(saldado).gt(t) ? t : dec(saldado);
  const pendiente = t.minus(hecho);
  if (t.lte(0)) return { saldado: dec(0), pendiente: dec(0), pctSaldado: 0, pctPendiente: 0 };
  const pctSaldado = Number(hecho.div(t).times(100).toDecimalPlaces(0).toString());
  return { saldado: hecho, pendiente, pctSaldado, pctPendiente: 100 - pctSaldado };
}
