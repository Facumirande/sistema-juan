import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ASPECTOS_DE_TARJETAS,
  CLAVE_TARJETAS,
  CLAVE_TEMA,
  TEMAS,
  colorDeBarraDeEstado,
  interpretarTarjetas,
  interpretarTema,
  temaContrario,
  temaEfectivo,
  type Tema,
} from "@/dominio/aspecto/aspecto";
import { GUION_DE_ASPECTO } from "@/ui/aspecto-inicial";

// El aspecto de cada aparato: modo claro u oscuro y tarjetas en colores o neutras (11/10/2026).

describe("modo claro u oscuro", () => {
  it("lo guardado que no se entiende es «como el aparato»", () => {
    expect(TEMAS).toEqual(["sistema", "claro", "oscuro"]);
    expect(interpretarTema("claro")).toBe("claro");
    expect(interpretarTema("oscuro")).toBe("oscuro");
    for (const raro of [null, undefined, "", "sistema", "dark", "OSCURO"]) expect(interpretarTema(raro)).toBe("sistema");
  });

  it("se ve el elegido; sin elegir, el del aparato", () => {
    expect(temaEfectivo("claro", true)).toBe("claro");
    expect(temaEfectivo("oscuro", false)).toBe("oscuro");
    expect(temaEfectivo("sistema", true)).toBe("oscuro");
    expect(temaEfectivo("sistema", false)).toBe("claro");
  });

  it("el interruptor pasa al otro modo", () => {
    expect(temaContrario("claro")).toBe("oscuro");
    expect(temaContrario("oscuro")).toBe("claro");
  });
});

describe("tarjetas en colores o neutras", () => {
  it("en colores mientras no se elija otra cosa", () => {
    expect(ASPECTOS_DE_TARJETAS).toEqual(["color", "neutro"]);
    expect(interpretarTarjetas("neutro")).toBe("neutro");
    for (const otro of [null, undefined, "", "color", "gris"]) expect(interpretarTarjetas(otro)).toBe("color");
  });
});

describe("el color de la barra del teléfono", () => {
  const estilos = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
  /** Los estilos del modo claro (lo primero del archivo) y los del oscuro (el bloque de `data-tema="oscuro"`). */
  const delModo = (tema: Tema) => {
    const desde = estilos.indexOf(':root[data-tema="oscuro"]');
    return tema === "oscuro" ? estilos.slice(desde) : estilos.slice(0, desde);
  };
  const variable = (tema: Tema, nombre: string) => new RegExp(`--${nombre}:\\s*([^;]+);`).exec(delModo(tema))![1]!;
  const aHex = (canales: number[]) => "#" + canales.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("");
  const deHex = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));

  it("fuera del tablero es el fondo del sistema", () => {
    for (const tema of ["claro", "oscuro"] as const) expect(colorDeBarraDeEstado(tema, false)).toBe(variable(tema, "fondo"));
  });

  it("en el tablero es el cielo de la imagen de fondo con su velo", () => {
    const imagen = readFileSync(join(process.cwd(), "public/fondos/campo.svg"), "utf8");
    // Lo de más arriba de la imagen: el primer color del cielo.
    const cielo = deHex(/<linearGradient id="cielo"[^>]*>\s*<stop offset="0" stop-color="(#[0-9a-f]{6})"/.exec(imagen)![1]!);
    for (const tema of ["claro", "oscuro"] as const) {
      // El velo, arriba: el primer color del degradé de `--tablero-fondo`.
      const velo = /linear-gradient\(rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)/.exec(variable(tema, "tablero-fondo"))!;
      const opacidad = Number(velo[4]);
      const mezcla = cielo.map((c, i) => c * (1 - opacidad) + Number(velo[i + 1]) * opacidad);
      expect(colorDeBarraDeEstado(tema, true)).toBe(aHex(mezcla));
      // Y es el color de base de la página con el tablero a la vista (lo que pintan los iPhone nuevos en esa zona).
      expect(variable(tema, "tablero-arriba")).toBe(aHex(mezcla));
    }
  });
});

describe("el guion que corre antes de dibujar la página", () => {
  /** Corre el guion en una página de mentira y devuelve lo que dejó puesto en <html>. */
  function correr(guardado: Record<string, string>, aparatoEnOscuro: boolean, sinAlmacen = false) {
    const puesto: Record<string, string> = {};
    const documento = { documentElement: { setAttribute: (nombre: string, valor: string) => void (puesto[nombre] = valor) } };
    const almacen = {
      getItem: (clave: string) => {
        if (sinAlmacen) throw new Error("sin permiso");
        return guardado[clave] ?? null;
      },
    };
    const consulta = (cual: string) => ({ matches: cual === "(prefers-color-scheme: dark)" && aparatoEnOscuro });
    new Function("document", "localStorage", "matchMedia", GUION_DE_ASPECTO)(documento, almacen, consulta);
    return puesto;
  }

  it("pone el mismo modo que `temaEfectivo`, para lo guardado y para cada aparato", () => {
    for (const guardado of ["claro", "oscuro", "sistema", "otra cosa", null]) {
      for (const aparatoEnOscuro of [true, false]) {
        const puesto = correr(guardado === null ? {} : { [CLAVE_TEMA]: guardado }, aparatoEnOscuro);
        expect(puesto["data-tema"]).toBe(temaEfectivo(interpretarTema(guardado), aparatoEnOscuro));
      }
    }
  });

  it("marca las tarjetas neutras solo si se eligieron", () => {
    expect(correr({ [CLAVE_TARJETAS]: "neutro" }, false)["data-tarjetas"]).toBe("neutro");
    expect(correr({ [CLAVE_TARJETAS]: "color" }, false)["data-tarjetas"]).toBeUndefined();
    expect(correr({}, false)["data-tarjetas"]).toBeUndefined();
  });

  it("si el navegador no deja leer lo guardado, sigue al aparato", () => {
    expect(correr({ [CLAVE_TEMA]: "claro" }, true, true)).toEqual({ "data-tema": "oscuro" });
    expect(correr({}, false, true)).toEqual({ "data-tema": "claro" });
  });
});
