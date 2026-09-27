"use server";

import { redirect } from "next/navigation";

import { obtenerBaseDatos } from "@/db/cliente";
import { crearClienteSupabaseServidor } from "@/lib/supabase/servidor";
import { obtenerAuthUserId } from "@/modulos/seguridad/sesion";
import { marcarClavePropia } from "@/modulos/usuarios/usuarios";
import { LARGO_MINIMO_CLAVE } from "@/seguridad/identificacion";
import { campo, type EstadoAccion } from "@/ui/estado-accion";

/** Primer ingreso con clave provisoria: la persona elige su contraseña y sigue al inicio. */
export async function elegirClave(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  const authUserId = await obtenerAuthUserId();
  if (!authUserId) redirect("/login");

  const nueva = campo(datos, "nueva");
  if (nueva.length < LARGO_MINIMO_CLAVE) return { ok: false, mensaje: `La contraseña tiene que tener al menos ${LARGO_MINIMO_CLAVE} caracteres.` };

  const supabase = await crearClienteSupabaseServidor();
  const { error } = await supabase.auth.updateUser({ password: nueva });
  if (error?.code === "same_password") return { ok: false, mensaje: "Esa es la clave provisoria: inventá una tuya." };
  if (error?.code === "weak_password") return { ok: false, mensaje: "La contraseña es muy débil: usá una más larga o con letras y números." };
  if (error) return { ok: false, mensaje: "No se pudo guardar la contraseña. Probá de nuevo." };

  await marcarClavePropia(obtenerBaseDatos(), authUserId);
  redirect("/inicio");
}
