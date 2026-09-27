import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { obtenerBaseDatos } from "@/db/cliente";
import { configuracionSupabase } from "@/lib/supabase/configuracion";
import { googleHabilitado } from "@/lib/supabase/proveedores";
import { configuracionInicialPendiente } from "@/modulos/configuracion/configuracion-inicial";

import { entrarConGoogle } from "./acciones";
import { FormularioIngreso } from "./formulario-ingreso";

export const metadata: Metadata = { title: "Entrar · Sistema Juan" };

export default async function PaginaIngreso({ searchParams }: PageProps<"/login">) {
  await connection();
  const conectado = configuracionSupabase() !== null;
  // Primer uso: todavía no hay negocio ni usuarios, se va a crear el primero.
  if (conectado && process.env.DATABASE_URL && (await configuracionInicialPendiente(obtenerBaseDatos()))) {
    redirect("/configuracion-inicial");
  }
  const conGoogle = conectado && (await googleHabilitado());
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Sistema Juan</h1>
        <p className="text-texto-suave">Entrá con tu usuario y tu contraseña{conGoogle ? " o con Google" : ""}.</p>
      </header>
      {!conectado && (
        <p role="status" className="rounded-lg border border-borde bg-superficie px-3 py-2 text-texto-suave">
          Este entorno todavía no tiene la conexión a Supabase configurada (archivo <code>.env.local</code>).
        </p>
      )}
      {error === "google" && (
        <p role="alert" className="rounded-lg border border-error px-3 py-2 text-error">
          No se pudo entrar con Google. Probá de nuevo.
        </p>
      )}
      {conGoogle && (
        <>
          <form action={entrarConGoogle}>
            <button type="submit" className="flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-borde bg-superficie font-semibold">
              <span aria-hidden className="text-lg font-bold">
                G
              </span>
              Entrar con Google
            </button>
          </form>
          <p className="text-center text-sm text-texto-suave">o con tu usuario</p>
        </>
      )}
      <FormularioIngreso />
      <p className="text-texto-suave">
        ¿Primera vez?{" "}
        <Link href="/crear-cuenta" className="font-medium underline">
          Creá una cuenta
        </Link>
        {conGoogle && " o entrá con Google"}: después alguien que ya usa el sistema te habilita.
      </p>
    </main>
  );
}
