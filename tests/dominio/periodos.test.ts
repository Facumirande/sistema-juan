import { describe, expect, it } from "vitest";

import { agrupacionSugerida, agruparPorPeriodo, etiquetaDePeriodo, inicioDePeriodo, periodosEntre, saldoAlFinalDeCadaPeriodo } from "@/dominio/reportes/periodos";

describe("períodos del balance", () => {
  it("sugiere día hasta un mes, semana hasta tres meses y mes para más", () => {
    expect(agrupacionSugerida("2026-09-01", "2026-09-30")).toBe("DIA");
    expect(agrupacionSugerida("2026-07-01", "2026-09-28")).toBe("SEMANA");
    expect(agrupacionSugerida("2026-01-01", "2026-09-28")).toBe("MES");
  });

  it("la semana empieza el lunes y el mes el día 1", () => {
    expect(inicioDePeriodo("2026-09-28", "SEMANA")).toBe("2026-09-28"); // lunes
    expect(inicioDePeriodo("2026-09-27", "SEMANA")).toBe("2026-09-21"); // domingo
    expect(inicioDePeriodo("2026-09-24", "MES")).toBe("2026-09-01");
    expect(inicioDePeriodo("2026-09-24", "DIA")).toBe("2026-09-24");
  });

  it("lista cada período del rango, también al pasar de año", () => {
    expect(periodosEntre("2026-11-15", "2027-02-03", "MES")).toEqual(["2026-11-01", "2026-12-01", "2027-01-01", "2027-02-01"]);
    expect(periodosEntre("2026-09-24", "2026-10-06", "SEMANA")).toEqual(["2026-09-21", "2026-09-28", "2026-10-05"]);
    expect(periodosEntre("2026-09-27", "2026-09-29", "DIA")).toEqual(["2026-09-27", "2026-09-28", "2026-09-29"]);
  });

  it("etiquetas cortas", () => {
    expect(etiquetaDePeriodo("2026-09-28", "DIA")).toBe("28/09");
    expect(etiquetaDePeriodo("2026-09-21", "SEMANA")).toBe("sem. 21/09");
    expect(etiquetaDePeriodo("2026-12-01", "MES")).toBe("dic 2026");
  });

  it("suma por período con ceros donde no hubo movimientos e ignora lo de afuera del rango", () => {
    const series = agruparPorPeriodo(
      [
        { fecha: "2026-09-24", valores: { vendido: "806370", comprado: "653050" } },
        { fecha: "2026-09-24", valores: { vendido: "100.50" } },
        { fecha: "2026-09-26", valores: { comprado: "1000" } },
        { fecha: "2026-10-01", valores: { vendido: "5" } },
      ],
      ["vendido", "comprado"],
      "2026-09-24",
      "2026-09-26",
      "DIA",
    );
    expect(series.map((s) => [s.periodo, s.valores.vendido, s.valores.comprado])).toEqual([
      ["2026-09-24", "806470.50", "653050.00"],
      ["2026-09-25", "0.00", "0.00"],
      ["2026-09-26", "0.00", "1000.00"],
    ]);
  });

  it("el saldo al final de cada período arrastra el anterior", () => {
    const saldo = saldoAlFinalDeCadaPeriodo(
      "265000",
      [
        { fecha: "2026-09-24", importe: "653050" },
        { fecha: "2026-09-24", importe: "-237500" },
        { fecha: "2026-09-26", importe: "-100000" },
      ],
      "2026-09-24",
      "2026-09-26",
      "DIA",
    );
    expect(saldo.map((s) => s.valores.saldo)).toEqual(["680550.00", "680550.00", "580550.00"]);
  });
});
