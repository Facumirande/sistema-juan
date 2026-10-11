import { describe, expect, it } from "vitest";

import { resumenBalance } from "@/dominio/reportes/resumen-balance";

type Datos = Parameters<typeof resumenBalance>[0];
const SIN_NADA: Datos = { compras: "0", pagadoDeCompras: "0", gastos: "0", cobrado: "0", aCobrar: "0", cajaInicial: null };
const resumen = (datos: Partial<Datos>) => resumenBalance({ ...SIN_NADA, ...datos });

const texto = (r: ReturnType<typeof resumenBalance>) => ({
  pagado: r.pagado.toString(),
  credito: r.credito.toString(),
  ganancia: r.ganancia.toString(),
  aCobrar: r.aCobrar.toString(),
  caja: r.cajaInicial?.toString() ?? null,
  exceso: r.exceso?.toString() ?? null,
});

describe("el resumen balance del tablero", () => {
  it("un día sin nada da todo en cero y, sin caja cargada, no avisa", () => {
    expect(texto(resumen({}))).toEqual({ pagado: "0", credito: "0", ganancia: "0", aCobrar: "0", caja: null, exceso: null });
  });

  it("lo comprado a cuenta es crédito; lo ya pagado y los gastos del día, pagado", () => {
    expect(texto(resumen({ compras: "500000", pagadoDeCompras: "180000", gastos: "20000" }))).toMatchObject({ pagado: "200000", credito: "320000" });
  });

  it("pagar después una compra que estaba a cuenta la pasa de crédito a pagado", () => {
    expect(texto(resumen({ compras: "500000", pagadoDeCompras: "500000" }))).toMatchObject({ pagado: "500000", credito: "0" });
  });

  it("la ganancia es lo ya cobrado menos lo pagado: negativa mientras no se cobra", () => {
    // Se compró y se pagó, todavía no se cobró nada: la plata salió y no volvió.
    expect(texto(resumen({ compras: "400000", pagadoDeCompras: "400000", aCobrar: "600000" }))).toMatchObject({ pagado: "400000", ganancia: "-400000", aCobrar: "600000" });
    // Ya cobraron una parte.
    expect(texto(resumen({ compras: "400000", pagadoDeCompras: "400000", cobrado: "450000", aCobrar: "150000" }))).toMatchObject({ ganancia: "50000", aCobrar: "150000" });
    // Cobrado todo.
    expect(texto(resumen({ compras: "400000", pagadoDeCompras: "400000", cobrado: "600000" }))).toMatchObject({ ganancia: "200000", aCobrar: "0" });
  });

  it("el crédito no se resta de la ganancia: todavía no se pagó", () => {
    expect(texto(resumen({ compras: "400000", pagadoDeCompras: "100000", cobrado: "300000" }))).toMatchObject({ pagado: "100000", credito: "300000", ganancia: "200000" });
  });

  it("todo va en pesos enteros, y pagado más crédito es siempre lo gastado", () => {
    const r = resumen({ compras: "1000.50", pagadoDeCompras: "333.33", gastos: "0.49", cobrado: "700.60", aCobrar: "99.50" });
    expect(texto(r)).toMatchObject({ credito: "667", pagado: "334", ganancia: "367", aCobrar: "100" });
    expect(r.pagado.plus(r.credito).toString()).toBe(r.gastos.toString());
  });

  it("si los gastos del día (pagado más crédito) superan la caja inicial dice por cuánto", () => {
    expect(texto(resumen({ compras: "400000", gastos: "150000", cajaInicial: "500000" }))).toMatchObject({ caja: "500000", exceso: "50000" });
  });

  it("gastar justo la caja inicial no es superarla", () => {
    expect(resumen({ compras: "500000", pagadoDeCompras: "500000", cajaInicial: "500000" }).exceso).toBeNull();
  });

  it("con la caja inicial en $0, cualquier gasto la supera", () => {
    expect(resumen({ gastos: "100", cajaInicial: "0" }).exceso?.toString()).toBe("100");
  });

  it("un pago mayor que la compra no deja crédito negativo", () => {
    expect(texto(resumen({ compras: "1000", pagadoDeCompras: "1500" }))).toMatchObject({ pagado: "1000", credito: "0" });
  });
});
