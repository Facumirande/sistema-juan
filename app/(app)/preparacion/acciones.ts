"use server";

import type { ResultadoEmision } from "@/modulos/entregas/documentos";
import { completarPedidosDelDia } from "@/modulos/pedidos/completar";
import { iniciarPreparacion, marcarPreparada, prepararTodoComoPropuesto, registrarPreparado, sustituirProducto } from "@/modulos/entregas/preparacion";
import { ejecutarAccion, tildada } from "@/ui/accion-servidor";
import { campo, type EstadoAccion } from "@/ui/estado-accion";

// Acciones de P-46, P-70, P-71 y P-72. Los permisos los verifica cada caso de uso.

/** Qué pasó con los documentos al preparar, para decírselo a quien prepara (sin importes). */
function textoDocumentos(r: ResultadoEmision | null): string {
  if (!r) return "";
  if (r.resultado === "EMITIDOS") return r.version > 1 ? ` Documentos actualizados (versión ${r.version}).` : " Ya se puede imprimir la lista de entrega.";
  if (r.resultado === "SIN_PRECIO") return ` Documentos pendientes: falta el precio de ${r.productos.join(", ")} (avisale al administrador).`;
  if (r.resultado === "MARGEN_NEGATIVO") return ` Documentos pendientes: hay productos por debajo del costo (${r.productos.join(", ")}); el administrador los tiene que confirmar.`;
  return "";
}

export async function iniciarPreparacionAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    const fecha = campo(datos, "fecha");
    const { problemas } = await completarPedidosDelDia(db, authUserId, fecha);
    const r = await iniciarPreparacion(db, authUserId, fecha);
    const partes = [
      r.entregasNuevas ? `${r.entregasNuevas} ${r.entregasNuevas === 1 ? "cliente nuevo" : "clientes nuevos"} para preparar` : null,
      r.lineasNuevas ? `${r.lineasNuevas} ${r.lineasNuevas === 1 ? "producto" : "productos"} para separar` : null,
    ].filter(Boolean);
    const avisos = [
      r.borradores ? `${r.borradores} ${r.borradores === 1 ? "pedido no tiene" : "pedidos no tienen"} productos y no ${r.borradores === 1 ? "entra" : "entran"}.` : null,
      problemas.length ? `Quedaron afuera: ${problemas.join(" ")}` : null,
    ].filter(Boolean);
    return { ok: true, mensaje: [partes.length ? `Listo: ${partes.join(" y ")}.` : "Todo al día: no había pedidos nuevos.", ...avisos].join(" ") };
  });
}

export async function preparadoAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    const r = await registrarPreparado(db, authUserId, {
      itemId: campo(datos, "itemId"),
      cantidad: campo(datos, "cantidad"),
      motivo: (campo(datos, "motivo") || null) as Parameters<typeof registrarPreparado>[2]["motivo"],
      confirmar: tildada(datos, "confirmarVariacion"),
    });
    return { ok: true, mensaje: `Guardado.${textoDocumentos(r.reemision)}` };
  });
}

export async function todoPropuestoAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    const n = await prepararTodoComoPropuesto(db, authUserId, campo(datos, "entregaId"));
    return { ok: true, mensaje: n ? `Listo: ${n} ${n === 1 ? "línea cargada" : "líneas cargadas"} con lo pedido.` : "No quedaban líneas sin cargar." };
  });
}

export async function sustituirAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await sustituirProducto(db, authUserId, {
      itemId: campo(datos, "itemId"),
      productoId: campo(datos, "productoId"),
      cantidad: campo(datos, "cantidad"),
      autorizadoPor: campo(datos, "autorizadoPor"),
    });
    return { ok: true, mensaje: "Reemplazo agregado. Cargá 0 (o lo que haya) en el producto original." };
  });
}

export async function marcarPreparadaAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    const r = await marcarPreparada(db, authUserId, { entregaId: campo(datos, "entregaId"), bultos: campo(datos, "bultos") });
    return { ok: true, mensaje: `Entrega preparada.${textoDocumentos(r.documentos)}` };
  });
}
