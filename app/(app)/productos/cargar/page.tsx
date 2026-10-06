import type { Metadata } from "next";

import { COLUMNAS_PLANILLA } from "@/dominio/catalogo/importacion";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { Encabezado } from "@/ui/formularios";

import { CargadorDePlanilla } from "./cargador";

export const metadata: Metadata = { title: "Cargar productos desde una planilla · Sistema Repartos" };

/**
 * P-28 Cargar productos desde una planilla (pedido del usuario, 06/10/2026, RN-155): se baja la
 * planilla modelo, se completa (alcanza con los nombres), se sube, se revisa y se cargan todos.
 */
export default async function CargarProductos() {
  await sesionParaPantalla("productos.editar");
  return (
    <section className="flex max-w-5xl flex-col gap-6">
      <Encabezado
        titulo="Cargar productos desde una planilla"
        volver={{ ruta: "/productos", texto: "Productos" }}
        descripcion="Para cargar toda la lista de frutas y verduras de una vez. Alcanza con los nombres uno debajo del otro: el código y el dibujo se hacen solos, y antes de cargar se ve qué falta completar."
      />
      <ol className="grid gap-3 md:grid-cols-3">
        <li className="flex flex-col gap-2 rounded-2xl border-2 border-borde bg-superficie p-4">
          <p className="text-lg font-semibold">1. Bajá la planilla modelo</p>
          <p className="text-sm text-texto-suave">
            Columnas: {COLUMNAS_PLANILLA.join(" · ")}. Categoría, cómo se vende y el envase tienen listas para elegir (con “Ninguna”).
          </p>
          <a href="/productos/planilla" download className="mt-auto inline-flex min-h-11 items-center justify-center rounded-lg bg-marca px-4 font-semibold text-marca-texto">
            📄 Bajar la planilla (.xlsx)
          </a>
        </li>
        <li className="flex flex-col gap-2 rounded-2xl border-2 border-borde bg-superficie p-4">
          <p className="text-lg font-semibold">2. Completala</p>
          <p className="text-sm text-texto-suave">
            En Excel, LibreOffice o Google Sheets. Un producto por fila. Lo único que hace falta es el nombre; lo importante que falte (cómo se vende) se avisa al subirla.
          </p>
        </li>
        <li className="flex flex-col gap-2 rounded-2xl border-2 border-marca bg-superficie p-4">
          <p className="text-lg font-semibold">3. Subila y revisá</p>
          <p className="text-sm text-texto-suave">Se muestra cada producto como va a quedar. Corregí lo que haga falta y cargalos todos juntos.</p>
        </li>
      </ol>
      <CargadorDePlanilla />
    </section>
  );
}
