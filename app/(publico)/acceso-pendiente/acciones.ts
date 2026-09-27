"use server";

import { redirect } from "next/navigation";

import { obtenerBaseDatos } from "@/db/cliente";
import { crearClienteSupabaseServidor } from "@/lib/supabase/servidor";
import { pedirAcceso } from "@/modulos/usuarios/acceso";
import { resultadoDeAccion, type EstadoAccion } from "@/ui/estado-accion";

/** Para una cuenta que entró pero no quedó registrada (ej. hubo demasiados pedidos): lo pide de nuevo. */
export async function pedirAccesoAccion(): Promise<EstadoAccion> {
  const supabase = await crearClienteSupabaseServidor();
  const { data } = await supabase.auth.getUser();
  if (!data.user?.email) redirect("/login");
  const metadatos = data.user.user_metadata as { full_name?: string; name?: string };
  return resultadoDeAccion(async () => {
    await pedirAcceso(obtenerBaseDatos(), {
      authUserId: data.user.id,
      nombre: metadatos.full_name ?? metadatos.name ?? "",
      email: data.user.email!,
    });
    redirect("/acceso-pendiente");
  });
}
