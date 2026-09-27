import Decimal from "decimal.js";

import { dec, redondear2, redondear3, type ValorDecimal } from "../dinero/decimal";
import { ErrorDeNegocio } from "../errores";
import { diasEntre, type FechaISO } from "../fechas/fechas";
import { costoPorUnidadBase } from "../unidades/unidades";

// Precios de compra (05 §2). Funciones puras: la capa de datos las usa al grabar y al listar.

/** Variación porcentual de `anterior` a `nuevo`, 3 decimales. Nula si no hay anterior (o es 0). */
export function variacionPorcentual(anterior: ValorDecimal | null, nuevo: ValorDecimal): Decimal | null {
  if (anterior === null || dec(anterior).isZero()) return null;
  return redondear3(dec(nuevo).minus(anterior).div(anterior).times(100));
}

export interface CambioPrecioCompra {
  precio: Decimal;
  costoBase: Decimal;
  variacionPct: Decimal | null;
  /** Supera el umbral de variación brusca: se pide confirmación (RN-070). */
  esVariacionBrusca: boolean;
}

/**
 * Datos de un precio de compra nuevo: costo por unidad base, variación contra el vigente y si
 * es una variación brusca (RN-068, RN-070).
 */
export function evaluarCambioPrecioCompra(p: {
  precioAnterior: ValorDecimal | null;
  precioNuevo: ValorDecimal;
  factorABase: ValorDecimal;
  umbralVariacionPct: ValorDecimal;
}): CambioPrecioCompra {
  const precio = dec(p.precioNuevo);
  if (precio.lte(0)) throw new ErrorDeNegocio("VALIDACION", "El precio de compra tiene que ser mayor que 0.");
  const variacionPct = variacionPorcentual(p.precioAnterior, precio);
  return {
    precio,
    costoBase: costoPorUnidadBase(precio, p.factorABase),
    variacionPct,
    esVariacionBrusca: variacionPct !== null && variacionPct.abs().gt(dec(p.umbralVariacionPct)),
  };
}

export interface OfertaParaComparar {
  id: string;
  productoId: string;
  costoBase: ValorDecimal;
  disponible: boolean;
  /** Fecha (en la zona de la empresa) de la última carga o confirmación del precio. */
  fechaActualizacion: FechaISO;
}

export interface ComparacionOferta {
  /** % sobre el menor costo por unidad base del producto entre las ofertas disponibles. */
  pctSobreMejor: Decimal | null;
  esMejor: boolean;
  /** 1 = la más barata; las no disponibles van al final; empates comparten puesto. */
  ranking: number;
  diasSinActualizar: number;
  /** RN-069 */
  desactualizada: boolean;
}

/** Comparación de las ofertas de cada producto para la lista general y el comparador (05 §2.1 y §3). */
export function compararOfertas(
  ofertas: readonly OfertaParaComparar[],
  hoy: FechaISO,
  diasAlertaDesactualizado: number,
): Map<string, ComparacionOferta> {
  const porProducto = new Map<string, OfertaParaComparar[]>();
  for (const o of ofertas) porProducto.set(o.productoId, [...(porProducto.get(o.productoId) ?? []), o]);

  const resultado = new Map<string, ComparacionOferta>();
  for (const grupo of porProducto.values()) {
    const disponibles = grupo.filter((o) => o.disponible).map((o) => dec(o.costoBase));
    const mejor = disponibles.length > 0 ? Decimal.min(...disponibles) : null;
    const clave = (o: OfertaParaComparar) => [o.disponible ? 0 : 1, dec(o.costoBase)] as const;

    for (const o of grupo) {
      const [grupoO, costoO] = clave(o);
      const ranking =
        1 +
        grupo.filter((x) => {
          const [grupoX, costoX] = clave(x);
          return grupoX < grupoO || (grupoX === grupoO && costoX.lt(costoO));
        }).length;
      const dias = diasEntre(o.fechaActualizacion, hoy);
      resultado.set(o.id, {
        pctSobreMejor: mejor && !mejor.isZero() ? redondear2(costoO.minus(mejor).div(mejor).times(100)) : null,
        esMejor: o.disponible && mejor !== null && costoO.eq(mejor),
        ranking,
        diasSinActualizar: dias,
        desactualizada: dias > diasAlertaDesactualizado,
      });
    }
  }
  return resultado;
}
