import { and, asc, count, eq, inArray, lt, max, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { auditar, diferencias } from "@/db/auditoria";
import { categoria, grupoProducto, producto } from "@/db/esquema";
import type { BaseDatos, Transaccion } from "@/db/tipos";
import { nombreDeCategoria, preelegida, SIN_CATEGORIA } from "@/dominio/catalogo/categorias";
import { ErrorDeNegocio } from "@/dominio/errores";
import { registrarActividad } from "@/modulos/colaboracion/registro";
import { ejecutarComoUsuario, type ContextoUsuario } from "@/modulos/seguridad/contexto";
import { enteroOpcional, textoObligatorio, validar } from "@/modulos/validacion";

// P-12 Categorías (08 §5.2). El recargo de la categoría se edita con los precios de venta.
// RN-154 (pedido del usuario, 06/10/2026): una categoría existe para la persona solo si tiene al
// menos un producto activo. Nace al asignársela a un producto (al cargarlo, desde la planilla o
// arrastrándolo) y se oculta sola (queda inactiva) cuando se queda sin productos; si se vuelve a
// usar su nombre, se reactiva la misma (con su ganancia y su orden).

export type GrupoProducto = (typeof grupoProducto.enumValues)[number];

export interface CategoriaListada {
  id: string;
  nombre: string;
  grupo: GrupoProducto;
  orden: number;
  activo: boolean;
  productosActivos: number;
}

const esquemaCategoria = z.object({
  id: z.uuid().optional(),
  nombre: textoObligatorio("Escribí el nombre de la categoría.", 80),
  grupo: z.enum(grupoProducto.enumValues, "Elegí si es fruta, verdura u otro."),
  orden: enteroOpcional("El orden tiene que ser un número entero.").transform((v) => (v === null ? 0 : Number(v))),
});

/** Las categorías; con `soloConProductos`, las que se ven (con algún producto activo, RN-154). */
export async function listarCategorias(db: BaseDatos, authUserId: string, opciones: { soloConProductos?: boolean } = {}): Promise<CategoriaListada[]> {
  const todas = await ejecutarComoUsuario(db, authUserId, "productos.ver", async (tx) => {
    const filas = await tx
      .select({
        id: categoria.id,
        nombre: categoria.nombre,
        grupo: categoria.grupo,
        orden: categoria.orden,
        activo: categoria.activo,
        productosActivos: count(producto.id),
      })
      .from(categoria)
      .leftJoin(producto, and(eq(producto.categoriaId, categoria.id), eq(producto.activo, true)))
      .groupBy(categoria.id)
      .orderBy(sql`${categoria.activo} desc`, asc(categoria.orden), asc(categoria.nombre));
    return filas.map((f) => ({ ...f, productosActivos: Number(f.productosActivos) }));
  });
  return opciones.soloConProductos ? todas.filter((c) => c.productosActivos > 0) : todas;
}

/** Qué categoría se eligió para un producto: una que existe (por id) o un nombre (null = "Ninguna"). */
export interface EleccionDeCategoria {
  id?: string | null;
  nombre?: string | null;
}

/**
 * La categoría elegida, lista para usar (RN-154): la que existe (reactivándola si se había
 * ocultado), la del mismo nombre, o una nueva (con el orden y el grupo de la preelegida si lo es).
 * Sin nada elegido, "Sin categoría".
 */
export async function resolverCategoria(tx: Transaccion, c: ContextoUsuario, eleccion: EleccionDeCategoria): Promise<string> {
  if (eleccion.id) {
    const [cat] = await tx.select({ id: categoria.id, activo: categoria.activo }).from(categoria).where(eq(categoria.id, eleccion.id));
    if (!cat) throw new ErrorDeNegocio("VALIDACION", "No se encontró esa categoría: elegí otra.");
    if (!cat.activo) await tx.update(categoria).set({ activo: true, actualizadoPor: c.usuarioId }).where(eq(categoria.id, cat.id));
    return cat.id;
  }
  const escrito = eleccion.nombre?.trim() ? eleccion.nombre : SIN_CATEGORIA.nombre;
  const base = preelegida(escrito);
  const nombre = base?.nombre ?? nombreDeCategoria(escrito);
  if (nombre.length > 80) throw new ErrorDeNegocio("VALIDACION", "El nombre de la categoría es muy largo (hasta 80 letras).");
  const [existente] = await tx
    .select({ id: categoria.id, activo: categoria.activo })
    .from(categoria)
    .where(eq(sql`lower(${categoria.nombre})`, nombre.toLowerCase()));
  if (existente) {
    if (!existente.activo) await tx.update(categoria).set({ activo: true, actualizadoPor: c.usuarioId }).where(eq(categoria.id, existente.id));
    return existente.id;
  }
  // Las nuevas van después de las demás, pero antes de "Sin categoría" (que siempre va al final).
  const [ultimo] = await tx.select({ orden: max(categoria.orden) }).from(categoria).where(lt(categoria.orden, SIN_CATEGORIA.orden));
  const valores = { nombre, grupo: base?.grupo ?? "OTRO", orden: base?.orden ?? (ultimo?.orden ?? 0) + 1 } as const;
  const [nueva] = await tx
    .insert(categoria)
    .values({ ...valores, empresaId: c.empresaId, creadoPor: c.usuarioId, actualizadoPor: c.usuarioId })
    .returning({ id: categoria.id });
  await auditar(tx, { empresaId: c.empresaId, usuarioId: c.usuarioId, accion: "CREAR", entidad: "categoria", entidadId: nueva!.id, resumen: `Alta de la categoría ${nombre}.`, datosDespues: valores });
  return nueva!.id;
}

/** Las categorías que se quedaron sin productos activos se ocultan (RN-154). */
export async function ocultarCategoriasVacias(tx: Transaccion, c: ContextoUsuario, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  const conProductos = new Set(
    (
      await tx
        .selectDistinct({ id: producto.categoriaId })
        .from(producto)
        .where(and(inArray(producto.categoriaId, [...ids]), eq(producto.activo, true)))
    ).map((f) => f.id),
  );
  const vacias = ids.filter((id) => !conProductos.has(id));
  if (vacias.length) await tx.update(categoria).set({ activo: false, actualizadoPor: c.usuarioId }).where(and(inArray(categoria.id, vacias), eq(categoria.activo, true)));
}

/**
 * Pasa un producto a otra categoría (arrastrando su tarjeta, pedido del usuario 06/10/2026): a una
 * que existe, a una nueva o preelegida por su nombre, o a "Sin categoría". La que queda vacía se
 * oculta.
 */
export async function moverProductoDeCategoria(db: BaseDatos, authUserId: string, datos: { productoId: string } & EleccionDeCategoria): Promise<{ categoria: string }> {
  return ejecutarComoUsuario(db, authUserId, "productos.editar", async (tx, c) => {
    const [p] = await tx.select({ id: producto.id, nombre: producto.nombre, categoriaId: producto.categoriaId }).from(producto).where(eq(producto.id, datos.productoId));
    if (!p) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el producto.");
    const destino = await resolverCategoria(tx, c, datos);
    const [cat] = await tx.select({ nombre: categoria.nombre }).from(categoria).where(eq(categoria.id, destino));
    if (destino === p.categoriaId) return { categoria: cat!.nombre };
    await tx.update(producto).set({ categoriaId: destino, actualizadoPor: c.usuarioId }).where(eq(producto.id, p.id));
    await auditar(tx, {
      empresaId: c.empresaId,
      usuarioId: c.usuarioId,
      accion: "MODIFICAR",
      entidad: "producto",
      entidadId: p.id,
      resumen: `${p.nombre} pasó a la categoría ${cat!.nombre}.`,
      datosAntes: { categoriaId: p.categoriaId },
      datosDespues: { categoriaId: destino },
    });
    await registrarActividad(tx, c, { accion: "MOVER", entidadTipo: "PRODUCTO", entidadId: p.id, resumen: `pasó ${p.nombre} a ${cat!.nombre}` });
    await ocultarCategoriasVacias(tx, c, [p.categoriaId]);
    return { categoria: cat!.nombre };
  });
}

async function exigirNombreLibre(tx: Transaccion, nombre: string, excluirId?: string) {
  const [repetida] = await tx
    .select({ id: categoria.id })
    .from(categoria)
    .where(and(eq(sql`lower(${categoria.nombre})`, nombre.toLowerCase()), excluirId ? ne(categoria.id, excluirId) : undefined));
  if (repetida) throw new ErrorDeNegocio("VALIDACION", `Ya existe la categoría "${nombre}".`);
}

/** Crea o modifica una categoría. */
export async function guardarCategoria(db: BaseDatos, authUserId: string, datos: z.input<typeof esquemaCategoria>): Promise<string> {
  const d = validar(esquemaCategoria, datos);
  return ejecutarComoUsuario(db, authUserId, "productos.editar", async (tx, c) => {
    await exigirNombreLibre(tx, d.nombre, d.id);
    const valores = { nombre: d.nombre, grupo: d.grupo, orden: d.orden };

    if (!d.id) {
      const [nueva] = await tx
        .insert(categoria)
        .values({ ...valores, empresaId: c.empresaId, creadoPor: c.usuarioId, actualizadoPor: c.usuarioId })
        .returning({ id: categoria.id });
      await auditar(tx, {
        empresaId: c.empresaId,
        usuarioId: c.usuarioId,
        accion: "CREAR",
        entidad: "categoria",
        entidadId: nueva!.id,
        resumen: `Alta de la categoría ${d.nombre}.`,
        datosDespues: valores,
      });
      return nueva!.id;
    }

    const [actual] = await tx.select().from(categoria).where(eq(categoria.id, d.id));
    if (!actual) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró la categoría.");
    const cambios = diferencias(actual, valores);
    if (!cambios.hayCambios) return d.id;
    await tx.update(categoria).set({ ...valores, actualizadoPor: c.usuarioId }).where(eq(categoria.id, d.id));
    await auditar(tx, {
      empresaId: c.empresaId,
      usuarioId: c.usuarioId,
      accion: "MODIFICAR",
      entidad: "categoria",
      entidadId: d.id,
      resumen: `Cambios en la categoría ${d.nombre}.`,
      datosAntes: cambios.datosAntes,
      datosDespues: cambios.datosDespues,
    });
    return d.id;
  });
}

/** Una categoría con productos activos no se desactiva: primero se mueven o desactivan. */
export async function cambiarEstadoCategoria(db: BaseDatos, authUserId: string, datos: { id: string; activo: boolean }): Promise<void> {
  await ejecutarComoUsuario(db, authUserId, "productos.editar", async (tx, c) => {
    const [actual] = await tx.select({ nombre: categoria.nombre, activo: categoria.activo }).from(categoria).where(eq(categoria.id, datos.id));
    if (!actual) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró la categoría.");
    if (actual.activo === datos.activo) return;
    if (!datos.activo) {
      const [fila] = await tx
        .select({ n: count() })
        .from(producto)
        .where(and(eq(producto.categoriaId, datos.id), eq(producto.activo, true)));
      const n = Number(fila?.n ?? 0);
      if (n > 0) {
        throw new ErrorDeNegocio("VALIDACION", `La categoría tiene ${n} producto(s) activo(s): pasalos a otra categoría o desactivalos primero.`);
      }
    }
    await tx.update(categoria).set({ activo: datos.activo, actualizadoPor: c.usuarioId }).where(eq(categoria.id, datos.id));
    await auditar(tx, {
      empresaId: c.empresaId,
      usuarioId: c.usuarioId,
      accion: "CAMBIO_ESTADO",
      entidad: "categoria",
      entidadId: datos.id,
      resumen: `${datos.activo ? "Reactivación" : "Desactivación"} de la categoría ${actual.nombre}.`,
      datosAntes: { activo: actual.activo },
      datosDespues: { activo: datos.activo },
    });
  });
}
