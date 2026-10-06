import { describe, expect, it } from "vitest";

import { dibujoDeProducto } from "@/dominio/catalogo/productos";
import { leerTabla } from "@/dominio/planillas/comun";

describe("lo común de las planillas que se suben", () => {
  it("las columnas se reconocen por su título, en cualquier orden, y lo que no está queda vacío", () => {
    const titulos = { nombre: ["nombre", "producto"], precio: ["precio"], nota: ["nota"] } as const;
    const tabla = leerTabla([["Lista de precios"], ["PRECIO", "Producto"], ["100", " Tomate "], ["", ""], ["250"]], titulos, (hay) => hay.has("nombre") && hay.has("precio"));
    expect(tabla).toEqual([
      { fila: 3, nombre: "Tomate", precio: "100", nota: "" },
      // Una fila más corta que los títulos: lo que falta queda vacío.
      { fila: 5, nombre: "", precio: "250", nota: "" },
    ]);
    expect(leerTabla([["Producto"], ["Tomate"]], titulos, (hay) => hay.has("precio"))).toBeNull();
    expect(leerTabla([], titulos, () => true)).toBeNull();
  });
});

describe("el dibujo de cada producto sale solo", () => {
  it("más nombres con su dibujo, sin que una palabra parecida gane", () => {
    expect(["Chauchas", "Arvejas frescas", "Jengibre", "Aceitunas verdes", "Lima", "Piña", "Brotes de soja", "Miel de campo", "Flores comestibles"].map((n) => dibujoDeProducto(n))).toEqual(["🫛", "🫛", "🫚", "🫒", "🍋", "🍍", "🌱", "🍯", "💐"]);
    // "Habanero" no es un haba, y "Coliflor" no es una flor.
    expect([dibujoDeProducto("Habanero rojo"), dibujoDeProducto("Habas"), dibujoDeProducto("Coliflor"), dibujoDeProducto("Limón")]).toEqual(["🌶️", "🫛", "🥦", "🍋"]);
    expect(dibujoDeProducto("Repollo morado")).toBe("🥬");
    expect([dibujoDeProducto("Mandioca"), dibujoDeProducto("Membrillo"), dibujoDeProducto("Higos")]).toEqual(["🍠", "🍐", "🍑"]);
  });
});
