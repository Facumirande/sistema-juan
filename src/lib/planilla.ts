import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";

// Planillas: para el contador (04 §5.g.3: un .xlsx con una hoja por tema, o los mismos datos en
// CSV dentro de un .zip) y la planilla modelo de productos con listas para elegir (RN-155). El
// archivo depende solo de los datos (fecha fija en el zip, sin fechas de creación): exportar dos
// veces lo mismo da archivos iguales. También se leen planillas (.xlsx o .csv) para cargar datos.

/** Texto, número (se guarda como número en la planilla) o vacío. */
export type Celda = string | { numero: string } | null;

/** Una lista desplegable para elegir (validación de datos de Excel) en una columna. */
export interface ListaParaElegir {
  /** Columna (0 = A). */
  columna: number;
  /** Desde y hasta qué fila (1 = la de los títulos). */
  filas: readonly [number, number];
  /** Las opciones escritas, o un rango de otra hoja ("Listas!$A$2:$A$20"). */
  opciones: readonly string[] | string;
  /** Si es false se puede escribir otra cosa (Excel solo avisa). */
  estricta: boolean;
  /** Ayuda que aparece al pararse en la celda. */
  ayuda?: { titulo: string; texto: string };
}

export interface Hoja {
  nombre: string;
  columnas: string[];
  filas: Celda[][];
  /** Ancho de cada columna (en caracteres). */
  anchos?: readonly number[];
  listas?: readonly ListaParaElegir[];
  /** Hoja oculta (ej. las listas de opciones). */
  oculta?: boolean;
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

function listaXml(l: ListaParaElegir): string {
  const rango = `${columna(l.columna)}${l.filas[0]}:${columna(l.columna)}${l.filas[1]}`;
  const formula = typeof l.opciones === "string" ? xml(l.opciones) : xml(`"${l.opciones.map((o) => o.replace(/[",]/g, " ")).join(",")}"`);
  const ayuda = l.ayuda ? ` showInputMessage="1" promptTitle="${xml(l.ayuda.titulo.slice(0, 32))}" prompt="${xml(l.ayuda.texto.slice(0, 255))}"` : "";
  const error = l.estricta
    ? ` showErrorMessage="1" errorTitle="Elegí de la lista" error="Elegí una opción de la lista (o Ninguna)."`
    : ` showErrorMessage="1" errorStyle="information" errorTitle="No está en la lista" error="No está en la lista: se va a usar igual lo que escribiste."`;
  return `<dataValidation type="list" allowBlank="1"${ayuda}${error} sqref="${rango}"><formula1>${formula}</formula1></dataValidation>`;
}

function hojaXml(h: Hoja): string {
  const filas = [h.columnas, ...h.filas].map(
    (fila, i) => `<row r="${i + 1}">${fila.map((v, j) => celdaXml(v, `${columna(j)}${i + 1}`, i === 0 ? 1 : typeof v === "object" && v !== null ? 2 : 0)).join("")}</row>`,
  );
  const anchos = h.anchos?.length ? `<cols>${h.anchos.map((a, i) => `<col min="${i + 1}" max="${i + 1}" width="${a}" customWidth="1"/>`).join("")}</cols>` : "";
  const listas = h.listas?.length ? `<dataValidations count="${h.listas.length}">${h.listas.map(listaXml).join("")}</dataValidations>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${anchos}<sheetData>${filas.join("")}</sheetData>${listas}</worksheet>`;
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
        .map((h, i) => `<sheet name="${xml(nombreHoja(h.nombre))}" sheetId="${i + 1}"${h.oculta ? ' state="hidden"' : ""} r:id="rId${i + 1}"/>`)
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
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
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

// ——— Lectura de planillas (.xlsx y .csv) ———

export interface HojaLeida {
  nombre: string;
  /** Las celdas como texto, fila por fila (las filas vacías quedan como listas vacías). */
  filas: string[][];
}

const ENTIDADES: Readonly<Record<string, string>> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** Texto de XML: entidades (&amp;, &#233;…) y los escapes de Excel (_x000D_). */
function textoXml(t: string): string {
  return t
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (todo, e: string) => {
      if (e.startsWith("#x") || e.startsWith("#X")) return String.fromCodePoint(parseInt(e.slice(2), 16));
      if (e.startsWith("#")) return String.fromCodePoint(Number(e.slice(1)));
      return ENTIDADES[e] ?? todo;
    })
    .replace(/_x([0-9a-f]{4})_/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
}

/** El texto de un elemento con partes (<t>…</t>), sin la fonética de Excel (<rPh>). */
function textoDe(xmlTexto: string): string {
  return [...xmlTexto.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "").matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => textoXml(m[1]!)).join("");
}

function atributos(etiqueta: string): Record<string, string> {
  return Object.fromEntries([...etiqueta.matchAll(/([\w:]+)="([^"]*)"/g)].map((m) => [m[1]!, textoXml(m[2]!)]));
}

/** "A" → 0, "AB" → 27. */
function indiceDeColumna(letras: string): number {
  return [...letras.toUpperCase()].reduce((n, l) => n * 26 + (l.charCodeAt(0) - 64), 0) - 1;
}

/**
 * Lee un .xlsx (Excel, LibreOffice o Google Sheets) y devuelve cada hoja con sus celdas como texto.
 * Los números quedan como los guarda la planilla ("18", "18.5"). Si el archivo no es una planilla,
 * lanza un error.
 */
export function leerXlsx(bytes: Uint8Array): HojaLeida[] {
  let archivos: Record<string, Uint8Array>;
  try {
    archivos = unzipSync(bytes);
  } catch {
    throw new Error("El archivo no es una planilla de Excel (.xlsx).");
  }
  const leer = (ruta: string) => {
    const a = archivos[ruta.replace(/^\//, "")];
    return a ? strFromU8(a) : null;
  };
  const libro = leer("xl/workbook.xml");
  if (!libro) throw new Error("El archivo no es una planilla de Excel (.xlsx).");
  const vinculos = new Map(
    [...(leer("xl/_rels/workbook.xml.rels") ?? "").matchAll(/<Relationship\b[^>]*>/g)].map((m) => {
      const a = atributos(m[0]);
      return [a.Id ?? "", a.Target ?? ""];
    }),
  );
  const compartidos = [...(leer("xl/sharedStrings.xml") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textoDe(m[1]!));

  return [...libro.matchAll(/<sheet\b[^>]*>/g)].map((m) => {
    const a = atributos(m[0]);
    const destino = vinculos.get(a["r:id"] ?? "") ?? "";
    const ruta = destino.startsWith("/") ? destino.slice(1) : `xl/${destino}`;
    const hoja = leer(ruta) ?? "";
    const filas: string[][] = [];
    let siguienteFila = 0;
    for (const fila of hoja.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const r = Number(atributos(fila[1] ?? "").r) || siguienteFila + 1;
      siguienteFila = r;
      const celdas: string[] = [];
      let siguienteColumna = 0;
      for (const c of (fila[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ac = atributos(c[1] ?? "");
        const col = ac.r ? indiceDeColumna(ac.r.replace(/\d+$/, "")) : siguienteColumna;
        siguienteColumna = col + 1;
        const interior = c[2] ?? "";
        const v = /<v>([\s\S]*?)<\/v>/.exec(interior)?.[1];
        let texto = "";
        if (ac.t === "s") texto = compartidos[Number(v)] ?? "";
        else if (ac.t === "inlineStr") texto = textoDe(interior);
        else if (ac.t === "b") texto = v === "1" ? "Sí" : "No";
        else if (ac.t !== "e" && v !== undefined) texto = textoXml(v);
        while (celdas.length < col) celdas.push("");
        celdas[col] = texto;
      }
      filas[r - 1] = celdas;
    }
    for (let i = 0; i < filas.length; i++) filas[i] ??= [];
    return { nombre: a.name ?? "", filas };
  });
}

/** Lee un .csv (con ";", "," o tabulaciones; con o sin comillas) como una sola hoja. */
export function leerCsv(texto: string): HojaLeida {
  const sinBom = texto.replace(/^\uFEFF/, "");
  const primera = sinBom.split(/\r?\n/, 1)[0] ?? "";
  const separador = [";", "\t", ","].map((s) => [s, primera.split(s).length] as const).sort((a, b) => b[1] - a[1])[0]![0];
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let comillas = false;
  for (let i = 0; i < sinBom.length; i++) {
    const ch = sinBom[i]!;
    if (comillas) {
      if (ch === '"' && sinBom[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (ch === '"') comillas = false;
      else campo += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === separador) {
      fila.push(campo);
      campo = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && sinBom[i + 1] === "\n") i++;
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = "";
    } else campo += ch;
  }
  if (campo || fila.length) {
    fila.push(campo);
    filas.push(fila);
  }
  return { nombre: "CSV", filas };
}
