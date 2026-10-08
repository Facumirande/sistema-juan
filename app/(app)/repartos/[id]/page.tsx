import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { formatearFechaHora } from "@/dominio/fechas/fechas";
import { entregasSinReparto, obtenerReparto, repartidoresDisponibles } from "@/modulos/entregas/repartos";
import { salidaDeRepartos } from "@/modulos/entregas/viaje";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { cargarFicha, idDeRuta } from "@/ui/accion-servidor";
import { ESTADOS_ENTREGA, ESTADOS_REPARTO, fechaConDia } from "@/ui/etiquetas";
import { FormularioAccion } from "@/ui/formulario-accion";
import { Aviso, Campo, Encabezado, Selector, Tarjeta, clasesBoton } from "@/ui/formularios";
import { FlechaNavegacion } from "@/ui/iconos";

import {
  actualizarRepartoAccion,
  agregarParadaAccion,
  anularRepartoAccion,
  emitirPendientesAccion,
  proponerOrdenAccion,
  regresarAccion,
  salirAccion,
} from "../acciones";

import { Recorrido, type Destino } from "../../viaje/recorrido";

export const metadata: Metadata = { title: "Reparto · Sistema Repartos" };

/** P-76 Reparto: quién lo hace, en qué, y el recorrido (las paradas en orden, con el GPS y el botón para entregar). */
export default async function ArmarReparto({ params }: PageProps<"/repartos/[id]">) {
  const sesion = await sesionParaPantalla(null);
  const id = idDeRuta((await params).id);
  const db = obtenerBaseDatos();
  const [r, salida] = await Promise.all([cargarFicha(obtenerReparto(db, sesion.authUserId, id)), salidaDeRepartos(db, sesion.authUserId)]);
  const puedeOrdenar = (sesion.permisos.includes("repartos.gestionar") || r.esMio) && (r.estado === "PLANIFICADO" || r.estado === "EN_CURSO") && r.jornadaEstado !== "CERRADA";
  const puedeGestionar = sesion.permisos.includes("repartos.gestionar") && r.jornadaEstado !== "CERRADA";
  const planificado = r.estado === "PLANIFICADO";
  const [pendientes, repartidores] = puedeGestionar && planificado ? await Promise.all([entregasSinReparto(db, sesion.authUserId, id), repartidoresDisponibles(db, sesion.authUserId)]) : [[], []];
  const sinDocumentos = r.paradas.filter((p) => !p.documentosAlDia && p.estado !== "ENTREGADA");
  const sinPreparar = r.paradas.filter((p) => ["BORRADOR", "EN_PREPARACION"].includes(p.estado));
  const hora = (d: Date | null) => (d ? formatearFechaHora(d, sesion.zonaHoraria).slice(11) : "");
  const oculto = (nombre: string, valor: string) => <input type="hidden" name={nombre} value={valor} />;
  const destinos: Destino[] = r.paradas.map((p) => ({
    clave: p.id,
    tipo: "ENTREGA",
    id: p.id,
    nombre: p.cliente,
    punto: p.punto,
    direccion: p.direccion,
    localidad: p.localidad,
    horario: p.horario,
    coordenada: p.latitud !== null && p.longitud !== null ? { lat: Number(p.latitud), lng: Number(p.longitud) } : null,
    telefono: p.telefono,
    hecha: p.estado === "ENTREGADA",
    entregar: p.estado === "EN_REPARTO" && sesion.permisos.includes("entregas.confirmar") ? `/repartos/mios/entrega/${p.id}?volver=${encodeURIComponent(`/repartos/${r.id}`)}` : null,
    detalle: [p.bultos !== null && `${p.bultos} bultos`, ESTADOS_ENTREGA[p.estado]].filter(Boolean).join(" · "),
    enlaces: [
      { texto: p.numero, href: `/entregas/${p.id}` },
      ...(p.documentosAlDia && sesion.permisos.includes("documentos.imprimir_entrega") ? [{ texto: "🧾 remito", href: `/entregas/${p.id}/documento/lista-entrega` }] : []),
    ],
    falta: !p.documentosAlDia && p.estado !== "ENTREGADA" ? "sin remito" : null,
    quitar: puedeGestionar && planificado ? "reparto" : null,
  }));

  return (
    <section className="flex max-w-4xl flex-col gap-6">
      <Encabezado
        titulo={r.numero}
        volver={{ ruta: `/viaje?fecha=${r.fecha}`, texto: "Logística" }}
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

      {r.estado !== "ANULADO" && r.estado !== "FINALIZADO" && (puedeGestionar || r.esMio) && (
        <section className={`flex flex-col gap-3 rounded-2xl border-2 p-4 ${planificado ? "border-marca bg-superficie" : "border-[var(--pastel-verde)] bg-[var(--pastel-verde)] text-[var(--pastel-verde-texto)]"}`}>
          <p className="text-lg font-semibold">
            {!planificado
              ? "🚚 En camino: al dejar cada pedido, tocá ✅ Entregar en su parada."
              : r.paradas.length === 0
                ? "Agregá las entregas que lleva este reparto."
                : sinPreparar.length > 0
                  ? `Todavía se están preparando: ${sinPreparar.map((p) => p.cliente).join(", ")}.`
                  : sinDocumentos.length > 0
                    ? "Falta hacer algún remito antes de salir."
                    : "✓ Todo preparado y con su remito: listo para salir."}
          </p>
          <div className="flex flex-wrap gap-2">
            {planificado && sinDocumentos.length > 0 && sinPreparar.length === 0 && sesion.permisos.includes("entregas.emitir_documentos") && (
              <FormularioAccion accion={emitirPendientesAccion} boton="🧾 Hacer los remitos que faltan" variante="secundario" enLinea>
                {oculto("repartoId", r.id)}
              </FormularioAccion>
            )}
            {planificado && r.paradas.length > 0 && (
              <FormularioAccion accion={salirAccion} boton="🚚 Salir: pasan a En camino" confirmar="¿Sale el reparto? Las entregas pasan a estar en camino." enLinea>
                {oculto("repartoId", r.id)}
              </FormularioAccion>
            )}
            {r.estado === "EN_CURSO" && (
              <FormularioAccion accion={regresarAccion} boton="Regresé" variante="secundario" enLinea>
                {oculto("repartoId", r.id)}
              </FormularioAccion>
            )}
          </div>
        </section>
      )}

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

      <div id="recorrido">
        <Tarjeta
          titulo={
            <span className="flex items-center gap-2 text-xl">
              <FlechaNavegacion /> Recorrido ({r.paradas.length === 1 ? "1 parada" : `${r.paradas.length} paradas`})
            </span>
          }
        >
          <Recorrido destinos={destinos} salida={salida} guardar={puedeOrdenar ? { tipo: "reparto", repartoId: r.id } : null} vacio="Todavía no tiene entregas: agregalas abajo." />
          {puedeGestionar && planificado && r.paradas.length > 1 && (
            <FormularioAccion accion={proponerOrdenAccion} boton="Ordenar por horario" variante="secundario">
              {oculto("repartoId", r.id)}
            </FormularioAccion>
          )}
        </Tarjeta>
      </div>

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
