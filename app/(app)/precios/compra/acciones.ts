"use server";

import {
  actualizacionRapida,
  actualizarPrecioOferta,
  cambiarDisponibilidadOferta,
  cambiarEstadoOferta,
  confirmarPreciosSinCambios,
  crearOferta,
} from "@/modulos/precios-compra/ofertas";
import { ejecutarAccion, tildada } from "@/ui/accion-servidor";
import { campo, type EstadoAccion } from "@/ui/estado-accion";
import { formatearPorcentaje } from "@/dominio/dinero/formato";

// Acciones de precios de compra (P-11, P-21, P-25, P-26). Los permisos los verifica cada caso de uso.

export async function crearOfertaAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    // Desde la ficha del proveedor, producto y presentación vienen juntos: "productoId:presentacionId".
    const [productoId = campo(datos, "productoId"), presentacionId = campo(datos, "presentacionId")] = campo(datos, "productoPresentacion")
      ? campo(datos, "productoPresentacion").split(":")
      : [];
    await crearOferta(db, authUserId, {
      proveedorId: campo(datos, "proveedorId"),
      productoId,
      presentacionId,
      precio: campo(datos, "precio"),
      codigoProveedor: campo(datos, "codigoProveedor"),
      observaciones: campo(datos, "observaciones"),
    });
    return { ok: true, mensaje: "Oferta agregada." };
  });
}

export async function actualizarPrecioAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    const r = await actualizarPrecioOferta(db, authUserId, {
      ofertaId: campo(datos, "ofertaId"),
      precio: campo(datos, "precio"),
      confirmarVariacion: tildada(datos, "confirmarVariacion"),
    });
    if (!r.cambio) return { ok: true, mensaje: "Mismo precio: quedó confirmado para hoy." };
    return { ok: true, mensaje: r.variacionPct ? `Guardado (${r.variacionPct.startsWith("-") ? "" : "+"}${formatearPorcentaje(r.variacionPct, 2)}).` : "Guardado." };
  });
}

export async function confirmarSinCambiosAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    const n = await confirmarPreciosSinCambios(db, authUserId, datos.getAll("ofertaId").map(String));
    return { ok: true, mensaje: n === 1 ? "Precio confirmado para hoy." : `${n} precios confirmados para hoy.` };
  });
}

export async function disponibilidadAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    const disponible = campo(datos, "disponible") === "true";
    await cambiarDisponibilidadOferta(db, authUserId, { ofertaId: campo(datos, "ofertaId"), disponible });
    return { ok: true, mensaje: disponible ? "Vuelve a estar disponible." : "Marcado: hoy no hay." };
  });
}

export async function estadoOfertaAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    const activo = campo(datos, "activo") === "true";
    await cambiarEstadoOferta(db, authUserId, { ofertaId: campo(datos, "ofertaId"), activo });
    return { ok: true, mensaje: activo ? "Oferta reactivada." : "Oferta quitada." };
  });
}

/** P-26: los campos de cada oferta llegan como `precio_<id>` y `nohay_<id>`. */
export async function actualizacionRapidaAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    const ofertaIds = datos.getAll("ofertaId").map(String);
    const r = await actualizacionRapida(db, authUserId, {
      proveedorId: campo(datos, "proveedorId"),
      cambios: ofertaIds.map((ofertaId) => ({
        ofertaId,
        precio: campo(datos, `precio_${ofertaId}`),
        noHay: tildada(datos, `nohay_${ofertaId}`),
      })),
      confirmarResto: tildada(datos, "confirmarResto"),
      confirmarVariaciones: tildada(datos, "confirmarVariacion"),
    });
    const partes = [
      r.precios > 0 && `${r.precios} precio(s) nuevo(s)`,
      r.sinStock > 0 && `${r.sinStock} sin stock hoy`,
      r.confirmadas > 0 && `${r.confirmadas} confirmado(s) sin cambios`,
    ].filter(Boolean);
    return { ok: true, mensaje: partes.length > 0 ? `Listo: ${partes.join(", ")}.` : "No había nada para guardar." };
  });
}
