import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";

// Planillas de Excel: un .xlsx con una hoja por tema (y, si se piden, gráficos de barras y listas
// para elegir, como en la planilla modelo de productos, RN-155), o los mismos datos en CSV dentro
// de un .zip. El archivo depende solo de los datos (fecha fija en el zip, sin fechas de creación):
// exportar dos veces lo mismo da archivos iguales. También se leen planillas (.xlsx o .csv) para
// cargar datos.

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

/**
 * Gráfico de barras dentro de una hoja. Toma los datos de las columnas de una hoja del mismo
 * archivo (la fila 1 son los títulos: de ahí sale el nombre de cada serie) y ocupa todo el ancho
 * de una pantalla, uno debajo del otro.
 */
export interface GraficoDeHoja {
  titulo: string;
  /** Nombre de la hoja de donde salen los datos. */
  hoja: string;
  /** Columna (desde 0) con el nombre de cada barra: el día, el cliente… */
  etiquetas: number;
  /** Columnas (desde 0) con los valores de cada serie y su color (hexadecimal, sin #). */
  series: { columna: number; color: string }[];
}

export interface Hoja {
  nombre: string;
  columnas: string[];
  filas: Celda[][];
  /** Ancho de cada columna (en caracteres); si falta, se calcula con lo más largo de cada una. */
  anchos?: readonly number[];
  listas?: readonly ListaParaElegir[];
  /** Hoja oculta (ej. las listas de opciones). */
  oculta?: boolean;
  graficos?: GraficoDeHoja[];
}

const FECHA_FIJA = new Date("2000-01-01T00:00:00Z");
/** Tamaño de cada gráfico, en columnas y filas de la hoja: el ancho de una pantalla. */
const GRAFICO = { columnas: 22, filas: 24, separacion: 2 };

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

/** Ancho de cada columna según lo más largo que tiene, para que se lea sin estirarlas a mano. */
function anchosXml(h: Hoja): string {
  const largo = (v: Celda | undefined) => (v === null || v === undefined ? 0 : typeof v === "object" ? 14 : v.length);
  const anchos = h.anchos?.length ? h.anchos : h.columnas.map((titulo, j) => Math.min(60, Math.max(10, titulo.length + 2, ...h.filas.map((f) => largo(f[j]) + 2))));
  if (anchos.length === 0) return "";
  return `<cols>${anchos.map((a, j) => `<col min="${j + 1}" max="${j + 1}" width="${a}" customWidth="1"/>`).join("")}</cols>`;
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

function hojaXml(h: Hoja, conDibujo: boolean): string {
  const filas = [h.columnas, ...h.filas].map(
    (fila, i) => `<row r="${i + 1}">${fila.map((v, j) => celdaXml(v, `${columna(j)}${i + 1}`, i === 0 ? 1 : typeof v === "object" && v !== null ? 2 : 0)).join("")}</row>`,
  );
  const listas = h.listas?.length ? `<dataValidations count="${h.listas.length}">${h.listas.map(listaXml).join("")}</dataValidations>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${anchosXml(h)}<sheetData>${filas.join("")}</sheetData>${listas}${conDibujo ? `<drawing r:id="rId1"/>` : ""}</worksheet>`;
}

/** Nombre de hoja válido para Excel (hasta 31 caracteres, sin \ / ? * [ ] :). */
const nombreHoja = (n: string) => n.replace(/[\\/?*[\]:]/g, " ").slice(0, 31);

// ─── Gráficos ───────────────────────────────────────────────────────────────────────────────────

const ESPACIOS_GRAFICO = `xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"`;
const textoDeCelda = (v: Celda | undefined) => (v === null || v === undefined ? "" : typeof v === "object" ? v.numero : v);
const numeroDeCelda = (v: Celda | undefined) => (typeof v === "object" && v !== null ? Number(v.numero) : 0);

/** Un gráfico de barras verticales, con los valores guardados además de la referencia a la hoja. */
function graficoXml(g: GraficoDeHoja, datos: Hoja): string {
  const n = datos.filas.length;
  const hoja = `'${nombreHoja(datos.nombre).replace(/'/g, "''")}'`;
  const rango = (col: number) => `${hoja}!$${columna(col)}$2:$${columna(col)}$${n + 1}`;
  const puntos = (col: number, valor: (v: Celda | undefined) => string | number) => datos.filas.map((f, i) => `<c:pt idx="${i}"><c:v>${xml(String(valor(f[col])))}</c:v></c:pt>`).join("");
  const series = g.series
    .map(
      (s, i) =>
        `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:strRef><c:f>${hoja}!$${columna(s.columna)}$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${xml(datos.columnas[s.columna] ?? "")}</c:v></c:pt></c:strCache></c:strRef></c:tx><c:spPr><a:solidFill><a:srgbClr val="${s.color}"/></a:solidFill></c:spPr><c:invertIfNegative val="0"/><c:cat><c:strRef><c:f>${rango(g.etiquetas)}</c:f><c:strCache><c:ptCount val="${n}"/>${puntos(g.etiquetas, textoDeCelda)}</c:strCache></c:strRef></c:cat><c:val><c:numRef><c:f>${rango(s.columna)}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${n}"/>${puntos(s.columna, numeroDeCelda)}</c:numCache></c:numRef></c:val></c:ser>`,
    )
    .join("");
  const linea = (color: string) => `<c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:ln></c:spPr>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace ${ESPACIOS_GRAFICO}><c:roundedCorners val="0"/><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:p><a:pPr><a:defRPr sz="1400" b="1"/></a:pPr><a:r><a:rPr lang="es-AR" sz="1400" b="1"/><a:t>${xml(g.titulo)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/><c:plotArea><c:layout/><c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>${series}<c:gapWidth val="40"/><c:axId val="1001"/><c:axId val="1002"/></c:barChart><c:catAx><c:axId val="1001"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="low"/>${linea("8C8C8C")}<c:crossAx val="1002"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx><c:valAx><c:axId val="1002"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:majorGridlines>${linea("D9D9D9")}</c:majorGridlines><c:numFmt formatCode="&quot;$&quot;#,##0" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="1001"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx></c:plotArea>${g.series.length > 1 ? `<c:legend><c:legendPos val="t"/><c:overlay val="0"/></c:legend>` : ""}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`;
}

/** Dónde va cada gráfico de la hoja: debajo de sus filas, uno debajo del otro, a todo lo ancho. */
function dibujoXml(cantidad: number, primeraFila: number): string {
  const anclas = Array.from({ length: cantidad }, (_, i) => {
    const desde = primeraFila + i * (GRAFICO.filas + GRAFICO.separacion);
    const punto = (col: number, fila: number) => `<xdr:col>${col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${fila}</xdr:row><xdr:rowOff>0</xdr:rowOff>`;
    return `<xdr:twoCellAnchor><xdr:from>${punto(0, desde)}</xdr:from><xdr:to>${punto(GRAFICO.columnas, desde + GRAFICO.filas)}</xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${i + 2}" name="Gráfico ${i + 1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId${i + 1}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`;
  });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${anclas.join("")}</xdr:wsDr>`;
}

const relaciones = (items: { tipo: string; destino: string }[]) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items
    .map((r, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${r.tipo}" Target="${r.destino}"/>`)
    .join("")}</Relationships>`;

export function planillaXlsx(hojas: readonly Hoja[]): Uint8Array {
  // Los gráficos que se pueden dibujar: los que apuntan a una hoja del archivo que tiene filas.
  const graficos = hojas.map((h) =>
    (h.graficos ?? []).flatMap((g) => {
      const datos = hojas.find((x) => x.nombre === g.hoja);
      return datos && datos.filas.length > 0 && g.series.length > 0 ? [{ g, datos }] : [];
    }),
  );
  let numeroDeGrafico = 0;
  const numeros = graficos.map((lista) => lista.map(() => ++numeroDeGrafico));
  const tipos = [
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`,
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>`,
    ...hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`),
    ...graficos.flatMap((lista, i) => (lista.length ? [`<Override PartName="/xl/drawings/drawing${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`] : [])),
    ...numeros.flat().map((n) => `<Override PartName="/xl/charts/chart${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`),
  ];
  const archivos: Zippable = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${tipos.join("")}</Types>`,
    ),
    "_rels/.rels": strToU8(relaciones([{ tipo: "officeDocument", destino: "xl/workbook.xml" }])),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${hojas
        .map((h, i) => `<sheet name="${xml(nombreHoja(h.nombre))}" sheetId="${i + 1}"${h.oculta ? ' state="hidden"' : ""} r:id="rId${i + 1}"/>`)
        .join("")}</sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(relaciones([...hojas.map((_, i) => ({ tipo: "worksheet", destino: `worksheets/sheet${i + 1}.xml` })), { tipo: "styles", destino: "styles.xml" }])),
    // Estilos: 0 normal, 1 encabezado en negrita, 2 número con separador de miles y 2 decimales.
    "xl/styles.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    ),
  };
  hojas.forEach((h, i) => {
    const lista = graficos[i]!;
    archivos[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(hojaXml(h, lista.length > 0));
    if (lista.length === 0) return;
    archivos[`xl/worksheets/_rels/sheet${i + 1}.xml.rels`] = strToU8(relaciones([{ tipo: "drawing", destino: `../drawings/drawing${i + 1}.xml` }]));
    archivos[`xl/drawings/drawing${i + 1}.xml`] = strToU8(dibujoXml(lista.length, h.filas.length + 2));
    archivos[`xl/drawings/_rels/drawing${i + 1}.xml.rels`] = strToU8(relaciones(numeros[i]!.map((n) => ({ tipo: "chart", destino: `../charts/chart${n}.xml` }))));
    lista.forEach(({ g, datos }, k) => {
      archivos[`xl/charts/chart${numeros[i]![k]}.xml`] = strToU8(graficoXml(g, datos));
    });
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
