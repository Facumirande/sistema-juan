import { dec } from "@/dominio/dinero/decimal";
import { formatearCantidad, formatearMoneda, type UnidadMedida } from "@/dominio/dinero/formato";
import { formatearFechaHora } from "@/dominio/fechas/fechas";
import type { ContenidoListaContable, ContenidoListaEntrega } from "@/modulos/entregas/documentos";
import { fechaConDia } from "@/ui/etiquetas";

// DOC-02 Lista de entrega (sin precios) y DOC-03 Lista contable (09), dibujadas desde el contenido
// guardado al emitir. Las usan la página de cada documento y la impresión de todos los remitos del día.

const cant = (v: string, u: string) => formatearCantidad(v, u as UnidadMedida);
const tabla = "w-full border-collapse text-left text-sm [&_td]:border-b [&_td]:border-borde [&_td]:px-1 [&_td]:py-1.5 [&_td]:align-top [&_th]:border-b [&_th]:border-texto [&_th]:px-1";

function Cabecera({ c, titulo, zona }: { c: ContenidoListaEntrega | ContenidoListaContable; titulo: string; zona: string }) {
  return (
    <header className="flex flex-wrap justify-between gap-4 border-b-2 border-texto pb-2">
      <div>
        <p className="text-lg font-bold">{c.empresa.razonSocial ?? c.empresa.nombre}</p>
        <p className="text-sm">{[c.empresa.identificacionFiscal && `CUIT ${c.empresa.identificacionFiscal}`, c.empresa.direccion, c.empresa.telefono].filter(Boolean).join(" · ")}</p>
      </div>
      <div className="text-right">
        <p className="text-lg font-bold">{titulo}</p>
        <p>
          N° {c.numero} · versión {c.version}
        </p>
        <p className="mt-1 text-xs font-bold tracking-wide uppercase">Fecha de entrega</p>
        <p className="text-2xl leading-tight font-extrabold first-letter:uppercase">{fechaConDia(c.fechaEntrega)}</p>
        {c.version > 1 && <p className="text-sm">Versión {c.version} — reemplaza a la versión {c.version - 1}</p>}
        <p className="text-xs">Emitido {formatearFechaHora(new Date(c.emitido.en), zona)} por {c.emitido.por}</p>
      </div>
    </header>
  );
}

function Recibido({ c, zona }: { c: ContenidoListaEntrega | ContenidoListaContable; zona: string }) {
  if (c.recibido) {
    return (
      <p>
        Recibido por: {c.recibido.por}
        {c.recibido.cargo && ` (${c.recibido.cargo})`}, {formatearFechaHora(new Date(c.recibido.en), zona)}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3 pt-4">
      <p>Recibí conforme — Nombre: ____________________ Cargo: ______________ Firma: ______________ Hora: ________</p>
      <p>Observaciones: ______________________________________________________________</p>
    </div>
  );
}

export function ListaEntrega({ c, zona, copia }: { c: ContenidoListaEntrega; zona: string; copia: string | null }) {
  return (
    <section className="flex break-after-page flex-col gap-3">
      {copia && <p className="text-right text-sm font-bold">{copia}</p>}
      <Cabecera c={c} titulo="LISTA DE ENTREGA" zona={zona} />
      <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <p>
          <b>Cliente:</b> {c.cliente}
        </p>
        {c.recepcion && (
          <p>
            <b>Recepción:</b> {c.recepcion}
          </p>
        )}
        <p>
          <b>Punto de entrega:</b> {c.puntoEntrega}
        </p>
        {c.reparto && (
          <p>
            <b>Reparto:</b> {c.reparto}
            {c.parada && ` · parada ${c.parada}`}
          </p>
        )}
        <p>
          <b>Dirección:</b> {c.direccion}
        </p>
        {c.bultos !== null && (
          <p>
            <b>Bultos:</b> {c.bultos}
          </p>
        )}
        {c.contacto && (
          <p>
            <b>Contacto:</b> {c.contacto}
          </p>
        )}
        {c.pedidos.length > 0 && (
          <p>
            <b>Pedido:</b> {c.pedidos.join(", ")}
            {c.referenciaCliente && ` · OC ${c.referenciaCliente}`}
          </p>
        )}
      </div>
      {c.instrucciones && <p className="text-sm">Instrucciones: {c.instrucciones}</p>}
      {c.observaciones && <p className="text-sm">Observaciones: {c.observaciones}</p>}
      <table className={tabla}>
        <thead>
          <tr>
            <th>#</th>
            <th>Producto</th>
            <th>Cantidad</th>
            <th className="w-28">Recibido</th>
            <th>Observaciones</th>
          </tr>
        </thead>
        <tbody>
          {c.lineas.map((l) => (
            <tr key={l.n}>
              <td>{l.n}</td>
              <td>
                {l.producto}
                {l.reemplazaA && <span className="block text-xs">en reemplazo de {l.reemplazaA}</span>}
              </td>
              <td className="whitespace-nowrap">
                {cant(l.cantidad, l.unidad)}
                {l.presentacion && <span className="block text-xs">({l.presentacion})</span>}
              </td>
              <td className="border-texto!" />
              <td className="text-xs">{l.observaciones}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-right text-sm">
        Líneas: {c.lineas.length}
        {c.bultos !== null && ` · Bultos: ${c.bultos}`}
      </p>
      <Recibido c={c} zona={zona} />
      <p className="text-xs">
        Documento sin valores. La valorización figura en la lista contable {c.numero} v{c.version}.
      </p>
    </section>
  );
}

export function ListaContable({ c, zona }: { c: ContenidoListaContable; zona: string }) {
  const conIva = c.lineas.some((l) => !dec(l.alicuotaIva).isZero());
  return (
    <section className="flex flex-col gap-3">
      <Cabecera c={c} titulo="LISTA CONTABLE (REMITO VALORIZADO)" zona={zona} />
      <p className="text-sm">
        <b>Cliente:</b> {c.cliente}
        {c.razonSocial && ` — ${c.razonSocial}`}
        {c.identificacionFiscal && ` — CUIT ${c.identificacionFiscal}`}
      </p>
      <p className="text-sm">
        <b>Punto de entrega:</b> {c.puntoEntrega} · {c.direccion}
        {c.pedidos.length > 0 && ` · Pedido ${c.pedidos.join(", ")}`}
        {c.referenciaCliente && ` · OC ${c.referenciaCliente}`}
      </p>
      <table className={tabla}>
        <thead>
          <tr>
            <th>#</th>
            <th>Producto</th>
            <th className="text-right">Cantidad</th>
            <th className="text-right">Precio unitario</th>
            {conIva && <th className="text-right">IVA</th>}
            <th className="text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {c.lineas.map((l) => (
            <tr key={l.n}>
              <td>{l.n}</td>
              <td>
                {l.producto}
                {l.reemplazaA && <span className="block text-xs">en reemplazo de {l.reemplazaA}</span>}
              </td>
              <td className="text-right whitespace-nowrap">
                {cant(l.cantidad, l.unidad)}
                {l.presentacion && <span className="block text-xs">= {l.presentacion}</span>}
              </td>
              <td className="text-right whitespace-nowrap">{l.precioUnitario ? formatearMoneda(l.precioUnitario) : "—"}</td>
              {conIva && <td className="text-right">{dec(l.alicuotaIva).toString()} %</td>}
              <td className="text-right whitespace-nowrap">{formatearMoneda(l.importe)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ml-auto flex w-64 flex-col text-right">
        <p>Subtotal neto {formatearMoneda(c.neto)}</p>
        <p>IVA {formatearMoneda(c.iva)}</p>
        <p className="text-lg font-bold">TOTAL {formatearMoneda(c.total)}</p>
      </div>
      {c.recibido && <Recibido c={c} zona={zona} />}
      <p className="text-xs">Documento no válido como factura.</p>
      {c.preciosFijadosEn && (
        <p className="text-xs">Los precios quedaron fijados el {formatearFechaHora(new Date(c.preciosFijadosEn), zona)} y no cambian aunque cambien las listas de precios.</p>
      )}
    </section>
  );
}
