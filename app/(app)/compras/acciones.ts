"use server";

import { redirect } from "next/navigation";

import { anularCompra, registrarCompra, registrarSaldoInicial, type CondicionPago, type MedioPago } from "@/modulos/compras/compras";
import { ejecutarAccion, tildada } from "@/ui/accion-servidor";
import { campo, type EstadoAccion } from "@/ui/estado-accion";

// Acciones de P-55, P-57 y P-63. Los permisos los verifica cada caso de uso.

/**
 * Registrar compra. Cada renglón llega como `item_<n>_...`: con producto y presentación por
 * separado (renglones precargados) o juntos en `item_<n>_pp` (renglones libres). Los renglones
 * sin cantidad se ignoran.
 */
export async function registrarCompraAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  let id = "";
  const resultado = await ejecutarAccion(async ({ db, authUserId }) => {
    const indices = [...new Set([...datos.keys()].map((k) => /^item_(\d+)_/.exec(k)?.[1]).filter((x): x is string => Boolean(x)))];
    const items = indices
      .map((n) => {
        const [ppProducto = "", ppPresentacion = ""] = campo(datos, `item_${n}_pp`).split(":");
        return {
          productoId: campo(datos, `item_${n}_producto`) || ppProducto,
          presentacionId: campo(datos, `item_${n}_presentacion`) || ppPresentacion,
          cantidad: campo(datos, `item_${n}_cantidad`),
          precio: campo(datos, `item_${n}_precio`),
        };
      })
      .filter((i) => i.cantidad.trim() !== "" && i.productoId);
    const r = await registrarCompra(db, authUserId, {
      fecha: campo(datos, "fecha"),
      proveedorId: campo(datos, "proveedorId"),
      condicion: campo(datos, "condicion") as CondicionPago,
      pagadoEnElActo: campo(datos, "pagadoEnElActo"),
      medioPago: (campo(datos, "medioPago") || "EFECTIVO") as MedioPago,
      items,
      numeroComprobante: campo(datos, "numeroComprobante"),
      observaciones: campo(datos, "observaciones"),
      confirmarVariacion: tildada(datos, "confirmarVariacion"),
      motivoExceso: tildada(datos, "exceder") ? campo(datos, "motivoExceso") : null,
      claveIdempotencia: campo(datos, "claveIdempotencia") || null,
    });
    id = r.compraId;
    return { ok: true, mensaje: null };
  });
  if (resultado.ok) redirect(`/compras/${id}?registrada=1`);
  return resultado;
}

export async function anularCompraAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await anularCompra(db, authUserId, { compraId: campo(datos, "compraId"), motivo: campo(datos, "motivo"), devolvioDinero: tildada(datos, "devolvioDinero") });
    return { ok: true, mensaje: "Compra anulada. La cuenta del proveedor quedó corregida." };
  });
}

export async function saldoInicialAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await registrarSaldoInicial(db, authUserId, {
      proveedorId: campo(datos, "proveedorId"),
      monto: campo(datos, "monto"),
      fecha: campo(datos, "fecha"),
      vencimiento: campo(datos, "vencimiento"),
      referencia: campo(datos, "referencia"),
    });
    return { ok: true, mensaje: "Deuda cargada." };
  });
}
