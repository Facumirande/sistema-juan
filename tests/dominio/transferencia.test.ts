import { describe, expect, it } from "vitest";

import { aliasValido, cbuParaLeer, cbuValido, normalizarAlias, normalizarCbu } from "@/dominio/proveedores/transferencia";

describe("datos para transferirle a un proveedor", () => {
  it("un CBU válido pasa aunque venga con espacios o guiones", () => {
    expect(cbuValido("2850590940090418135201")).toBe(true);
    expect(cbuValido("2850590 9 4009041813520 1")).toBe(true);
    expect(cbuValido("28505909-40090418135201")).toBe(true);
    expect(normalizarCbu("2850 5909.4009-0418135201")).toBe("2850590940090418135201");
  });

  it("un dígito cambiado o un largo distinto no pasa", () => {
    expect(cbuValido("2850590840090418135201")).toBe(false); // primer verificador
    expect(cbuValido("2850590940090418135202")).toBe(false); // segundo verificador
    expect(cbuValido("2850590940090418135")).toBe(false);
    expect(cbuValido("28505909400904181352011")).toBe(false);
    expect(cbuValido("28505909a0090418135201")).toBe(false);
  });

  it("el alias: de 6 a 20 caracteres con letras, números, puntos y guiones", () => {
    expect(aliasValido("CAJON.TOMATE.MERCADO")).toBe(true);
    expect(aliasValido("  garcia-hnos  ")).toBe(true);
    expect(normalizarAlias(" GARCIA.HNOS ")).toBe("garcia.hnos");
    expect(aliasValido("corto")).toBe(false);
    expect(aliasValido("un.alias.demasiado.largo")).toBe(false);
    expect(aliasValido("con espacio")).toBe(false);
    expect(aliasValido("peña.mercado")).toBe(false);
  });

  it("el CBU se muestra en grupos para leerlo", () => {
    expect(cbuParaLeer("2850590940090418135201")).toBe("2850590 9 4009041813520 1");
    expect(cbuParaLeer("123")).toBe("123");
  });
});
