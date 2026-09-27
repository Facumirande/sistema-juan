import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { obtenerBaseDatos } from "@/db/cliente";
import { obtenerServicioCuentas } from "@/lib/supabase/cuentas";
import { configuracionSupabase } from "@/lib/supabase/configuracion";
import { configuracionInicialPendiente } from "@/modulos/configuracion/configuracion-inicial";
import { LARGO_MINIMO_CLAVE } from "@/seguridad/identificacion";
import { CampoClave } from "@/ui/campo-clave";
import { FormularioAccion } from "@/ui/formulario-accion";
import { Aviso, Campo } from "@/ui/formularios";

import { configurarSistema } from "./acciones";

export const metadata: Metadata = { title: "Primer uso · Sistema Juan" };

/**
 * Primer uso: se ofrece solo mientras el sistema no tiene usuarios. Crea la cuenta de quien lo
 * abre por primera vez y entra directo; a los demás se los agrega después en Usuarios, y cada
 * uno elige su contraseña en su primer ingreso.
 */
export default async function PaginaPrimerUso() {
  await connection();
  const conectado = configuracionSupabase() !== null && Boolean(process.env.DATABASE_URL);
  if (conectado && !(await configuracionInicialPendiente(obtenerBaseDatos()))) redirect("/login");
  const cuentasListas = obtenerServicioCuentas() !== null;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">¡Hola! Creá tu usuario</h1>
        <p className="text-texto-suave">
          Es la primera vez que se abre el sistema. Poné tu usuario y tu contraseña; después se entra siempre con eso. A las demás personas
          las agregás después en Usuarios, y cada una elige su contraseña la primera vez que entra.
        </p>
      </header>

      {!conectado ? (
        <Aviso>
          Falta la conexión a Supabase en el archivo <code>.env.local</code> (ver <code>.env.example</code>).
        </Aviso>
      ) : !cuentasListas ? (
        <Aviso>
          Falta un único dato: la clave secreta de Supabase. En el panel de Supabase, entrá al proyecto → <b>Project Settings</b> →{" "}
          <b>API Keys</b> → <b>Secret keys</b>, copiá la clave (empieza con <code>sb_secret_</code>) y pegala en{" "}
          <code>.env.local</code> como <code>SUPABASE_SECRET_KEY=…</code>. Después recargá esta página.
        </Aviso>
      ) : (
        <FormularioAccion accion={configurarSistema} boton="Crear y entrar">
          <Campo etiqueta="Tu nombre" name="nombre1" autoComplete="name" />
          <Campo etiqueta="Usuario" name="usuario1" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="Ej. facundo" />
          <CampoClave etiqueta="Contraseña" name="clave1" autoComplete="new-password" ayuda={`Al menos ${LARGO_MINIMO_CLAVE} caracteres.`} />
          <Campo etiqueta="Nombre del negocio (opcional)" name="negocio" autoComplete="organization" ayuda="Sale en los papeles que se imprimen." />
        </FormularioAccion>
      )}

      <p className="text-texto-suave">
        ¿Ya tenés usuario?{" "}
        <Link href="/login" className="font-medium underline">
          Entrar
        </Link>
      </p>
    </main>
  );
}
