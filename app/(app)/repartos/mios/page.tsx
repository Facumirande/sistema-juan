import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { misRepartos, obtenerReparto } from "@/modulos/entregas/repartos";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { ESTADOS_ENTREGA, ESTADOS_REPARTO, fechaConDia } from "@/ui/etiquetas";
import { FormularioAccion } from "@/ui/formulario-accion";
import { Encabezado, clasesBoton } from "@/ui/formularios";

import { regresarAccion, salirAccion } from "../acciones";

export const metadata: Metadata = { title: "Mi reparto · Sistema Juan" };

const mapa = (p: { latitud: string | null; longitud: string | null; direccion: string; localidad: string | null }) =>
  p.latitud && p.longitud
    ? `https://www.google.com/maps/search/?api=1&query=${p.latitud},${p.longitud}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([p.direccion, p.localidad].filter(Boolean).join(", "))}`;

/** P-77 Mi reparto (celular): mis paradas en orden, sin precios (RN-131). */
export default async function MiReparto() {
  const sesion = await sesionParaPantalla("repartos.ver_propios");
  const db = obtenerBaseDatos();
  const lista = (await misRepartos(db, sesion.authUserId)).filter((r) => r.estado !== "ANULADO");
  const repartos = await Promise.all(lista.map((r) => obtenerReparto(db, sesion.authUserId, r.id)));

  return (
    <section className="flex max-w-xl flex-col gap-6">
      <Encabezado titulo="Mi reparto" />
      {repartos.length === 0 && <p className="text-texto-suave">No tenés repartos asignados para hoy ni mañana.</p>}
      {repartos.map((r) => (
        <div key={r.id} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">
              {r.numero} · {fechaConDia(r.fecha)}
            </h2>
            <span className="rounded-full border border-borde px-3 py-1 text-sm">{ESTADOS_REPARTO[r.estado]}</span>
          </div>
          <ol className="flex flex-col gap-2">
            {r.paradas.map((p, i) => (
              <li key={p.id} className={`flex flex-col gap-2 rounded-lg border p-3 ${p.estado === "ENTREGADA" ? "border-marca opacity-70" : "border-borde"}`}>
                <p className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-lg font-semibold">
                    {i + 1}. {p.cliente}
                  </span>
                  <span className="text-sm">
                    {ESTADOS_ENTREGA[p.estado]}
                    {p.conDiferencias && " · con diferencias"}
                  </span>
                </p>
                <p className="text-texto-suave">
                  {p.punto} · {p.direccion}
                  {p.localidad && `, ${p.localidad}`}
                  {p.horario && ` · recibe ${p.horario}`}
                  {p.bultos !== null && ` · ${p.bultos} bultos`}
                </p>
                {p.instrucciones && <p className="text-sm">📝 {p.instrucciones}</p>}
                <div className="flex flex-wrap gap-2">
                  {p.telefono && (
                    <a href={`tel:${p.telefono.replace(/[^\d+]/g, "")}`} className={clasesBoton("secundario")}>
                      Llamar
                    </a>
                  )}
                  <a href={mapa(p)} target="_blank" rel="noreferrer" className={clasesBoton("secundario")}>
                    Mapa
                  </a>
                  {p.estado === "EN_REPARTO" && (
                    <Link href={`/repartos/mios/entrega/${p.id}`} className={clasesBoton("principal")}>
                      Entregar
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-2">
            {sesion.permisos.includes("documentos.imprimir_entrega") && (
              <Link href={`/repartos/${r.id}/imprimir`} className={clasesBoton("secundario")}>
                Hoja de ruta
              </Link>
            )}
            {r.estado === "PLANIFICADO" && (
              <FormularioAccion accion={salirAccion} boton="Salir" confirmar="¿Salís con el reparto?" enLinea>
                <input type="hidden" name="repartoId" value={r.id} />
              </FormularioAccion>
            )}
            {r.estado === "EN_CURSO" && (
              <FormularioAccion accion={regresarAccion} boton="Regresé" variante="secundario" enLinea>
                <input type="hidden" name="repartoId" value={r.id} />
              </FormularioAccion>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}
