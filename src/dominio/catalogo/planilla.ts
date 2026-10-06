import { dec } from "../dinero/decimal";
import { interpretarNumero } from "../dinero/entrada";
import { ABREVIATURA_UNIDAD, type UnidadMedida } from "../dinero/formato";
import { normalizarBusqueda } from "../pedidos/carga";
import { NOMBRES_DE_UNIDAD, casiIgual, leerTabla, unidadEscrita, type ProblemaDePlanilla } from "../planillas/comun";
import { nombreDePresentacion } from "./productos";

// Productos en una planilla de Excel (07/10/2026): la misma planilla sirve para bajar la lista de
// productos y para cargar productos nuevos de una vez. Una fila por producto: su nombre, su
// categoría, cómo se vende y en qué envase se compra. El código y el dibujo se arman solos.

/** Las columnas de la planilla, en el orden en que se bajan. Se reconocen por el título, en cualquier orden. */
export const COLUMNAS_DE_PRODUCTOS = ["Código", "Producto", "Categoría", "Se vende por", "Envase de compra", "Trae", "Se pide en partes", "Ganancia %", "Notas"] as const;

type Campo = "codigo" | "producto" | "categoria" | "unidad" | "envase" | "trae" | "fraccion" | "ganancia" | "notas";

const TITULOS: Readonly<Record<Campo, readonly string[]>> = {
  codigo: ["codigo", "cod", "cod.", "codigo de producto", "codigo del producto"],
  producto: ["producto", "productos", "nombre", "nombre del producto", "descripcion"],
  categoria: ["categoria", "categorias", "rubro", "grupo"],
  unidad: ["se vende por", "unidad", "se cuenta por", "se vende", "unidad de venta"],
  envase: ["envase de compra", "envase", "se compra en", "presentacion", "bulto"],
  trae: ["trae", "cuanto trae", "contenido", "cantidad", "cantidad por envase"],
  fraccion: ["se pide en partes", "en partes", "fraccion", "admite fraccion", "se fracciona"],
  ganancia: ["ganancia %", "ganancia", "% ganancia", "recargo", "recargo %", "margen"],
  notas: ["notas", "nota", "observaciones", "observacion", "aclaracion"],
};

export type FilaDeProducto = { fila: number } & Record<Campo, string>;

/** Las filas de productos de una planilla: busca la fila de títulos (Producto y Categoría) y lee lo de abajo. */
export function filasDeProductos(planilla: readonly (readonly string[])[]): { filas: FilaDeProducto[]; problema: string | null } {
  const filas = leerTabla(planilla, TITULOS, (hay) => hay.has("producto") && hay.has("categoria"));
  if (!filas) {
    return {
      filas: [],
      problema: "No encuentro los títulos de las columnas. La primera fila tiene que decir, por lo menos: Producto y Categoría. Bajá la planilla modelo y copiá ahí los productos.",
    };
  }
  return { filas, problema: filas.length === 0 ? "La planilla no tiene ningún producto debajo de los títulos." : null };
}

export type GrupoDeCategoria = "FRUTA" | "VERDURA" | "OTRO";

/** En qué grupo va una categoría nueva, por su nombre (para el dibujo de sus productos). */
export function grupoDeCategoria(nombre: string): GrupoDeCategoria {
  const n = normalizarBusqueda(nombre);
  if (n.includes("frut")) return "FRUTA";
  if (["verdur", "hoja", "hortaliza", "verde"].some((p) => n.includes(p))) return "VERDURA";
  return "OTRO";
}

const SI: readonly string[] = ["si", "s", "x", "1", "verdadero"];
const NO: readonly string[] = ["no", "n", "0", "falso"];
const SIN_ENVASE: readonly string[] = ["suelto", "sin envase", "ninguno", "-"];

export interface CatalogoDeProductos {
  categorias: readonly { id: string; nombre: string; activa: boolean }[];
  productos: readonly { codigo: string; nombre: string }[];
}

export interface ProductoDePlanilla {
  fila: number;
  /** Nulo = se arma solo con el nombre. */
  codigo: string | null;
  nombre: string;
  /** El nombre de su categoría: una que ya existe o una nueva. */
  categoria: string;
  /** Nulo = la categoría es nueva y se crea con el producto. */
  categoriaId: string | null;
  unidadBase: UnidadMedida;
  admiteFraccion: boolean;
  /** Nulo = se compra suelto. */
  envase: { nombre: string; trae: string } | null;
  /** Ganancia propia del producto, en %. Nulo = la de su categoría o la general. */
  ganancia: string | null;
  notas: string | null;
}

/**
 * Arma los productos de la planilla contra lo que ya está cargado. Devuelve los productos nuevos,
 * los que ya estaban (se saltean: la planilla no cambia productos existentes), las categorías que
 * se crearían y, fila por fila, lo que no se entiende y cómo arreglarlo. Con problemas no se carga
 * nada: se corrige la planilla y se vuelve a subir.
 */
export function interpretarProductos(
  filas: readonly FilaDeProducto[],
  catalogo: CatalogoDeProductos,
): { nuevos: ProductoDePlanilla[]; yaEstan: string[]; categoriasNuevas: { nombre: string; grupo: GrupoDeCategoria }[]; problemas: ProblemaDePlanilla[] } {
  const problemas: ProblemaDePlanilla[] = [];
  const nuevos: ProductoDePlanilla[] = [];
  const yaEstan: string[] = [];
  const categoriasNuevas = new Map<string, { nombre: string; grupo: GrupoDeCategoria }>();
  const categoriaPorNombre = new Map(catalogo.categorias.map((c) => [normalizarBusqueda(c.nombre), c]));
  const nombresCargados = new Set(catalogo.productos.map((p) => normalizarBusqueda(p.nombre)));
  const codigosCargados = new Set(catalogo.productos.map((p) => p.codigo.trim().toUpperCase()));
  /** En qué fila apareció cada nombre y cada código de la planilla, para avisar los repetidos. */
  const nombresVistos = new Map<string, number>();
  const codigosVistos = new Map<string, number>();

  for (const f of filas) {
    const falla = (mensaje: string) => problemas.push({ fila: f.fila, mensaje });
    const nombre = f.producto.trim();
    if (!nombre) {
      falla("Falta el nombre del producto.");
      continue;
    }
    if (nombre.length > 120) {
      falla(`El nombre “${nombre.slice(0, 30)}…” es muy largo: usá hasta 120 letras.`);
      continue;
    }
    const codigo = f.codigo.trim().toUpperCase() || null;
    if (codigo && codigo.length > 20) {
      falla(`${nombre}: el código “${codigo}” es muy largo (hasta 20 letras). Dejalo vacío y se arma solo.`);
      continue;
    }
    const clave = normalizarBusqueda(nombre);
    if (nombresCargados.has(clave) || (codigo && codigosCargados.has(codigo))) {
      yaEstan.push(nombre);
      continue;
    }
    const repetido = nombresVistos.get(clave) ?? (codigo ? codigosVistos.get(codigo) : undefined);
    if (repetido !== undefined) {
      falla(`${nombre} está repetido: ya aparece (con ese nombre o ese código) en la fila ${repetido}. Dejá una sola.`);
      continue;
    }
    nombresVistos.set(clave, f.fila);
    if (codigo) codigosVistos.set(codigo, f.fila);

    if (!f.categoria) {
      falla(`${nombre}: falta la categoría (por ejemplo Verduras o Frutas).`);
      continue;
    }
    const existente = categoriaPorNombre.get(normalizarBusqueda(f.categoria));
    if (existente && !existente.activa) {
      falla(`${nombre}: la categoría “${existente.nombre}” está dada de baja. Reactivala en Productos → Categorías, o usá otra.`);
      continue;
    }
    if (!existente) {
      const casi = casiIgual(f.categoria, catalogo.categorias.map((c) => c.nombre));
      if (casi) {
        falla(`${nombre}: no existe la categoría “${f.categoria}”. ¿Quisiste decir “${casi}”? Corregila (si es una categoría nueva, escribila bien distinta).`);
        continue;
      }
      const yaNueva = categoriasNuevas.get(normalizarBusqueda(f.categoria));
      if (!yaNueva) categoriasNuevas.set(normalizarBusqueda(f.categoria), { nombre: f.categoria.slice(0, 80), grupo: grupoDeCategoria(f.categoria) });
    }
    const categoria = existente?.nombre ?? categoriasNuevas.get(normalizarBusqueda(f.categoria))!.nombre;

    const unidadBase = f.unidad ? unidadEscrita(f.unidad) : "KG";
    if (!unidadBase) {
      falla(`${nombre}: no entiendo cómo se vende (“${f.unidad}”). Poné kg, unidad, atado, docena, maple, bandeja, paquete o litro.`);
      continue;
    }
    const unidad = ABREVIATURA_UNIDAD[unidadBase];

    const envaseEscrito = normalizarBusqueda(f.envase);
    const suelto = envaseEscrito === "" || SIN_ENVASE.includes(envaseEscrito) || NOMBRES_DE_UNIDAD[unidadBase].includes(envaseEscrito);
    let envase: ProductoDePlanilla["envase"] = null;
    if (suelto && f.trae && envaseEscrito === "") {
      falla(`${nombre}: dice cuánto trae (${f.trae}) pero falta el envase (por ejemplo Cajón o Bolsa).`);
      continue;
    }
    if (!suelto) {
      const trae = interpretarNumero(f.trae);
      if (!trae || !trae.gt(0)) {
        falla(`${nombre}: falta cuántos ${unidad} trae el envase “${f.envase}” (columna “Trae”, por ejemplo 18).`);
        continue;
      }
      envase = { nombre: nombreDePresentacion(f.envase, trae.toString(), unidad).slice(0, 60), trae: trae.toString() };
    }

    const partes = normalizarBusqueda(f.fraccion);
    if (partes && !SI.includes(partes) && !NO.includes(partes)) {
      falla(`${nombre}: en “Se pide en partes” poné sí o no (dice “${f.fraccion}”).`);
      continue;
    }
    const admiteFraccion = partes ? SI.includes(partes) : unidadBase === "KG" || unidadBase === "LITRO";

    let ganancia: string | null = null;
    if (f.ganancia) {
      const g = interpretarNumero(f.ganancia.replace("%", ""));
      if (!g || g.lt(0) || g.gt(1000)) {
        falla(`${nombre}: la ganancia “${f.ganancia}” no es un porcentaje. Poné un número, por ejemplo 30 (o dejala vacía).`);
        continue;
      }
      ganancia = dec(g).toString();
    }

    nuevos.push({ fila: f.fila, codigo, nombre, categoria, categoriaId: existente?.id ?? null, unidadBase, admiteFraccion, envase, ganancia, notas: f.notas.slice(0, 500) || null });
  }

  // Una categoría que solo aparecía en filas con problemas no se crea.
  const usadas = new Set(nuevos.filter((p) => p.categoriaId === null).map((p) => normalizarBusqueda(p.categoria)));
  return { nuevos, yaEstan, categoriasNuevas: [...categoriasNuevas].filter(([clave]) => usadas.has(clave)).map(([, c]) => c), problemas };
}
