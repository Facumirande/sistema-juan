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

export const metadata: Metadata = { title: "Lista de compras para imprimir · Sistema Repartos" };

const ALERTAS: Readonly<Record<string, string>> = {
  SIN_PROVEEDOR: "sin precio de ningún proveedor",
  CREDITO_INSUFICIENTE: "el más conveniente no tiene crédito",
  PRECIO_DESACTUALIZADO: "precio viejo, confirmar",
};

const cant = (v: string, unidad: string) => formatearCantidad(v, unidad as UnidadMedida);

/**
 * DOC-01 Lista de compras (09), simplificada el 10/10/2026: la lista del día por puesto (el elegido o
 * el que conviene; lo que va sin puesto, aparte), con casilla, el producto en grande, cuánto comprar,
 * para quién es y dos columnas para anotar a mano el puesto y el precio.
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
              <h2 className="flex flex-wrap items-baseline gap-x-3 border-b-2 border-texto pb-0.5 text-lg font-extrabold uppercase">
                {p.proveedorId ? p.proveedor : "Sin puesto"}
                {p.ubicacion && <span className="text-sm font-semibold normal-case">{p.ubicacion}</span>}
                <span className="ml-auto text-sm font-semibold normal-case">
                  {p.lineas.length === 1 ? "1 producto" : `${p.lineas.length} productos`}
                  {conPrecios && subtotal(p.lineas).gt(0) && ` · ${formatearMoneda(subtotal(p.lineas))}`}
                </span>
              </h2>
              <table className="w-full border-collapse text-left [&_td]:border-b [&_td]:border-borde [&_td]:px-1 [&_td]:py-1.5 [&_td]:align-middle [&_th]:px-1 [&_th]:pt-1 [&_th]:text-xs [&_th]:uppercase">
                <thead>
                  <tr>
                    <th className="w-7" />
                    <th>Producto</th>
                    <th>Comprar</th>
                    {conPrecios && <th className="text-right">Último precio</th>}
                    <th className="w-28">Puesto</th>
                    <th className="w-24">Precio</th>
                  </tr>
                </thead>
                <tbody>
                  {p.lineas.map((l) => {
                    const hecho = l.estado === "COMPRADO" || l.estado === "NO_CONSEGUIDO";
                    return (
                      <tr key={l.id} className={hecho ? "opacity-60" : ""}>
                        <td className="text-xl leading-none">{l.estado === "COMPRADO" ? "☑" : l.estado === "NO_CONSEGUIDO" ? "✕" : "☐"}</td>
                        <td>
                          <span className={`text-base font-bold ${hecho ? "line-through" : ""}`}>{l.producto}</span>
                          {l.paraQuien.length > 0 && <span className="block text-xs">{l.paraQuien.map((q) => `${q.cliente} ${cant(q.cantidadBase, l.unidadBase)}`).join(" · ")}</span>}
                          {l.estado === "PARCIAL" && <span className="block text-xs font-bold">FALTA UNA PARTE</span>}
                          {l.estado === "NO_CONSEGUIDO" && <span className="block text-xs font-bold">NO SE CONSIGUIÓ</span>}
                          {l.observaciones && <span className="block text-xs">“{l.observaciones}”</span>}
                          {l.alertas.map((a) => (
                            <span key={a} className="block text-xs font-semibold">
                              ⚠ {ALERTAS[a]}
                            </span>
                          ))}
                        </td>
                        <td className="whitespace-nowrap">
                          <span className="text-base font-bold">
                            {l.cantidadPresentaciones && l.presentacion && !dec(l.factor).eq(1) ? `${formatearNumero(l.cantidadPresentaciones, { decimales: 3, recortarCeros: true })} × ${l.presentacion}` : cant(l.pendienteBase === "0" ? l.necesidadBase : l.pendienteBase, l.unidadBase)}
                          </span>
                          {l.cantidadPresentaciones && l.presentacion && !dec(l.factor).eq(1) && <span className="block text-xs">{cant(l.necesidadBase, l.unidadBase)}</span>}
                        </td>
                        {conPrecios && <td className="text-right whitespace-nowrap">{l.precioSugerido ? formatearMoneda(l.precioSugerido) : "—"}</td>}
                        <td className="border-b-texto!" />
                        <td className="border-b-texto!" />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
