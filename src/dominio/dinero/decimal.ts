import Decimal from "decimal.js";

import { ErrorDeNegocio } from "../errores";

export type { Decimal };

/** Valores aceptados: texto (como lo devuelve PostgreSQL para `numeric`), Decimal o un número entero. */
export type ValorDecimal = Decimal | string | number;

const DecimalApp = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

/**
 * Convierte a Decimal. Rechaza números JavaScript con decimales: el dinero y las
 * cantidades no se representan nunca como `number` de punto flotante (01 §10.2).
 */
export function dec(valor: ValorDecimal): Decimal {
  if (typeof valor === "number" && !Number.isInteger(valor)) {
    throw new ErrorDeNegocio("VALIDACION", `Número con decimales no permitido: ${valor}. Usá texto o Decimal.`);
  }
  if (typeof valor === "string" && valor.trim() === "") {
    throw new ErrorDeNegocio("VALIDACION", "Valor numérico vacío.");
  }
  const resultado = new DecimalApp(valor);
  if (!resultado.isFinite()) {
    throw new ErrorDeNegocio("VALIDACION", `Valor numérico inválido: ${String(valor)}.`);
  }
  return resultado;
}

/** Porcentajes y cuentas intermedias: 2 decimales, mitad hacia arriba (RN-152). */
export function redondear2(valor: ValorDecimal): Decimal {
  return dec(valor).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/**
 * Montos de plata: pesos enteros, sin centavos, mitad hacia arriba (decisión del 28/09/2026). La
 * base guarda `numeric(14,2)`, con ",00".
 */
export function redondearPesos(valor: ValorDecimal): Decimal {
  return dec(valor).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
}

/** Cantidades: 3 decimales. */
export function redondear3(valor: ValorDecimal): Decimal {
  return dec(valor).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
}

/** Precios y costos unitarios: 4 decimales internos (se muestran con 2). */
export function redondear4(valor: ValorDecimal): Decimal {
  return dec(valor).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}

export function sumar(valores: readonly ValorDecimal[]): Decimal {
  return valores.reduce<Decimal>((total, v) => total.plus(dec(v)), dec(0));
}

/** Texto con la cantidad exacta de decimales, listo para una columna `numeric(p, decimales)`. */
export function aNumeric(valor: ValorDecimal, decimales: number): string {
  return dec(valor).toFixed(decimales, Decimal.ROUND_HALF_UP);
}
