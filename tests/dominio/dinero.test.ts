import { describe, expect, it } from "vitest";

import { aNumeric, dec, redondear2, redondear3, redondear4, sumar } from "@/dominio/dinero/decimal";
import {
  formatearCantidad,
  formatearMoneda,
  formatearNumero,
  formatearPorcentaje,
} from "@/dominio/dinero/formato";
import { esErrorDeNegocio } from "@/dominio/errores";

describe("decimal exacto", () => {
  it("no tiene errores de punto flotante", () => {
    expect(dec("0.1").plus("0.2").toString()).toBe("0.3");
  });

  it("rechaza números JavaScript con decimales, texto vacío y valores no finitos", () => {
    for (const valor of [0.1, "", "  ", "Infinity", "NaN"]) {
      let error: unknown;
      try {
        dec(valor);
      } catch (e) {
        error = e;
      }
      expect(esErrorDeNegocio(error, "VALIDACION")).toBe(true);
    }
  });

  it("acepta enteros, texto y Decimal", () => {
    expect(dec(16200).toString()).toBe("16200");
    expect(dec("1156.25").toString()).toBe("1156.25");
    expect(dec(dec("7")).toString()).toBe("7");
  });

  it("redondea mitad hacia arriba a 2, 3 y 4 decimales (RN-152)", () => {
    expect(redondear2("1216.665").toString()).toBe("1216.67");
    expect(redondear2("-0.005").toString()).toBe("-0.01");
    expect(redondear3("36.4005").toString()).toBe("36.401");
    expect(redondear4("1156.66665").toString()).toBe("1156.6667");
  });

  it("suma listas y devuelve texto para columnas numeric", () => {
    // Compras del 24/09 (04 §5.d.2)
    expect(sumar(["162000", "228550", "137500", "125000"]).toString()).toBe("653050");
    expect(sumar([]).toString()).toBe("0");
    expect(aNumeric("64800", 2)).toBe("64800.00");
    expect(aNumeric("1200", 4)).toBe("1200.0000");
  });
});

describe("formatos es-AR", () => {
  it("formatea números con miles y decimales", () => {
    expect(formatearNumero("1234567.891", { decimales: 2 })).toBe("1.234.567,89");
    expect(formatearNumero("999", { decimales: 0 })).toBe("999");
    expect(formatearNumero("-0.001", { decimales: 2 })).toBe("0,00");
  });

  it("formatea moneda, incluido el saldo a favor", () => {
    expect(formatearMoneda("114400")).toBe("$114.400,00");
    expect(formatearMoneda("-30000")).toBe("-$30.000,00");
    expect(formatearMoneda("1156.6667")).toBe("$1.156,67");
    expect(formatearMoneda("5", "U$S")).toBe("U$S5,00");
  });

  it("formatea porcentajes y cantidades sin ceros de más", () => {
    expect(formatearPorcentaje("65.7")).toBe("65,7 %");
    expect(formatearPorcentaje("21.6667", 2)).toBe("21,67 %");
    expect(formatearCantidad("36.400", "KG")).toBe("36,4 kg");
    expect(formatearCantidad("20", "UNIDAD")).toBe("20 u");
    expect(formatearCantidad("1250.5", "KG")).toBe("1.250,5 kg");
  });
});
