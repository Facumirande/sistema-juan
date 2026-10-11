import type { Metadata } from "next";
import Link from "next/link";

import { obtenerBaseDatos } from "@/db/cliente";
import { tiempoRelativo, tituloDeDia } from "@/dominio/colaboracion/tiempo";
import { hoyEnEmpresa } from "@/dominio/fechas/fechas";
import { listarActividad, type EntradaActividad } from "@/modulos/colaboracion/actividad";
import { recuperarPedidoAccion } from "../inicio/acciones";
import { sesionParaPantalla } from "@/modulos/seguridad/sesion";
import { Avatar } from "@/ui/avatar";
import { BotonAccion } from "@/ui/boton-accion";
import { enlaceDeEntidad } from "@/ui/enlaces";
import { Encabezado } from "@/ui/formularios";
import { parametro } from "@/ui/parametros";

import { marcarTodasLeidasAccion } from "./acciones";

export const metadata: Metadata = { title: "Actividad y notas · Sistema Repartos" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** P-94 Actividad y notas: qué hizo cada persona y las notas que se dejaron, de lo más nuevo a lo más viejo. */
export default async function PaginaActividad({ searchParams }: PageProps<"/actividad">) {
  const sesion = await sesionParaPantalla(null);
  const sp = await searchParams;
  const soloNotas = parametro(sp.ver) === "notas";
  const personaId = parametro(sp.persona);
  const antesTexto = parametro(sp.antes);
  const antes = antesTexto && !Number.isNaN(Date.parse(antesTexto)) ? new Date(antesTexto) : null;
  const { entradas, hayMas, personas } = await listarActividad(obtenerBaseDatos(), sesion.authUserId, {
    usuarioId: personaId && UUID.test(personaId) ? personaId : null,
    soloNotas,
    antesDe: antes,
    limite: 60,
  });
  const ahora = new Date();
  const hoy = hoyEnEmpresa(ahora, sesion.zonaHoraria);
  const porDia = new Map<string, EntradaActividad[]>();
  for (const e of entradas) {
    const dia = hoyEnEmpresa(e.en, sesion.zonaHoraria);
    porDia.set(dia, [...(porDia.get(dia) ?? []), e]);
  }
  const enlace = (cambios: { ver?: string | null; persona?: string | null; antes?: string | null }) => {
    const p = new URLSearchParams();
    const ver = cambios.ver !== undefined ? cambios.ver : soloNotas ? "notas" : null;
    const persona = cambios.persona !== undefined ? cambios.persona : personaId;
    if (ver) p.set("ver", ver);
    if (persona) p.set("persona", persona);
    if (cambios.antes) p.set("antes", cambios.antes);
    return `/actividad${p.size ? `?${p.toString()}` : ""}`;
  };
  const chip = (activo: boolean) => `flex min-h-10 items-center gap-2 rounded-full border px-3 text-sm font-semibold ${activo ? "border-marca bg-marca text-marca-texto" : "border-borde bg-superficie hover:border-marca"}`;

  return (
    <section className="flex max-w-3xl flex-col gap-6">
      <Encabezado titulo="Actividad y notas" descripcion="Lo que hizo cada uno en el sistema, día por día, y las notas que se dejaron. Tocá una línea para ir a lo que nombra.">
        <BotonAccion accion={marcarTodasLeidasAccion} datos={{}} className="min-h-11 rounded-lg border border-borde px-3 font-semibold">
          Marcar todas las notas como leídas
        </BotonAccion>
      </Encabezado>

      <ul className="grid gap-3 sm:grid-cols-2">
        {personas.map((p) => (
          <li key={p.persona.id}>
            <Link href={enlace({ persona: personaId === p.persona.id ? null : p.persona.id })} className={`flex items-center gap-3 rounded-lg border bg-superficie p-3 ${personaId === p.persona.id ? "border-marca" : "border-borde hover:border-marca"}`}>
              <Avatar persona={p.persona} tamano="grande" />
              <span className="min-w-0">
                <span className="block font-semibold">
                  {p.persona.nombre}
                  {p.persona.id === sesion.usuarioId && <span className="font-normal text-texto-suave"> (vos)</span>}
                  {!p.activa && <span className="font-normal text-texto-suave"> · sin acceso</span>}
                </span>
                <span className="block text-sm text-texto-suave">
                  Hoy {p.hoy} · en la semana {p.semana}
                  {p.ultima && ` · lo último ${tiempoRelativo(p.ultima, ahora, sesion.zonaHoraria)}`}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <nav aria-label="Qué mostrar" className="flex flex-wrap gap-2">
        <Link href={enlace({ ver: null })} className={chip(!soloNotas)}>
          Todo
        </Link>
        <Link href={enlace({ ver: "notas" })} className={chip(soloNotas)}>
          💬 Solo notas
        </Link>
        {personaId && (
          <Link href={enlace({ persona: null })} className={chip(false)}>
            × Todas las personas
          </Link>
        )}
      </nav>

      {entradas.length === 0 ? (
        <p className="text-texto-suave">{soloNotas ? "Todavía no hay notas." : "Todavía no hay actividad."}</p>
      ) : (
        [...porDia.entries()].map(([dia, lista]) => (
          <section key={dia} className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold tracking-wide text-texto-suave uppercase">{tituloDeDia(dia, hoy)}</h2>
            <ol className="flex flex-col gap-3 rounded-lg border border-borde bg-superficie p-3">
              {lista.map((e) => (
                <li key={`${e.clase}:${e.id}`} className="flex gap-3">
                  <Avatar persona={e.persona} />
                  <div className="min-w-0 flex-1">
                    <p>
                      <b>{e.persona.nombre}</b>{" "}
                      {e.clase === "ACTIVIDAD" && e.entidad ? (
                        <Link href={enlaceDeEntidad(e.entidad.tipo, e.entidad.id, e.entidad.fecha)} className="underline-offset-2 hover:underline">
                          {e.resumen}
                        </Link>
                      ) : (
                        e.resumen
                      )}
                      {e.clase === "NOTA" && e.entidad && e.entidad.tipo !== "USUARIO" && (
                        <>
                          {" "}
                          en{" "}
                          <Link href={enlaceDeEntidad(e.entidad.tipo, e.entidad.id, e.entidad.fecha)} className="font-medium underline underline-offset-2">
                            {e.entidad.etiqueta}
                          </Link>
                        </>
                      )}
                    </p>
                    {e.texto && <p className="mt-1 rounded-lg bg-fondo px-3 py-2 break-words whitespace-pre-line">{e.texto}</p>}
                    {/* Un pedido eliminado se recupera desde acá (10/10/2026, RN-189). */}
                    {e.clase === "ACTIVIDAD" && (e.accion === "ELIMINAR" || e.accion === "CANCELAR") && e.entidad?.tipo === "PEDIDO" && e.entidad.cancelado && sesion.permisos.includes("pedidos.editar") && (
                      <BotonAccion accion={recuperarPedidoAccion} datos={{ pedido: e.entidad.id }} className="mt-1 min-h-10 rounded-lg border-2 border-marca px-3 font-semibold text-marca hover:bg-marca/10">
                        ↩ Deshacer: recuperar el pedido
                      </BotonAccion>
                    )}
                    <p className="text-xs text-texto-suave">{tiempoRelativo(e.en, ahora, sesion.zonaHoraria)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ))
      )}
      {hayMas && entradas.length > 0 && (
        <Link href={enlace({ antes: entradas.at(-1)!.en.toISOString() })} className="self-start rounded-lg border border-borde px-4 py-2 font-semibold">
          Ver más viejos
        </Link>
      )}
    </section>
  );
}
