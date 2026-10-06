"use server";

import { refresh } from "next/cache";

import { obtenerBaseDatos } from "@/db/cliente";
import { marcarAvisosVistos } from "@/modulos/colaboracion/avisos";
import type { TipoEntidad } from "@/modulos/colaboracion/registro";
import { borrarNota, escribirNota, marcarNotasLeidas } from "@/modulos/colaboracion/notas";
import { obtenerAuthUserId } from "@/modulos/seguridad/sesion";
import { ejecutarAccion } from "@/ui/accion-servidor";
import { campo, type EstadoAccion } from "@/ui/estado-accion";

// Notas entre las personas (tarjetas del tablero y fichas). Los permisos los verifica cada caso de uso.

export async function escribirNotaAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await escribirNota(db, authUserId, {
      entidadTipo: campo(datos, "entidadTipo") as TipoEntidad,
      entidadId: campo(datos, "entidadId"),
      texto: campo(datos, "texto"),
      paraUsuarioId: campo(datos, "para"),
    });
    return { ok: true, mensaje: null };
  });
}

export async function borrarNotaAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await borrarNota(db, authUserId, campo(datos, "notaId"));
    return { ok: true, mensaje: null };
  });
}

/** Al abrir una tarjeta o ficha con notas sin leer (lo llama la pantalla, sin formulario). */
export async function marcarLeidasAccion(entidadTipo: TipoEntidad, entidadId: string): Promise<void> {
  const authUserId = await obtenerAuthUserId();
  if (!authUserId) return;
  const marcadas = await marcarNotasLeidas(obtenerBaseDatos(), authUserId, { tipo: entidadTipo, id: entidadId });
  if (marcadas > 0) refresh();
}

export async function marcarTodasLeidasAccion(): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    const n = await marcarNotasLeidas(db, authUserId, "TODAS");
    return { ok: true, mensaje: n ? "Listo: todas leídas." : "No había notas sin leer." };
  });
}

/** Al abrir la campanita: lo que hicieron los demás hasta ahora queda visto. */
export async function marcarAvisosVistosAccion(): Promise<void> {
  const authUserId = await obtenerAuthUserId();
  if (!authUserId) return;
  await marcarAvisosVistos(obtenerBaseDatos(), authUserId);
}

/**
 * "Pedirle algo" a otra persona desde la campanita: un aviso que no es sobre un pedido ni una
 * ficha en particular. Le aparece como "para vos" hasta que lo lee.
 */
export async function pedirAlgoAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    const para = campo(datos, "para");
    if (!para) return { ok: false, mensaje: "Elegí a quién le querés avisar." };
    await escribirNota(db, authUserId, { entidadTipo: "USUARIO", entidadId: para, texto: campo(datos, "texto"), paraUsuarioId: para });
    return { ok: true, mensaje: "Listo: le va a aparecer en la campanita." };
  });
}
