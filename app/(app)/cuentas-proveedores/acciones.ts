"use server";

import { redirect } from "next/navigation";

import { anularPago, registrarAjuste, registrarPago, reimputarPago, type MedioPago, type ModoImputacion } from "@/modulos/compras/pagos";
import { ejecutarAccion } from "@/ui/accion-servidor";
import { campo, type EstadoAccion } from "@/ui/estado-accion";

// Acciones de P-62, P-63 y P-64. Los permisos los verifica cada caso de uso.

/** Imputación manual: cada deuda llega como `asig_<clave>` con el importe que se le asigna. */
function asignaciones(datos: FormData): { clave: string; monto: string }[] {
  return [...datos.entries()]
    .filter(([k, v]) => k.startsWith("asig_") && String(v).trim() !== "")
    .map(([k, v]) => ({ clave: k.slice(5), monto: String(v) }));
}

export async function registrarPagoAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  let id = "";
  const resultado = await ejecutarAccion(async ({ db, authUserId }) => {
    const r = await registrarPago(db, authUserId, {
      proveedorId: campo(datos, "proveedorId"),
      fecha: campo(datos, "fecha"),
      monto: campo(datos, "monto"),
      medio: campo(datos, "medio") as MedioPago,
      referencia: campo(datos, "referencia"),
      chequeBanco: campo(datos, "chequeBanco"),
      chequeFechaCobro: campo(datos, "chequeFechaCobro"),
      observaciones: campo(datos, "observaciones"),
      modo: (campo(datos, "modo") || "FIFO") as ModoImputacion,
      asignaciones: asignaciones(datos),
      claveIdempotencia: campo(datos, "claveIdempotencia") || null,
    });
    id = r.pagoId;
    return { ok: true, mensaje: null };
  });
  if (resultado.ok) redirect(`/cuentas-proveedores/pagos/${id}?registrado=1`);
  return resultado;
}

export async function anularPagoAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    const r = await anularPago(db, authUserId, { pagoId: campo(datos, "pagoId"), motivo: campo(datos, "motivo") });
    return { ok: true, mensaje: r.advertencia ? `Pago anulado. ${r.advertencia}` : "Pago anulado. Las compras que cancelaba volvieron a quedar pendientes." };
  });
}

export async function reimputarPagoAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await reimputarPago(db, authUserId, {
      pagoId: campo(datos, "pagoId"),
      motivo: campo(datos, "motivo"),
      modo: (campo(datos, "modo") || "FIFO") as ModoImputacion,
      asignaciones: asignaciones(datos),
    });
    return { ok: true, mensaje: "Listo: el pago quedó imputado de nuevo. La deuda total no cambió." };
  });
}

export async function ajusteAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    const r = await registrarAjuste(db, authUserId, {
      proveedorId: campo(datos, "proveedorId"),
      tipo: campo(datos, "tipo") as "AJUSTE_DEBITO" | "AJUSTE_CREDITO",
      monto: campo(datos, "monto"),
      motivo: campo(datos, "motivo"),
      compraId: campo(datos, "compraId"),
      vencimiento: campo(datos, "vencimiento"),
    });
    return { ok: true, mensaje: r.advertencia ? `Ajuste registrado. ${r.advertencia}` : "Ajuste registrado." };
  });
}
