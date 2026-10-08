import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { jornada, listaCompra, listaCompraItem, presentacion, producto, proveedor, proveedorProducto } from "@/db/esquema";
import type { BaseDatos } from "@/db/tipos";
import { ErrorDeNegocio } from "@/dominio/errores";
import { ejecutarComoUsuario } from "@/modulos/seguridad/contexto";
import { numeroObligatorio, textoOpcional, validar } from "@/modulos/validacion";

import { registrarCompra, type ResultadoCompra } from "./compras";

// "✓ Lo compré" en la lista de compra (29/09/2026): anota la compra de un producto de la lista en
// el puesto donde se compró, sin pasar por el formulario completo de compra. Es una compra común
// (cuenta del proveedor, precio del puesto, límite de crédito): la lista se tacha sola.

const esquema = z
  .object({
    itemId: z.uuid(),
    /** El puesto y el envase: una oferta cargada, o un proveedor y un envase de compra. */
    ofertaId: z.uuid().nullish(),
    proveedorId: z.uuid().nullish(),
    presentacionId: z.uuid().nullish(),
    cantidad: numeroObligatorio("Escribí cuántos bultos compraste."),
    precio: numeroObligatorio("Escribí cuánto pagaste cada bulto."),
    /** Pagado en el momento (contado) o a cuenta (crédito). */
    pagado: z.boolean(),
    medioPago: z.enum(["EFECTIVO", "TRANSFERENCIA", "CHEQUE", "OTRO"]).default("EFECTIVO"),
    confirmarVariacion: z.boolean().default(false),
    motivoExceso: textoOpcional(300),
    claveIdempotencia: z.uuid().nullish(),
  })
  .refine((d) => d.ofertaId || (d.proveedorId && d.presentacionId), { message: "Elegí en qué puesto lo compraste." });

export async function comprarDeLaLista(db: BaseDatos, authUserId: string, datos: z.input<typeof esquema>): Promise<ResultadoCompra & { producto: string; proveedor: string }> {
  const d = validar(esquema, datos);
  const destino = await ejecutarComoUsuario(db, authUserId, "compras.registrar", async (tx) => {
    const nada = sql`false`;
    // El renglón, la oferta elegida (o el envase y el puesto) salen juntos, en una sola ida a la base.
    const [[item], [o], [pr], [prov]] = await Promise.all([
      tx
        .select({ productoId: listaCompraItem.productoId, producto: producto.nombre, fecha: jornada.fecha })
        .from(listaCompraItem)
        .innerJoin(listaCompra, eq(listaCompra.id, listaCompraItem.listaCompraId))
        .innerJoin(jornada, eq(jornada.id, listaCompra.jornadaId))
        .innerJoin(producto, eq(producto.id, listaCompraItem.productoId))
        .where(eq(listaCompraItem.id, d.itemId)),
      tx
        .select({ proveedorId: proveedorProducto.proveedorId, presentacionId: proveedorProducto.presentacionId, productoId: proveedorProducto.productoId, proveedor: proveedor.nombre })
        .from(proveedorProducto)
        .innerJoin(proveedor, eq(proveedor.id, proveedorProducto.proveedorId))
        .where(d.ofertaId ? eq(proveedorProducto.id, d.ofertaId) : nada),
      tx
        .select({ id: presentacion.id, productoId: presentacion.productoId })
        .from(presentacion)
        .where(!d.ofertaId && d.presentacionId ? eq(presentacion.id, d.presentacionId) : nada),
      tx
        .select({ nombre: proveedor.nombre })
        .from(proveedor)
        .where(!d.ofertaId && d.proveedorId ? eq(proveedor.id, d.proveedorId) : nada),
    ]);
    if (!item) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró ese producto en la lista: recargá la página.");
    if (d.ofertaId) {
      if (!o || o.productoId !== item.productoId) throw new ErrorDeNegocio("VALIDACION", "Ese puesto no vende este producto: elegí otro.");
      return { ...item, proveedorId: o.proveedorId, presentacionId: o.presentacionId, proveedor: o.proveedor };
    }
    if (!pr || pr.productoId !== item.productoId) throw new ErrorDeNegocio("VALIDACION", `Elegí un envase de ${item.producto}.`);
    if (!prov) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el puesto.");
    return { ...item, proveedorId: d.proveedorId!, presentacionId: d.presentacionId!, proveedor: prov.nombre };
  });
  const r = await registrarCompra(db, authUserId, {
    fecha: destino.fecha,
    proveedorId: destino.proveedorId,
    condicion: d.pagado ? "CONTADO" : "CREDITO",
    medioPago: d.medioPago,
    items: [{ productoId: destino.productoId, presentacionId: destino.presentacionId, cantidad: d.cantidad, precio: d.precio }],
    confirmarVariacion: d.confirmarVariacion,
    motivoExceso: d.motivoExceso,
    claveIdempotencia: d.claveIdempotencia,
  });
  return { ...r, producto: destino.producto, proveedor: destino.proveedor };
}
