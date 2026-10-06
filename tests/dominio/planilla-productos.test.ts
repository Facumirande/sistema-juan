import { describe, expect, it } from "vitest";

import { filasDeProductos, grupoDeCategoria, interpretarProductos, type CatalogoDeProductos, type FilaDeProducto } from "@/dominio/catalogo/planilla";
import { dibujoDeProducto } from "@/dominio/catalogo/productos";
import { casiIgual, leerTabla, unidadEscrita } from "@/dominio/planillas/comun";

const catalogo: CatalogoDeProductos = {
  categorias: [
    { id: "cat-verduras", nombre: "Verduras", activa: true },
    { id: "cat-frutas", nombre: "Frutas", activa: true },
    { id: "cat-vieja", nombre: "Conservas", activa: false },
  ],
  productos: [
    { codigo: "TOMA-R", nombre: "Tomate redondo" },
    { codigo: "PAPA", nombre: "Papa" },
  ],
};

const fila = (n: number, datos: Partial<Omit<FilaDeProducto, "fila">>): FilaDeProducto => ({ fila: n, codigo: "", producto: "", categoria: "", unidad: "", envase: "", trae: "", fraccion: "", ganancia: "", notas: "", ...datos });

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

  it("la unidad, como la escriba la persona", () => {
    expect(unidadEscrita("Kilos")).toBe("KG");
    expect(unidadEscrita("por unidad")).toBe("UNIDAD");
    expect(unidadEscrita(" LTS ")).toBe("LITRO");
    expect(unidadEscrita("ramito")).toBeNull();
  });

  it("un nombre casi igual a uno que existe es un error de tipeo, no algo nuevo", () => {
    expect(casiIgual("Verduas", ["Frutas", "Verduras"])).toBe("Verduras");
    expect(casiIgual("frutaz", ["Frutas", "Verduras"])).toBe("Frutas");
    expect(casiIgual("Verduras de hoja", ["Frutas", "Verduras"])).toBeNull();
    // Con tan pocas letras, cualquier cosa se parece: no se adivina.
    expect(casiIgual("Uva", ["Uvas"])).toBeNull();
  });
});

describe("las filas de productos de una planilla", () => {
  it("encuentra los títulos y lee cada producto; sin títulos o sin filas, explica qué falta", () => {
    const { filas, problema } = filasDeProductos([
      ["Categoría", "Producto", "Se vende por", "Trae", "Envase"],
      ["Verduras", "Zapallito", "kg", "15", "Cajón"],
    ]);
    expect(problema).toBeNull();
    expect(filas).toEqual([fila(2, { producto: "Zapallito", categoria: "Verduras", unidad: "kg", envase: "Cajón", trae: "15" })]);
    expect(filasDeProductos([["Zapallito", "Verduras"]]).problema).toMatch(/Producto y Categoría/);
    expect(filasDeProductos([["Producto", "Categoría"]]).problema).toMatch(/ningún producto/);
  });

  it("una categoría nueva va al grupo que dice su nombre", () => {
    expect(["Frutas secas", "Verduras de hoja", "Hojas verdes", "Hortalizas", "Granja"].map(grupoDeCategoria)).toEqual(["FRUTA", "VERDURA", "VERDURA", "VERDURA", "OTRO"]);
  });
});

describe("armar los productos de la planilla", () => {
  it("cada producto con su categoría, cómo se vende y en qué envase se compra; lo que falta toma el valor de siempre", () => {
    const r = interpretarProductos(
      [
        fila(2, { producto: "Zapallito verde", categoria: "verduras", envase: "Cajón", trae: "15", ganancia: "35 %", notas: "tiernos" }),
        fila(3, { codigo: "ruc", producto: "Rúcula", categoria: "Verduras de hoja", unidad: "Atado" }),
        fila(4, { producto: "Espinaca", categoria: "verduras de hoja", unidad: "atado", fraccion: "Sí" }),
        fila(5, { producto: "Huevo blanco", categoria: "Granja", unidad: "maple", envase: "Caja x 12", trae: "12", fraccion: "no" }),
        fila(6, { producto: "Jugo de naranja", categoria: "Frutas", unidad: "litros", envase: "suelto" }),
        fila(7, { producto: "Banana", categoria: "Frutas", envase: "kg", trae: "1" }),
        // Ya están cargados (por nombre o por código): se saltean, no son un error.
        fila(8, { producto: "tomate REDONDO", categoria: "Verduras" }),
        fila(9, { codigo: "papa", producto: "Papa blanca", categoria: "Verduras" }),
      ],
      catalogo,
    );
    expect(r.problemas).toEqual([]);
    expect(r.yaEstan).toEqual(["tomate REDONDO", "Papa blanca"]);
    expect(r.categoriasNuevas).toEqual([
      { nombre: "Verduras de hoja", grupo: "VERDURA" },
      { nombre: "Granja", grupo: "OTRO" },
    ]);
    expect(r.nuevos).toEqual([
      { fila: 2, codigo: null, nombre: "Zapallito verde", categoria: "Verduras", categoriaId: "cat-verduras", unidadBase: "KG", admiteFraccion: true, envase: { nombre: "Cajón 15 kg", trae: "15" }, ganancia: "35", notas: "tiernos" },
      { fila: 3, codigo: "RUC", nombre: "Rúcula", categoria: "Verduras de hoja", categoriaId: null, unidadBase: "ATADO", admiteFraccion: false, envase: null, ganancia: null, notas: null },
      { fila: 4, codigo: null, nombre: "Espinaca", categoria: "Verduras de hoja", categoriaId: null, unidadBase: "ATADO", admiteFraccion: true, envase: null, ganancia: null, notas: null },
      // Un envase que ya trae su tamaño en el nombre queda como está.
      { fila: 5, codigo: null, nombre: "Huevo blanco", categoria: "Granja", categoriaId: null, unidadBase: "MAPLE", admiteFraccion: false, envase: { nombre: "Caja x 12", trae: "12" }, ganancia: null, notas: null },
      { fila: 6, codigo: null, nombre: "Jugo de naranja", categoria: "Frutas", categoriaId: "cat-frutas", unidadBase: "LITRO", admiteFraccion: true, envase: null, ganancia: null, notas: null },
      // "kg" como envase es lo mismo que suelto.
      { fila: 7, codigo: null, nombre: "Banana", categoria: "Frutas", categoriaId: "cat-frutas", unidadBase: "KG", admiteFraccion: true, envase: null, ganancia: null, notas: null },
    ]);
  });

  it("cada fila que no se entiende dice qué pasa y cómo arreglarlo", () => {
    const r = interpretarProductos(
      [
        fila(2, { categoria: "Verduras" }),
        fila(3, { producto: "X".repeat(121), categoria: "Verduras" }),
        fila(4, { codigo: "UN-CODIGO-LARGUISIMO-DE-MAS", producto: "Acelga", categoria: "Verduras" }),
        fila(5, { producto: "Perejil", categoria: "Verduras" }),
        fila(6, { producto: "perejil", categoria: "Verduras" }),
        fila(7, { codigo: "KIWI", producto: "Kiwi", categoria: "Frutas" }),
        fila(8, { codigo: "kiwi", producto: "Kiwi gold", categoria: "Frutas" }),
        fila(9, { producto: "Apio" }),
        fila(10, { producto: "Durazno en lata", categoria: "conservas" }),
        fila(11, { producto: "Radicheta", categoria: "Verduas" }),
        fila(12, { producto: "Albahaca", categoria: "Verduras", unidad: "ramito" }),
        fila(13, { producto: "Naranja", categoria: "Frutas", trae: "20" }),
        fila(14, { producto: "Mandarina", categoria: "Frutas", envase: "Cajón" }),
        fila(15, { producto: "Pomelo", categoria: "Frutas", envase: "Cajón", trae: "0" }),
        fila(16, { producto: "Limón", categoria: "Frutas", fraccion: "a veces" }),
        fila(17, { producto: "Pera", categoria: "Frutas", ganancia: "mucha" }),
        fila(18, { producto: "Manzana", categoria: "Frutas", ganancia: "-5" }),
        fila(19, { producto: "Uva", categoria: "Frutas", ganancia: "2000" }),
        // Una categoría nueva que solo aparece en una fila con problemas no se crea.
        fila(20, { producto: "Nuez", categoria: "Frutos secos", unidad: "puñado" }),
      ],
      catalogo,
    );
    expect(r.nuevos.map((p) => p.nombre)).toEqual(["Perejil", "Kiwi"]);
    expect(r.categoriasNuevas).toEqual([]);
    expect(r.problemas.map((p) => p.fila)).toEqual([2, 3, 4, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    const de = (n: number) => r.problemas.find((p) => p.fila === n)!.mensaje;
    expect(de(2)).toBe("Falta el nombre del producto.");
    expect(de(3)).toContain("muy largo");
    expect(de(4)).toContain("Dejalo vacío y se arma solo");
    expect(de(6)).toContain("ya aparece (con ese nombre o ese código) en la fila 5");
    expect(de(8)).toContain("en la fila 7");
    expect(de(9)).toContain("falta la categoría");
    expect(de(10)).toContain("está dada de baja");
    expect(de(11)).toContain("¿Quisiste decir “Verduras”?");
    expect(de(12)).toContain("no entiendo cómo se vende (“ramito”)");
    expect(de(13)).toContain("falta el envase");
    expect(de(14)).toContain("falta cuántos kg trae el envase “Cajón”");
    expect(de(15)).toContain("falta cuántos kg trae");
    expect(de(16)).toContain("poné sí o no");
    expect(de(17)).toContain("no es un porcentaje");
    expect(de(18)).toContain("no es un porcentaje");
    expect(de(19)).toContain("no es un porcentaje");
  });
});

describe("el dibujo de cada producto sale solo", () => {
  it("más nombres con su dibujo, sin que una palabra parecida gane", () => {
    expect(["Chauchas", "Arvejas frescas", "Jengibre", "Aceitunas verdes", "Lima", "Piña", "Brotes de soja", "Miel de campo", "Flores comestibles"].map((n) => dibujoDeProducto(n))).toEqual(["🫛", "🫛", "🫚", "🫒", "🍋", "🍍", "🌱", "🍯", "💐"]);
    // "Habanero" no es un haba, y "Coliflor" no es una flor.
    expect([dibujoDeProducto("Habanero rojo"), dibujoDeProducto("Habas"), dibujoDeProducto("Coliflor"), dibujoDeProducto("Limón")]).toEqual(["🌶️", "🫛", "🥦", "🍋"]);
    expect(dibujoDeProducto("Repollo morado")).toBe("🥬");
  });
});
