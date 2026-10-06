"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type PointerEvent as EventoPuntero } from "react";

import { ESTADO_INICIAL, type EstadoAccion } from "@/ui/estado-accion";

import { moverProductoAccion } from "./acciones";

// Productos en tarjetas por categoría (pedido del usuario, 06/10/2026): las tarjetas se arrastran
// de una categoría a otra (con el mouse, o en el celular manteniendo el dedo apretado un momento)
// o se mueven con "↔ Mover". Soltarlas en "＋ Nueva categoría" crea una (preelegida u otra). Las
// categorías que quedan vacías desaparecen (RN-154).

export interface TarjetaDeProducto {
  id: string;
  nombre: string;
  dibujo: string;
  franja: string;
  subtitulo: string;
  datos: { icono: string; texto: string; aviso?: boolean }[];
  inactivo: boolean;
}

export interface GrupoDeProductos {
  categoriaId: string;
  nombre: string;
  icono: string;
  productos: TarjetaDeProducto[];
}

interface Preelegida {
  nombre: string;
  icono: string;
  ayuda: string;
}

type Destino = { tipo: "categoria"; id: string } | { tipo: "nueva" };

/** Arrastre en curso: qué tarjeta, dónde está el puntero y sobre qué se va a soltar. */
interface Arrastre {
  id: string;
  nombre: string;
  dibujo: string;
  desde: string;
  x: number;
  y: number;
  sobre: Destino | null;
}

const UMBRAL_MOUSE = 6;
const ESPERA_DEDO = 350;

function destinoEn(x: number, y: number): Destino | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-destino]");
  if (!el) return null;
  return el.dataset.destino === "nueva" ? { tipo: "nueva" } : { tipo: "categoria", id: el.dataset.destino! };
}

function Elegir({
  titulo,
  categorias,
  preelegidas,
  soloNuevas,
  alElegir,
  alCancelar,
}: {
  titulo: string;
  categorias: { id: string; nombre: string; icono: string }[];
  preelegidas: Preelegida[];
  soloNuevas: boolean;
  alElegir: (valor: string) => void;
  alCancelar: () => void;
}) {
  const [otra, setOtra] = useState("");
  const usadas = new Set(categorias.map((c) => c.nombre.toLowerCase()));
  const boton = "flex min-h-11 items-center gap-2 rounded-xl border-2 border-borde bg-superficie px-3 text-left font-medium hover:border-marca";
  return (
    <div role="dialog" aria-modal="true" aria-label={titulo} className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center" onClick={alCancelar}>
      <div className="flex max-h-[85dvh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-2xl bg-superficie p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-lg font-semibold">{titulo}</p>
        {!soloNuevas && categorias.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-texto-suave">Categorías que ya usás</p>
            <div className="flex flex-wrap gap-2">
              {categorias.map((c) => (
                <button key={c.id} type="button" onClick={() => alElegir(`id:${c.id}`)} className={boton}>
                  <span aria-hidden>{c.icono}</span> {c.nombre}
                </button>
              ))}
            </div>
          </div>
        )}
        {preelegidas.some((p) => !usadas.has(p.nombre.toLowerCase())) && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-texto-suave">Categorías preelegidas</p>
            <div className="flex flex-col gap-2">
              {preelegidas
                .filter((p) => !usadas.has(p.nombre.toLowerCase()))
                .map((p) => (
                  <button key={p.nombre} type="button" onClick={() => alElegir(`nombre:${p.nombre}`)} className={boton}>
                    <span aria-hidden>{p.icono}</span>
                    <span>
                      <span className="block">{p.nombre}</span>
                      <span className="block text-sm font-normal text-texto-suave">{p.ayuda}</span>
                    </span>
                  </button>
                ))}
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <input value={otra} onChange={(e) => setOtra(e.target.value)} maxLength={80} placeholder="Otra (escribí el nombre)" aria-label="Nombre de otra categoría" className="h-11 min-w-0 flex-1 rounded-xl border-2 border-borde bg-superficie px-3" />
          <button type="button" disabled={!otra.trim()} onClick={() => alElegir(`nombre:${otra.trim()}`)} className="min-h-11 rounded-xl bg-marca px-4 font-semibold text-marca-texto disabled:opacity-50">
            Usar
          </button>
        </div>
        <div className="flex flex-wrap justify-between gap-2">
          <button type="button" onClick={() => alElegir("ninguna")} className={boton}>
            Ninguna
          </button>
          <button type="button" onClick={alCancelar} className="min-h-11 rounded-xl px-4 font-medium text-texto-suave hover:bg-fondo">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

export function TableroDeProductos({ grupos, preelegidas, puedeEditar }: { grupos: GrupoDeProductos[]; preelegidas: Preelegida[]; puedeEditar: boolean }) {
  const [arrastre, setArrastre] = useState<Arrastre | null>(null);
  const [eligiendo, setEligiendo] = useState<{ id: string; nombre: string; soloNuevas: boolean } | null>(null);
  const [mensaje, setMensaje] = useState<EstadoAccion>(ESTADO_INICIAL);
  const [pendiente, empezar] = useTransition();
  // Lo que se está por arrastrar (antes de pasar el umbral o la espera del dedo).
  const inicio = useRef<{ id: string; nombre: string; dibujo: string; desde: string; x: number; y: number; tipo: string; timer: number | null } | null>(null);
  const recienArrastrado = useRef(false);
  const categorias = grupos.map((g) => ({ id: g.categoriaId, nombre: g.nombre, icono: g.icono }));

  const mover = (productoId: string, valor: string, nombre: string) => {
    const fd = new FormData();
    fd.append("productoId", productoId);
    fd.append("categoria", valor);
    empezar(async () => {
      const r = await moverProductoAccion(ESTADO_INICIAL, fd);
      setMensaje(r.ok ? { ...r, mensaje: `${nombre}: ${r.mensaje}` } : r);
    });
  };

  // Mientras se arrastra con el dedo, la página no se desplaza.
  useEffect(() => {
    if (!arrastre) return;
    const frenar = (e: TouchEvent) => e.preventDefault();
    document.addEventListener("touchmove", frenar, { passive: false });
    return () => document.removeEventListener("touchmove", frenar);
  }, [arrastre]);

  const empezarArrastre = (x: number, y: number) => {
    const i = inicio.current;
    if (!i) return;
    setArrastre({ id: i.id, nombre: i.nombre, dibujo: i.dibujo, desde: i.desde, x, y, sobre: destinoEn(x, y) });
  };
  const alApretar = (e: EventoPuntero<HTMLElement>, t: TarjetaDeProducto, desde: string) => {
    if (!puedeEditar || e.button !== 0) return;
    inicio.current = { id: t.id, nombre: t.nombre, dibujo: t.dibujo, desde, x: e.clientX, y: e.clientY, tipo: e.pointerType, timer: null };
    if (e.pointerType !== "mouse") {
      const { clientX, clientY } = e;
      inicio.current.timer = window.setTimeout(() => {
        empezarArrastre(clientX, clientY);
        navigator.vibrate?.(30);
      }, ESPERA_DEDO);
    }
  };
  const alMover = (e: EventoPuntero<HTMLElement>) => {
    const i = inicio.current;
    if (!i) return;
    if (!arrastre) {
      const lejos = Math.hypot(e.clientX - i.x, e.clientY - i.y);
      if (i.tipo === "mouse" && lejos > UMBRAL_MOUSE) {
        e.currentTarget.setPointerCapture(e.pointerId);
        empezarArrastre(e.clientX, e.clientY);
      } else if (i.tipo !== "mouse" && lejos > 10 && i.timer !== null) {
        // Se movió antes de la espera: es un desplazamiento de la página, no un arrastre.
        window.clearTimeout(i.timer);
        inicio.current = null;
      }
      return;
    }
    setArrastre({ ...arrastre, x: e.clientX, y: e.clientY, sobre: destinoEn(e.clientX, e.clientY) });
  };
  const alSoltar = () => {
    const i = inicio.current;
    if (i?.timer) window.clearTimeout(i.timer);
    inicio.current = null;
    if (!arrastre) return;
    recienArrastrado.current = true;
    // Si se suelta afuera de la tarjeta no llega el clic: la marca dura solo este evento.
    window.setTimeout(() => (recienArrastrado.current = false), 0);
    const a = arrastre;
    setArrastre(null);
    if (!a.sobre) return;
    if (a.sobre.tipo === "nueva") setEligiendo({ id: a.id, nombre: a.nombre, soloNuevas: true });
    else if (a.sobre.id !== a.desde) mover(a.id, `id:${a.sobre.id}`, a.nombre);
  };
  const resaltado = (d: Destino) => arrastre?.sobre && (d.tipo === "nueva" ? arrastre.sobre.tipo === "nueva" : arrastre.sobre.tipo === "categoria" && arrastre.sobre.id === d.id);

  return (
    <div className="flex flex-col gap-6" aria-busy={pendiente}>
      {puedeEditar && (
        <p className="text-sm text-texto-suave">
          Para cambiar un producto de categoría, arrastrá su tarjeta (en el celular, mantené el dedo apretado un momento) o tocá <b>↔</b> en la tarjeta.
        </p>
      )}
      {mensaje.mensaje && (
        <div role={mensaje.ok ? "status" : "alert"} className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${mensaje.ok ? "border-marca bg-superficie" : "border-error text-error"}`}>
          <span>{mensaje.mensaje}</span>
          <button type="button" onClick={() => setMensaje(ESTADO_INICIAL)} aria-label="Cerrar el aviso" className="flex size-9 items-center justify-center rounded-full text-xl hover:bg-fondo">
            ×
          </button>
        </div>
      )}
      {grupos.map((g) => {
        const destino: Destino = { tipo: "categoria", id: g.categoriaId };
        return (
          <section
            key={g.categoriaId}
            data-destino={g.categoriaId}
            aria-label={g.nombre}
            className={`flex flex-col gap-3 rounded-2xl p-2 transition-colors ${resaltado(destino) ? "bg-marca/10 outline-3 outline-dashed outline-marca" : arrastre ? "outline-2 outline-dashed outline-borde" : ""}`}
          >
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <span aria-hidden>{g.icono}</span>
              {g.nombre}
              <span className="rounded-full bg-fondo px-2 text-sm font-bold text-texto-suave">{g.productos.length}</span>
            </h2>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {g.productos.map((t) => (
                <li key={t.id} className={`relative ${arrastre?.id === t.id ? "opacity-40" : ""}`}>
                  <Link
                    href={`/productos/${t.id}`}
                    draggable={false}
                    onPointerDown={(e) => alApretar(e, t, g.categoriaId)}
                    onPointerMove={alMover}
                    onPointerUp={alSoltar}
                    onPointerCancel={alSoltar}
                    onContextMenu={(e) => {
                      if (inicio.current || arrastre) e.preventDefault();
                    }}
                    onClick={(e) => {
                      // Después de arrastrar no se abre la ficha.
                      if (recienArrastrado.current) {
                        e.preventDefault();
                        recienArrastrado.current = false;
                      }
                    }}
                    className={`flex h-full flex-col overflow-hidden rounded-lg bg-tarjeta text-tarjeta-texto shadow-tarjeta outline-offset-2 select-none [-webkit-touch-callout:none] hover:bg-tarjeta-hover focus-visible:outline-2 focus-visible:outline-[var(--etiqueta-azul)] ${t.inactivo ? "opacity-60" : ""} ${puedeEditar ? "cursor-grab active:cursor-grabbing" : ""}`}
                  >
                    <span aria-hidden className="h-2 shrink-0" style={{ background: t.franja }} />
                    <span className="flex flex-1 flex-col gap-2 p-3 pr-12">
                      <span className="flex items-start gap-3">
                        <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-black/5 text-2xl dark:bg-white/10">
                          {t.dibujo}
                        </span>
                        <span className="min-w-0">
                          <span className="block leading-snug font-semibold">
                            {t.nombre}
                            {t.inactivo && <span className="ml-2 rounded bg-black/10 px-1.5 text-xs font-semibold dark:bg-white/15">Desactivado</span>}
                          </span>
                          <span className="block text-sm text-tarjeta-suave">{t.subtitulo}</span>
                        </span>
                      </span>
                      <span className="flex flex-col gap-1.5 text-sm">
                        {t.datos.map((d) => (
                          <span key={d.texto} className={`flex items-start gap-2 ${d.aviso ? "font-semibold text-error" : "text-tarjeta-suave"}`}>
                            <span aria-hidden className="w-4 shrink-0 text-center">
                              {d.icono}
                            </span>
                            <span className="min-w-0">{d.texto}</span>
                          </span>
                        ))}
                      </span>
                    </span>
                  </Link>
                  {puedeEditar && (
                    <button
                      type="button"
                      onClick={() => setEligiendo({ id: t.id, nombre: t.nombre, soloNuevas: false })}
                      title="Mover a otra categoría"
                      aria-label={`Mover ${t.nombre} a otra categoría`}
                      className="absolute top-4 right-2 flex size-9 items-center justify-center rounded-full bg-fondo text-lg font-bold hover:bg-borde"
                    >
                      ↔
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {puedeEditar && (
        <div
          data-destino="nueva"
          className={`flex min-h-20 items-center justify-center rounded-2xl border-2 border-dashed p-4 text-center font-semibold ${resaltado({ tipo: "nueva" }) ? "border-marca bg-marca/10" : "border-borde text-texto-suave"}`}
        >
          ＋ Nueva categoría: soltá acá una tarjeta (Duras, Blandas, Frágiles, De hoja… u otra)
        </div>
      )}
      {arrastre && (
        <div aria-hidden className="pointer-events-none fixed z-50 flex items-center gap-2 rounded-xl bg-tarjeta px-3 py-2 font-semibold text-tarjeta-texto shadow-xl ring-2 ring-marca" style={{ left: arrastre.x + 12, top: arrastre.y + 12 }}>
          <span className="text-xl">{arrastre.dibujo}</span>
          {arrastre.nombre}
        </div>
      )}
      {eligiendo && (
        <Elegir
          titulo={eligiendo.soloNuevas ? `Nueva categoría para ${eligiendo.nombre}` : `¿A qué categoría pasa ${eligiendo.nombre}?`}
          categorias={categorias}
          preelegidas={preelegidas}
          soloNuevas={eligiendo.soloNuevas}
          alCancelar={() => setEligiendo(null)}
          alElegir={(valor) => {
            const e = eligiendo;
            setEligiendo(null);
            mover(e.id, valor, e.nombre);
          }}
        />
      )}
    </div>
  );
}
