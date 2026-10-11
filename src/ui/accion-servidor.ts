import "server-only";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { notFound, redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { obtenerBaseDatos } from "@/db/cliente";
import type { BaseDatos } from "@/db/tipos";
import { esErrorDeNegocio } from "@/dominio/errores";
import { pulsoDeCambios } from "@/modulos/colaboracion/pulso";
import { obtenerAuthUserId } from "@/modulos/seguridad/sesion";

import { resultadoDeAccion, type EstadoAccion } from "./estado-accion";

/** Lo que se muestra si algo falla por un problema del sistema (no por lo que hizo la persona). */
export const MENSAJE_ERROR_INESPERADO =
  "No se pudo completar por un problema del sistema (no es un error tuyo). Probá de nuevo en un momento; si vuelve a pasar, avisale a Facundo qué estabas haciendo.";

/** La cookie donde cada acción anota hasta qué número del pulso llega lo que acaba de guardar. */
export const COOKIE_PULSO = "pulso";

/**
 * Anota el pulso de los cambios justo después de guardar: la pantalla que vuelve con la respuesta
 * de la acción ya trae ese cambio, así que no hace falta volver a pedirla cuando el aviso de
 * "alguien guardó algo" resulta ser por lo que guardó uno mismo (`src/ui/pulso.tsx`). Se lee antes
 * de redibujar: lo que otra persona guarde después queda por encima de este número y sí redibuja.
 * Si no se puede leer, no pasa nada: la pantalla se pide una vez de más, como antes.
 */
async function anotarPulsoPropio(db: BaseDatos): Promise<void> {
  try {
    (await cookies()).set(COOKIE_PULSO, await pulsoDeCambios(db), { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 });
  } catch (error) {
    console.error("No se pudo anotar el pulso de los cambios:", error);
  }
}

/**
 * Cuerpo común de las acciones de formulario: sesión verificada, errores de negocio como
 * mensaje y, si salió bien, la pantalla se vuelve a dibujar con los datos nuevos. Un error
 * inesperado (la base no responde, un error de programación) no rompe la pantalla: se registra
 * en el servidor y la persona ve qué hacer.
 */
export async function ejecutarAccion(fn: (ctx: { db: BaseDatos; authUserId: string }) => Promise<EstadoAccion>): Promise<EstadoAccion> {
  try {
    return await resultadoDeAccion(async () => {
      const authUserId = await obtenerAuthUserId();
      if (!authUserId) redirect("/login");
      const db = obtenerBaseDatos();
      const resultado = await fn({ db, authUserId });
      if (resultado.ok) {
        await anotarPulsoPropio(db);
        refresh();
      }
      return resultado;
    });
  } catch (error) {
    unstable_rethrow(error);
    console.error("Error inesperado en una acción:", error);
    return { ok: false, mensaje: MENSAJE_ERROR_INESPERADO };
  }
}

/** Casilla de un formulario: el navegador manda "on" si está tildada y nada si no. */
export function tildada(datos: FormData, nombre: string): boolean {
  return datos.get(nombre) === "on";
}

/** Id de la URL: si no tiene formato de id, la página no existe (evita un error de la base). */
export function idDeRuta(valor: string): string {
  if (!z.uuid().safeParse(valor).success) notFound();
  return valor;
}

/** Carga los datos de una ficha: si no existe (o es de otra empresa), la página no existe. */
export async function cargarFicha<T>(promesa: Promise<T>): Promise<T> {
  try {
    return await promesa;
  } catch (error) {
    if (esErrorDeNegocio(error, "NO_ENCONTRADO")) notFound();
    throw error;
  }
}
