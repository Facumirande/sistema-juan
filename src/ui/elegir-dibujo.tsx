"use client";

import { useState } from "react";

import { DIBUJOS_PARA_ELEGIR } from "@/dominio/catalogo/dibujos";

// Elegir el dibujo de un producto (pedido del usuario, 11/10/2026). Por defecto sale solo del
// nombre; con "Cambiar el dibujo" se abre la lista (verduras, frutas, otros y unos más sobrios) y se
// toca el que se quiere. "Automático" vuelve al que sale solo. Lo elegido viaja en un campo oculto
// (vacío = automático).

export function ElegirDibujo({
  name,
  elegido,
  automatico,
  alElegir,
}: {
  name: string;
  /** El dibujo elegido a mano; nulo = el que sale solo. */
  elegido: string | null;
  /** El que sale solo del nombre y la categoría (cambia mientras se escribe el nombre). */
  automatico: string;
  alElegir: (dibujo: string | null) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const boton = (activo: boolean) =>
    `flex size-11 items-center justify-center rounded-xl border-2 text-2xl leading-none transition-colors ${activo ? "border-marca bg-marca/15" : "border-transparent bg-fondo hover:border-borde"}`;
  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name={name} value={elegido ?? ""} />
      <div className="flex flex-wrap items-center gap-3">
        <span aria-hidden className="flex size-12 items-center justify-center rounded-full bg-fondo text-3xl leading-none">
          {elegido ?? automatico}
        </span>
        <span className="text-sm text-texto-suave">{elegido ? "Dibujo elegido a mano." : "El dibujo sale solo del nombre."}</span>
        <button type="button" onClick={() => setAbierto(!abierto)} aria-expanded={abierto} className="min-h-10 rounded-xl border-2 border-borde bg-superficie px-3 text-sm font-semibold hover:border-marca">
          {abierto ? "Cerrar la lista ▴" : "Cambiar el dibujo ▾"}
        </button>
      </div>
      {abierto && (
        <div className="flex flex-col gap-3 rounded-2xl border border-borde bg-superficie p-3">
          <button type="button" onClick={() => alElegir(null)} aria-pressed={elegido === null} className={`flex min-h-11 items-center gap-2 self-start rounded-xl border-2 px-3 font-medium ${elegido === null ? "border-marca bg-marca/15" : "border-borde hover:border-marca"}`}>
            <span aria-hidden className="text-2xl leading-none">
              {automatico}
            </span>
            Automático (el que sale del nombre)
          </button>
          {DIBUJOS_PARA_ELEGIR.map((grupo) => (
            <div key={grupo.titulo} className="flex flex-col gap-1.5">
              <p className="text-sm font-semibold text-texto-suave">{grupo.titulo}</p>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={grupo.titulo}>
                {grupo.dibujos.map((d) => (
                  <button key={d} type="button" onClick={() => alElegir(d)} aria-pressed={elegido === d} aria-label={`Dibujo ${d}`} className={boton(elegido === d)}>
                    <span aria-hidden>{d}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
