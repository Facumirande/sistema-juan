import { describe, expect, it } from "vitest";

import {
  COLUMNAS,
  accionAlMover,
  porQueNoSeMueve,
  columnaDePedido,
  columnaDeTarjeta,
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
    expect(COLUMNAS.map((c) => c.clave)).toEqual(["pedidos", "en_lista", "comprados", "preparando", "en_camino", "entregados"]);
    expect(columnaDePedido("BORRADOR")).toBe("pedidos");
    expect(columnaDePedido("CONFIRMADO")).toBe("pedidos");
    expect(columnaDePedido("EN_COMPRA")).toBe("en_lista");
    expect(columnaDePedido("EN_PREPARACION")).toBe("preparando");
    expect(columnaDePedido("PREPARADO")).toBe("preparando");
    expect(columnaDePedido("EN_REPARTO")).toBe("en_camino");
    expect(columnaDePedido("ENTREGADO")).toBe("entregados");
    expect(columnaDePedido("CANCELADO")).toBeNull();
    // Con todo lo suyo comprado, el pedido de la lista pasa a "Comprado".
    expect(columnaDeTarjeta("EN_COMPRA", true)).toBe("comprados");
    expect(columnaDeTarjeta("EN_COMPRA", false)).toBe("en_lista");
    expect(columnaDeTarjeta("EN_PREPARACION", true)).toBe("preparando");
    // Con la preparación armada (aunque no se separó nada) ya está en "Preparando".
    expect(columnaDeTarjeta("CONFIRMADO", false, true)).toBe("preparando");
    expect(columnaDeTarjeta("EN_COMPRA", true, true)).toBe("preparando");
    expect(columnaDeTarjeta("EN_REPARTO", false, true)).toBe("en_camino");
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

  it("arrastrar una tarjeta: agregar a la lista, sacarla o mandarla en camino", () => {
    expect(accionAlMover("pedidos", "en_lista")).toBe("AGREGAR_A_LISTA");
    expect(accionAlMover("en_lista", "pedidos")).toBe("SACAR_DE_LISTA");
    // A Comprado se pasa sin tildar producto por producto, y se puede volver.
    expect(accionAlMover("en_lista", "comprados")).toBe("MARCAR_COMPRADO");
    expect(accionAlMover("comprados", "en_lista")).toBe("DESMARCAR_COMPRADO");
    expect(accionAlMover("pedidos", "comprados")).toBe("AGREGAR_Y_COMPRAR");
    expect(accionAlMover("comprados", "pedidos")).toBe("SACAR_DE_LISTA");
    // Soltar en Preparando empieza a preparar el día; de ahí en más avanzan solas.
    expect(["pedidos", "en_lista", "comprados"].map((c) => accionAlMover(c as "pedidos", "preparando"))).toEqual(["PREPARAR", "PREPARAR", "PREPARAR"]);
    // De Preparando sale a En camino (y a ningún otro lado).
    expect(accionAlMover("preparando", "en_camino")).toBe("SALIR");
    expect(accionAlMover("preparando", "en_lista")).toBeNull();
    expect(accionAlMover("preparando", "preparando")).toBeNull();
    expect(accionAlMover("comprados", "en_camino")).toBeNull();
    expect(COLUMNAS.find((c) => c.clave === "preparando")?.seleccionable).toBe(true);
    expect(accionAlMover("en_lista", "en_camino")).toBeNull();
    expect(accionAlMover("en_camino", "entregados")).toBeNull();
    expect(accionAlMover("pedidos", "pedidos")).toBeNull();
  });

  it("lo que no se mueve arrastrando dice dónde se hace", () => {
    expect(porQueNoSeMueve("en_camino", "entregados")).toMatchObject({ ir: "viaje" });
    expect(porQueNoSeMueve("preparando", "entregados")).toMatchObject({ ir: "viaje" });
    expect(porQueNoSeMueve("preparando", "pedidos")).toMatchObject({ ir: "preparacion" });
    expect(porQueNoSeMueve("en_lista", "en_camino").mensaje).toContain("primero hay que prepararlo");
    expect(porQueNoSeMueve("pedidos", "entregados")).toMatchObject({ ir: "preparacion" });
  });

  it("qué se puede hacer con lo elegido", () => {
    expect(
      resumenDeSeleccion([
        { estado: "BORRADOR", columna: "pedidos" },
        { estado: "CONFIRMADO", columna: "pedidos" },
        { estado: "CONFIRMADO", columna: "pedidos" },
        { estado: "EN_COMPRA", columna: "en_lista" },
        { estado: "EN_COMPRA", columna: "comprados" },
        { estado: "EN_COMPRA", columna: "preparando" },
        { estado: "PREPARADO", columna: "preparando" },
      ]),
    ).toEqual({ total: 7, paraLista: 3, paraSacar: 2, paraSalir: 2 });
    expect(resumenDeSeleccion([])).toEqual({ total: 0, paraLista: 0, paraSacar: 0, paraSalir: 0 });
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
