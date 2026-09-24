import "server-only";

import { connection } from "next/server";
import { cache } from "react";

import { obtenerBaseDatos } from "@/db/cliente";
import { esErrorDeNegocio } from "@/dominio/errores";
import { configuracionSupabase } from "@/lib/supabase/configuracion";
import { crearClienteSupabaseServidor } from "@/lib/supabase/servidor";
import type { Permiso } from "@/seguridad/catalogo-permisos";

import { ejecutarComoUsuario } from "./contexto";

/** Datos de la sesión que se pueden mostrar en pantalla: nunca incluye datos de otras personas ni de negocio. */
export interface SesionVisible {
  usuarioId: string;
  nombre: string;
  email: string;
  empresaId: string;
  zonaHoraria: string;
  roles: string[];
  permisos: Permiso[];
}

/**
 * Usuario de Supabase Auth verificado (firma del token) o null. Marca la pantalla como
 * dinámica: nada que dependa de la sesión se prerenderiza ni se cachea entre usuarios (01 §12).
 */
export async function obtenerAuthUserId(): Promise<string | null> {
  await connection();
  if (!configuracionSupabase()) return null;
  const supabase = await crearClienteSupabaseServidor();
  const { data } = await supabase.auth.getClaims();
  return typeof data?.claims?.sub === "string" ? data.claims.sub : null;
}

/**
 * Sesión del pedido actual, resuelta una vez por pedido. Devuelve null si no hay sesión o
 * si el usuario no existe o está desactivado en el sistema.
 */
export const obtenerSesion = cache(async (): Promise<SesionVisible | null> => {
  const authUserId = await obtenerAuthUserId();
  if (!authUserId) return null;
  try {
    return await ejecutarComoUsuario(obtenerBaseDatos(), authUserId, null, async (_tx, c) => ({
      usuarioId: c.usuarioId,
      nombre: c.nombre,
      email: c.email,
      empresaId: c.empresaId,
      zonaHoraria: c.zonaHoraria,
      roles: c.roles,
      permisos: c.permisos.lista(),
    }));
  } catch (error) {
    if (esErrorDeNegocio(error, "NO_AUTENTICADO")) return null;
    throw error;
  }
});
