import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { configuracionSupabase } from "./configuracion";

/** Cliente de Supabase para Server Components, Server Actions y Route Handlers. Solo se usa para Auth y Storage. */
export async function crearClienteSupabaseServidor() {
  const configuracion = configuracionSupabase();
  if (!configuracion) throw new Error("Supabase no está configurado (NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).");
  const almacenCookies = await cookies();
  return createServerClient(configuracion.url, configuracion.clavePublica, {
    cookies: {
      getAll() {
        return almacenCookies.getAll();
      },
      setAll(cookiesAGuardar) {
        try {
          for (const { name, value, options } of cookiesAGuardar) almacenCookies.set(name, value, options);
        } catch {
          // Desde un Server Component no se pueden escribir cookies; el proxy ya refrescó la sesión.
        }
      },
    },
  });
}
