import "server-only";

import { refresh } from "next/cache";
import { notFound, redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { obtenerBaseDatos } from "@/db/cliente";
import type { BaseDatos } from "@/db/tipos";
import { esErrorDeNegocio } from "@/dominio/errores";
import { obtenerAuthUserId } from "@/modulos/seguridad/sesion";

import { resultadoDeAccion, type EstadoAccion } from "./estado-accion";

/** Lo que se muestra si algo falla por un problema del sistema (no por lo que hizo la persona). */
export const MENSAJE_ERROR_INESPERADO =
  "No se pudo completar por un problema del sistema (no es un error tuyo). Probá de nuevo en un momento; si vuelve a pasar, avisale a Facundo qué estabas haciendo.";

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
      const resultado = await fn({ db: obtenerBaseDatos(), authUserId });
      if (resultado.ok) refresh();
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
