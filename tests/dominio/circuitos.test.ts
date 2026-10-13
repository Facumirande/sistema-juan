import { describe, expect, it } from "vitest";

import { circuitoElegido, leerCircuitos, MAXIMO_DE_CIRCUITOS, recorrerPorCircuito, revisarCircuitos, SIN_PUESTO, type CircuitoDeCompra } from "@/dominio/compras/circuitos";

// Circuitos de compra (pedido del usuario, 12/10/2026): el orden en que se recorren los puestos.

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const A = id(1);
const B = id(2);
const C = id(3);
const D = id(4);
const MERCOFRUT = id(100);
const CORTA = id(101);

describe("leer los circuitos guardados", () => {
  it("se queda con lo válido: sin nombre, con un id roto o repetido, no cuenta", () => {
    expect(
      leerCircuitos([
        { id: MERCOFRUT, nombre: "  Mercofrut de siempre ", paradas: [A, B, "no es un puesto", A, 7] },
        { id: "roto", nombre: "Otro", paradas: [A] },
        { id: CORTA, nombre: "   ", paradas: [A] },
        { id: MERCOFRUT, nombre: "Repetido", paradas: [C] },
        { id: CORTA, nombre: "Vuelta corta" },
        null,
        "texto",
      ]),
    ).toEqual([
      { id: MERCOFRUT, nombre: "Mercofrut de siempre", paradas: [A, B] },
      { id: CORTA, nombre: "Vuelta corta", paradas: [] },
    ]);
    expect(leerCircuitos(null)).toEqual([]);
    expect(leerCircuitos({ id: MERCOFRUT })).toEqual([]);
  });
});

describe("revisar los circuitos antes de guardarlos (RN-201)", () => {
  const puestos = new Set([A, B, C]);

  it("cada uno con su nombre y sus puestos; los que ya no existen se sacan solos", () => {
    expect(revisarCircuitos([{ id: MERCOFRUT, nombre: "  Mercofrut   de siempre ", paradas: [B, A, D, B] }], puestos)).toEqual({ circuitos: [{ id: MERCOFRUT, nombre: "Mercofrut de siempre", paradas: [B, A] }] });
    expect(revisarCircuitos([], puestos)).toEqual({ circuitos: [] });
  });

  it("dice qué hay que corregir", () => {
    const error = (propuestos: Parameters<typeof revisarCircuitos>[0]) => {
      const r = revisarCircuitos(propuestos, puestos);
      return "error" in r ? r.error : null;
    };
    expect(error([{ id: MERCOFRUT, nombre: " ", paradas: [A] }])).toMatch(/falta el nombre/);
    expect(error([{ id: MERCOFRUT, nombre: "x".repeat(41), paradas: [A] }])).toMatch(/muy largo/);
    expect(
      error([
        { id: MERCOFRUT, nombre: "Mercofrut", paradas: [A] },
        { id: CORTA, nombre: "mercofrut", paradas: [B] },
      ]),
    ).toMatch(/dos circuitos que se llaman/);
    // Sin puestos, o con puestos que ya no existen: no sirve de circuito.
    expect(error([{ id: MERCOFRUT, nombre: "Mercofrut", paradas: [] }])).toMatch(/faltan los puestos/);
    expect(error([{ id: MERCOFRUT, nombre: "Mercofrut", paradas: [D] }])).toMatch(/faltan los puestos/);
    expect(error([{ id: "roto", nombre: "Mercofrut", paradas: [A] }])).toMatch(/recargá/);
    expect(error(Array.from({ length: MAXIMO_DE_CIRCUITOS + 1 }, (_, i) => ({ id: id(200 + i), nombre: `Circuito ${i}`, paradas: [A] })))).toMatch(/hasta 8 circuitos/);
  });
});

describe("la lista de compras como se recorre el mercado (RN-201)", () => {
  const renglon = (producto: string, puestoId: string | null, puestoNombre: string | null = null, puestoUbicacion: string | null = null) => ({ producto, puestoId, puestoNombre, puestoUbicacion });
  const lista = [
    renglon("Papa", A, "Don José", "Nave 2, puesto 14"),
    renglon("Banana", C, "Frutas del Norte", "Nave 1, puesto 3"),
    renglon("Perejil", null),
    renglon("Cebolla", A, "Don José", "Nave 2, puesto 14"),
    renglon("Tomate", B, "La Huerta", null),
    renglon("Ajo", D, "Mayorista", "Nave 1, puesto 9"),
  ];
  const resumen = (paradas: ReturnType<typeof recorrerPorCircuito<(typeof lista)[number]>>) => paradas.map((p) => `${p.numero ?? "-"} ${p.titulo}: ${p.renglones.map((r) => r.producto).join(", ")}`);

  it("primero los puestos del circuito, en su orden y numerados; después los demás por dónde quedan; sin puesto al final", () => {
    const circuito: CircuitoDeCompra = { id: MERCOFRUT, nombre: "Mercofrut", paradas: [B, id(50), A] };
    expect(resumen(recorrerPorCircuito(lista, circuito))).toEqual([
      "1 La Huerta: Tomate",
      // El puesto del circuito que hoy no tiene nada no aparece, y la numeración sigue de corrido.
      "2 Don José: Papa, Cebolla",
      "- Frutas del Norte: Banana",
      "- Mayorista: Ajo",
      `- ${SIN_PUESTO}: Perejil`,
    ]);
    const paradas = recorrerPorCircuito(lista, circuito);
    expect(paradas[1]).toMatchObject({ clave: A, puestoId: A, detalle: "Nave 2, puesto 14", numero: 2 });
    expect(paradas.at(-1)).toMatchObject({ clave: "", puestoId: null, detalle: null, numero: null });
  });

  it("sin circuito, los puestos van por dónde quedan en el mercado (los que no lo dicen, después)", () => {
    expect(resumen(recorrerPorCircuito(lista, null))).toEqual(["- Frutas del Norte: Banana", "- Mayorista: Ajo", "- Don José: Papa, Cebolla", "- La Huerta: Tomate", `- ${SIN_PUESTO}: Perejil`]);
    expect(recorrerPorCircuito([], null)).toEqual([]);
  });

  it("el circuito que vale: el elegido en el aparato, el primero si nunca se eligió, o ninguno", () => {
    const circuitos: CircuitoDeCompra[] = [
      { id: MERCOFRUT, nombre: "Mercofrut", paradas: [A] },
      { id: CORTA, nombre: "Vuelta corta", paradas: [B] },
    ];
    expect(circuitoElegido(circuitos, CORTA)?.nombre).toBe("Vuelta corta");
    expect(circuitoElegido(circuitos, null)?.nombre).toBe("Mercofrut");
    // Se eligió uno que después se borró: vale el primero.
    expect(circuitoElegido(circuitos, id(999))?.nombre).toBe("Mercofrut");
    expect(circuitoElegido(circuitos, "")).toBeNull();
    expect(circuitoElegido([], null)).toBeNull();
  });
});
