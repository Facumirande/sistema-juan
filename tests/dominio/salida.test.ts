import { describe, expect, it } from "vitest";

import { enumerar, planDeSalida } from "@/dominio/entregas/salida";

// "🚚 Sale ahora" (RN-153): qué repartos salen con las entregas elegidas.

const e = (id: string, repartoPlanificado: string | null = null, yaSalio = false) => ({ id, repartoPlanificado, yaSalio });

describe("plan de salida", () => {
  it("las sueltas salen juntas en un reparto nuevo", () => {
    expect(planDeSalida([e("a"), e("b")])).toEqual({ repartos: [], agregar: null, nuevo: ["a", "b"], yaSalieron: [] });
  });

  it("las que están en un reparto armado salen con ese reparto; las sueltas se suman a él", () => {
    expect(planDeSalida([e("a", "R1"), e("b"), e("c", "R1")])).toEqual({ repartos: ["R1"], agregar: { repartoId: "R1", entregaIds: ["b"] }, nuevo: [], yaSalieron: [] });
    expect(planDeSalida([e("a", "R1")])).toEqual({ repartos: ["R1"], agregar: null, nuevo: [], yaSalieron: [] });
  });

  it("con dos repartos armados, salen los dos y las sueltas van en uno nuevo", () => {
    expect(planDeSalida([e("a", "R1"), e("b", "R2"), e("c")])).toEqual({ repartos: ["R1", "R2"], agregar: null, nuevo: ["c"], yaSalieron: [] });
  });

  it("lo que ya salió no se toca", () => {
    expect(planDeSalida([e("a", null, true), e("b", "R1", true)])).toEqual({ repartos: [], agregar: null, nuevo: [], yaSalieron: ["a", "b"] });
  });

  it("los clientes dichos en palabras", () => {
    expect(enumerar([])).toBe("");
    expect(enumerar(["Ana"])).toBe("Ana");
    expect(enumerar(["Ana", "Beto"])).toBe("Ana y Beto");
    expect(enumerar(["Ana", "Beto", "Caro"])).toBe("Ana, Beto y Caro");
  });
});
