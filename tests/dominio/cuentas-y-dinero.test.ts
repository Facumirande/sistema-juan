import { describe, expect, it } from "vitest";

import { debeDesde, repartirCobros } from "@/dominio/cuentas/clientes";
import { balanceDeDinero, partesDe } from "@/dominio/reportes/dinero";

const entregas = [
  { id: "b", fecha: "2026-10-06", importe: "50000" },
  { id: "a", fecha: "2026-10-05", importe: "30000.50" },
  { id: "c", fecha: "2026-10-07", importe: "20000" },
];
const texto = (c: ReturnType<typeof repartirCobros>) => ({
  entregas: c.entregas.map((e) => `${e.id}: ${e.cobrado.toString()} cobrado, falta ${e.pendiente.toString()} (${e.estado})`),
  deAntes: c.saldoInicialPendiente.toString(),
  total: c.total.toString(),
  cobrado: c.cobrado.toString(),
  aCobrar: c.aCobrar.toString(),
  aFavor: c.aFavor.toString(),
});

describe("la cuenta de un cliente (a cobrar)", () => {
  it("sin cobros, debe todo: lo de antes y cada entrega, de la más vieja a la más nueva", () => {
    const c = repartirCobros("10000", entregas, []);
    expect(texto(c)).toEqual({
      entregas: ["a: 0 cobrado, falta 30000.5 (PENDIENTE)", "b: 0 cobrado, falta 50000 (PENDIENTE)", "c: 0 cobrado, falta 20000 (PENDIENTE)"],
      deAntes: "10000",
      total: "110000.5",
      cobrado: "0",
      aCobrar: "110000.5",
      aFavor: "0",
    });
    expect(debeDesde(c)).toBe("2026-10-05");
  });

  it("lo cobrado cancela lo más viejo: primero lo de antes, después las entregas por fecha", () => {
    const c = repartirCobros("10000", entregas, [
      { monto: "25000", entregaId: null },
      { monto: "20000.50", entregaId: null },
    ]);
    expect(texto(c)).toEqual({
      entregas: ["a: 30000.5 cobrado, falta 0 (COBRADA)", "b: 5000 cobrado, falta 45000 (PARCIAL)", "c: 0 cobrado, falta 20000 (PENDIENTE)"],
      deAntes: "0",
      total: "110000.5",
      cobrado: "45000.5",
      aCobrar: "65000",
      aFavor: "0",
    });
    expect(debeDesde(c)).toBe("2026-10-06");
  });

  it("un cobro hecho por una entrega paga esa entrega aunque haya otras más viejas sin cobrar", () => {
    const c = repartirCobros("0", entregas, [{ monto: "20000", entregaId: "c" }]);
    expect(texto(c).entregas).toEqual(["a: 0 cobrado, falta 30000.5 (PENDIENTE)", "b: 0 cobrado, falta 50000 (PENDIENTE)", "c: 20000 cobrado, falta 0 (COBRADA)"]);
    expect(c.aCobrar.toString()).toBe("80000.5");
    expect(debeDesde(c)).toBe("2026-10-05");
  });

  it("lo que pasa del importe de esa entrega va a lo más viejo; lo que sobra de todo queda a favor", () => {
    const pagoDeMas = repartirCobros("1000", entregas, [{ monto: "26000", entregaId: "c" }]);
    expect(texto(pagoDeMas).entregas).toEqual(["a: 5000 cobrado, falta 25000.5 (PARCIAL)", "b: 0 cobrado, falta 50000 (PENDIENTE)", "c: 20000 cobrado, falta 0 (COBRADA)"]);
    expect(pagoDeMas.saldoInicialPendiente.toString()).toBe("0");

    const todoYMas = repartirCobros("0", entregas, [{ monto: "150000", entregaId: null }]);
    expect(todoYMas.entregas.every((e) => e.estado === "COBRADA")).toBe(true);
    expect([todoYMas.aCobrar.toString(), todoYMas.aFavor.toString()]).toEqual(["0", "49999.5"]);
    expect(debeDesde(todoYMas)).toBeNull();
  });

  it("un cobro por una entrega que ya no cuenta (se anuló) va a lo más viejo", () => {
    const c = repartirCobros("0", entregas, [{ monto: "30000.50", entregaId: "anulada" }]);
    expect(texto(c).entregas[0]).toBe("a: 30000.5 cobrado, falta 0 (COBRADA)");
  });

  it("lo ya comprado y todavía sin entregar se anticipa: suma a lo que falta cobrar, aparte de lo entregado (RN-198)", () => {
    const porEntregar = [
      { id: "p2", fecha: "2026-10-09", importe: "40000" },
      { id: "p1", fecha: "2026-10-08", importe: "15000" },
    ];
    const c = repartirCobros("10000", entregas, [{ monto: "25000", entregaId: null }], porEntregar);
    // Lo cobrado sigue cancelando lo de antes y lo entregado, de lo más viejo a lo más nuevo.
    expect(texto(c).entregas).toEqual(["a: 15000 cobrado, falta 15000.5 (PARCIAL)", "b: 0 cobrado, falta 50000 (PENDIENTE)", "c: 0 cobrado, falta 20000 (PENDIENTE)"]);
    expect(c.porEntregar.map((p) => `${p.id}: falta ${p.pendiente.toString()}`)).toEqual(["p1: falta 15000", "p2: falta 40000"]);
    expect([c.aCobrarEntregado.toString(), c.aCobrarPorEntregar.toString(), c.aCobrar.toString()]).toEqual(["85000.5", "55000", "140000.5"]);
    // "Todo lo que debió" y "desde cuándo debe" siguen hablando de lo entregado.
    expect([c.total.toString(), debeDesde(c)]).toEqual(["110000.5", "2026-10-05"]);
  });

  it("lo que pagó de más cubre primero lo entregado y después lo que está por entregarse; lo que sobre queda a favor", () => {
    const porEntregar = [
      { id: "p1", fecha: "2026-10-08", importe: "15000" },
      { id: "p2", fecha: "2026-10-09", importe: "40000" },
    ];
    // Paga todo lo entregado (100.000,50) y 20.000 más: cubre p1 entero y 5.000 de p2.
    const adelanto = repartirCobros("0", entregas, [{ monto: "120000.50", entregaId: null }], porEntregar);
    expect(adelanto.entregas.every((e) => e.estado === "COBRADA")).toBe(true);
    expect(adelanto.porEntregar.map((p) => `${p.id}: ${p.cobrado.toString()} cubierto, falta ${p.pendiente.toString()}`)).toEqual(["p1: 15000 cubierto, falta 0", "p2: 5000 cubierto, falta 35000"]);
    expect([adelanto.aCobrarEntregado.toString(), adelanto.aCobrarPorEntregar.toString(), adelanto.aCobrar.toString(), adelanto.aFavor.toString()]).toEqual(["0", "35000", "35000", "0"]);
    // Si paga más que todo, lo que sobra queda a favor.
    const deMas = repartirCobros("0", [], [{ monto: "60000", entregaId: null }], porEntregar);
    expect([deMas.aCobrar.toString(), deMas.aFavor.toString()]).toEqual(["0", "5000"]);
    // Sin nada por entregar, todo es como antes.
    const sin = repartirCobros("0", entregas, []);
    expect([sin.porEntregar.length, sin.aCobrarPorEntregar.toString(), sin.aCobrarEntregado.eq(sin.aCobrar)]).toEqual([0, "0", true]);
  });

  it("una entrega de $0 figura cobrada y sin entregas no debe nada", () => {
    expect(repartirCobros("0", [{ id: "x", fecha: "2026-10-07", importe: "0" }], []).entregas[0]!.estado).toBe("COBRADA");
    const vacia = repartirCobros("0", [], []);
    expect([vacia.aCobrar.toString(), vacia.total.toString(), debeDesde(vacia)]).toEqual(["0", "0", null]);
  });
});

describe("el balance del dinero: real, pendiente y total", () => {
  it("real = lo que entró menos lo que salió; pendiente = a cobrar menos a pagar; total = los dos", () => {
    const b = balanceDeDinero({ cobrado: "500000", ingresos: "20000", pagado: "350000", gastos: "45000", aCobrar: "306370", aPagar: "303050" });
    expect([b.entro, b.salio, b.real, b.pendiente, b.total].map((x) => x.toString())).toEqual(["520000", "395000", "125000", "3320", "128320"]);
  });

  it("puede dar negativo: se pagó más de lo que entró, o se debe más de lo que falta cobrar", () => {
    const b = balanceDeDinero({ cobrado: "100", ingresos: "0", pagado: "250", gastos: "50", aCobrar: "0", aPagar: "400" });
    expect([b.real, b.pendiente, b.total].map((x) => x.toString())).toEqual(["-200", "-400", "-600"]);
  });
});

describe("las dos partes de un total (pagado y a pagar, cobrado y a cobrar)", () => {
  it("reparte el total y da porcentajes enteros que suman 100", () => {
    const p = partesDe("653050", "350000");
    expect([p.saldado.toString(), p.pendiente.toString(), p.pctSaldado, p.pctPendiente]).toEqual(["350000", "303050", 54, 46]);
    expect(partesDe("300", "100")).toMatchObject({ pctSaldado: 33, pctPendiente: 67 });
  });

  it("lo saldado nunca pasa del total ni baja de cero", () => {
    expect(partesDe("1000", "1500")).toMatchObject({ pctSaldado: 100, pctPendiente: 0 });
    expect(partesDe("1000", "1500").pendiente.toString()).toBe("0");
    expect(partesDe("1000", "-20")).toMatchObject({ pctSaldado: 0, pctPendiente: 100 });
  });

  it("sin nada, no hay barra", () => {
    expect(partesDe("0", "0")).toMatchObject({ pctSaldado: 0, pctPendiente: 0 });
    expect(partesDe("0", "0").saldado.toString()).toBe("0");
  });
});
