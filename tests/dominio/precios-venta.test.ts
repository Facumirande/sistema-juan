import { describe, expect, it } from "vitest";

import { esErrorDeNegocio } from "@/dominio/errores";
import {
  calcularPrecioVenta,
  costoReferencia,
  margenSobreVenta,
  redondearPrecio,
  subtotalLinea,
  transicionJornadaPermitida,
  transicionPedidoPermitida,
  type DatosPrecioVenta,
  type ModoRedondeo,
  type OfertaParaCosto,
} from "@/dominio/precios/venta";

function codigoDeError(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return esErrorDeNegocio(e) ? e.codigo : "OTRO";
  }
  return undefined;
}

const sinReglas = { precioFijo: null, recargoProducto: null, recargoCategoria: null };
const costoEstimado = (costo: string) => ({ costo: costoReferencia({ estrategia: "MINIMO", costoRealJornada: null, ofertas: [oferta("x", costo)], proveedorPreferidoId: null, ultimoCostoReal: null }).costo, origen: "PREFERIDO" as const, estimado: true, desactualizado: false });
function oferta(proveedorId: string, costoBase: string, disponible = true, desactualizada = false): OfertaParaCosto {
  return { proveedorId, costoBase, disponible, desactualizada };
}

/** Empresa de los ejemplos de 05: redondeo $10 hacia arriba, precios sin IVA, margen mínimo 15 %. */
function datos(parcial: Partial<DatosPrecioVenta> & Pick<DatosPrecioVenta, "costo">): DatosPrecioVenta {
  return {
    reglas: sinReglas,
    recargos: { cliente: null, producto: null, categoria: null, global: "25" },
    factor: "1",
    redondeo: { multiplo: "10", modo: "ARRIBA" },
    preciosIncluyenIva: false,
    alicuotaIva: "0",
    margenMinimoPct: "15",
    fecha: "2026-09-25",
    ...parcial,
  };
}

describe("redondeo del precio de venta (05 §5.6)", () => {
  it("coincide con la tabla del plan", () => {
    const casos: [string, string, ModoRedondeo, string][] = [
      ["1248.75", "1", "NINGUNO", "1249"], // sin redondeo configurado, igual se lleva al peso
      ["1248.75", "0.5", "ARRIBA", "1249"],
      ["1248.75", "0.5", "CERCANO", "1249"],
      ["1156.25", "0.5", "ARRIBA", "1156.5"],
      ["1156.25", "0.5", "CERCANO", "1156.5"],
      ["1248.75", "1", "ARRIBA", "1249"],
      ["1156.25", "1", "ARRIBA", "1157"],
      ["1156.25", "1", "CERCANO", "1156"],
      ["1248.75", "5", "CERCANO", "1250"],
      ["1156.25", "5", "ARRIBA", "1160"],
      ["1156.25", "5", "CERCANO", "1155"],
      ["1156.25", "10", "ARRIBA", "1160"],
      ["1156.25", "10", "CERCANO", "1160"],
      ["1156.25", "10", "ABAJO", "1150"],
    ];
    for (const [valor, multiplo, modo, esperado] of casos) {
      expect(redondearPrecio(valor, multiplo, modo).toString(), `${valor} ${multiplo} ${modo}`).toBe(esperado);
    }
    expect(codigoDeError(() => redondearPrecio("10", "0", "ARRIBA"))).toBe("VALIDACION");
  });
});

describe("costo de referencia (05 §4, RN-080)", () => {
  const ofertas = [oferta("A", "900"), oferta("B", "950"), oferta("C", "880", false)];

  it("el costo real de la jornada gana a cualquier estrategia", () => {
    expect(costoReferencia({ estrategia: "PREFERIDO", costoRealJornada: "925", ofertas, proveedorPreferidoId: "A", ultimoCostoReal: null })).toMatchObject({
      origen: "REAL_JORNADA",
      estimado: false,
    });
  });

  it("PREFERIDO usa al preferido; sin oferta disponible del preferido cae al mínimo", () => {
    expect(costoReferencia({ estrategia: "PREFERIDO", costoRealJornada: null, ofertas, proveedorPreferidoId: "B", ultimoCostoReal: null })).toMatchObject({ origen: "PREFERIDO" });
    expect(costoReferencia({ estrategia: "PREFERIDO", costoRealJornada: null, ofertas, proveedorPreferidoId: "B", ultimoCostoReal: null }).costo?.toString()).toBe("950");
    const sinPreferido = costoReferencia({ estrategia: "PREFERIDO", costoRealJornada: null, ofertas, proveedorPreferidoId: "C", ultimoCostoReal: null });
    expect(sinPreferido).toMatchObject({ origen: "MINIMO" });
    expect(sinPreferido.costo?.toString()).toBe("900");
  });

  it("ULTIMO_COSTO_REAL usa lo pagado; si no hay, el mínimo; sin ofertas, el último costo real; si no, sin dato", () => {
    expect(costoReferencia({ estrategia: "ULTIMO_COSTO_REAL", costoRealJornada: null, ofertas, proveedorPreferidoId: null, ultimoCostoReal: "910" })).toMatchObject({ origen: "ULTIMO_COSTO_REAL" });
    expect(costoReferencia({ estrategia: "ULTIMO_COSTO_REAL", costoRealJornada: null, ofertas, proveedorPreferidoId: null, ultimoCostoReal: null })).toMatchObject({ origen: "MINIMO" });
    expect(costoReferencia({ estrategia: "MINIMO", costoRealJornada: null, ofertas: [], proveedorPreferidoId: null, ultimoCostoReal: "910" })).toMatchObject({ origen: "ULTIMO_COSTO_REAL" });
    expect(costoReferencia({ estrategia: "MINIMO", costoRealJornada: null, ofertas: [oferta("A", "0")], proveedorPreferidoId: null, ultimoCostoReal: null })).toMatchObject({
      costo: null,
      origen: "SIN_DATO",
    });
  });

  it("marca el costo desactualizado si la oferta lo está", () => {
    expect(costoReferencia({ estrategia: "MINIMO", costoRealJornada: null, ofertas: [oferta("A", "900", true, true)], proveedorPreferidoId: null, ultimoCostoReal: null })).toMatchObject({
      desactualizado: true,
    });
  });
});

describe("precedencia de 7 niveles: banana a $1.200/kg (05 §5.3)", () => {
  const costo = costoEstimado("1200");
  const base = { costo, recargos: { cliente: null, producto: "35", categoria: "32", global: "25" } };

  it("nivel 1: precio fijo de la licitación, sin redondeo", () => {
    const r = calcularPrecioVenta(
      datos({ ...base, reglas: { ...sinReglas, precioFijo: { id: "r1", valor: "1450", vigenteHasta: "2027-02-28", referencia: "Licitación 2026" } } }),
    );
    expect(r).toMatchObject({ origen: "PRECIO_FIJO_CLIENTE_PRODUCTO", nivel: 1, reglaId: "r1", alertas: [] });
    expect(r.precioUnitario?.toString()).toBe("1450");
    expect(r.margenPct?.toString()).toBe("17.24");
    expect(r.recargoEquivalente?.toString()).toBe("20.83");
    expect(r.recargoAplicado).toBeNull();
  });

  it("niveles 2 a 7 con el ejemplo del plan", () => {
    const casos: [Partial<DatosPrecioVenta>, string, number, string][] = [
      [{ reglas: { ...sinReglas, recargoProducto: { id: "r2", valor: "30" } }, recargos: { ...base.recargos, cliente: "35" } }, "1560", 2, "23.08"],
      [{ reglas: { ...sinReglas, recargoCategoria: { id: "r3", valor: "28" } } }, "1540", 3, "22.08"],
      [{ recargos: { ...base.recargos, cliente: "22" } }, "1470", 4, "18.37"],
      [{}, "1620", 5, "25.93"],
    ];
    for (const [parcial, precio, nivel, margen] of casos) {
      const r = calcularPrecioVenta(datos({ ...base, ...parcial }));
      expect([r.precioUnitario?.toString(), r.nivel, r.margenPct?.toString()]).toEqual([precio, nivel, margen]);
    }
    const kiwi = calcularPrecioVenta(datos({ costo: costoEstimado("2500"), recargos: { cliente: null, producto: null, categoria: "32", global: "25" } }));
    expect([kiwi.precioUnitario?.toString(), kiwi.nivel, kiwi.margenPct?.toString()]).toEqual(["3300", 6, "24.24"]);
    const huevo = calcularPrecioVenta(datos({ costo: costoEstimado("4800"), recargos: { cliente: null, producto: null, categoria: null, global: "25" } }));
    expect([huevo.precioUnitario?.toString(), huevo.origen, huevo.margenPct?.toString()]).toEqual(["6000", "RECARGO_GLOBAL", "20"]);
  });
});

describe("tomate del 24/09, paso 1 (05 §10)", () => {
  const costo = costoReferencia({
    estrategia: "PREFERIDO",
    costoRealJornada: null,
    ofertas: [oferta("A", "900"), oferta("B", "950")],
    proveedorPreferidoId: "A",
    ultimoCostoReal: null,
  });

  it("hospital $1.150 fijo, restaurante $1.220 (35 %), verdulería $1.130 (25 %)", () => {
    const hospital = calcularPrecioVenta(datos({ costo, reglas: { ...sinReglas, precioFijo: { id: "f", valor: "1150" } } }));
    const restaurante = calcularPrecioVenta(datos({ costo, recargos: { cliente: "35", producto: "25", categoria: null, global: "30" } }));
    const verduleria = calcularPrecioVenta(datos({ costo, recargos: { cliente: null, producto: "25", categoria: null, global: "30" } }));
    expect([hospital.precioUnitario?.toString(), hospital.margenPct?.toString()]).toEqual(["1150", "21.74"]);
    expect([restaurante.precioUnitario?.toString(), restaurante.margenPct?.toString()]).toEqual(["1220", "26.23"]);
    expect([verduleria.precioUnitario?.toString(), verduleria.margenPct?.toString()]).toEqual(["1130", "20.35"]);
    expect(costo.origen).toBe("PREFERIDO");
  });

  it("vendido por cajón de 18 kg se redondea el cajón: $20.820 → $1.156,6667/kg (RN-082)", () => {
    const r = calcularPrecioVenta(
      datos({ costo: costoEstimado("925"), factor: "18", recargos: { cliente: null, producto: "25", categoria: null, global: "30" } }),
    );
    expect(r.precioPresentacion?.toString()).toBe("20820");
    expect(r.precioUnitario?.toString()).toBe("1156.6667");
    expect(subtotalLinea("36", r.precioUnitario!).toString()).toBe("41640");
  });
});

describe("IVA, alertas y casos sin costo (05 §5.7, §8)", () => {
  it("con IVA incluido se redondea el precio final y se guarda el neto", () => {
    const r = calcularPrecioVenta(
      datos({ costo: costoEstimado("925"), preciosIncluyenIva: true, alicuotaIva: "10.5", recargos: { cliente: "35", producto: null, categoria: null, global: "30" } }),
    );
    expect(r.precioUnitario?.toString()).toBe("1248.8688");
    const fijoConIva = calcularPrecioVenta(
      datos({ costo: costoEstimado("925"), preciosIncluyenIva: true, alicuotaIva: "10.5", reglas: { ...sinReglas, precioFijo: { id: "f", valor: "1105" } } }),
    );
    expect(fijoConIva.precioUnitario?.toString()).toBe("1000");
  });

  it("margen bajo, negativo, costo desactualizado y precio fijo por vencer", () => {
    const bajo = calcularPrecioVenta(datos({ costo: costoEstimado("1000"), redondeo: { multiplo: "1", modo: "NINGUNO" }, recargos: { cliente: "10", producto: null, categoria: null, global: "30" } }));
    expect(bajo.alertas).toEqual(["MARGEN_BAJO"]);
    const negativo = calcularPrecioVenta(datos({ costo: costoEstimado("1000"), reglas: { ...sinReglas, precioFijo: { id: "f", valor: "900", vigenteHasta: "2026-10-05" } } }));
    expect(negativo.alertas).toEqual(["PRECIO_FIJO_POR_VENCER", "MARGEN_NEGATIVO"]);
    const viejo = calcularPrecioVenta(datos({ costo: { ...costoEstimado("1000"), desactualizado: true } }));
    expect(viejo.alertas).toContain("COSTO_DESACTUALIZADO");
  });

  it("sin costo: con recargo queda sin precio; con precio fijo hay precio pero no margen", () => {
    const sinCosto = { costo: null, origen: "SIN_DATO" as const, estimado: true, desactualizado: false };
    const r = calcularPrecioVenta(datos({ costo: sinCosto }));
    expect(r).toMatchObject({ precioUnitario: null, alertas: ["SIN_PRECIO"], origen: "RECARGO_GLOBAL" });
    const fijo = calcularPrecioVenta(datos({ costo: sinCosto, reglas: { ...sinReglas, precioFijo: { id: "f", valor: "1150" } } }));
    expect(fijo).toMatchObject({ margenPct: null, recargoEquivalente: null, alertas: ["SIN_COSTO"] });
    expect(fijo.precioUnitario?.toString()).toBe("1150");
  });

  it("margen sobre venta de un precio cero no divide por cero", () => {
    expect(margenSobreVenta("0", "10").toString()).toBe("0");
  });
});

describe("estados del pedido y de la jornada (RN-024, RN-036)", () => {
  it("el pedido solo sigue las flechas del diagrama", () => {
    expect(transicionPedidoPermitida("BORRADOR", "CONFIRMADO")).toBe(true);
    expect(transicionPedidoPermitida("EN_COMPRA", "CANCELADO")).toBe(true);
    expect(transicionPedidoPermitida("EN_PREPARACION", "CANCELADO")).toBe(false);
    expect(transicionPedidoPermitida("CONFIRMADO", "BORRADOR")).toBe(false);
  });

  it("la jornada avanza de a un paso; solo se reabre de CERRADA a REPARTIENDO", () => {
    expect(transicionJornadaPermitida("ABIERTA", "COMPRANDO")).toBe(true);
    expect(transicionJornadaPermitida("ABIERTA", "PREPARANDO")).toBe(false);
    expect(transicionJornadaPermitida("CERRADA", "REPARTIENDO")).toBe(true);
    expect(transicionJornadaPermitida("COMPRANDO", "ABIERTA")).toBe(false);
  });
});
