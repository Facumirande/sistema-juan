import Decimal from "decimal.js";

import { dec, redondear3, redondear4, type ValorDecimal } from "../dinero/decimal";
import { ErrorDeNegocio } from "../errores";

function factorValido(factor: ValorDecimal): Decimal {
  const f = dec(factor);
  if (f.lte(0)) throw new ErrorDeNegocio("VALIDACION", "El factor a unidad base debe ser mayor que 0 (RN-002).");
  return f;
}

/**
 * `cantidad_base = cantidad × factor_a_base` (RN-008). Si el producto no admite
 * fracción, el resultado debe ser entero (RN-009).
 */
export function aUnidadBase(cantidad: ValorDecimal, factorABase: ValorDecimal, admiteFraccion = true): Decimal {
  const base = redondear3(dec(cantidad).times(factorValido(factorABase)));
  if (!admiteFraccion && !base.isInteger()) {
    throw new ErrorDeNegocio("VALIDACION", "Este producto se maneja en unidades enteras (RN-009).", {
      cantidadBase: base.toString(),
    });
  }
  return base;
}

/** Costo por unidad base = precio de la presentación ÷ factor, 4 decimales (05 §1). */
export function costoPorUnidadBase(precioPresentacion: ValorDecimal, factorABase: ValorDecimal): Decimal {
  return redondear4(dec(precioPresentacion).div(factorValido(factorABase)));
}

export interface PresentacionesNecesarias {
  /** Presentaciones completas a comprar (redondeo hacia arriba). */
  cantidad: Decimal;
  aComprarBase: Decimal;
  sobranteBase: Decimal;
}

/**
 * Convierte lo pendiente en unidad base a presentaciones de compra completas
 * (RN-046). Ej.: 46 kg en cajones de 18 kg → 3 cajones, 54 kg, 8 kg de sobrante.
 */
export function presentacionesNecesarias(pendienteBase: ValorDecimal, factorABase: ValorDecimal): PresentacionesNecesarias {
  const factor = factorValido(factorABase);
  const pendiente = Decimal.max(dec(pendienteBase), 0);
  const cantidad = pendiente.div(factor).toDecimalPlaces(0, Decimal.ROUND_CEIL);
  const aComprarBase = redondear3(cantidad.times(factor));
  return { cantidad, aComprarBase, sobranteBase: redondear3(aComprarBase.minus(pendiente)) };
}
