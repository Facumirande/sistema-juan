import Link from "next/link";

import { formatearMoneda, formatearPorcentaje } from "@/dominio/dinero/formato";
import type { OfertaListada } from "@/modulos/precios-compra/ofertas";
import { UNIDADES_CORTAS, haceDias } from "@/ui/etiquetas";
import { FormularioAccion } from "@/ui/formulario-accion";

import { marcarPreferidoAccion } from "../../productos/acciones";

import { actualizarPrecioAccion, confirmarSinCambiosAccion, disponibilidadAccion, estadoOfertaAccion } from "./acciones";
import type { PermisosOfertas } from "./tabla-ofertas";

/**
 * Los puestos que venden un producto, en tarjetas (ficha del producto): cada una dice en palabras
 * a cuánto lo vende y cuánto sale el kilo o la unidad, si es el más barato, y tiene a la vista lo
 * que se hace seguido (cambiar el precio). Lo demás va plegado, cada botón con su explicación.
 */
export function TarjetasDeOfertas({ ofertas, permisos }: { ofertas: OfertaListada[]; permisos: PermisosOfertas }) {
  const pildora = "rounded-full px-2.5 py-0.5 text-sm font-semibold";
  const opcion = "flex flex-col gap-1";
  return (
    <ul className="flex flex-col gap-3">
      {ofertas.map((o) => {
        const unidad = UNIDADES_CORTAS[o.unidadBase];
        const envase = o.presentacion.toLowerCase();
        return (
          <li key={o.id} className={`flex flex-col gap-3 rounded-2xl border-2 p-4 ${o.esMejor && o.disponible ? "border-marca/60" : "border-borde"} ${o.disponible ? "" : "opacity-70"}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-lg font-semibold">
                  <span aria-hidden>🏪</span>
                  <Link href={`/proveedores/${o.proveedorId}`} className="underline-offset-4 hover:underline">
                    {o.proveedor}
                  </Link>
                  {o.esPreferido && <span className={`${pildora} bg-[var(--pastel-amarillo)] text-[var(--pastel-amarillo-texto)]`}>★ El que preferís</span>}
                  {!o.disponible ? (
                    <span className={`${pildora} bg-error/15 text-error`}>Hoy no tiene</span>
                  ) : o.esMejor ? (
                    ofertas.length > 1 && <span className={`${pildora} bg-marca/15 text-marca`}>✓ El más barato</span>
                  ) : (
                    o.pctSobreMejor && <span className={`${pildora} bg-fondo text-texto-suave`}>{formatearPorcentaje(o.pctSobreMejor, 0)} más caro que el más barato</span>
                  )}
                </p>
                {o.ubicacionMercado && <p className="text-sm text-texto-suave">{o.ubicacionMercado}</p>}
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold tabular-nums">{formatearMoneda(o.precioVigente)}</p>
                <p className="text-sm text-texto-suave">cada {envase}</p>
              </div>
            </div>
            <p className="rounded-xl bg-fondo px-3 py-2">
              👉 Te sale{" "}
              <b>
                {formatearMoneda(o.costoBase)} el {unidad}
              </b>
              .{" "}
              <span className={o.desactualizada ? "font-semibold text-error" : "text-texto-suave"}>
                Precio cargado {haceDias(o.diasSinActualizar)}
                {o.actualizadoPor && ` por ${o.actualizadoPor}`}
                {o.fuenteActualizacion === "COMPRA" && " (al anotar una compra)"}
                {o.desactualizada && " · ⚠ es viejo, conviene confirmarlo"}
                {o.variacionPct && ` · ${o.variacionPct.startsWith("-") ? "bajó" : "subió"} ${formatearPorcentaje(o.variacionPct.replace("-", ""), 0)} contra el anterior`}.
              </span>
            </p>
            {permisos.editarPrecio && (
              <div className="flex flex-col gap-1">
                <p className="font-medium">¿Cambió el precio? Escribí el nuevo (por {envase}):</p>
                <FormularioAccion accion={actualizarPrecioAccion} boton="Guardar el precio nuevo" variante="principal" enLinea>
                  <input type="hidden" name="ofertaId" value={o.id} />
                  <input
                    name="precio"
                    inputMode="decimal"
                    autoComplete="off"
                    aria-label={`Precio nuevo de ${o.producto} en ${o.proveedor}`}
                    placeholder={formatearMoneda(o.precioVigente)}
                    className="h-12 w-36 rounded-xl border-2 border-borde bg-superficie px-3 text-lg"
                  />
                </FormularioAccion>
              </div>
            )}
            <details>
              <summary className="min-h-10 cursor-pointer py-2 font-medium text-texto-suave">Más opciones de este puesto</summary>
              <div className="grid gap-4 pt-2 sm:grid-cols-2">
                {permisos.editarPrecio && (
                  <>
                    <div className={opcion}>
                      <FormularioAccion accion={confirmarSinCambiosAccion} boton="✓ Hoy sigue al mismo precio" variante="secundario">
                        <input type="hidden" name="ofertaId" value={o.id} />
                      </FormularioAccion>
                      <p className="text-sm text-texto-suave">Deja anotado que lo revisaste hoy, para que no figure como precio viejo.</p>
                    </div>
                    <div className={opcion}>
                      <FormularioAccion accion={disponibilidadAccion} boton={o.disponible ? "🚫 Hoy no tiene" : "✓ Ya tiene de nuevo"} variante="secundario">
                        <input type="hidden" name="ofertaId" value={o.id} />
                        <input type="hidden" name="disponible" value={String(!o.disponible)} />
                      </FormularioAccion>
                      <p className="text-sm text-texto-suave">{o.disponible ? "La lista de compras deja de sugerir este puesto hasta que vuelva a tener." : "La lista de compras lo vuelve a tener en cuenta."}</p>
                    </div>
                  </>
                )}
                {permisos.marcarPreferido && !o.esPreferido && (
                  <div className={opcion}>
                    <FormularioAccion accion={marcarPreferidoAccion} boton="★ Es el que prefiero" variante="secundario">
                      <input type="hidden" name="productoId" value={o.productoId} />
                      <input type="hidden" name="proveedorId" value={o.proveedorId} />
                    </FormularioAccion>
                    <p className="text-sm text-texto-suave">La lista de compras lo sugiere primero para este producto, aunque no sea el más barato.</p>
                  </div>
                )}
                <div className={opcion}>
                  <Link href={`/precios/compra/historial/${o.id}`} className="flex min-h-12 items-center font-medium underline underline-offset-4">
                    📈 Ver cómo fue cambiando el precio
                  </Link>
                </div>
                {permisos.quitarOferta && (
                  <div className={opcion}>
                    <FormularioAccion
                      accion={estadoOfertaAccion}
                      boton="Este puesto ya no lo vende"
                      variante="peligro"
                      confirmar={`¿Sacar a ${o.proveedor} como puesto de ${o.producto}? El historial de precios queda guardado.`}
                    >
                      <input type="hidden" name="ofertaId" value={o.id} />
                      <input type="hidden" name="activo" value="false" />
                    </FormularioAccion>
                    <p className="text-sm text-texto-suave">Lo saca de esta lista. Se puede volver a agregar cuando quieras.</p>
                  </div>
                )}
              </div>
            </details>
          </li>
        );
      })}
    </ul>
  );
}
