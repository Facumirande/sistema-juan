import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { hojaCsv, leerCsv, leerXlsx, planillasCsvZip, planillaXlsx, type Hoja } from "@/lib/planilla";

const hojas_: Hoja[] = [
  { nombre: "Ventas", columnas: ["Fecha", "Cliente", "Total"], filas: [["24/09/2026", "Verdulería \"Don\" Pepe; & Cía", { numero: "222770.00" }], ["24/09/2026", null, { numero: "0.50" }]] },
  { nombre: "Compras / pagos [x]", columnas: ["A"], filas: [] },
];

describe("planillas para el contador (04 §5.g.3)", () => {
  it("el xlsx tiene una hoja por tema, números como números y texto escapado", () => {
    const archivos = unzipSync(planillaXlsx(hojas_));
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
    expect(planillaXlsx(hojas_)).toEqual(planillaXlsx(hojas_));
    expect(planillasCsvZip(hojas_)).toEqual(planillasCsvZip(hojas_));
  });

  it("CSV con punto y coma, coma decimal y comillas donde hace falta", () => {
    expect(hojaCsv(hojas_[0]!)).toBe('﻿Fecha;Cliente;Total\r\n24/09/2026;"Verdulería ""Don"" Pepe; & Cía";222770,00\r\n24/09/2026;;0,50\r\n');
    expect(Object.keys(unzipSync(planillasCsvZip(hojas_)))).toEqual(["Ventas.csv", "Compras   pagos  x .csv"]);
  });

  it("columnas después de la Z (AA, AB…)", () => {
    const ancha: Hoja = { nombre: "Ancha", columnas: Array.from({ length: 28 }, (_, i) => `C${i}`), filas: [] };
    expect(strFromU8(unzipSync(planillaXlsx([ancha]))["xl/worksheets/sheet1.xml"]!)).toContain('r="AB1"');
  });
});

describe("planilla modelo y lectura de planillas (RN-155)", () => {
  it("escribe listas para elegir, anchos y hojas ocultas", () => {
    const modelo: Hoja[] = [
      {
        nombre: "Productos",
        columnas: ["Producto", "Categoría"],
        filas: [],
        anchos: [30, 20],
        listas: [
          { columna: 1, filas: [2, 500], opciones: "Listas!$A$2:$A$9", estricta: false, ayuda: { titulo: "Categoría", texto: "Elegí una o Ninguna" } },
          { columna: 0, filas: [2, 10], opciones: ["Kilo", "Uni,dad", 'Co"sa'], estricta: true },
        ],
      },
      { nombre: "Listas", columnas: ["Categorías"], filas: [["Duras"], ["Ninguna"]], oculta: true },
    ];
    const archivos = unzipSync(planillaXlsx(modelo));
    const hoja = strFromU8(archivos["xl/worksheets/sheet1.xml"]!);
    expect(hoja).toContain('<cols><col min="1" max="1" width="30" customWidth="1"/>');
    expect(hoja).toContain('sqref="B2:B500"><formula1>Listas!$A$2:$A$9</formula1>');
    expect(hoja).toContain('errorStyle="information"');
    expect(hoja).toContain("<formula1>&quot;Kilo,Uni dad,Co sa&quot;</formula1>");
    // El orden de los elementos es el que exige Excel: vistas, columnas, datos y validaciones.
    expect(hoja.indexOf("<cols>")).toBeLessThan(hoja.indexOf("<sheetData>"));
    expect(hoja.indexOf("</sheetData>")).toBeLessThan(hoja.indexOf("<dataValidations"));
    expect(strFromU8(archivos["xl/workbook.xml"]!)).toContain('<sheet name="Listas" sheetId="2" state="hidden" r:id="rId2"/>');
  });

  it("lee lo que escribe: texto, números y celdas vacías", () => {
    const hojas = leerXlsx(planillaXlsx(hojas_));
    expect(hojas.map((h) => h.nombre)).toEqual(["Ventas", "Compras   pagos  x "]);
    expect(hojas[0]!.filas).toEqual([
      ["Fecha", "Cliente", "Total"],
      ["24/09/2026", 'Verdulería "Don" Pepe; & Cía', "222770"],
      ["24/09/2026", "", "0.5"],
    ]);
  });

  it("lee una planilla como la guarda Excel: textos compartidos, filas salteadas y caracteres especiales", () => {
    const archivos: Record<string, Uint8Array> = {
      "xl/workbook.xml": strToU8('<workbook><sheets><sheet name="Hoja 1" sheetId="1" r:id="rId1"/></sheets></workbook>'),
      "xl/_rels/workbook.xml.rels": strToU8('<Relationships><Relationship Id="rId1" Target="/xl/worksheets/sheet1.xml" Type="x"/></Relationships>'),
      "xl/sharedStrings.xml": strToU8('<sst><si><t>Producto</t></si><si><r><t>Tomate </t></r><r><t xml:space="preserve">perita</t></r><rPh><t>x</t></rPh></si><si><t>Ñandú &amp; cía_x000D_</t></si></sst>'),
      "xl/worksheets/sheet1.xml": strToU8(
        '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="3"><c r="A3" t="s"><v>1</v></c><c r="C3"><v>18.5</v></c><c r="D3" t="b"><v>1</v></c><c r="E3" t="e"><v>#N/A</v></c></row><row r="4"><c t="inlineStr"><is><t>Lechuga</t></is></c><c t="s"><v>2</v></c><c r="C4" t="str"><v>&#233;</v></c></row><row r="5"/></sheetData></worksheet>',
      ),
    };
    const [hoja] = leerXlsx(zipSync(archivos));
    expect(hoja!.filas).toEqual([["Producto"], [], ["Tomate perita", "", "18.5", "Sí", ""], ["Lechuga", "Ñandú & cía\r", "é"], []]);
  });

  it("si no es una planilla, lo dice", () => {
    expect(() => leerXlsx(strToU8("hola"))).toThrow(/no es una planilla/);
    expect(() => leerXlsx(zipSync({ "otra.txt": strToU8("x") }))).toThrow(/no es una planilla/);
  });

  it("lee un CSV con punto y coma, comas o tabulaciones, y comillas", () => {
    expect(leerCsv('﻿Producto;Categoría\r\nPapa;Duras\r\n"Tomate; perita";"Blan""das"\n').filas).toEqual([
      ["Producto", "Categoría"],
      ["Papa", "Duras"],
      ["Tomate; perita", 'Blan"das'],
    ]);
    expect(leerCsv("papa,kilo\nbatata,kilo").filas).toEqual([
      ["papa", "kilo"],
      ["batata", "kilo"],
    ]);
    expect(leerCsv("a\tb\n").filas).toEqual([["a", "b"]]);
  });
});
