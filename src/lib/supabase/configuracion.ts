export interface ConfiguracionSupabase {
  url: string;
  clavePublica: string;
}

/** Devuelve la configuración pública de Supabase o null si todavía no está cargada en el entorno. */
export function configuracionSupabase(): ConfiguracionSupabase | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clavePublica = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !clavePublica) return null;
  return { url, clavePublica };
}
