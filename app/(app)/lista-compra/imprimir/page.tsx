import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { dec, sumar } from "@/dominio/dinero/decimal";
import { formatearCantidad, formatearMoneda, formatearNumero, type UnidadMedida } from "@/dominio/dinero/formato";
import { formatearFechaHora, sumarDias } from "@/dominio/fechas/fechas";
import { obtenerListaCompra } from "@/modulos/compras/lista-compra";
import { fechasDeTrabajo } from "@/modulos/pedidos/jornadas";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { BotonImprimir, ImprimirAlAbrir } from "@/ui/boton-imprimir";
import { fechaConDia } from "@/ui/etiquetas";
import { parametro } from "@/ui/parametros";
import { SemaforoCredito } from "@/ui/semaforo";

export const metadata: Metadata = { title: "Lista de compras para imprimir · Sistema Repartos" };

const ALERTAS: Readonly<Record<string, string>> = {
  SIN_PROVEEDOR: "sin precio de ningún proveedor",
  CREDITO_INSUFICIENTE: "el más conveniente no tiene crédito",
  PRECIO_DESACTUALIZADO: "precio viejo, confirmar",
};

const cant = (v: string, unidad: string) => formatearCantidad(v, unidad as UnidadMedida);

/**
 * DOC-01 Lista de compras (09): la lista completa del día, por puesto, con para quién es cada
 * producto, casillas y columnas vacías para anotar lo que se pagó y lo que se compró.
 * `?precios=no` la imprime sin precios (RN-053); `?falta=1` deja solo lo que falta comprar.
 */
export default async function ImprimirListaCompra({ searchParams }: PageProps<"/lista-compra/imprimir">) {
  const sesion = await sesionParaPantalla("documentos.imprimir_compra");
  const db = obtenerBaseDatos();
  const f = await searchParams;
  const pedida = parametro(f.fecha);
  const fecha = pedida && /^\d{4}-\d{2}-\d{2}$/.test(pedida) ? pedida : (await fechasDeTrabajo(db, sesion.authUserId)).sugerida;
  const conPrecios = parametro(f.precios) !== "no" && sesion.permisos.includes("precios.ver_costos");
  const soloFalta = parametro(f.falta) === "1";
  const lista = await obtenerListaCompra(db, sesion.authUserId, fecha);

  const grupos = (lista?.plan ?? [])
    .map((p) => ({ ...p, lineas: p.lineas.filter((l) => !soloFalta || l.estado === "PENDIENTE" || l.estado === "PARCIAL") }))
    .filter((p) => p.lineas.length > 0);
  const subtotal = (lineas: typeof grupos[number]["lineas"]) => sumar(lineas.map((l) => l.costoEstimado ?? "0"));
  const total = sumar(grupos.map((g) => subtotal(g.lineas)));
  const todasLasLineas = (lista?.plan ?? []).flatMap((p) => p.lineas);
  const faltan = todasLasLineas.filter((l) => l.estado === "PENDIENTE" || l.estado === "PARCIAL").length;
  const opcion = (cambio: Record<string, string | null>) => {
    const q = new URLSearchParams({ fecha });
    if (!conPrecios) q.set("precios", "no");
    if (soloFalta) q.set("falta", "1");
    for (const [k, v] of Object.entries(cambio)) {
      if (v === null) q.delete(k);
      else q.set(k, v);
    }
    return `/lista-compra/imprimir?${q.toString()}`;
  };

  return (
    <article className="mx-auto flex max-w-5xl flex-col gap-4 bg-superficie p-4 print:max-w-none print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/lista-compra?fecha=${fecha}`} className="text-texto-suave hover:underline">
          ← Lista de compras
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          {sesion.permisos.includes("precios.ver_costos") && (
            <Link href={opcion({ precios: conPrecios ? "no" : null })} className="underline-offset-4 hover:underline">
              {conPrecios ? "Sin precios" : "Con precios"}
            </Link>
          )}
          <Link href={opcion({ falta: soloFalta ? null : "1" })} className="underline-offset-4 hover:underline">
            {soloFalta ? "Toda la lista" : "Solo lo que falta comprar"}
          </Link>
          <a href={`/lista-compra/planilla?fecha=${fecha}`} className="underline-offset-4 hover:underline">
            Bajar a Excel
          </a>
          <BotonImprimir />
        </div>
      </div>
      {lista && parametro(f.ya) === "1" && <ImprimirAlAbrir />}

      {!lista ? (
        <p>
          Todavía no se armó la lista del {fechaConDia(fecha)}.{" "}
          <Link href={`/lista-compra?fecha=${fecha}`} className="underline">
            Armarla
          </Link>
        </p>
      ) : (
        <>
          <header className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-texto pb-2">
            <h1 className="text-xl font-bold">LISTA DE COMPRAS</h1>
            <p className="text-2xl font-extrabold first-letter:uppercase">{fechaConDia(lista.fecha)}</p>
            <p className="w-full font-semibold">
              {lista.pedidos === 1 ? "1 pedido" : `${lista.pedidos} pedidos`} · {todasLasLineas.length === 1 ? "1 producto" : `${todasLasLineas.length} productos`} · {faltan === 0 ? "ya está todo comprado" : faltan === 1 ? "falta comprar 1" : `faltan comprar ${faltan}`}
              {soloFalta && " · en esta hoja, solo lo que falta"}
            </p>
            <p className="w-full text-sm">Armada {formatearFechaHora(lista.generadaEn, sesion.zonaHoraria)} · impresa {formatearFechaHora(new Date(), sesion.zonaHoraria)}</p>
          </header>
          {lista.desactualizada && <p className="border-2 border-texto p-2 font-bold">DESACTUALIZADA: los pedidos cambiaron después de armarla. Volvé a calcularla antes de comprar.</p>}
          {grupos.length === 0 && <p>{todasLasLineas.length === 0 ? "La lista de este día no tiene productos." : "No falta comprar nada: tocá “Toda la lista” para verla completa."}</p>}

          {grupos.map((p) => (
            <section key={p.proveedorId ?? "sin"} className="break-inside-avoid">
              <h2 className="flex flex-wrap items-baseline gap-x-3 font-bold uppercase">
                {p.proveedor}
                {p.ubicacion && <span className="font-normal normal-case">— {p.ubicacion}</span>}
                {p.credito && (
                  <span className="text-sm font-normal normal-case">
                    <SemaforoCredito semaforo={p.credito.semaforoProyectado} />
                    {p.credito.disponibleHoy !== null && ` disp. ${formatearMoneda(p.credito.disponibleHoy)} → ${formatearMoneda(p.credito.disponibleDespues ?? "0")}`}
                  </span>
                )}
              </h2>
              <table className="w-full border-collapse text-left text-sm [&_td]:border-b [&_td]:border-borde [&_td]:px-1 [&_td]:py-1 [&_td]:align-top [&_th]:border-b [&_th]:border-texto [&_th]:px-1">
                <thead>
                  <tr>
                    <th className="w-6" />
                    <th>Producto</th>
                    <th>Comprar</th>
                    <th>Necesidad</th>
                    <th>Ya compr.</th>
                    <th>Sobra</th>
                    {conPrecios && <th className="text-right">Precio sug.</th>}
                    {conPrecios && <th className="text-right">Costo est.</th>}
                    <th className="w-24">Pagado</th>
                    <th className="w-20">Compr.</th>
                  </tr>
                </thead>
                <tbody>
                  {p.lineas.map((l) => (
                    <tr key={l.id}>
                      <td>{l.estado === "COMPRADO" ? "☑" : l.estado === "NO_CONSEGUIDO" ? "✕" : "☐"}</td>
                      <td>
                        <span className="font-semibold">{l.producto}</span>
                        {l.paraQuien.length > 0 && <span className="block text-xs">Para: {l.paraQuien.map((q) => `${q.cliente} (${cant(q.cantidadBase, l.unidadBase)})`).join(" · ")}</span>}
                        {l.estado === "COMPRADO" && <span className="block text-xs font-semibold">{l.tildado ? "YA COMPRADO (tildado)" : "YA COMPRADO"}</span>}
                        {l.estado === "PARCIAL" && <span className="block text-xs font-semibold">FALTA UNA PARTE</span>}
                        {l.observaciones && <span className="block text-xs">“{l.observaciones}”</span>}
                        {l.alertas.map((a) => (
                          <span key={a} className="block text-xs font-semibold">
                            ⚠ {ALERTAS[a]}
                          </span>
                        ))}
                        {l.estado === "NO_CONSEGUIDO" && <span className="block text-xs font-semibold">NO SE CONSIGUIÓ</span>}
                      </td>
                      <td className="whitespace-nowrap">
                        {l.cantidadPresentaciones && l.presentacion ? `${formatearNumero(l.cantidadPresentaciones, { decimales: 3, recortarCeros: true })} ${l.presentacion}` : "—"}
                        {l.aComprarBase && <span className="block text-xs">{cant(l.aComprarBase, l.unidadBase)}</span>}
                      </td>
                      <td className="whitespace-nowrap">{cant(l.necesidadBase, l.unidadBase)}</td>
                      <td className="whitespace-nowrap">{cant(l.compradoBase, l.unidadBase)}</td>
                      <td className="whitespace-nowrap">{dec(l.sobrantePrevistoBase).gt(0) ? cant(l.sobrantePrevistoBase, l.unidadBase) : ""}</td>
                      {conPrecios && <td className="text-right whitespace-nowrap">{l.precioSugerido ? formatearMoneda(l.precioSugerido) : ""}</td>}
                      {conPrecios && <td className="text-right whitespace-nowrap">{l.costoEstimado ? formatearMoneda(l.costoEstimado) : ""}</td>}
                      <td className="border-texto!" />
                      <td className="border-texto!" />
                    </tr>
                  ))}
                </tbody>
              </table>
              {conPrecios && subtotal(p.lineas).gt(0) && <p className="text-right text-sm font-semibold">Subtotal {formatearMoneda(subtotal(p.lineas))}</p>}
            </section>
          ))}
          {conPrecios && total.gt(0) && <p className="text-right text-lg font-bold">TOTAL ESTIMADO {formatearMoneda(total)}</p>}
          <footer className="border-t border-texto pt-2 text-sm">
            Lo comprado se registra en el sistema desde el celular. Si no hay señal, anotá acá y cargalo al volver.
          </footer>
        </>
      )}
      <nav className="flex gap-3 text-sm print:hidden">
        <Link href={`/lista-compra/imprimir?fecha=${sumarDias(fecha, -1)}`} className="text-texto-suave hover:underline">
          ← Día anterior
        </Link>
        <Link href={`/lista-compra/imprimir?fecha=${sumarDias(fecha, 1)}`} className="text-texto-suave hover:underline">
          Día siguiente →
        </Link>
      </nav>
    </article>
  );
}
