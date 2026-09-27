import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { dec } from "@/dominio/dinero/decimal";
import { formatearCantidad, formatearMoneda, formatearNumero, type UnidadMedida } from "@/dominio/dinero/formato";
import { formatearFechaHora, sumarDias } from "@/dominio/fechas/fechas";
import { obtenerListaCompra, ofertasParaLinea, type LineaDeLista } from "@/modulos/compras/lista-compra";
import { fechasDeTrabajo } from "@/modulos/pedidos/jornadas";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { fechaConDia } from "@/ui/etiquetas";
import { FormularioAccion } from "@/ui/formulario-accion";
import { Aviso, Campo, CampoNumero, Encabezado, Selector, Tarjeta, clasesBoton } from "@/ui/formularios";
import { parametro } from "@/ui/parametros";
import { SemaforoCredito } from "@/ui/semaforo";

import { cambiarCantidadAccion, cambiarProveedorAccion, generarListaAccion, noConseguidoAccion } from "./acciones";

export const metadata: Metadata = { title: "Lista de compra · Sistema Juan" };

const ESTADOS: Readonly<Record<string, { texto: string; clases: string }>> = {
  PENDIENTE: { texto: "Falta comprar", clases: "border-borde" },
  PARCIAL: { texto: "Comprado en parte", clases: "border-amber-500 text-amber-600 dark:text-amber-400" },
  COMPRADO: { texto: "Comprado", clases: "border-marca text-marca" },
  NO_CONSEGUIDO: { texto: "No se consiguió", clases: "border-error text-error" },
};

const ALERTAS: Readonly<Record<string, string>> = {
  SIN_PROVEEDOR: "Ningún proveedor tiene precio cargado",
  CREDITO_INSUFICIENTE: "El proveedor más conveniente no tiene crédito suficiente",
  PRECIO_DESACTUALIZADO: "El precio es viejo: confirmalo en el puesto",
};

const cant = (v: string, unidad: string) => formatearCantidad(v, unidad as UnidadMedida);
const num = (v: string) => formatearNumero(v, { decimales: 3, recortarCeros: true });

function Linea({ l, ofertas, puedeEditar }: { l: LineaDeLista; ofertas: { ofertaId: string; productoId: string; proveedor: string; presentacion: string; precio: string }[]; puedeEditar: boolean }) {
  const estado = ESTADOS[l.estado]!;
  const otras = ofertas.filter((o) => o.productoId === l.productoId);
  return (
    <li className="flex flex-col gap-1 border-t border-borde py-3 first:border-t-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-lg font-semibold">
          {l.producto}
          {l.cantidadPresentaciones && !dec(l.cantidadPresentaciones).isZero() && l.presentacion && (
            <span className="font-normal">
              {" "}
              · {num(l.cantidadPresentaciones)} × {l.presentacion}
            </span>
          )}
        </p>
        <span className={`rounded-full border px-2 py-0.5 text-sm ${estado.clases}`}>{estado.texto}</span>
      </div>
      <p className="text-texto-suave">
        Se necesita {cant(l.necesidadBase, l.unidadBase)}
        {dec(l.compradoBase).gt(0) && ` · comprado ${cant(l.compradoBase, l.unidadBase)}`}
        {dec(l.pendienteBase).gt(0) && dec(l.compradoBase).gt(0) && ` · faltan ${cant(l.pendienteBase, l.unidadBase)}`}
        {dec(l.sobrantePrevistoBase).gt(0) && ` · sobran ${cant(l.sobrantePrevistoBase, l.unidadBase)}`}
        {l.precioSugerido && ` · ${formatearMoneda(l.precioSugerido)} c/u`}
        {l.costoEstimado && ` = ${formatearMoneda(l.costoEstimado)}`}
      </p>
      {l.observaciones && <p className="text-sm">“{l.observaciones}”</p>}
      {l.ajusteManual && <p className="text-sm text-texto-suave">Cantidad a mano: {l.motivoAjuste}</p>}
      {l.motivoNoConseguido && <p className="text-sm text-error">{l.motivoNoConseguido}</p>}
      {l.sinPedido && <p className="text-sm text-texto-suave">Comprado sin pedido: todo es sobrante.</p>}
      {l.necesidadModificada && <p className="text-sm text-error">⚠ Los pedidos cambiaron después de comprar: revisá la cantidad.</p>}
      {l.alertas.map((a) => (
        <p key={a} className="text-sm text-error">
          ⚠ {ALERTAS[a]}
        </p>
      ))}
      {puedeEditar && l.estado !== "COMPRADO" && (
        <details>
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">Cambiar</summary>
          <div className="flex flex-col gap-3 pb-2">
            <FormularioAccion accion={cambiarCantidadAccion} boton="Guardar cantidad" variante="secundario">
              <input type="hidden" name="itemId" value={l.id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <CampoNumero etiqueta={`Cuántos ${l.presentacion ?? "bultos"}`} name="cantidad" defaultValue={l.cantidadPresentaciones ? num(l.cantidadPresentaciones) : ""} />
                <Campo etiqueta="Por qué" name="motivo" placeholder="Ej. uno de más por las dudas" />
              </div>
            </FormularioAccion>
            {otras.length > 1 && (
              <FormularioAccion accion={cambiarProveedorAccion} boton="Cambiar de puesto" variante="secundario">
                <input type="hidden" name="itemId" value={l.id} />
                <Selector
                  etiqueta="Comprarle a"
                  name="ofertaId"
                  opciones={otras.map((o) => ({ valor: o.ofertaId, etiqueta: `${o.proveedor} · ${o.presentacion} · ${formatearMoneda(o.precio)}` }))}
                />
              </FormularioAccion>
            )}
            {l.estado === "NO_CONSEGUIDO" ? (
              <FormularioAccion accion={noConseguidoAccion} boton="Volver a pendiente" variante="secundario">
                <input type="hidden" name="itemId" value={l.id} />
                <input type="hidden" name="quitar" value="true" />
              </FormularioAccion>
            ) : (
              <FormularioAccion accion={noConseguidoAccion} boton="No se consiguió" variante="peligro">
                <input type="hidden" name="itemId" value={l.id} />
                <Campo etiqueta="Por qué" name="motivo" placeholder="Ej. no había en el mercado" />
              </FormularioAccion>
            )}
          </div>
        </details>
      )}
    </li>
  );
}

/** P-50 Lista de compra de un día: qué comprar, cuánto y a qué puesto (04 §5.c). */
export default async function PaginaListaCompra({ searchParams }: PageProps<"/lista-compra">) {
  const sesion = await sesionParaPantalla("lista_compra.ver");
  const db = obtenerBaseDatos();
  const pedida = parametro((await searchParams).fecha);
  const fecha = pedida && /^\d{4}-\d{2}-\d{2}$/.test(pedida) ? pedida : (await fechasDeTrabajo(db, sesion.authUserId)).sugerida;
  const lista = await obtenerListaCompra(db, sesion.authUserId, fecha);
  const productoIds = lista ? lista.plan.flatMap((p) => p.lineas.map((l) => l.productoId)) : [];
  const puedeEditar = sesion.permisos.includes("lista_compra.editar");
  const ofertas = puedeEditar ? await ofertasParaLinea(db, sesion.authUserId, productoIds) : [];
  const puedeGenerar = sesion.permisos.includes("lista_compra.generar");
  const puedeComprar = sesion.permisos.includes("compras.registrar");

  return (
    <section className="flex max-w-4xl flex-col gap-6">
      <Encabezado titulo="Lista de compra" descripcion={`Para la entrega del ${fechaConDia(fecha)}.`}>
        {lista && sesion.permisos.includes("documentos.imprimir_compra") && (
          <Link href={`/lista-compra/imprimir?fecha=${fecha}`} className={clasesBoton("secundario")}>
            Imprimir
          </Link>
        )}
        {lista && (
          <Link href={`/compras?fecha=${fecha}`} className={clasesBoton("secundario")}>
            Compras del día
          </Link>
        )}
      </Encabezado>

      <nav aria-label="Día" className="flex flex-wrap items-center gap-2">
        <Link href={`/lista-compra?fecha=${sumarDias(fecha, -1)}`} className={clasesBoton("secundario")} aria-label="Día anterior">
          ←
        </Link>
        <form method="get" className="flex items-center gap-2">
          <input type="date" name="fecha" defaultValue={fecha} className="h-11 rounded-lg border border-borde bg-superficie px-3" aria-label="Fecha de entrega" />
          <button type="submit" className={clasesBoton("secundario")}>
            Ver
          </button>
        </form>
        <Link href={`/lista-compra?fecha=${sumarDias(fecha, 1)}`} className={clasesBoton("secundario")} aria-label="Día siguiente">
          →
        </Link>
      </nav>

      {!lista ? (
        <Tarjeta>
          <p>Todavía no se armó la lista de este día.</p>
          <p className="text-texto-suave">Junta los pedidos confirmados, calcula cuánto comprar en bultos completos y sugiere a qué puesto comprarle según precio y crédito.</p>
          {puedeGenerar && (
            <FormularioAccion accion={generarListaAccion} boton="Armar la lista de compra">
              <input type="hidden" name="fecha" value={fecha} />
            </FormularioAccion>
          )}
        </Tarjeta>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-texto-suave">
              {lista.numero} · versión {lista.version} · armada {formatearFechaHora(lista.generadaEn, sesion.zonaHoraria)}
              {lista.costoEstimadoTotal && ` · total estimado ${formatearMoneda(lista.costoEstimadoTotal)}`}
            </p>
            {puedeGenerar && (
              <FormularioAccion accion={generarListaAccion} boton={lista.desactualizada ? "Actualizar la lista" : "Volver a armar"} variante={lista.desactualizada ? "principal" : "secundario"}>
                <input type="hidden" name="fecha" value={fecha} />
              </FormularioAccion>
            )}
          </div>
          {lista.desactualizada && <Aviso>Hubo cambios en los pedidos después de armar la lista: actualizala. Lo ya comprado no se pierde.</Aviso>}

          {lista.plan.map((p) => (
            <Tarjeta key={p.proveedorId ?? "sin"}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold">{p.proveedor}</h2>
                  {p.ubicacion && <p className="text-texto-suave">{p.ubicacion}</p>}
                </div>
                {p.credito && <SemaforoCredito semaforo={p.credito.semaforoProyectado} />}
              </div>
              {p.credito && p.credito.disponibleHoy !== null && (
                <p className="text-sm text-texto-suave">
                  Crédito disponible hoy {formatearMoneda(p.credito.disponibleHoy)} · después de esta compra {formatearMoneda(p.credito.disponibleDespues ?? "0")}
                </p>
              )}
              <ul>
                {p.lineas.map((l) => (
                  <Linea key={l.id} l={l} ofertas={ofertas} puedeEditar={puedeEditar} />
                ))}
              </ul>
              <div className="flex flex-wrap items-center justify-between gap-2">
                {p.subtotal && dec(p.subtotal).gt(0) && <p className="font-semibold">Falta comprar ≈ {formatearMoneda(p.subtotal)}</p>}
                {puedeComprar && p.proveedorId && (
                  <Link href={`/compras/nueva?fecha=${fecha}&proveedor=${p.proveedorId}`} className={clasesBoton("principal")}>
                    Registrar compra
                  </Link>
                )}
              </div>
            </Tarjeta>
          ))}
        </>
      )}
    </section>
  );
}
