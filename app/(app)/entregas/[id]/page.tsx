import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { dec } from "@/dominio/dinero/decimal";
import { formatearCantidad, formatearMoneda, formatearNumero, type UnidadMedida } from "@/dominio/dinero/formato";
import { formatearFechaHora } from "@/dominio/fechas/fechas";
import { obtenerEntrega } from "@/modulos/entregas/entregas";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { cargarFicha, idDeRuta } from "@/ui/accion-servidor";
import { ESTADOS_ENTREGA, ESTADOS_PEDIDO, MOTIVOS_DIFERENCIA, MOTIVOS_FALTANTE, fechaConDia, opciones } from "@/ui/etiquetas";
import { FormularioAccion } from "@/ui/formulario-accion";
import { Aviso, Campo, CampoNumero, Encabezado, Selector, Tabla, Tarjeta, clasesBoton } from "@/ui/formularios";

import { anularEntregaAccion, corregirEntregaAccion, emitirDocumentosAccion } from "../acciones";
import { FormulariosConfirmacion } from "../confirmacion";

export const metadata: Metadata = { title: "Entrega · Sistema Repartos" };

const cant = (v: string | null, u: string) => (v === null ? "—" : formatearCantidad(v, u as UnidadMedida));
const num = (v: string) => formatearNumero(v, { decimales: 3, recortarCeros: true });

/** P-80 Detalle de entrega: líneas, documentos, recepción y acciones según permisos. */
export default async function DetalleEntrega({ params }: PageProps<"/entregas/[id]">) {
  const sesion = await sesionParaPantalla("entregas.ver");
  const e = await cargarFicha(obtenerEntrega(obtenerBaseDatos(), sesion.authUserId, idDeRuta((await params).id)));
  const puede = (p: Parameters<typeof sesion.permisos.includes>[0]) => sesion.permisos.includes(p);
  const abierta = e.jornadaEstado !== "CERRADA" && e.facturacion === "SIN_FACTURAR";
  const verVenta = e.totales !== null;
  const emitible = ["PREPARADA", "EN_REPARTO", "ENTREGADA"].includes(e.estado);

  return (
    <section className="flex max-w-5xl flex-col gap-6">
      <Encabezado
        titulo={`${e.numero}${e.version > 0 ? ` v${e.version}` : ""} · ${e.cliente}`}
        volver={{ ruta: `/entregas?fecha=${e.fecha}`, texto: "Entregas" }}
        descripcion={[e.punto, e.direccion, fechaConDia(e.fecha), e.reparto && `${e.reparto}${e.orden ? `, parada ${e.orden}` : ""}`, e.bultos !== null && `${e.bultos} bultos`].filter(Boolean).join(" · ")}
      >
        <span className="rounded-full border border-borde px-3 py-1 text-sm">{ESTADOS_ENTREGA[e.estado]}</span>
        {["BORRADOR", "EN_PREPARACION", "PREPARADA"].includes(e.estado) && (
          <Link href={`/preparacion/${e.fecha}/entrega/${e.id}`} className={clasesBoton("secundario")}>
            Preparación
          </Link>
        )}
      </Encabezado>
      {e.estado === "ANULADA" && <Aviso>Anulada: {e.motivoAnulacion}</Aviso>}
      {e.conDiferencias && e.estado === "ENTREGADA" && <Aviso>Se entregó con diferencias: los documentos quedaron actualizados con lo entregado.</Aviso>}

      <Tarjeta titulo="Líneas">
        <Tabla>
          <thead>
            <tr>
              <th>Producto</th>
              <th className="text-right">Pedido</th>
              <th className="text-right">Preparado</th>
              <th className="text-right">Entregado</th>
              {verVenta && <th className="text-right">Precio</th>}
              {verVenta && <th className="text-right">Importe</th>}
            </tr>
          </thead>
          <tbody>
            {e.lineas.map((l) => (
              <tr key={l.id}>
                <td>
                  {l.producto}
                  {l.reemplazaA && <span className="block text-sm text-texto-suave">en reemplazo de {l.reemplazaA}</span>}
                  {l.motivoFaltante && <span className="block text-sm text-error">{MOTIVOS_FALTANTE[l.motivoFaltante]}</span>}
                  {l.motivoDiferencia && (
                    <span className="block text-sm text-error">
                      {MOTIVOS_DIFERENCIA[l.motivoDiferencia]}
                      {l.detalleDiferencia && `: ${l.detalleDiferencia}`}
                    </span>
                  )}
                  {l.alertas.includes("MARGEN_NEGATIVO") && <span className="block text-sm text-error">debajo del costo</span>}
                </td>
                <td className="text-right whitespace-nowrap">{l.esSustitucion ? "—" : cant(l.cantidadPedida, l.unidad)}</td>
                <td className="text-right whitespace-nowrap">{cant(l.cantidadPreparada, l.unidad)}</td>
                <td className="text-right whitespace-nowrap">{cant(l.cantidadEntregada, l.unidad)}</td>
                {verVenta && <td className="text-right whitespace-nowrap">{l.precio ? formatearMoneda(l.precio) : "—"}</td>}
                {verVenta && <td className="text-right whitespace-nowrap">{l.importe ? formatearMoneda(l.importe) : "—"}</td>}
              </tr>
            ))}
          </tbody>
        </Tabla>
        {e.totales && e.version > 0 && (
          <p className="text-right text-lg">
            Total <b>{formatearMoneda(e.totales.total)}</b>
            {e.totales.costo && dec(e.totales.total).gt(0) && (
              <span className="block text-sm text-texto-suave">
                costo {formatearMoneda(e.totales.costo)} · margen {formatearNumero(dec(e.totales.total).minus(e.totales.costo).div(e.totales.total).times(100), { decimales: 1 })} %
              </span>
            )}
          </p>
        )}
      </Tarjeta>

      <Tarjeta titulo="Documentos">
        {e.documentos.length === 0 ? (
          <p className="text-texto-suave">Todavía no se emitieron.</p>
        ) : (
          <ul className="flex flex-col">
            {e.documentos
              .filter((d) => d.evento === "EMISION")
              .map((d) => (
                <li key={d.id} className="flex flex-wrap items-baseline justify-between gap-2 border-t border-borde py-2 first:border-t-0">
                  <span>
                    {d.tipo === "DOC_02" ? "Lista de entrega" : "Lista contable"} · versión {d.version}
                    <span className="block text-sm text-texto-suave">
                      {formatearFechaHora(d.emitidoEn, sesion.zonaHoraria)} · {d.estado === "VIGENTE" ? "vigente" : d.estado === "REEMPLAZADO" ? "reemplazada" : "anulada"}
                    </span>
                  </span>
                  {(d.tipo === "DOC_02" ? puede("documentos.imprimir_entrega") : puede("documentos.imprimir_contable")) && (
                    <Link href={`/entregas/${e.id}/documento/${d.tipo === "DOC_02" ? "lista-entrega" : "lista-contable"}?v=${d.version}`} className={clasesBoton("secundario")}>
                      Ver / imprimir
                    </Link>
                  )}
                </li>
              ))}
          </ul>
        )}
        {emitible && abierta && !e.documentosAlDia && puede("entregas.emitir_documentos") && (
          <FormularioAccion accion={emitirDocumentosAccion} boton="Emitir documentos">
            <input type="hidden" name="entregaId" value={e.id} />
          </FormularioAccion>
        )}
      </Tarjeta>

      {e.recibidoPor && (
        <Tarjeta titulo="Recepción">
          <p>
            Recibió {e.recibidoPor}
            {e.recibidoCargo && ` (${e.recibidoCargo})`}
            {e.recibidoEn && ` · ${formatearFechaHora(e.recibidoEn, sesion.zonaHoraria)}`}
            {e.confirmadaPor && ` · confirmó ${e.confirmadaPor}`}
          </p>
          {e.observacionesRecepcion && <p className="text-texto-suave">{e.observacionesRecepcion}</p>}
        </Tarjeta>
      )}

      {e.pedidos.length > 0 && (
        <Tarjeta titulo="Pedidos">
          <ul className="flex flex-wrap gap-3">
            {e.pedidos.map((p) => (
              <li key={p.id}>
                <Link href={`/pedidos/${p.id}`} className="underline-offset-4 hover:underline">
                  {p.numero}
                </Link>{" "}
                <span className="text-sm text-texto-suave">{ESTADOS_PEDIDO[p.estado]}</span>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}

      {abierta && ["PREPARADA", "EN_REPARTO"].includes(e.estado) && puede("entregas.confirmar") && (
        <details className="rounded-lg border border-borde bg-superficie p-4">
          <summary className="cursor-pointer font-semibold">Confirmar desde la oficina</summary>
          <div className="pt-3">
            <FormulariosConfirmacion entregaId={e.id} lineas={e.lineas} volver={`/entregas/${e.id}`} requiereFirma={e.requiereFirma} />
          </div>
        </details>
      )}

      {abierta && e.estado === "ENTREGADA" && puede("entregas.corregir") && (
        <details className="rounded-lg border border-borde bg-superficie p-4">
          <summary className="cursor-pointer font-semibold">Corregir lo entregado</summary>
          <FormularioAccion accion={corregirEntregaAccion} boton="Guardar corrección">
            <input type="hidden" name="entregaId" value={e.id} />
            {e.lineas.map((l) => (
              <div key={l.id} className="grid gap-2 border-t border-borde pt-2 sm:grid-cols-3">
                <CampoNumero etiqueta={`${l.producto} (preparado ${cant(l.cantidadPreparada, l.unidad)})`} name={`ent_${l.id}`} defaultValue={num(l.cantidadEntregada ?? l.cantidadPreparada ?? "0")} />
                <Selector etiqueta="Motivo si es menos" name={`mot_${l.id}`} opciones={opciones(MOTIVOS_DIFERENCIA)} vacia="—" defaultValue={l.motivoDiferencia ?? ""} />
                <Campo etiqueta="Detalle" name={`det_${l.id}`} defaultValue={l.detalleDiferencia ?? ""} />
              </div>
            ))}
            <Campo etiqueta="Por qué se corrige" name="motivo" placeholder="Ej. el cliente avisó que faltó una caja" />
          </FormularioAccion>
        </details>
      )}

      {abierta && e.estado !== "ANULADA" && e.estado !== "EN_REPARTO" && puede("entregas.anular") && (
        <details className="rounded-lg border border-borde bg-superficie p-4">
          <summary className="cursor-pointer font-semibold text-error">Anular la entrega</summary>
          <FormularioAccion accion={anularEntregaAccion} boton="Anular" variante="peligro" confirmar="¿Anular esta entrega? Sus documentos quedan anulados.">
            <input type="hidden" name="entregaId" value={e.id} />
            <Campo etiqueta="Por qué" name="motivo" placeholder="Ej. se cargó al cliente equivocado" />
          </FormularioAccion>
        </details>
      )}
    </section>
  );
}
