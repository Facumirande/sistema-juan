import { describe, expect, it } from "vitest";

import { problemasDeProducto, type ProductoARevisar } from "@/dominio/catalogo/revision";

const bien: ProductoARevisar = { ofertas: 2, costo: "1000", ganancia: "30", preciosFijos: [], gananciasDeClientes: [] };

describe("lo esencial de un producto", () => {
  it("con precio de compra y ganancia, no hay nada que arreglar", () => {
    expect(problemasDeProducto(bien)).toEqual([]);
    // Un precio pactado igual o por arriba del costo, y una ganancia en cero, están bien.
    expect(problemasDeProducto({ ...bien, ganancia: "0", preciosFijos: [{ cliente: "Hospital", precio: "1000" }], gananciasDeClientes: [{ cliente: "Bar", ganancia: "5" }] })).toEqual([]);
  });

  it("sin precio de compra se avisa (y no se compara contra un costo que no hay)", () => {
    expect(problemasDeProducto({ ...bien, ofertas: 0, costo: null, preciosFijos: [{ cliente: "Hospital", precio: "10" }] })).toEqual(["Le falta el precio de compra: sin eso no se sabe dónde comprarlo ni a cuánto venderlo."]);
  });

  it("se avisa lo que se vende por debajo de lo que cuesta", () => {
    const r = problemasDeProducto({
      ...bien,
      ganancia: "-5",
      preciosFijos: [
        { cliente: "Hospital San Martín", precio: "900" },
        { cliente: "Restaurante", precio: "1200" },
      ],
      gananciasDeClientes: [{ cliente: "Verdulería", ganancia: "-2.5" }],
    });
    expect(r).toEqual([
      "Tiene ganancia negativa (-5 %): se vende por debajo de lo que cuesta.",
      "A Hospital San Martín se le vende a $900 y cuesta $1.000: se pierde plata en cada venta.",
      "A Verdulería se le vende con ganancia negativa (-2,5 %): por debajo de lo que cuesta.",
    ]);
  });
});
