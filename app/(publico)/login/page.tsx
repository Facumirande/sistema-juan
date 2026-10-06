import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { obtenerBaseDatos } from "@/db/cliente";
import { configuracionSupabase } from "@/lib/supabase/configuracion";
import { configuracionInicialPendiente } from "@/modulos/configuracion/configuracion-inicial";

import { AvisoGoogle, BotonGoogle } from "./boton-google";
import { FormularioIngreso } from "./formulario-ingreso";

export const metadata: Metadata = { title: "Entrar · Sistema Juan" };

export default async function PaginaIngreso({ searchParams }: PageProps<"/login">) {
  await connection();
  const conectado = configuracionSupabase() !== null;
  // Primer uso: todavía no hay negocio ni usuarios, se va a crear el primero. Si la base no
  // responde, se muestra el aviso en vez de una página de error.
  const primerUso = conectado && process.env.DATABASE_URL ? await configuracionInicialPendiente(obtenerBaseDatos()).catch(() => null) : false;
  if (primerUso) redirect("/configuracion-inicial");
  const sinBase = primerUso === null;
  // Google se ofrece siempre (06/10/2026): si falta activarlo en Supabase, el botón lo avisa.
  const conGoogle = conectado;
  const error = (await searchParams).error;

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
      {sinBase && (
        <p role="alert" className="rounded-lg border border-error px-3 py-2 text-error">
          El sistema no está disponible en este momento (no responde la base de datos). Probá de nuevo en unos minutos; si sigue igual, avisale a Facundo.
        </p>
      )}
      <AvisoGoogle error={typeof error === "string" ? error : undefined} />
      {conGoogle && (
        <>
          <BotonGoogle />
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
