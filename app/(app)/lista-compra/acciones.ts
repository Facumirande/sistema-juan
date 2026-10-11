"use server";

import { redirect } from "next/navigation";

import { formatearMoneda } from "@/dominio/dinero/formato";
import { comprarDeLaLista, destildarConCompra } from "@/modulos/compras/compra-desde-lista";
import { cambiarLineaLista, elegirPuestoDeLinea, generarListaCompra, marcarNoConseguido, ordenarLista, tildarLinea } from "@/modulos/compras/lista-compra";
import { pagadoDesdeLaLista } from "@/modulos/compras/pagos";
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
      presentacionId: clase === "proveedor" || clase === "sinpuesto" ? presentacionId : null,
      sinPuesto: clase === "sinpuesto",
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

/** Tildar (o destildar) un producto como comprado, sin anotar en qué puesto ni a cuánto. */
export async function tildarLineaAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    const tildado = campo(datos, "tildado") === "true";
    // Confirmado: se destilda aunque tenga la compra anotada (se anula esa compra).
    if (!tildado && campo(datos, "confirmarVariacion") === "on") {
      await destildarConCompra(db, authUserId, { itemId: campo(datos, "itemId") });
      return { ok: true, mensaje: null };
    }
    const r = await tildarLinea(db, authUserId, { itemId: campo(datos, "itemId"), tildado });
    return { ok: true, mensaje: tildado ? `Tildado: ${r.producto}.` : `${r.producto} vuelve a estar por comprar.` };
  });
}

/** Solo se vuelve a pantallas de la lista de compras (el destino viene del formulario). */
const destinoSeguro = (texto: string, fecha: string) => (texto.startsWith("/lista-compra") && !texto.includes("//") ? texto : `/lista-compra?fecha=${fecha}`);

/**
 * La compra guiada, producto por producto: anota la compra y pasa al producto que sigue
 * ("Guardar y seguir") o vuelve a la lista ("Guardar"). Si algo no se puede, queda en la pantalla
 * con el motivo.
 */
export async function comprarYSeguirAccion(estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  const r = await comprarDeLaListaAccion(estado, datos);
  if (!r.ok) return r;
  const fecha = campo(datos, "fecha");
  redirect(destinoSeguro(campo(datos, campo(datos, "despues") === "seguir" ? "siguiente" : "volver"), fecha));
}

/** En la compra guiada: tildar sin precio o marcar que no se consiguió, y seguir con el próximo. */
export async function resolverYSeguirAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  const r = await ejecutarAccion(async ({ db, authUserId }) => {
    if (campo(datos, "que") === "no") await marcarNoConseguido(db, authUserId, { itemId: campo(datos, "itemId"), motivo: null });
    else await tildarLinea(db, authUserId, { itemId: campo(datos, "itemId"), tildado: true });
    return { ok: true, mensaje: null };
  });
  if (!r.ok) return r;
  redirect(destinoSeguro(campo(datos, "siguiente"), campo(datos, "fecha")));
}

/** El orden puesto a mano en la lista (arrastrando). */
export async function ordenarListaAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await ordenarLista(db, authUserId, { fecha: campo(datos, "fecha"), itemIds: datos.getAll("item").filter((v): v is string => typeof v === "string") });
    return { ok: true, mensaje: null };
  });
}

/** El interruptor "Pagado / A cuenta" al final de un renglón con compras anotadas. */
export async function pagadoDesdeLaListaAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await pagadoDesdeLaLista(db, authUserId, { itemId: campo(datos, "itemId"), pagado: campo(datos, "pagado") === "true" });
    return { ok: true, mensaje: null };
  });
}

/** El puesto donde se va a comprar un renglón (vacío = sin puesto, en efectivo). */
export async function elegirPuestoAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await elegirPuestoDeLinea(db, authUserId, { itemId: campo(datos, "itemId"), proveedorId: campo(datos, "proveedorId") || null });
    return { ok: true, mensaje: null };
  });
}
