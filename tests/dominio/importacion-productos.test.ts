import { describe, expect, it } from "vitest";

import { categoriaSugerida, esNinguna, nombreDeCategoria, normalizar, preelegida, CATEGORIAS_PREELEGIDAS, SIN_CATEGORIA } from "@/dominio/catalogo/categorias";
import { COLUMNAS_PLANILLA, filasDePlanilla, interpretarProductos, nombreDeProducto } from "@/dominio/catalogo/importacion";
import { dibujoDeProducto, grupoDeProducto, interpretarUnidad, unidadSugerida } from "@/dominio/catalogo/productos";

// Planilla modelo de productos y categorías preelegidas (RN-154, RN-155).

describe("categorías preelegidas", () => {
  it("van de lo duro (abajo) a lo frágil (arriba) y se puede elegir ninguna", () => {
    expect(CATEGORIAS_PREELEGIDAS.map((c) => c.nombre)).toEqual(["Duras", "Blandas", "De hoja", "Aromáticas", "Frágiles", "Secos"]);
    expect(preelegida("  FRAGILES ")?.nombre).toBe("Frágiles");
    expect(preelegida("sin categoría")).toBe(SIN_CATEGORIA);
    expect(preelegida("Otra cosa")).toBeNull();
    for (const t of ["Ninguna", "ninguno", "Sin categoría", "-", "n/a"]) expect(esNinguna(t)).toBe(true);
    expect(esNinguna("Duras")).toBe(false);
  });

  it("los nombres se escriben prolijos", () => {
    expect(normalizar("  Cebolla   MORADA ")).toBe("cebolla morada");
    expect(nombreDeCategoria("  de   hoja ")).toBe("De hoja");
    expect(nombreDeCategoria("FRUTAS")).toBe("Frutas");
    expect(nombreDeCategoria("Frutas del Norte")).toBe("Frutas del Norte");
    expect(nombreDeProducto("papa negra")).toBe("Papa negra");
    expect(nombreDeProducto("TOMATE")).toBe("Tomate");
    expect(nombreDeProducto("Tomate Perita")).toBe("Tomate Perita");
  });

  it("propone la categoría por el nombre: manda la primera palabra que se reconoce", () => {
    expect(categoriaSugerida("Papa negra")).toBe("Duras");
    expect(categoriaSugerida("Papaya")).toBe("Blandas");
    expect(categoriaSugerida("Cebolla morada")).toBe("Duras");
    expect(categoriaSugerida("Frutillas")).toBe("Frágiles");
    expect(categoriaSugerida("Huevos de campo")).toBe("Frágiles");
    expect(categoriaSugerida("Lechuga mantecosa")).toBe("De hoja");
    expect(categoriaSugerida("Perejil")).toBe("Aromáticas");
    expect(categoriaSugerida("Ají")).toBe("Blandas");
    expect(categoriaSugerida("Ajo")).toBe("Secos");
    expect(categoriaSugerida("Yerba")).toBeNull();
  });
});

describe("dibujo, grupo y forma de vender por el nombre", () => {
  it("fruta o verdura según el nombre; si no se sabe, el grupo de la categoría", () => {
    expect(grupoDeProducto("Banana")).toBe("FRUTA");
    expect(grupoDeProducto("Tomate redondo")).toBe("VERDURA");
    expect(grupoDeProducto("Huevos")).toBe("OTRO");
    expect(grupoDeProducto("Yerba", "FRUTA")).toBe("FRUTA");
    expect(grupoDeProducto("Yerba", "OTRO")).toBe("OTRO");
    expect(grupoDeProducto("Yerba")).toBe("OTRO");
    expect(dibujoDeProducto("Jengibre")).toBe("🫚");
    expect(dibujoDeProducto("Cebolla morada")).toBe("🧅");
  });

  it("entiende cómo se vende escrito de muchas formas", () => {
    expect(interpretarUnidad("Kilo")).toBe("KG");
    expect(interpretarUnidad(" kg. ")).toBe("KG");
    expect(interpretarUnidad("Unidades")).toBe("UNIDAD");
    expect(interpretarUnidad("atado")).toBe("ATADO");
    expect(interpretarUnidad("LTS")).toBe("LITRO");
    expect(interpretarUnidad("")).toBe("NINGUNA");
    expect(interpretarUnidad("Ninguna")).toBe("NINGUNA");
    expect(interpretarUnidad("a ojo")).toBeNull();
  });

  it("propone cómo se vende por el nombre (por kilo si no se sabe)", () => {
    expect(unidadSugerida("Huevos blancos")).toBe("MAPLE");
    expect(unidadSugerida("Perejil")).toBe("ATADO");
    expect(unidadSugerida("Lechuga criolla")).toBe("UNIDAD");
    expect(unidadSugerida("Papa")).toBe("KG");
  });
});

describe("filas de la planilla", () => {
  it("con los títulos de la planilla modelo toma cada columna; sin productos no hay fila", () => {
    const filas = filasDePlanilla([
      ["Planilla de productos"],
      [...COLUMNAS_PLANILLA],
      ["  Papa  ", "Duras", "Kilo", "Bolsa", "25", "30", ""],
      ["", "Blandas"],
      ["Tomate", "", "", "", "", "", "tom1"],
    ]);
    expect(filas).toEqual([
      { fila: 3, producto: "Papa", categoria: "Duras", unidad: "Kilo", envase: "Bolsa", cantidad: "25", ganancia: "30", codigo: "" },
      { fila: 5, producto: "Tomate", categoria: "", unidad: "", envase: "", cantidad: "", ganancia: "", codigo: "tom1" },
    ]);
  });

  it("con títulos en otro orden o con otros nombres también", () => {
    expect(filasDePlanilla([["Código", "Nombre", "Unidad (venta)"], ["X1", "Pera"]])).toEqual([
      { fila: 2, producto: "Pera", categoria: "", unidad: "", envase: "", cantidad: "", ganancia: "", codigo: "X1" },
    ]);
  });

  it("sin títulos, los nombres apilados en la primera columna", () => {
    expect(filasDePlanilla([["papa"], ["cebolla"], [], ["tomate"]]).map((f) => [f.fila, f.producto])).toEqual([
      [1, "papa"],
      [2, "cebolla"],
      [4, "tomate"],
    ]);
  });
});

describe("qué se carga de cada fila", () => {
  const contexto = { codigos: ["PAPA"], nombres: ["Banana"], categorias: ["Verduras de estación"] };
  const fila = (producto: string, resto: Partial<Record<"categoria" | "unidad" | "envase" | "cantidad" | "ganancia" | "codigo", string>> = {}, n = 2) => ({
    fila: n,
    producto,
    categoria: "",
    unidad: "",
    envase: "",
    cantidad: "",
    ganancia: "",
    codigo: "",
    ...resto,
  });

  it("solo con el nombre: código, dibujo, categoría y forma de vender propuestos; avisa lo importante", () => {
    const [p] = interpretarProductos([fila("papa negra")], contexto);
    expect(p).toEqual({
      fila: 2,
      nombre: "Papa negra",
      codigo: "PAPA-N",
      dibujo: "🥔",
      categoria: "Duras",
      categoriaPropuesta: true,
      unidad: "KG",
      unidadPropuesta: true,
      admiteFraccion: true,
      envase: null,
      ganancia: null,
      faltan: ["Falta decir cómo se vende: quedó por kilo, revisalo."],
      estado: "NUEVO",
    });
  });

  it("con todo completo no avisa nada; respeta la categoría existente y el código libre", () => {
    const [p] = interpretarProductos([fila("Zapallo anco", { categoria: "verduras de ESTACION", unidad: "Kilo", envase: "bolsa", cantidad: "20", ganancia: "35%", codigo: "zap 1" })], contexto);
    expect(p).toMatchObject({ codigo: "ZAP1", categoria: "Verduras de estación", categoriaPropuesta: false, unidad: "KG", unidadPropuesta: false, envase: { nombre: "Bolsa 20 kg", factor: "20" }, ganancia: "35", faltan: [] });
  });

  it("ninguna categoría, una preelegida escrita distinto o una nueva", () => {
    const r = interpretarProductos([fila("Yerba", { categoria: "Ninguna", unidad: "paquete" }), fila("Uva", { categoria: "fragiles", unidad: "kg" }), fila("Miel", { categoria: "almacén", unidad: "u" })], contexto);
    expect(r.map((p) => [p.categoria, p.categoriaPropuesta, p.dibujo, p.admiteFraccion])).toEqual([
      [null, false, "📦", false],
      ["Frágiles", false, "🍇", true],
      ["Almacén", false, "🍯", false],
    ]);
    // Sin categoría escrita y sin sugerencia: queda sin categoría.
    expect(interpretarProductos([fila("Yerba", { unidad: "kilo" })], contexto)[0]).toMatchObject({ categoria: null, categoriaPropuesta: false });
  });

  it("avisa lo que no se entiende o falta de lo importante; lo opcional mal escrito se ignora", () => {
    const [p] = interpretarProductos([fila("Perejil", { unidad: "a ojo", envase: "Paquete", ganancia: "mucho" })], contexto);
    expect(p).toMatchObject({ unidad: "ATADO", unidadPropuesta: true, envase: null, ganancia: null });
    expect(p!.faltan).toEqual(["No se entendió “a ojo” en cómo se vende: quedó por atado, revisalo.", "Falta cuánto trae el envase (paquete): se carga sin envase, completalo en su ficha."]);
    expect(interpretarProductos([fila("Papa", { unidad: "kilo", envase: "Suelto", ganancia: "5000" })], contexto)[0]).toMatchObject({ envase: null, ganancia: null });
  });

  it("lo que ya existe o se repite en la planilla no se carga dos veces; los códigos no se pisan", () => {
    const r = interpretarProductos([fila("banana", {}, 2), fila("Papa", {}, 3), fila("PAPA", {}, 4), fila("Papa", { codigo: "PAPA" }, 5)], contexto);
    expect(r.map((p) => [p.fila, p.estado, p.codigo])).toEqual([
      [2, "YA_EXISTE", "BANA"],
      [3, "NUEVO", "PAPA2"],
      [4, "REPETIDO", "PAPA3"],
      [5, "REPETIDO", "PAPA3"],
    ]);
  });
});
