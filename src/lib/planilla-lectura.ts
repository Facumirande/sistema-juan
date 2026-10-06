import { strFromU8, unzipSync } from "fflate";

import { dec } from "@/dominio/dinero/decimal";
import { MAXIMO_BYTES_PLANILLA } from "@/dominio/pedidos/planilla";

// Lectura de planillas que arma la persona (pedidos en Excel): la primera hoja de un .xlsx, o un
// .csv, como filas de textos. Un .xlsx es un .zip con XML adentro: se leen solo las partes que
// hacen falta (hojas, textos compartidos) sin depender de una librería de planillas.

export class PlanillaIlegible extends Error {}

const MAXIMO_FILAS = 5000;

const ENTIDADES: Readonly<Record<string, string>> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function desescapar(texto: string): string {
  return texto.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (todo, e: string) => {
    if (e.startsWith("#x") || e.startsWith("#X")) return String.fromCodePoint(parseInt(e.slice(2), 16));
    if (e.startsWith("#")) return String.fromCodePoint(Number(e.slice(1)));
    return ENTIDADES[e.toLowerCase()] ?? todo;
  });
}

/** El texto de un `<si>` o `<is>`: la suma de sus `<t>` (sin las guías fonéticas). */
function textoDe(xml: string): string {
  const sinFonetica = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let texto = "";
  for (const m of sinFonetica.matchAll(/<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g)) texto += desescapar(m[1] ?? "");
  return texto;
}

const atributo = (atributos: string, nombre: string) => new RegExp(`(?:^|\\s)${nombre}="([^"]*)"`).exec(atributos)?.[1] ?? null;

/** "B" → 1, "AA" → 26. */
function indiceDeColumna(referencia: string): number {
  let n = 0;
  for (const letra of referencia.replace(/[^A-Za-z]/g, "").toUpperCase()) n = n * 26 + (letra.charCodeAt(0) - 64);
  return n - 1;
}

/** Un número como lo guarda Excel ("2.5000000000000004", "1E3") dicho corto ("2.5", "1000"). */
function numeroLimpio(valor: string): string {
  try {
    return dec(valor).toDecimalPlaces(6).toString();
  } catch {
    return valor;
  }
}

function leerXlsx(bytes: Uint8Array): string[][] {
  let archivos: Record<string, Uint8Array>;
  try {
    archivos = unzipSync(bytes, { filter: (f) => f.name === "xl/workbook.xml" || f.name === "xl/_rels/workbook.xml.rels" || f.name === "xl/sharedStrings.xml" || /^xl\/worksheets\/[^/]+\.xml$/.test(f.name) });
  } catch {
    throw new PlanillaIlegible("El archivo está dañado o no es una planilla de Excel (.xlsx).");
  }
  const leer = (nombre: string) => (archivos[nombre] ? strFromU8(archivos[nombre]) : null);

  // La primera hoja según el libro; si no se puede saber, la primera que haya.
  let hoja: string | null = null;
  const libro = leer("xl/workbook.xml");
  const relaciones = leer("xl/_rels/workbook.xml.rels");
  const primera = libro ? /<sheet\b([^>]*)\/?>/.exec(libro)?.[1] : null;
  const rid = primera ? (atributo(primera, "r:id") ?? atributo(primera, "id")) : null;
  if (rid && relaciones) {
    for (const m of relaciones.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
      if (atributo(m[1]!, "Id") === rid) {
        const destino = atributo(m[1]!, "Target");
        if (destino) hoja = leer(destino.startsWith("/") ? destino.slice(1) : `xl/${destino}`);
      }
    }
  }
  if (!hoja) {
    const nombres = Object.keys(archivos).filter((n) => n.startsWith("xl/worksheets/")).sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
    hoja = nombres[0] ? leer(nombres[0]) : null;
  }
  if (!hoja) throw new PlanillaIlegible("La planilla no tiene ninguna hoja con datos.");

  const compartidos = [...(leer("xl/sharedStrings.xml") ?? "").matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g)].map((m) => textoDe(m[1] ?? ""));

  const filas: string[][] = [];
  for (const f of hoja.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const numero = Number(atributo(f[1] ?? "", "r") ?? filas.length + 1);
    const fila: string[] = [];
    let siguiente = 0;
    for (const c of (f[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const atributos = c[1] ?? "";
      const referencia = atributo(atributos, "r");
      const columna = referencia ? indiceDeColumna(referencia) : siguiente;
      siguiente = columna + 1;
      const tipo = atributo(atributos, "t");
      const cuerpo = c[2] ?? "";
      const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(cuerpo)?.[1];
      let valor = "";
      if (tipo === "s") valor = compartidos[Number(v)] ?? "";
      else if (tipo === "inlineStr") valor = textoDe(cuerpo);
      else if (tipo === "str" || tipo === "e") valor = desescapar(v ?? "");
      else if (tipo === "b") valor = v === "1" ? "sí" : "no";
      else if (v !== undefined) valor = numeroLimpio(v);
      if (columna >= 0 && columna < 200) fila[columna] = valor.trim();
    }
    if (numero > MAXIMO_FILAS) throw new PlanillaIlegible(`La planilla tiene más de ${MAXIMO_FILAS} filas: partila en varias.`);
    while (filas.length < numero - 1) filas.push([]);
    filas[numero - 1] = Array.from(fila, (x) => x ?? "");
  }
  return filas;
}

function leerCsv(texto: string): string[][] {
  const limpio = texto.replace(/^﻿/, "");
  const primera = limpio.split(/\r?\n/, 1)[0] ?? "";
  const cuenta = (s: string) => primera.split(s).length - 1;
  const separador = [";", "\t", ","].sort((a, b) => cuenta(b) - cuenta(a))[0]!;
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let entreComillas = false;
  for (let i = 0; i < limpio.length; i++) {
    const ch = limpio[i]!;
    if (entreComillas) {
      if (ch === '"' && limpio[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (ch === '"') entreComillas = false;
      else campo += ch;
    } else if (ch === '"' && campo === "") entreComillas = true;
    else if (ch === separador) {
      fila.push(campo.trim());
      campo = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && limpio[i + 1] === "\n") i++;
      fila.push(campo.trim());
      filas.push(fila);
      fila = [];
      campo = "";
      if (filas.length > MAXIMO_FILAS) throw new PlanillaIlegible(`La planilla tiene más de ${MAXIMO_FILAS} filas: partila en varias.`);
    } else campo += ch;
  }
  if (campo !== "" || fila.length > 0) {
    fila.push(campo.trim());
    filas.push(fila);
  }
  return filas;
}

/**
 * Las filas de la primera hoja de un .xlsx o de un .csv (separado por ";", "," o tabulaciones),
 * cada celda como texto. Las fechas de Excel llegan como su número de serie: las interpreta quien
 * sabe qué columna es una fecha.
 */
export function leerPlanilla(bytes: Uint8Array): string[][] {
  if (bytes.length === 0) throw new PlanillaIlegible("El archivo está vacío.");
  if (bytes.length > MAXIMO_BYTES_PLANILLA) throw new PlanillaIlegible("El archivo es muy grande: dejá solo la hoja de los pedidos y volvé a subirlo.");
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return leerXlsx(bytes);
  // Los .xls viejos (Excel 97-2003) empiezan con esta firma y no se pueden leer.
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf) throw new PlanillaIlegible("Ese archivo es un Excel viejo (.xls): abrilo y guardalo como “Libro de Excel (.xlsx)”, y subí ese.");
  let texto: string;
  try {
    texto = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    texto = new TextDecoder("windows-1252").decode(bytes);
  }
  return leerCsv(texto);
}
