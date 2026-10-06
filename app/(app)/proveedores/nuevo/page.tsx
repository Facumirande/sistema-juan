import type { Metadata } from "next";

import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { Encabezado } from "@/ui/formularios";

import { FormularioProveedor } from "./formulario";

export const metadata: Metadata = { title: "Nuevo proveedor · Sistema Repartos" };

/** Alta guiada de un proveedor (P-20): tres preguntas; lo demás, opcional. */
export default async function NuevoProveedor() {
  const sesion = await sesionParaPantalla("proveedores.editar");
  return (
    <section className="flex max-w-5xl flex-col gap-6">
      <Encabezado titulo="Nuevo proveedor" volver={{ ruta: "/proveedores", texto: "Proveedores" }} descripcion="Tres preguntas y listo. Los productos que vende y sus precios se cargan en su ficha o solos con la primera compra." />
      <FormularioProveedor editarCredito={sesion.permisos.includes("proveedores.editar_limite")} />
    </section>
  );
}
