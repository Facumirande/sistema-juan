import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { obtenerBaseDatos } from "@/db/cliente";
import { configuracionSupabase } from "@/lib/supabase/configuracion";
import { configuracionInicialPendiente } from "@/modulos/configuracion/configuracion-inicial";
import { LARGO_MINIMO_CLAVE } from "@/seguridad/identificacion";
import { CampoClave } from "@/ui/campo-clave";
import { FormularioAccion } from "@/ui/formulario-accion";
import { Campo } from "@/ui/formularios";

import { BotonGoogle } from "../login/boton-google";
import { crearCuenta } from "./acciones";

export const metadata: Metadata = { title: "Crear una cuenta · Sistema Repartos" };

/** Cualquiera puede crearse una cuenta, pero no ve nada hasta que un administrador la habilita. */
export default async function PaginaCrearCuenta() {
  await connection();
  if (process.env.DATABASE_URL && (await configuracionInicialPendiente(obtenerBaseDatos()))) redirect("/configuracion-inicial");

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Crear una cuenta</h1>
        <p className="text-texto-suave">Con tu cuenta de Google, o eligiendo un usuario y una contraseña. Después alguien que ya usa el sistema te habilita.</p>
      </header>
      {configuracionSupabase() && (
        <>
          <BotonGoogle texto="Seguir con Google" />
          <p className="text-center text-sm text-texto-suave">o con un usuario</p>
        </>
      )}
      <FormularioAccion accion={crearCuenta} boton="Crear cuenta">
        <Campo etiqueta="Tu nombre" name="nombre" autoComplete="name" />
        <Campo etiqueta="Usuario" name="identificador" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="Ej. maria" />
        <CampoClave etiqueta="Contraseña" name="clave" autoComplete="new-password" ayuda={`Al menos ${LARGO_MINIMO_CLAVE} caracteres.`} />
      </FormularioAccion>
      <p className="text-texto-suave">
        ¿Ya tenés cuenta?{" "}
        <Link href="/login" className="font-medium underline">
          Entrar
        </Link>
      </p>
    </main>
  );
}
