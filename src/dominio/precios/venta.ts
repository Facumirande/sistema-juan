import Decimal from "decimal.js";

import { dec, redondear2, redondear4, redondearPesos, type ValorDecimal } from "../dinero/decimal";
import { ErrorDeNegocio } from "../errores";
import { diasEntre, type FechaISO } from "../fechas/fechas";

// Precio de venta (05 §4 y §5). Funciones puras: la capa de datos junta los datos y guarda el resultado.

export type ModoRedondeo = "NINGUNO" | "CERCANO" | "ARRIBA" | "ABAJO";
export type EstrategiaCosto = "PREFERIDO" | "MINIMO" | "ULTIMO_COSTO_REAL";
export type OrigenCosto = "PREFERIDO" | "MINIMO" | "ULTIMO_COSTO_REAL" | "REAL_JORNADA" | "SIN_DATO";
export type OrigenPrecioVenta =
  | "PRECIO_FIJO_CLIENTE_PRODUCTO"
  | "RECARGO_CLIENTE_PRODUCTO"
  | "RECARGO_CLIENTE_CATEGORIA"
  | "RECARGO_CLIENTE"
  | "RECARGO_PRODUCTO"
  | "RECARGO_CATEGORIA"
  | "RECARGO_GLOBAL"
  | "MANUAL";
export type AlertaPrecio = "SIN_PRECIO" | "SIN_COSTO" | "MARGEN_NEGATIVO" | "MARGEN_BAJO" | "COSTO_DESACTUALIZADO" | "PRECIO_FIJO_POR_VENCER";

/** Días antes del vencimiento de un precio fijo en que se avisa (05 §5.4). */
export const DIAS_AVISO_PRECIO_FIJO = 15;

/** Redondeo del precio de venta (05 §5.6, RN-081). En CERCANO la mitad va hacia arriba. */
export function redondearPrecio(valor: ValorDecimal, multiplo: ValorDecimal, modo: ModoRedondeo): Decimal {
  const v = dec(valor);
  if (modo === "NINGUNO") return redondearPesos(v);
  const m = dec(multiplo);
  if (m.lte(0)) throw new ErrorDeNegocio("VALIDACION", "El múltiplo de redondeo tiene que ser mayor que 0.");
  const q = v.div(m);
  const entero = modo === "ARRIBA" ? q.ceil() : modo === "ABAJO" ? q.floor() : q.plus("0.5").floor();
  return entero.times(m);
}

export interface OfertaParaCosto {
  proveedorId: string;
  costoBase: ValorDecimal;
  disponible: boolean;
  desactualizada: boolean;
}

export interface CostoReferencia {
  costo: Decimal | null;
  origen: OrigenCosto;
  /** Estimado desde ofertas o compras anteriores; `false` si es el costo real de la jornada. */
  estimado: boolean;
  desactualizado: boolean;
}

/**
 * Costo de referencia por unidad base (05 §4, RN-080): costo real de la jornada si ya hay
 * compras; si no, la estrategia de la empresa; si falta, el mínimo y después el último costo
 * real. Solo cuentan las ofertas disponibles.
 */
export function costoReferencia(p: {
  estrategia: EstrategiaCosto;
  costoRealJornada: ValorDecimal | null;
  ofertas: readonly OfertaParaCosto[];
  proveedorPreferidoId: string | null;
  /** Costo real de la última jornada anterior con compras del producto. */
  ultimoCostoReal: ValorDecimal | null;
}): CostoReferencia {
  if (p.costoRealJornada !== null) return { costo: dec(p.costoRealJornada), origen: "REAL_JORNADA", estimado: false, desactualizado: false };

  const disponibles = p.ofertas.filter((o) => o.disponible && dec(o.costoBase).gt(0));
  const masBarata = (lista: readonly OfertaParaCosto[]) =>
    lista.reduce<OfertaParaCosto | null>((mejor, o) => (mejor === null || dec(o.costoBase).lt(dec(mejor.costoBase)) ? o : mejor), null);
  const desdeOferta = (o: OfertaParaCosto, origen: OrigenCosto): CostoReferencia => ({
    costo: dec(o.costoBase),
    origen,
    estimado: true,
    desactualizado: o.desactualizada,
  });

  if (p.estrategia === "PREFERIDO" && p.proveedorPreferidoId) {
    const preferida = masBarata(disponibles.filter((o) => o.proveedorId === p.proveedorPreferidoId));
    if (preferida) return desdeOferta(preferida, "PREFERIDO");
  }
  if (p.estrategia === "ULTIMO_COSTO_REAL" && p.ultimoCostoReal !== null) {
    return { costo: dec(p.ultimoCostoReal), origen: "ULTIMO_COSTO_REAL", estimado: true, desactualizado: false };
  }
  const minima = masBarata(disponibles);
  if (minima) return desdeOferta(minima, "MINIMO");
  if (p.ultimoCostoReal !== null) return { costo: dec(p.ultimoCostoReal), origen: "ULTIMO_COSTO_REAL", estimado: true, desactualizado: false };
  return { costo: null, origen: "SIN_DATO", estimado: true, desactualizado: false };
}

export interface ReglaAplicable {
  id: string;
  valor: ValorDecimal;
  vigenteHasta?: FechaISO | null;
  referencia?: string | null;
}

export interface DatosPrecioVenta {
  costo: CostoReferencia;
  /** Reglas del cliente vigentes en la fecha de la jornada (RN-078); como mucho una de cada tipo (RN-079). */
  reglas: {
    precioFijo: ReglaAplicable | null;
    recargoProducto: ReglaAplicable | null;
    recargoCategoria: ReglaAplicable | null;
  };
  recargos: {
    cliente: ValorDecimal | null;
    producto: ValorDecimal | null;
    categoria: ValorDecimal | null;
    global: ValorDecimal;
  };
  /** Factor de la presentación de venta (1 si se vende en unidad base). */
  factor: ValorDecimal;
  redondeo: { multiplo: ValorDecimal; modo: ModoRedondeo };
  preciosIncluyenIva: boolean;
  alicuotaIva: ValorDecimal;
  margenMinimoPct: ValorDecimal;
  /** Fecha de la jornada (fecha de entrega). */
  fecha: FechaISO;
}

export interface PrecioVenta {
  /** Por unidad base, neto de IVA, 4 decimales. Nulo si no hay costo ni precio fijo. */
  precioUnitario: Decimal | null;
  /** Precio de la presentación (2 decimales). */
  precioPresentacion: Decimal | null;
  costoUnitario: Decimal | null;
  origenCosto: OrigenCosto;
  recargoAplicado: Decimal | null;
  /** Informativo en precio fijo: (precio ÷ costo − 1) × 100. */
  recargoEquivalente: Decimal | null;
  origen: OrigenPrecioVenta;
  nivel: number;
  reglaId: string | null;
  /** Margen sobre venta en porcentaje (2 decimales). */
  margenPct: Decimal | null;
  alertas: AlertaPrecio[];
}

/** Margen sobre venta en % = (venta − costo) ÷ venta × 100 (05 §6). */
export function margenSobreVenta(precio: ValorDecimal, costo: ValorDecimal): Decimal {
  const p = dec(precio);
  if (p.isZero()) return dec(0);
  return redondear2(p.minus(costo).div(p).times(100));
}

function primerRecargo(d: DatosPrecioVenta): { recargo: Decimal; origen: OrigenPrecioVenta; nivel: number; reglaId: string | null } {
  if (d.reglas.recargoProducto) return { recargo: dec(d.reglas.recargoProducto.valor), origen: "RECARGO_CLIENTE_PRODUCTO", nivel: 2, reglaId: d.reglas.recargoProducto.id };
  if (d.reglas.recargoCategoria) return { recargo: dec(d.reglas.recargoCategoria.valor), origen: "RECARGO_CLIENTE_CATEGORIA", nivel: 3, reglaId: d.reglas.recargoCategoria.id };
  if (d.recargos.cliente !== null) return { recargo: dec(d.recargos.cliente), origen: "RECARGO_CLIENTE", nivel: 4, reglaId: null };
  if (d.recargos.producto !== null) return { recargo: dec(d.recargos.producto), origen: "RECARGO_PRODUCTO", nivel: 5, reglaId: null };
  if (d.recargos.categoria !== null) return { recargo: dec(d.recargos.categoria), origen: "RECARGO_CATEGORIA", nivel: 6, reglaId: null };
  return { recargo: dec(d.recargos.global), origen: "RECARGO_GLOBAL", nivel: 7, reglaId: null };
}

/**
 * `calcularPrecioVenta` de 05 §5.8: precedencia de 7 niveles (RN-077), recargo sobre el costo
 * neto (RN-076, RN-083), redondeo en la unidad en que se vende (RN-081, RN-082) y alertas de
 * margen (RN-085, RN-086).
 */
export function calcularPrecioVenta(d: DatosPrecioVenta): PrecioVenta {
  const costo = d.costo.costo;
  const iva = dec(d.alicuotaIva).div(100);
  const factor = dec(d.factor);
  const alertas: AlertaPrecio[] = [];
  let precioBase: Decimal;
  let recargo: Decimal | null = null;
  let recargoEquivalente: Decimal | null = null;
  let origen: OrigenPrecioVenta;
  let nivel: number;
  let reglaId: string | null;

  const fijo = d.reglas.precioFijo;
  if (fijo) {
    precioBase = d.preciosIncluyenIva ? dec(fijo.valor).div(iva.plus(1)) : dec(fijo.valor);
    recargoEquivalente = costo && !costo.isZero() ? redondear2(precioBase.div(costo).minus(1).times(100)) : null;
    origen = "PRECIO_FIJO_CLIENTE_PRODUCTO";
    nivel = 1;
    reglaId = fijo.id;
    if (fijo.vigenteHasta && diasEntre(d.fecha, fijo.vigenteHasta) <= DIAS_AVISO_PRECIO_FIJO) alertas.push("PRECIO_FIJO_POR_VENCER");
  } else {
    const r = primerRecargo(d);
    recargo = r.recargo;
    origen = r.origen;
    nivel = r.nivel;
    reglaId = r.reglaId;
    if (costo === null) {
      return {
        precioUnitario: null,
        precioPresentacion: null,
        costoUnitario: null,
        origenCosto: d.costo.origen,
        recargoAplicado: recargo,
        recargoEquivalente: null,
        origen,
        nivel,
        reglaId,
        margenPct: null,
        alertas: ["SIN_PRECIO"],
      };
    }
    const valor = costo.times(recargo.div(100).plus(1)).times(factor);
    precioBase = d.preciosIncluyenIva
      ? redondearPrecio(valor.times(iva.plus(1)), d.redondeo.multiplo, d.redondeo.modo).div(iva.plus(1)).div(factor)
      : redondearPrecio(valor, d.redondeo.multiplo, d.redondeo.modo).div(factor);
  }

  let margenPct: Decimal | null = null;
  if (costo !== null) {
    margenPct = margenSobreVenta(precioBase, costo);
    if (precioBase.lt(costo)) alertas.push("MARGEN_NEGATIVO");
    else if (margenPct.lt(dec(d.margenMinimoPct))) alertas.push("MARGEN_BAJO");
  } else {
    alertas.push("SIN_COSTO");
  }
  if (d.costo.estimado && d.costo.desactualizado) alertas.push("COSTO_DESACTUALIZADO");

  return {
    precioUnitario: redondear4(precioBase),
    precioPresentacion: redondearPesos(precioBase.times(factor)),
    costoUnitario: costo,
    origenCosto: d.costo.origen,
    recargoAplicado: recargo,
    recargoEquivalente,
    origen,
    nivel,
    reglaId,
    margenPct,
    alertas,
  };
}

/** Subtotal de una línea: cantidad en unidad base × precio por unidad base, 2 decimales (05 §5.7 regla 5). */
export function subtotalLinea(cantidadBase: ValorDecimal, precioUnitario: ValorDecimal): Decimal {
  return redondearPesos(dec(cantidadBase).times(precioUnitario));
}

// ——— Estados (04 §5.b, RN-024 y RN-036) ———

export type EstadoPedido = "BORRADOR" | "CONFIRMADO" | "EN_COMPRA" | "EN_PREPARACION" | "PREPARADO" | "EN_REPARTO" | "ENTREGADO" | "CANCELADO";
export type EstadoJornada = "ABIERTA" | "COMPRANDO" | "PREPARANDO" | "REPARTIENDO" | "CERRADA";

const TRANSICIONES_PEDIDO: Readonly<Record<EstadoPedido, readonly EstadoPedido[]>> = {
  BORRADOR: ["CONFIRMADO", "CANCELADO"],
  CONFIRMADO: ["EN_COMPRA", "CANCELADO"],
  EN_COMPRA: ["EN_PREPARACION", "CANCELADO"],
  EN_PREPARACION: ["PREPARADO"],
  PREPARADO: ["EN_REPARTO"],
  EN_REPARTO: ["ENTREGADO"],
  ENTREGADO: [],
  CANCELADO: [],
};

export function transicionPedidoPermitida(de: EstadoPedido, a: EstadoPedido): boolean {
  return TRANSICIONES_PEDIDO[de].includes(a);
}

const ORDEN_JORNADA: readonly EstadoJornada[] = ["ABIERTA", "COMPRANDO", "PREPARANDO", "REPARTIENDO", "CERRADA"];

/** La jornada solo avanza de a un paso; la única vuelta atrás es la reapertura CERRADA → REPARTIENDO (RN-041). */
export function transicionJornadaPermitida(de: EstadoJornada, a: EstadoJornada): boolean {
  if (de === "CERRADA" && a === "REPARTIENDO") return true;
  return ORDEN_JORNADA.indexOf(a) === ORDEN_JORNADA.indexOf(de) + 1;
}
