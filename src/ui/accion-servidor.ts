import "server-only";

import { refresh } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { obtenerBaseDatos } from "@/db/cliente";
import type { BaseDatos } from "@/db/tipos";
import { esErrorDeNegocio } from "@/dominio/errores";
import { obtenerAuthUserId } from "@/modulos/seguridad/sesion";

import { resultadoDeAccion, type EstadoAccion } from "./estado-accion";

/**
 * Cuerpo común de las acciones de formulario: sesión verificada, errores de negocio como
 * mensaje y, si salió bien, la pantalla se vuelve a dibujar con los datos nuevos.
 */
export async function ejecutarAccion(fn: (ctx: { db: BaseDatos; authUserId: string }) => Promise<EstadoAccion>): Promise<EstadoAccion> {
  return resultadoDeAccion(async () => {
    const authUserId = await obtenerAuthUserId();
    if (!authUserId) redirect("/login");
    const resultado = await fn({ db: obtenerBaseDatos(), authUserId });
    if (resultado.ok) refresh();
    return resultado;
  });
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
