import { describe, expect, it } from "vitest";

import { ErrorDeNegocio, esErrorDeNegocio } from "@/dominio/errores";
import { formatearFecha, formatearFechaHora, hoyEnEmpresa, sumarDias } from "@/dominio/fechas/fechas";
import { formatearNumeroConVersion, formatearNumeroDocumento } from "@/dominio/numeracion/numeracion";
import { aUnidadBase, costoPorUnidadBase, presentacionesNecesarias } from "@/dominio/unidades/unidades";

function codigoDeError(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return esErrorDeNegocio(e) ? e.codigo : "OTRO";
  }
  return undefined;
}

describe("fechas en la zona de la empresa (01 §18)", () => {
  it("a las 02:30 UTC del 24/09 todavía es 23/09 en Buenos Aires y Montevideo", () => {
    const ahora = new Date("2026-09-24T02:30:00Z");
    expect(hoyEnEmpresa(ahora, "America/Argentina/Buenos_Aires")).toBe("2026-09-23");
    expect(hoyEnEmpresa(ahora, "America/Montevideo")).toBe("2026-09-23");
    expect(hoyEnEmpresa(ahora, "UTC")).toBe("2026-09-24");
  });

  it("formatea fechas y horas", () => {
    expect(formatearFecha("2026-09-24")).toBe("24/09/2026");
    expect(formatearFechaHora(new Date("2026-09-24T10:40:00Z"), "America/Argentina/Buenos_Aires")).toBe(
      "24/09/2026 07:40",
    );
    expect(codigoDeError(() => formatearFecha("24/09/2026"))).toBe("VALIDACION");
  });

  it("calcula vencimientos sumando días (RN-106)", () => {
    expect(sumarDias("2026-09-24", 7)).toBe("2026-10-01");
    expect(sumarDias("2026-02-27", 2)).toBe("2026-03-01");
    expect(sumarDias("2026-09-24", 0)).toBe("2026-09-24");
    expect(codigoDeError(() => sumarDias("2026-9-24", 1))).toBe("VALIDACION");
    expect(codigoDeError(() => sumarDias("2026-09-24", 1.5))).toBe("VALIDACION");
  });
});

describe("unidades (RN-008, RN-009, RN-046)", () => {
  it("convierte presentaciones a unidad base", () => {
    expect(aUnidadBase("3", "25").toString()).toBe("75");
    expect(aUnidadBase("2", "18").toString()).toBe("36");
    expect(aUnidadBase("36.4", "1").toString()).toBe("36.4");
    expect(aUnidadBase("2", "12", false).toString()).toBe("24");
  });

  it("exige unidades enteras si el producto no admite fracción", () => {
    expect(codigoDeError(() => aUnidadBase("2.5", "1", false))).toBe("VALIDACION");
  });

  it("rechaza factores no positivos (RN-002)", () => {
    expect(codigoDeError(() => aUnidadBase("1", "0"))).toBe("VALIDACION");
    expect(codigoDeError(() => costoPorUnidadBase("100", "-1"))).toBe("VALIDACION");
  });

  it("calcula el costo por unidad base (05 §3)", () => {
    expect(costoPorUnidadBase("16200", "18").toString()).toBe("900");
    expect(costoPorUnidadBase("13600", "20").toString()).toBe("680");
    expect(costoPorUnidadBase("12600", "18").toString()).toBe("700");
    expect(costoPorUnidadBase("7300", "10").toString()).toBe("730");
    expect(costoPorUnidadBase("1000", "3").toString()).toBe("333.3333");
  });

  it("redondea hacia arriba a presentaciones completas (04 §5.c.3)", () => {
    const tomate = presentacionesNecesarias("46", "18");
    expect([tomate.cantidad, tomate.aComprarBase, tomate.sobranteBase].map(String)).toEqual(["3", "54", "8"]);
    const lechuga = presentacionesNecesarias("98", "12");
    expect([lechuga.cantidad, lechuga.aComprarBase, lechuga.sobranteBase].map(String)).toEqual(["9", "108", "10"]);
    const papa = presentacionesNecesarias("265", "25");
    expect([papa.cantidad, papa.aComprarBase, papa.sobranteBase].map(String)).toEqual(["11", "275", "10"]);
    const exacto = presentacionesNecesarias("270", "18");
    expect([exacto.cantidad, exacto.sobranteBase].map(String)).toEqual(["15", "0"]);
    const nada = presentacionesNecesarias("-5", "18");
    expect([nada.cantidad, nada.aComprarBase, nada.sobranteBase].map(String)).toEqual(["0", "0", "0"]);
  });
});

describe("numeración de documentos (RN-149)", () => {
  it("arma el número visible", () => {
    expect(formatearNumeroDocumento("PED-", 101)).toBe("PED-000101");
    expect(formatearNumeroDocumento("COM-", 201n)).toBe("COM-000201");
    expect(formatearNumeroDocumento("FAC-", 1234567, 6)).toBe("FAC-1234567");
    expect(formatearNumeroConVersion("ENT-000301", 2)).toBe("ENT-000301 v2");
  });

  it("rechaza números y versiones inválidos", () => {
    expect(codigoDeError(() => formatearNumeroDocumento("PED-", 0))).toBe("VALIDACION");
    expect(codigoDeError(() => formatearNumeroConVersion("ENT-000301", 0))).toBe("VALIDACION");
  });

  it("el error de negocio conserva código y detalle", () => {
    const error = new ErrorDeNegocio("SIN_PERMISO", "No tenés permiso.", { permiso: "compras.anular" });
    expect(error.codigo).toBe("SIN_PERMISO");
    expect(error.detalle).toEqual({ permiso: "compras.anular" });
    expect(esErrorDeNegocio(error, "SIN_PERMISO")).toBe(true);
    expect(esErrorDeNegocio(error, "VALIDACION")).toBe(false);
    expect(esErrorDeNegocio(new Error("x"))).toBe(false);
  });
});
