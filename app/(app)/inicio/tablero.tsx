"use client";

import Link from "next/link";
import { useMemo, useState, useTransition, type DragEvent } from "react";

import { formatearMoneda } from "@/dominio/dinero/formato";
import { accionAlMover, resumenDeSeleccion, type ClaveColumna } from "@/dominio/pedidos/tablero";
import type { PersonaVisible } from "@/modulos/colaboracion/personas";
import type { ColumnaDelTablero, TarjetaPedido } from "@/modulos/pedidos/tablero";
import { Avatar } from "@/ui/avatar";
import { ESTADO_INICIAL, type EstadoAccion } from "@/ui/estado-accion";
import { FONDO_ETIQUETA, etiquetasDePedido } from "@/ui/etiquetas-tablero";

import { crearPedidoAccion } from "../pedidos/acciones";
import {
  armarListaConElegidosAccion,
  asignarElegidosAccion,
  confirmarElegidosAccion,
  moverTarjetaAccion,
  prioridadElegidosAccion,
  sacarDeListaAccion,
} from "./acciones";

// Tablero de pedidos estilo Trello: una columna por etapa, tarjetas con etiquetas, plazo, notas,
// avance y quién se encarga. Se arrastran entre columnas (confirmar, agregar a la lista o sacar),
// y en "Elegir pedidos" se marcan varias (o todas) para armar la lista de compra de una vez.

type Accion = (estado: EstadoAccion, datos: FormData) => Promise<EstadoAccion>;

interface Props {
  fecha: string;
  columnas: ColumnaDelTablero[];
  cancelados: TarjetaPedido[];
  personas: PersonaVisible[];
  yo: string;
  /** "/inicio?fecha=…": las tarjetas se abren agregando `&pedido=…`. */
  base: string;
  clientes: { id: string; nombre: string }[];
  puede: { crear: boolean; armar: boolean; editar: boolean };
  /** Destino de cada columna para ir a la pantalla de esa etapa. */
  enlaces: Partial<Record<ClaveColumna, { href: string; texto: string }>>;
}

const DESTINO_PERMITIDO = (desde: ClaveColumna | null, hacia: ClaveColumna) => (desde ? accionAlMover(desde, hacia) !== null : false);

const PLAZO: Record<TarjetaPedido["estadoPlazo"], string> = {
  listo: "bg-[var(--listo-fondo)] text-[var(--listo-texto)]",
  vencido: "bg-[var(--vence-fondo)] text-[var(--vence-texto)]",
  pronto: "bg-[var(--pronto-fondo)] text-[var(--pronto-texto)]",
  a_tiempo: "",
};

function Insignias({ t }: { t: TarjetaPedido }) {
  const avanceCompleto = t.avance && t.avance.total > 0 && t.avance.hechos === t.avance.total;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-tarjeta-suave">
      {t.plazo && (
        <span className={`inline-flex items-center gap-1 rounded px-1 py-0.5 ${PLAZO[t.estadoPlazo]}`} title={`Plazo: ${t.plazo}`}>
          <span aria-hidden>⏰</span>
          {t.entregaHasta ? `antes ${t.entregaHasta}` : `desde ${t.entregaDesde}`}
          {t.estadoPlazo === "vencido" && <span className="font-semibold">· vencido</span>}
        </span>
      )}
      {t.notas.total > 0 && (
        <span className={`inline-flex items-center gap-1 ${t.notas.sinLeer ? "font-bold text-tarjeta-texto" : ""}`} title={t.notas.sinLeer ? `${t.notas.sinLeer} sin leer` : "Notas"}>
          <span aria-hidden>💬</span>
          {t.notas.total}
          {t.notas.sinLeer > 0 && <span className="size-2 rounded-full bg-[var(--etiqueta-azul)]" aria-label="sin leer" />}
        </span>
      )}
      {t.avance && t.avance.total > 0 && (
        <span className={`inline-flex items-center gap-1 rounded px-1 py-0.5 ${avanceCompleto ? "bg-[var(--listo-fondo)] text-[var(--listo-texto)]" : ""}`} title={`${t.avance.que === "comprado" ? "Comprado" : "Preparado"}: ${t.avance.hechos} de ${t.avance.total}`}>
          <span aria-hidden>☑</span>
          {t.avance.hechos}/{t.avance.total}
        </span>
      )}
      <span title="Productos">
        <span aria-hidden>🧺</span> {t.lineas}
      </span>
      {t.totalEstimado !== null && t.lineas > 0 && <span className="tabular-nums">{formatearMoneda(t.totalEstimado)}</span>}
      {t.responsable && (
        <span className="ml-auto">
          <Avatar persona={t.responsable} tamano="chico" />
        </span>
      )}
    </div>
  );
}

function Tarjeta({
  t,
  href,
  eligiendo,
  elegida,
  alElegir,
  arrastrable,
  alArrastrar,
}: {
  t: TarjetaPedido;
  href: string;
  eligiendo: boolean;
  elegida: boolean;
  alElegir: () => void;
  arrastrable: boolean;
  alArrastrar: (e: DragEvent<HTMLElement>) => void;
}) {
  const etiquetas = etiquetasDePedido(t);
  const contenido = (
    <>
      {etiquetas.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {etiquetas.map((e) => (
            <span key={e.texto} className={`rounded px-1.5 py-0.5 text-[11px] leading-4 font-semibold text-etiqueta-texto ${FONDO_ETIQUETA[e.color]}`}>
              {e.texto}
            </span>
          ))}
        </div>
      )}
      <p className="leading-snug font-medium text-tarjeta-texto">{t.cliente}</p>
      <p className="truncate text-xs text-tarjeta-suave">
        {t.numero}
        {t.productos.length > 0 && ` · ${t.productos.slice(0, 3).join(", ")}${t.productos.length > 3 ? ` y ${t.productos.length - 3} más` : ""}`}
      </p>
      <Insignias t={t} />
    </>
  );
  const clases = `block w-full rounded-lg bg-tarjeta p-2.5 text-left shadow-tarjeta outline-offset-2 hover:bg-tarjeta-hover focus-visible:outline-2 focus-visible:outline-[var(--etiqueta-azul)] ${elegida ? "outline-2 outline-[var(--etiqueta-azul)]" : ""}`;
  if (eligiendo) {
    return (
      <label className={`${clases} cursor-pointer`}>
        <span className="flex gap-2">
          <input type="checkbox" checked={elegida} onChange={alElegir} className="mt-0.5 size-5 shrink-0" aria-label={`Elegir ${t.numero} de ${t.cliente}`} />
          <span className="min-w-0 flex-1">{contenido}</span>
        </span>
      </label>
    );
  }
  return (
    <Link href={href} scroll={false} draggable={arrastrable} onDragStart={alArrastrar} className={clases}>
      {contenido}
    </Link>
  );
}

function NuevoPedido({ fecha, clientes }: { fecha: string; clientes: { id: string; nombre: string }[] }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, setEstado] = useState<EstadoAccion>(ESTADO_INICIAL);
  const [pendiente, empezar] = useTransition();
  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left font-medium text-tarjeta-suave hover:bg-black/5 dark:hover:bg-white/10">
        <span aria-hidden className="text-xl leading-none">+</span> Agregar un pedido
      </button>
    );
  }
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const datos = new FormData(e.currentTarget);
        empezar(async () => setEstado(await crearPedidoAccion(ESTADO_INICIAL, datos)));
      }}
    >
      <input type="hidden" name="fecha" value={fecha} />
      <input type="hidden" name="canal" value="WHATSAPP" />
      <select name="clienteId" required defaultValue="" autoFocus className="h-11 rounded-lg bg-tarjeta px-2 text-tarjeta-texto shadow-tarjeta">
        <option value="" disabled>
          ¿De qué cliente?
        </option>
        {clientes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </select>
      {estado.mensaje && !estado.ok && (
        <p role="alert" className="text-sm text-error">
          {estado.mensaje}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pendiente} className="min-h-10 rounded-lg bg-[var(--etiqueta-azul)] px-3 font-semibold text-etiqueta-texto disabled:opacity-60">
          {pendiente ? "Un momento…" : "Agregar pedido"}
        </button>
        <button type="button" onClick={() => setAbierto(false)} aria-label="Cancelar" className="min-h-10 rounded-lg px-3 text-xl text-tarjeta-suave hover:bg-black/5">
          ×
        </button>
      </div>
    </form>
  );
}

export function TableroTrello({ fecha, columnas, cancelados, personas, yo, base, clientes, puede, enlaces }: Props) {
  const [eligiendo, setEligiendo] = useState(false);
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const [filtroPersona, setFiltroPersona] = useState<string | null>(null);
  const [soloUrgentes, setSoloUrgentes] = useState(false);
  const [arrastrando, setArrastrando] = useState<{ id: string; desde: ClaveColumna } | null>(null);
  const [sobre, setSobre] = useState<ClaveColumna | null>(null);
  const [mensaje, setMensaje] = useState<EstadoAccion>(ESTADO_INICIAL);
  const [pendiente, empezar] = useTransition();
  const [verCancelados, setVerCancelados] = useState(false);

  const todas = useMemo(() => columnas.flatMap((c) => c.tarjetas), [columnas]);
  const pasaFiltro = (t: TarjetaPedido) => (!filtroPersona || t.responsable?.id === filtroPersona) && (!soloUrgentes || t.prioridad === "ALTA");
  const elegidasTarjetas = todas.filter((t) => elegidas.has(t.id));
  const resumen = resumenDeSeleccion(elegidasTarjetas.map((t) => t.estado));

  const ejecutar = (accion: Accion, datos: Record<string, string | string[]>, despues?: () => void) => {
    const fd = new FormData();
    for (const [clave, valor] of Object.entries(datos)) for (const v of Array.isArray(valor) ? valor : [valor]) fd.append(clave, v);
    empezar(async () => {
      const r = await accion(ESTADO_INICIAL, fd);
      setMensaje(r);
      if (r.ok) despues?.();
    });
  };
  const alternar = (id: string) =>
    setElegidas((previas) => {
      const nuevas = new Set(previas);
      if (nuevas.has(id)) nuevas.delete(id);
      else nuevas.add(id);
      return nuevas;
    });
  const elegirColumna = (col: ColumnaDelTablero) =>
    setElegidas((previas) => {
      const visibles = col.tarjetas.filter(pasaFiltro).map((t) => t.id);
      const todasElegidas = visibles.every((id) => previas.has(id));
      const nuevas = new Set(previas);
      for (const id of visibles) {
        if (todasElegidas) nuevas.delete(id);
        else nuevas.add(id);
      }
      return nuevas;
    });
  const elegirFaltantes = () => {
    setEligiendo(true);
    setElegidas(new Set(todas.filter((t) => (t.estado === "BORRADOR" || t.estado === "CONFIRMADO") && pasaFiltro(t)).map((t) => t.id)));
  };
  const terminar = () => {
    setElegidas(new Set());
    setEligiendo(false);
  };
  const soltar = (hacia: ClaveColumna) => {
    setSobre(null);
    if (!arrastrando || arrastrando.desde === hacia) return;
    if (!DESTINO_PERMITIDO(arrastrando.desde, hacia)) {
      setMensaje({ ok: false, mensaje: "Esa tarjeta no se puede mover ahí: preparación, reparto y entrega avanzan solas." });
      return;
    }
    ejecutar(moverTarjetaAccion, { pedido: arrastrando.id, desde: arrastrando.desde, hacia });
    setArrastrando(null);
  };
  const faltanElegir = todas.filter((t) => t.estado === "BORRADOR" || t.estado === "CONFIRMADO").length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Filtros y selección">
        <span className="text-sm font-medium text-white/90">Filtrar:</span>
        <button
          type="button"
          onClick={() => setFiltroPersona(null)}
          aria-pressed={filtroPersona === null}
          className={`min-h-9 rounded-full px-3 text-sm font-semibold ${filtroPersona === null ? "bg-white text-[#172b4d]" : "bg-white/20 text-white hover:bg-white/30"}`}
        >
          Todos
        </button>
        {personas.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setFiltroPersona(filtroPersona === p.id ? null : p.id)}
            aria-pressed={filtroPersona === p.id}
            title={`Solo los de ${p.nombre}`}
            className={`flex min-h-9 items-center gap-1.5 rounded-full py-0.5 pr-3 pl-0.5 text-sm font-semibold ${filtroPersona === p.id ? "bg-white text-[#172b4d]" : "bg-white/20 text-white hover:bg-white/30"}`}
          >
            <Avatar persona={p} tamano="chico" />
            {p.id === yo ? "Míos" : p.nombre.split(" ")[0]}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setSoloUrgentes(!soloUrgentes)}
          aria-pressed={soloUrgentes}
          className={`min-h-9 rounded-full px-3 text-sm font-semibold ${soloUrgentes ? "bg-white text-[#172b4d]" : "bg-white/20 text-white hover:bg-white/30"}`}
        >
          Urgentes
        </button>
        <span className="flex-1" />
        {puede.armar && faltanElegir > 0 && !eligiendo && (
          <button type="button" onClick={elegirFaltantes} className="min-h-9 rounded-lg bg-white px-3 text-sm font-semibold text-[#172b4d] hover:bg-white/90">
            🛒 Elegir todo lo que falta comprar ({faltanElegir})
          </button>
        )}
        <button
          type="button"
          onClick={() => (eligiendo ? terminar() : setEligiendo(true))}
          aria-pressed={eligiendo}
          className={`min-h-9 rounded-lg px-3 text-sm font-semibold ${eligiendo ? "bg-white text-[#172b4d]" : "bg-white/20 text-white hover:bg-white/30"}`}
        >
          {eligiendo ? "Terminar de elegir" : "☑ Elegir pedidos"}
        </button>
      </div>

      {mensaje.mensaje && (
        <div role={mensaje.ok ? "status" : "alert"} className={`flex items-start justify-between gap-3 rounded-lg px-3 py-2 text-sm font-medium shadow-tarjeta ${mensaje.ok ? "bg-tarjeta text-tarjeta-texto" : "bg-[var(--vence-fondo)] text-[var(--vence-texto)]"}`}>
          <span>{mensaje.mensaje}</span>
          <button type="button" onClick={() => setMensaje(ESTADO_INICIAL)} aria-label="Cerrar el aviso" className="text-lg leading-none">
            ×
          </button>
        </div>
      )}

      <nav aria-label="Ir a una columna" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 md:hidden">
        {columnas.map((col) => (
          <button
            key={col.clave}
            type="button"
            onClick={() => document.getElementById(`lista-${col.clave}`)?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" })}
            className="flex min-h-9 shrink-0 items-center gap-1 rounded-full bg-black/25 px-3 text-sm font-semibold text-white"
          >
            {col.titulo} <span className="rounded-full bg-white/25 px-1.5 text-xs">{col.tarjetas.filter(pasaFiltro).length}</span>
          </button>
        ))}
      </nav>

      <div className="-mx-3 flex snap-x snap-mandatory items-start gap-3 overflow-x-auto px-3 pb-3 md:snap-none" aria-busy={pendiente}>
        {columnas.map((col) => {
          const visibles = col.tarjetas.filter(pasaFiltro);
          const aceptaSoltar = arrastrando !== null && arrastrando.desde !== col.clave && DESTINO_PERMITIDO(arrastrando.desde, col.clave);
          const todasElegidas = visibles.length > 0 && visibles.every((t) => elegidas.has(t.id));
          return (
            <section
              key={col.clave}
              id={`lista-${col.clave}`}
              aria-labelledby={`col-${col.clave}`}
              onDragOver={(e) => {
                if (aceptaSoltar) {
                  e.preventDefault();
                  setSobre(col.clave);
                }
              }}
              onDragLeave={() => setSobre((s) => (s === col.clave ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                soltar(col.clave);
              }}
              className={`flex max-h-[calc(100dvh-220px)] w-[85vw] max-w-[300px] shrink-0 snap-start flex-col rounded-xl bg-lista text-lista-texto shadow-sm sm:w-72 ${sobre === col.clave ? "outline-2 outline-offset-2 outline-white" : ""} ${aceptaSoltar && sobre !== col.clave ? "outline-2 outline-dashed outline-white/70" : ""}`}
            >
              <header className="flex items-start justify-between gap-2 px-3 pt-2.5 pb-1">
                <div className="min-w-0">
                  <h2 id={`col-${col.clave}`} className="font-semibold">
                    {col.titulo} <span className="ml-1 rounded-full bg-black/10 px-2 text-xs font-bold dark:bg-white/15">{visibles.length}</span>
                  </h2>
                  <p className="text-xs text-tarjeta-suave">{col.ayuda}</p>
                </div>
                {eligiendo && col.seleccionable && visibles.length > 0 && (
                  <button type="button" onClick={() => elegirColumna(col)} className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold hover:bg-black/10 dark:hover:bg-white/10">
                    {todasElegidas ? "Ninguno" : "Elegir todos"}
                  </button>
                )}
              </header>
              <ol className="flex min-h-2 flex-col gap-2 overflow-y-auto px-2 py-1">
                {visibles.map((t) => (
                  <li key={t.id}>
                    <Tarjeta
                      t={t}
                      href={`${base}&pedido=${t.id}`}
                      eligiendo={eligiendo && col.seleccionable}
                      elegida={elegidas.has(t.id)}
                      alElegir={() => alternar(t.id)}
                      arrastrable={puede.editar && (col.clave === "por_confirmar" || col.clave === "confirmados" || col.clave === "en_lista")}
                      alArrastrar={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", t.id);
                        setArrastrando({ id: t.id, desde: col.clave });
                      }}
                    />
                  </li>
                ))}
                {visibles.length === 0 && <li className="px-1 py-2 text-sm text-tarjeta-suave">{col.tarjetas.length ? "Nada con este filtro." : "Sin pedidos."}</li>}
              </ol>
              <footer className="px-2 pt-1 pb-2">
                {col.clave === "por_confirmar" && puede.crear ? (
                  <NuevoPedido fecha={fecha} clientes={clientes} />
                ) : (
                  enlaces[col.clave] && (
                    <Link href={enlaces[col.clave]!.href} className="flex min-h-10 items-center rounded-lg px-2 text-sm font-medium text-tarjeta-suave hover:bg-black/5 dark:hover:bg-white/10">
                      {enlaces[col.clave]!.texto} →
                    </Link>
                  )
                )}
              </footer>
            </section>
          );
        })}
        {cancelados.length > 0 && (
          <section className="w-[85vw] max-w-[300px] shrink-0 snap-start rounded-xl bg-black/25 p-2 text-white sm:w-60">
            <button type="button" onClick={() => setVerCancelados(!verCancelados)} className="flex min-h-10 w-full items-center justify-between rounded-lg px-2 font-semibold hover:bg-white/10">
              Cancelados ({cancelados.length}) <span aria-hidden>{verCancelados ? "▾" : "▸"}</span>
            </button>
            {verCancelados && (
              <ul className="mt-1 flex flex-col gap-2 opacity-80">
                {cancelados.map((t) => (
                  <li key={t.id}>
                    <Link href={`${base}&pedido=${t.id}`} scroll={false} className="block rounded-lg bg-tarjeta p-2 text-sm text-tarjeta-texto line-through shadow-tarjeta">
                      {t.cliente} · {t.numero}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      {eligiendo && elegidas.size > 0 && (
        <div className="sticky bottom-3 z-30 mx-auto flex w-full max-w-4xl flex-wrap items-center gap-2 rounded-xl bg-tarjeta p-3 text-tarjeta-texto shadow-lg ring-1 ring-black/10">
          <span className="font-semibold">
            {elegidas.size} {elegidas.size === 1 ? "elegido" : "elegidos"}
          </span>
          <span className="flex-1" />
          {puede.armar && resumen.paraLista > 0 && (
            <button type="button" disabled={pendiente} onClick={() => ejecutar(armarListaConElegidosAccion, { pedido: [...elegidas] }, terminar)} className="min-h-10 rounded-lg bg-marca px-3 font-semibold text-marca-texto disabled:opacity-60">
              🛒 Armar la lista de compra ({resumen.paraLista})
            </button>
          )}
          {resumen.paraConfirmar > 0 && (
            <button type="button" disabled={pendiente} onClick={() => ejecutar(confirmarElegidosAccion, { pedido: [...elegidas] }, terminar)} className="min-h-10 rounded-lg border border-borde px-3 font-semibold disabled:opacity-60">
              ✓ Confirmar ({resumen.paraConfirmar})
            </button>
          )}
          {puede.armar && resumen.paraSacar > 0 && (
            <button type="button" disabled={pendiente} onClick={() => ejecutar(sacarDeListaAccion, { pedido: [...elegidas].filter((id) => todas.find((t) => t.id === id)?.estado === "EN_COMPRA") }, terminar)} className="min-h-10 rounded-lg border border-borde px-3 font-semibold disabled:opacity-60">
              Sacar de la lista ({resumen.paraSacar})
            </button>
          )}
          {puede.editar && (
            <>
              <label className="flex items-center gap-1 text-sm">
                Prioridad
                <select
                  defaultValue=""
                  disabled={pendiente}
                  onChange={(e) => {
                    if (e.target.value) ejecutar(prioridadElegidosAccion, { pedido: [...elegidas], prioridad: e.target.value });
                    e.target.value = "";
                  }}
                  className="h-10 rounded-lg border border-borde bg-tarjeta px-2"
                >
                  <option value="">Elegir…</option>
                  <option value="ALTA">Urgente</option>
                  <option value="NORMAL">Normal</option>
                  <option value="BAJA">Sin apuro</option>
                </select>
              </label>
              <label className="flex items-center gap-1 text-sm">
                Se encarga
                <select
                  defaultValue="-"
                  disabled={pendiente}
                  onChange={(e) => {
                    if (e.target.value !== "-") ejecutar(asignarElegidosAccion, { pedido: [...elegidas], usuarioId: e.target.value });
                    e.target.value = "-";
                  }}
                  className="h-10 rounded-lg border border-borde bg-tarjeta px-2"
                >
                  <option value="-">Elegir…</option>
                  {personas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.id === yo ? `Yo (${p.nombre.split(" ")[0]})` : p.nombre}
                    </option>
                  ))}
                  <option value="">Nadie</option>
                </select>
              </label>
            </>
          )}
          <button type="button" onClick={terminar} className="min-h-10 rounded-lg px-3 text-tarjeta-suave hover:bg-black/5">
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}
