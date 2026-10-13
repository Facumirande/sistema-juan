import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { compra, compraItem, jornada, listaCompra, listaCompraItem, presentacion, producto, proveedor, proveedorProducto } from "@/db/esquema";
import type { BaseDatos, Transaccion } from "@/db/tipos";
import { ErrorDeNegocio } from "@/dominio/errores";
import { ejecutarComoUsuario, type ContextoUsuario } from "@/modulos/seguridad/contexto";
import { numeroObligatorio, textoOpcional, validar } from "@/modulos/validacion";

import { anularCompraEnTransaccion, registrarCompraEnTransaccion, validarCompra, type ResultadoCompra } from "./compras";
import { numeroCompra } from "./cuenta";
import { anularPagoEnTransaccion, pagosDeLasCompras } from "./pagos";
import { proveedorSinPuesto } from "./sin-puesto";

// "✓ Lo compré" en la lista de compra (29/09/2026): anota la compra de un producto de la lista en
// el puesto donde se compró, sin pasar por el formulario completo de compra. Es una compra común
// (cuenta del proveedor, precio del puesto, límite de crédito): la lista se tacha sola.
//
// Corregir lo anotado (pedido del usuario, 12/10/2026: "al cambiar el precio… se suman"): cambiar el
// precio, la cantidad o el puesto de una compra ya anotada la reemplaza —se anula la anterior y se
// registra la nueva, todo junto— en vez de sumarle otra (RN-200).

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
    /** La compra ya anotada que se corrige: se anula y esta la reemplaza (no se suma). */
    reemplazaCompraId: z.uuid().nullish(),
  })
  .refine((d) => d.ofertaId || (d.proveedorId && d.presentacionId) || (d.sinPuesto && d.presentacionId), { message: "Elegí en qué envase lo compraste." });

/** Un renglón de la lista con su día: lo que hace falta para anotar, corregir o quitar su compra. */
const renglonConSuDia = (tx: Transaccion, itemId: string) =>
  tx
    .select({ productoId: listaCompraItem.productoId, producto: producto.nombre, fecha: jornada.fecha, jornadaId: jornada.id })
    .from(listaCompraItem)
    .innerJoin(listaCompra, eq(listaCompra.id, listaCompraItem.listaCompraId))
    .innerJoin(jornada, eq(jornada.id, listaCompra.jornadaId))
    .innerJoin(producto, eq(producto.id, listaCompraItem.productoId))
    .where(eq(listaCompraItem.id, itemId));

/** Una compra con los productos que tiene (vacío si no se pide ninguna). */
const compraConSusProductos = (tx: Transaccion, compraId: string | null | undefined) =>
  tx
    .select({
      id: compra.id,
      numero: compra.numero,
      jornadaId: compra.jornadaId,
      estado: compra.estado,
      productos: sql<string>`(select coalesce(string_agg(distinct i.producto_id::text, ','), '') from ${compraItem} i where i.compra_id = "compra"."id")`,
    })
    .from(compra)
    .where(compraId ? eq(compra.id, compraId) : sql`false`);

/**
 * Revisa que una compra se pueda corregir o quitar desde un renglón de la lista: es del mismo día,
 * tiene ese producto y ningún otro (la que tiene varios se maneja desde su ficha, para no llevarse
 * puestos los demás).
 */
function compraDelRenglon<K extends { id: string; numero: number; jornadaId: string | null; productos: string }>(item: { productoId: string; producto: string; jornadaId: string }, k: K | undefined, para: "corregirla" | "quitarla"): K {
  const suyos = k ? k.productos.split(",").filter(Boolean) : [];
  if (!k || k.jornadaId !== item.jornadaId || !suyos.includes(item.productoId)) throw new ErrorDeNegocio("NO_ENCONTRADO", `Esa compra ya no figura en ${item.producto}: recargá la página.`);
  if (suyos.length > 1) {
    throw new ErrorDeNegocio("VALIDACION", `La compra ${numeroCompra(k.numero)} también tiene otros productos: para ${para}, entrá a su ficha.`, {
      enlace: { href: `/compras/${k.id}`, texto: `Ver la compra ${numeroCompra(k.numero)}` },
    });
  }
  return k;
}

/** Anula compras de la lista con lo que se les pagó solo a ellas; un pago que cubre otras deudas queda a favor. */
async function anularConSusPagos(tx: Transaccion, c: ContextoUsuario, compraIds: readonly string[], motivo: string): Promise<void> {
  const { exclusivos } = await pagosDeLasCompras(tx, compraIds);
  for (const p of exclusivos) await anularPagoEnTransaccion(tx, c, p, motivo);
  for (const id of compraIds) await anularCompraEnTransaccion(tx, c, { compraId: id, motivo, devolvioDinero: true });
}

export async function comprarDeLaLista(db: BaseDatos, authUserId: string, datos: z.input<typeof esquema>): Promise<ResultadoCompra & { producto: string; proveedor: string }> {
  const d = validar(esquema, datos);
  return ejecutarComoUsuario(db, authUserId, "compras.registrar", async (tx, c) => {
    const nada = sql`false`;
    // El renglón, la oferta elegida (o el envase y el puesto) y la compra que se corrige salen juntos, en una sola ida a la base.
    const [[item], [o], [pr], [prov], [anterior], [yaGuardada]] = await Promise.all([
      renglonConSuDia(tx, d.itemId),
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
      compraConSusProductos(tx, d.reemplazaCompraId),
      // El mismo toque mandado dos veces: la corrección ya quedó hecha y no hay que anular nada más.
      tx
        .select({ id: compra.id })
        .from(compra)
        .where(d.reemplazaCompraId && d.claveIdempotencia ? eq(compra.claveIdempotencia, d.claveIdempotencia) : nada),
    ]);
    if (!item) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró ese producto en la lista: recargá la página.");
    let destino: { proveedorId: string; presentacionId: string; proveedor: string };
    if (d.ofertaId) {
      if (!o || o.productoId !== item.productoId) throw new ErrorDeNegocio("VALIDACION", "Ese puesto no vende este producto: elegí otro.");
      destino = { proveedorId: o.proveedorId, presentacionId: o.presentacionId, proveedor: o.proveedor };
    } else {
      if (!pr || pr.productoId !== item.productoId) throw new ErrorDeNegocio("VALIDACION", `Elegí un envase de ${item.producto}.`);
      if (d.sinPuesto) {
        const generico = await proveedorSinPuesto(tx, c);
        destino = { proveedorId: generico.id, presentacionId: d.presentacionId!, proveedor: generico.nombre };
      } else {
        if (!prov) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el puesto.");
        destino = { proveedorId: d.proveedorId!, presentacionId: d.presentacionId!, proveedor: prov.nombre };
      }
    }
    // Corregir: la compra anterior se anula (con lo que se le pagó solo a ella) y la nueva la reemplaza.
    // Si después algo no deja registrar la nueva (un precio para confirmar, el límite del puesto), no
    // se guarda nada: la anterior queda como estaba.
    if (d.reemplazaCompraId && !yaGuardada) {
      const vieja = compraDelRenglon(item, anterior, "corregirla");
      if (vieja.estado === "REGISTRADA") {
        c.permisos.exigir("compras.anular");
        await anularConSusPagos(tx, c, [vieja.id], `Se corrigió la compra de ${item.producto} en la lista de compras`);
      }
    }
    const r = await registrarCompraEnTransaccion(
      tx,
      c,
      validarCompra({
        fecha: item.fecha,
        proveedorId: destino.proveedorId,
        // Sin puesto, siempre en efectivo y pagado en el momento.
        condicion: d.pagado || d.sinPuesto ? "CONTADO" : "CREDITO",
        medioPago: d.sinPuesto ? "EFECTIVO" : d.medioPago,
        items: [{ productoId: item.productoId, presentacionId: destino.presentacionId, cantidad: d.cantidad, precio: d.precio }],
        confirmarVariacion: d.confirmarVariacion,
        motivoExceso: d.motivoExceso,
        claveIdempotencia: d.claveIdempotencia,
      }),
    );
    return { ...r, producto: item.producto, proveedor: destino.proveedor };
  });
}

/**
 * Quitar una compra anotada de un producto de la lista (RN-200): la que se anotó de más o dos veces.
 * Se anula con lo que se le pagó solo a ella y el renglón vuelve a contar lo que queda. Lo pide la
 * pantalla después de que la persona confirma.
 */
export async function quitarCompraDeLaLista(db: BaseDatos, authUserId: string, datos: { itemId: string; compraId: string }): Promise<{ producto: string; numero: string }> {
  const d = validar(z.object({ itemId: z.uuid("Ese producto ya no está en la lista: recargá la página."), compraId: z.uuid("Esa compra ya no figura: recargá la página.") }), datos);
  return ejecutarComoUsuario(db, authUserId, "compras.anular", async (tx, c) => {
    const [[item], [k]] = await Promise.all([renglonConSuDia(tx, d.itemId), compraConSusProductos(tx, d.compraId)]);
    if (!item) throw new ErrorDeNegocio("NO_ENCONTRADO", "Ese producto ya no está en la lista de compras: recargá la página.");
    const suya = compraDelRenglon(item, k, "quitarla");
    if (suya.estado === "REGISTRADA") await anularConSusPagos(tx, c, [suya.id], `Se quitó la compra de ${item.producto} en la lista de compras`);
    return { producto: item.producto, numero: numeroCompra(suya.numero) };
  });
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
    await anularConSusPagos(
      tx,
      c,
      compras.map((k) => k.id),
      `Se destildó ${item.producto} en la lista de compras`,
    );
    return { producto: item.producto, anuladas: compras.length };
  });
}
