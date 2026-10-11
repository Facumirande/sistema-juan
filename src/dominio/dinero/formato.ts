import Decimal from "decimal.js";

import { dec, type ValorDecimal } from "./decimal";

/** Formato es-AR / es-UY: miles con ".", decimales con "," (01 §18). */
export function formatearNumero(
  valor: ValorDecimal,
  opciones: { decimales: number; recortarCeros?: boolean },
): string {
  const d = dec(valor).toDecimalPlaces(opciones.decimales, Decimal.ROUND_HALF_UP);
  const negativo = d.isNegative() && !d.isZero();
  let [entero = "0", fraccion = ""] = d.abs().toFixed(opciones.decimales).split(".");
  if (opciones.recortarCeros) fraccion = fraccion.replace(/0+$/, "");
  entero = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negativo ? "-" : ""}${entero}${fraccion ? `,${fraccion}` : ""}`;
}

/** "$114.400" · "-$30.000": la plata se muestra en pesos enteros, sin centavos. */
export function formatearMoneda(valor: ValorDecimal, simbolo = "$"): string {
  const texto = formatearNumero(valor, { decimales: 0 });
  return texto.startsWith("-") ? `-${simbolo}${texto.slice(1)}` : `${simbolo}${texto}`;
}

/** "65,7 %" */
export function formatearPorcentaje(valor: ValorDecimal, decimales = 1): string {
  return `${formatearNumero(valor, { decimales })} %`;
}

export type UnidadMedida = "KG" | "UNIDAD" | "ATADO" | "MAPLE" | "BANDEJA" | "DOCENA" | "PAQUETE" | "LITRO" | "CAJON" | "CAJA" | "BOLSA" | "JAULA" | "BOLSON" | "RISTRA";

export const ABREVIATURA_UNIDAD: Readonly<Record<UnidadMedida, string>> = {
  KG: "kg",
  UNIDAD: "u",
  ATADO: "atado",
  MAPLE: "maple",
  BANDEJA: "bandeja",
  DOCENA: "docena",
  PAQUETE: "paquete",
  LITRO: "l",
  CAJON: "cajón",
  CAJA: "caja",
  BOLSA: "bolsa",
  JAULA: "jaula",
  BOLSON: "bolsón",
  RISTRA: "ristra",
};

/** Cantidad en unidad base con hasta 3 decimales, sin ceros de más: "36,4 kg", "20 u". */
export function formatearCantidad(valor: ValorDecimal, unidad: UnidadMedida): string {
  return `${formatearNumero(valor, { decimales: 3, recortarCeros: true })} ${ABREVIATURA_UNIDAD[unidad]}`;
}
