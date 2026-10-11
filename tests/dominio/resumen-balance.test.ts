import { describe, expect, it } from "vitest";

import { resumenBalance } from "@/dominio/reportes/resumen-balance";

const texto = (r: ReturnType<typeof resumenBalance>) => ({
  gastos: r.gastos.toString(),
  pagado: r.pagado.toString(),
  credito: r.credito.toString(),
  caja: r.cajaInicial?.toString() ?? null,
  exceso: r.exceso?.toString() ?? null,
});

describe("el resumen balance del tablero", () => {
  it("un día sin nada da todo en cero y, sin caja cargada, no avisa", () => {
    expect(texto(resumenBalance({ compras: "0", pagadoDeCompras: "0", gastos: "0", cajaInicial: null }))).toEqual({ gastos: "0", pagado: "0", credito: "0", caja: null, exceso: null });
  });

  it("los gastos son lo comprado más los gastos del día, en pesos enteros", () => {
    expect(resumenBalance({ compras: "653050.40", pagadoDeCompras: "653050.40", gastos: "12000.60", cajaInicial: null }).gastos.toString()).toBe("665051");
  });

  it("lo comprado a cuenta es crédito; lo ya pagado y los gastos del día, pagado", () => {
    const r = resumenBalance({ compras: "500000", pagadoDeCompras: "180000", gastos: "20000", cajaInicial: "600000" });
    expect(texto(r)).toEqual({ gastos: "520000", pagado: "200000", credito: "320000", caja: "600000", exceso: null });
  });

  it("pagado más crédito da siempre los gastos, también con centavos", () => {
    const r = resumenBalance({ compras: "1000.50", pagadoDeCompras: "333.33", gastos: "0.49", cajaInicial: null });
    expect(r.pagado.plus(r.credito).toString()).toBe(r.gastos.toString());
    expect(texto(r)).toMatchObject({ gastos: "1001", credito: "667", pagado: "334" });
  });

  it("si los gastos superan la caja inicial dice por cuánto", () => {
    expect(texto(resumenBalance({ compras: "400000", pagadoDeCompras: "0", gastos: "150000", cajaInicial: "500000" }))).toMatchObject({ gastos: "550000", caja: "500000", exceso: "50000" });
  });

  it("gastar justo la caja inicial no es superarla", () => {
    expect(resumenBalance({ compras: "500000", pagadoDeCompras: "500000", gastos: "0", cajaInicial: "500000" }).exceso).toBeNull();
  });

  it("con la caja inicial en $0, cualquier gasto la supera", () => {
    expect(resumenBalance({ compras: "0", pagadoDeCompras: "0", gastos: "100", cajaInicial: "0" }).exceso?.toString()).toBe("100");
  });

  it("un pago mayor que la compra no deja crédito negativo", () => {
    expect(texto(resumenBalance({ compras: "1000", pagadoDeCompras: "1500", gastos: "0", cajaInicial: null }))).toMatchObject({ gastos: "1000", pagado: "1000", credito: "0" });
  });
});
