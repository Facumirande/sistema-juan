import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";

import { auditar } from "@/db/auditoria";
import {
  categoria,
  empresa,
  historialPrecioCompra,
  origenPrecioCompra,
  presentacion,
  producto,
  proveedor,
  proveedorProducto,
  usuario,
} from "@/db/esquema";
import type { BaseDatos, Transaccion } from "@/db/tipos";
import { aNumeric, dec } from "@/dominio/dinero/decimal";
import { formatearMoneda, formatearPorcentaje } from "@/dominio/dinero/formato";
import { ErrorDeNegocio } from "@/dominio/errores";
import { hoyEnEmpresa } from "@/dominio/fechas/fechas";
import { compararOfertas, evaluarCambioPrecioCompra } from "@/dominio/precios/compra";
import { recalcularPedidosPendientes } from "@/modulos/pedidos/pedidos";
import { registrarActividad } from "@/modulos/colaboracion/registro";
import { ejecutarComoUsuario, type ContextoUsuario } from "@/modulos/seguridad/contexto";
import { numeroObligatorio, numeroOpcional, textoOpcional, validar } from "@/modulos/validacion";

// Precios de compra (05 §2, 08 §5.5): lista general P-25, actualización rápida P-26, historial
// P-29. Reglas RN-067 a RN-075. Los costos son clase C: se ven con precios.ver_costos.

export type OrigenPrecioCompra = (typeof origenPrecioCompra.enumValues)[number];

export interface OfertaListada {
  id: string;
  productoId: string;
  producto: string;
  codigoProducto: string;
  categoria: string;
  unidadBase: string;
  proveedorId: string;
  proveedor: string;
  ubicacionMercado: string | null;
  presentacionId: string;
  presentacion: string;
  factorABase: string;
  precioVigente: string;
  costoBase: string;
  precioAnterior: string | null;
  /** Variación del último cambio, 2 decimales. */
  variacionPct: string | null;
  fechaActualizacion: Date;
  fuenteActualizacion: OrigenPrecioCompra;
  actualizadoPor: string | null;
  disponible: boolean;
  esPreferido: boolean;
  pctSobreMejor: string | null;
  esMejor: boolean;
  ranking: number;
  diasSinActualizar: number;
  desactualizada: boolean;
}

export interface ParametrosPreciosCompra {
  diasAlertaDesactualizado: number;
  variacionBruscaPct: string;
}

export interface FiltrosOfertas {
  texto?: string;
  categoriaId?: string;
  proveedorId?: string;
  productoId?: string;
  soloDesactualizadas?: boolean;
  soloMejor?: boolean;
}

export interface MovimientoHistorial {
  id: string;
  vigenteDesde: Date;
  vigenteHasta: Date | null;
  precio: string;
  costoBase: string;
  variacionPct: string | null;
  origen: OrigenPrecioCompra;
  referencia: string | null;
  observacion: string | null;
  usuario: string | null;
}

async function parametros(tx: Transaccion): Promise<ParametrosPreciosCompra & { zonaHoraria: string }> {
  const [e] = await tx
    .select({ dias: empresa.diasAlertaPrecioDesactualizado, variacion: empresa.variacionBruscaPct, zonaHoraria: empresa.zonaHoraria })
    .from(empresa);
  if (!e) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró la configuración de la empresa.");
  return { diasAlertaDesactualizado: e.dias, variacionBruscaPct: e.variacion, zonaHoraria: e.zonaHoraria };
}

/**
 * Ofertas activas (de productos y proveedores activos) con la comparación entre proveedores.
 * La comparación se calcula siempre con todas las ofertas de cada producto, aunque se filtre por proveedor.
 */
async function consultarOfertas(tx: Transaccion, filtros: FiltrosOfertas): Promise<OfertaListada[]> {
  const p = await parametros(tx);
  const texto = filtros.texto?.trim();
  const filas = await tx
    .select({
      oferta: proveedorProducto,
      producto: producto.nombre,
      codigoProducto: producto.codigo,
      unidadBase: producto.unidadBase,
      preferidoId: producto.proveedorPreferidoId,
      categoria: categoria.nombre,
      proveedor: proveedor.nombre,
      ubicacionMercado: proveedor.ubicacionMercado,
      presentacion: presentacion.nombre,
      factorABase: presentacion.factorABase,
      actualizadoPor: usuario.nombre,
    })
    .from(proveedorProducto)
    .innerJoin(producto, and(eq(producto.id, proveedorProducto.productoId), eq(producto.activo, true)))
    .innerJoin(categoria, eq(categoria.id, producto.categoriaId))
    .innerJoin(proveedor, and(eq(proveedor.id, proveedorProducto.proveedorId), eq(proveedor.activo, true)))
    .innerJoin(presentacion, eq(presentacion.id, proveedorProducto.presentacionId))
    .leftJoin(usuario, eq(usuario.id, proveedorProducto.actualizadoPor))
    .where(
      and(
        eq(proveedorProducto.activo, true),
        filtros.productoId ? eq(proveedorProducto.productoId, filtros.productoId) : undefined,
        filtros.categoriaId ? eq(producto.categoriaId, filtros.categoriaId) : undefined,
        texto ? or(ilike(producto.nombre, `%${texto}%`), ilike(producto.codigo, `%${texto}%`)) : undefined,
      ),
    )
    .orderBy(asc(categoria.orden), asc(categoria.nombre), asc(producto.nombre), asc(proveedorProducto.costoBase));

  const hoy = hoyEnEmpresa(new Date(), p.zonaHoraria);
  const comparacion = compararOfertas(
    filas.map((f) => ({
      id: f.oferta.id,
      productoId: f.oferta.productoId,
      costoBase: f.oferta.costoBase,
      disponible: f.oferta.disponible,
      fechaActualizacion: hoyEnEmpresa(f.oferta.fechaActualizacion, p.zonaHoraria),
    })),
    hoy,
    p.diasAlertaDesactualizado,
  );

  return filas
    .map((f) => {
      const cmp = comparacion.get(f.oferta.id)!;
      const o = f.oferta;
      return {
        id: o.id,
        productoId: o.productoId,
        producto: f.producto,
        codigoProducto: f.codigoProducto,
        categoria: f.categoria,
        unidadBase: f.unidadBase,
        proveedorId: o.proveedorId,
        proveedor: f.proveedor,
        ubicacionMercado: f.ubicacionMercado,
        presentacionId: o.presentacionId,
        presentacion: f.presentacion,
        factorABase: f.factorABase,
        precioVigente: o.precioVigente,
        costoBase: o.costoBase,
        precioAnterior: o.precioAnterior,
        variacionPct:
          o.precioAnterior && !dec(o.precioAnterior).isZero()
            ? dec(o.precioVigente).minus(o.precioAnterior).div(o.precioAnterior).times(100).toFixed(2)
            : null,
        fechaActualizacion: o.fechaActualizacion,
        fuenteActualizacion: o.fuenteActualizacion,
        actualizadoPor: f.actualizadoPor,
        disponible: o.disponible,
        esPreferido: f.preferidoId === o.proveedorId,
        pctSobreMejor: cmp.pctSobreMejor?.toFixed(2) ?? null,
        esMejor: cmp.esMejor,
        ranking: cmp.ranking,
        diasSinActualizar: cmp.diasSinActualizar,
        desactualizada: cmp.desactualizada,
      };
    })
    .filter(
      (o) =>
        (!filtros.proveedorId || o.proveedorId === filtros.proveedorId) &&
        (!filtros.soloDesactualizadas || o.desactualizada) &&
        (!filtros.soloMejor || o.esMejor),
    );
}

/** P-25 Lista general de precios de compra (y la base de DOC-06). */
export async function listaGeneralPreciosCompra(
  db: BaseDatos,
  authUserId: string,
  filtros: FiltrosOfertas = {},
): Promise<{ ofertas: OfertaListada[]; parametros: ParametrosPreciosCompra }> {
  return ejecutarComoUsuario(db, authUserId, "precios.ver_costos", async (tx) => {
    const p = await parametros(tx);
    return {
      ofertas: await consultarOfertas(tx, filtros),
      parametros: { diasAlertaDesactualizado: p.diasAlertaDesactualizado, variacionBruscaPct: p.variacionBruscaPct },
    };
  });
}

// ——— Cambios de precio ———

type FilaOferta = typeof proveedorProducto.$inferSelect & { producto: string; proveedor: string; factorABase: string };

async function ofertaParaCambiar(tx: Transaccion, ofertaId: string): Promise<FilaOferta> {
  const [f] = await tx
    .select({ oferta: proveedorProducto, producto: producto.nombre, proveedor: proveedor.nombre, factorABase: presentacion.factorABase })
    .from(proveedorProducto)
    .innerJoin(producto, eq(producto.id, proveedorProducto.productoId))
    .innerJoin(proveedor, eq(proveedor.id, proveedorProducto.proveedorId))
    .innerJoin(presentacion, eq(presentacion.id, proveedorProducto.presentacionId))
    .where(eq(proveedorProducto.id, ofertaId))
    .for("update", { of: proveedorProducto });
  if (!f) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró la oferta.");
  return { ...f.oferta, producto: f.producto, proveedor: f.proveedor, factorABase: f.factorABase };
}

interface OpcionesPrecio {
  origen: OrigenPrecioCompra;
  confirmarVariacion: boolean;
  umbralVariacionPct: string;
  observacion?: string | null;
  referencia?: string | null;
  compraItemId?: string | null;
}

/**
 * Aplica un precio nuevo a una oferta: historial (cerrando la vigencia anterior), oferta y
 * auditoría en la misma transacción (RN-068). Un precio igual al vigente solo lo confirma (RN-075).
 * Una variación brusca sin confirmar se rechaza con el detalle `requiereConfirmacion` (RN-070).
 */
async function aplicarPrecio(tx: Transaccion, c: ContextoUsuario, oferta: FilaOferta, precioNuevo: string, opciones: OpcionesPrecio) {
  if (dec(precioNuevo).eq(dec(oferta.precioVigente))) {
    await tx
      .update(proveedorProducto)
      .set({ fechaActualizacion: sql`now()`, disponible: true, actualizadoPor: c.usuarioId })
      .where(eq(proveedorProducto.id, oferta.id));
    return { cambio: false as const };
  }
  const cambio = evaluarCambioPrecioCompra({
    precioAnterior: oferta.precioVigente,
    precioNuevo,
    factorABase: oferta.factorABase,
    umbralVariacionPct: opciones.umbralVariacionPct,
  });
  if (cambio.esVariacionBrusca && !opciones.confirmarVariacion) {
    const signo = cambio.variacionPct!.gt(0) ? "+" : "";
    throw new ErrorDeNegocio(
      "VALIDACION",
      `${oferta.producto} (${oferta.proveedor}): de ${formatearMoneda(oferta.precioVigente)} a ${formatearMoneda(cambio.precio)} es ${signo}${formatearPorcentaje(cambio.variacionPct!, 2)}. Si está bien, tocá "Confirmar".`,
      { requiereConfirmacion: true, ofertaId: oferta.id },
    );
  }

  await tx
    .update(historialPrecioCompra)
    .set({ vigenteHasta: sql`now()`, actualizadoPor: c.usuarioId })
    .where(and(eq(historialPrecioCompra.proveedorProductoId, oferta.id), isNull(historialPrecioCompra.vigenteHasta)));
  await tx.insert(historialPrecioCompra).values({
    empresaId: c.empresaId,
    proveedorProductoId: oferta.id,
    proveedorId: oferta.proveedorId,
    productoId: oferta.productoId,
    presentacionId: oferta.presentacionId,
    precio: aNumeric(cambio.precio, 4),
    costoBase: aNumeric(cambio.costoBase, 4),
    variacionPct: cambio.variacionPct ? aNumeric(cambio.variacionPct, 3) : null,
    origen: opciones.origen,
    referencia: opciones.referencia ?? null,
    observacion: opciones.observacion ?? null,
    compraItemId: opciones.compraItemId ?? null,
    creadoPor: c.usuarioId,
    actualizadoPor: c.usuarioId,
  });
  await tx
    .update(proveedorProducto)
    .set({
      precioAnterior: oferta.precioVigente,
      precioVigente: aNumeric(cambio.precio, 4),
      costoBase: aNumeric(cambio.costoBase, 4),
      fechaActualizacion: sql`now()`,
      fuenteActualizacion: opciones.origen,
      disponible: true,
      actualizadoPor: c.usuarioId,
    })
    .where(eq(proveedorProducto.id, oferta.id));
  await auditar(tx, {
    empresaId: c.empresaId,
    usuarioId: c.usuarioId,
    accion: "CAMBIO_PRECIO_COMPRA",
    entidad: "proveedor_producto",
    entidadId: oferta.id,
    resumen: `${oferta.producto} en ${oferta.proveedor}: ${formatearMoneda(oferta.precioVigente)} → ${formatearMoneda(cambio.precio)}.`,
    datosAntes: { precio: oferta.precioVigente, costoBase: oferta.costoBase },
    datosDespues: { precio: aNumeric(cambio.precio, 4), costoBase: aNumeric(cambio.costoBase, 4), origen: opciones.origen },
  });
  // Si el precio cambió por una compra, el aviso es el de la compra.
  if (opciones.origen !== "COMPRA") await registrarActividad(tx, c, { accion: "PRECIO", entidadTipo: "PRODUCTO", entidadId: oferta.productoId, resumen: `cambió el precio de compra de ${oferta.producto} en ${oferta.proveedor}` });
  return { cambio: true as const, variacionPct: cambio.variacionPct?.toFixed(2) ?? null };
}

const MENSAJE_PRECIO = "Escribí el precio de la presentación (ej. 21.600).";

const esquemaNuevaOferta = z.object({
  proveedorId: z.uuid("Elegí el proveedor."),
  productoId: z.uuid("Elegí el producto."),
  presentacionId: z.uuid("Elegí la presentación."),
  precio: numeroObligatorio(MENSAJE_PRECIO),
  codigoProveedor: textoOpcional(40),
  observaciones: textoOpcional(300),
});

/** Nueva oferta de un proveedor (RN-067: una por proveedor + producto + presentación). */
export async function crearOferta(db: BaseDatos, authUserId: string, datos: z.input<typeof esquemaNuevaOferta>): Promise<string> {
  const d = validar(esquemaNuevaOferta, datos);
  return ejecutarComoUsuario(db, authUserId, "proveedores.editar", async (tx, c) => {
    c.permisos.exigir("precios.editar_compra");
    const [datosBase] = await tx
      .select({
        producto: producto.nombre,
        productoActivo: producto.activo,
        proveedor: proveedor.nombre,
        proveedorActivo: proveedor.activo,
        presentacion: presentacion.nombre,
        factorABase: presentacion.factorABase,
        presentacionActiva: presentacion.activo,
        usableEnCompra: presentacion.usableEnCompra,
      })
      .from(presentacion)
      .innerJoin(producto, eq(producto.id, presentacion.productoId))
      .innerJoin(proveedor, eq(proveedor.id, d.proveedorId))
      .where(and(eq(presentacion.id, d.presentacionId), eq(presentacion.productoId, d.productoId)));
    if (!datosBase) throw new ErrorDeNegocio("VALIDACION", "La presentación no corresponde a ese producto.");
    if (!datosBase.productoActivo || !datosBase.proveedorActivo) throw new ErrorDeNegocio("VALIDACION", "El producto y el proveedor tienen que estar activos.");
    if (!datosBase.presentacionActiva || !datosBase.usableEnCompra) {
      throw new ErrorDeNegocio("VALIDACION", `La presentación "${datosBase.presentacion}" no está habilitada para compras.`);
    }
    const [existente] = await tx
      .select({ id: proveedorProducto.id, activo: proveedorProducto.activo })
      .from(proveedorProducto)
      .where(
        and(
          eq(proveedorProducto.proveedorId, d.proveedorId),
          eq(proveedorProducto.productoId, d.productoId),
          eq(proveedorProducto.presentacionId, d.presentacionId),
        ),
      );
    if (existente?.activo) {
      throw new ErrorDeNegocio(
        "VALIDACION",
        `${datosBase.proveedor} ya tiene una oferta de ${datosBase.producto} en ${datosBase.presentacion}: cambiale el precio (RN-067).`,
      );
    }
    if (existente) {
      // Se había quitado: vuelve con el precio nuevo y su historial sigue en la misma oferta.
      await tx.update(proveedorProducto).set({ activo: true, actualizadoPor: c.usuarioId }).where(eq(proveedorProducto.id, existente.id));
      const { variacionBruscaPct } = await parametros(tx);
      await aplicarPrecio(tx, c, await ofertaParaCambiar(tx, existente.id), d.precio, {
        origen: "MANUAL",
        confirmarVariacion: true,
        umbralVariacionPct: variacionBruscaPct,
      });
      await recalcularPedidosPendientes(tx, { productoIds: [d.productoId] });
      return existente.id;
    }

    const cambio = evaluarCambioPrecioCompra({ precioAnterior: null, precioNuevo: d.precio, factorABase: datosBase.factorABase, umbralVariacionPct: "0" });
    const [nueva] = await tx
      .insert(proveedorProducto)
      .values({
        empresaId: c.empresaId,
        proveedorId: d.proveedorId,
        productoId: d.productoId,
        presentacionId: d.presentacionId,
        precioVigente: aNumeric(cambio.precio, 4),
        costoBase: aNumeric(cambio.costoBase, 4),
        codigoProveedor: d.codigoProveedor,
        observaciones: d.observaciones,
        creadoPor: c.usuarioId,
        actualizadoPor: c.usuarioId,
      })
      .returning({ id: proveedorProducto.id });
    await tx.insert(historialPrecioCompra).values({
      empresaId: c.empresaId,
      proveedorProductoId: nueva!.id,
      proveedorId: d.proveedorId,
      productoId: d.productoId,
      presentacionId: d.presentacionId,
      precio: aNumeric(cambio.precio, 4),
      costoBase: aNumeric(cambio.costoBase, 4),
      origen: "MANUAL",
      creadoPor: c.usuarioId,
      actualizadoPor: c.usuarioId,
    });
    await auditar(tx, {
      empresaId: c.empresaId,
      usuarioId: c.usuarioId,
      accion: "CAMBIO_PRECIO_COMPRA",
      entidad: "proveedor_producto",
      entidadId: nueva!.id,
      resumen: `Nueva oferta: ${datosBase.producto} en ${datosBase.proveedor}, ${datosBase.presentacion} a ${formatearMoneda(cambio.precio)}.`,
      datosDespues: { precio: aNumeric(cambio.precio, 4), costoBase: aNumeric(cambio.costoBase, 4) },
    });
    await registrarActividad(tx, c, { accion: "PRECIO", entidadTipo: "PRODUCTO", entidadId: d.productoId, resumen: `cargó el precio de ${datosBase.producto} en ${datosBase.proveedor}` });
    await recalcularPedidosPendientes(tx, { productoIds: [d.productoId] });
    return nueva!.id;
  });
}

const esquemaCambioPrecio = z.object({
  ofertaId: z.uuid(),
  precio: numeroObligatorio(MENSAJE_PRECIO),
  confirmarVariacion: z.boolean().default(false),
  observacion: textoOpcional(300),
});

/** Edición de un precio (P-25, P-11, P-21). Devuelve la variación aplicada. */
export async function actualizarPrecioOferta(
  db: BaseDatos,
  authUserId: string,
  datos: z.input<typeof esquemaCambioPrecio>,
): Promise<{ cambio: boolean; variacionPct: string | null }> {
  const d = validar(esquemaCambioPrecio, datos);
  return ejecutarComoUsuario(db, authUserId, "precios.editar_compra", async (tx, c) => {
    const { variacionBruscaPct } = await parametros(tx);
    const oferta = await ofertaParaCambiar(tx, d.ofertaId);
    if (!oferta.activo) throw new ErrorDeNegocio("VALIDACION", "La oferta está desactivada.");
    const r = await aplicarPrecio(tx, c, oferta, d.precio, {
      origen: "MANUAL",
      confirmarVariacion: d.confirmarVariacion,
      umbralVariacionPct: variacionBruscaPct,
      observacion: d.observacion,
    });
    await recalcularPedidosPendientes(tx, { productoIds: [oferta.productoId] }); // RN-088
    return r.cambio ? { cambio: true, variacionPct: r.variacionPct } : { cambio: false, variacionPct: null };
  });
}

/** "Confirmar sin cambios" (RN-075): renueva la fecha sin tocar el precio ni el historial. */
export async function confirmarPreciosSinCambios(db: BaseDatos, authUserId: string, ofertaIds: string[]): Promise<number> {
  if (ofertaIds.length === 0) return 0;
  return ejecutarComoUsuario(db, authUserId, "precios.editar_compra", async (tx, c) => {
    const filas = await tx
      .update(proveedorProducto)
      .set({ fechaActualizacion: sql`now()`, actualizadoPor: c.usuarioId })
      .where(and(inArray(proveedorProducto.id, ofertaIds), eq(proveedorProducto.activo, true)))
      .returning({ id: proveedorProducto.id, productoId: proveedorProducto.productoId });
    await recalcularPedidosPendientes(tx, { productoIds: filas.map((f) => f.productoId) });
    return filas.length;
  });
}

/** "No hay hoy" (RN-075): la oferta sale del mínimo y de las sugerencias sin desactivarse. */
export async function cambiarDisponibilidadOferta(db: BaseDatos, authUserId: string, datos: { ofertaId: string; disponible: boolean }): Promise<void> {
  await ejecutarComoUsuario(db, authUserId, "precios.editar_compra", async (tx, c) => {
    const filas = await tx
      .update(proveedorProducto)
      .set({ disponible: datos.disponible, actualizadoPor: c.usuarioId })
      .where(eq(proveedorProducto.id, datos.ofertaId))
      .returning({ id: proveedorProducto.id, productoId: proveedorProducto.productoId });
    if (filas.length === 0) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró la oferta.");
    await recalcularPedidosPendientes(tx, { productoIds: filas.map((f) => f.productoId) });
  });
}

/**
 * Desactivar o reactivar una oferta (el historial queda). Si era la única oferta activa del
 * proveedor preferido para ese producto, el producto se queda sin preferido.
 */
export async function cambiarEstadoOferta(db: BaseDatos, authUserId: string, datos: { ofertaId: string; activo: boolean }): Promise<void> {
  await ejecutarComoUsuario(db, authUserId, "proveedores.editar", async (tx, c) => {
    const oferta = await ofertaParaCambiar(tx, datos.ofertaId);
    if (oferta.activo === datos.activo) return;
    await tx.update(proveedorProducto).set({ activo: datos.activo, actualizadoPor: c.usuarioId }).where(eq(proveedorProducto.id, oferta.id));
    if (!datos.activo) {
      const [otra] = await tx
        .select({ id: proveedorProducto.id })
        .from(proveedorProducto)
        .where(
          and(
            eq(proveedorProducto.productoId, oferta.productoId),
            eq(proveedorProducto.proveedorId, oferta.proveedorId),
            eq(proveedorProducto.activo, true),
          ),
        )
        .limit(1);
      if (!otra) {
        await tx
          .update(producto)
          .set({ proveedorPreferidoId: null, actualizadoPor: c.usuarioId })
          .where(and(eq(producto.id, oferta.productoId), eq(producto.proveedorPreferidoId, oferta.proveedorId)));
      }
    }
    await auditar(tx, {
      empresaId: c.empresaId,
      usuarioId: c.usuarioId,
      accion: "CAMBIO_ESTADO",
      entidad: "proveedor_producto",
      entidadId: oferta.id,
      resumen: `${datos.activo ? "Reactivación" : "Desactivación"} de la oferta de ${oferta.producto} en ${oferta.proveedor}.`,
      datosAntes: { activo: oferta.activo },
      datosDespues: { activo: datos.activo },
    });
    await registrarActividad(tx, c, { accion: "PRECIO", entidadTipo: "PRODUCTO", entidadId: oferta.productoId, resumen: `${datos.activo ? "volvió a poner" : "sacó"} a ${oferta.proveedor} como puesto de ${oferta.producto}` });
    await recalcularPedidosPendientes(tx, { productoIds: [oferta.productoId] });
  });
}

const esquemaActualizacionRapida = z.object({
  proveedorId: z.uuid("Elegí el proveedor."),
  cambios: z.array(
    z.object({
      ofertaId: z.uuid(),
      /** Vacío = sin cambios. */
      precio: numeroOpcional(MENSAJE_PRECIO),
      noHay: z.boolean().default(false),
    }),
  ),
  confirmarResto: z.boolean().default(false),
  confirmarVariaciones: z.boolean().default(false),
});

/**
 * P-26 Actualización rápida en el puesto: todos los cambios de un proveedor en una sola
 * transacción. "Sin cambios en el resto" confirma las ofertas que no se tocaron (RN-075).
 */
export async function actualizacionRapida(
  db: BaseDatos,
  authUserId: string,
  datos: z.input<typeof esquemaActualizacionRapida>,
): Promise<{ precios: number; confirmadas: number; sinStock: number }> {
  const d = validar(esquemaActualizacionRapida, datos);
  return ejecutarComoUsuario(db, authUserId, "precios.editar_compra", async (tx, c) => {
    const { variacionBruscaPct } = await parametros(tx);
    const ofertasDelProveedor = await tx
      .select({ id: proveedorProducto.id })
      .from(proveedorProducto)
      .where(and(eq(proveedorProducto.proveedorId, d.proveedorId), eq(proveedorProducto.activo, true)));
    const propias = new Set(ofertasDelProveedor.map((o) => o.id));

    let precios = 0;
    let sinStock = 0;
    const tocadas = new Set<string>();
    const bruscas: string[] = [];
    for (const cambio of d.cambios) {
      if (!propias.has(cambio.ofertaId)) throw new ErrorDeNegocio("VALIDACION", "Hay una oferta que no es de este proveedor.");
      if (cambio.noHay) {
        await tx.update(proveedorProducto).set({ disponible: false, actualizadoPor: c.usuarioId }).where(eq(proveedorProducto.id, cambio.ofertaId));
        tocadas.add(cambio.ofertaId);
        sinStock++;
      } else if (cambio.precio) {
        const oferta = await ofertaParaCambiar(tx, cambio.ofertaId);
        try {
          const r = await aplicarPrecio(tx, c, oferta, cambio.precio, {
            origen: "MANUAL",
            confirmarVariacion: d.confirmarVariaciones,
            umbralVariacionPct: variacionBruscaPct,
          });
          if (r.cambio) precios++;
        } catch (error) {
          if (error instanceof ErrorDeNegocio && error.detalle?.requiereConfirmacion) {
            bruscas.push(error.message.replace(/\. Si está bien.*$/, ""));
            continue;
          }
          throw error;
        }
        tocadas.add(cambio.ofertaId);
      }
    }
    if (bruscas.length > 0) {
      throw new ErrorDeNegocio(
        "VALIDACION",
        `Estos precios cambian mucho: ${bruscas.join(" · ")}. Si están bien, tocá "Confirmar".`,
        { requiereConfirmacion: true },
      );
    }

    let confirmadas = 0;
    if (d.confirmarResto) {
      const resto = [...propias].filter((id) => !tocadas.has(id));
      if (resto.length > 0) {
        const filas = await tx
          .update(proveedorProducto)
          .set({ fechaActualizacion: sql`now()`, actualizadoPor: c.usuarioId })
          .where(inArray(proveedorProducto.id, resto))
          .returning({ id: proveedorProducto.id });
        confirmadas = filas.length;
      }
    }
    const productos = await tx.select({ id: proveedorProducto.productoId }).from(proveedorProducto).where(inArray(proveedorProducto.id, [...propias]));
    await recalcularPedidosPendientes(tx, { productoIds: productos.map((p) => p.id) });
    return { precios, confirmadas, sinStock };
  });
}

/** P-29 Historial de una oferta, del más reciente al más antiguo. */
export async function historialDeOferta(db: BaseDatos, authUserId: string, ofertaId: string): Promise<MovimientoHistorial[]> {
  return ejecutarComoUsuario(db, authUserId, "precios.ver_costos", async (tx) => {
    return tx
      .select({
        id: historialPrecioCompra.id,
        vigenteDesde: historialPrecioCompra.vigenteDesde,
        vigenteHasta: historialPrecioCompra.vigenteHasta,
        precio: historialPrecioCompra.precio,
        costoBase: historialPrecioCompra.costoBase,
        variacionPct: historialPrecioCompra.variacionPct,
        origen: historialPrecioCompra.origen,
        referencia: historialPrecioCompra.referencia,
        observacion: historialPrecioCompra.observacion,
        usuario: usuario.nombre,
      })
      .from(historialPrecioCompra)
      .leftJoin(usuario, eq(usuario.id, historialPrecioCompra.creadoPor))
      .where(eq(historialPrecioCompra.proveedorProductoId, ofertaId))
      .orderBy(desc(historialPrecioCompra.vigenteDesde), desc(historialPrecioCompra.creadoEn));
  });
}

/**
 * RN-059: el precio pagado en una compra actualiza la oferta del proveedor (historial con origen
 * COMPRA y referencia al ítem); si no había oferta, se crea; si es el mismo precio, solo se
 * confirma la fecha. La variación brusca ya se confirmó al registrar la compra (RN-058).
 */
export async function actualizarOfertaPorCompra(
  tx: Transaccion,
  c: ContextoUsuario,
  d: { proveedorId: string; productoId: string; presentacionId: string; precio: string; compraItemId: string; referencia: string },
): Promise<{ ofertaId: string; actualizo: boolean }> {
  const [existente] = await tx
    .select({ id: proveedorProducto.id, activo: proveedorProducto.activo })
    .from(proveedorProducto)
    .where(
      and(
        eq(proveedorProducto.proveedorId, d.proveedorId),
        eq(proveedorProducto.productoId, d.productoId),
        eq(proveedorProducto.presentacionId, d.presentacionId),
      ),
    );
  if (existente) {
    if (!existente.activo) await tx.update(proveedorProducto).set({ activo: true, actualizadoPor: c.usuarioId }).where(eq(proveedorProducto.id, existente.id));
    const oferta = await ofertaParaCambiar(tx, existente.id);
    const r = await aplicarPrecio(tx, c, oferta, d.precio, {
      origen: "COMPRA",
      confirmarVariacion: true,
      umbralVariacionPct: "0",
      referencia: d.referencia,
      compraItemId: d.compraItemId,
    });
    return { ofertaId: existente.id, actualizo: r.cambio };
  }
  const [pr] = await tx.select({ factor: presentacion.factorABase }).from(presentacion).where(eq(presentacion.id, d.presentacionId));
  const cambio = evaluarCambioPrecioCompra({ precioAnterior: null, precioNuevo: d.precio, factorABase: pr!.factor, umbralVariacionPct: "0" });
  const [nueva] = await tx
    .insert(proveedorProducto)
    .values({
      empresaId: c.empresaId,
      proveedorId: d.proveedorId,
      productoId: d.productoId,
      presentacionId: d.presentacionId,
      precioVigente: aNumeric(cambio.precio, 4),
      costoBase: aNumeric(cambio.costoBase, 4),
      fuenteActualizacion: "COMPRA",
      creadoPor: c.usuarioId,
      actualizadoPor: c.usuarioId,
    })
    .returning({ id: proveedorProducto.id });
  await tx.insert(historialPrecioCompra).values({
    empresaId: c.empresaId,
    proveedorProductoId: nueva!.id,
    proveedorId: d.proveedorId,
    productoId: d.productoId,
    presentacionId: d.presentacionId,
    precio: aNumeric(cambio.precio, 4),
    costoBase: aNumeric(cambio.costoBase, 4),
    origen: "COMPRA",
    compraItemId: d.compraItemId,
    referencia: d.referencia,
    creadoPor: c.usuarioId,
    actualizadoPor: c.usuarioId,
  });
  return { ofertaId: nueva!.id, actualizo: true };
}

/** Precio vigente de las ofertas de un proveedor, para avisar variaciones bruscas antes de registrar una compra. */
export async function preciosVigentes(tx: Transaccion, proveedorId: string) {
  return tx
    .select({
      ofertaId: proveedorProducto.id,
      productoId: proveedorProducto.productoId,
      presentacionId: proveedorProducto.presentacionId,
      precio: proveedorProducto.precioVigente,
    })
    .from(proveedorProducto)
    .where(and(eq(proveedorProducto.proveedorId, proveedorId), eq(proveedorProducto.activo, true)));
}
