"use server";

import {
  actualizarReparto,
  agregarAlReparto,
  anularReparto,
  emitirDocumentosDelReparto,
  moverParada,
  proponerOrden,
  quitarDelReparto,
  regresarDeReparto,
  salirDeReparto,
} from "@/modulos/entregas/repartos";
import { ejecutarAccion } from "@/ui/accion-servidor";
import { campo, type EstadoAccion } from "@/ui/estado-accion";

// Acciones de P-76 y P-77. Los permisos los verifica cada caso de uso.

export async function actualizarRepartoAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await actualizarReparto(db, authUserId, {
      repartoId: campo(datos, "repartoId"),
      repartidorId: campo(datos, "repartidorId"),
      vehiculo: campo(datos, "vehiculo"),
      salida: campo(datos, "salida"),
      observaciones: campo(datos, "observaciones"),
    });
    return { ok: true, mensaje: "Guardado." };
  });
}

export async function agregarParadaAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await agregarAlReparto(db, authUserId, { repartoId: campo(datos, "repartoId"), entregaId: campo(datos, "entregaId") });
    return { ok: true, mensaje: null };
  });
}

export async function quitarParadaAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await quitarDelReparto(db, authUserId, { repartoId: campo(datos, "repartoId"), entregaId: campo(datos, "entregaId") });
    return { ok: true, mensaje: null };
  });
}

export async function moverParadaAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await moverParada(db, authUserId, { repartoId: campo(datos, "repartoId"), entregaId: campo(datos, "entregaId"), hacia: campo(datos, "hacia") === "arriba" ? "arriba" : "abajo" });
    return { ok: true, mensaje: null };
  });
}

export async function proponerOrdenAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await proponerOrden(db, authUserId, campo(datos, "repartoId"));
    return { ok: true, mensaje: "Ordenado por horario de recepción." };
  });
}

export async function emitirPendientesAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    const r = await emitirDocumentosDelReparto(db, authUserId, campo(datos, "repartoId"));
    const texto = r.emitidas ? `Documentos emitidos: ${r.emitidas}.` : "No había documentos para emitir.";
    return r.problemas.length ? { ok: false, mensaje: `${texto} ${r.problemas.join(" ")}` } : { ok: true, mensaje: texto };
  });
}

export async function salirAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await salirDeReparto(db, authUserId, campo(datos, "repartoId"));
    return { ok: true, mensaje: "¡Buen viaje! El reparto está en camino." };
  });
}

export async function regresarAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await regresarDeReparto(db, authUserId, campo(datos, "repartoId"));
    return { ok: true, mensaje: "Reparto terminado." };
  });
}

export async function anularRepartoAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await anularReparto(db, authUserId, { repartoId: campo(datos, "repartoId"), motivo: campo(datos, "motivo") });
    return { ok: true, mensaje: "Reparto anulado: sus entregas quedaron sin reparto." };
  });
}
