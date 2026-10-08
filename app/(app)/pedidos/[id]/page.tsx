import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { dec } from "@/dominio/dinero/decimal";
import { formatearCantidad, formatearMoneda, formatearNumero, type UnidadMedida } from "@/dominio/dinero/formato";
import { sumarDias } from "@/dominio/fechas/fechas";
import { obtenerCliente } from "@/modulos/clientes/clientes";
import { obtenerPedido, type LineaDePedido } from "@/modulos/pedidos/pedidos";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { cargarFicha, idDeRuta } from "@/ui/accion-servidor";
import { NombreDeProducto } from "@/ui/checklist";
import { ALERTAS_PRECIO, CANALES, ESTADOS_PEDIDO, ORIGENES_VENTA, UNIDADES_CORTAS, fechaConDia, opciones } from "@/ui/etiquetas";
import { FormularioAccion } from "@/ui/formulario-accion";
import { AreaTexto, Aviso, Campo, CampoNumero, Encabezado, Selector, clasesBoton } from "@/ui/formularios";

import {
  cambiarLineaAccion,
  cancelarPedidoAccion,
  datosPedidoAccion,
  duplicarPedidoAccion,
  precioManualAccion,
  quitarLineaAccion,
  recalcularAccion,
} from "../acciones";

export const metadata: Metadata = { title: "Pedido · Sistema Repartos" };

/** "3 kg" o "2 × Cajón 18 kg" (y debajo cuánto es en total). */
function Cantidad({ l }: { l: LineaDePedido }) {
  const base = formatearCantidad(l.cantidadBase, l.unidadBase as UnidadMedida);
  if (!l.presentacion) return <b className="text-xl tabular-nums">{base}</b>;
  return (
    <span className="flex flex-col">
      <b className="text-xl tabular-nums">
        {formatearNumero(l.cantidad, { decimales: 3, recortarCeros: true })} × {l.presentacion}
      </b>
      <span className="text-texto-suave">son {base}</span>
    </span>
  );
}

/** A cuánto se le cobra y de dónde sale ese precio. */
function Precio({ l }: { l: LineaDePedido }) {
  const p = l.precio;
  if (!p) return null;
  if (!p.precio) return <span className="font-semibold text-error">Sin precio</span>;
  const unidad = UNIDADES_CORTAS[l.unidadBase];
  return (
    <span className="text-texto-suave">
      a {l.presentacion ? `${formatearMoneda(dec(p.precio).times(l.factor))} cada uno` : `${formatearMoneda(p.precio)} el ${unidad}`}
      {p.origen && ` · ${ORIGENES_VENTA[p.origen]}`}
      {p.recargo && ` ${formatearNumero(p.recargo, { decimales: 1, recortarCeros: true })} %`}
    </span>
  );
}

const plegado = "rounded-xl border border-borde bg-superficie p-4";
const titular = "min-h-11 cursor-pointer py-2 font-semibold";

/**
 * P-42 Detalle de un pedido. De más a menos (pedido del usuario, 07/10/2026): arriba lo que
 * importa —para quién, para qué día, qué lleva y cuánto suma—; cambiar una cantidad queda a un
 * toque en cada producto, y todo lo demás (quitar un producto, precio a mano, datos del pedido,
 * duplicar, cancelar) va plegado.
 */
export default async function PaginaPedido({ params }: PageProps<"/pedidos/[id]">) {
  const sesion = await sesionParaPantalla("pedidos.ver");
  const id = idDeRuta((await params).id);
  const db = obtenerBaseDatos();
  const p = await cargarFicha(obtenerPedido(db, sesion.authUserId, id));
  const cliente = p.editable ? await obtenerCliente(db, sesion.authUserId, p.clienteId) : null;
  const puntos = cliente?.puntosEntrega.filter((x) => x.activo || x.id === p.puntoEntregaId) ?? [];
  const vivas = p.lineas.filter((l) => !l.cancelado);
  const alertas = [...new Set(vivas.flatMap((l) => l.precio?.alertas ?? []))];
  const puedeOverride = sesion.permisos.includes("precios.override_linea");
  const puedeDuplicar = sesion.permisos.includes("pedidos.crear");
  const puedeCancelar = ["BORRADOR", "CONFIRMADO", "EN_COMPRA"].includes(p.estado) && sesion.permisos.includes("pedidos.cancelar");

  return (
    <section className="flex max-w-4xl flex-col gap-5">
      <Encabezado titulo={`${p.numero} · ${p.cliente}`} descripcion={`${p.puntoEntrega} (${p.direccion})${p.canal ? ` · llegó por ${CANALES[p.canal]}` : ""}${p.referenciaCliente ? ` · OC ${p.referenciaCliente}` : ""}`}>
        <Link href={`/inicio?fecha=${p.fecha}`} className={`${clasesBoton("principal")} min-h-14 px-6 text-lg`}>
          ← Volver al tablero
        </Link>
        {p.editable && (
          <Link href={`/pedidos/${p.id}/cambiar`} className={`${clasesBoton("secundario")} min-h-14 border-2 text-lg`}>
            ✏️ {vivas.length > 0 ? "Cambiar productos" : "Agregar productos"}
          </Link>
        )}
      </Encabezado>

      {/* Lo principal, de un vistazo. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <p className="flex flex-col rounded-2xl border border-borde bg-superficie p-4">
          <span className="text-texto-suave">Se entrega el</span>
          <b className="text-2xl leading-tight first-letter:uppercase">{fechaConDia(p.fecha)}</b>
          {(p.entregaDesde || p.entregaHasta) && (
            <span className="text-texto-suave">
              {p.entregaDesde && `desde las ${p.entregaDesde} `}
              {p.entregaHasta && `antes de las ${p.entregaHasta}`}
            </span>
          )}
        </p>
        <p className="flex flex-col rounded-2xl border border-borde bg-superficie p-4">
          <span className="text-texto-suave">Está en</span>
          <b className={`text-2xl leading-tight ${p.estado === "CANCELADO" ? "text-error" : ""}`}>{ESTADOS_PEDIDO[p.estado]}</b>
          <span className="text-texto-suave">{vivas.length === 1 ? "1 producto" : `${vivas.length} productos`}</span>
        </p>
        {p.totalEstimado !== null && (
          <p className="flex flex-col rounded-2xl bg-[var(--pastel-verde)] p-4 text-[var(--pastel-verde-texto)]">
            <span>Total estimado</span>
            <b className="text-3xl leading-tight tabular-nums">{formatearMoneda(p.totalEstimado)}</b>
            <span className="text-sm">Se ajusta con el costo real de la compra.</span>
          </p>
        )}
      </div>

      {p.otrosDelMismoDia.length > 0 && (
        <Aviso>
          Este cliente tiene otro pedido para el mismo día y lugar:{" "}
          {p.otrosDelMismoDia.map((o) => (
            <Link key={o.id} href={`/pedidos/${o.id}`} className="font-medium underline">
              {o.numero}
            </Link>
          ))}
          . Van juntos en la misma entrega.
        </Aviso>
      )}
      {p.estado === "BORRADOR" && <Aviso>Este pedido no terminó de cargarse: revisá sus productos con “Cambiar productos” y guardalo.</Aviso>}
      {p.requiereOrdenCompra && !p.referenciaCliente && p.estado === "BORRADOR" && <Aviso>Este cliente trabaja con orden de compra: cargá el número en “Más opciones → Datos del pedido”.</Aviso>}
      {p.observaciones && <p className="rounded-xl bg-[var(--pastel-amarillo)] px-4 py-3 text-lg text-[var(--pastel-amarillo-texto)]">📝 {p.observaciones}</p>}

      <div className="flex flex-col gap-3">
        <h2 className="text-2xl font-semibold">🧺 Lo que lleva</h2>
        {p.lineas.length === 0 ? (
          <p className="rounded-2xl border border-borde bg-superficie p-4 text-lg text-texto-suave">
            Todavía no tiene productos.{" "}
            {p.editable && (
              <Link href={`/pedidos/${p.id}/cambiar`} className="font-semibold underline underline-offset-2">
                Agregalos tocando los recuadros
              </Link>
            )}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {p.lineas.map((l) => (
              <li key={l.id} className={`rounded-2xl border border-borde bg-superficie p-4 ${l.cancelado ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                  <div className="min-w-0 flex-1 basis-56">
                    <NombreDeProducto nombre={l.producto} className={`text-2xl ${l.cancelado ? "line-through" : ""}`} />
                    {l.observaciones && <p className="text-texto-suave">“{l.observaciones}”</p>}
                    {l.cancelado && <p className="font-semibold text-error">Se sacó del pedido: {l.motivoCancelacion}</p>}
                    {l.precio?.alertas.map((a) => (
                      <p key={a} className="font-semibold text-error">
                        ⚠ {ALERTAS_PRECIO[a]}
                      </p>
                    ))}
                  </div>
                  <div className="flex flex-col">
                    <Cantidad l={l} />
                    {p.totalEstimado !== null && <Precio l={l} />}
                  </div>
                  {p.totalEstimado !== null && <b className="ml-auto text-2xl tabular-nums">{l.precio?.subtotal ? formatearMoneda(l.precio.subtotal) : "—"}</b>}
                </div>

                {p.editable && !l.cancelado && (
                  <details className="mt-2 border-t border-borde pt-1">
                    <summary className={titular}>✏️ Cambiar la cantidad</summary>
                    <div className="flex flex-col gap-3 pb-1">
                      <FormularioAccion accion={cambiarLineaAccion} boton="✓ Guardar la cantidad">
                        <input type="hidden" name="itemId" value={l.id} />
                        <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
                          <CampoNumero
                            etiqueta={l.presentacion ? `¿Cuántos? (${l.presentacion})` : `¿Cuánto? (${UNIDADES_CORTAS[l.unidadBase]})`}
                            name="cantidad"
                            required
                            defaultValue={formatearNumero(l.cantidad, { decimales: 3, recortarCeros: true })}
                          />
                          <Campo etiqueta="Nota para preparar (opcional)" name="observaciones" defaultValue={l.observaciones ?? ""} placeholder="Ej. bien maduros" />
                        </div>
                      </FormularioAccion>

                      <details className={plegado}>
                        <summary className={`${titular} text-error`}>🗑 Sacar este producto del pedido</summary>
                        <FormularioAccion accion={quitarLineaAccion} boton="Sacarlo del pedido" variante="peligro" className="mt-2 flex flex-col gap-3">
                          <input type="hidden" name="itemId" value={l.id} />
                          {p.estado !== "BORRADOR" && <Campo etiqueta="¿Por qué?" name="motivo" placeholder="Ej. el cliente ya no lo necesita" />}
                        </FormularioAccion>
                      </details>

                      {puedeOverride && (
                        <details className={plegado}>
                          <summary className={titular}>💲 {l.precio?.manual ? "Tiene un precio puesto a mano" : "Cobrarle otro precio (a mano)"}</summary>
                          <div className="mt-2 flex flex-col gap-3">
                            <p className="text-texto-suave">Solo para este pedido. El precio normal se calcula solo con lo que cuesta y la ganancia.</p>
                            <FormularioAccion accion={precioManualAccion} boton="Guardar este precio" variante="secundario">
                              <input type="hidden" name="itemId" value={l.id} />
                              <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
                                <CampoNumero etiqueta={`Precio por ${UNIDADES_CORTAS[l.unidadBase]}`} name="precio" required />
                                <Campo etiqueta="¿Por qué?" name="motivo" defaultValue={l.precio?.motivoManual ?? ""} placeholder="Ej. precio acordado por teléfono" />
                              </div>
                            </FormularioAccion>
                            {l.precio?.manual && (
                              <FormularioAccion accion={precioManualAccion} boton="Volver al precio calculado" variante="secundario">
                                <input type="hidden" name="itemId" value={l.id} />
                                <input type="hidden" name="quitar" value="true" />
                              </FormularioAccion>
                            )}
                          </div>
                        </details>
                      )}
                    </div>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
        {alertas.length > 0 && <p className="font-semibold text-error">Hay precios para revisar: {alertas.map((a) => ALERTAS_PRECIO[a]).join(" · ")}.</p>}
      </div>

      {(p.editable || puedeDuplicar || puedeCancelar) && (
        <details className={plegado}>
          <summary className={`${titular} text-lg`}>⚙️ Más opciones: datos del pedido, duplicarlo, cancelarlo</summary>
          <div className="mt-3 flex flex-col gap-3">
            {p.editable && cliente && (
              <details className={plegado}>
                <summary className={titular}>🗒️ Datos del pedido (día, dónde se entrega, notas)</summary>
                <FormularioAccion accion={datosPedidoAccion} boton="Guardar datos" variante="secundario" className="mt-3 flex flex-col gap-4">
                  <input type="hidden" name="pedidoId" value={p.id} />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Campo etiqueta="Para el día" name="fecha" type="date" defaultValue={p.fecha} readOnly={p.estado === "EN_COMPRA"} />
                    <Selector etiqueta="Dónde se entrega" name="puntoEntregaId" opciones={puntos.map((x) => ({ valor: x.id, etiqueta: `${x.nombre} · ${x.direccion}` }))} defaultValue={p.puntoEntregaId} />
                    <Selector etiqueta="Cómo llegó" name="canal" opciones={opciones(CANALES)} vacia="—" defaultValue={p.canal ?? ""} />
                    <Campo etiqueta="Orden de compra del cliente" name="referenciaCliente" defaultValue={p.referenciaCliente ?? ""} />
                  </div>
                  <AreaTexto etiqueta="Notas para preparar y entregar" name="observaciones" defaultValue={p.observaciones ?? ""} />
                  <AreaTexto etiqueta="Notas internas (no se imprimen)" name="observacionesInternas" defaultValue={p.observacionesInternas ?? ""} />
                </FormularioAccion>
              </details>
            )}
            {p.editable && p.totalEstimado !== null && (
              <details className={plegado}>
                <summary className={titular}>🔄 Volver a calcular los precios</summary>
                <p className="mt-2 text-texto-suave">Los precios se actualizan solos cuando cambia un costo o una ganancia. Esto los recalcula ahora, por si quedó alguno viejo.</p>
                <FormularioAccion accion={recalcularAccion} boton="Recalcular precios" variante="secundario" className="mt-2">
                  <input type="hidden" name="pedidoId" value={p.id} />
                </FormularioAccion>
              </details>
            )}
            {puedeDuplicar && (
              <details className={plegado}>
                <summary className={titular}>📋 Duplicarlo para otro día</summary>
                <FormularioAccion accion={duplicarPedidoAccion} boton="Duplicar" variante="secundario" className="mt-3 flex flex-wrap items-end gap-3">
                  <input type="hidden" name="pedidoId" value={p.id} />
                  <Campo etiqueta="Para el día" name="fecha" type="date" defaultValue={sumarDias(p.fecha, 7)} />
                </FormularioAccion>
              </details>
            )}
            {puedeCancelar && (
              <details className={plegado}>
                <summary className={`${titular} text-error`}>✕ Cancelar el pedido</summary>
                <FormularioAccion accion={cancelarPedidoAccion} boton="Cancelar pedido" variante="peligro" className="mt-3 flex flex-col gap-3" confirmar="¿Cancelar este pedido?">
                  <input type="hidden" name="pedidoId" value={p.id} />
                  {p.estado !== "BORRADOR" && <Campo etiqueta="¿Por qué?" name="motivo" placeholder="Ej. el cliente suspendió la entrega" />}
                </FormularioAccion>
              </details>
            )}
          </div>
        </details>
      )}
    </section>
  );
}
