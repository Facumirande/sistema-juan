"use server";

import { cambiarLineaLista, generarListaCompra, marcarNoConseguido } from "@/modulos/compras/lista-compra";
import { ejecutarAccion } from "@/ui/accion-servidor";
import { campo, type EstadoAccion } from "@/ui/estado-accion";

// Acciones de P-50 Lista de compra. Los permisos los verifica cada caso de uso.

export async function generarListaAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    const r = await generarListaCompra(db, authUserId, campo(datos, "fecha"));
    const partes = [`${r.numero} versión ${r.version} lista.`];
    if (r.borradores > 0) partes.push(`Quedaron afuera ${r.borradores} pedido(s) en borrador: confirmalos y volvé a armarla si van.`);
    if (r.cambios.length > 0) partes.push(`Cambios: ${r.cambios.join("; ")}.`);
    return { ok: true, mensaje: partes.join(" ") };
  });
}

export async function cambiarCantidadAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await cambiarLineaLista(db, authUserId, { itemId: campo(datos, "itemId"), cantidad: campo(datos, "cantidad"), motivo: campo(datos, "motivo") });
    return { ok: true, mensaje: "Cantidad cambiada." };
  });
}

export async function cambiarProveedorAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await cambiarLineaLista(db, authUserId, { itemId: campo(datos, "itemId"), ofertaId: campo(datos, "ofertaId") });
    return { ok: true, mensaje: "Proveedor cambiado." };
  });
}

export async function noConseguidoAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    const quitar = campo(datos, "quitar") === "true";
    await marcarNoConseguido(db, authUserId, { itemId: campo(datos, "itemId"), motivo: quitar ? null : campo(datos, "motivo") });
    return { ok: true, mensaje: quitar ? "Vuelve a estar pendiente." : "Marcado: no se consiguió." };
  });
}
