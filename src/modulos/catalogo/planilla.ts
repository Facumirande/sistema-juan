import { asc, eq } from "drizzle-orm";

import { categoria, presentacion, producto } from "@/db/esquema";
import type { BaseDatos } from "@/db/tipos";
import { COLUMNAS_PLANILLA } from "@/dominio/catalogo/importacion";
import { UNIDADES_EN_PALABRAS, type UnidadDeVenta } from "@/dominio/catalogo/productos";
import { dec } from "@/dominio/dinero/decimal";
import type { Hoja } from "@/lib/planilla";
import { ejecutarComoUsuario } from "@/modulos/seguridad/contexto";

/**
 * La lista de productos para bajarla a Excel (07/10/2026): una fila por producto, con las mismas
 * columnas que la planilla modelo (más si está activo). La ganancia sale solo para quien puede ver
 * márgenes. La carga de productos desde una planilla está en `importacion.ts`.
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
        ganancia: producto.recargoDefault,
        activo: producto.activo,
      })
      .from(producto)
      .innerJoin(categoria, eq(categoria.id, producto.categoriaId))
      .leftJoin(presentacion, eq(presentacion.id, producto.presentacionCompraDefaultId))
      .orderBy(asc(categoria.orden), asc(categoria.nombre), asc(producto.nombre));
    return {
      nombre: "Productos",
      columnas: [...COLUMNAS_PLANILLA, "Estado"],
      filas: filas.map((f) => [
        f.nombre,
        f.categoria,
        UNIDADES_EN_PALABRAS[f.unidad as UnidadDeVenta] ?? f.unidad,
        f.envase,
        f.envase && f.trae ? { numero: dec(f.trae).toString() } : null,
        verGanancia && f.ganancia !== null ? { numero: dec(f.ganancia).toString() } : null,
        f.codigo,
        f.activo ? "Activo" : "Dado de baja",
      ]),
    };
  });
}
