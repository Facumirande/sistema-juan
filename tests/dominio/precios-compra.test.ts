import { describe, expect, it } from "vitest";

import { esErrorDeNegocio } from "@/dominio/errores";
import { diasEntre } from "@/dominio/fechas/fechas";
import { compararOfertas, evaluarCambioPrecioCompra, variacionPorcentual, type OfertaParaComparar } from "@/dominio/precios/compra";

function codigoDeError(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return esErrorDeNegocio(e) ? e.codigo : "OTRO";
  }
  return undefined;
}

describe("días entre fechas operativas", () => {
  it("cuenta días calendario y rechaza fechas mal escritas", () => {
    expect(diasEntre("2026-09-12", "2026-09-23")).toBe(11);
    expect(diasEntre("2026-09-23", "2026-09-23")).toBe(0);
    expect(diasEntre("2026-10-01", "2026-09-30")).toBe(-1);
    expect(codigoDeError(() => diasEntre("12/09/2026", "2026-09-23"))).toBe("VALIDACION");
  });
});

describe("cambio de precio de compra (05 §2.2 y §2.3)", () => {
  it("La Quinta: tomate de $17.100 a $17.550 el cajón de 18 kg = $975/kg, +2,632 %", () => {
    const r = evaluarCambioPrecioCompra({ precioAnterior: "17100", precioNuevo: "17550", factorABase: "18", umbralVariacionPct: "30" });
    expect(r.costoBase.toFixed(4)).toBe("975.0000");
    expect(r.variacionPct?.toFixed(3)).toBe("2.632");
    expect(r.esVariacionBrusca).toBe(false);
  });

  it("el primer precio no tiene variación", () => {
    const r = evaluarCambioPrecioCompra({ precioAnterior: null, precioNuevo: "21600", factorABase: "18", umbralVariacionPct: "30" });
    expect(r).toMatchObject({ variacionPct: null, esVariacionBrusca: false });
    expect(r.costoBase.toFixed(2)).toBe("1200.00");
  });

  it("una variación mayor al umbral, para arriba o para abajo, pide confirmación (RN-070)", () => {
    const sube = evaluarCambioPrecioCompra({ precioAnterior: "10000", precioNuevo: "13500", factorABase: "1", umbralVariacionPct: "30" });
    expect(sube.variacionPct?.toString()).toBe("35");
    expect(sube.esVariacionBrusca).toBe(true);
    const baja = evaluarCambioPrecioCompra({ precioAnterior: "10000", precioNuevo: "6000", factorABase: "1", umbralVariacionPct: "30" });
    expect(baja.esVariacionBrusca).toBe(true);
    const justo = evaluarCambioPrecioCompra({ precioAnterior: "10000", precioNuevo: "13000", factorABase: "1", umbralVariacionPct: "30" });
    expect(justo.esVariacionBrusca).toBe(false);
  });

  it("rechaza precios en cero o negativos", () => {
    for (const precioNuevo of ["0", "-5"]) {
      expect(codigoDeError(() => evaluarCambioPrecioCompra({ precioAnterior: null, precioNuevo, factorABase: "18", umbralVariacionPct: "30" }))).toBe(
        "VALIDACION",
      );
    }
  });

  it("variación porcentual: sin anterior o con anterior en cero no hay variación", () => {
    expect(variacionPorcentual(null, "100")).toBeNull();
    expect(variacionPorcentual("0", "100")).toBeNull();
    expect(variacionPorcentual("13000", "14040")?.toString()).toBe("8");
  });
});

describe("comparación de ofertas: lista general del 23/09 (05 §2.1)", () => {
  const oferta = (id: string, productoId: string, costoBase: string, fechaActualizacion: string, disponible = true): OfertaParaComparar => ({
    id,
    productoId,
    costoBase,
    fechaActualizacion,
    disponible,
  });
  const ofertas = [
    oferta("tomate-A", "tomate", "900", "2026-09-23"),
    oferta("tomate-B", "tomate", "950", "2026-09-19"),
    oferta("papa-C", "papa", "500", "2026-09-22"),
    oferta("papa-A", "papa", "520", "2026-09-12"),
    oferta("cebolla-B", "cebolla", "680", "2026-09-22"),
    oferta("cebolla-A", "cebolla", "700", "2026-09-22"),
    oferta("cebolla-E", "cebolla", "730", "2026-09-20"),
  ];
  const r = compararOfertas(ofertas, "2026-09-23", 7);

  it("marca la mejor oferta y el % sobre el mejor costo por unidad base", () => {
    expect(r.get("tomate-A")).toMatchObject({ esMejor: true, ranking: 1 });
    expect(r.get("tomate-B")?.pctSobreMejor?.toFixed(2)).toBe("5.56");
    expect(r.get("papa-A")?.pctSobreMejor?.toFixed(2)).toBe("4.00");
    expect(r.get("cebolla-A")?.pctSobreMejor?.toFixed(2)).toBe("2.94");
    expect(r.get("cebolla-E")?.pctSobreMejor?.toFixed(2)).toBe("7.35");
    expect(r.get("cebolla-E")?.ranking).toBe(3);
  });

  it("la papa de A, sin actualizar hace 11 días, está desactualizada (RN-069)", () => {
    expect(r.get("papa-A")).toMatchObject({ diasSinActualizar: 11, desactualizada: true });
    expect(r.get("tomate-B")).toMatchObject({ diasSinActualizar: 4, desactualizada: false });
  });

  it("una oferta no disponible no es la mejor ni cuenta para el mínimo, y va al final (RN-075)", () => {
    const conFaltante = compararOfertas(
      [oferta("x", "banana", "1000", "2026-09-23", false), oferta("y", "banana", "1200", "2026-09-23"), oferta("z", "banana", "1200", "2026-09-23")],
      "2026-09-23",
      7,
    );
    expect(conFaltante.get("x")).toMatchObject({ esMejor: false, ranking: 3 });
    expect(conFaltante.get("x")?.pctSobreMejor?.toFixed(2)).toBe("-16.67");
    expect(conFaltante.get("y")).toMatchObject({ esMejor: true, ranking: 1 });
    expect(conFaltante.get("z")).toMatchObject({ esMejor: true, ranking: 1 });
  });

  it("si ninguna oferta está disponible no hay mejor precio", () => {
    const sinStock = compararOfertas([oferta("x", "banana", "1000", "2026-09-23", false)], "2026-09-23", 7);
    expect(sinStock.get("x")).toMatchObject({ esMejor: false, pctSobreMejor: null, ranking: 1 });
  });
});
