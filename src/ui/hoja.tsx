"use client";

import { useEffect, type ReactNode } from "react";

// Una hoja que sube desde abajo de la pantalla (para el celular): lo secundario de una pantalla, a
// mano del pulgar y sin ocupar lugar mientras no hace falta. Se cierra con su botón, tocando afuera
// o con Escape.

export function Hoja({ titulo, cerrar, children }: { titulo: string; cerrar: () => void; children: ReactNode }) {
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrar();
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [cerrar]);
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={titulo}>
      <button type="button" aria-label="Cerrar" onClick={cerrar} className="hoja-fondo absolute inset-0 cursor-default bg-black/55" />
      <div className="hoja-panel relative flex max-h-[88dvh] flex-col gap-4 overflow-y-auto overscroll-contain rounded-t-3xl bg-superficie px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] text-texto shadow-2xl">
        <span aria-hidden className="mx-auto h-1.5 w-12 shrink-0 rounded-full bg-borde" />
        <div className="flex items-center justify-between gap-2">
          <h2 className="min-w-0 text-xl leading-tight font-bold first-letter:uppercase">{titulo}</h2>
          <button type="button" onClick={cerrar} className="flex min-h-11 shrink-0 items-center rounded-lg px-3 font-semibold hover:bg-fondo">
            Cerrar ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
