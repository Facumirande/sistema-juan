import { describe, expect, it } from "vitest";

import { agruparAvisos, textoDeNovedades } from "@/dominio/colaboracion/avisos";
import { PALETA_AVATAR, asignarColores, colorDePersona, esColorDeAvatar, iniciales, nombreCorto } from "@/dominio/colaboracion/personas";
import { tiempoRelativo, tituloDeDia } from "@/dominio/colaboracion/tiempo";

const ZONA = "America/Argentina/Buenos_Aires";

describe("cómo se ve cada persona", () => {
  it("iniciales de nombre y apellido, o de un solo nombre", () => {
    expect(iniciales("María Pérez")).toBe("MP");
    expect(iniciales("Ana María López")).toBe("AL");
    expect(iniciales("juan")).toBe("J");
    expect(iniciales("¡Hola!")).toBe("H");
    expect(iniciales("   ")).toBe("?");
    expect(iniciales("...")).toBe("?");
  });

  it("el color elegido si es de la paleta; si no, uno fijo según el id", () => {
    expect(esColorDeAvatar("#1F5FBF")).toBe(true);
    expect(esColorDeAvatar("#000000")).toBe(false);
    expect(esColorDeAvatar(undefined)).toBe(false);
    expect(colorDePersona("u1", "#B3471D")).toBe("#b3471d");
    const fijo = colorDePersona("7c2a4f7e-1111-4222-8333-944455556666", "#123456");
    expect(PALETA_AVATAR.map((p) => p.color)).toContain(fijo);
    expect(colorDePersona("7c2a4f7e-1111-4222-8333-944455556666")).toBe(fijo);
  });

  it("los colores automáticos no se repiten ni pisan los elegidos", () => {
    const colores = asignarColores([{ id: "a" }, { id: "b", elegido: "#1f5fbf" }, { id: "c", elegido: "nada" }]);
    expect(colores.get("b")).toBe("#1f5fbf");
    expect(colores.get("a")).toBe("#b3471d");
    expect(colores.get("c")).toBe("#1d7a46");
    const todos = asignarColores([...PALETA_AVATAR.map((p, i) => ({ id: `x${i}`, elegido: p.color as string })), { id: "extra" }]);
    expect(PALETA_AVATAR.map((p) => p.color)).toContain(todos.get("extra"));
    const muchos = asignarColores(Array.from({ length: 10 }, (_, i) => ({ id: `p${i}` })));
    expect(muchos.get("p8")).toBe(muchos.get("p0"));
  });

  it("el nombre corto para las frases", () => {
    expect(nombreCorto("María Pérez")).toBe("María");
    expect(nombreCorto("")).toBe("");
  });
});

describe("cuándo pasó algo", () => {
  const ahora = new Date("2026-09-28T17:00:00Z"); // lunes 14:00 en Buenos Aires

  it("recién, hace unos minutos, hoy, ayer u otro día", () => {
    expect(tiempoRelativo(new Date("2026-09-28T16:59:30Z"), ahora, ZONA)).toBe("recién");
    expect(tiempoRelativo(new Date("2026-09-28T17:00:20Z"), ahora, ZONA)).toBe("recién");
    expect(tiempoRelativo(new Date("2026-09-28T16:55:00Z"), ahora, ZONA)).toBe("hace 5 min");
    expect(tiempoRelativo(new Date("2026-09-28T12:00:00Z"), ahora, ZONA)).toBe("hoy 09:00");
    expect(tiempoRelativo(new Date("2026-09-28T19:00:00Z"), ahora, ZONA)).toBe("hoy 16:00");
    expect(tiempoRelativo(new Date("2026-09-28T02:00:00Z"), ahora, ZONA)).toBe("ayer 23:00");
    expect(tiempoRelativo(new Date("2026-09-21T21:05:00Z"), ahora, ZONA)).toBe("lun 21/09 18:05");
  });

  it("el título de cada día de la actividad", () => {
    expect(tituloDeDia("2026-09-28", "2026-09-28")).toBe("Hoy");
    expect(tituloDeDia("2026-09-27", "2026-09-28")).toBe("Ayer");
    expect(tituloDeDia("2026-09-21", "2026-09-28")).toBe("Lunes 21/09");
  });
});

describe("avisos de la campanita", () => {
  const aviso = (accion: string, personaId: string, entidad: string | null, resumen: string, nuevo = true) => ({ clase: "ACTIVIDAD" as const, accion, personaId, entidad, resumen, nuevo });

  it("los tildes seguidos de la misma persona en la misma lista cuentan como un aviso", () => {
    const grupos = agruparAvisos([
      aviso("TILDAR", "maria", "LISTA_COMPRA:1", "tildó como comprado: Papa"),
      aviso("TILDAR", "maria", "LISTA_COMPRA:1", "tildó como comprado: Tomate", false),
      aviso("TILDAR", "maria", "LISTA_COMPRA:1", "volvió a dejar por comprar: Cebolla", false),
      aviso("CREAR", "maria", "PEDIDO:9", "cargó el pedido PED-000009 de Hospital"),
      aviso("TILDAR", "maria", "LISTA_COMPRA:1", "tildó como comprado: Banana"),
      aviso("TILDAR", "juan", "LISTA_COMPRA:1", "tildó como comprado: Lechuga"),
      // Pasar un pedido entero a Comprado es un aviso aparte: habla del pedido.
      aviso("TILDAR", "juan", "PEDIDO:9", "pasó a Comprado el pedido PED-000009"),
      aviso("TILDAR", "juan", null, "tildó algo que ya no está", false),
      // Un grupo es nuevo si alguno de sus tildes lo es, aunque el primero ya se haya visto.
      aviso("TILDAR", "ana", "LISTA_COMPRA:2", "tildó como comprado: Ajo", false),
      aviso("TILDAR", "ana", "LISTA_COMPRA:2", "tildó como comprado: Apio", true),
      { clase: "NOTA" as const, accion: "NOTA", personaId: "ana", entidad: "LISTA_COMPRA:2", resumen: "dejó una nota para todos", nuevo: true },
    ]);
    expect(grupos.map((g) => [g.personaId, g.veces, g.resumen, g.nuevo])).toEqual([
      ["maria", 3, "marcó 3 productos en la lista de compras", true],
      ["maria", 1, "cargó el pedido PED-000009 de Hospital", true],
      ["maria", 1, "tildó como comprado: Banana", true],
      ["juan", 1, "tildó como comprado: Lechuga", true],
      ["juan", 1, "pasó a Comprado el pedido PED-000009", true],
      ["juan", 1, "tildó algo que ya no está", false],
      ["ana", 2, "marcó 2 productos en la lista de compras", true],
      ["ana", 1, "dejó una nota para todos", true],
    ]);
  });

  it("el cartelito dice qué pasó, o cuántas cosas si son varias", () => {
    expect(textoDeNovedades([])).toBeNull();
    expect(textoDeNovedades([{ persona: "María Pérez", resumen: "cargó el pedido PED-000009 de Hospital" }])).toBe("María cargó el pedido PED-000009 de Hospital");
    expect(textoDeNovedades([{ persona: "María Pérez", resumen: "a" }, { persona: "María Pérez", resumen: "b" }])).toBe("María hizo 2 cosas nuevas");
    expect(textoDeNovedades([{ persona: "María Pérez", resumen: "a" }, { persona: "Juan", resumen: "b" }, { persona: "María Pérez", resumen: "c" }])).toBe("María y Juan hicieron 3 cosas nuevas");
  });
});
