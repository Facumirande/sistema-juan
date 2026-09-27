import type Decimal from "decimal.js";

import { dec } from "./decimal";

/**
 * Número escrito por una persona, en la costumbre de Argentina: "17.550" = 17550,
 * "1.234,56" = 1234,56, "17550,5" = 17550,5. Sin coma, un punto seguido de grupos de 3
 * dígitos es de miles; si no, es decimal ("2.5" = 2,5). Acepta "$" y espacios.
 * Devuelve null si el texto no es un número.
 */
export function interpretarNumero(texto: string): Decimal | null {
  let limpio = texto.replace(/[\s$]/g, "");
  if (limpio === "") return null;
  if (limpio.includes(",")) {
    limpio = limpio.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(limpio)) {
    limpio = limpio.replace(/\./g, "");
  }
  if (!/^-?\d+(\.\d+)?$/.test(limpio)) return null;
  return dec(limpio);
}
