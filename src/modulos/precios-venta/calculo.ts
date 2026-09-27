import { and, eq, gte, inArray, isNull, lte, or, sum } from "drizzle-orm";

import { categoria, cliente, compra, compraItem, empresa, jornada, presentacion, producto, proveedor, proveedorProducto, reglaPrecio } from "@/db/esquema";
import type { Transaccion } from "@/db/tipos";
import { ErrorDeNegocio } from "@/dominio/errores";
import { diasEntre, hoyEnEmpresa, type FechaISO } from "@/dominio/fechas/fechas";
import { costoRealPonderado } from "@/dominio/compras/credito";
import { calcularPrecioVenta, costoReferencia, type PrecioVenta, type ReglaAplicable } from "@/dominio/precios/venta";

// Junta los datos que necesita `calcularPrecioVenta` (05 §5.8) para varias líneas de un cliente
// en una fecha, con pocas consultas. No escribe nada.

export interface LineaAPrecio {
  productoId: string;
  /** Nulo = se vende en unidad base. */
  presentacionId: string | null;
}

/**
 * Costo real por producto (05 §4.2): el de la jornada de esa fecha si ya hay compras, y el de la
 * última jornada anterior con compras (respaldo y estrategia ULTIMO_COSTO_REAL).
 */
export async function costosReales(tx: Transaccion, productoIds: readonly string[], fecha: FechaISO) {
  const filas = productoIds.length
    ? await tx
        .select({
          productoId: compraItem.productoId,
          fecha: jornada.fecha,
          cantidadBase: sum(compraItem.cantidadBase).mapWith(String),
          subtotal: sum(compraItem.subtotal).mapWith(String),
        })
        .from(compraItem)
        .innerJoin(compra, and(eq(compra.id, compraItem.compraId), eq(compra.estado, "REGISTRADA")))
        .innerJoin(jornada, eq(jornada.id, compra.jornadaId))
        .where(and(inArray(compraItem.productoId, [...productoIds]), lte(jornada.fecha, fecha)))
        .groupBy(compraItem.productoId, jornada.fecha)
    : [];
  const resultado = new Map<string, { delDia: string | null; ultimo: string | null }>();
  for (const id of productoIds) {
    const propias = filas.filter((f) => f.productoId === id);
    const delDia = propias.find((f) => f.fecha === fecha);
    const anterior = propias.filter((f) => f.fecha < fecha).sort((a, b) => (a.fecha < b.fecha ? 1 : -1))[0];
    const costo = (f: (typeof filas)[number] | undefined) => (f ? (costoRealPonderado([f])?.toString() ?? null) : null);
    resultado.set(id, { delDia: costo(delDia), ultimo: costo(anterior) });
  }
  return resultado;
}

/**
 * Precio de venta estimado de cada línea para un cliente en la fecha de la jornada (RN-078).
 * Con compras del producto en la jornada, el costo es el real (RN-080).
 */
export async function calcularPrecios(tx: Transaccion, p: { clienteId: string; fecha: FechaISO; lineas: readonly LineaAPrecio[] }): Promise<PrecioVenta[]> {
  if (p.lineas.length === 0) return [];
  const [e] = await tx.select().from(empresa);
  if (!e) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró la configuración de la empresa.");
  const [cli] = await tx.select({ recargo: cliente.recargoDefault }).from(cliente).where(eq(cliente.id, p.clienteId));
  if (!cli) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el cliente.");

  const productoIds = [...new Set(p.lineas.map((l) => l.productoId))];
  const productos = await tx
    .select({
      id: producto.id,
      categoriaId: producto.categoriaId,
      recargo: producto.recargoDefault,
      alicuotaIva: producto.alicuotaIva,
      preferidoId: producto.proveedorPreferidoId,
      recargoCategoria: categoria.recargoDefault,
    })
    .from(producto)
    .innerJoin(categoria, eq(categoria.id, producto.categoriaId))
    .where(inArray(producto.id, productoIds));
  const presentacionIds = [...new Set(p.lineas.map((l) => l.presentacionId).filter((x): x is string => x !== null))];
  const factores = presentacionIds.length
    ? await tx.select({ id: presentacion.id, factor: presentacion.factorABase }).from(presentacion).where(inArray(presentacion.id, presentacionIds))
    : [];
  const ofertas = await tx
    .select({
      productoId: proveedorProducto.productoId,
      proveedorId: proveedorProducto.proveedorId,
      costoBase: proveedorProducto.costoBase,
      disponible: proveedorProducto.disponible,
      fechaActualizacion: proveedorProducto.fechaActualizacion,
    })
    .from(proveedorProducto)
    .innerJoin(proveedor, and(eq(proveedor.id, proveedorProducto.proveedorId), eq(proveedor.activo, true)))
    .where(and(inArray(proveedorProducto.productoId, productoIds), eq(proveedorProducto.activo, true)));
  const categoriaIds = [...new Set(productos.map((x) => x.categoriaId))];
  const reglas = await tx
    .select()
    .from(reglaPrecio)
    .where(
      and(
        eq(reglaPrecio.clienteId, p.clienteId),
        eq(reglaPrecio.activo, true),
        lte(reglaPrecio.vigenteDesde, p.fecha),
        or(isNull(reglaPrecio.vigenteHasta), gte(reglaPrecio.vigenteHasta, p.fecha)),
        or(inArray(reglaPrecio.productoId, productoIds), inArray(reglaPrecio.categoriaId, categoriaIds)),
      ),
    );

  const hoy = hoyEnEmpresa(new Date(), e.zonaHoraria);
  const reales = await costosReales(tx, productoIds, p.fecha);
  const aplicable = (r: (typeof reglas)[number] | undefined): ReglaAplicable | null =>
    r ? { id: r.id, valor: r.valor, vigenteHasta: r.vigenteHasta, referencia: r.referencia } : null;

  return p.lineas.map((linea) => {
    const prod = productos.find((x) => x.id === linea.productoId);
    if (!prod) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el producto.");
    const factor = linea.presentacionId ? factores.find((f) => f.id === linea.presentacionId)?.factor : "1";
    if (!factor) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró la presentación.");
    const costo = costoReferencia({
      estrategia: e.estrategiaCosto,
      costoRealJornada: reales.get(prod.id)?.delDia ?? null,
      ofertas: ofertas
        .filter((o) => o.productoId === prod.id)
        .map((o) => ({
          proveedorId: o.proveedorId,
          costoBase: o.costoBase,
          disponible: o.disponible,
          desactualizada: diasEntre(hoyEnEmpresa(o.fechaActualizacion, e.zonaHoraria), hoy) > e.diasAlertaPrecioDesactualizado,
        })),
      proveedorPreferidoId: prod.preferidoId,
      ultimoCostoReal: reales.get(prod.id)?.ultimo ?? null,
    });
    return calcularPrecioVenta({
      costo,
      reglas: {
        precioFijo: aplicable(reglas.find((r) => r.tipo === "PRECIO_FIJO" && r.productoId === prod.id)),
        recargoProducto: aplicable(reglas.find((r) => r.tipo === "RECARGO" && r.productoId === prod.id)),
        recargoCategoria: aplicable(reglas.find((r) => r.tipo === "RECARGO" && r.categoriaId === prod.categoriaId)),
      },
      recargos: { cliente: cli.recargo, producto: prod.recargo, categoria: prod.recargoCategoria, global: e.recargoGlobal },
      factor,
      redondeo: { multiplo: e.redondeoMultiplo, modo: e.redondeoModo },
      preciosIncluyenIva: e.preciosIncluyenIva,
      alicuotaIva: prod.alicuotaIva,
      margenMinimoPct: e.margenMinimoPct,
      fecha: p.fecha,
    });
  });
}
