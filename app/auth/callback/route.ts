import { NextResponse, type NextRequest } from "next/server";

import { obtenerBaseDatos } from "@/db/cliente";
import { crearClienteSupabaseServidor } from "@/lib/supabase/servidor";
import { pedirAcceso } from "@/modulos/usuarios/acceso";

/**
 * Vuelta de "Entrar con Google": cambia el código por la sesión y, si es la primera vez, deja
 * el pedido de acceso para que un administrador lo habilite.
 */
export async function GET(request: NextRequest) {
  const ir = (ruta: string) => NextResponse.redirect(new URL(ruta, request.url));
  const codigo = request.nextUrl.searchParams.get("code");
  if (!codigo) return ir("/login?error=google");

  const supabase = await crearClienteSupabaseServidor();
  const { data, error } = await supabase.auth.exchangeCodeForSession(codigo);
  if (error || !data.user?.email) return ir("/login?error=google");

  const metadatos = data.user.user_metadata as { full_name?: string; name?: string };
  try {
    const estado = await pedirAcceso(obtenerBaseDatos(), {
      authUserId: data.user.id,
      nombre: metadatos.full_name ?? metadatos.name ?? "",
      email: data.user.email,
    });
    return ir(estado === "ACTIVO" ? "/inicio" : "/acceso-pendiente");
  } catch {
    // Sin lugar para más pedidos, o el sistema sin configurar: la pantalla de acceso lo explica.
    return ir("/acceso-pendiente");
  }
}
