import { NextResponse, type NextRequest } from "next/server";

import { configuracionSupabase } from "@/lib/supabase/configuracion";
import { crearClienteSupabaseServidor } from "@/lib/supabase/servidor";

export async function POST(request: NextRequest) {
  if (configuracionSupabase()) {
    const supabase = await crearClienteSupabaseServidor();
    await supabase.auth.signOut();
  }
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
