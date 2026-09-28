import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { hojaCsv, planillasCsvZip, planillaXlsx, type Hoja } from "@/lib/planilla";

const hojas: Hoja[] = [
  { nombre: "Ventas", columnas: ["Fecha", "Cliente", "Total"], filas: [["24/09/2026", "Verdulería \"Don\" Pepe; & Cía", { numero: "222770.00" }], ["24/09/2026", null, { numero: "0.50" }]] },
  { nombre: "Compras / pagos [x]", columnas: ["A"], filas: [] },
];

describe("planillas para el contador (04 §5.g.3)", () => {
  it("el xlsx tiene una hoja por tema, números como números y texto escapado", () => {
    const archivos = unzipSync(planillaXlsx(hojas));
    expect(Object.keys(archivos)).toContain("xl/worksheets/sheet2.xml");
    const libro = strFromU8(archivos["xl/workbook.xml"]!);
    expect(libro).toContain('name="Ventas"');
    expect(libro).toContain('name="Compras   pagos  x "');
    const hoja = strFromU8(archivos["xl/worksheets/sheet1.xml"]!);
    expect(hoja).toContain('<c r="C2" s="2"><v>222770</v></c>');
    expect(hoja).toContain("Verdulería &quot;Don&quot; Pepe; &amp; Cía");
    expect(hoja).not.toContain('r="B3"');
  });

  it("exportar dos veces lo mismo da exactamente los mismos bytes", () => {
    expect(planillaXlsx(hojas)).toEqual(planillaXlsx(hojas));
    expect(planillasCsvZip(hojas)).toEqual(planillasCsvZip(hojas));
  });

  it("CSV con punto y coma, coma decimal y comillas donde hace falta", () => {
    expect(hojaCsv(hojas[0]!)).toBe('﻿Fecha;Cliente;Total\r\n24/09/2026;"Verdulería ""Don"" Pepe; & Cía";222770,00\r\n24/09/2026;;0,50\r\n');
    expect(Object.keys(unzipSync(planillasCsvZip(hojas)))).toEqual(["Ventas.csv", "Compras   pagos  x .csv"]);
  });

  it("columnas después de la Z (AA, AB…)", () => {
    const ancha: Hoja = { nombre: "Ancha", columnas: Array.from({ length: 28 }, (_, i) => `C${i}`), filas: [] };
    expect(strFromU8(unzipSync(planillaXlsx([ancha]))["xl/worksheets/sheet1.xml"]!)).toContain('r="AB1"');
  });
});
