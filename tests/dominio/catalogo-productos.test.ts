import { describe, expect, it } from "vitest";

import { codigoSugerido, dibujoDeProducto, ejemploDeCostos, envasesSugeridos, explicarPresentacion, nombreDePresentacion } from "@/dominio/catalogo/productos";

describe("ayudas para cargar productos", () => {
  it("un dibujo según el nombre, o según el grupo", () => {
    expect(dibujoDeProducto("Tomate redondo")).toBe("🍅");
    expect(dibujoDeProducto("Papaya")).toBe("🥭");
    expect(dibujoDeProducto("Papa negra")).toBe("🥔");
    expect(dibujoDeProducto("Ají picante")).toBe("🌶️");
    expect(dibujoDeProducto("Remolacha", "VERDURA")).toBe("🥦");
    expect(dibujoDeProducto("Níspero", "FRUTA")).toBe("🍎");
    expect(dibujoDeProducto("Bolsas de nylon", "OTRO")).toBe("📦");
    expect(dibujoDeProducto("Carbón")).toBe("📦");
  });

  it("un código que se arma solo y no se repite", () => {
    expect(codigoSugerido("Tomate redondo", new Set())).toBe("TOMA-R");
    expect(codigoSugerido("Tomate redondo", new Set(["toma-r", "TOMA-R2"]))).toBe("TOMA-R3");
    expect(codigoSugerido("Papa", new Set())).toBe("PAPA");
    expect(codigoSugerido("Huevo de campo", new Set())).toBe("HUEV-C");
    expect(codigoSugerido("¡!", new Set())).toBe("PROD");
  });

  it("envases habituales según en qué se cuenta", () => {
    expect(envasesSugeridos("KG")[0]).toEqual({ envase: "Cajón", cantidad: "18" });
    for (const u of ["UNIDAD", "ATADO", "MAPLE", "BANDEJA", "DOCENA", "PAQUETE", "LITRO"]) expect(envasesSugeridos(u).length).toBeGreaterThan(0);
    expect(envasesSugeridos("OTRA")).toEqual([]);
  });

  it("el nombre de la presentación y su explicación", () => {
    expect(nombreDePresentacion("Cajón", "18", "kg")).toBe("Cajón 18 kg");
    expect(nombreDePresentacion("Bolsa", "2,5", "kg")).toBe("Bolsa 2,5 kg");
    expect(nombreDePresentacion("Bolsa 25 kg", "25", "kg")).toBe("Bolsa 25 kg");
    expect(nombreDePresentacion("  ", "18", "kg")).toBe("");
    expect(nombreDePresentacion("Cajón", "", "kg")).toBe("Cajón");
    expect(nombreDePresentacion("Cajón", "0", "kg")).toBe("Cajón");
    expect(explicarPresentacion("Cajón 18 kg", "18", "kg")).toBe("1 cajón 18 kg = 18 kg");
    expect(explicarPresentacion("Cajón", "x", "kg")).toBeNull();
    expect(explicarPresentacion("Cajón", "0", "kg")).toBeNull();
    expect(explicarPresentacion(" ", "18", "kg")).toBeNull();
  });

  it("el ejemplo de costos: cuánto sale cada unidad y a cuánto se vende", () => {
    expect(ejemploDeCostos({ precioEnvase: "18.000", cantidad: "18", recargoPct: "30" })).toEqual({ costoUnidad: "1000", ventaUnidad: "1300" });
    expect(ejemploDeCostos({ precioEnvase: "9600", cantidad: "12", recargoPct: "" })).toEqual({ costoUnidad: "800", ventaUnidad: "800" });
    expect(ejemploDeCostos({ precioEnvase: "10.000", cantidad: "18", recargoPct: "30" })).toEqual({ costoUnidad: "556", ventaUnidad: "722" });
    expect(ejemploDeCostos({ precioEnvase: "", cantidad: "18", recargoPct: "30" })).toBeNull();
    expect(ejemploDeCostos({ precioEnvase: "100", cantidad: "0", recargoPct: "30" })).toBeNull();
    expect(ejemploDeCostos({ precioEnvase: "100", cantidad: "x", recargoPct: "30" })).toBeNull();
    expect(ejemploDeCostos({ precioEnvase: "-5", cantidad: "2", recargoPct: "30" })).toBeNull();
  });
});
