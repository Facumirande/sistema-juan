import { describe, expect, it } from "vitest";

import { costoDeLaLista, costoDeLoQueFalta, repartirLoPagado, type RenglonParaCostear } from "@/dominio/compras/costo-de-la-lista";

// El costo de la compra del día, en efectivo y a crédito (pedido del usuario, 13/10/2026).

const renglon = (r: Partial<RenglonParaCostear>): RenglonParaCostear => ({ estado: "PENDIENTE", compras: [], compradoBase: "0", pendienteBase: "0", factor: "1", precioSugerido: null, costoEstimado: null, enEfectivo: false, ...r });
const pesos = (c: ReturnType<typeof costoDeLaLista>) => ({
  total: c.total.total.toString(),
  efectivo: `${c.efectivo.anotado} + ${c.efectivo.calculado}`,
  credito: `${c.credito.anotado} + ${c.credito.calculado}`,
  sinPrecio: c.sinPrecio,
});

describe("lo que sale lo que falta comprar de un producto", () => {
  it("sin nada comprado, lo calculado al armar la lista (respeta la cantidad puesta a mano)", () => {
    expect(costoDeLoQueFalta(renglon({ pendienteBase: "60", factor: "20", precioSugerido: "21000", costoEstimado: "84000" }))?.toString()).toBe("84000");
    // Sin ese cálculo, los envases que hacen falta al último precio: 60 kg son 3 bolsas de 20.
    expect(costoDeLoQueFalta(renglon({ pendienteBase: "60", factor: "20", precioSugerido: "21000" }))?.toString()).toBe("63000");
  });

  it("con una parte comprada, solo lo que falta de verdad (redondeado a envases enteros)", () => {
    // Hacían falta 100 kg (5 cajas), ya se compraron 60: faltan 40 kg, que son 2 cajas.
    const parcial = renglon({ estado: "PARCIAL", compradoBase: "60", pendienteBase: "40", factor: "20", precioSugerido: "25000", costoEstimado: "125000", compras: [{ subtotal: "75000", pagado: "0" }] });
    expect(costoDeLoQueFalta(parcial)?.toString()).toBe("50000");
    // 23 kg que faltan son 2 bolsas de 20.
    expect(costoDeLoQueFalta(renglon({ estado: "PARCIAL", compradoBase: "40", pendienteBase: "23", factor: "20", precioSugerido: "13600" }))?.toString()).toBe("27200");
  });

  it("sin precio en el puesto, sigue con lo que salió lo ya comprado; sin nada con qué calcular, no se sabe", () => {
    expect(costoDeLoQueFalta(renglon({ estado: "PARCIAL", compradoBase: "60", pendienteBase: "30", compras: [{ subtotal: "72000", pagado: "72000" }] }))?.toString()).toBe("36000");
    expect(costoDeLoQueFalta(renglon({ pendienteBase: "10" }))).toBeNull();
    expect(costoDeLoQueFalta(renglon({ pendienteBase: "10", precioSugerido: "0", costoEstimado: "0" }))).toBeNull();
  });

  it("lo comprado entero y lo que no se consiguió no suman nada más", () => {
    expect(costoDeLoQueFalta(renglon({ estado: "COMPRADO", compradoBase: "100", pendienteBase: "0", precioSugerido: "25000", costoEstimado: "125000" }))?.toString()).toBe("0");
    expect(costoDeLoQueFalta(renglon({ estado: "NO_CONSEGUIDO", pendienteBase: "50", precioSugerido: "9000", costoEstimado: "45000" }))?.toString()).toBe("0");
  });
});

describe("el costo de la compra: total, en efectivo y a crédito", () => {
  it("lo anotado va a lo que salió: lo pagado en efectivo y lo que falta pagar a crédito", () => {
    const costo = costoDeLaLista([
      renglon({ estado: "COMPRADO", compradoBase: "100", compras: [{ subtotal: "125000", pagado: "125000" }] }),
      renglon({ estado: "COMPRADO", compradoBase: "80", compras: [{ subtotal: "54400", pagado: "0" }] }),
      // Una compra pagada en parte: $30.000 de $86.400.
      renglon({ estado: "COMPRADO", compradoBase: "98", compras: [{ subtotal: "86400", pagado: "30000" }] }),
    ]);
    expect(pesos(costo)).toEqual({ total: "265800", efectivo: "155000 + 0", credito: "110800 + 0", sinPrecio: 0 });
    expect(costo.total.anotado.toString()).toBe("265800");
  });

  it("lo que falta se calcula: sin puesto va en efectivo; con puesto, a crédito", () => {
    const costo = costoDeLaLista([
      renglon({ pendienteBase: "60", factor: "20", precioSugerido: "21000", costoEstimado: "63000", enEfectivo: true }),
      renglon({ pendienteBase: "30", factor: "1", precioSugerido: "1500", costoEstimado: "45000" }),
      // Tildado sin anotar el precio: se compró, pero lo que salió se calcula.
      renglon({ estado: "COMPRADO", pendienteBase: "12", factor: "12", precioSugerido: "9600", costoEstimado: "9600" }),
    ]);
    expect(pesos(costo)).toEqual({ total: "117600", efectivo: "0 + 63000", credito: "0 + 54600", sinPrecio: 0 });
    expect(costo.total.calculado.toString()).toBe("117600");
  });

  it("todo junto: una parte comprada cuenta lo anotado y lo que falta; lo no conseguido y lo sin precio, no", () => {
    const costo = costoDeLaLista([
      // 3 cajas pagadas en efectivo y faltan 2, que irían a crédito (tiene puesto).
      renglon({ estado: "PARCIAL", compradoBase: "60", pendienteBase: "40", factor: "20", precioSugerido: "25000", costoEstimado: "125000", compras: [{ subtotal: "75000", pagado: "75000" }] }),
      // Dos compras del mismo producto: una a cuenta y otra pagada.
      renglon({
        estado: "COMPRADO",
        compradoBase: "270",
        compras: [
          { subtotal: "162000", pagado: "0" },
          { subtotal: "85500", pagado: "85500" },
        ],
      }),
      renglon({ estado: "NO_CONSEGUIDO", pendienteBase: "20", precioSugerido: "4000", costoEstimado: "80000" }),
      renglon({ pendienteBase: "5" }),
      renglon({ pendienteBase: "8", enEfectivo: true }),
    ]);
    expect(pesos(costo)).toEqual({ total: "372500", efectivo: "160500 + 0", credito: "162000 + 50000", sinPrecio: 2 });
    // El total es siempre efectivo más crédito, y lo anotado más lo calculado.
    expect(costo.total.total.toString()).toBe(costo.efectivo.total.plus(costo.credito.total).toString());
    expect(costoDeLaLista([]).total.total.toString()).toBe("0");
  });

  it("un importe pagado que no cierra (más que la compra, o negativo) no pasa de lo que salió", () => {
    const costo = costoDeLaLista([renglon({ estado: "COMPRADO", compras: [{ subtotal: "10000", pagado: "12000" }] }), renglon({ estado: "COMPRADO", compras: [{ subtotal: "5000", pagado: "-3" }] })]);
    expect(pesos(costo)).toEqual({ total: "15000", efectivo: "10000 + 0", credito: "5000 + 0", sinPrecio: 0 });
  });
});

describe("lo pagado de una compra, repartido entre sus productos", () => {
  const partes = (subtotales: string[], total: string, pagado: string) => repartirLoPagado(subtotales, total, pagado).map(String);

  it("toda, nada o una parte, en proporción a lo que salió cada producto", () => {
    expect(partes(["162000", "54400", "86400"], "302800", "302800")).toEqual(["162000", "54400", "86400"]);
    expect(partes(["162000", "54400", "86400"], "302800", "0")).toEqual(["0", "0", "0"]);
    // La compra mixta del plan: $100.000 pagados de $302.800.
    expect(partes(["162000", "54400", "86400"], "302800", "100000")).toEqual(["53501", "17966", "28533"]);
  });

  it("la suma da justo lo pagado: el redondeo no pierde ni inventa pesos", () => {
    const tercios = repartirLoPagado(["1000", "1000", "1000"], "3000", "1000");
    expect(tercios.map(String)).toEqual(["333", "333", "334"]);
    expect(tercios.reduce((a, b) => a.plus(b)).toString()).toBe("1000");
    // Más pagado que la compra no pasa del total; una compra en cero no reparte nada.
    expect(partes(["600", "400"], "1000", "5000")).toEqual(["600", "400"]);
    expect(partes(["0", "0"], "0", "100")).toEqual(["0", "0"]);
    expect(partes([], "1000", "100")).toEqual([]);
  });
});
