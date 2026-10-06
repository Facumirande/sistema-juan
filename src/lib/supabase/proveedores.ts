import "server-only";

import { configuracionSupabase } from "./configuracion";

/**
 * ¿Está activado "Entrar con Google" en Supabase (Authentication → Sign In / Providers)? Se
 * consulta la configuración pública de Auth. El botón se muestra siempre (pedido del usuario,
 * 06/10/2026); esto decide si se puede ir a Google o hay que avisar que falta activarlo. Con
 * `alMomento` no usa la copia guardada (se pregunta justo antes de ir a Google).
 */
export async function googleHabilitado(alMomento = false): Promise<boolean> {
  const configuracion = configuracionSupabase();
  if (!configuracion) return false;
  try {
    const respuesta = await fetch(`${configuracion.url}/auth/v1/settings`, {
      headers: { apikey: configuracion.clavePublica },
      ...(alMomento ? { cache: "no-store" as const } : { next: { revalidate: 300 } }),
    });
    if (!respuesta.ok) return false;
    const ajustes = (await respuesta.json()) as { external?: { google?: boolean } };
    return ajustes.external?.google === true;
  } catch {
    return false;
  }
}

/** Dirección de esta app tal como la ve el navegador (para volver después de Google). */
export function origenDelPedido(encabezados: Headers): string {
  const host = encabezados.get("x-forwarded-host") ?? encabezados.get("host") ?? "localhost:3000";
  const protocolo = encabezados.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${protocolo}://${host}`;
}
