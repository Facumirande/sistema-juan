import type { Metadata } from "next";

import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { Encabezado } from "@/ui/formularios";

import { FormularioCliente } from "./formulario";

export const metadata: Metadata = { title: "Nuevo cliente · Sistema Juan" };

/** Alta guiada de un cliente (P-15): tres preguntas; lo demás, opcional. */
export default async function NuevoCliente() {
  await sesionParaPantalla("clientes.editar");
  return (
    <section className="flex max-w-5xl flex-col gap-6">
      <Encabezado titulo="Nuevo cliente" volver={{ ruta: "/clientes", texto: "Clientes" }} descripcion="Tres preguntas y listo. Lo que no sepas ahora lo podés completar después en su ficha." />
      <FormularioCliente />
    </section>
  );
}
