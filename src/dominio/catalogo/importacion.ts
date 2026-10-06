import { interpretarNumero } from "../dinero/entrada";
import { categoriaSugerida, esNinguna, nombreDeCategoria, normalizar, preelegida } from "./categorias";
import { codigoSugerido, dibujoDeProducto, grupoDeProducto, interpretarUnidad, nombreDePresentacion, unidadSugerida, UNIDADES_EN_PALABRAS, type UnidadDeVenta } from "./productos";

// Carga de productos desde la planilla modelo (pedido del usuario, 06/10/2026, RN-155): alcanza con
// los nombres uno debajo del otro. El código se arma solo, el dibujo sale del nombre, la categoría
// y la forma de vender se proponen si se dejaron vacías, y solo se avisa lo importante que falta
// (cómo se vende, o un envase sin lo que trae). Lo que no importa no se avisa.

/** Columnas de la planilla modelo, en orden (la primera fila de la hoja "Productos"). */
export const COLUMNAS_PLANILLA = ["Producto", "Categoría", "Se vende por", "Envase en que se compra", "Cuánto trae el envase", "Ganancia %", "Código"] as const;

type Campo = "producto" | "categoria" | "unidad" | "envase" | "cantidad" | "ganancia" | "codigo";

/** Cómo se reconoce cada columna por su título (sin acentos, en minúsculas). */
const TITULOS: readonly [Campo, readonly string[]][] = [
  ["producto", ["producto", "productos", "nombre", "articulo", "verdura", "fruta", "descripcion"]],
  ["categoria", ["categoria", "categorias", "tipo", "rubro"]],
  ["unidad", ["se vende por", "unidad", "como se vende", "venta", "medida"]],
  ["envase", ["envase en que se compra", "envase", "presentacion", "como se compra"]],
  ["cantidad", ["cuanto trae el envase", "cuanto trae", "trae", "cantidad", "contenido"]],
  ["ganancia", ["ganancia %", "ganancia", "recargo", "margen"]],
  ["codigo", ["codigo", "cod", "codigo (se crea solo)"]],
];

export interface FilaDePlanilla {
  /** Número de fila en la planilla (para decir dónde está cada cosa). */
  fila: number;
  producto: string;
  categoria: string;
  unidad: string;
  envase: string;
  cantidad: string;
  ganancia: string;
  codigo: string;
}

/**
 * Las filas con producto de una hoja. La fila de títulos es la primera que tiene "Producto" (u otro
 * título conocido); si no hay títulos, se toma la primera columna como los nombres apilados.
 */
export function filasDePlanilla(celdas: readonly (readonly string[])[]): FilaDePlanilla[] {
  const indiceTitulos = celdas.findIndex((fila) => fila.some((c) => TITULOS[0]![1].includes(normalizar(c))));
  const columnas = new Map<Campo, number>();
  if (indiceTitulos >= 0) {
    celdas[indiceTitulos]!.forEach((titulo, i) => {
      const t = normalizar(titulo);
      const campo = TITULOS.find(([c, nombres]) => !columnas.has(c) && nombres.some((n) => t === n || t.startsWith(`${n} `) || t.startsWith(`${n}(`)))?.[0];
      if (campo) columnas.set(campo, i);
    });
  } else {
    columnas.set("producto", 0);
  }
  const valor = (fila: readonly string[], campo: Campo) => {
    const i = columnas.get(campo);
    return i === undefined ? "" : (fila[i] ?? "").replace(/\s+/g, " ").trim();
  };
  const resultado: FilaDePlanilla[] = [];
  celdas.forEach((fila, i) => {
    if (i <= indiceTitulos) return;
    const producto = valor(fila, "producto");
    if (!producto) return;
    resultado.push({
      fila: i + 1,
      producto,
      categoria: valor(fila, "categoria"),
      unidad: valor(fila, "unidad"),
      envase: valor(fila, "envase"),
      cantidad: valor(fila, "cantidad"),
      ganancia: valor(fila, "ganancia"),
      codigo: valor(fila, "codigo"),
    });
  });
  return resultado;
}

export type EstadoDeImportacion = "NUEVO" | "YA_EXISTE" | "REPETIDO";

export interface ProductoAImportar {
  fila: number;
  nombre: string;
  codigo: string;
  dibujo: string;
  /** Nombre de la categoría (existente, preelegida o nueva); null = "Sin categoría". */
  categoria: string | null;
  /** La categoría la propuso el sistema por el nombre (la celda estaba vacía). */
  categoriaPropuesta: boolean;
  unidad: UnidadDeVenta;
  /** La forma de vender no estaba en la planilla (o no se entendió): se propuso una. */
  unidadPropuesta: boolean;
  admiteFraccion: boolean;
  envase: { nombre: string; factor: string } | null;
  ganancia: string | null;
  /** Lo importante que falta completar, dicho para la persona (vacío si está todo). */
  faltan: string[];
  estado: EstadoDeImportacion;
}

/** "papa" → "Papa"; si ya viene con mayúsculas a propósito ("Tomate Perita") queda como está. */
export function nombreDeProducto(texto: string): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  return limpio === limpio.toLowerCase() || limpio === limpio.toUpperCase() ? limpio.charAt(0).toUpperCase() + limpio.slice(1).toLowerCase() : limpio;
}

const FRACCION: ReadonlySet<UnidadDeVenta> = new Set(["KG", "LITRO"]);
const UNIDAD_CORTA: Readonly<Record<UnidadDeVenta, string>> = { KG: "kg", UNIDAD: "u", ATADO: "atado", MAPLE: "maple", BANDEJA: "bandeja", DOCENA: "docena", PAQUETE: "paquete", LITRO: "l" };

export interface ContextoDeImportacion {
  /** Códigos que ya tienen los productos del negocio. */
  codigos: readonly string[];
  /** Nombres de los productos que ya existen. */
  nombres: readonly string[];
  /** Categorías que ya existen (para escribirlas igual). */
  categorias: readonly string[];
}

/** Lo que va a pasar con cada fila de la planilla: el producto que se crea o por qué no. */
export function interpretarProductos(filas: readonly FilaDePlanilla[], contexto: ContextoDeImportacion): ProductoAImportar[] {
  const ocupados = new Set(contexto.codigos.map((c) => c.toUpperCase()));
  const existentes = new Set(contexto.nombres.map(normalizar));
  const vistos = new Set<string>();
  const categoriaExistente = new Map(contexto.categorias.map((c) => [normalizar(c), c]));

  return filas.map((f) => {
    const nombre = nombreDeProducto(f.producto);
    const clave = normalizar(nombre);
    const estado: EstadoDeImportacion = existentes.has(clave) ? "YA_EXISTE" : vistos.has(clave) ? "REPETIDO" : "NUEVO";
    vistos.add(clave);
    const faltan: string[] = [];

    // Código: el de la planilla si está libre; si no, uno que se arma solo con el nombre.
    const propio = f.codigo.toUpperCase().replace(/\s+/g, "").slice(0, 20);
    const codigo = propio && !ocupados.has(propio) ? propio : codigoSugerido(nombre, ocupados);
    if (estado === "NUEVO") ocupados.add(codigo);

    // Categoría: "Ninguna" la deja sin categoría; vacía, la que le va por el nombre.
    let categoria: string | null;
    let categoriaPropuesta = false;
    if (!f.categoria) {
      categoria = categoriaSugerida(nombre);
      categoriaPropuesta = categoria !== null;
    } else if (esNinguna(f.categoria)) {
      categoria = null;
    } else {
      categoria = categoriaExistente.get(normalizar(f.categoria)) ?? preelegida(f.categoria)?.nombre ?? nombreDeCategoria(f.categoria);
    }

    // Cómo se vende: es lo importante; si falta, se propone y se avisa.
    const leida = interpretarUnidad(f.unidad);
    const unidadPropuesta = leida === null || leida === "NINGUNA";
    const unidad = unidadPropuesta ? unidadSugerida(nombre) : leida;
    if (leida === null) faltan.push(`No se entendió “${f.unidad}” en cómo se vende: quedó por ${UNIDADES_EN_PALABRAS[unidad].toLowerCase()}, revisalo.`);
    else if (leida === "NINGUNA") faltan.push(`Falta decir cómo se vende: quedó por ${UNIDADES_EN_PALABRAS[unidad].toLowerCase()}, revisalo.`);

    // Envase: opcional; si se escribió, tiene que decir cuánto trae.
    let envase: ProductoAImportar["envase"] = null;
    const sinEnvase = !f.envase || esNinguna(f.envase) || normalizar(f.envase) === "suelto";
    if (!sinEnvase) {
      const factor = interpretarNumero(f.cantidad);
      if (factor?.gt(0)) envase = { nombre: nombreDePresentacion(nombreDeProducto(f.envase), factor.toString(), UNIDAD_CORTA[unidad]), factor: factor.toString() };
      else faltan.push(`Falta cuánto trae el envase (${f.envase.toLowerCase()}): se carga sin envase, completalo en su ficha.`);
    }

    // Ganancia: opcional; si no es un número razonable, se usa la general.
    const g = f.ganancia ? interpretarNumero(f.ganancia.replace("%", "")) : null;
    const ganancia = g?.gt(-100) && g.lte(1000) ? g.toString() : null;

    return {
      fila: f.fila,
      nombre,
      codigo,
      dibujo: dibujoDeProducto(nombre, grupoDeProducto(nombre)),
      categoria,
      categoriaPropuesta,
      unidad,
      unidadPropuesta,
      admiteFraccion: FRACCION.has(unidad),
      envase,
      ganancia,
      faltan,
      estado,
    };
  });
}
