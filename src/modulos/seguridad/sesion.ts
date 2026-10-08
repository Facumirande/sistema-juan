import "server-only";

import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";

import { obtenerBaseDatos } from "@/db/cliente";
import { esErrorDeNegocio } from "@/dominio/errores";
import { configuracionSupabase } from "@/lib/supabase/configuracion";
import { crearClienteSupabaseServidor } from "@/lib/supabase/servidor";
import type { Permiso } from "@/seguridad/catalogo-permisos";

import { ejecutarComoUsuario } from "./contexto";
import { olvidarSesiones, recordarSesion, sesionRecordada } from "./memoria-sesion";

/** Datos de la sesión que se pueden mostrar en pantalla: nunca incluye datos de otras personas ni de negocio. */
export interface SesionVisible {
  usuarioId: string;
  nombre: string;
  color: string;
  email: string;
  empresaId: string;
  zonaHoraria: string;
  roles: string[];
  permisos: Permiso[];
  debeCambiarClave: boolean;
}

/**
 * Usuario de Supabase Auth verificado (firma del token) o null. Marca la pantalla como
 * dinámica: nada que dependa de la sesión se prerenderiza ni se cachea entre usuarios (01 §12).
 */
export const obtenerAuthUserId = cache(async (): Promise<string | null> => {
  await connection();
  if (!configuracionSupabase()) return null;
  const supabase = await crearClienteSupabaseServidor();
  const { data } = await supabase.auth.getClaims();
  return typeof data?.claims?.sub === "string" ? data.claims.sub : null;
});

/**
 * Sesión del pedido actual, resuelta una vez por pedido. Devuelve null si no hay sesión o
 * si el usuario no existe o está desactivado en el sistema.
 */
export const obtenerSesion = cache(async (): Promise<SesionVisible | null> => {
  const authUserId = await obtenerAuthUserId();
  if (!authUserId) return null;
  const recordada = sesionRecordada<SesionVisible>(authUserId);
  if (recordada) return recordada;
  try {
    const sesion = await ejecutarComoUsuario(obtenerBaseDatos(), authUserId, null, async (_tx, c): Promise<SesionVisible> => ({
      usuarioId: c.usuarioId,
      nombre: c.nombre,
      color: c.color,
      email: c.email,
      empresaId: c.empresaId,
      zonaHoraria: c.zonaHoraria,
      roles: c.roles,
      permisos: c.permisos.lista(),
      debeCambiarClave: c.debeCambiarClave,
    }));
    // Mientras tenga que elegir su clave no se recuerda: apenas la cambia tiene que poder entrar.
    if (!sesion.debeCambiarClave) recordarSesion(authUserId, sesion);
    return sesion;
  } catch (error) {
    olvidarSesiones();
    if (esErrorDeNegocio(error, "NO_AUTENTICADO")) return null;
    throw error;
  }
});

/**
 * Sesión de una pantalla que exige un permiso: sin sesión manda al ingreso y sin permiso al
 * tablero. La verificación que vale es la de cada caso de uso; esto evita mostrar pantallas vacías.
 */
export async function sesionParaPantalla(permiso: Permiso | null): Promise<SesionVisible & { authUserId: string }> {
  const authUserId = await obtenerAuthUserId();
  const sesion = await obtenerSesion();
  if (!authUserId || !sesion) redirect("/login");
  if (permiso && !sesion.permisos.includes(permiso)) redirect("/inicio");
  return { ...sesion, authUserId };
}
