import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { configuracionSupabase } from "./configuracion";

const RUTAS_PUBLICAS = ["/login", "/recuperar", "/invitacion", "/auth"];

function esRutaPublica(ruta: string): boolean {
  return RUTAS_PUBLICAS.some((publica) => ruta === publica || ruta.startsWith(`${publica}/`));
}

/**
 * Refresca la sesión de Supabase en cada pedido (cookies httpOnly) y manda al ingreso a
 * quien no tiene sesión. Es solo un control optimista: los permisos se verifican en el
 * servidor en cada acción (02 §8).
 */
export async function actualizarSesion(request: NextRequest): Promise<NextResponse> {
  const configuracion = configuracionSupabase();
  if (!configuracion) {
    return esRutaPublica(request.nextUrl.pathname)
      ? NextResponse.next({ request })
      : NextResponse.redirect(new URL("/login", request.url));
  }

  let respuesta = NextResponse.next({ request });
  const supabase = createServerClient(configuracion.url, configuracion.clavePublica, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesAGuardar, encabezados) {
        for (const { name, value } of cookiesAGuardar) request.cookies.set(name, value);
        respuesta = NextResponse.next({ request });
        for (const { name, value, options } of cookiesAGuardar) respuesta.cookies.set(name, value, options);
        for (const [clave, valor] of Object.entries(encabezados)) respuesta.headers.set(clave, valor);
      },
    },
  });

  // No agregar código entre createServerClient y getClaims (recomendación de Supabase).
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims && !esRutaPublica(request.nextUrl.pathname)) {
    const destino = new URL("/login", request.url);
    const redireccion = NextResponse.redirect(destino);
    for (const cookie of respuesta.cookies.getAll()) redireccion.cookies.set(cookie);
    return redireccion;
  }
  return respuesta;
}
