import Decimal from "decimal.js";

import { dec, redondear2, sumar, type ValorDecimal } from "../dinero/decimal";

// Preparación y entregas (04 §5.e y §5.f): reparto de faltantes, tolerancia de peso, totales de
// la entrega y diferencias. Cantidades siempre en unidad base.

export type PoliticaFaltantes = "PRIORIDAD_CLIENTE" | "PROPORCIONAL" | "MANUAL";
export type EstadoEntrega = "BORRADOR" | "EN_PREPARACION" | "PREPARADA" | "EN_REPARTO" | "ENTREGADA" | "ANULADA";
export type MotivoDiferencia = "RECHAZO_CALIDAD" | "FALTANTE" | "NO_CONSEGUIDO" | "ERROR_PREPARACION" | "CAMBIO_CLIENTE" | "OTRO";

export interface LineaFaltante {
  id: string;
  pedida: ValorDecimal;
  /** 1 = máxima (`cliente.prioridad_faltantes`). */
  prioridad: number;
  /** Antigüedad del pedido: menor = más antiguo (desempate). */
  orden: number;
}

/** De a cuánto se reparte: décimas si el producto admite fracción (kg), unidades enteras si no (RN-009). */
export function pasoDeReparto(admiteFraccion: boolean): Decimal {
  return dec(admiteFraccion ? "0.1" : "1");
}

/**
 * Reparto de lo disponible cuando no alcanza (04 §5.e.1, RN-115): se cubre completo a los grupos
 * de mayor prioridad; en el primero que no alcanza se prorratea por lo pedido (en pasos enteros, y
 * lo que sobra va a los restos más grandes); los grupos siguientes quedan en 0. PROPORCIONAL es lo
 * mismo con un solo grupo; MANUAL no propone (devuelve null).
 */
export function distribuirFaltante(
  disponible: ValorDecimal,
  lineas: readonly LineaFaltante[],
  opciones: { paso: ValorDecimal; politica: PoliticaFaltantes },
): Map<string, Decimal> | null {
  if (opciones.politica === "MANUAL") return null;
  const paso = dec(opciones.paso);
  const propuesta = new Map<string, Decimal>();
  const grupos = new Map<number, LineaFaltante[]>();
  for (const l of lineas) {
    const clave = opciones.politica === "PROPORCIONAL" ? 0 : l.prioridad;
    grupos.set(clave, [...(grupos.get(clave) ?? []), l]);
  }
  let restante = Decimal.max(dec(disponible), 0);
  for (const [, grupo] of [...grupos.entries()].sort(([a], [b]) => a - b)) {
    const demanda = sumar(grupo.map((l) => l.pedida));
    if (restante.gte(demanda)) {
      for (const l of grupo) propuesta.set(l.id, dec(l.pedida));
      restante = restante.minus(demanda);
      continue;
    }
    if (restante.isZero()) {
      for (const l of grupo) propuesta.set(l.id, dec(0));
      continue;
    }
    const factor = restante.div(demanda);
    const restos = grupo.map((l) => {
      const ideal = dec(l.pedida).times(factor);
      const base = ideal.div(paso).floor().times(paso);
      propuesta.set(l.id, base);
      return { l, resto: ideal.minus(base) };
    });
    let sobra = restante.minus(sumar(restos.map((r) => propuesta.get(r.l.id)!)));
    restos.sort((a, b) => b.resto.cmp(a.resto) || dec(b.l.pedida).cmp(a.l.pedida) || a.l.orden - b.l.orden);
    for (const r of restos) {
      if (sobra.lt(paso)) break;
      propuesta.set(r.l.id, propuesta.get(r.l.id)!.plus(paso));
      sobra = sobra.minus(paso);
    }
    restante = dec(0);
  }
  return propuesta;
}

/**
 * Lo preparado contra lo pedido (RN-113): dentro de la tolerancia no es diferencia. `menor` indica
 * que falta mercadería fuera de la tolerancia (pide motivo). Una línea sin pedido (sustitución)
 * siempre está dentro.
 */
export function evaluarPreparado(pedida: ValorDecimal, preparada: ValorDecimal, toleranciaPct: ValorDecimal): { diferenciaPct: Decimal | null; dentro: boolean; menor: boolean } {
  const p = dec(pedida);
  if (p.isZero()) return { diferenciaPct: null, dentro: true, menor: false };
  const diferenciaPct = redondear2(dec(preparada).minus(p).div(p).times(100));
  const dentro = diferenciaPct.abs().lte(dec(toleranciaPct));
  return { diferenciaPct, dentro, menor: !dentro && diferenciaPct.lt(0) };
}

export interface LineaValorizada {
  cantidad: ValorDecimal;
  precioUnitario: ValorDecimal;
  costoUnitario: ValorDecimal | null;
  alicuotaIva: ValorDecimal;
}

/** Importe de una línea: cantidad × precio unitario, a 2 decimales. */
export function importeLinea(cantidad: ValorDecimal, precioUnitario: ValorDecimal): Decimal {
  return redondear2(dec(cantidad).times(precioUnitario));
}

/**
 * Totales de la entrega (03 §11.2; 05 §5.7): neto, IVA por línea y total. Si los precios ya
 * incluyen IVA, el total es la suma de los importes y el IVA se descuenta de adentro.
 */
export function totalesEntrega(lineas: readonly LineaValorizada[], preciosIncluyenIva: boolean): { neto: Decimal; iva: Decimal; total: Decimal; costo: Decimal } {
  let neto = dec(0);
  let iva = dec(0);
  let costo = dec(0);
  for (const l of lineas) {
    const importe = importeLinea(l.cantidad, l.precioUnitario);
    const alicuota = dec(l.alicuotaIva).div(100);
    const ivaLinea = preciosIncluyenIva ? redondear2(importe.minus(importe.div(alicuota.plus(1)))) : redondear2(importe.times(alicuota));
    neto = neto.plus(preciosIncluyenIva ? importe.minus(ivaLinea) : importe);
    iva = iva.plus(ivaLinea);
    if (l.costoUnitario !== null) costo = costo.plus(redondear2(dec(l.cantidad).times(l.costoUnitario)));
  }
  return { neto, iva, total: neto.plus(iva), costo };
}

/**
 * RN-127: la entrega tiene diferencias si hubo sustitución, rechazo (se entregó menos de lo
 * preparado) o lo entregado se aparta de lo pedido más que la tolerancia de peso.
 */
export function entregaConDiferencias(
  lineas: readonly { pedida: ValorDecimal; preparada: ValorDecimal; entregada: ValorDecimal; esSustitucion: boolean }[],
  toleranciaPct: ValorDecimal,
): boolean {
  return lineas.some((l) => l.esSustitucion || dec(l.entregada).lt(l.preparada) || !evaluarPreparado(l.pedida, l.entregada, toleranciaPct).dentro);
}

const TRANSICIONES: Readonly<Record<EstadoEntrega, readonly EstadoEntrega[]>> = {
  BORRADOR: ["EN_PREPARACION", "ANULADA"],
  EN_PREPARACION: ["PREPARADA", "ANULADA"],
  PREPARADA: ["EN_PREPARACION", "EN_REPARTO", "ENTREGADA", "ANULADA"],
  EN_REPARTO: ["PREPARADA", "ENTREGADA"],
  // Se anula si todavía no se facturó (cargada al cliente equivocado, RN-132); eso lo controla el caso de uso.
  ENTREGADA: ["ANULADA"],
  ANULADA: [],
};

/**
 * Estados de la entrega (04 §5.e): una PREPARADA vuelve a EN_PREPARACION si se corrige, y a
 * PREPARADA si se la saca del reparto antes de entregar; también se confirma desde la oficina sin
 * haber salido en un reparto.
 */
export function transicionEntregaPermitida(de: EstadoEntrega, a: EstadoEntrega): boolean {
  return TRANSICIONES[de].includes(a);
}

/** Orden propuesto de las paradas (P-76): por inicio de la franja de recepción y después por localidad. */
export function ordenarParadas<T extends { horarioDesde: string | null; localidad: string | null }>(paradas: readonly T[]): T[] {
  return [...paradas].sort(
    (a, b) =>
      (a.horarioDesde ?? "99:99").localeCompare(b.horarioDesde ?? "99:99") || (a.localidad ?? "").localeCompare(b.localidad ?? "", "es", { sensitivity: "base" }),
  );
}
