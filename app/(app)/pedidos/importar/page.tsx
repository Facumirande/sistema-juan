import type { Metadata } from "next";

import { obtenerBaseDatos } from "@/db/cliente";
import { fechasDeTrabajo } from "@/modulos/pedidos/jornadas";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { fechaConDia } from "@/ui/etiquetas";
import { Encabezado, Tarjeta, clasesBoton } from "@/ui/formularios";
import { parametro } from "@/ui/parametros";

import { Importador } from "./importador";

export const metadata: Metadata = { title: "Pedidos en Excel · Sistema Repartos" };

/** Es una descarga, no una pantalla: va con un enlace común. */
const PLANILLA_MODELO = "/pedidos/planilla?modelo=1";

/** P-43 Pedidos en Excel: bajar los pedidos de un día a una planilla y cargar pedidos desde una planilla. */
export default async function PedidosEnExcel({ searchParams }: PageProps<"/pedidos/importar">) {
  const sesion = await sesionParaPantalla("pedidos.ver");
  const { hoy, sugerida } = await fechasDeTrabajo(obtenerBaseDatos(), sesion.authUserId);
  const pedida = parametro((await searchParams).fecha);
  const fecha = pedida && /^\d{4}-\d{2}-\d{2}$/.test(pedida) ? pedida : sugerida;
  const puedeCargar = sesion.permisos.includes("pedidos.crear");

  return (
    <section className="flex max-w-4xl flex-col gap-6">
      <Encabezado
        titulo="Pedidos en Excel"
        volver={{ ruta: `/inicio?fecha=${fecha}`, texto: "Tablero" }}
        descripcion="Si te resulta más cómodo, armá los pedidos en una planilla y subila: quedan cargados igual que si los hubieras tocado uno por uno. Y lo que está cargado en el sistema se baja a Excel cuando quieras."
      />

      {puedeCargar && (
        <Tarjeta titulo="📥 Subir pedidos desde Excel">
          <ol className="flex flex-col gap-2 text-texto-suave">
            <li>
              <b className="text-texto">1.</b> Bajá la planilla modelo: trae los títulos de las columnas y, en otras hojas, tus clientes y tus productos con su código.
            </li>
            <li>
              <b className="text-texto">2.</b> Escribí una fila por producto: cliente, código (o nombre) del producto y cantidad. Las filas del mismo cliente y día forman un pedido.
            </li>
            <li>
              <b className="text-texto">3.</b> Subila acá. Primero te muestro lo que entendí; recién cuando tocás “Cargar” quedan en el tablero.
            </li>
          </ol>
          <a href={PLANILLA_MODELO} className={`${clasesBoton("secundario")} self-start`}>
            📄 Bajar la planilla modelo
          </a>
          <Importador fecha={fecha < hoy ? sugerida : fecha} hoy={hoy} />
        </Tarjeta>
      )}

      <Tarjeta titulo="📤 Bajar los pedidos a Excel">
        <p className="text-texto-suave">Todos los pedidos del día, una fila por producto, con las mismas columnas que la planilla para subir.</p>
        <form action="/pedidos/planilla" method="get" className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="font-medium">Día de entrega</span>
            <input type="date" name="fecha" defaultValue={fecha} required className="h-12 rounded-xl border-2 border-borde bg-superficie px-3 text-base" />
          </label>
          <button type="submit" className={clasesBoton("principal")}>
            📤 Bajar los pedidos del día
          </button>
        </form>
        <p className="text-sm text-texto-suave">Por defecto, el {fechaConDia(fecha)}.</p>
      </Tarjeta>
    </section>
  );
}
