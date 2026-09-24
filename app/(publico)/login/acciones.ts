"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { configuracionSupabase } from "@/lib/supabase/configuracion";
import { crearClienteSupabaseServidor } from "@/lib/supabase/servidor";

export interface EstadoIngreso {
  error: string | null;
  email: string;
}

const esquemaIngreso = z.object({
  email: z.email("Escribí un correo válido.").trim().toLowerCase(),
  clave: z.string().min(1, "Escribí tu contraseña."),
});

export async function ingresar(_estado: EstadoIngreso, formulario: FormData): Promise<EstadoIngreso> {
  const email = String(formulario.get("email") ?? "");
  if (!configuracionSupabase()) {
    return { email, error: "El sistema todavía no está conectado a Supabase. Falta cargar la configuración." };
  }
  const datos = esquemaIngreso.safeParse({ email, clave: formulario.get("clave") });
  if (!datos.success) {
    return { email, error: datos.error.issues[0]?.message ?? "Revisá los datos." };
  }

  const supabase = await crearClienteSupabaseServidor();
  const { error } = await supabase.auth.signInWithPassword({ email: datos.data.email, password: datos.data.clave });
  if (error) {
    // Mismo mensaje para correo inexistente y contraseña incorrecta: no revela qué cuentas existen.
    return { email, error: "El correo o la contraseña no son correctos." };
  }
  redirect("/inicio");
}
