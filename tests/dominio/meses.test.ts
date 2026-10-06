import { describe, expect, it } from "vitest";

import { MESES_QUE_SE_GUARDAN, esMes, mesDe, mesesParaListar, nombreDeMes, primerMesGuardado, rangoDeMes, sumarMeses } from "@/dominio/reportes/meses";

describe("los meses del balance que se bajan en Excel", () => {
  it("reconoce un mes bien escrito y le pone nombre", () => {
    expect(["2026-10", "2026-01", "2026-13", "2026-00", "2026-1", "octubre"].map(esMes)).toEqual([true, true, false, false, false, false]);
    expect(mesDe("2026-10-07")).toBe("2026-10");
    expect(nombreDeMes("2026-10")).toBe("octubre de 2026");
    expect(nombreDeMes("2027-01")).toBe("enero de 2027");
  });

  it("suma y resta meses pasando de año", () => {
    expect(sumarMeses("2026-10", 1)).toBe("2026-11");
    expect(sumarMeses("2026-12", 1)).toBe("2027-01");
    expect(sumarMeses("2026-01", -2)).toBe("2025-11");
    expect(sumarMeses("2026-10", -23)).toBe("2024-11");
  });

  it("se guardan dos años: el mes más viejo que se ofrece", () => {
    expect(MESES_QUE_SE_GUARDAN).toBe(24);
    expect(primerMesGuardado("2026-10-07")).toBe("2024-11");
    expect(primerMesGuardado("2026-10-07", 3)).toBe("2026-08");
  });

  it("las fechas de un mes: completo si ya terminó, hasta hoy si está en curso", () => {
    expect(rangoDeMes("2026-09", "2026-10-07")).toEqual({ mes: "2026-09", desde: "2026-09-01", hasta: "2026-09-30", enCurso: false });
    expect(rangoDeMes("2026-10", "2026-10-07")).toEqual({ mes: "2026-10", desde: "2026-10-01", hasta: "2026-10-07", enCurso: true });
    // Febrero de un año bisiesto y de uno que no lo es.
    expect(rangoDeMes("2028-02", "2028-06-01")!.hasta).toBe("2028-02-29");
    expect(rangoDeMes("2026-02", "2026-06-01")!.hasta).toBe("2026-02-28");
  });

  it("un mes que todavía no llegó, uno mal escrito o uno más viejo que lo que se guarda no se ofrece", () => {
    expect(rangoDeMes("2026-11", "2026-10-07")).toBeNull();
    expect(rangoDeMes("2026-1", "2026-10-07")).toBeNull();
    expect(rangoDeMes("2024-10", "2026-10-07")).toBeNull();
    expect(rangoDeMes("2024-11", "2026-10-07")).not.toBeNull();
  });

  it("la lista va del mes en curso al primero que tuvo movimientos, y los más viejos salen solos", () => {
    const desdeAgosto = mesesParaListar("2026-10-07", (m) => m === "2026-08");
    // Septiembre no tuvo movimientos pero está entre medio: se lista igual.
    expect(desdeAgosto.map((m) => m.mes)).toEqual(["2026-10", "2026-09", "2026-08"]);
    expect(desdeAgosto[0]!.enCurso).toBe(true);
    expect(mesesParaListar("2026-10-07", () => false)).toEqual([]);
    // Con movimientos desde siempre, quedan solo los que se guardan.
    const todos = mesesParaListar("2026-10-07", () => true);
    expect(todos).toHaveLength(24);
    expect(todos.at(-1)!.mes).toBe("2024-11");
    expect(mesesParaListar("2026-10-07", () => true, 3).map((m) => m.mes)).toEqual(["2026-10", "2026-09", "2026-08"]);
  });
});
