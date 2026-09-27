import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { formatearMoneda, formatearPorcentaje } from "@/dominio/dinero/formato";
import { formatearFechaHora, hoyEnEmpresa, formatearFecha } from "@/dominio/fechas/fechas";
import { listaGeneralPreciosCompra, type OfertaListada } from "@/modulos/precios-compra/ofertas";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { BotonImprimir } from "@/ui/boton-imprimir";
import { UNIDADES_CORTAS, haceDias } from "@/ui/etiquetas";
import { parametro } from "@/ui/parametros";

export const metadata: Metadata = { title: "DOC-06 Lista de precios de compra · Sistema Juan" };

/**
 * DOC-06 Lista general de precios de compra (09): por proveedor, en el orden del recorrido del
 * mercado, con una columna vacía para anotar el precio nuevo.
 */
export default async function ImprimirPreciosCompra({ searchParams }: PageProps<"/precios/compra/imprimir">) {
  const sesion = await sesionParaPantalla("documentos.imprimir_compra");
  const f = await searchParams;
  const { ofertas } = await listaGeneralPreciosCompra(obtenerBaseDatos(), sesion.authUserId, {
    proveedorId: parametro(f.proveedor),
    categoriaId: parametro(f.categoria),
  });

  const porProveedor = new Map<string, OfertaListada[]>();
  for (const o of ofertas) porProveedor.set(o.proveedorId, [...(porProveedor.get(o.proveedorId) ?? []), o]);
  const grupos = [...porProveedor.values()].sort((a, b) =>
    (a[0]!.ubicacionMercado ?? a[0]!.proveedor).localeCompare(b[0]!.ubicacionMercado ?? b[0]!.proveedor, "es", { numeric: true }),
  );
  const ahora = new Date();

  return (
    <article className="mx-auto flex max-w-4xl flex-col gap-4 bg-superficie p-4 print:max-w-none print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href="/precios/compra" className="text-texto-suave hover:underline">
          ← Precios de compra
        </Link>
        <BotonImprimir />
      </div>
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-texto pb-2">
        <h1 className="text-xl font-bold">LISTA GENERAL DE PRECIOS DE COMPRA — por proveedor</h1>
        <p>{formatearFechaHora(ahora, sesion.zonaHoraria)}</p>
      </header>
      {grupos.length === 0 && <p>No hay precios cargados.</p>}
      {grupos.map((grupo) => {
        const p = grupo[0]!;
        return (
          <section key={p.proveedorId} className="break-inside-avoid">
            <h2 className="font-bold uppercase">
              {p.proveedor}
              {p.ubicacionMercado && <span className="font-normal normal-case"> — {p.ubicacionMercado}</span>}
            </h2>
            <table className="w-full border-collapse text-left text-sm [&_td]:border-b [&_td]:border-borde [&_td]:px-1 [&_td]:py-1 [&_th]:border-b [&_th]:border-texto [&_th]:px-1">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Presentación</th>
                  <th className="text-right">Precio</th>
                  <th className="text-right">$/u. base</th>
                  <th>vs. mejor</th>
                  <th>Actualizado</th>
                  <th>Disp.</th>
                  <th className="w-28">Precio nuevo</th>
                </tr>
              </thead>
              <tbody>
                {grupo.map((o) => (
                  <tr key={o.id}>
                    <td>{o.producto}</td>
                    <td>{o.presentacion}</td>
                    <td className="text-right">{formatearMoneda(o.precioVigente).replace(",00", "")}</td>
                    <td className="text-right whitespace-nowrap">
                      {formatearMoneda(o.costoBase)}/{UNIDADES_CORTAS[o.unidadBase]}
                    </td>
                    <td>
                      {o.esMejor ? "mejor" : o.pctSobreMejor ? `${o.pctSobreMejor.startsWith("-") ? "" : "+"}${formatearPorcentaje(o.pctSobreMejor, 2)}` : ""}
                    </td>
                    <td className="whitespace-nowrap">
                      {formatearFecha(hoyEnEmpresa(o.fechaActualizacion, sesion.zonaHoraria)).slice(0, 5)} · {haceDias(o.diasSinActualizar)}
                      {o.desactualizada && <b> DESACT.</b>}
                    </td>
                    <td>☐</td>
                    <td className="border-texto!" />
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </article>
  );
}
