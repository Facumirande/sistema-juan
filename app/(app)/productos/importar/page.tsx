import type { Metadata } from "next";

import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { Encabezado, Tarjeta, clasesBoton } from "@/ui/formularios";

import { ImportadorDeProductos } from "./importador";

export const metadata: Metadata = { title: "Productos en Excel · Sistema Repartos" };

/** Son descargas, no pantallas: van con enlaces comunes. */
const PLANILLA_MODELO = "/productos/planilla?modelo=1";
const LISTA_EN_EXCEL = "/productos/planilla";
const LISTA_EN_CSV = "/productos/planilla?formato=csv";

/** P-13 Productos en Excel: bajar la lista de productos a una planilla y cargar productos nuevos desde una planilla. */
export default async function ProductosEnExcel() {
  const sesion = await sesionParaPantalla("productos.ver");
  const puedeCargar = sesion.permisos.includes("productos.editar");

  return (
    <section className="flex max-w-4xl flex-col gap-6">
      <Encabezado
        titulo="Productos en Excel"
        volver={{ ruta: "/productos", texto: "Productos" }}
        descripcion="Para cargar muchos productos de una vez desde una planilla, y para bajar a Excel la lista de los que ya están cargados."
      />

      {puedeCargar && (
        <Tarjeta titulo="📥 Subir productos desde Excel">
          <ol className="flex flex-col gap-2 text-texto-suave">
            <li>
              <b className="text-texto">1.</b> Bajá la planilla modelo: trae los títulos de las columnas, cómo llenar cada una y las categorías que ya tenés.
            </li>
            <li>
              <b className="text-texto">2.</b> Escribí una fila por producto. Lo único obligatorio es el <b className="text-texto">Producto</b> y su <b className="text-texto">Categoría</b>; además podés poner por qué se vende (kg, unidad…), en qué envase se compra y cuánto trae.
            </li>
            <li>
              <b className="text-texto">3.</b> Subila acá. Primero te muestro lo que entendí; recién cuando tocás “Cargar” quedan en Productos.
            </li>
          </ol>
          <p className="text-sm text-texto-suave">El código y el dibujo de cada producto se arman solos. Los que ya están cargados (mismo nombre o código) se saltean: la planilla no cambia productos que ya existen.</p>
          <a href={PLANILLA_MODELO} className={`${clasesBoton("secundario")} self-start`}>
            📄 Bajar la planilla modelo
          </a>
          <ImportadorDeProductos />
        </Tarjeta>
      )}

      <Tarjeta titulo="📤 Bajar la lista de productos">
        <p className="text-texto-suave">Todos los productos, uno por fila, con su código, categoría, cómo se venden y en qué envase se compran. Tiene las mismas columnas que la planilla para subir.</p>
        <div className="flex flex-wrap gap-2">
          <a href={LISTA_EN_EXCEL} className={clasesBoton("principal")}>
            📊 Bajar a Excel
          </a>
          <a href={LISTA_EN_CSV} className={clasesBoton("secundario")}>
            📄 Bajar como CSV
          </a>
        </div>
      </Tarjeta>
    </section>
  );
}
