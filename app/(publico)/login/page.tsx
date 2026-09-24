import type { Metadata } from "next";

import { configuracionSupabase } from "@/lib/supabase/configuracion";

import { FormularioIngreso } from "./formulario-ingreso";

export const metadata: Metadata = { title: "Ingresar · Sistema Juan" };

export default function PaginaIngreso() {
  const conectado = configuracionSupabase() !== null;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Sistema Juan</h1>
        <p className="text-texto-suave">Ingresá con tu correo y tu contraseña.</p>
      </header>
      {!conectado && (
        <p role="status" className="rounded-lg border border-borde bg-superficie px-3 py-2 text-texto-suave">
          Este entorno todavía no tiene la conexión a Supabase configurada (archivo <code>.env.local</code>).
        </p>
      )}
      <FormularioIngreso />
    </main>
  );
}
