import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { CATEGORIAS_PREELEGIDAS } from "@/dominio/catalogo/categorias";
import { listarCategorias } from "@/modulos/catalogo/categorias";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { GRUPOS, opciones } from "@/ui/etiquetas";
import { FormularioAccion } from "@/ui/formulario-accion";
import { Campo, Encabezado, Selector } from "@/ui/formularios";

import { guardarCategoriaAccion } from "../acciones";

export const metadata: Metadata = { title: "Categorías · Sistema Juan" };

/**
 * P-12 Categorías: el orden es el del recorrido en el mercado y en el depósito. Solo se ven las que
 * tienen productos (RN-154): una categoría nace al asignársela a un producto y se oculta sola
 * cuando se queda sin productos.
 */
export default async function PaginaCategorias() {
  const sesion = await sesionParaPantalla("productos.ver");
  const categorias = await listarCategorias(obtenerBaseDatos(), sesion.authUserId, { soloConProductos: true });
  const puedeEditar = sesion.permisos.includes("productos.editar");
  const usadas = new Set(categorias.map((c) => c.nombre.toLowerCase()));
  const libres = CATEGORIAS_PREELEGIDAS.filter((c) => !usadas.has(c.nombre.toLowerCase()));

  return (
    <section className="flex max-w-3xl flex-col gap-6">
      <Encabezado
        titulo="Categorías"
        volver={{ ruta: "/productos", texto: "Productos" }}
        descripcion="Agrupan los productos y ordenan las listas que se imprimen (lo duro primero, lo frágil al final). Una categoría existe mientras tenga productos: se crea al ponérsela a un producto (al cargarlo, desde la planilla o arrastrando su tarjeta) y desaparece sola cuando queda vacía."
      />

      {libres.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-borde bg-superficie p-4">
          <p className="font-semibold">Categorías preelegidas para usar</p>
          <ul className="flex flex-col gap-1 text-sm text-texto-suave">
            {libres.map((c) => (
              <li key={c.nombre}>
                <span aria-hidden>{c.icono}</span> <b className="text-texto">{c.nombre}</b>: {c.ayuda}
              </li>
            ))}
          </ul>
          <p className="text-sm text-texto-suave">
            Para usarlas, elegilas al cargar un producto o arrastrá una tarjeta en{" "}
            <Link href="/productos" className="font-medium underline">
              Productos
            </Link>
            .
          </p>
        </div>
      )}

      {categorias.length === 0 ? (
        <p className="text-texto-suave">Todavía no hay productos con categoría.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {categorias.map((c) => (
            <li key={c.id} className="flex flex-col gap-2 rounded-lg border border-borde bg-superficie p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-lg font-semibold">
                  {c.orden}. {c.nombre}
                </p>
                <Link href={`/productos?categoria=${c.id}`} className="text-sm font-medium underline-offset-4 hover:underline">
                  {c.productosActivos === 1 ? "1 producto" : `${c.productosActivos} productos`} →
                </Link>
              </div>
              <p className="text-texto-suave">{GRUPOS[c.grupo]}</p>
              {puedeEditar && (
                <details>
                  <summary className="min-h-11 cursor-pointer py-2 font-medium">Cambiar nombre u orden</summary>
                  <FormularioAccion accion={guardarCategoriaAccion} boton="Guardar" variante="secundario">
                    <input type="hidden" name="id" value={c.id} />
                    <Campo etiqueta="Nombre" name="nombre" defaultValue={c.nombre} required />
                    <Selector etiqueta="Grupo" name="grupo" opciones={opciones(GRUPOS)} defaultValue={c.grupo} />
                    <Campo etiqueta="Orden" name="orden" inputMode="numeric" defaultValue={String(c.orden)} />
                  </FormularioAccion>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
