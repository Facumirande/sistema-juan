"use server";

import { formatearMoneda } from "@/dominio/dinero/formato";
import { comprarDeLaLista } from "@/modulos/compras/compra-desde-lista";
import { cambiarLineaLista, generarListaCompra, marcarNoConseguido } from "@/modulos/compras/lista-compra";
import { completarPedidosDelDia } from "@/modulos/pedidos/completar";
import { ejecutarAccion, tildada } from "@/ui/accion-servidor";
import { campo, type EstadoAccion } from "@/ui/estado-accion";

// Acciones de P-50 Lista de compras. Los permisos los verifica cada caso de uso.

/**
 * Arma (o actualiza) la lista con todos los pedidos del día. No hay confirmación a la vista: los
 * pedidos que quedaron sin terminar pero ya tienen productos se completan antes de entrar.
 */
export async function generarListaAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    const fecha = campo(datos, "fecha");
    const { problemas } = await completarPedidosDelDia(db, authUserId, fecha);
    const r = await generarListaCompra(db, authUserId, fecha);
    const partes = [r.version > 1 ? "Listo: la lista de compras quedó al día con los pedidos." : "Listo: la lista de compras está armada."];
    if (r.borradores > 0) partes.push(`Quedaron afuera ${r.borradores} pedido(s) sin productos: cargales lo que llevan y volvé a armarla.`);
    if (problemas.length > 0) partes.push(`Quedaron afuera: ${problemas.join(" ")}`);
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

/** "✓ Lo compré": anota la compra de un producto de la lista en el puesto donde se compró. */
export async function comprarDeLaListaAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    const [clase, id = "", presentacionId = ""] = campo(datos, "puesto").split(":");
    const r = await comprarDeLaLista(db, authUserId, {
      itemId: campo(datos, "itemId"),
      ofertaId: clase === "oferta" ? id : null,
      proveedorId: clase === "proveedor" ? id : null,
      presentacionId: clase === "proveedor" ? presentacionId : null,
      cantidad: campo(datos, "cantidad"),
      precio: campo(datos, "precio"),
      pagado: campo(datos, "pago") === "PAGADO",
      medioPago: (campo(datos, "medioPago") || "EFECTIVO") as "EFECTIVO",
      confirmarVariacion: tildada(datos, "confirmarVariacion"),
      motivoExceso: tildada(datos, "exceder") ? campo(datos, "motivoExceso") : null,
      claveIdempotencia: campo(datos, "claveIdempotencia") || null,
    });
    return { ok: true, mensaje: `Anotado: ${r.producto} en ${r.proveedor} por ${formatearMoneda(r.total)}.${r.advertencia ? ` ${r.advertencia}` : ""}` };
  });
}
