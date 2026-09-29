import { describe, expect, it } from "vitest";

import {
  COLUMNAS,
  accionAlMover,
  columnaDePedido,
  estadoDelPlazo,
  ordenarTarjetas,
  prioridadMasAlta,
  prioridadParaFaltantes,
  resumenDeSeleccion,
  textoPlazo,
  type PrioridadPedido,
} from "@/dominio/pedidos/tablero";

describe("tablero de pedidos", () => {
  it("cada estado va en su columna; los cancelados en ninguna", () => {
    expect(COLUMNAS.map((c) => c.clave)).toEqual(["por_confirmar", "confirmados", "en_lista", "preparando", "en_camino", "entregados"]);
    expect(columnaDePedido("BORRADOR")).toBe("por_confirmar");
    expect(columnaDePedido("CONFIRMADO")).toBe("confirmados");
    expect(columnaDePedido("EN_COMPRA")).toBe("en_lista");
    expect(columnaDePedido("EN_PREPARACION")).toBe("preparando");
    expect(columnaDePedido("PREPARADO")).toBe("preparando");
    expect(columnaDePedido("EN_REPARTO")).toBe("en_camino");
    expect(columnaDePedido("ENTREGADO")).toBe("entregados");
    expect(columnaDePedido("CANCELADO")).toBeNull();
  });

  it("primero la prioridad alta, después lo que tiene que llegar antes, después el más viejo", () => {
    const t = (numero: number, prioridad: PrioridadPedido, entregaDesde: string | null = null, entregaHasta: string | null = null) => ({ numero, prioridad, entregaDesde, entregaHasta });
    const orden = ordenarTarjetas([t(1, "NORMAL"), t(2, "BAJA", null, "07:00"), t(3, "NORMAL", null, "09:00:00"), t(4, "ALTA"), t(5, "NORMAL", "08:00:00"), t(6, "NORMAL")]);
    expect(orden.map((x) => x.numero)).toEqual([4, 5, 3, 1, 6, 2]);
  });

  it("el plazo en palabras", () => {
    expect(textoPlazo("07:00:00", "09:00:00")).toBe("entre 07:00 y 09:00");
    expect(textoPlazo(null, "09:30")).toBe("antes de las 09:30");
    expect(textoPlazo("06:00", null)).toBe("desde las 06:00");
    expect(textoPlazo(null, null)).toBeNull();
  });

  it("el plazo como la fecha de vencimiento de una tarjeta", () => {
    const base = { fecha: "2026-09-29", hasta: "09:00:00", estado: "EN_REPARTO" as const, hoy: "2026-09-29", hora: "06:30" };
    expect(estadoDelPlazo({ ...base, estado: "ENTREGADO" })).toBe("listo");
    expect(estadoDelPlazo({ ...base, hasta: null })).toBe("a_tiempo");
    expect(estadoDelPlazo({ ...base, estado: "CANCELADO" })).toBe("a_tiempo");
    expect(estadoDelPlazo(base)).toBe("a_tiempo");
    expect(estadoDelPlazo({ ...base, hora: "07:30" })).toBe("pronto");
    expect(estadoDelPlazo({ ...base, hora: "09:01" })).toBe("vencido");
    expect(estadoDelPlazo({ ...base, hoy: "2026-09-30" })).toBe("vencido");
    expect(estadoDelPlazo({ ...base, hoy: "2026-09-28", hora: "23:00" })).toBe("a_tiempo");
  });

  it("arrastrar una tarjeta: confirmar, agregar a la lista o sacarla", () => {
    expect(accionAlMover("por_confirmar", "confirmados")).toBe("CONFIRMAR");
    expect(accionAlMover("por_confirmar", "en_lista")).toBe("AGREGAR_A_LISTA");
    expect(accionAlMover("confirmados", "en_lista")).toBe("AGREGAR_A_LISTA");
    expect(accionAlMover("en_lista", "confirmados")).toBe("SACAR_DE_LISTA");
    expect(accionAlMover("confirmados", "por_confirmar")).toBeNull();
    expect(accionAlMover("preparando", "en_lista")).toBeNull();
  });

  it("qué se puede hacer con lo elegido", () => {
    expect(resumenDeSeleccion(["BORRADOR", "CONFIRMADO", "CONFIRMADO", "EN_COMPRA"])).toEqual({ total: 4, paraLista: 3, paraConfirmar: 1, paraSacar: 1 });
    expect(resumenDeSeleccion([])).toEqual({ total: 0, paraLista: 0, paraConfirmar: 0, paraSacar: 0 });
  });

  it("con faltantes, primero los pedidos de prioridad alta y dentro de cada grupo la del cliente", () => {
    expect(prioridadParaFaltantes(3, "ALTA")).toBeLessThan(prioridadParaFaltantes(1, "NORMAL"));
    expect(prioridadParaFaltantes(1, "NORMAL")).toBeLessThan(prioridadParaFaltantes(2, "NORMAL"));
    expect(prioridadParaFaltantes(5, "NORMAL")).toBeLessThan(prioridadParaFaltantes(1, "BAJA"));
    expect(prioridadMasAlta([])).toBe("NORMAL");
    expect(prioridadMasAlta(["BAJA"])).toBe("BAJA");
    expect(prioridadMasAlta(["BAJA", "NORMAL"])).toBe("NORMAL");
    expect(prioridadMasAlta(["NORMAL", "ALTA", "BAJA"])).toBe("ALTA");
  });
});
