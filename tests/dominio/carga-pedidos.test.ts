import { describe, expect, it } from "vitest";

import { textoParaPersona } from "@/dominio/errores";
import {
  agregadosPrimero,
  cantidadPermitida,
  cantidadesRapidas,
  coincideBusqueda,
  diferenciasDeLineas,
  juntarLineas,
  leerCantidad,
  normalizarBusqueda,
  presentacionInicial,
  sumarCantidad,
  textoCantidad,
} from "@/dominio/pedidos/carga";

const kg = { id: "kg", nombre: "kg", factor: "1", esUnidadBase: true };
const cajon = { id: "cajon", nombre: "Cajón 18 kg", factor: "18", esUnidadBase: false };

describe("carga visual de pedidos", () => {
  it("lee la cantidad escrita con coma o punto", () => {
    expect(leerCantidad("2,5")).toBe("2.5");
    expect(leerCantidad(" 3 ")).toBe("3");
    expect(leerCantidad("1.25")).toBe("1.25");
    expect(leerCantidad("0")).toBeNull();
    expect(leerCantidad("abc")).toBeNull();
    expect(leerCantidad("2,5555")).toBeNull();
    expect(leerCantidad("")).toBeNull();
  });

  it("suma y resta sin bajar de cero", () => {
    expect(sumarCantidad("2", "1")).toBe("3");
    expect(sumarCantidad("", "1")).toBe("1");
    expect(sumarCantidad("1", "-1")).toBe("0");
    expect(sumarCantidad("0.5", "-1")).toBe("0");
    expect(sumarCantidad("2.5", "0.5")).toBe("3");
  });

  it("un producto que no admite fracción va en unidades enteras", () => {
    expect(cantidadPermitida("2.5", "1", true)).toBe(true);
    expect(cantidadPermitida("2.5", "1", false)).toBe(false);
    expect(cantidadPermitida("0.5", "12", false)).toBe(true);
    expect(cantidadPermitida("3", "1", false)).toBe(true);
  });

  it("arranca con la presentación de venta por defecto, la unidad base o la primera", () => {
    expect(presentacionInicial([kg, cajon], "cajon")).toBe(cajon);
    expect(presentacionInicial([cajon, kg], null)).toBe(kg);
    expect(presentacionInicial([cajon], "otra")).toBe(cajon);
    expect(presentacionInicial([], null)).toBeNull();
  });

  it("ofrece cantidades rápidas según cómo se pide", () => {
    expect(cantidadesRapidas("KG", false)).toEqual(["1", "2", "3", "5"]);
    expect(cantidadesRapidas("KG", true)).toEqual(["1", "2", "5", "10", "20"]);
    expect(cantidadesRapidas("LITRO", true)).toEqual(["1", "2", "5", "10", "20"]);
    expect(cantidadesRapidas("UNIDAD", true)).toEqual(["1", "5", "10", "12", "24"]);
  });

  it("escribe la cantidad como se lee", () => {
    expect(textoCantidad("5", kg, "KG")).toBe("5 kg");
    expect(textoCantidad("2.5", kg, "KG")).toBe("2,5 kg");
    expect(textoCantidad("2", cajon, "KG")).toBe("2 × Cajón 18 kg");
    expect(textoCantidad("12", { nombre: "u", esUnidadBase: true }, "UNIDAD")).toBe("12 u");
  });

  it("busca sin tildes ni mayúsculas y con varias palabras", () => {
    expect(normalizarBusqueda("  Limón ")).toBe("limon");
    expect(coincideBusqueda("Limón", "limon")).toBe(true);
    expect(coincideBusqueda("Tomate redondo", "redondo tom")).toBe(true);
    expect(coincideBusqueda("Tomate redondo", "perita")).toBe(false);
    expect(coincideBusqueda("Papa", "")).toBe(true);
  });

  it("los productos ya agregados al pedido van primero, en el orden en que se agregaron", () => {
    const productos = [{ id: "banana" }, { id: "cebolla" }, { id: "lechuga" }, { id: "papa" }, { id: "tomate" }];
    const ids = (agregados: string[]) => agregadosPrimero(productos, agregados).map((p) => p.id);
    expect(ids([])).toEqual(["banana", "cebolla", "lechuga", "papa", "tomate"]);
    expect(ids(["papa"])).toEqual(["papa", "banana", "cebolla", "lechuga", "tomate"]);
    // El que se agrega después queda detrás de los ya agregados; los demás siguen como venían.
    expect(ids(["papa", "banana", "tomate"])).toEqual(["papa", "banana", "tomate", "cebolla", "lechuga"]);
    // Lo agregado que no está en esta parte de la lista (o no coincide con la búsqueda) no cuenta.
    expect(ids(["zapallo", "lechuga"])).toEqual(["lechuga", "banana", "cebolla", "papa", "tomate"]);
    expect(productos.map((p) => p.id)).toEqual(["banana", "cebolla", "lechuga", "papa", "tomate"]);
  });

  it("la búsqueda encuentra también en singular", () => {
    expect(coincideBusqueda("Papa", "papas")).toBe(true);
    expect(coincideBusqueda("Limón", "limones")).toBe(true);
    expect(coincideBusqueda("Tomate redondo", "tomates")).toBe(true);
    expect(coincideBusqueda("Ajo", "ajos")).toBe(true);
    expect(coincideBusqueda("Ajo", "ajies")).toBe(false);
    expect(coincideBusqueda("Ajo", "ajo")).toBe(true);
    expect(coincideBusqueda("Lechuga", "papas")).toBe(false);
  });

  it("junta las líneas repetidas", () => {
    const juntas = juntarLineas([
      { productoId: "p1", presentacionId: null, cantidad: "2", observaciones: "maduros" },
      { productoId: "p1", presentacionId: null, cantidad: "1.5", observaciones: null },
      { productoId: "p1", presentacionId: "cajon", cantidad: "1", observaciones: null },
      { productoId: "p1", presentacionId: "cajon", cantidad: "1", observaciones: "sin golpes" },
    ]);
    expect(juntas).toEqual([
      { productoId: "p1", presentacionId: null, cantidad: "3.5", observaciones: "maduros" },
      { productoId: "p1", presentacionId: "cajon", cantidad: "2", observaciones: "sin golpes" },
    ]);
  });

  it("al cambiar los productos sabe qué agregar, qué cambiar y qué sacar", () => {
    const actuales = [
      { itemId: "a", productoId: "tomate", presentacionId: null, cantidad: "10.000", observaciones: null },
      { itemId: "b", productoId: "papa", presentacionId: "bolsa", cantidad: "1", observaciones: null },
      { itemId: "c", productoId: "cebolla", presentacionId: null, cantidad: "5", observaciones: "chicas" },
      { itemId: "d", productoId: "lechuga", presentacionId: null, cantidad: "12", observaciones: null },
    ];
    const r = diferenciasDeLineas(actuales, [
      { productoId: "tomate", presentacionId: null, cantidad: "10", observaciones: null },
      { productoId: "papa", presentacionId: "bolsa", cantidad: "2", observaciones: null },
      { productoId: "cebolla", presentacionId: null, cantidad: "5", observaciones: null },
      { productoId: "banana", presentacionId: null, cantidad: "3", observaciones: null },
    ]);
    expect(r.agregar).toEqual([{ productoId: "banana", presentacionId: null, cantidad: "3", observaciones: null }]);
    expect(r.cambiar).toEqual([
      { itemId: "b", cantidad: "2", observaciones: null },
      { itemId: "c", cantidad: "5", observaciones: null },
    ]);
    expect(r.quitar).toEqual(["d"]);
  });
});

describe("mensajes para la persona", () => {
  it("saca los códigos de reglas y las referencias al plan", () => {
    expect(textoParaPersona("El pedido no tiene productos (RN-018).")).toBe("El pedido no tiene productos.");
    expect(textoParaPersona("Se bloquea (RN-063, RN-064): pedí permiso")).toBe("Se bloquea: pedí permiso");
    expect(textoParaPersona("Cambiá la fecha (04 §5.b.4) y listo")).toBe("Cambiá la fecha y listo");
    expect(textoParaPersona("Pagá (RN-096 y RN-097) ahora")).toBe("Pagá ahora");
    expect(textoParaPersona("Mirá abajo (ver la lista).")).toBe("Mirá abajo (ver la lista).");
  });
});
