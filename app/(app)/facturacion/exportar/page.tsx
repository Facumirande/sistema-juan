import type { Metadata } from "next";

import { obtenerBaseDatos } from "@/db/cliente";
import { dec } from "@/dominio/dinero/decimal";
import { formatearMoneda } from "@/dominio/dinero/formato";
import { formatearFecha, hoyEnEmpresa } from "@/dominio/fechas/fechas";
import { hojasParaElContador } from "@/modulos/facturacion/exportacion";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { Encabezado, Tabla, clasesBoton } from "@/ui/formularios";
import { parametro } from "@/ui/parametros";

export const metadata: Metadata = { title: "Exportar para el contador · Sistema Repartos" };

const PATRON = /^\d{4}-\d{2}-\d{2}$/;

/** P-88 Exportar para el contador (04 §5.g.3): vista previa de las hojas y descarga. */
export default async function ExportarParaElContador({ searchParams }: PageProps<"/facturacion/exportar">) {
  const sesion = await sesionParaPantalla("facturacion.exportar");
  const f = await searchParams;
  const hoy = hoyEnEmpresa(new Date(), sesion.zonaHoraria);
  const d = parametro(f.desde);
  const h = parametro(f.hasta);
  const hasta = h && PATRON.test(h) ? h : hoy;
  const desde = d && PATRON.test(d) && d <= hasta ? d : `${hasta.slice(0, 7)}-01`;
  const hojas = await hojasParaElContador(obtenerBaseDatos(), sesion.authUserId, { desde, hasta });
  const total = (i: number, col: number) =>
    formatearMoneda(hojas[i]!.filas.reduce((s, fila) => (typeof fila[col] === "object" && fila[col] !== null ? s.plus((fila[col] as { numero: string }).numero) : s), dec(0)));
  const descarga = (formato: string) => `/facturacion/exportar/archivo?desde=${desde}&hasta=${hasta}&formato=${formato}`;

  return (
    <section className="flex max-w-3xl flex-col gap-6">
      <Encabezado titulo="Exportar para el contador" volver={{ ruta: "/facturacion", texto: "Facturación" }} descripcion="Una planilla con las ventas, compras, pagos y saldos del período. Exportar dos veces el mismo período da el mismo archivo." />
      <form method="get" className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Desde</span>
          <input type="date" name="desde" defaultValue={desde} className="h-11 rounded-lg border border-borde bg-superficie px-3" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Hasta</span>
          <input type="date" name="hasta" defaultValue={hasta} className="h-11 rounded-lg border border-borde bg-superficie px-3" />
        </label>
        <button type="submit" className={clasesBoton("secundario")}>
          Ver
        </button>
      </form>
      <Tabla>
        <thead>
          <tr>
            <th>Hoja</th>
            <th className="text-right">Filas</th>
            <th className="text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {[
            [0, 6],
            [1, 8],
            [2, 3],
            [3, 4],
            [4, 5],
            [5, 2],
          ].map(([i, col]) => (
            <tr key={i}>
              <td>{hojas[i!]!.nombre}</td>
              <td className="text-right">{hojas[i!]!.filas.length}</td>
              <td className="text-right whitespace-nowrap">{total(i!, col!)}</td>
            </tr>
          ))}
        </tbody>
      </Tabla>
      <p className="text-sm text-texto-suave">
        Del {formatearFecha(desde)} al {formatearFecha(hasta)}. Los totales de ventas y compras incluyen las anuladas, que figuran marcadas en la planilla.
      </p>
      <div className="flex flex-wrap gap-2">
        <a href={descarga("xlsx")} className={clasesBoton("principal")}>
          Descargar Excel
        </a>
        <a href={descarga("csv")} className={clasesBoton("secundario")}>
          Descargar CSV (zip)
        </a>
      </div>
    </section>
  );
}
