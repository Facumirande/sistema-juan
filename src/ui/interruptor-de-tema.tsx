"use client";

import { temaContrario } from "@/dominio/aspecto/aspecto";

import { elegirTema, useAspecto } from "./aspecto";

// El interruptor chico de la barra de arriba, a la izquierda de la campanita (pedido del usuario,
// 11/10/2026): un toque pasa de modo claro a oscuro y al revés. Cómo se ve (la perilla de un lado o
// del otro, el sol o la luna) sale de los estilos, por `data-tema`: así llega bien dibujado desde
// el primer momento, sin esperar a que arranque la página. Lo mismo se elige, con más opciones, en
// Mi cuenta → Aspecto.

export function InterruptorDeTema() {
  const { tema } = useAspecto();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={tema === "oscuro"}
      aria-label="Modo oscuro"
      title={tema === "oscuro" ? "Pasar a modo claro" : "Pasar a modo oscuro"}
      onClick={() => elegirTema(temaContrario(tema))}
      className="flex min-h-11 shrink-0 items-center px-0.5"
    >
      <span className="relative flex h-7 w-12 items-center rounded-full border border-[var(--nav-borde)] bg-black/10 transition-colors dark:bg-white/15">
        <span className="absolute left-0.5 flex size-6 items-center justify-center rounded-full bg-white text-sm leading-none shadow transition-transform duration-200 dark:translate-x-5 dark:bg-[#22272b]">
          <span aria-hidden className="dark:hidden">
            ☀️
          </span>
          <span aria-hidden className="hidden dark:inline">
            🌙
          </span>
        </span>
      </span>
    </button>
  );
}
