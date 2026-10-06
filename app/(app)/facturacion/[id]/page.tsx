import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { formatearMoneda } from "@/dominio/dinero/formato";
import { formatearFecha, formatearFechaHora } from "@/dominio/fechas/fechas";
import { obtenerComprobante } from "@/modulos/facturacion/facturacion";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { cargarFicha, idDeRuta } from "@/ui/accion-servidor";
import { FormularioAccion } from "@/ui/formulario-accion";
import { Aviso, Campo, Encabezado, Tabla, Tarjeta, clasesBoton } from "@/ui/formularios";

import { anularComprobanteAccion } from "../acciones";

export const metadata: Metadata = { title: "Comprobante · Sistema Repartos" };

/** P-87 Detalle de comprobante. */
export default async function DetalleComprobante({ params }: PageProps<"/facturacion/[id]">) {
  const sesion = await sesionParaPantalla("facturacion.ver");
  const f = await cargarFicha(obtenerComprobante(obtenerBaseDatos(), sesion.authUserId, idDeRuta((await params).id)));

  return (
    <section className="flex max-w-4xl flex-col gap-6">
      <Encabezado
        titulo={`${f.numero} · ${f.cliente.nombre}`}
        volver={{ ruta: "/facturacion?ver=comprobantes", texto: "Comprobantes" }}
        descripcion={`Emitido el ${formatearFecha(f.fecha)}${f.periodo ? ` · período ${formatearFecha(f.periodo.desde)} al ${formatearFecha(f.periodo.hasta)}` : ""}${f.exportadaEn ? ` · exportado ${formatearFechaHora(f.exportadaEn, sesion.zonaHoraria)}` : ""}`}
      >
        {f.estado === "ANULADA" && <span className="rounded-full border border-error px-3 py-1 font-semibold text-error">Anulado</span>}
        {sesion.permisos.includes("documentos.imprimir_contable") && (
          <Link href={`/facturacion/${f.id}/imprimir`} className={clasesBoton("secundario")}>
            Imprimir
          </Link>
        )}
      </Encabezado>
      {f.estado === "ANULADA" && <Aviso>Anulado: {f.motivoAnulacion}</Aviso>}
      <Tarjeta titulo="Entregas incluidas">
        <Tabla>
          <thead>
            <tr>
              <th>Entrega</th>
              <th>Fecha</th>
              <th>Punto</th>
              <th className="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {f.entregas.map((e) => (
              <tr key={e.id}>
                <td>
                  <Link href={`/entregas/${e.id}`} className="underline-offset-4 hover:underline">
                    {e.numero}
                  </Link>
                  {e.referencia && <span className="block text-sm text-texto-suave">OC {e.referencia}</span>}
                </td>
                <td className="whitespace-nowrap">{formatearFecha(e.fecha)}</td>
                <td>{e.punto}</td>
                <td className="text-right whitespace-nowrap">{formatearMoneda(e.total)}</td>
              </tr>
            ))}
          </tbody>
        </Tabla>
        <p className="text-right">
          Neto {formatearMoneda(f.neto)} · IVA {formatearMoneda(f.iva)} · <b className="text-lg">Total {formatearMoneda(f.total)}</b>
        </p>
      </Tarjeta>
      {f.estado === "EMITIDA" && sesion.permisos.includes("facturacion.anular") && (
        <details className="rounded-lg border border-borde bg-superficie p-4">
          <summary className="cursor-pointer font-semibold text-error">Anular el comprobante</summary>
          <p className="py-2 text-sm text-texto-suave">Sus entregas vuelven a quedar sin facturar: se pueden corregir y facturar de nuevo.</p>
          <FormularioAccion accion={anularComprobanteAccion} boton="Anular" variante="peligro" confirmar={`¿Anular ${f.numero}?`}>
            <input type="hidden" name="facturaId" value={f.id} />
            <Campo etiqueta="Por qué" name="motivo" placeholder="Ej. hay que corregir una entrega" />
          </FormularioAccion>
        </details>
      )}
    </section>
  );
}
