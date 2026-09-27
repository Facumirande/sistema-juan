import Link from "next/link";

import { formatearMoneda, formatearPorcentaje } from "@/dominio/dinero/formato";
import type { OfertaListada } from "@/modulos/precios-compra/ofertas";
import { ORIGENES_PRECIO, UNIDADES_CORTAS, haceDias } from "@/ui/etiquetas";
import { FormularioAccion } from "@/ui/formulario-accion";
import { Tabla } from "@/ui/formularios";

import { marcarPreferidoAccion } from "../../productos/acciones";

import { actualizarPrecioAccion, confirmarSinCambiosAccion, disponibilidadAccion, estadoOfertaAccion } from "./acciones";

export interface PermisosOfertas {
  editarPrecio: boolean;
  marcarPreferido: boolean;
  quitarOferta: boolean;
}

function signo(pct: string): string {
  return pct.startsWith("-") ? "" : "+";
}

/**
 * Ofertas con su comparación (05 §2.1). `mostrar` elige la primera columna: el producto (lista
 * general, ficha del proveedor) o el proveedor (ficha del producto).
 */
export function TablaOfertas({ ofertas, mostrar, permisos }: { ofertas: OfertaListada[]; mostrar: "producto" | "proveedor" | "ambos"; permisos: PermisosOfertas }) {
  return (
    <Tabla>
      <thead>
        <tr>
          {mostrar !== "proveedor" && <th>Producto</th>}
          {mostrar !== "producto" && <th>Proveedor</th>}
          <th>Presentación</th>
          <th>Precio</th>
          <th>Costo</th>
          <th>vs. mejor</th>
          <th>Actualizado</th>
          {permisos.editarPrecio && <th>Precio nuevo</th>}
          <th></th>
        </tr>
      </thead>
      <tbody>
        {ofertas.map((o) => (
          <tr key={o.id} className={o.disponible ? "" : "opacity-60"}>
            {mostrar !== "proveedor" && (
              <td>
                <Link href={`/productos/${o.productoId}`} className="font-medium underline-offset-4 hover:underline">
                  {o.producto}
                </Link>
              </td>
            )}
            {mostrar !== "producto" && (
              <td>
                <Link href={`/proveedores/${o.proveedorId}`} className="font-medium underline-offset-4 hover:underline">
                  {o.esPreferido && <span title="Proveedor preferido">★ </span>}
                  {o.proveedor}
                </Link>
                {o.ubicacionMercado && <span className="block text-sm text-texto-suave">{o.ubicacionMercado}</span>}
              </td>
            )}
            <td>{o.presentacion}</td>
            <td className="whitespace-nowrap">
              {formatearMoneda(o.precioVigente)}
              {o.variacionPct && (
                <span className="block text-sm text-texto-suave">
                  {o.variacionPct.startsWith("-") ? "↓" : "↑"} {signo(o.variacionPct)}
                  {formatearPorcentaje(o.variacionPct, 2)}
                </span>
              )}
            </td>
            <td className="whitespace-nowrap">
              {formatearMoneda(o.costoBase)}/{UNIDADES_CORTAS[o.unidadBase]}
            </td>
            <td className="whitespace-nowrap">
              {!o.disponible ? (
                <span className="text-error">No hay hoy</span>
              ) : o.esMejor ? (
                <span className="rounded-full border border-marca px-2 py-0.5 text-sm font-semibold">Mejor</span>
              ) : (
                o.pctSobreMejor && `${signo(o.pctSobreMejor)}${formatearPorcentaje(o.pctSobreMejor, 2)}`
              )}
            </td>
            <td className="whitespace-nowrap">
              <span className={o.desactualizada ? "font-semibold text-error" : ""}>
                {haceDias(o.diasSinActualizar)}
                {o.desactualizada && " ⚠"}
              </span>
              <span className="block text-sm text-texto-suave">
                {ORIGENES_PRECIO[o.fuenteActualizacion]}
                {o.actualizadoPor && ` · ${o.actualizadoPor}`}
              </span>
            </td>
            {permisos.editarPrecio && (
              <td className="min-w-56">
                <FormularioAccion accion={actualizarPrecioAccion} boton="Guardar" variante="secundario" enLinea>
                  <input type="hidden" name="ofertaId" value={o.id} />
                  <input
                    name="precio"
                    inputMode="decimal"
                    autoComplete="off"
                    aria-label={`Precio nuevo de ${o.producto} en ${o.proveedor}`}
                    placeholder={formatearMoneda(o.precioVigente).replace(",00", "")}
                    className="h-11 w-32 rounded-lg border border-borde bg-superficie px-3 text-base"
                  />
                </FormularioAccion>
              </td>
            )}
            <td>
              <details>
                <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">Más</summary>
                <div className="flex flex-col gap-2 py-2">
                  {permisos.editarPrecio && (
                    <>
                      <FormularioAccion accion={confirmarSinCambiosAccion} boton="Sin cambios hoy" variante="secundario">
                        <input type="hidden" name="ofertaId" value={o.id} />
                      </FormularioAccion>
                      <FormularioAccion accion={disponibilidadAccion} boton={o.disponible ? "No hay hoy" : "Hay de nuevo"} variante="secundario">
                        <input type="hidden" name="ofertaId" value={o.id} />
                        <input type="hidden" name="disponible" value={String(!o.disponible)} />
                      </FormularioAccion>
                    </>
                  )}
                  {permisos.marcarPreferido && !o.esPreferido && (
                    <FormularioAccion accion={marcarPreferidoAccion} boton="Hacer preferido ★" variante="secundario">
                      <input type="hidden" name="productoId" value={o.productoId} />
                      <input type="hidden" name="proveedorId" value={o.proveedorId} />
                    </FormularioAccion>
                  )}
                  <Link href={`/precios/compra/historial/${o.id}`} className="py-2 text-sm font-medium underline">
                    Historial de precios
                  </Link>
                  {permisos.quitarOferta && (
                    <FormularioAccion
                      accion={estadoOfertaAccion}
                      boton="Quitar oferta"
                      variante="peligro"
                      confirmar={`¿Quitar la oferta de ${o.producto} en ${o.proveedor}? El historial de precios queda guardado.`}
                    >
                      <input type="hidden" name="ofertaId" value={o.id} />
                      <input type="hidden" name="activo" value="false" />
                    </FormularioAccion>
                  )}
                </div>
              </details>
            </td>
          </tr>
        ))}
      </tbody>
    </Tabla>
  );
}

export function permisosOfertas(permisos: readonly string[]): PermisosOfertas {
  return {
    editarPrecio: permisos.includes("precios.editar_compra"),
    marcarPreferido: permisos.includes("productos.editar"),
    quitarOferta: permisos.includes("proveedores.editar"),
  };
}
