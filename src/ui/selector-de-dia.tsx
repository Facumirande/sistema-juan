import Link from "next/link";

import { sumarDias } from "@/dominio/fechas/fechas";
import { fechaConDia } from "@/ui/etiquetas";

// Los días para elegir en qué jornada se trabaja (como el selector de tableros de Trello): hoy,
// mañana y los que tienen pedidos, cada uno con cuántos pedidos tiene. Lo usan el tablero, el paso
// a paso y la lista de compras.

export interface DiaParaElegir {
  fecha: string;
  estado: string | null;
  pedidos: number;
}

/** "Hoy", "Mañana", "Ayer" o el día de la semana abreviado ("jue"). */
export function nombreDelDia(fecha: string, hoy: string): string {
  if (fecha === hoy) return "Hoy";
  if (fecha === sumarDias(hoy, 1)) return "Mañana";
  if (fecha === sumarDias(hoy, -1)) return "Ayer";
  return fechaConDia(fecha).split(" ")[0]!.slice(0, 3);
}

export function SelectorDeDia({
  dias,
  fecha,
  hoy,
  enlace,
  sobreFondo = false,
  compacto = false,
}: {
  dias: readonly DiaParaElegir[];
  fecha: string;
  hoy: string;
  /** A dónde lleva cada día. */
  enlace: (fecha: string) => string;
  /** Va sobre el fondo con imagen del tablero (botones blancos translúcidos). */
  sobreFondo?: boolean;
  /**
   * Dentro del tablero: en el celular cada día ocupa un solo renglón (el nombre y, en un globito,
   * cuántos pedidos tiene), para dejarle el lugar a las columnas; con más ancho se ve completo.
   */
  compacto?: boolean;
}) {
  const forma = compacto
    ? "min-h-11 gap-2 px-3 @[34rem]/tablero:min-h-14 @[34rem]/tablero:min-w-24 @[34rem]/tablero:flex-col @[34rem]/tablero:gap-0 @[34rem]/tablero:py-1"
    : "min-h-14 min-w-24 flex-col px-3 py-1";
  return (
    <nav aria-label="Elegir el día" className="sin-barra -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {dias.map((x) => {
        const elegido = x.fecha === fecha;
        const clases = sobreFondo
          ? elegido
            ? "bg-white text-[#172b4d] shadow-md"
            : "bg-white/20 text-white hover:bg-white/30"
          : elegido
            ? "border border-marca bg-marca text-marca-texto"
            : "border border-borde bg-superficie hover:border-marca/60";
        const cuantos = x.estado === "CERRADA" ? "Cerrado" : x.pedidos > 0 ? `${x.pedidos} ${x.pedidos === 1 ? "pedido" : "pedidos"}` : "Sin pedidos";
        return (
          <Link key={x.fecha} href={enlace(x.fecha)} aria-current={elegido ? "date" : undefined} className={`flex shrink-0 items-center justify-center rounded-xl text-center ${forma} ${clases}`}>
            <span className="font-semibold whitespace-nowrap capitalize">
              {nombreDelDia(x.fecha, hoy)} {x.fecha.slice(8, 10)}/{x.fecha.slice(5, 7)}
            </span>
            {compacto && (
              <span aria-hidden className="rounded-full bg-black/15 px-2 text-sm leading-6 font-bold @[34rem]/tablero:hidden">
                {x.estado === "CERRADA" ? "🔒" : x.pedidos}
              </span>
            )}
            <span className={`text-sm ${elegido || sobreFondo ? "opacity-90" : "text-texto-suave"} ${compacto ? "sr-only @[34rem]/tablero:not-sr-only" : ""}`}>{cuantos}</span>
          </Link>
        );
      })}
      <Link
        href="/jornadas"
        aria-label="Otros días"
        className={`flex shrink-0 items-center justify-center gap-1 rounded-xl px-3 text-sm font-semibold ${compacto ? "min-h-11 @[34rem]/tablero:min-h-14" : "min-h-14"} ${sobreFondo ? "bg-white/20 text-white hover:bg-white/30" : "border border-borde bg-superficie"}`}
      >
        <span aria-hidden>📅</span>
        <span className={compacto ? "hidden @[34rem]/tablero:inline" : ""}>Otros días</span>
      </Link>
    </nav>
  );
}
