"use client";

import { useEffect, useId, useRef, useState } from "react";

import type { LugarSugerido } from "@/dominio/entregas/ubicacion";

import { buscarEnMapaAccion, sugerirLugaresAccion } from "./acciones";

// La búsqueda de un lugar, la misma en toda la aplicación (pedido del usuario, 10/10/2026): mientras
// se escribe la dirección aparecen los lugares de Tucumán que coinciden (Photon, OpenStreetMap) y se
// elige uno con un toque o con las flechas y Enter. Si Enter no encuentra sugerencias, se busca de la
// forma de siempre (Nominatim). Lo elegido lleva el mapa a ese lugar para afinarlo y guardarlo.

const ESPERA_MS = 350;

export function BuscadorDeLugar({
  valor,
  alCambiar,
  alElegir,
  placeholder = "Escribí la calle y el número, o el nombre del lugar",
  etiqueta = "Buscar la dirección",
  className = "",
  autoFocus = false,
}: {
  valor: string;
  alCambiar: (texto: string) => void;
  alElegir: (lugar: LugarSugerido) => void;
  placeholder?: string;
  etiqueta?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const id = useId();
  const [sugerencias, setSugerencias] = useState<LugarSugerido[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [marcada, setMarcada] = useState(-1);
  const [buscando, setBuscando] = useState(false);
  const [sinResultados, setSinResultados] = useState(false);
  const pedido = useRef(0);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const caja = useRef<HTMLDivElement>(null);

  // Se cierra al tocar afuera.
  useEffect(() => {
    if (!abierto) return;
    const afuera = (e: PointerEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("pointerdown", afuera);
    return () => document.removeEventListener("pointerdown", afuera);
  }, [abierto]);

  const consultar = (texto: string, deLaFormaDeSiempre = false) => {
    const este = ++pedido.current;
    setBuscando(true);
    const promesa: Promise<LugarSugerido[]> = deLaFormaDeSiempre
      ? buscarEnMapaAccion(texto).then((r) => r.lugares.map((l) => ({ etiqueta: l.etiqueta, detalle: null, coordenada: l.coordenada })))
      : sugerirLugaresAccion(texto);
    promesa
      .then((lugares) => {
        // Solo vale la respuesta de lo último que se escribió.
        if (este !== pedido.current) return;
        setSugerencias(lugares);
        setMarcada(lugares.length ? 0 : -1);
        setSinResultados(lugares.length === 0);
        setAbierto(true);
      })
      .catch(() => {
        if (este === pedido.current) setSugerencias([]);
      })
      .finally(() => {
        if (este === pedido.current) setBuscando(false);
      });
  };
  const cambiar = (texto: string) => {
    alCambiar(texto);
    if (espera.current) clearTimeout(espera.current);
    if (texto.trim().length < 3) {
      pedido.current++;
      setSugerencias([]);
      setAbierto(false);
      setBuscando(false);
      return;
    }
    espera.current = setTimeout(() => consultar(texto), ESPERA_MS);
  };
  const elegir = (l: LugarSugerido) => {
    alCambiar(l.detalle ? `${l.etiqueta}, ${l.detalle}` : l.etiqueta);
    setAbierto(false);
    setSugerencias([]);
    alElegir(l);
  };

  return (
    <div ref={caja} className={`relative ${className}`}>
      <label htmlFor={id} className="sr-only">
        {etiqueta}
      </label>
      <span aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-lg leading-none">
        📍
      </span>
      <input
        id={id}
        type="search"
        role="combobox"
        aria-expanded={abierto && sugerencias.length > 0}
        aria-controls={`${id}-lista`}
        aria-autocomplete="list"
        value={valor}
        autoFocus={autoFocus}
        onChange={(e) => cambiar(e.target.value)}
        onFocus={() => sugerencias.length && setAbierto(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && sugerencias.length) {
            e.preventDefault();
            setAbierto(true);
            setMarcada((m) => Math.min(m + 1, sugerencias.length - 1));
          } else if (e.key === "ArrowUp" && sugerencias.length) {
            e.preventDefault();
            setMarcada((m) => Math.max(m - 1, 0));
          } else if (e.key === "Escape") {
            setAbierto(false);
          } else if (e.key === "Enter") {
            e.preventDefault();
            const l = abierto ? sugerencias[marcada] : undefined;
            if (l) elegir(l);
            else if (valor.trim().length >= 3) consultar(valor, sugerencias.length === 0 && sinResultados);
          }
        }}
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder={placeholder}
        className="h-12 w-full min-w-0 rounded-xl border-2 border-borde bg-superficie pr-12 pl-10 text-base [&::-webkit-search-cancel-button]:hidden"
      />
      {buscando ? (
        <span aria-label="Buscando" className="absolute top-1/2 right-3 size-5 -translate-y-1/2 animate-spin rounded-full border-2 border-marca border-t-transparent" />
      ) : (
        valor && (
          <button type="button" onClick={() => cambiar("")} aria-label="Borrar la dirección" className="absolute top-1/2 right-1 flex size-10 -translate-y-1/2 items-center justify-center rounded-full text-xl font-bold text-texto-suave hover:bg-fondo">
            ✕
          </button>
        )
      )}
      {abierto && (
        <ul id={`${id}-lista`} role="listbox" className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border border-borde bg-superficie py-1 shadow-xl">
          {sugerencias.map((l, i) => (
            <li key={`${l.coordenada.lat},${l.coordenada.lng},${l.etiqueta}`} role="option" aria-selected={i === marcada}>
              <button
                type="button"
                onPointerEnter={() => setMarcada(i)}
                onClick={() => elegir(l)}
                className={`flex w-full flex-col items-start px-3 py-2 text-left ${i === marcada ? "bg-marca/15" : "hover:bg-fondo"}`}
              >
                <span className="font-semibold">{l.etiqueta}</span>
                {l.detalle && <span className="text-sm text-texto-suave">{l.detalle}</span>}
              </button>
            </li>
          ))}
          {sugerencias.length === 0 && (
            <li className="px-3 py-2 text-sm text-texto-suave">
              No aparece en Tucumán.{" "}
              <button type="button" onClick={() => consultar(valor, true)} className="font-semibold text-marca underline underline-offset-2">
                Buscar de otra forma
              </button>{" "}
              o marcalo en el mapa.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
