import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { obtenerBaseDatos } from "@/db/cliente";
import { otrasPersonas } from "@/modulos/colaboracion/personas";
import { obtenerAuthUserId, obtenerSesion } from "@/modulos/seguridad/sesion";
import { identificadorVisible, LARGO_MINIMO_CLAVE } from "@/seguridad/identificacion";
import { CampoClave } from "@/ui/campo-clave";
import { FormularioAccion } from "@/ui/formulario-accion";
import { clasesBoton } from "@/ui/formularios";

import { cambiarMiClave } from "./acciones";
import { FormularioPerfil } from "./perfil";

export const metadata: Metadata = { title: "Mi cuenta · Sistema Repartos" };

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

      {(sesion.permisos.includes("usuarios.administrar") || sesion.permisos.includes("configuracion.ver")) && (
        <div className="flex flex-col gap-3 rounded-lg border border-borde bg-superficie p-4">
          <h2 className="text-lg font-semibold">Administración</h2>
          <p className="text-sm text-texto-suave">Quién puede entrar al sistema y los datos y ajustes del negocio.</p>
          <div className="flex flex-wrap gap-2">
            {sesion.permisos.includes("usuarios.administrar") && (
              <Link href="/usuarios" className={clasesBoton("secundario")}>
                👤 Usuarios
              </Link>
            )}
            {sesion.permisos.includes("configuracion.ver") && (
              <Link href="/configuracion" className={clasesBoton("secundario")}>
                ⚙️ Configuración del negocio
              </Link>
            )}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-borde bg-superficie p-4">
        <h2 className="mb-4 text-lg font-semibold">Cambiar la contraseña</h2>
        <FormularioAccion accion={cambiarMiClave} boton="Cambiar contraseña">
          <CampoClave etiqueta="Contraseña actual" name="actual" autoComplete="current-password" required />
          <CampoClave etiqueta="Contraseña nueva" name="nueva" autoComplete="new-password" ayuda={`Al menos ${LARGO_MINIMO_CLAVE} caracteres.`} required />
        </FormularioAccion>
      </div>
    </section>
  );
}
