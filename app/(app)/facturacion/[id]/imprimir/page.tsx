import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { formatearCantidad, formatearMoneda, type UnidadMedida } from "@/dominio/dinero/formato";
import { formatearFecha } from "@/dominio/fechas/fechas";
import { obtenerComprobante } from "@/modulos/facturacion/facturacion";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { cargarFicha, idDeRuta } from "@/ui/accion-servidor";
import { BotonImprimir } from "@/ui/boton-imprimir";
import { parametro } from "@/ui/parametros";

export const metadata: Metadata = { title: "DOC-08 Comprobante interno · Sistema Repartos" };

const tabla = "w-full border-collapse text-left text-sm [&_td]:border-b [&_td]:border-borde [&_td]:px-1 [&_td]:py-1.5 [&_th]:border-b [&_th]:border-texto [&_th]:px-1";

/**
 * DOC-08 Comprobante interno de venta (09): no fiscal, con la leyenda "Documento no válido como
 * factura" (RN-140). El detalle por producto va por defecto cuando es de una sola entrega.
 */
export default async function ComprobanteInterno({ params, searchParams }: PageProps<"/facturacion/[id]/imprimir">) {
  const sesion = await sesionParaPantalla("documentos.imprimir_contable");
  const f = await cargarFicha(obtenerComprobante(obtenerBaseDatos(), sesion.authUserId, idDeRuta((await params).id)));
  const pedido = parametro((await searchParams).detalle);
  const conDetalle = pedido ? pedido === "1" : f.entregas.length === 1;

  return (
    <article className="relative mx-auto flex max-w-4xl flex-col gap-4 bg-superficie p-4 print:max-w-none print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/facturacion/${f.id}`} className="text-texto-suave hover:underline">
          ← Comprobante
        </Link>
        <Link href={`/facturacion/${f.id}/imprimir?detalle=${conDetalle ? "0" : "1"}`} className="underline-offset-4 hover:underline">
          {conDetalle ? "Sin detalle por producto" : "Con detalle por producto"}
        </Link>
        <BotonImprimir />
      </div>
      {f.estado === "ANULADA" && <p className="border-2 border-error p-2 text-center text-lg font-bold text-error">ANULADO — {f.motivoAnulacion}</p>}
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-texto pb-2">
        <h1 className="text-xl font-bold">COMPROBANTE INTERNO DE VENTA</h1>
        <div className="text-right">
          <p className="font-semibold">N° {f.numero}</p>
          <p>Fecha: {formatearFecha(f.fecha)}</p>
          {f.periodo && (
            <p>
              Período: {formatearFecha(f.periodo.desde)} al {formatearFecha(f.periodo.hasta)}
            </p>
          )}
        </div>
      </header>
      <div className="text-sm">
        <p>
          <b>Cliente:</b> {[f.cliente.nombre, f.cliente.razonSocial, f.cliente.identificacionFiscal && `CUIT ${f.cliente.identificacionFiscal}`, f.cliente.condicionFiscal].filter(Boolean).join(" — ")}
        </p>
        {f.cliente.direccionFiscal && (
          <p>
            <b>Dirección fiscal:</b> {f.cliente.direccionFiscal}
          </p>
        )}
      </div>
      <table className={tabla}>
        <thead>
          <tr>
            <th>Entrega</th>
            <th>Fecha</th>
            <th>Punto</th>
            <th>Referencia</th>
            <th className="text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {f.entregas.map((e) => (
            <tr key={e.id}>
              <td>
                {e.numero} v{e.version}
              </td>
              <td>{formatearFecha(e.fecha)}</td>
              <td>{e.punto}</td>
              <td>{e.referencia ?? "—"}</td>
              <td className="text-right whitespace-nowrap">{formatearMoneda(e.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {conDetalle && (
        <table className={tabla}>
          <thead>
            <tr>
              <th>Producto</th>
              <th className="text-right">Cantidad</th>
              <th className="text-right">Precio unitario</th>
              <th className="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {f.lineas.map((l, i) => (
              <tr key={i}>
                <td>{l.producto}</td>
                <td className="text-right whitespace-nowrap">{formatearCantidad(l.cantidad, l.unidad as UnidadMedida)}</td>
                <td className="text-right whitespace-nowrap">{l.precio ? formatearMoneda(l.precio) : "—"}</td>
                <td className="text-right whitespace-nowrap">{formatearMoneda(l.importe)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="ml-auto flex w-64 flex-col text-right">
        <p>Neto {formatearMoneda(f.neto)}</p>
        <p>IVA {formatearMoneda(f.iva)}</p>
        <p className="text-lg font-bold">TOTAL {formatearMoneda(f.total)}</p>
      </div>
      <footer className="flex flex-col gap-1 border-t border-texto pt-2">
        <p className="text-lg font-bold">DOCUMENTO NO VÁLIDO COMO FACTURA</p>
        <p className="text-sm">Los remitos valorizados de cada entrega respaldan este comprobante.</p>
      </footer>
    </article>
  );
}
