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
import { ALERTAS_PRECIO, CANALES, ESTADOS_PEDIDO, ORIGENES_VENTA, UNIDADES_CORTAS, fechaConDia, opciones } from "@/ui/etiquetas";
import { FormularioAccion } from "@/ui/formulario-accion";
import { AreaTexto, Aviso, Campo, CampoNumero, Encabezado, Selector, Tabla, Tarjeta, clasesBoton } from "@/ui/formularios";

import {
  cambiarLineaAccion,
  cancelarPedidoAccion,
  datosPedidoAccion,
  duplicarPedidoAccion,
  precioManualAccion,
  quitarLineaAccion,
  recalcularAccion,
} from "../acciones";

export const metadata: Metadata = { title: "Pedido · Sistema Juan" };

function Cantidad({ l }: { l: LineaDePedido }) {
  const base = formatearCantidad(l.cantidadBase, l.unidadBase as UnidadMedida);
  if (!l.presentacion) return <>{base}</>;
  return (
    <>
      {formatearNumero(l.cantidad, { decimales: 3, recortarCeros: true })} × {l.presentacion}
      <span className="block text-sm text-texto-suave">{base}</span>
    </>
  );
}

function Precio({ l }: { l: LineaDePedido }) {
  const p = l.precio;
  if (!p) return null;
  if (!p.precio) return <span className="text-error">Sin precio</span>;
  const unidad = UNIDADES_CORTAS[l.unidadBase];
  return (
    <>
      {l.presentacion ? `${formatearMoneda(dec(p.precio).times(l.factor))} c/u` : `${formatearMoneda(p.precio)}/${unidad}`}
      <span className="block text-sm text-texto-suave">
        {p.origen ? ORIGENES_VENTA[p.origen] : ""}
        {p.recargo && ` ${formatearNumero(p.recargo, { decimales: 1, recortarCeros: true })} %`}
      </span>
    </>
  );
}

/** P-41 / P-42: carga y detalle de un pedido. */
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

  return (
    <section className="flex max-w-4xl flex-col gap-6">
      <Encabezado
        titulo={`${p.numero} · ${p.cliente}`}
        volver={{ ruta: `/pedidos?fecha=${p.fecha}`, texto: "Pedidos del día" }}
        descripcion={
          <span>
            Entrega del {fechaConDia(p.fecha)} · {p.puntoEntrega} ({p.direccion}){p.canal && ` · por ${CANALES[p.canal]}`}
            {p.referenciaCliente && ` · OC ${p.referenciaCliente}`}
          </span>
        }
      >
        <span className={`rounded-full border px-3 py-1 font-semibold ${p.estado === "CANCELADO" ? "border-error text-error" : "border-marca"}`}>
          {ESTADOS_PEDIDO[p.estado]}
        </span>
        {p.editable && (
          <Link href={`/pedidos/${p.id}/cambiar`} className={clasesBoton("principal")}>
            ✏️ {p.lineas.some((l) => !l.cancelado) ? "Cambiar productos" : "Agregar productos"}
          </Link>
        )}
        <Link href={`/inicio?fecha=${p.fecha}&pedido=${p.id}`} className={clasesBoton("secundario")}>
          Ver en el tablero
        </Link>
      </Encabezado>

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
      {p.requiereOrdenCompra && !p.referenciaCliente && p.estado === "BORRADOR" && <Aviso>Este cliente trabaja con orden de compra: cargá el número en Datos del pedido.</Aviso>}

      <Tarjeta titulo="Productos">
        {p.lineas.length === 0 ? (
          <p className="text-texto-suave">
            Todavía no tiene productos.{" "}
            {p.editable && (
              <Link href={`/pedidos/${p.id}/cambiar`} className="font-semibold underline underline-offset-2">
                Agregalos tocando los recuadros
              </Link>
            )}
          </p>
        ) : (
          <Tabla>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Cantidad</th>
                {p.totalEstimado !== null && <th>Precio estimado</th>}
                {p.totalEstimado !== null && <th className="text-right">Subtotal</th>}
                {p.editable && <th></th>}
              </tr>
            </thead>
            <tbody>
              {p.lineas.map((l) => (
                <tr key={l.id} className={l.cancelado ? "opacity-60" : ""}>
                  <td>
                    <span className={`font-medium ${l.cancelado ? "line-through" : ""}`}>{l.producto}</span>
                    {l.observaciones && <span className="block text-sm text-texto-suave">“{l.observaciones}”</span>}
                    {l.cancelado && <span className="block text-sm text-error">Cancelada: {l.motivoCancelacion}</span>}
                    {l.precio?.alertas.map((a) => (
                      <span key={a} className="block text-sm text-error">
                        ⚠ {ALERTAS_PRECIO[a]}
                      </span>
                    ))}
                  </td>
                  <td className="whitespace-nowrap">
                    <Cantidad l={l} />
                  </td>
                  {p.totalEstimado !== null && (
                    <td className="whitespace-nowrap">
                      <Precio l={l} />
                    </td>
                  )}
                  {p.totalEstimado !== null && <td className="text-right whitespace-nowrap">{l.precio?.subtotal ? formatearMoneda(l.precio.subtotal) : "—"}</td>}
                  {p.editable && (
                    <td>
                      {!l.cancelado && (
                        <details>
                          <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">Cambiar</summary>
                          <div className="flex min-w-64 flex-col gap-3 py-2">
                            <FormularioAccion accion={cambiarLineaAccion} boton="Guardar" variante="secundario">
                              <input type="hidden" name="itemId" value={l.id} />
                              <CampoNumero
                                etiqueta={l.presentacion ? `Cantidad (${l.presentacion})` : `Cantidad (${UNIDADES_CORTAS[l.unidadBase]})`}
                                name="cantidad"
                                defaultValue={formatearNumero(l.cantidad, { decimales: 3, recortarCeros: true })}
                              />
                              <Campo etiqueta="Nota para preparar" name="observaciones" defaultValue={l.observaciones ?? ""} />
                            </FormularioAccion>
                            {p.estado === "BORRADOR" ? (
                              <FormularioAccion accion={quitarLineaAccion} boton="Quitar del pedido" variante="peligro">
                                <input type="hidden" name="itemId" value={l.id} />
                              </FormularioAccion>
                            ) : (
                              <FormularioAccion accion={quitarLineaAccion} boton="Cancelar esta línea" variante="peligro">
                                <input type="hidden" name="itemId" value={l.id} />
                                <Campo etiqueta="Por qué" name="motivo" placeholder="Ej. el cliente ya no lo necesita" />
                              </FormularioAccion>
                            )}
                            {puedeOverride && (
                              <FormularioAccion accion={precioManualAccion} boton={l.precio?.manual ? "Cambiar precio a mano" : "Poner precio a mano"} variante="secundario">
                                <input type="hidden" name="itemId" value={l.id} />
                                <CampoNumero etiqueta={`Precio por ${UNIDADES_CORTAS[l.unidadBase]}`} name="precio" />
                                <Campo etiqueta="Por qué" name="motivo" defaultValue={l.precio?.motivoManual ?? ""} />
                              </FormularioAccion>
                            )}
                            {puedeOverride && l.precio?.manual && (
                              <FormularioAccion accion={precioManualAccion} boton="Volver al precio calculado" variante="secundario">
                                <input type="hidden" name="itemId" value={l.id} />
                                <input type="hidden" name="quitar" value="true" />
                              </FormularioAccion>
                            )}
                          </div>
                        </details>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
        {p.totalEstimado !== null && vivas.length > 0 && (
          <p className="text-right text-lg">
            Total estimado <b>{formatearMoneda(p.totalEstimado)}</b>
            <span className="block text-sm text-texto-suave">Se ajusta con el costo real de la compra.</span>
          </p>
        )}
        {alertas.length > 0 && <p className="text-sm text-error">Hay precios para revisar: {alertas.map((a) => ALERTAS_PRECIO[a]).join(" · ")}.</p>}

        {p.editable && (
          <Link href={`/pedidos/${p.id}/cambiar`} className={`${clasesBoton("secundario")} self-start`}>
            ＋ Agregar o cambiar productos
          </Link>
        )}
      </Tarjeta>

      {(p.estado === "BORRADOR" || p.editable) && (
        <div className="flex flex-wrap gap-2">
          {p.editable && p.totalEstimado !== null && (
            <FormularioAccion accion={recalcularAccion} boton="Recalcular precios" variante="secundario">
              <input type="hidden" name="pedidoId" value={p.id} />
            </FormularioAccion>
          )}
        </div>
      )}

      {p.editable && cliente && (
        <details className="rounded-lg border border-borde bg-superficie p-4">
          <summary className="cursor-pointer text-lg font-semibold">Datos del pedido</summary>
          <FormularioAccion accion={datosPedidoAccion} boton="Guardar datos" variante="secundario" className="mt-4 flex flex-col gap-4">
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

      <div className="flex flex-col gap-3">
        {sesion.permisos.includes("pedidos.crear") && (
          <details className="rounded-lg border border-borde bg-superficie p-4">
            <summary className="cursor-pointer font-semibold">Duplicar para otro día</summary>
            <FormularioAccion accion={duplicarPedidoAccion} boton="Duplicar" variante="secundario" className="mt-3 flex flex-wrap items-end gap-3">
              <input type="hidden" name="pedidoId" value={p.id} />
              <Campo etiqueta="Para el día" name="fecha" type="date" defaultValue={sumarDias(p.fecha, 7)} />
            </FormularioAccion>
          </details>
        )}
        {["BORRADOR", "CONFIRMADO", "EN_COMPRA"].includes(p.estado) && sesion.permisos.includes("pedidos.cancelar") && (
          <details className="rounded-lg border border-borde bg-superficie p-4">
            <summary className="cursor-pointer font-semibold text-error">Cancelar el pedido</summary>
            <FormularioAccion accion={cancelarPedidoAccion} boton="Cancelar pedido" variante="peligro" className="mt-3 flex flex-col gap-3" confirmar="¿Cancelar este pedido?">
              <input type="hidden" name="pedidoId" value={p.id} />
              {p.estado !== "BORRADOR" && <Campo etiqueta="Por qué" name="motivo" placeholder="Ej. el cliente suspendió la entrega" />}
            </FormularioAccion>
          </details>
        )}
      </div>
    </section>
  );
}
