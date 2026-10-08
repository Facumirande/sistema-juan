import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { formatearMoneda } from "@/dominio/dinero/formato";
import { coincideBusqueda } from "@/dominio/pedidos/carga";
import { listaGeneralPreciosCompra } from "@/modulos/precios-compra/ofertas";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { UNIDADES_CORTAS, haceDias } from "@/ui/etiquetas";
import { FormularioAccion } from "@/ui/formulario-accion";
import { Encabezado, clasesBoton } from "@/ui/formularios";
import { parametro } from "@/ui/parametros";

import { actualizarPrecioAccion } from "../compra/acciones";

export const metadata: Metadata = { title: "Precios de hoy · Sistema Repartos" };

/**
 * P-27 Precios de hoy: como los precios del mercado cambian todos los días, acá se cambia rápido
 * el precio de compra de cada producto en cada puesto. Cada cambio queda guardado en el historial
 * (se ve en la ficha del producto) y el precio de venta se vuelve a calcular solo.
 */
export default async function PreciosDeHoy({ searchParams }: PageProps<"/precios/hoy">) {
  const sesion = await sesionParaPantalla("precios.ver_costos");
  const sp = await searchParams;
  const texto = parametro(sp.texto) ?? "";
  const soloViejos = parametro(sp.ver) === "viejos";
  const { ofertas } = await listaGeneralPreciosCompra(obtenerBaseDatos(), sesion.authUserId);
  const puedeCambiar = sesion.permisos.includes("precios.editar_compra");
  const visibles = ofertas.filter((o) => coincideBusqueda(`${o.producto} ${o.codigoProducto} ${o.proveedor}`, texto) && (!soloViejos || o.desactualizada));
  const productos = [...new Map(visibles.map((o) => [o.productoId, { id: o.productoId, nombre: o.producto, unidad: UNIDADES_CORTAS[o.unidadBase] ?? "" }])).values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const viejos = ofertas.filter((o) => o.desactualizada).length;

  return (
    <section className="flex max-w-4xl flex-col gap-4">
      <Encabezado titulo="Precios de hoy" descripcion="Los precios del mercado cambian todos los días. Escribí el precio nuevo al lado del que cambió y tocá Guardar: el precio de venta se actualiza solo y el cambio queda en el historial.">
        <Link href="/precios/compra/rapida" className={clasesBoton("secundario")}>
          🏪 Cargar por puesto
        </Link>
        <Link href="/precios/venta" className={clasesBoton("secundario")}>
          Precios de venta
        </Link>
      </Encabezado>

      <form method="get" className="flex flex-wrap items-center gap-2 print:hidden">
        <input name="texto" defaultValue={texto} placeholder="🔎 Buscar producto o puesto" aria-label="Buscar producto o puesto" className="h-12 min-w-0 flex-1 rounded-xl border-2 border-borde bg-superficie px-3 text-lg" />
        {soloViejos && <input type="hidden" name="ver" value="viejos" />}
        <button type="submit" className={clasesBoton("secundario")}>
          Buscar
        </button>
        {viejos > 0 && (
          <Link href={soloViejos ? "/precios/hoy" : "/precios/hoy?ver=viejos"} className={clasesBoton(soloViejos ? "principal" : "secundario")}>
            ⚠ {viejos === 1 ? "1 precio viejo" : `${viejos} precios viejos`}
          </Link>
        )}
      </form>

      {ofertas.length === 0 ? (
        <p className="rounded-2xl border-2 border-amber-500 bg-superficie p-4 text-lg font-semibold">
          ⚠ Todavía no hay ningún precio de compra cargado. Se cargan en la ficha de cada producto (“¿Dónde se compra y a cuánto?”) o solos, con la primera compra que anotes.{" "}
          <Link href="/productos" className="underline underline-offset-2">
            Ir a Productos →
          </Link>
        </p>
      ) : (
        productos.length === 0 && <p className="text-texto-suave">No hay precios con ese filtro.</p>
      )}

      <ul className="flex flex-col gap-3">
        {productos.map((p) => (
          <li key={p.id} className="flex flex-col gap-2 rounded-2xl border border-borde bg-superficie p-3 sm:p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-xl font-bold">{p.nombre}</h2>
              <Link href={`/productos/${p.id}`} className="text-sm font-medium underline underline-offset-2">
                📈 Historial y ficha del producto
              </Link>
            </div>
            <ul className="flex flex-col divide-y divide-borde">
              {visibles
                .filter((o) => o.productoId === p.id)
                .map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2">
                    <div className="min-w-44 flex-1">
                      <p className="font-semibold">
                        🏪 {o.proveedor} <span className="font-normal text-texto-suave">· {o.presentacion}</span>
                        {o.esMejor && visibles.filter((x) => x.productoId === p.id).length > 1 && <span className="ml-2 rounded-full bg-marca/15 px-2 py-0.5 text-sm font-semibold text-marca">el más barato</span>}
                      </p>
                      <p className="text-sm">
                        Hoy está a <b className="text-lg tabular-nums">{formatearMoneda(o.precioVigente)}</b>{" "}
                        <span className="text-texto-suave">
                          ({formatearMoneda(o.costoBase)} el {p.unidad})
                        </span>{" "}
                        · <span className={o.desactualizada ? "font-semibold text-error" : "text-texto-suave"}>cargado {haceDias(o.diasSinActualizar)}{o.desactualizada && " ⚠ viejo"}</span>
                        {!o.disponible && <span className="font-semibold text-error"> · hoy no tiene</span>}
                      </p>
                    </div>
                    {puedeCambiar && (
                      <FormularioAccion accion={actualizarPrecioAccion} boton="Guardar" variante="principal" enLinea>
                        <input type="hidden" name="ofertaId" value={o.id} />
                        <label className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold">Precio nuevo $</span>
                          <input
                            name="precio"
                            inputMode="decimal"
                            autoComplete="off"
                            aria-label={`Precio nuevo de ${o.producto} en ${o.proveedor}, por ${o.presentacion}`}
                            placeholder={formatearMoneda(o.precioVigente).replace("$", "").trim()}
                            className="h-12 w-32 rounded-xl border-2 border-borde bg-superficie px-3 text-lg font-semibold tabular-nums"
                          />
                        </label>
                      </FormularioAccion>
                    )}
                  </li>
                ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
