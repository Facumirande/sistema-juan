"use client";

import Link from "next/link";
import { useMemo, useState, useTransition, type DragEvent } from "react";

import { dibujoDeProducto } from "@/dominio/catalogo/productos";
import { formatearMoneda } from "@/dominio/dinero/formato";
import { accionAlMover, resumenDeSeleccion, type ClaveColumna } from "@/dominio/pedidos/tablero";
import type { PersonaVisible } from "@/modulos/colaboracion/personas";
import type { ColumnaDelTablero, TarjetaPedido } from "@/modulos/pedidos/tablero";
import { Avatar } from "@/ui/avatar";
import { ESTADO_INICIAL, type EstadoAccion } from "@/ui/estado-accion";
import { FONDO_ETIQUETA, dibujoDeCliente, etiquetasDePedido } from "@/ui/etiquetas-tablero";

import { salenAhoraAccion } from "../repartos/acciones";
import {
  armarListaConElegidosAccion,
  asignarElegidosAccion,
  moverTarjetaAccion,
  prioridadElegidosAccion,
  sacarDeListaAccion,
} from "./acciones";

// Tablero de pedidos estilo Trello: una columna por etapa y una tarjeta grande por pedido, con lo
// que lleva a la vista, etiquetas, plazo, notas, avance y quién se encarga. Se arrastran entre
// columnas (mandar a la lista de compras o sacarla, y de Preparando a En camino cuando sale) y en
// "Elegir pedidos" se marcan varias (o todas) para mandarlas juntas a la lista o a entregar.

type Accion = (estado: EstadoAccion, datos: FormData) => Promise<EstadoAccion>;

interface Props {
  fecha: string;
  columnas: ColumnaDelTablero[];
  cancelados: TarjetaPedido[];
  personas: PersonaVisible[];
  yo: string;
  /** "/inicio?fecha=…": las tarjetas se abren agregando `&pedido=…`. */
  base: string;
  /** `salir`: puede mandar pedidos a En camino (arma el reparto y sale). */
  puede: { crear: boolean; armar: boolean; editar: boolean; salir: boolean };
  /** Destino de cada columna para ir a la pantalla de esa etapa. */
  enlaces: Partial<Record<ClaveColumna, { href: string; texto: string }>>;
}

/** El color de cada columna, el mismo de su paso en "Paso a paso". */
const COLOR_COLUMNA: Record<ClaveColumna, string> = {
  pedidos: "var(--pastel-azul)",
  en_lista: "var(--pastel-violeta)",
  comprados: "var(--pastel-naranja)",
  preparando: "var(--pastel-amarillo)",
  en_camino: "var(--pastel-verde)",
  entregados: "var(--pastel-rosa)",
};

const DESTINO_PERMITIDO = (desde: ClaveColumna | null, hacia: ClaveColumna) => (desde ? accionAlMover(desde, hacia) !== null : false);
const PRODUCTOS_A_LA_VISTA = 4;

const PLAZO: Record<TarjetaPedido["estadoPlazo"], string> = {
  listo: "bg-[var(--listo-fondo)] text-[var(--listo-texto)]",
  vencido: "bg-[var(--vence-fondo)] text-[var(--vence-texto)]",
  pronto: "bg-[var(--pronto-fondo)] text-[var(--pronto-texto)]",
  a_tiempo: "bg-black/5 dark:bg-white/10",
};

const sinProductos = (t: TarjetaPedido) => ({
  ok: false,
  mensaje: `${t.cliente} (${t.numero}) todavía no tiene productos: cargale lo que lleva y después mandalo a la lista de compras.`,
  enlace: { href: `/pedidos/${t.id}/cambiar`, texto: `Agregar productos a ${t.cliente}` },
});

function Insignias({ t }: { t: TarjetaPedido }) {
  const avanceCompleto = t.avance && t.avance.total > 0 && t.avance.hechos === t.avance.total;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-tarjeta-suave">
      {t.plazo && (
        <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium ${PLAZO[t.estadoPlazo]}`} title={`Plazo: ${t.plazo}`}>
          <span aria-hidden>⏰</span>
          {t.entregaHasta ? `antes ${t.entregaHasta}` : `desde ${t.entregaDesde}`}
          {t.estadoPlazo === "vencido" && <span className="font-bold">· vencido</span>}
        </span>
      )}
      {t.notas.total > 0 && (
        <span className={`inline-flex items-center gap-1 ${t.notas.sinLeer ? "font-bold text-tarjeta-texto" : ""}`} title={t.notas.sinLeer ? `${t.notas.sinLeer} sin leer` : "Notas"}>
          <span aria-hidden>💬</span>
          {t.notas.total}
          {t.notas.sinLeer > 0 && <span className="size-2.5 rounded-full bg-[var(--etiqueta-azul)]" aria-label="sin leer" />}
        </span>
      )}
      {t.avance && t.avance.total > 0 && (
        <span
          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium ${avanceCompleto ? "bg-[var(--listo-fondo)] text-[var(--listo-texto)]" : "bg-black/5 dark:bg-white/10"}`}
          title={`${t.avance.que === "comprado" ? "Comprado" : "Preparado"}: ${t.avance.hechos} de ${t.avance.total}`}
        >
          <span aria-hidden>☑</span>
          {t.avance.hechos}/{t.avance.total} {t.avance.que === "comprado" ? "comprado" : "preparado"}
        </span>
      )}
      {t.totalEstimado !== null && t.lineas > 0 && <span className="font-semibold text-tarjeta-texto tabular-nums">{formatearMoneda(t.totalEstimado)}</span>}
      {t.responsable && (
        <span className="ml-auto" title={`Se encarga ${t.responsable.nombre}`}>
          <Avatar persona={t.responsable} />
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
  // En la lista de compras y al preparar se ve qué ya está (✓) y qué falta (⬜); al preparar,
  // todos los productos, para saber qué separar para ese cliente y qué faltó.
  const conTilde = t.columna === "en_lista" || t.columna === "preparando";
  const todos = t.columna === "preparando";
  const contenido = (
    <>
      {etiquetas.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {etiquetas.map((e) => (
            <span key={e.texto} className={`rounded-md px-2 py-0.5 text-xs leading-5 font-bold text-etiqueta-texto ${FONDO_ETIQUETA[e.color]}`}>
              {e.texto}
            </span>
          ))}
        </div>
      )}
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-black/5 text-2xl dark:bg-white/10">
          {dibujoDeCliente(t.tipoCliente)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-lg leading-snug font-semibold text-tarjeta-texto">{t.cliente}</p>
          <p className="text-sm text-tarjeta-suave">
            {t.numero}
            {t.observaciones && <span title={t.observaciones}> · 📝 con nota</span>}
          </p>
        </div>
      </div>
      {t.productos.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1 rounded-lg bg-black/[0.03] p-2 dark:bg-white/5">
          {(todos ? t.productos : t.productos.slice(0, PRODUCTOS_A_LA_VISTA)).map((p, i) => (
            <li key={`${p.nombre}-${i}`} className="text-[15px] text-tarjeta-texto">
              <span className="flex items-baseline gap-2">
                {conTilde ? (
                  <span aria-label={p.hecha ? "listo" : "falta"} className={p.hecha ? "font-bold text-[var(--pastel-verde-texto)]" : "text-tarjeta-suave"}>
                    {p.hecha ? "✓" : "⬜"}
                  </span>
                ) : (
                  <span aria-hidden>{dibujoDeProducto(p.nombre, p.grupo)}</span>
                )}
                <span className="min-w-0 flex-1 truncate">{p.nombre}</span>
                <span className="shrink-0 font-semibold tabular-nums">{p.cantidad}</span>
              </span>
              {p.aviso && <span className="mt-0.5 ml-6 block w-fit rounded-md bg-[var(--pastel-naranja)] px-2 text-sm font-semibold text-[var(--pastel-naranja-texto)]">⚠ {p.aviso}</span>}
            </li>
          ))}
          {!todos && t.productos.length > PRODUCTOS_A_LA_VISTA && <li className="pl-7 text-sm text-tarjeta-suave">y {t.productos.length - PRODUCTOS_A_LA_VISTA} más…</li>}
        </ul>
      ) : (
        <p className="mt-3 rounded-lg bg-[var(--pronto-fondo)] px-3 py-2 text-sm font-semibold text-[var(--pronto-texto)]">🧺 Sin productos todavía · tocá para cargarlos</p>
      )}
      <Insignias t={t} />
    </>
  );
  const clases = `block w-full rounded-xl bg-tarjeta p-4 text-left shadow-tarjeta outline-offset-2 transition-colors hover:bg-tarjeta-hover focus-visible:outline-2 focus-visible:outline-[var(--etiqueta-azul)] ${elegida ? "outline-3 outline-[var(--etiqueta-azul)]" : ""}`;
  if (eligiendo) {
    return (
      <label className={`${clases} cursor-pointer`}>
        <span className="flex gap-3">
          <input type="checkbox" checked={elegida} onChange={alElegir} className="mt-1 size-6 shrink-0" aria-label={`Elegir ${t.numero} de ${t.cliente}`} />
          <span className="min-w-0 flex-1">{contenido}</span>
        </span>
      </label>
    );
  }
  return (
    <Link href={t.lineas === 0 && t.estado === "BORRADOR" ? `/pedidos/${t.id}/cambiar` : href} scroll={false} draggable={arrastrable} onDragStart={alArrastrar} className={clases}>
      {contenido}
    </Link>
  );
}

function Aviso({ estado, cerrar, confirmar }: { estado: EstadoAccion; cerrar: () => void; confirmar: (() => void) | null }) {
  return (
    <div
      role={estado.ok ? "status" : "alert"}
      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 text-base font-medium shadow-tarjeta ${estado.ok ? "bg-tarjeta text-tarjeta-texto" : "bg-[var(--vence-fondo)] text-[var(--vence-texto)]"}`}
    >
      <span className="min-w-0 flex-1">{estado.mensaje}</span>
      {estado.requiereConfirmacion && confirmar && (
        <button type="button" onClick={confirmar} className="rounded-lg bg-[#172b4d] px-4 py-2 font-semibold text-white shadow-sm">
          Confirmar
        </button>
      )}
      {estado.enlace && (
        <Link href={estado.enlace.href} className="rounded-lg bg-white px-4 py-2 font-semibold text-[#172b4d] shadow-sm">
          {estado.enlace.texto} →
        </Link>
      )}
      <button type="button" onClick={cerrar} aria-label="Cerrar el aviso" className="flex size-9 items-center justify-center rounded-full text-xl leading-none hover:bg-black/10">
        ×
      </button>
    </div>
  );
}

export function TableroTrello({ fecha, columnas, cancelados, personas, yo, base, puede, enlaces }: Props) {
  const [eligiendo, setEligiendo] = useState(false);
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const [filtroPersona, setFiltroPersona] = useState<string | null>(null);
  const [soloUrgentes, setSoloUrgentes] = useState(false);
  const [arrastrando, setArrastrando] = useState<{ id: string; desde: ClaveColumna } | null>(null);
  const [sobre, setSobre] = useState<ClaveColumna | null>(null);
  const [mensaje, setMensaje] = useState<EstadoAccion>(ESTADO_INICIAL);
  // Lo último que se mandó, para reenviarlo con "Confirmar" si el servidor lo pide.
  const [ultimo, setUltimo] = useState<{ accion: Accion; datos: Record<string, string | string[]>; despues?: () => void } | null>(null);
  const [pendiente, empezar] = useTransition();
  const [verCancelados, setVerCancelados] = useState(false);

  const todas = useMemo(() => columnas.flatMap((c) => c.tarjetas), [columnas]);
  const pasaFiltro = (t: TarjetaPedido) => (!filtroPersona || t.responsable?.id === filtroPersona) && (!soloUrgentes || t.prioridad === "ALTA");
  const elegidasTarjetas = todas.filter((t) => elegidas.has(t.id));
  const resumen = resumenDeSeleccion(elegidasTarjetas);

  const ejecutar = (accion: Accion, datos: Record<string, string | string[]>, despues?: () => void) => {
    const fd = new FormData();
    for (const [clave, valor] of Object.entries(datos)) for (const v of Array.isArray(valor) ? valor : [valor]) fd.append(clave, v);
    setUltimo({ accion, datos, despues });
    empezar(async () => {
      const r = await accion(ESTADO_INICIAL, fd);
      setMensaje(r);
      if (r.ok) despues?.();
    });
  };
  const confirmarUltimo = ultimo ? () => ejecutar(ultimo.accion, { ...ultimo.datos, confirmarVariacion: "on" }, ultimo.despues) : null;
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
  const pendientesDeCompra = todas.filter((t) => t.columna === "pedidos" && pasaFiltro(t));
  const vacios = pendientesDeCompra.filter((t) => t.lineas === 0);
  const elegirFaltantes = () => {
    setEligiendo(true);
    setElegidas(new Set(pendientesDeCompra.filter((t) => t.lineas > 0).map((t) => t.id)));
    if (vacios.length > 0) {
      setMensaje({
        ok: false,
        mensaje:
          vacios.length === 1
            ? `${vacios[0]!.cliente} quedó afuera porque todavía no tiene productos: cargale lo que lleva.`
            : `Quedaron afuera ${vacios.length} pedidos sin productos (${vacios.map((t) => t.cliente).join(", ")}): cargales lo que llevan.`,
        enlace: { href: `/pedidos/${vacios[0]!.id}/cambiar`, texto: `Agregar productos a ${vacios[0]!.cliente}` },
      });
    }
  };
  const terminar = () => {
    setElegidas(new Set());
    setEligiendo(false);
  };
  const soltar = (hacia: ClaveColumna) => {
    setSobre(null);
    if (!arrastrando || arrastrando.desde === hacia) return;
    const tarjeta = todas.find((t) => t.id === arrastrando.id);
    setArrastrando(null);
    if (!DESTINO_PERMITIDO(arrastrando.desde, hacia)) {
      setMensaje({
        ok: false,
        mensaje:
          hacia === "en_camino"
            ? "A En camino se pasa desde Preparando: arrastrá ahí la tarjeta cuando el pedido sale a entregar."
            : "Esa tarjeta no se puede mover ahí: comprado, preparación y entrega avanzan solos cuando se hacen esos pasos.",
      });
      return;
    }
    if (tarjeta && tarjeta.lineas === 0 && hacia === "en_lista") {
      setMensaje(sinProductos(tarjeta));
      return;
    }
    ejecutar(moverTarjetaAccion, { pedido: arrastrando.id, desde: arrastrando.desde, hacia });
  };
  const chip = (activo: boolean) => `min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold ${activo ? "bg-white text-[#172b4d]" : "bg-white/20 text-white hover:bg-white/30"}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center" role="toolbar" aria-label="Filtros y selección">
        <div className="sin-barra -mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1 lg:flex-1 lg:flex-wrap lg:overflow-visible lg:pb-0">
        <span className="shrink-0 text-sm font-medium text-white/90">Ver:</span>
        <button type="button" onClick={() => setFiltroPersona(null)} aria-pressed={filtroPersona === null} className={chip(filtroPersona === null)}>
          Todos
        </button>
        {personas.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setFiltroPersona(filtroPersona === p.id ? null : p.id)}
            aria-pressed={filtroPersona === p.id}
            title={`Solo los de ${p.nombre}`}
            className={`flex min-h-10 shrink-0 items-center gap-2 rounded-full py-0.5 pr-4 pl-1 text-sm font-semibold ${filtroPersona === p.id ? "bg-white text-[#172b4d]" : "bg-white/20 text-white hover:bg-white/30"}`}
          >
            <Avatar persona={p} tamano="chico" />
            {p.id === yo ? "Míos" : p.nombre.split(" ")[0]}
          </button>
        ))}
        <button type="button" onClick={() => setSoloUrgentes(!soloUrgentes)} aria-pressed={soloUrgentes} className={chip(soloUrgentes)}>
          🔴 Urgentes
        </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        {puede.armar && pendientesDeCompra.length > vacios.length && !eligiendo && (
          <button type="button" onClick={elegirFaltantes} className="min-h-10 rounded-lg bg-white px-4 text-sm font-semibold text-[#172b4d] hover:bg-white/90">
            🛒 Elegir todos los pedidos para la lista ({pendientesDeCompra.length - vacios.length})
          </button>
        )}
        <button
          type="button"
          onClick={() => (eligiendo ? terminar() : setEligiendo(true))}
          aria-pressed={eligiendo}
          className={`min-h-10 rounded-lg px-4 text-sm font-semibold ${eligiendo ? "bg-white text-[#172b4d]" : "bg-white/20 text-white hover:bg-white/30"}`}
        >
          {eligiendo ? "Terminar de elegir" : "☑ Elegir pedidos"}
        </button>
        </div>
      </div>

      {mensaje.mensaje && <Aviso estado={mensaje} cerrar={() => setMensaje(ESTADO_INICIAL)} confirmar={pendiente ? null : confirmarUltimo} />}

      <nav aria-label="Ir a una columna" className="sin-barra -mx-1 flex gap-2 overflow-x-auto px-1 md:hidden">
        {columnas.map((col) => (
          <button
            key={col.clave}
            type="button"
            onClick={() => document.getElementById(`lista-${col.clave}`)?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" })}
            className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-full bg-black/25 px-4 text-sm font-semibold text-white"
          >
            {col.titulo} <span className="rounded-full bg-white/25 px-2 text-xs">{col.tarjetas.filter(pasaFiltro).length}</span>
          </button>
        ))}
      </nav>

      <div className="-mx-3 flex snap-x snap-mandatory items-start gap-4 overflow-x-auto px-3 pb-4 md:snap-none" aria-busy={pendiente}>
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
              style={{ borderTop: `8px solid ${COLOR_COLUMNA[col.clave]}` }}
              className={`flex max-h-[calc(100dvh-230px)] w-[88vw] max-w-[380px] shrink-0 snap-start flex-col rounded-2xl bg-lista text-lista-texto shadow-sm sm:w-[340px] ${sobre === col.clave ? "outline-3 outline-offset-2 outline-white" : ""} ${aceptaSoltar && sobre !== col.clave ? "outline-2 outline-dashed outline-white/70" : ""}`}
            >
              <header className="flex items-start justify-between gap-2 px-4 pt-3 pb-2">
                <div className="min-w-0">
                  <h2 id={`col-${col.clave}`} className="text-lg font-bold">
                    {col.titulo} <span className="ml-1 rounded-full bg-black/10 px-2.5 py-0.5 text-sm font-bold dark:bg-white/15">{visibles.length}</span>
                  </h2>
                  <p className="text-sm text-tarjeta-suave">{col.ayuda}</p>
                </div>
                {eligiendo && col.seleccionable && visibles.length > 0 && (
                  <button type="button" onClick={() => elegirColumna(col)} className="shrink-0 rounded-lg px-2 py-1.5 text-sm font-semibold hover:bg-black/10 dark:hover:bg-white/10">
                    {todasElegidas ? "Ninguno" : "Elegir todos"}
                  </button>
                )}
              </header>
              <ol className="flex min-h-2 flex-col gap-3 overflow-y-auto px-3 py-1">
                {visibles.map((t) => (
                  <li key={t.id}>
                    <Tarjeta
                      t={t}
                      href={`${base}&pedido=${t.id}`}
                      eligiendo={eligiendo && col.seleccionable}
                      elegida={elegidas.has(t.id)}
                      alElegir={() => alternar(t.id)}
                      arrastrable={(puede.editar && (col.clave === "pedidos" || col.clave === "en_lista")) || (puede.salir && col.clave === "preparando")}
                      alArrastrar={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", t.id);
                        setArrastrando({ id: t.id, desde: col.clave });
                      }}
                    />
                  </li>
                ))}
                {visibles.length === 0 && (
                  <li className="px-1 py-3 text-tarjeta-suave">
                    {col.tarjetas.length ? "Nada con este filtro." : col.clave === "en_camino" && puede.salir ? "Arrastrá acá desde Preparando lo que sale a entregar." : "Sin pedidos."}
                  </li>
                )}
              </ol>
              <footer className="px-3 pt-2 pb-3">
                {col.clave === "pedidos" && puede.crear ? (
                  <Link href={`/pedidos/nuevo?fecha=${fecha}`} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-black/5 text-base font-semibold hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/15">
                    <span aria-hidden className="text-xl leading-none">
                      ＋
                    </span>
                    Nuevo pedido
                  </Link>
                ) : (
                  enlaces[col.clave] && (
                    <Link href={enlaces[col.clave]!.href} className="flex min-h-11 items-center rounded-lg px-2 font-medium text-tarjeta-suave hover:bg-black/5 dark:hover:bg-white/10">
                      {enlaces[col.clave]!.texto} →
                    </Link>
                  )
                )}
              </footer>
            </section>
          );
        })}
        {cancelados.length > 0 && (
          <section className="w-[88vw] max-w-[380px] shrink-0 snap-start rounded-2xl bg-black/25 p-3 text-white sm:w-64">
            <button type="button" onClick={() => setVerCancelados(!verCancelados)} className="flex min-h-11 w-full items-center justify-between rounded-lg px-2 font-semibold hover:bg-white/10">
              Cancelados ({cancelados.length}) <span aria-hidden>{verCancelados ? "▾" : "▸"}</span>
            </button>
            {verCancelados && (
              <ul className="mt-2 flex flex-col gap-2 opacity-80">
                {cancelados.map((t) => (
                  <li key={t.id}>
                    <Link href={`${base}&pedido=${t.id}`} scroll={false} className="block rounded-lg bg-tarjeta p-3 text-tarjeta-texto line-through shadow-tarjeta">
                      {t.cliente} · {t.numero}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      {puede.crear && !eligiendo && (
        <Link
          href={`/pedidos/nuevo?fecha=${fecha}`}
          className="fixed right-4 bottom-5 z-40 flex min-h-14 items-center gap-2 rounded-full bg-white px-5 text-lg font-semibold text-[#172b4d] shadow-xl ring-1 ring-black/10 sm:hidden"
        >
          <span aria-hidden className="text-2xl leading-none">
            ＋
          </span>
          Nuevo pedido
        </Link>
      )}

      {eligiendo && elegidas.size > 0 && (
        <div className="sticky bottom-3 z-30 mx-auto flex w-full max-w-5xl flex-wrap items-center gap-3 rounded-2xl bg-tarjeta p-4 text-tarjeta-texto shadow-lg ring-1 ring-black/10">
          <span className="text-lg font-semibold">
            {elegidas.size} {elegidas.size === 1 ? "elegido" : "elegidos"}
          </span>
          <span className="flex-1" />
          {puede.armar && resumen.paraLista > 0 && (
            <button type="button" disabled={pendiente} onClick={() => ejecutar(armarListaConElegidosAccion, { pedido: [...elegidas] }, terminar)} className="min-h-12 rounded-xl bg-marca px-4 font-semibold text-marca-texto disabled:opacity-60">
              🛒 Mandar a la lista de compras ({resumen.paraLista})
            </button>
          )}
          {puede.salir && resumen.paraSalir > 0 && (
            <button type="button" disabled={pendiente} onClick={() => ejecutar(salenAhoraAccion, { pedido: elegidasTarjetas.filter((t) => t.columna === "preparando").map((t) => t.id) }, terminar)} className="min-h-12 rounded-xl bg-marca px-4 font-semibold text-marca-texto disabled:opacity-60">
              🚚 Salen ahora ({resumen.paraSalir})
            </button>
          )}
          {puede.armar && resumen.paraSacar > 0 && (
            <button
              type="button"
              disabled={pendiente}
              onClick={() => ejecutar(sacarDeListaAccion, { pedido: [...elegidas].filter((id) => todas.find((t) => t.id === id)?.estado === "EN_COMPRA") }, terminar)}
              className="min-h-12 rounded-xl border-2 border-borde px-4 font-semibold disabled:opacity-60"
            >
              Sacar de la lista ({resumen.paraSacar})
            </button>
          )}
          {puede.editar && (
            <>
              <label className="flex items-center gap-2">
                Prioridad
                <select
                  defaultValue=""
                  disabled={pendiente}
                  onChange={(e) => {
                    if (e.target.value) ejecutar(prioridadElegidosAccion, { pedido: [...elegidas], prioridad: e.target.value });
                    e.target.value = "";
                  }}
                  className="h-12 rounded-xl border-2 border-borde bg-tarjeta px-2"
                >
                  <option value="">Elegir…</option>
                  <option value="ALTA">🔴 Urgente</option>
                  <option value="NORMAL">⚪ Normal</option>
                  <option value="BAJA">🔵 Sin apuro</option>
                </select>
              </label>
              <label className="flex items-center gap-2">
                Se encarga
                <select
                  defaultValue="-"
                  disabled={pendiente}
                  onChange={(e) => {
                    if (e.target.value !== "-") ejecutar(asignarElegidosAccion, { pedido: [...elegidas], usuarioId: e.target.value });
                    e.target.value = "-";
                  }}
                  className="h-12 rounded-xl border-2 border-borde bg-tarjeta px-2"
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
          <button type="button" onClick={terminar} className="min-h-12 rounded-xl px-4 text-tarjeta-suave hover:bg-black/5">
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}
