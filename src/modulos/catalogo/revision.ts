import { and, asc, eq, isNotNull } from "drizzle-orm";

import { categoria, cliente, empresa, producto, proveedorProducto, reglaPrecio } from "@/db/esquema";
import type { Transaccion } from "@/db/tipos";
import { problemasDeProducto } from "@/dominio/catalogo/revision";
import { dec } from "@/dominio/dinero/decimal";
import type { FechaISO } from "@/dominio/fechas/fechas";
import type { ContextoUsuario } from "@/modulos/seguridad/contexto";

export interface ProductoParaRevisar {
  productoId: string;
  producto: string;
  problemas: string[];
}

/**
 * Los productos activos con algo esencial para arreglar (sin precio de compra, o vendidos por
 * debajo de lo que cuestan), para avisarlo en la campanita. Lo que compara contra el costo solo lo
 * ve quien puede ver costos y márgenes.
 */
export async function productosParaRevisar(tx: Transaccion, c: ContextoUsuario, hoy: FechaISO): Promise<ProductoParaRevisar[]> {
  if (!c.permisos.tiene("productos.ver")) return [];
  const verCostos = c.permisos.tiene("precios.ver_costos") && c.permisos.tiene("precios.ver_margenes");
  const [productos, ofertas, reglas, [e]] = await Promise.all([
    tx
      .select({ id: producto.id, nombre: producto.nombre, recargo: producto.recargoDefault, recargoCategoria: categoria.recargoDefault })
      .from(producto)
      .innerJoin(categoria, eq(categoria.id, producto.categoriaId))
      .where(eq(producto.activo, true))
      .orderBy(asc(producto.nombre)),
    tx.select({ productoId: proveedorProducto.productoId, costo: proveedorProducto.costoBase }).from(proveedorProducto).where(eq(proveedorProducto.activo, true)),
    verCostos
      ? tx
          .select({ productoId: reglaPrecio.productoId, tipo: reglaPrecio.tipo, valor: reglaPrecio.valor, desde: reglaPrecio.vigenteDesde, hasta: reglaPrecio.vigenteHasta, cliente: cliente.nombre })
          .from(reglaPrecio)
          .innerJoin(cliente, and(eq(cliente.id, reglaPrecio.clienteId), eq(cliente.activo, true)))
          .where(and(eq(reglaPrecio.activo, true), isNotNull(reglaPrecio.productoId)))
      : Promise.resolve([]),
    tx.select({ recargo: empresa.recargoGlobal }).from(empresa),
  ]);
  const vigentes = reglas.filter((r) => r.desde <= hoy && (r.hasta === null || r.hasta >= hoy));
  return productos
    .map((p) => {
      const suyas = ofertas.filter((o) => o.productoId === p.id);
      const costo = suyas.length ? suyas.reduce((menor, o) => (dec(o.costo).lt(menor) ? o.costo : menor), suyas[0]!.costo) : null;
      const reglasSuyas = vigentes.filter((r) => r.productoId === p.id);
      return {
        productoId: p.id,
        producto: p.nombre,
        problemas: problemasDeProducto({
          ofertas: suyas.length,
          costo,
          ganancia: verCostos ? (p.recargo ?? p.recargoCategoria ?? e?.recargo ?? "0") : "0",
          preciosFijos: reglasSuyas.filter((r) => r.tipo === "PRECIO_FIJO").map((r) => ({ cliente: r.cliente, precio: r.valor })),
          gananciasDeClientes: reglasSuyas.filter((r) => r.tipo === "RECARGO").map((r) => ({ cliente: r.cliente, ganancia: r.valor })),
        }),
      };
    })
    .filter((p) => p.problemas.length > 0);
}
