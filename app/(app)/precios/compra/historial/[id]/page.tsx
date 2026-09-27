import type { Metadata } from "next";

import { obtenerBaseDatos } from "@/db/cliente";
import { formatearMoneda, formatearPorcentaje } from "@/dominio/dinero/formato";
import { formatearFechaHora } from "@/dominio/fechas/fechas";
import { historialDeOferta, listaGeneralPreciosCompra } from "@/modulos/precios-compra/ofertas";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { idDeRuta } from "@/ui/accion-servidor";
import { ORIGENES_PRECIO, UNIDADES_CORTAS } from "@/ui/etiquetas";
import { Encabezado, Tabla } from "@/ui/formularios";

export const metadata: Metadata = { title: "Historial de precios · Sistema Juan" };

/** P-29 Historial de precios de compra de una oferta (05 §2.3). */
export default async function HistorialDePrecios({ params }: PageProps<"/precios/compra/historial/[id]">) {
  const sesion = await sesionParaPantalla("precios.ver_costos");
  const id = idDeRuta((await params).id);
  const db = obtenerBaseDatos();
  const [movimientos, { ofertas }] = await Promise.all([historialDeOferta(db, sesion.authUserId, id), listaGeneralPreciosCompra(db, sesion.authUserId)]);
  const oferta = ofertas.find((o) => o.id === id);
  const unidad = oferta ? UNIDADES_CORTAS[oferta.unidadBase] : "";

  return (
    <section className="flex max-w-4xl flex-col gap-6">
      <Encabezado
        titulo="Historial de precios"
        volver={oferta ? { ruta: `/productos/${oferta.productoId}`, texto: oferta.producto } : { ruta: "/precios/compra", texto: "Precios de compra" }}
        descripcion={oferta ? `${oferta.producto} · ${oferta.proveedor} · ${oferta.presentacion}` : undefined}
      />
      {movimientos.length === 0 ? (
        <p className="text-texto-suave">No hay cambios de precio registrados.</p>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <th>Desde</th>
              <th>Hasta</th>
              <th>Precio</th>
              <th>Costo</th>
              <th>Variación</th>
              <th>Origen</th>
              <th>Quién</th>
            </tr>
          </thead>
          <tbody>
            {movimientos.map((m) => (
              <tr key={m.id}>
                <td className="whitespace-nowrap">{formatearFechaHora(m.vigenteDesde, sesion.zonaHoraria)}</td>
                <td className="whitespace-nowrap">{m.vigenteHasta ? formatearFechaHora(m.vigenteHasta, sesion.zonaHoraria) : "vigente"}</td>
                <td>{formatearMoneda(m.precio)}</td>
                <td className="whitespace-nowrap">
                  {formatearMoneda(m.costoBase)}
                  {unidad && `/${unidad}`}
                </td>
                <td>{m.variacionPct ? `${m.variacionPct.startsWith("-") ? "" : "+"}${formatearPorcentaje(m.variacionPct, 2)}` : "—"}</td>
                <td>
                  {ORIGENES_PRECIO[m.origen]}
                  {m.referencia && <span className="block text-sm text-texto-suave">{m.referencia}</span>}
                </td>
                <td>{m.usuario ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </section>
  );
}
