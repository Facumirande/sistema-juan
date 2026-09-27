import { and, asc, count, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { auditar, diferencias } from "@/db/auditoria";
import { categoria, grupoProducto, producto } from "@/db/esquema";
import type { BaseDatos, Transaccion } from "@/db/tipos";
import { ErrorDeNegocio } from "@/dominio/errores";
import { ejecutarComoUsuario } from "@/modulos/seguridad/contexto";
import { enteroOpcional, textoObligatorio, validar } from "@/modulos/validacion";

// P-12 Categorías (08 §5.2). El recargo de la categoría se edita con los precios de venta (iteración 3).

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

export async function listarCategorias(db: BaseDatos, authUserId: string): Promise<CategoriaListada[]> {
  return ejecutarComoUsuario(db, authUserId, "productos.ver", async (tx) => {
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
