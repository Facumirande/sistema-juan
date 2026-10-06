import Decimal from "decimal.js";

import { dec, redondear3, type ValorDecimal } from "../dinero/decimal";
import type { EstrategiaCosto } from "../precios/venta";
import { presentacionesNecesarias } from "../unidades/unidades";

// Lista de compra (04 §5.c): cuánto comprar de cada producto y a quién.

export type EstadoLineaLista = "PENDIENTE" | "PARCIAL" | "COMPRADO" | "NO_CONSEGUIDO";
export type AlertaLista = "SIN_PROVEEDOR" | "CREDITO_INSUFICIENTE" | "PRECIO_DESACTUALIZADO";

/**
 * RN-051. `tildada` = se marcó a mano como comprada (en la tarjeta del tablero o en la lista) sin
 * anotar la compra: cuenta como comprada aunque no haya compras registradas.
 */
export function estadoLineaLista(necesidadBase: ValorDecimal, compradoBase: ValorDecimal, marcadaNoConseguido: boolean, tildada = false): EstadoLineaLista {
  const necesidad = dec(necesidadBase);
  const comprado = dec(compradoBase);
  if (tildada) return "COMPRADO";
  if (marcadaNoConseguido && comprado.lt(necesidad)) return "NO_CONSEGUIDO";
  if (comprado.lte(0) && necesidad.gt(0)) return "PENDIENTE";
  if (comprado.lt(necesidad)) return "PARCIAL";
  return "COMPRADO";
}

export interface CalculoLinea {
  pendienteBase: Decimal;
  cantidadPresentaciones: Decimal;
  aComprarBase: Decimal;
  sobrantePrevistoBase: Decimal;
  estado: EstadoLineaLista;
}

/**
 * Una línea de la lista (04 §5.c.1): lo pendiente se redondea hacia arriba a presentaciones
 * completas (RN-046), salvo que el comprador haya fijado la cantidad a mano.
 */
export function calcularLineaLista(p: {
  necesidadBase: ValorDecimal;
  compradoBase: ValorDecimal;
  factor: ValorDecimal;
  cantidadManual: ValorDecimal | null;
  marcadaNoConseguido: boolean;
  tildada?: boolean;
}): CalculoLinea {
  const necesidad = dec(p.necesidadBase);
  const comprado = dec(p.compradoBase);
  const pendiente = Decimal.max(necesidad.minus(comprado), 0);
  const cantidad = p.cantidadManual !== null ? dec(p.cantidadManual) : presentacionesNecesarias(pendiente, p.factor).cantidad;
  const aComprar = redondear3(cantidad.times(p.factor));
  return {
    pendienteBase: pendiente,
    cantidadPresentaciones: cantidad,
    aComprarBase: aComprar,
    sobrantePrevistoBase: redondear3(aComprar.minus(pendiente).plus(Decimal.max(comprado.minus(necesidad), 0))),
    estado: estadoLineaLista(necesidad, comprado, p.marcadaNoConseguido, p.tildada ?? false),
  };
}

/**
 * Un tilde vale para lo que se necesitaba cuando se puso: si después hace falta más (entró otro
 * pedido o se agrandó uno), deja de valer y el producto vuelve a quedar por comprar.
 */
export function tildeSigueValiendo(tildada: boolean, necesidadAlTildar: ValorDecimal, necesidadAhora: ValorDecimal): boolean {
  return tildada && dec(necesidadAhora).lte(dec(necesidadAlTildar));
}

export interface Candidato {
  ofertaId: string;
  proveedorId: string;
  precio: ValorDecimal;
  factor: ValorDecimal;
  costoBase: ValorDecimal;
  /** Sin límite o que compra siempre al contado: el crédito no lo frena. */
  sinControlDeCredito: boolean;
  desactualizada: boolean;
  fechaActualizacion: Date;
}

export interface Sugerencia {
  candidato: Candidato | null;
  alertas: AlertaLista[];
  /** Proveedores que se descartaron por falta de crédito (para el aviso "pagando contado a D ahorrás…"). */
  descartados: { proveedorId: string; disponible: Decimal; costoLinea: Decimal }[];
}

/**
 * Sugerencia de proveedor (04 §5.c.2, 06 §9.4): ordena según la estrategia de la empresa y
 * elige el primero cuyo crédito disponible proyectado alcance para la línea.
 */
export function sugerirProveedor(p: {
  candidatos: readonly Candidato[];
  estrategia: EstrategiaCosto;
  preferidoId: string | null;
  ultimoProveedorId: string | null;
  pendienteBase: ValorDecimal;
  disponibleProyectado: ReadonlyMap<string, Decimal>;
}): Sugerencia {
  // PREFERIDO: primero el preferido; ULTIMO_COSTO_REAL: primero el de la última compra; MINIMO: ninguno.
  const primero = p.estrategia === "MINIMO" ? null : p.estrategia === "ULTIMO_COSTO_REAL" ? p.ultimoProveedorId : p.preferidoId;
  const va = (c: Candidato, id: string | null) => (c.proveedorId === id ? 0 : 1);
  // Después, el menor costo por unidad base; a igual costo, el preferido y el precio más reciente.
  const ordenados = [...p.candidatos].sort(
    (a, b) =>
      va(a, primero) - va(b, primero) ||
      dec(a.costoBase).cmp(dec(b.costoBase)) ||
      va(a, p.preferidoId) - va(b, p.preferidoId) ||
      b.fechaActualizacion.getTime() - a.fechaActualizacion.getTime(),
  );

  const descartados: Sugerencia["descartados"] = [];
  for (const c of ordenados) {
    const costoLinea = presentacionesNecesarias(p.pendienteBase, c.factor).cantidad.times(c.precio);
    const disponible = p.disponibleProyectado.get(c.proveedorId);
    if (c.sinControlDeCredito || disponible === undefined || disponible.gte(costoLinea)) {
      const alertas: AlertaLista[] = [];
      if (descartados.length > 0) alertas.push("CREDITO_INSUFICIENTE");
      if (c.desactualizada) alertas.push("PRECIO_DESACTUALIZADO");
      return { candidato: c, alertas, descartados };
    }
    descartados.push({ proveedorId: c.proveedorId, disponible, costoLinea });
  }
  if (ordenados.length > 0) {
    const c = ordenados[0]!;
    return { candidato: c, alertas: c.desactualizada ? ["CREDITO_INSUFICIENTE", "PRECIO_DESACTUALIZADO"] : ["CREDITO_INSUFICIENTE"], descartados };
  }
  return { candidato: null, alertas: ["SIN_PROVEEDOR"], descartados };
}
