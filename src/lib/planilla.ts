import { strToU8, zipSync, type Zippable } from "fflate";

// Planillas para el contador (04 §5.g.3): un .xlsx con una hoja por tema, o los mismos datos en
// CSV dentro de un .zip. El archivo depende solo de los datos (fecha fija en el zip, sin fechas
// de creación): exportar dos veces lo mismo da archivos iguales.

/** Texto, número (se guarda como número en la planilla) o vacío. */
export type Celda = string | { numero: string } | null;

export interface Hoja {
  nombre: string;
  columnas: string[];
  filas: Celda[][];
}

const FECHA_FIJA = new Date("2000-01-01T00:00:00Z");

const xml = (texto: string) => texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function columna(i: number): string {
  let n = i + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function celdaXml(valor: Celda, ref: string, estilo: number): string {
  if (valor === null || valor === "") return "";
  if (typeof valor === "object") return `<c r="${ref}"${estilo ? ` s="${estilo}"` : ""}><v>${Number(valor.numero)}</v></c>`;
  return `<c r="${ref}" t="inlineStr"${estilo ? ` s="${estilo}"` : ""}><is><t xml:space="preserve">${xml(valor)}</t></is></c>`;
}

function hojaXml(h: Hoja): string {
  const filas = [h.columnas, ...h.filas].map(
    (fila, i) => `<row r="${i + 1}">${fila.map((v, j) => celdaXml(v, `${columna(j)}${i + 1}`, i === 0 ? 1 : typeof v === "object" && v !== null ? 2 : 0)).join("")}</row>`,
  );
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>${filas.join("")}</sheetData></worksheet>`;
}

/** Nombre de hoja válido para Excel (hasta 31 caracteres, sin \ / ? * [ ] :). */
const nombreHoja = (n: string) => n.replace(/[\\/?*[\]:]/g, " ").slice(0, 31);

export function planillaXlsx(hojas: readonly Hoja[]): Uint8Array {
  const archivos: Zippable = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${hojas
        .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
        .join("")}</Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${hojas
        .map((h, i) => `<sheet name="${xml(nombreHoja(h.nombre))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join("")}</sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hojas
        .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
        .join("")}<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ),
    // Estilos: 0 normal, 1 encabezado en negrita, 2 número con separador de miles y 2 decimales.
    "xl/styles.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`,
    ),
  };
  hojas.forEach((h, i) => {
    archivos[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(hojaXml(h));
  });
  return zipSync(archivos, { level: 6, mtime: FECHA_FIJA });
}

/** CSV para Excel en castellano: separador ";", coma decimal y BOM para que tome los acentos. */
export function hojaCsv(h: Hoja): string {
  const campo = (v: Celda) => {
    if (v === null) return "";
    const texto = typeof v === "object" ? v.numero.replace(".", ",") : v;
    return /[;"\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };
  return `﻿${[h.columnas, ...h.filas].map((f) => f.map(campo).join(";")).join("\r\n")}\r\n`;
}

export function planillasCsvZip(hojas: readonly Hoja[]): Uint8Array {
  const archivos: Zippable = {};
  for (const h of hojas) archivos[`${nombreHoja(h.nombre)}.csv`] = strToU8(hojaCsv(h));
  return zipSync(archivos, { level: 6, mtime: FECHA_FIJA });
}
