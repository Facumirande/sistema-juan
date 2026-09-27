import type { Metadata } from "next";

import { obtenerBaseDatos } from "@/db/cliente";
import { listarCategorias } from "@/modulos/catalogo/categorias";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { GRUPOS, opciones } from "@/ui/etiquetas";
import { FormularioAccion } from "@/ui/formulario-accion";
import { Campo, Desplegable, Encabezado, Estado, Selector } from "@/ui/formularios";

import { cambiarEstadoCategoriaAccion, guardarCategoriaAccion } from "../acciones";

export const metadata: Metadata = { title: "Categorías · Sistema Juan" };

/** P-12 Categorías: el orden es el del recorrido en el mercado y en el depósito. */
export default async function PaginaCategorias() {
  const sesion = await sesionParaPantalla("productos.ver");
  const categorias = await listarCategorias(obtenerBaseDatos(), sesion.authUserId);
  const puedeEditar = sesion.permisos.includes("productos.editar");

  return (
    <section className="flex max-w-3xl flex-col gap-6">
      <Encabezado
        titulo="Categorías"
        volver={{ ruta: "/productos", texto: "Productos" }}
        descripcion="Agrupan los productos. El orden es el del recorrido en el mercado y en el depósito: las listas se imprimen así."
      />

      {puedeEditar && (
        <Desplegable titulo="+ Nueva categoría" abierto={categorias.length === 0}>
          <FormularioAccion accion={guardarCategoriaAccion} boton="Crear categoría">
            <Campo etiqueta="Nombre" name="nombre" placeholder="Ej. Verduras de hoja" required />
            <Selector etiqueta="Grupo" name="grupo" opciones={opciones(GRUPOS)} defaultValue="VERDURA" />
            <Campo etiqueta="Orden" name="orden" inputMode="numeric" defaultValue={String((categorias.at(-1)?.orden ?? 0) + 1)} />
          </FormularioAccion>
        </Desplegable>
      )}

      <ul className="flex flex-col gap-3">
        {categorias.map((c) => (
          <li key={c.id} className="flex flex-col gap-2 rounded-lg border border-borde bg-superficie p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-lg font-semibold">
                {c.orden}. {c.nombre}
              </p>
              <Estado activo={c.activo} />
            </div>
            <p className="text-texto-suave">
              {GRUPOS[c.grupo]} · {c.productosActivos} producto(s) activo(s)
            </p>
            {puedeEditar && (
              <details>
                <summary className="min-h-11 cursor-pointer py-2 font-medium">Editar</summary>
                <div className="flex flex-col gap-4">
                  <FormularioAccion accion={guardarCategoriaAccion} boton="Guardar" variante="secundario">
                    <input type="hidden" name="id" value={c.id} />
                    <Campo etiqueta="Nombre" name="nombre" defaultValue={c.nombre} required />
                    <Selector etiqueta="Grupo" name="grupo" opciones={opciones(GRUPOS)} defaultValue={c.grupo} />
                    <Campo etiqueta="Orden" name="orden" inputMode="numeric" defaultValue={String(c.orden)} />
                  </FormularioAccion>
                  <FormularioAccion
                    accion={cambiarEstadoCategoriaAccion}
                    boton={c.activo ? "Desactivar" : "Reactivar"}
                    variante={c.activo ? "peligro" : "secundario"}
                  >
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="activo" value={String(!c.activo)} />
                  </FormularioAccion>
                </div>
              </details>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
