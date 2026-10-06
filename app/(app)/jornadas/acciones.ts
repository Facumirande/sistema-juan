"use server";

import { cerrarJornada, justificarPendientes, reabrirJornada } from "@/modulos/jornadas/cierre";
import { ejecutarAccion } from "@/ui/accion-servidor";
import { campo, type EstadoAccion } from "@/ui/estado-accion";

// Acciones de P-47. Los permisos los verifica cada caso de uso.

export async function cerrarJornadaAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await cerrarJornada(db, authUserId, campo(datos, "fecha"));
    return { ok: true, mensaje: "Día cerrado. El resumen quedó guardado." };
  });
}

export async function justificarPendientesAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    const n = await justificarPendientes(db, authUserId, campo(datos, "fecha"));
    return { ok: true, mensaje: `${n} ${n === 1 ? "producto quedó" : "productos quedaron"} como no conseguido.` };
  });
}

export async function reabrirJornadaAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await reabrirJornada(db, authUserId, { fecha: campo(datos, "fecha"), motivo: campo(datos, "motivo") });
    return { ok: true, mensaje: "Día reabierto: ya se pueden hacer cambios." };
  });
}
