"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { configuracionSupabase } from "@/lib/supabase/configuracion";
import { googleHabilitado, origenDelPedido } from "@/lib/supabase/proveedores";
import { crearClienteSupabaseServidor } from "@/lib/supabase/servidor";
import { interpretarIdentificador } from "@/seguridad/identificacion";

export interface EstadoIngreso {
  error: string | null;
  identificador: string;
}

const esquemaIngreso = z.object({
  identificador: z.string().trim().min(1, "Escribí tu usuario."),
  clave: z.string().min(1, "Escribí tu contraseña."),
});

const CREDENCIALES_INCORRECTAS = "El usuario o la contraseña no son correctos.";

export async function ingresar(_estado: EstadoIngreso, formulario: FormData): Promise<EstadoIngreso> {
  const identificador = String(formulario.get("identificador") ?? "");
  if (!configuracionSupabase()) {
    return { identificador, error: "El sistema todavía no está conectado a Supabase. Falta cargar la configuración." };
  }
  const datos = esquemaIngreso.safeParse({ identificador, clave: formulario.get("clave") });
  if (!datos.success) {
    return { identificador, error: datos.error.issues[0]?.message ?? "Revisá los datos." };
  }
  // Un nombre de usuario se traduce a su correo interno (02 §10.2).
  const cuenta = interpretarIdentificador(datos.data.identificador);
  if (!cuenta) return { identificador, error: CREDENCIALES_INCORRECTAS };

  const supabase = await crearClienteSupabaseServidor();
  const { error } = await supabase.auth.signInWithPassword({ email: cuenta.email, password: datos.data.clave });
  if (error) {
    // Mismo mensaje para usuario inexistente y contraseña incorrecta: no revela qué cuentas existen.
    return { identificador, error: CREDENCIALES_INCORRECTAS };
  }
  redirect("/inicio");
}

/**
 * "Entrar con Google": Supabase lleva a Google y vuelve a /auth/callback con un código. Si Google
 * todavía no está activado en Supabase, vuelve al ingreso con un aviso (en vez de la página de
 * error de Supabase).
 */
export async function entrarConGoogle(): Promise<void> {
  if (!configuracionSupabase()) redirect("/login");
  if (!(await googleHabilitado(true))) redirect("/login?error=google-sin-activar");
  const supabase = await crearClienteSupabaseServidor();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origenDelPedido(await headers())}/auth/callback` },
  });
  if (error || !data.url) redirect("/login?error=google");
  redirect(data.url);
}
