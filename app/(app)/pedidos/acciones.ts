"use server";

import { redirect } from "next/navigation";

import type { LineaElegida } from "@/dominio/pedidos/carga";
import type { PrioridadPedido } from "@/dominio/pedidos/tablero";
import {
  agregarLinea,
  cambiarDatosPedido,
  cambiarProductosDePedido,
  cargarPedido,
  cambiarLinea,
  cancelarPedido,
  confirmarPedido,
  duplicarPedido,
  fijarPrecioManual,
  quitarLinea,
  recalcularPreciosPedido,
  type CanalPedido,
  type PedidoCargado,
} from "@/modulos/pedidos/pedidos";
import { ejecutarAccion } from "@/ui/accion-servidor";
import { campo, type EstadoAccion } from "@/ui/estado-accion";

// Acciones de P-40, P-41 y P-42. Los permisos los verifica cada caso de uso.

const canal = (datos: FormData) => (campo(datos, "canal") || null) as CanalPedido | null;

export async function agregarLineaAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    // El selector trae "productoId:presentacionId" (vacío = unidad base).
    const [productoId = "", presentacionId = ""] = campo(datos, "productoPresentacion").split(":");
    const r = await agregarLinea(db, authUserId, {
      pedidoId: campo(datos, "pedidoId"),
      productoId,
      presentacionId: presentacionId || null,
      cantidad: campo(datos, "cantidad"),
      observaciones: campo(datos, "observaciones"),
    });
    return { ok: true, mensaje: r.sumada ? "Ya estaba en el pedido: se sumó la cantidad." : null };
  });
}

export async function cambiarLineaAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await cambiarLinea(db, authUserId, { itemId: campo(datos, "itemId"), cantidad: campo(datos, "cantidad"), observaciones: campo(datos, "observaciones") });
    return { ok: true, mensaje: null };
  });
}

export async function quitarLineaAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await quitarLinea(db, authUserId, { itemId: campo(datos, "itemId"), motivo: campo(datos, "motivo") });
    return { ok: true, mensaje: null };
  });
}

export async function precioManualAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    const quitar = campo(datos, "quitar") === "true";
    await fijarPrecioManual(db, authUserId, { itemId: campo(datos, "itemId"), precio: quitar ? null : campo(datos, "precio"), motivo: campo(datos, "motivo") });
    return { ok: true, mensaje: quitar ? "Vuelve al precio calculado." : "Precio guardado." };
  });
}

export async function datosPedidoAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await cambiarDatosPedido(db, authUserId, {
      pedidoId: campo(datos, "pedidoId"),
      fecha: campo(datos, "fecha") || undefined,
      puntoEntregaId: campo(datos, "puntoEntregaId") || null,
      canal: canal(datos),
      referenciaCliente: campo(datos, "referenciaCliente"),
      observaciones: campo(datos, "observaciones"),
      observacionesInternas: campo(datos, "observacionesInternas"),
    });
    return { ok: true, mensaje: "Datos guardados." };
  });
}

export async function confirmarPedidoAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await confirmarPedido(db, authUserId, campo(datos, "pedidoId"));
    return { ok: true, mensaje: "Pedido confirmado." };
  });
}

export async function cancelarPedidoAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await cancelarPedido(db, authUserId, { pedidoId: campo(datos, "pedidoId"), motivo: campo(datos, "motivo") });
    return { ok: true, mensaje: "Pedido cancelado." };
  });
}

export async function recalcularAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await recalcularPreciosPedido(db, authUserId, campo(datos, "pedidoId"));
    return { ok: true, mensaje: "Precios recalculados." };
  });
}

export async function duplicarPedidoAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  let id = "";
  const resultado = await ejecutarAccion(async ({ db, authUserId }) => {
    const r = await duplicarPedido(db, authUserId, { pedidoId: campo(datos, "pedidoId"), fecha: campo(datos, "fecha") });
    id = r.pedidoId;
    return { ok: true, mensaje: null };
  });
  if (resultado.ok) redirect(`/pedidos/${id}`);
  return resultado;
}

/** Lo que manda la pantalla de carga visual ("Nuevo pedido" o "Cambiar productos"). */
export interface PedidoVisual {
  pedidoId: string | null;
  fecha: string;
  clienteId: string;
  puntoEntregaId: string | null;
  lineas: LineaElegida[];
  prioridad: PrioridadPedido;
  entregaDesde: string;
  entregaHasta: string;
  observaciones: string;
  confirmar: boolean;
}

/** Guarda el pedido completo de una vez: nuevo o con sus productos cambiados. */
export async function guardarPedidoVisualAccion(datos: PedidoVisual): Promise<EstadoAccion & { pedido?: PedidoCargado }> {
  let pedido: PedidoCargado | undefined;
  const resultado = await ejecutarAccion(async ({ db, authUserId }) => {
    const comun = {
      puntoEntregaId: datos.puntoEntregaId,
      lineas: datos.lineas,
      prioridad: datos.prioridad,
      entregaDesde: datos.entregaDesde,
      entregaHasta: datos.entregaHasta,
      observaciones: datos.observaciones,
      confirmar: datos.confirmar,
    };
    pedido = datos.pedidoId
      ? await cambiarProductosDePedido(db, authUserId, { pedidoId: datos.pedidoId, fecha: datos.fecha, ...comun })
      : await cargarPedido(db, authUserId, { fecha: datos.fecha, clienteId: datos.clienteId, ...comun });
    return { ok: true, mensaje: null };
  });
  return pedido ? { ...resultado, pedido } : resultado;
}
