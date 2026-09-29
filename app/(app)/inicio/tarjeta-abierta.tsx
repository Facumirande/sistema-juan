import Link from "next/link";
import type { ReactNode } from "react";

import { tiempoRelativo } from "@/dominio/colaboracion/tiempo";
import { formatearMoneda } from "@/dominio/dinero/formato";
import { enlaceWaze, enlacesGoogleMaps } from "@/dominio/entregas/navegacion";
import { COLUMNAS, columnaDePedido, textoPlazo } from "@/dominio/pedidos/tablero";
import type { EntradaActividad } from "@/modulos/colaboracion/actividad";
import type { NotaVisible } from "@/modulos/colaboracion/notas";
import type { PersonaVisible } from "@/modulos/colaboracion/personas";
import type { DetallePedido } from "@/modulos/pedidos/pedidos";
import type { avanceDeTarjeta } from "@/modulos/pedidos/tablero";
import type { Permiso } from "@/seguridad/catalogo-permisos";
import { Avatar } from "@/ui/avatar";
import { BotonAccion } from "@/ui/boton-accion";
import { ESTADOS_PEDIDO, fechaConDia } from "@/ui/etiquetas";
import { FONDO_ETIQUETA, etiquetasDePedido } from "@/ui/etiquetas-tablero";
import { FormularioAccion } from "@/ui/formulario-accion";

import { HiloDeNotas } from "../actividad/notas";
import {
  armarListaConElegidosAccion,
  asignarElegidosAccion,
  confirmarElegidosAccion,
  plazoAccion,
  prioridadElegidosAccion,
  sacarDeListaAccion,
} from "./acciones";

// La tarjeta abierta (como en Trello): etiquetas, miembro, plazo, lo que pidió (con lo ya comprado
// o preparado tildado), notas entre las personas e historial; al costado, lo que se puede hacer.

type Avance = Awaited<ReturnType<typeof avanceDeTarjeta>>;

const PLAZO: Record<Avance["estadoPlazo"], string> = {
  listo: "bg-[var(--listo-fondo)] text-[var(--listo-texto)]",
  vencido: "bg-[var(--vence-fondo)] text-[var(--vence-texto)]",
  pronto: "bg-[var(--pronto-fondo)] text-[var(--pronto-texto)]",
  a_tiempo: "bg-black/10 dark:bg-white/10",
};
const EN_PALABRAS_PLAZO: Record<Avance["estadoPlazo"], string> = { listo: "entregado", vencido: "vencido", pronto: "por vencer", a_tiempo: "a tiempo" };

function Seccion({ icono, titulo, children }: { icono: string; titulo: string; children: ReactNode }) {
  return (
    <section className="flex gap-3">
      <span aria-hidden className="w-6 shrink-0 pt-0.5 text-center text-lg">
        {icono}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h3 className="font-semibold">{titulo}</h3>
        {children}
      </div>
    </section>
  );
}

const botonLateral = "flex min-h-9 w-full items-center gap-2 rounded-md bg-black/5 px-3 text-left text-sm font-medium hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/15";

export function TarjetaAbierta({
  pedido: p,
  avance,
  notas,
  historial,
  yo,
  zonaHoraria,
  puede,
}: {
  pedido: DetallePedido;
  avance: Avance;
  notas: { notas: NotaVisible[]; personas: PersonaVisible[] };
  historial: EntradaActividad[];
  yo: string;
  zonaHoraria: string;
  puede: (permiso: Permiso) => boolean;
}) {
  const ahora = new Date();
  const columna = COLUMNAS.find((c) => c.clave === columnaDePedido(p.estado));
  const etiquetas = etiquetasDePedido({ tipoCliente: p.tipoCliente, prioridad: p.prioridad, esTardio: p.esTardio });
  const plazo = textoPlazo(p.entregaDesde, p.entregaHasta);
  const abierto = p.estado !== "CANCELADO" && p.estado !== "ENTREGADO";
  const editable = abierto && puede("pedidos.editar");
  const hechos = avance.lineas.filter((l) => l.hecha).length;
  const destino = { coordenada: p.coordenada, direccion: p.direccion, localidad: p.localidad };

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <header className="flex gap-3 pr-10">
        <span aria-hidden className="w-6 shrink-0 pt-1 text-center text-xl">
          🗂
        </span>
        <div className="min-w-0">
          <h2 className="text-xl font-semibold">{p.cliente}</h2>
          <p className="text-sm text-tarjeta-suave">
            en la columna <b>{columna?.titulo ?? ESTADOS_PEDIDO[p.estado]}</b> · {p.numero} · entrega del {fechaConDia(p.fecha)}
          </p>
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-[1fr_190px]">
        <div className="flex min-w-0 flex-col gap-6">
          <div className="flex flex-wrap gap-x-6 gap-y-3 pl-9">
            <div>
              <p className="mb-1 text-xs font-semibold text-tarjeta-suave">Se encarga</p>
              {avance.responsable ? (
                <span className="flex items-center gap-2">
                  <Avatar persona={avance.responsable} /> <span className="text-sm">{avance.responsable.id === yo ? "Vos" : avance.responsable.nombre}</span>
                </span>
              ) : (
                <span className="text-sm text-tarjeta-suave">Nadie</span>
              )}
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold text-tarjeta-suave">Etiquetas</p>
              <div className="flex flex-wrap gap-1">
                {etiquetas.map((e) => (
                  <span key={e.texto} className={`rounded px-2 py-1 text-xs font-semibold text-etiqueta-texto ${FONDO_ETIQUETA[e.color]}`}>
                    {e.texto}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold text-tarjeta-suave">Plazo</p>
              {plazo ? (
                <span className={`inline-flex items-center gap-1 rounded px-2 py-1 text-sm font-medium ${PLAZO[avance.estadoPlazo]}`}>
                  ⏰ {plazo} · {EN_PALABRAS_PLAZO[avance.estadoPlazo]}
                </span>
              ) : (
                <span className="text-sm text-tarjeta-suave">Sin plazo{p.horarioLugar && ` (recibe ${p.horarioLugar})`}</span>
              )}
            </div>
          </div>

          <Seccion icono="📍" titulo="Dónde se entrega">
            <p className="text-sm">
              {p.puntoEntrega} · {p.direccion}
              {p.localidad && `, ${p.localidad}`}
              {p.horarioLugar && <span className="block text-tarjeta-suave">Recibe {p.horarioLugar}</span>}
            </p>
            <div className="flex flex-wrap gap-2">
              <a href={enlacesGoogleMaps([destino])[0]} target="_blank" rel="noreferrer" className="rounded-md bg-black/5 px-3 py-1.5 text-sm font-medium hover:bg-black/10 dark:bg-white/10">
                🧭 Cómo llegar (Google Maps)
              </a>
              <a href={enlaceWaze(destino)} target="_blank" rel="noreferrer" className="rounded-md bg-black/5 px-3 py-1.5 text-sm font-medium hover:bg-black/10 dark:bg-white/10">
                Waze
              </a>
            </div>
          </Seccion>

          {(p.observaciones || p.observacionesInternas) && (
            <Seccion icono="☰" titulo="Descripción">
              {p.observaciones && <p className="text-sm whitespace-pre-line">Del cliente: {p.observaciones}</p>}
              {p.observacionesInternas && <p className="text-sm whitespace-pre-line text-tarjeta-suave">Internas: {p.observacionesInternas}</p>}
            </Seccion>
          )}

          <Seccion icono="☑" titulo={avance.que ? `Productos · ${hechos} de ${avance.lineas.length} ${avance.que === "comprado" ? "comprados" : "preparados"}` : "Productos"}>
            {avance.que && avance.lineas.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-tarjeta-suave">
                <span className="w-9 tabular-nums">{Math.round((hechos / avance.lineas.length) * 100)} %</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                  <div className={`h-2 rounded-full ${hechos === avance.lineas.length ? "bg-[var(--listo-fondo)]" : "bg-[var(--etiqueta-azul)]"}`} style={{ width: `${(hechos / avance.lineas.length) * 100}%` }} />
                </div>
              </div>
            )}
            {avance.lineas.length === 0 ? (
              <p className="text-sm text-tarjeta-suave">Todavía no tiene productos.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {avance.lineas.map((l) => (
                  <li key={l.id} className="flex items-baseline gap-2 text-sm">
                    <span aria-hidden className={l.hecha ? "text-[var(--listo-fondo)]" : "text-tarjeta-suave"}>
                      {l.hecha ? "☑" : "☐"}
                    </span>
                    <span className={`flex-1 ${l.hecha && avance.que ? "text-tarjeta-suave line-through" : ""}`}>{l.producto}</span>
                    <span className="text-tarjeta-suave tabular-nums">{l.cantidad}</span>
                    <span className="sr-only">{l.hecha ? "hecho" : "pendiente"}</span>
                  </li>
                ))}
              </ul>
            )}
            {p.totalEstimado !== null && avance.lineas.length > 0 && <p className="text-sm text-tarjeta-suave">Total estimado {formatearMoneda(p.totalEstimado)}</p>}
          </Seccion>

          <Seccion icono="💬" titulo="Notas">
            <HiloDeNotas entidadTipo="PEDIDO" entidadId={p.id} notas={notas.notas} personas={notas.personas} yo={yo} zonaHoraria={zonaHoraria} />
          </Seccion>

          <Seccion icono="🕘" titulo="Historial">
            <ul className="flex flex-col gap-2">
              {historial.map((h) => (
                <li key={h.id} className="flex items-start gap-2 text-sm">
                  <Avatar persona={h.persona} tamano="chico" />
                  <span>
                    <b>{h.persona.nombre.split(" ")[0]}</b> {h.resumen} <span className="text-xs text-tarjeta-suave">· {tiempoRelativo(h.en, ahora, zonaHoraria)}</span>
                  </span>
                </li>
              ))}
              {historial.length === 0 && <li className="text-sm text-tarjeta-suave">Sin movimientos todavía.</li>}
            </ul>
          </Seccion>
        </div>

        <aside className="flex flex-col gap-4">
          {editable && (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-semibold text-tarjeta-suave">Prioridad</p>
              {(["ALTA", "NORMAL", "BAJA"] as const).map((pr) => (
                <BotonAccion
                  key={pr}
                  accion={prioridadElegidosAccion}
                  datos={{ pedido: p.id, prioridad: pr }}
                  className={`${botonLateral} ${p.prioridad === pr ? "ring-2 ring-[var(--etiqueta-azul)]" : ""}`}
                >
                  {pr === "ALTA" ? "🔴 Urgente" : pr === "NORMAL" ? "⚪ Normal" : "🔵 Sin apuro"}
                </BotonAccion>
              ))}
            </div>
          )}
          {editable && (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-semibold text-tarjeta-suave">Se encarga</p>
              {avance.personas.map((persona) => (
                <BotonAccion
                  key={persona.id}
                  accion={asignarElegidosAccion}
                  datos={{ pedido: p.id, usuarioId: persona.id }}
                  className={`${botonLateral} ${avance.responsable?.id === persona.id ? "ring-2 ring-[var(--etiqueta-azul)]" : ""}`}
                >
                  <Avatar persona={persona} tamano="chico" /> {persona.id === yo ? "Yo" : persona.nombre.split(" ")[0]}
                </BotonAccion>
              ))}
            </div>
          )}
          {editable && (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-semibold text-tarjeta-suave">Plazo de entrega</p>
              <FormularioAccion accion={plazoAccion} boton="Guardar plazo" variante="secundario" className="flex flex-col gap-2">
                <input type="hidden" name="pedidoId" value={p.id} />
                <label className="flex items-center justify-between gap-2 text-sm">
                  Desde
                  <input type="time" name="desde" defaultValue={p.entregaDesde ?? ""} className="h-9 rounded-md border border-borde bg-tarjeta px-2" />
                </label>
                <label className="flex items-center justify-between gap-2 text-sm">
                  Antes de
                  <input type="time" name="hasta" defaultValue={p.entregaHasta ?? ""} className="h-9 rounded-md border border-borde bg-tarjeta px-2" />
                </label>
              </FormularioAccion>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold text-tarjeta-suave">Acciones</p>
            {p.estado === "BORRADOR" && puede("pedidos.confirmar") && (
              <BotonAccion accion={confirmarElegidosAccion} datos={{ pedido: p.id }} className={botonLateral}>
                ✓ Confirmar
              </BotonAccion>
            )}
            {(p.estado === "BORRADOR" || p.estado === "CONFIRMADO") && puede("lista_compra.generar") && (
              <BotonAccion accion={armarListaConElegidosAccion} datos={{ pedido: p.id }} className={botonLateral}>
                🛒 Agregar a la lista de compra
              </BotonAccion>
            )}
            {p.estado === "EN_COMPRA" && puede("lista_compra.generar") && (
              <BotonAccion accion={sacarDeListaAccion} datos={{ pedido: p.id }} className={botonLateral} confirmar="¿Sacar este pedido de la lista de compra? Lo ya comprado queda.">
                ↩ Sacar de la lista
              </BotonAccion>
            )}
            <Link href={`/pedidos/${p.id}`} className={botonLateral}>
              ✏️ Abrir el pedido completo
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
