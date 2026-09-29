import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { obtenerBaseDatos } from "@/db/cliente";
import { otrasPersonas } from "@/modulos/colaboracion/personas";
import { obtenerAuthUserId, obtenerSesion } from "@/modulos/seguridad/sesion";
import { identificadorVisible, LARGO_MINIMO_CLAVE } from "@/seguridad/identificacion";
import { CampoClave } from "@/ui/campo-clave";
import { FormularioAccion } from "@/ui/formulario-accion";

import { cambiarMiClave } from "./acciones";
import { FormularioPerfil } from "./perfil";

export const metadata: Metadata = { title: "Mi cuenta · Sistema Juan" };

/** P-03 Mi cuenta: perfil (nombre y color con los que te ven los demás) y cambio de contraseña. */
export default async function PaginaMiCuenta() {
  const sesion = await obtenerSesion();
  const authUserId = await obtenerAuthUserId();
  if (!sesion || !authUserId) redirect("/login");
  const otras = await otrasPersonas(obtenerBaseDatos(), authUserId);

  return (
    <section className="flex max-w-md flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Mi cuenta</h1>
        <p className="text-texto-suave">
          {sesion.nombre} · tu usuario es <b>{identificadorVisible(sesion.email)}</b>
        </p>
      </header>

      <div className="rounded-lg border border-borde bg-superficie p-4">
        <h2 className="mb-4 text-lg font-semibold">Tu perfil</h2>
        <FormularioPerfil nombre={sesion.nombre} color={sesion.color} otras={otras} />
      </div>

      <div className="rounded-lg border border-borde bg-superficie p-4">
        <h2 className="mb-4 text-lg font-semibold">Cambiar la contraseña</h2>
        <FormularioAccion accion={cambiarMiClave} boton="Cambiar contraseña">
          <CampoClave etiqueta="Contraseña actual" name="actual" autoComplete="current-password" />
          <CampoClave etiqueta="Contraseña nueva" name="nueva" autoComplete="new-password" ayuda={`Al menos ${LARGO_MINIMO_CLAVE} caracteres.`} />
        </FormularioAccion>
      </div>
    </section>
  );
}
