import type { Metadata } from "next";

import { obtenerBaseDatos } from "@/db/cliente";
import { listarCategorias } from "@/modulos/catalogo/categorias";
import { recargosParaAlta } from "@/modulos/catalogo/productos";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { Encabezado } from "@/ui/formularios";

import { FormularioProducto } from "./formulario";

export const metadata: Metadata = { title: "Nuevo producto · Sistema Juan" };

/** Alta guiada de un producto (P-10): paso a paso, con la tarjeta de cómo va a quedar. */
export default async function NuevoProducto() {
  const sesion = await sesionParaPantalla("productos.editar");
  const db = obtenerBaseDatos();
  const [categorias, recargos] = await Promise.all([listarCategorias(db, sesion.authUserId, { soloConProductos: true }), recargosParaAlta(db, sesion.authUserId)]);
  const activas = categorias.map((c) => ({ id: c.id, nombre: c.nombre, grupo: c.grupo }));
  const verRecargos = sesion.permisos.includes("precios.editar_reglas") && sesion.permisos.includes("precios.ver_margenes");

  return (
    <section className="flex max-w-5xl flex-col gap-6">
      <Encabezado titulo="Nuevo producto" volver={{ ruta: "/productos", texto: "Productos" }} descripcion="Tres preguntas y listo. Los proveedores y los precios se cargan en su ficha o solos con la primera compra. Para cargar muchos juntos, usá la planilla de productos." />
      <FormularioProducto
        categorias={activas}
        codigos={recargos.codigos}
        recargoGlobal={String(Number(recargos.global))}
        recargoPorCategoria={Object.fromEntries(Object.entries(recargos.porCategoria).map(([k, v]) => [k, v ? String(Number(v)) : null]))}
        verRecargos={verRecargos}
      />
    </section>
  );
}
