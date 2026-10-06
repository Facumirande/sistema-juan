import { asc, eq } from "drizzle-orm";

import { categoria, presentacion, producto } from "@/db/esquema";
import type { BaseDatos } from "@/db/tipos";
import { COLUMNAS_DE_PRODUCTOS, filasDeProductos, grupoDeCategoria, interpretarProductos, type GrupoDeCategoria, type ProductoDePlanilla } from "@/dominio/catalogo/planilla";
import { dec } from "@/dominio/dinero/decimal";
import { ABREVIATURA_UNIDAD, type UnidadMedida } from "@/dominio/dinero/formato";
import { ErrorDeNegocio } from "@/dominio/errores";
import type { ProblemaDePlanilla } from "@/dominio/planillas/comun";
import { PlanillaIlegible, leerPlanilla } from "@/lib/planilla-lectura";
import type { Hoja } from "@/lib/planilla";
import { ejecutarComoUsuario } from "@/modulos/seguridad/contexto";

import { crearProductos } from "./productos";

// Productos en Excel (07/10/2026): bajar la lista de productos a una planilla, y cargar productos
// nuevos desde una planilla con las mismas columnas (primero se revisa, después se carga todo junto).

/** Lo que hace falta saber de lo ya cargado para revisar una planilla: categorías y productos (también los dados de baja). */
async function catalogoActual(db: BaseDatos, authUserId: string) {
  return ejecutarComoUsuario(db, authUserId, "productos.ver", async (tx, c) => ({
    categorias: (await tx.select({ id: categoria.id, nombre: categoria.nombre, activa: categoria.activo, grupo: categoria.grupo }).from(categoria).orderBy(asc(categoria.orden), asc(categoria.nombre))),
    productos: await tx.select({ codigo: producto.codigo, nombre: producto.nombre }).from(producto),
    puedeCrear: c.permisos.tiene("productos.editar"),
    puedeGanancias: c.permisos.tiene("precios.editar_reglas"),
  }));
}

/**
 * La lista de productos para bajarla a Excel: una fila por producto, con las columnas que después
 * se pueden volver a subir (más si está activo). La ganancia sale solo para quien puede ver márgenes.
 */
export async function hojaDeProductos(db: BaseDatos, authUserId: string): Promise<Hoja> {
  return ejecutarComoUsuario(db, authUserId, "productos.ver", async (tx, c) => {
    const verGanancia = c.permisos.tiene("precios.ver_margenes");
    const filas = await tx
      .select({
        codigo: producto.codigo,
        nombre: producto.nombre,
        categoria: categoria.nombre,
        unidad: producto.unidadBase,
        envase: presentacion.nombre,
        trae: presentacion.factorABase,
        fraccion: producto.admiteFraccion,
        ganancia: producto.recargoDefault,
        notas: producto.observaciones,
        activo: producto.activo,
      })
      .from(producto)
      .innerJoin(categoria, eq(categoria.id, producto.categoriaId))
      .leftJoin(presentacion, eq(presentacion.id, producto.presentacionCompraDefaultId))
      .orderBy(asc(categoria.orden), asc(categoria.nombre), asc(producto.nombre));
    return {
      nombre: "Productos",
      columnas: [...COLUMNAS_DE_PRODUCTOS, "Estado"],
      filas: filas.map((f) => [
        f.codigo,
        f.nombre,
        f.categoria,
        ABREVIATURA_UNIDAD[f.unidad as UnidadMedida],
        f.envase,
        f.envase && f.trae ? { numero: dec(f.trae).toString() } : null,
        f.fraccion ? "sí" : "no",
        verGanancia && f.ganancia !== null ? { numero: dec(f.ganancia).toString() } : null,
        f.notas,
        f.activo ? "Activo" : "Dado de baja",
      ]),
    };
  });
}

/** La planilla modelo para cargar productos: los títulos, cómo llenarla y las categorías que ya existen. */
export async function planillaModeloDeProductos(db: BaseDatos, authUserId: string): Promise<Hoja[]> {
  const actual = await catalogoActual(db, authUserId);
  return [
    { nombre: "Productos", columnas: [...COLUMNAS_DE_PRODUCTOS], filas: [] },
    {
      nombre: "Cómo llenarla",
      columnas: ["Columna", "Qué va"],
      filas: [
        ["Código", "Opcional. Si lo dejás vacío se arma solo con el nombre (Tomate redondo → TOMA-R)."],
        ["Producto", "El nombre como lo dicen ustedes. Obligatorio. Si ya existe un producto con ese nombre, esa fila se saltea."],
        ["Categoría", "Obligatoria. Una de la hoja “Categorías”, o una nueva: se crea sola."],
        ["Se vende por", "kg, unidad, atado, docena, maple, bandeja, paquete o litro. Vacío = kg."],
        ["Envase de compra", "En qué se compra en el mercado: Cajón, Bolsa, Jaula… Vacío = se compra suelto."],
        ["Trae", "Cuánto trae ese envase, en lo que se vende (un cajón de 18 kg → 18). Obligatorio si hay envase."],
        ["Se pide en partes", "sí o no. Vacío = sí para lo que va por kilo o litro, no para lo demás."],
        ["Ganancia %", "Opcional: cuánto se le gana a ese producto (30 = 30 %). Vacío = la de su categoría o la general."],
        ["Notas", "Opcional."],
        ["", "Una fila por producto, con los títulos en la primera fila de la hoja “Productos”. El dibujo de cada producto sale solo de su nombre. Los precios de cada puesto se cargan después, en la ficha del producto o al anotar la primera compra."],
      ],
    },
    { nombre: "Categorías", columnas: ["Categoría"], filas: actual.categorias.filter((x) => x.activa).map((x) => [x.nombre]) },
  ];
}

export interface RevisionDeProductos {
  /** Los productos que se crearían (vacío si hay problemas). */
  nuevos: ProductoDePlanilla[];
  /** Los que ya estaban cargados: se saltean. */
  yaEstan: string[];
  categoriasNuevas: { nombre: string; grupo: GrupoDeCategoria }[];
  problemas: ProblemaDePlanilla[];
}

/** Lee la planilla y dice qué productos saldrían de ella y qué hay que corregir, sin cargar nada. */
export async function revisarPlanillaDeProductos(db: BaseDatos, authUserId: string, bytes: Uint8Array): Promise<RevisionDeProductos> {
  let planilla: string[][];
  try {
    planilla = leerPlanilla(bytes);
  } catch (error) {
    if (error instanceof PlanillaIlegible) throw new ErrorDeNegocio("VALIDACION", error.message);
    throw error;
  }
  const actual = await catalogoActual(db, authUserId);
  if (!actual.puedeCrear) throw new ErrorDeNegocio("SIN_PERMISO", "Tu usuario no puede cargar productos.");
  const { filas, problema } = filasDeProductos(planilla);
  if (problema) return { nuevos: [], yaEstan: [], categoriasNuevas: [], problemas: [{ fila: 0, mensaje: problema }] };
  const r = interpretarProductos(filas, actual);
  if (!actual.puedeGanancias && r.nuevos.some((p) => p.ganancia !== null)) {
    r.problemas.push({ fila: 0, mensaje: "La planilla trae ganancias y tu usuario no puede cambiarlas: dejá vacía la columna “Ganancia %”." });
  }
  return { ...r, nuevos: r.problemas.length ? [] : r.nuevos, categoriasNuevas: r.problemas.length ? [] : r.categoriasNuevas };
}

/** Lo que manda la pantalla después de revisar: cada producto con su categoría (la que existe o el nombre de la nueva). */
export type ProductoAImportar = Pick<ProductoDePlanilla, "codigo" | "nombre" | "categoria" | "categoriaId" | "unidadBase" | "admiteFraccion" | "envase" | "ganancia" | "notas">;

/** Carga los productos revisados, todos juntos, con las categorías nuevas que hagan falta. */
export async function importarProductos(db: BaseDatos, authUserId: string, productos: readonly ProductoAImportar[]) {
  // Los números viajan con coma: escritos con punto, "0.125" se leería como ciento veinticinco.
  const conComa = (n: string) => n.replace(".", ",");
  return crearProductos(
    db,
    authUserId,
    productos.map((p) => ({
      nombre: p.nombre,
      codigo: p.codigo,
      categoriaId: p.categoriaId,
      categoriaNueva: p.categoriaId ? null : { nombre: p.categoria, grupo: grupoDeCategoria(p.categoria) },
      unidadBase: p.unidadBase,
      admiteFraccion: p.admiteFraccion,
      observaciones: p.notas,
      presentacionCompraNombre: p.envase?.nombre ?? "",
      presentacionCompraFactor: p.envase ? conComa(p.envase.trae) : "",
      recargo: p.ganancia ? conComa(p.ganancia) : null,
    })),
  );
}
