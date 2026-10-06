import { beforeAll, describe, expect, it } from "vitest";

import { leerXlsx, planillaXlsx } from "@/lib/planilla";
import { guardarCategoria, listarCategorias, moverProductoDeCategoria } from "@/modulos/catalogo/categorias";
import { importarProductos, planillaModeloDeProductos, previsualizarProductos } from "@/modulos/catalogo/importacion";
import { cambiarEstadoProducto, crearProducto, listarProductos, obtenerProducto } from "@/modulos/catalogo/productos";

import { crearBaseDePrueba, crearEmpresaDePrueba, type BaseDePrueba } from "./base-de-prueba";

// Planilla de productos (RN-155) y categorías que existen solo con productos (RN-154).

let base: BaseDePrueba;
let admin: string;

const visibles = async () => (await listarCategorias(base.db, admin, { soloConProductos: true })).map((c) => [c.nombre, c.productosActivos]);

beforeAll(async () => {
  base = await crearBaseDePrueba();
  admin = (await crearEmpresaDePrueba(base.db, "Verdulería")).authUserIdAdmin;
});

describe("planilla de productos", () => {
  it("la planilla modelo tiene los títulos, las listas con Ninguna y la hoja de listas oculta", async () => {
    // Una categoría sin productos no existe para la persona (RN-154): no aparece en la lista.
    await guardarCategoria(base.db, admin, { nombre: "Verduras de estación", grupo: "VERDURA", orden: "1" });
    const hojas = await planillaModeloDeProductos(base.db, admin);
    expect(hojas.map((h) => [h.nombre, h.oculta ?? false])).toEqual([
      ["Productos", false],
      ["Cómo llenarla", false],
      ["Listas", true],
    ]);
    const listas = hojas[2]!.filas.map((f) => f[0]).filter(Boolean);
    expect(listas).toEqual(["Duras", "Blandas", "De hoja", "Aromáticas", "Frágiles", "Secos", "Ninguna"]);
    expect(hojas[2]!.filas.map((f) => f[1]).filter(Boolean)).toContain("Ninguna");
    expect(hojas[0]!.listas?.map((l) => l.opciones)).toEqual(["Listas!$A$2:$A$8", "Listas!$B$2:$B$10", "Listas!$C$2:$C$11"]);
    // Se baja como .xlsx y se vuelve a leer igual.
    expect(leerXlsx(planillaXlsx(hojas))[0]!.filas[0]).toEqual(["Producto", "Categoría", "Se vende por", "Envase en que se compra", "Cuánto trae el envase", "Ganancia %", "Código"]);
  });

  it("con los nombres apilados se ve qué se va a cargar, con lo propuesto y lo que falta", async () => {
    const r = await previsualizarProductos(base.db, admin, [["papa"], ["Lechuga criolla"], ["papa"]]);
    expect(r.productos.map((p) => [p.nombre, p.codigo, p.categoria, p.unidad, p.estado, p.faltan.length])).toEqual([
      ["Papa", "PAPA", "Duras", "KG", "NUEVO", 1],
      ["Lechuga criolla", "LECH-C", "De hoja", "UNIDAD", "NUEVO", 1],
      ["Papa", "PAPA2", "Duras", "KG", "REPETIDO", 1],
    ]);
    expect(r.categorias).toContain("Frágiles");
    await expect(previsualizarProductos(base.db, admin, [["Producto"], [""]])).rejects.toThrow(/no tiene productos/);
  });

  it("carga todo junto: categorías nuevas, Ninguna, envase y ganancia; lo que ya existe se saltea", async () => {
    const r = await importarProductos(base.db, admin, [
      { nombre: "Papa", codigo: "PAPA", categoria: "Duras", unidad: "KG", admiteFraccion: true, envase: { nombre: "Bolsa 25 kg", factor: "25" }, ganancia: "30" },
      { nombre: "Lechuga criolla", codigo: "LECH-C", categoria: "De hoja", unidad: "UNIDAD", admiteFraccion: false, envase: null, ganancia: null },
      { nombre: "Yerba", codigo: "YERB", categoria: null, unidad: "PAQUETE", admiteFraccion: false, envase: null, ganancia: null },
    ]);
    expect(r).toEqual({ creados: 3, salteados: [] });
    expect(await visibles()).toEqual([
      ["Duras", 1],
      ["De hoja", 1],
      ["Sin categoría", 1],
    ]);
    const papa = (await listarProductos(base.db, admin, { texto: "Papa" }))[0]!;
    expect([papa.codigo, papa.presentacionCompra, papa.unidadBase]).toEqual(["PAPA", "Bolsa 25 kg", "KG"]);
    // Otra vez la misma planilla: no se repite nada.
    expect(await importarProductos(base.db, admin, [{ nombre: "papa", codigo: "PAPA", categoria: null, unidad: "KG", admiteFraccion: true, envase: null, ganancia: null }])).toEqual({ creados: 0, salteados: ["papa"] });
  });
});

describe("categorías que existen solo con productos (RN-154)", () => {
  it("al arrastrar el último producto a otra, la que queda vacía desaparece; si se vuelve a usar, reaparece", async () => {
    const lechuga = (await listarProductos(base.db, admin, { texto: "Lechuga" }))[0]!;
    expect(await moverProductoDeCategoria(base.db, admin, { productoId: lechuga.id, nombre: "frágiles" })).toEqual({ categoria: "Frágiles" });
    expect(await visibles()).toEqual([
      ["Duras", 1],
      ["Frágiles", 1],
      ["Sin categoría", 1],
    ]);
    const deHoja = (await listarCategorias(base.db, admin)).find((c) => c.nombre === "De hoja")!;
    expect(deHoja.activo).toBe(false);
    await moverProductoDeCategoria(base.db, admin, { productoId: lechuga.id, id: deHoja.id });
    expect((await listarCategorias(base.db, admin)).find((c) => c.nombre === "De hoja")?.activo).toBe(true);
    // Moverlo a donde ya está no cambia nada.
    expect(await moverProductoDeCategoria(base.db, admin, { productoId: lechuga.id, id: deHoja.id })).toEqual({ categoria: "De hoja" });
  });

  it("dar de baja el último producto oculta su categoría; reactivarlo la vuelve a mostrar", async () => {
    const yerba = (await listarProductos(base.db, admin, { texto: "Yerba" }))[0]!;
    await cambiarEstadoProducto(base.db, admin, { id: yerba.id, activo: false });
    expect((await visibles()).map((v) => v[0])).not.toContain("Sin categoría");
    await cambiarEstadoProducto(base.db, admin, { id: yerba.id, activo: true });
    expect((await visibles()).map((v) => v[0])).toContain("Sin categoría");
  });

  it("al cargar un producto se elige una preelegida, Ninguna o una nueva escrita", async () => {
    const huevos = await crearProducto(base.db, admin, { codigo: "", nombre: "Huevos", categoriaNombre: "Frágiles", unidadBase: "MAPLE", admiteFraccion: false });
    const miel = await crearProducto(base.db, admin, { codigo: "", nombre: "Miel", categoriaNombre: "almacén", unidadBase: "UNIDAD", admiteFraccion: false });
    const sal = await crearProducto(base.db, admin, { codigo: "", nombre: "Sal", unidadBase: "UNIDAD", admiteFraccion: false });
    expect((await obtenerProducto(base.db, admin, huevos)).categoria).toBe("Frágiles");
    expect((await obtenerProducto(base.db, admin, miel)).categoria).toBe("Almacén");
    expect((await obtenerProducto(base.db, admin, sal)).categoria).toBe("Sin categoría");
    // Las preelegidas tienen su orden: lo duro primero, lo frágil después; las nuevas, al final.
    const orden = (await listarCategorias(base.db, admin, { soloConProductos: true })).map((c) => c.nombre);
    expect(orden).toEqual(["Duras", "De hoja", "Frágiles", "Almacén", "Sin categoría"]);
  });
});
