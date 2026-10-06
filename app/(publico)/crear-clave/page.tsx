import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { obtenerSesion } from "@/modulos/seguridad/sesion";
import { LARGO_MINIMO_CLAVE, identificadorVisible } from "@/seguridad/identificacion";
import { CampoClave } from "@/ui/campo-clave";
import { FormularioAccion } from "@/ui/formulario-accion";

import { elegirClave } from "./acciones";

export const metadata: Metadata = { title: "Elegí tu contraseña · Sistema Repartos" };

/** Primer ingreso con clave provisoria (02 §10.2): antes de usar el sistema, cada uno elige la suya. */
export default async function PaginaElegirClave() {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");
  if (!sesion.debeCambiarClave) redirect("/inicio");

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Hola, {sesion.nombre.split(" ")[0]}</h1>
        <p className="text-texto-suave">
          Entraste con una clave provisoria. Inventá tu contraseña: desde ahora entrás con tu usuario <b>{identificadorVisible(sesion.email)}</b> y
          esa contraseña.
        </p>
      </header>
      <FormularioAccion accion={elegirClave} boton="Guardar y entrar">
        <CampoClave etiqueta="Tu contraseña" name="nueva" autoComplete="new-password" ayuda={`Al menos ${LARGO_MINIMO_CLAVE} caracteres.`} />
      </FormularioAccion>
    </main>
  );
}
