import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { formatearFechaHora } from "@/dominio/fechas/fechas";
import { entregasSinReparto, obtenerReparto, repartidoresDisponibles } from "@/modulos/entregas/repartos";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { cargarFicha, idDeRuta } from "@/ui/accion-servidor";
import { ESTADOS_ENTREGA, ESTADOS_REPARTO, fechaConDia } from "@/ui/etiquetas";
import { FormularioAccion } from "@/ui/formulario-accion";
import { Aviso, Campo, Encabezado, Selector, Tarjeta, clasesBoton } from "@/ui/formularios";

import {
  actualizarRepartoAccion,
  agregarParadaAccion,
  anularRepartoAccion,
  emitirPendientesAccion,
  moverParadaAccion,
  proponerOrdenAccion,
  quitarParadaAccion,
  regresarAccion,
  salirAccion,
} from "../acciones";

export const metadata: Metadata = { title: "Reparto · Sistema Juan" };

/** P-76 Armar reparto: quién, en qué, qué paradas y en qué orden. */
export default async function ArmarReparto({ params }: PageProps<"/repartos/[id]">) {
  const sesion = await sesionParaPantalla(null);
  const id = idDeRuta((await params).id);
  const db = obtenerBaseDatos();
  const r = await cargarFicha(obtenerReparto(db, sesion.authUserId, id));
  const puedeGestionar = sesion.permisos.includes("repartos.gestionar") && r.jornadaEstado !== "CERRADA";
  const planificado = r.estado === "PLANIFICADO";
  const [pendientes, repartidores] = puedeGestionar && planificado ? await Promise.all([entregasSinReparto(db, sesion.authUserId, id), repartidoresDisponibles(db, sesion.authUserId)]) : [[], []];
  const sinDocumentos = r.paradas.filter((p) => !p.documentosAlDia && p.estado !== "ENTREGADA");
  const sinPreparar = r.paradas.filter((p) => ["BORRADOR", "EN_PREPARACION"].includes(p.estado));
  const hora = (d: Date | null) => (d ? formatearFechaHora(d, sesion.zonaHoraria).slice(11) : "");
  const oculto = (nombre: string, valor: string) => <input type="hidden" name={nombre} value={valor} />;

  return (
    <section className="flex max-w-4xl flex-col gap-6">
      <Encabezado
        titulo={r.numero}
        volver={{ ruta: `/repartos?fecha=${r.fecha}`, texto: "Repartos" }}
        descripcion={[fechaConDia(r.fecha), r.repartidor, r.vehiculo, r.salida ? `salió ${hora(r.salida)}` : r.salidaPrevista && `sale ${hora(r.salidaPrevista)}`, r.regreso && `volvió ${hora(r.regreso)}`]
          .filter(Boolean)
          .join(" · ")}
      >
        <span className="rounded-full border border-borde px-3 py-1 text-sm">{ESTADOS_REPARTO[r.estado]}</span>
        {sesion.permisos.includes("documentos.imprimir_entrega") && r.paradas.length > 0 && (
          <Link href={`/repartos/${r.id}/imprimir`} className={clasesBoton("secundario")}>
            Hoja de ruta
          </Link>
        )}
      </Encabezado>
      {r.estado === "ANULADO" && <Aviso>Anulado: {r.motivoAnulacion}</Aviso>}

      {puedeGestionar && planificado && (
        <Tarjeta titulo="Datos del reparto">
          <FormularioAccion accion={actualizarRepartoAccion} boton="Guardar" variante="secundario">
            {oculto("repartoId", r.id)}
            <div className="grid gap-4 sm:grid-cols-3">
              <Selector etiqueta="Quién lo hace" name="repartidorId" opciones={repartidores.map((u) => ({ valor: u.id, etiqueta: u.nombre }))} vacia="—" defaultValue={r.repartidorId ?? ""} />
              <Campo etiqueta="Vehículo" name="vehiculo" defaultValue={r.vehiculo ?? ""} />
              <Campo etiqueta="Salida prevista" name="salida" type="time" defaultValue={hora(r.salidaPrevista)} />
            </div>
          </FormularioAccion>
        </Tarjeta>
      )}

      <Tarjeta titulo={`Paradas (${r.paradas.length})`}>
        {r.paradas.length === 0 ? (
          <p className="text-texto-suave">Todavía no tiene entregas: agregalas abajo.</p>
        ) : (
          <ol className="flex flex-col">
            {r.paradas.map((p, i) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-borde py-2 first:border-t-0">
                <div>
                  <p className="font-semibold">
                    {i + 1}. {p.cliente} <span className="font-normal text-texto-suave">· {p.punto}</span>
                  </p>
                  <p className="text-sm text-texto-suave">
                    {p.direccion}
                    {p.localidad && `, ${p.localidad}`}
                    {p.horario && ` · recibe ${p.horario}`}
                    {p.bultos !== null && ` · ${p.bultos} bultos`} ·{" "}
                    <Link href={`/entregas/${p.id}`} className="underline-offset-4 hover:underline">
                      {p.numero}
                    </Link>
                    {" · "}
                    {ESTADOS_ENTREGA[p.estado]}
                    {!p.documentosAlDia && p.estado !== "ENTREGADA" && <b className="text-error"> · sin documentos</b>}
                  </p>
                </div>
                {puedeGestionar && planificado && (
                  <div className="flex gap-1">
                    <FormularioAccion accion={moverParadaAccion} boton="↑" variante="secundario" enLinea>
                      {oculto("repartoId", r.id)}
                      {oculto("entregaId", p.id)}
                      {oculto("hacia", "arriba")}
                    </FormularioAccion>
                    <FormularioAccion accion={moverParadaAccion} boton="↓" variante="secundario" enLinea>
                      {oculto("repartoId", r.id)}
                      {oculto("entregaId", p.id)}
                      {oculto("hacia", "abajo")}
                    </FormularioAccion>
                    <FormularioAccion accion={quitarParadaAccion} boton="Quitar" variante="secundario" enLinea>
                      {oculto("repartoId", r.id)}
                      {oculto("entregaId", p.id)}
                    </FormularioAccion>
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
        {puedeGestionar && planificado && r.paradas.length > 1 && (
          <FormularioAccion accion={proponerOrdenAccion} boton="Ordenar por horario" variante="secundario">
            {oculto("repartoId", r.id)}
          </FormularioAccion>
        )}
      </Tarjeta>

      {puedeGestionar && planificado && pendientes.length > 0 && (
        <Tarjeta titulo="Entregas sin reparto">
          <ul className="flex flex-col">
            {pendientes.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-borde py-2 first:border-t-0">
                <span>
                  <b>{e.cliente}</b> · {e.punto}
                  <span className="block text-sm text-texto-suave">
                    {e.numero} · {ESTADOS_ENTREGA[e.estado]}
                    {e.desde && ` · desde ${e.desde}`}
                    {e.localidad && ` · ${e.localidad}`}
                  </span>
                </span>
                <FormularioAccion accion={agregarParadaAccion} boton="Agregar" variante="secundario" enLinea>
                  {oculto("repartoId", r.id)}
                  {oculto("entregaId", e.id)}
                </FormularioAccion>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}

      {r.estado !== "ANULADO" && r.estado !== "FINALIZADO" && (
        <div className="flex flex-col gap-3">
          {sinPreparar.length > 0 && <Aviso>Todavía se están preparando: {sinPreparar.map((p) => p.cliente).join(", ")}.</Aviso>}
          {sinDocumentos.length > 0 && sesion.permisos.includes("entregas.emitir_documentos") && sinPreparar.length === 0 && (
            <FormularioAccion accion={emitirPendientesAccion} boton="Emitir los documentos que faltan" variante="secundario">
              {oculto("repartoId", r.id)}
            </FormularioAccion>
          )}
          {planificado && (puedeGestionar || r.esMio) && (
            <FormularioAccion accion={salirAccion} boton="Salir" confirmar="¿Sale el reparto? Las entregas pasan a estar en camino.">
              {oculto("repartoId", r.id)}
            </FormularioAccion>
          )}
          {r.estado === "EN_CURSO" && (puedeGestionar || r.esMio) && (
            <FormularioAccion accion={regresarAccion} boton="Regresé" variante="secundario">
              {oculto("repartoId", r.id)}
            </FormularioAccion>
          )}
        </div>
      )}

      {puedeGestionar && r.estado !== "ANULADO" && !r.paradas.some((p) => p.estado === "ENTREGADA") && (
        <details className="rounded-lg border border-borde bg-superficie p-4">
          <summary className="cursor-pointer font-semibold text-error">Anular el reparto</summary>
          <FormularioAccion accion={anularRepartoAccion} boton="Anular" variante="peligro" confirmar="¿Anular este reparto? Sus entregas quedan sin reparto.">
            {oculto("repartoId", r.id)}
            <Campo etiqueta="Por qué" name="motivo" />
          </FormularioAccion>
        </details>
      )}
    </section>
  );
}
