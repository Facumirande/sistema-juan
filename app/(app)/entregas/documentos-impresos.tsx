import Image from "next/image";
import type { ReactNode } from "react";

import { dec } from "@/dominio/dinero/decimal";
import { formatearCantidad, formatearMoneda, type UnidadMedida } from "@/dominio/dinero/formato";
import { formatearFecha, formatearFechaHora } from "@/dominio/fechas/fechas";
import type { ContenidoListaContable, ContenidoListaEntrega } from "@/modulos/entregas/documentos";
import { fechaConDia } from "@/ui/etiquetas";

// DOC-02 Lista de entrega (sin precios) y DOC-03 Lista contable (09), dibujadas desde el contenido
// guardado al emitir. Las usan la página de cada documento y la impresión de todos los remitos del día.
// Modelo de remito del 08/10/2026 (imagen del usuario): membrete con el logo y la razón social en
// verde, número y fecha a la derecha, una raya verde, dos recuadros (cliente y entrega), la tabla
// por producto y, en el valorizado, el total sobre una raya verde.

type Contenido = ContenidoListaEntrega | ContenidoListaContable;

const cant = (v: string, u: string) => formatearCantidad(v, u as UnidadMedida);
const tabla =
  "w-full border-collapse text-left [&_td]:border-b [&_td]:border-borde [&_td]:px-2 [&_td]:py-2 [&_td]:align-top [&_th]:px-2 [&_th]:py-2 [&_th]:text-xs [&_th]:font-bold [&_th]:tracking-wider [&_th]:text-marca [&_th]:uppercase [&_thead_tr]:border-b-2 [&_thead_tr]:border-marca [&_thead_tr]:bg-marca/10";

function Membrete({ c, titulo, copia }: { c: Contenido; titulo: string; copia: string | null }) {
  const e = c.empresa;
  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 items-center gap-3">
          {/* Sin esperar a que se vea en pantalla: al imprimir todos los remitos juntos, cada uno tiene que llevar su logo. */}
          <Image src="/iconos/icono-192.png" alt="" width={56} height={56} unoptimized loading="eager" className="size-14 shrink-0 rounded-xl" />
          <div className="min-w-0">
            <p className="text-xl leading-tight font-extrabold text-marca uppercase">{e.razonSocial ?? e.nombre}</p>
            <p className="text-sm text-texto-suave">{[e.direccion, e.identificacionFiscal && `CUIT ${e.identificacionFiscal}`, e.condicionFiscal, e.telefono && `Tel. ${e.telefono}`].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
        <div className="ml-auto text-right">
          {copia && <p className="text-xs font-bold tracking-wider text-texto-suave uppercase">{copia}</p>}
          <p className="text-xl leading-tight font-extrabold tracking-wide">{titulo}</p>
          <p className="font-semibold tabular-nums">
            N.º {c.numero}
            {c.version > 1 && <span className="font-normal"> · versión {c.version}</span>}
          </p>
          <p className="mt-1 text-xs font-bold tracking-wider text-texto-suave uppercase">Fecha de entrega</p>
          <p className="text-2xl leading-tight font-extrabold first-letter:uppercase">{fechaConDia(c.fechaEntrega)}</p>
        </div>
      </div>
      {/* Raya y no fondo: al imprimir, los fondos de color no salen. */}
      <div aria-hidden className="border-t-4 border-marca" />
    </header>
  );
}

function Recuadro({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border-2 border-borde px-3 py-2">
      <p className="text-xs font-bold tracking-wider text-marca uppercase">{titulo}</p>
      {children}
    </div>
  );
}

/** Los dos recuadros de arriba: a quién (con su CUIT) y dónde se entrega (con el pedido). */
function ClienteYEntrega({ c, razonSocial, cuit, entrega }: { c: Contenido; razonSocial?: string | null; cuit: string | null; entrega?: ReactNode }) {
  const fiscal = [cuit && `CUIT ${cuit}`, c.clienteCondicionFiscal].filter(Boolean).join(" · ");
  const pedido = c.pedidos.length ? `Pedido ${c.pedidos.join(", ")}${c.pedidoDel ? ` del ${formatearFecha(c.pedidoDel)}` : ""}` : null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Recuadro titulo="Cliente">
        <p className="text-lg leading-snug font-bold">{c.cliente}</p>
        {razonSocial && razonSocial !== c.cliente && <p className="text-sm">{razonSocial}</p>}
        {fiscal && <p className="text-sm">{fiscal}</p>}
      </Recuadro>
      <Recuadro titulo="Entrega">
        <p className="leading-snug font-semibold">{c.direccion ?? c.puntoEntrega ?? "—"}</p>
        {c.direccion && c.puntoEntrega && <p className="text-sm">{c.puntoEntrega}</p>}
        {(pedido || c.referenciaCliente) && <p className="text-sm">{[pedido, c.referenciaCliente && `OC ${c.referenciaCliente}`].filter(Boolean).join(" · ")}</p>}
        {entrega}
      </Recuadro>
    </div>
  );
}

function Recibido({ c, zona }: { c: Contenido; zona: string }) {
  if (c.recibido) {
    return (
      <p>
        Recibido por: <b>{c.recibido.por}</b>
        {c.recibido.cargo && ` (${c.recibido.cargo})`}, {formatearFechaHora(new Date(c.recibido.en), zona)}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4 pt-4 text-sm">
      <p>Recibí conforme — Nombre: ____________________ Cargo: ______________ Firma: ______________ Hora: ________</p>
      <p>Observaciones: ______________________________________________________________</p>
    </div>
  );
}

/** Lo chico del pie: quién lo emitió y a qué versión reemplaza. */
function Pie({ c, zona, children }: { c: Contenido; zona: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 text-xs text-texto-suave">
      {c.version > 1 && <p>Versión {c.version}: reemplaza a la versión {c.version - 1}.</p>}
      <p>
        Emitido el {formatearFechaHora(new Date(c.emitido.en), zona)} por {c.emitido.por}.
      </p>
      {children}
    </div>
  );
}

export function ListaEntrega({ c, zona, copia }: { c: ContenidoListaEntrega; zona: string; copia: string | null }) {
  const datos = [
    c.recepcion && `Recepción: ${c.recepcion}`,
    c.contacto && `Contacto: ${c.contacto}`,
    c.reparto && `Reparto ${c.reparto}${c.parada ? ` · parada ${c.parada}` : ""}`,
    c.bultos !== null && `${c.bultos} ${c.bultos === 1 ? "bulto" : "bultos"}`,
  ].filter(Boolean);
  return (
    <section className="flex break-after-page flex-col gap-4">
      <Membrete c={c} titulo="REMITO" copia={copia} />
      <ClienteYEntrega c={c} cuit={c.clienteCuit ?? null} entrega={datos.length > 0 && <p className="text-sm">{datos.join(" · ")}</p>} />
      {c.instrucciones && <p className="text-sm">Instrucciones: {c.instrucciones}</p>}
      {c.observaciones && <p className="text-sm">Observaciones: {c.observaciones}</p>}
      <table className={tabla}>
        <thead>
          <tr>
            <th>Producto</th>
            <th className="text-right">Cantidad</th>
            <th>Presentación</th>
            <th className="w-28">Recibido</th>
            <th>Observaciones</th>
          </tr>
        </thead>
        <tbody>
          {c.lineas.map((l) => (
            <tr key={l.n}>
              <td className="font-semibold">
                {l.producto}
                {l.reemplazaA && <span className="block text-xs font-normal">en reemplazo de {l.reemplazaA}</span>}
              </td>
              <td className="text-right font-semibold whitespace-nowrap tabular-nums">{cant(l.cantidad, l.unidad)}</td>
              <td className="text-sm">{l.presentacion ?? "—"}</td>
              <td className="border-x border-x-borde" />
              <td className="text-xs">{l.observaciones}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-right text-sm">
        {c.lineas.length === 1 ? "1 producto" : `${c.lineas.length} productos`}
        {c.bultos !== null && ` · ${c.bultos === 1 ? "1 bulto" : `${c.bultos} bultos`}`}
      </p>
      <Recibido c={c} zona={zona} />
      <Pie c={c} zona={zona}>
        <p>
          Documento sin valores. Los importes figuran en el remito valorizado {c.numero} v{c.version}.
        </p>
      </Pie>
    </section>
  );
}

export function ListaContable({ c, zona }: { c: ContenidoListaContable; zona: string }) {
  const conIva = c.lineas.some((l) => !dec(l.alicuotaIva).isZero());
  return (
    <section className="flex flex-col gap-4">
      <Membrete c={c} titulo="REMITO VALORIZADO" copia={null} />
      <ClienteYEntrega c={c} razonSocial={c.razonSocial} cuit={c.identificacionFiscal ?? c.clienteCuit ?? null} />
      <table className={tabla}>
        <thead>
          <tr>
            <th>Producto</th>
            <th className="text-right">Cantidad</th>
            <th>Presentación</th>
            <th className="text-right">Precio unit.</th>
            {conIva && <th className="text-right">IVA</th>}
            <th className="text-right">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {c.lineas.map((l) => (
            <tr key={l.n}>
              <td className="font-semibold">
                {l.producto}
                {l.reemplazaA && <span className="block text-xs font-normal">en reemplazo de {l.reemplazaA}</span>}
              </td>
              <td className="text-right whitespace-nowrap tabular-nums">{cant(l.cantidad, l.unidad)}</td>
              <td className="text-sm">{l.presentacion ?? "—"}</td>
              <td className="text-right whitespace-nowrap tabular-nums">{l.precioUnitario ? formatearMoneda(l.precioUnitario) : "—"}</td>
              {conIva && <td className="text-right">{dec(l.alicuotaIva).toString()} %</td>}
              <td className="text-right font-semibold whitespace-nowrap tabular-nums">{formatearMoneda(l.importe)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ml-auto flex w-full max-w-xs flex-col gap-0.5 border-t-4 border-marca pt-2 text-right">
        {conIva && (
          <>
            <p>
              Subtotal neto <span className="tabular-nums">{formatearMoneda(c.neto)}</span>
            </p>
            <p>
              IVA <span className="tabular-nums">{formatearMoneda(c.iva)}</span>
            </p>
          </>
        )}
        <p className="flex items-baseline justify-end gap-3">
          <span className="text-sm font-bold tracking-wider text-marca uppercase">Total</span>
          <span className="text-2xl font-extrabold tabular-nums">{formatearMoneda(c.total)}</span>
        </p>
      </div>
      {c.recibido && <Recibido c={c} zona={zona} />}
      <Pie c={c} zona={zona}>
        <p>Documento no válido como factura.</p>
        {c.preciosFijadosEn && <p>Los precios quedaron fijados el {formatearFechaHora(new Date(c.preciosFijadosEn), zona)} y no cambian aunque cambien las listas de precios.</p>}
      </Pie>
    </section>
  );
}
