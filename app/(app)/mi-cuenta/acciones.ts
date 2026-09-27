"use server";

import { redirect } from "next/navigation";

import { obtenerBaseDatos } from "@/db/cliente";
import { crearClienteSupabaseServidor } from "@/lib/supabase/servidor";
import { obtenerAuthUserId, obtenerSesion } from "@/modulos/seguridad/sesion";
import { marcarClavePropia } from "@/modulos/usuarios/usuarios";
import { LARGO_MINIMO_CLAVE } from "@/seguridad/identificacion";
import { campo, type EstadoAccion } from "@/ui/estado-accion";

/** Cambio de la propia contraseña (P-03). Pide la actual para que nadie la cambie con una sesión que quedó abierta. */
export async function cambiarMiClave(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  const sesion = await obtenerSesion();
  const authUserId = await obtenerAuthUserId();
  if (!sesion || !authUserId) redirect("/login");

  const actual = campo(datos, "actual");
  const nueva = campo(datos, "nueva");
  if (!actual) return { ok: false, mensaje: "Escribí tu contraseña actual." };
  if (nueva.length < LARGO_MINIMO_CLAVE) {
    return { ok: false, mensaje: `La contraseña nueva tiene que tener al menos ${LARGO_MINIMO_CLAVE} caracteres.` };
  }

  const supabase = await crearClienteSupabaseServidor();
  const verificacion = await supabase.auth.signInWithPassword({ email: sesion.email, password: actual });
  if (verificacion.error) return { ok: false, mensaje: "La contraseña actual no es correcta." };

  const { error } = await supabase.auth.updateUser({ password: nueva });
  if (error?.code === "same_password") return { ok: false, mensaje: "La contraseña nueva tiene que ser distinta de la actual." };
  if (error?.code === "weak_password") return { ok: false, mensaje: "La contraseña es muy débil: usá una más larga o con letras y números." };
  if (error) return { ok: false, mensaje: "No se pudo cambiar la contraseña. Probá de nuevo." };
  await marcarClavePropia(obtenerBaseDatos(), authUserId);
  return { ok: true, mensaje: "Listo, tu contraseña quedó cambiada." };
}
