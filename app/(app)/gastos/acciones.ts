"use server";

import { anularMovimientoExtra, cambiarEstadoDeRubro, guardarRubro, registrarMovimientoExtra, type MedioDePago, type TipoDeMovimiento } from "@/modulos/gastos/gastos";
import { ejecutarAccion } from "@/ui/accion-servidor";
import { campo, type EstadoAccion } from "@/ui/estado-accion";

// Acciones de "Gastos e ingresos" (P-66). Los permisos los verifica cada caso de uso.

export async function registrarMovimientoAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await registrarMovimientoExtra(db, authUserId, {
      rubroId: campo(datos, "rubroId"),
      monto: campo(datos, "monto"),
      cantidad: campo(datos, "cantidad"),
      fecha: campo(datos, "fecha") || null,
      detalle: campo(datos, "detalle"),
      medioPago: (campo(datos, "medioPago") || "EFECTIVO") as MedioDePago,
    });
    return { ok: true, mensaje: null };
  });
}

export async function anularMovimientoAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await anularMovimientoExtra(db, authUserId, { movimientoId: campo(datos, "movimientoId"), motivo: campo(datos, "motivo") });
    return { ok: true, mensaje: null };
  });
}

export async function guardarRubroAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await guardarRubro(db, authUserId, {
      rubroId: campo(datos, "rubroId") || null,
      nombre: campo(datos, "nombre"),
      dibujo: campo(datos, "dibujo"),
      tipo: (campo(datos, "tipo") || "GASTO") as TipoDeMovimiento,
      unidad: campo(datos, "unidad"),
    });
    return { ok: true, mensaje: null };
  });
}

export async function estadoDeRubroAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await cambiarEstadoDeRubro(db, authUserId, { rubroId: campo(datos, "rubroId"), activo: campo(datos, "activo") === "si" });
    return { ok: true, mensaje: null };
  });
}
