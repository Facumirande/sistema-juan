import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { compra, compraItem, jornada, listaCompra, listaCompraItem, presentacion, producto, proveedor, proveedorProducto } from "@/db/esquema";
import type { BaseDatos } from "@/db/tipos";
import { ErrorDeNegocio } from "@/dominio/errores";
import { ejecutarComoUsuario } from "@/modulos/seguridad/contexto";
import { numeroObligatorio, textoOpcional, validar } from "@/modulos/validacion";

import { anularCompraEnTransaccion, registrarCompra, type ResultadoCompra } from "./compras";
import { numeroCompra } from "./cuenta";
import { anularPagoEnTransaccion, pagosDeLasCompras } from "./pagos";
import { proveedorSinPuesto } from "./sin-puesto";

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
    /** Sin decir el puesto: va al puesto genérico y queda pagado (efectivo). */
    sinPuesto: z.boolean().default(false),
    /** Pagado en el momento (contado) o a cuenta (crédito). */
    pagado: z.boolean(),
    medioPago: z.enum(["EFECTIVO", "TRANSFERENCIA", "CHEQUE", "OTRO"]).default("EFECTIVO"),
    confirmarVariacion: z.boolean().default(false),
    motivoExceso: textoOpcional(300),
    claveIdempotencia: z.uuid().nullish(),
  })
  .refine((d) => d.ofertaId || (d.proveedorId && d.presentacionId) || (d.sinPuesto && d.presentacionId), { message: "Elegí en qué envase lo compraste." });

export async function comprarDeLaLista(db: BaseDatos, authUserId: string, datos: z.input<typeof esquema>): Promise<ResultadoCompra & { producto: string; proveedor: string }> {
  const d = validar(esquema, datos);
  const destino = await ejecutarComoUsuario(db, authUserId, "compras.registrar", async (tx, c) => {
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
    if (d.sinPuesto) {
      const generico = await proveedorSinPuesto(tx, c);
      return { ...item, proveedorId: generico.id, presentacionId: d.presentacionId!, proveedor: generico.nombre };
    }
    if (!prov) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el puesto.");
    return { ...item, proveedorId: d.proveedorId!, presentacionId: d.presentacionId!, proveedor: prov.nombre };
  });
  const r = await registrarCompra(db, authUserId, {
    fecha: destino.fecha,
    proveedorId: destino.proveedorId,
    // Sin puesto, siempre en efectivo y pagado en el momento.
    condicion: d.pagado || d.sinPuesto ? "CONTADO" : "CREDITO",
    medioPago: d.sinPuesto ? "EFECTIVO" : d.medioPago,
    items: [{ productoId: destino.productoId, presentacionId: destino.presentacionId, cantidad: d.cantidad, precio: d.precio }],
    confirmarVariacion: d.confirmarVariacion,
    motivoExceso: d.motivoExceso,
    claveIdempotencia: d.claveIdempotencia,
  });
  return { ...r, producto: destino.producto, proveedor: destino.proveedor };
}

/**
 * Destildar un producto que ya tiene la compra anotada (pedido del usuario, 10/10/2026: "permitir
 * destildar la lista de compras"). Se anulan las compras de ese producto en el día, con lo que se le
 * pagó en el momento (o con el interruptor Pagado), y el renglón vuelve a quedar por comprar
 * (RN-186). Una compra que también tiene otros productos no se toca desde acá: se explica dónde
 * anularla. Lo pide la pantalla después de que la persona confirma.
 */
export async function destildarConCompra(db: BaseDatos, authUserId: string, datos: { itemId: string }): Promise<{ producto: string; anuladas: number }> {
  const d = validar(z.object({ itemId: z.uuid("Ese producto ya no está en la lista: recargá la página.") }), datos);
  return ejecutarComoUsuario(db, authUserId, "compras.anular", async (tx, c) => {
    const [item] = await tx
      .select({ productoId: listaCompraItem.productoId, jornadaId: listaCompra.jornadaId, producto: producto.nombre })
      .from(listaCompraItem)
      .innerJoin(listaCompra, eq(listaCompra.id, listaCompraItem.listaCompraId))
      .innerJoin(producto, eq(producto.id, listaCompraItem.productoId))
      .where(eq(listaCompraItem.id, d.itemId));
    if (!item) throw new ErrorDeNegocio("NO_ENCONTRADO", "Ese producto ya no está en la lista de compras: recargá la página.");
    // Las compras del día con este producto, y cuántos productos distintos tiene cada una.
    const compras = await tx
      .select({ id: compra.id, numero: compra.numero, productos: sql<number>`(select count(distinct i.producto_id)::int from ${compraItem} i where i.compra_id = "compra"."id")` })
      .from(compra)
      .where(
        and(
          eq(compra.jornadaId, item.jornadaId),
          eq(compra.estado, "REGISTRADA"),
          inArray(compra.id, tx.select({ id: compraItem.compraId }).from(compraItem).where(eq(compraItem.productoId, item.productoId))),
        ),
      );
    if (compras.length === 0) return { producto: item.producto, anuladas: 0 };
    const conOtros = compras.find((k) => Number(k.productos) > 1);
    if (conOtros) {
      throw new ErrorDeNegocio("VALIDACION", `La compra ${numeroCompra(conOtros.numero)} también tiene otros productos: para destildar ${item.producto}, anulala desde su ficha.`, {
        enlace: { href: `/compras/${conOtros.id}`, texto: `Ver la compra ${numeroCompra(conOtros.numero)}` },
      });
    }
    const motivo = `Se destildó ${item.producto} en la lista de compras`;
    // Lo que se le pagó solo por estas compras se anula con ellas; un pago que cubre otras deudas queda a favor.
    const { exclusivos } = await pagosDeLasCompras(
      tx,
      compras.map((k) => k.id),
    );
    for (const p of exclusivos) await anularPagoEnTransaccion(tx, c, p, motivo);
    for (const k of compras) await anularCompraEnTransaccion(tx, c, { compraId: k.id, motivo, devolvioDinero: true });
    return { producto: item.producto, anuladas: compras.length };
  });
}
