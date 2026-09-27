import { describe, expect, it } from "vitest";

import { interpretarNumero } from "@/dominio/dinero/entrada";

describe("números escritos a la argentina", () => {
  it("interpreta miles con punto y decimales con coma", () => {
    const casos: [string, string][] = [
      ["17.550", "17550"],
      ["1.234.567", "1234567"],
      ["1.234,56", "1234.56"],
      ["17550,5", "17550.5"],
      ["$ 21.600", "21600"],
      ["2.5", "2.5"],
      ["0,75", "0.75"],
      ["18", "18"],
      ["-8", "-8"],
      ["12.5000", "12.5"],
    ];
    for (const [texto, esperado] of casos) expect(interpretarNumero(texto)?.toString(), texto).toBe(esperado);
  });

  it("devuelve null si no es un número", () => {
    for (const texto of ["", "  ", "abc", "1,2,3", "12a", "1..2"]) expect(interpretarNumero(texto), texto).toBeNull();
  });
});
