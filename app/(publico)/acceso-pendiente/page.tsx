import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { obtenerBaseDatos } from "@/db/cliente";
import { estadoDeAcceso } from "@/modulos/usuarios/acceso";
import { obtenerAuthUserId } from "@/modulos/seguridad/sesion";
import { FormularioAccion } from "@/ui/formulario-accion";
import { clasesBoton } from "@/ui/formularios";

import { pedirAccesoAccion } from "./acciones";

export const metadata: Metadata = { title: "Esperando acceso · Sistema Juan" };

const TEXTOS = {
  PENDIENTE: {
    titulo: "Listo, ya pediste acceso",
    texto: "Tu pedido está esperando que te habilite alguien que ya usa el sistema. Avisale; cuando te habilite, volvé a entrar o recargá esta página.",
  },
  SIN_ACCESO: {
    titulo: "No tenés acceso",
    texto: "Tu cuenta no está habilitada para usar el sistema. Si es un error, hablá con quien lo administra.",
  },
  SIN_PEDIDO: {
    titulo: "Falta pedir acceso",
    texto: "Tu cuenta todavía no pidió acceso al sistema.",
  },
} as const;

/** Pantalla de espera para quien entró (con Google o su cuenta) y todavía no está habilitado. */
export default async function PaginaAccesoPendiente() {
  const authUserId = await obtenerAuthUserId();
  if (!authUserId) redirect("/login");
  const estado = await estadoDeAcceso(obtenerBaseDatos(), authUserId);
  if (estado === "ACTIVO") redirect("/inicio");
  const { titulo, texto } = TEXTOS[estado];

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 px-4 py-10">
      <h1 className="text-2xl font-semibold">{titulo}</h1>
      <p className="text-texto-suave">{texto}</p>
      {estado === "SIN_PEDIDO" && <FormularioAccion accion={pedirAccesoAccion} boton="Pedir acceso" />}
      <form action="/auth/salir" method="post">
        <button type="submit" className={clasesBoton("secundario")}>
          Salir
        </button>
      </form>
    </main>
  );
}
