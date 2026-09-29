"use server";

import { accionAlMover, type ClaveColumna, type PrioridadPedido } from "@/dominio/pedidos/tablero";
import { esErrorDeNegocio } from "@/dominio/errores";
import { generarListaCompra, sacarPedidoDeLista } from "@/modulos/compras/lista-compra";
import { asignarResponsable, cambiarPlazo, cambiarPrioridad, confirmarPedido } from "@/modulos/pedidos/pedidos";
import { estadosDePedidos } from "@/modulos/pedidos/tablero";
import { ejecutarAccion } from "@/ui/accion-servidor";
import { campo, type EstadoAccion } from "@/ui/estado-accion";

// Acciones del tablero de pedidos (estilo Trello). Los permisos los verifica cada caso de uso.

const elegidos = (datos: FormData) => datos.getAll("pedido").filter((v): v is string => typeof v === "string" && v !== "");
const cuantos = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Confirma los borradores de la lista; devuelve los que quedaron confirmados y los problemas. */
async function confirmarBorradores(db: Parameters<typeof confirmarPedido>[0], authUserId: string, ids: readonly string[]) {
  const confirmados: string[] = [];
  const problemas: string[] = [];
  for (const id of ids) {
    try {
      await confirmarPedido(db, authUserId, id);
      confirmados.push(id);
    } catch (error) {
      if (!esErrorDeNegocio(error)) throw error;
      problemas.push(error.message);
    }
  }
  return { confirmados, problemas };
}

/** "Armar la lista de compra" con los pedidos elegidos (los borradores se confirman antes). */
export async function armarListaConElegidosAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    const pedidos = await estadosDePedidos(db, authUserId, elegidos(datos));
    if (pedidos.length === 0) return { ok: false, mensaje: "Elegí al menos un pedido." };
    const fechas = new Set(pedidos.map((p) => p.fecha));
    if (fechas.size > 1) return { ok: false, mensaje: "Elegí pedidos de un mismo día: la lista de compra es por día." };
    const { confirmados, problemas } = await confirmarBorradores(db, authUserId, pedidos.filter((p) => p.estado === "BORRADOR").map((p) => p.id));
    const paraLista = [...pedidos.filter((p) => p.estado === "CONFIRMADO").map((p) => p.id), ...confirmados];
    if (paraLista.length === 0) return { ok: false, mensaje: problemas.join(" ") || "Esos pedidos ya están en la lista." };
    const r = await generarListaCompra(db, authUserId, [...fechas][0]!, { pedidoIds: paraLista });
    const partes = [`Listo: ${cuantos(r.agregados, "pedido entró", "pedidos entraron")} en la lista de compra ${r.numero}.`];
    if (r.fueraDeLista > 0) partes.push(`Quedan ${cuantos(r.fueraDeLista, "confirmado afuera", "confirmados afuera")}.`);
    if (problemas.length) partes.push(`No se pudieron confirmar: ${problemas.join(" ")}`);
    return { ok: problemas.length === 0, mensaje: partes.join(" ") };
  });
}

export async function confirmarElegidosAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    const pedidos = await estadosDePedidos(db, authUserId, elegidos(datos));
    const { confirmados, problemas } = await confirmarBorradores(db, authUserId, pedidos.filter((p) => p.estado === "BORRADOR").map((p) => p.id));
    if (confirmados.length === 0 && problemas.length === 0) return { ok: false, mensaje: "Elegí pedidos por confirmar." };
    return { ok: problemas.length === 0, mensaje: [confirmados.length ? `${cuantos(confirmados.length, "pedido confirmado", "pedidos confirmados")}.` : "", ...problemas].filter(Boolean).join(" ") };
  });
}

export async function prioridadElegidosAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    const n = await cambiarPrioridad(db, authUserId, { pedidoIds: elegidos(datos), prioridad: campo(datos, "prioridad") as PrioridadPedido });
    return { ok: true, mensaje: n ? `Prioridad cambiada en ${cuantos(n, "pedido", "pedidos")}.` : "Ya tenían esa prioridad." };
  });
}

export async function asignarElegidosAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    const n = await asignarResponsable(db, authUserId, { pedidoIds: elegidos(datos), usuarioId: campo(datos, "usuarioId") || null });
    return { ok: true, mensaje: n ? `Listo: ${cuantos(n, "pedido cambió", "pedidos cambiaron")} de responsable.` : "Ya estaban así." };
  });
}

export async function sacarDeListaAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    const ids = elegidos(datos);
    for (const id of ids) await sacarPedidoDeLista(db, authUserId, id);
    return { ok: true, mensaje: `${cuantos(ids.length, "pedido salió", "pedidos salieron")} de la lista de compra (lo ya comprado se conserva).` };
  });
}

export async function plazoAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await cambiarPlazo(db, authUserId, { pedidoId: campo(datos, "pedidoId"), entregaDesde: campo(datos, "desde"), entregaHasta: campo(datos, "hasta") });
    return { ok: true, mensaje: "Plazo guardado." };
  });
}

/** Arrastrar y soltar una tarjeta de una columna a otra. */
export async function moverTarjetaAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    const id = campo(datos, "pedido");
    const accion = accionAlMover(campo(datos, "desde") as ClaveColumna, campo(datos, "hacia") as ClaveColumna);
    if (!accion) return { ok: false, mensaje: "Esa tarjeta no se puede mover ahí: esa etapa avanza sola (preparación, reparto y entrega)." };
    const [p] = await estadosDePedidos(db, authUserId, [id]);
    if (!p) return { ok: false, mensaje: "No se encontró el pedido." };
    if (accion === "CONFIRMAR") {
      await confirmarPedido(db, authUserId, id);
      return { ok: true, mensaje: "Pedido confirmado." };
    }
    if (accion === "SACAR_DE_LISTA") {
      await sacarPedidoDeLista(db, authUserId, id);
      return { ok: true, mensaje: "El pedido salió de la lista de compra." };
    }
    if (p.estado === "BORRADOR") await confirmarPedido(db, authUserId, id);
    const r = await generarListaCompra(db, authUserId, p.fecha, { pedidoIds: [id] });
    return { ok: true, mensaje: `El pedido entró en la lista de compra ${r.numero}.` };
  });
}
