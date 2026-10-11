import { Suspense } from "react";

import { COLUMNAS_A_LA_VISTA } from "@/dominio/pedidos/tablero";

import { DiaQueLlega } from "./dia-que-llega";

/** El color de cada columna, el mismo del tablero (clases de `globals.css`). */
const COLOR: Readonly<Record<string, string>> = {
  pedidos: "color-azul",
  en_lista: "color-violeta",
  comprados: "color-naranja",
  preparando: "color-amarillo",
  en_camino: "color-verde",
  entregados: "color-rosa",
};

/**
 * Lo que se ve mientras llega el tablero de un día (al entrar, al cambiar de día, al abrir una
 * tarjeta): su misma silueta, con el fondo y las columnas de color en su lugar y el día al que se
 * está yendo, en vez de una pantalla gris. Así el cambio de día responde en el momento y no hay un
 * salto de una pantalla a otra.
 */
export default function CargandoElTablero() {
  const barra = "animate-pulse rounded-xl bg-white/25";
  return (
    <div className="a-pantalla-completa @container/tablero -m-3 flex h-[calc(100dvh-3rem)] flex-col gap-2 overflow-hidden p-3 [background:var(--tablero-fondo)] sm:-m-4 sm:h-[calc(100dvh-3.5rem)] sm:gap-3 sm:px-4" role="status" aria-label="Cargando el tablero">
      <Suspense fallback={<p className="min-h-9 shrink-0" />}>
        <DiaQueLlega />
      </Suspense>
      <div className="flex shrink-0 gap-1.5">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className={`${barra} h-12 w-[3.6rem] shrink-0`} />
        ))}
      </div>
      <div className={`${barra} h-12 shrink-0 @[34rem]/tablero:hidden`} />
      <div className="flex min-h-0 flex-1 gap-2 overflow-hidden">
        {COLUMNAS_A_LA_VISTA.map((c, i) => (
          <div key={c.clave} className={`${COLOR[c.clave]} flex h-full w-[88%] shrink-0 flex-col gap-2 rounded-2xl bg-[var(--col)] p-2 opacity-80 @[34rem]/tablero:w-auto @[34rem]/tablero:min-w-0 @[34rem]/tablero:flex-1`}>
            <p className="px-1 text-lg leading-tight font-extrabold text-[var(--col-texto)]">{c.titulo}</p>
            {i < 3 && <div className="h-24 animate-pulse rounded-xl bg-white/45" />}
          </div>
        ))}
      </div>
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
