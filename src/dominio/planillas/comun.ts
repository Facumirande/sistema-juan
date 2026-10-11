import type { UnidadMedida } from "../dinero/formato";
import { normalizarBusqueda } from "../pedidos/carga";

// Lo común de las planillas de Excel que se suben (pedidos, productos): encontrar la fila de
// títulos y leer las columnas por su nombre, entender cómo se escribió una unidad, y sugerir el
// nombre correcto cuando algo no coincide.

/** Tamaño máximo del archivo que se sube (lo que acepta una acción del servidor). */
export const MAXIMO_BYTES_PLANILLA = 900_000;

/** Algo que no se entiende de una fila, con cómo arreglarlo. `fila` 0 = es de toda la planilla. */
export interface ProblemaDePlanilla {
  fila: number;
  mensaje: string;
}

/**
 * Busca la fila de títulos (entre las primeras 15) y lee lo de abajo. Cada columna se reconoce por
 * su título, con sus sinónimos, sin importar el orden ni las mayúsculas o los acentos; `alcanza`
 * dice si con las columnas encontradas ya se puede leer la planilla. Las filas vacías se saltean y
 * las columnas que no están quedan en "". Cada fila lleva su número en la planilla (la primera es
 * 1). Null si no hay una fila de títulos que alcance.
 */
export function leerTabla<C extends string>(
  planilla: readonly (readonly string[])[],
  titulos: Readonly<Record<C, readonly string[]>>,
  alcanza: (hay: ReadonlySet<C>) => boolean,
): ({ fila: number } & Record<C, string>)[] | null {
  const campos = Object.keys(titulos) as C[];
  for (let i = 0; i < Math.min(planilla.length, 15); i++) {
    const celdas = planilla[i]!.map(normalizarBusqueda);
    const columnas = new Map<C, number>();
    for (const campo of campos) {
      const j = celdas.findIndex((c) => titulos[campo].includes(c));
      if (j >= 0) columnas.set(campo, j);
    }
    if (!alcanza(new Set(columnas.keys()))) continue;
    const filas: ({ fila: number } & Record<C, string>)[] = [];
    for (let k = i + 1; k < planilla.length; k++) {
      const fila = planilla[k]!;
      if (fila.every((c) => !c.trim())) continue;
      const valores = Object.fromEntries(campos.map((campo) => [campo, columnas.has(campo) ? (fila[columnas.get(campo)!] ?? "").trim() : ""])) as Record<C, string>;
      filas.push({ fila: k + 1, ...valores });
    }
    return filas;
  }
  return null;
}

/** Cómo se puede escribir cada unidad en una planilla. */
export const NOMBRES_DE_UNIDAD: Readonly<Record<UnidadMedida, readonly string[]>> = {
  KG: ["kg", "kgs", "kilo", "kilos", "k"],
  UNIDAD: ["u", "un", "uni", "unid", "unidad", "unidades"],
  ATADO: ["atado", "atados"],
  MAPLE: ["maple", "maples"],
  BANDEJA: ["bandeja", "bandejas"],
  DOCENA: ["docena", "docenas", "doc"],
  PAQUETE: ["paquete", "paquetes", "paq"],
  LITRO: ["l", "lt", "lts", "litro", "litros"],
  CAJON: ["cajon", "cajón", "cajones"],
  CAJA: ["caja", "cajas"],
  BOLSA: ["bolsa", "bolsas"],
  JAULA: ["jaula", "jaulas"],
  BOLSON: ["bolson", "bolsón", "bolsones"],
  RISTRA: ["ristra", "ristras"],
};

/** Entre varios nombres, el único que contiene lo escrito o está contenido en él (para sugerir "¿quisiste decir…?"). */
export function parecido(escrito: string, nombres: readonly string[]): string | null {
  const e = normalizarBusqueda(escrito);
  if (e.length < 3) return null;
  const candidatos = nombres.filter((n) => {
    const x = normalizarBusqueda(n);
    return x.includes(e) || e.includes(x);
  });
  return candidatos.length === 1 ? candidatos[0]! : null;
}
