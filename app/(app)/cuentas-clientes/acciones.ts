"use server";

import { anularCobro, guardarSaldoInicialDeCliente, registrarCobro, type MedioDeCobro } from "@/modulos/cuentas-clientes/cuentas";
import { ejecutarAccion } from "@/ui/accion-servidor";
import { campo, type EstadoAccion } from "@/ui/estado-accion";

// Acciones de "A cobrar" (P-65). Los permisos los verifica cada caso de uso.

/**
 * Anota un cobro. Sin importe es todo lo que debe el cliente (o todo lo que falta de la entrega
 * elegida): "💵 Cobró en efectivo" es un solo toque.
 */
export async function registrarCobroAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await registrarCobro(db, authUserId, {
      clienteId: campo(datos, "clienteId"),
      entregaId: campo(datos, "entregaId") || null,
      monto: campo(datos, "monto"),
      medioPago: (campo(datos, "medioPago") || "EFECTIVO") as MedioDeCobro,
      fecha: campo(datos, "fecha") || null,
      observaciones: campo(datos, "observaciones"),
    });
    return { ok: true, mensaje: null };
  });
}

export async function anularCobroAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await anularCobro(db, authUserId, { cobroId: campo(datos, "cobroId"), motivo: campo(datos, "motivo") });
    return { ok: true, mensaje: null };
  });
}

export async function saldoInicialAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await guardarSaldoInicialDeCliente(db, authUserId, { clienteId: campo(datos, "clienteId"), monto: campo(datos, "monto") });
    return { ok: true, mensaje: null };
  });
}
