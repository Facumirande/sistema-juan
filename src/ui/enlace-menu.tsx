"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";

import type { EstadoEtapa } from "@/dominio/jornadas/etapas";

import { FlechaNavegacion } from "./iconos";
import { ICONO_NAVEGACION } from "./navegacion";

// Los enlaces del menú de la izquierda, marcados cuando son la pantalla en la que se está. Al
// tocarlos reaccionan enseguida (un circulito que gira) aunque la pantalla todavía esté llegando.

/** Pantallas cuyas subpáginas no las marcan (ej. "/balance/movimientos" no marca "Balance"). */
const SOLO_EXACTA = ["/inicio", "/balance", "/entregas/remitos"];

function Icono({ icono }: { icono: string }) {
  return icono === ICONO_NAVEGACION ? <FlechaNavegacion /> : <>{icono}</>;
}

/** ¿El enlace es la pantalla actual? Compara solo el camino (sin "?fecha=…"). */
function esActual(ruta: string, href: string): boolean {
  const camino = href.split("?")[0]!;
  return ruta === camino || (!SOLO_EXACTA.includes(camino) && ruta.startsWith(`${camino}/`));
}

/** Mientras se está yendo a esa pantalla. Va dentro del enlace. */
function Yendo() {
  const { pending } = useLinkStatus();
  return pending ? <span aria-label="Cargando" className="ml-auto size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null;
}

export function EnlaceDeMenu({ href, icono, etiqueta, destacado }: { href: string; icono: string; etiqueta: string; destacado?: boolean }) {
  const ruta = usePathname();
  const activo = !href.includes("?") && esActual(ruta, href);
  if (destacado) {
    return (
      <Link
        href={href}
        aria-current={activo ? "page" : undefined}
        className="my-1 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-marca px-3 text-base font-semibold text-marca-texto shadow-sm hover:opacity-90 active:scale-[0.98]"
      >
        <span aria-hidden className="text-lg leading-none">
          <Icono icono={icono} />
        </span>
        {etiqueta}
        <Yendo />
      </Link>
    );
  }
  return (
    <Link
      href={href}
      aria-current={activo ? "page" : undefined}
      className={`flex min-h-11 items-center gap-3 rounded-lg px-3 active:scale-[0.98] ${activo ? "bg-marca/15 font-semibold" : "font-medium hover:bg-fondo"}`}
    >
      <span aria-hidden className="w-6 text-center text-lg leading-none">
        <Icono icono={icono} />
      </span>
      {etiqueta}
      <Yendo />
    </Link>
  );
}

const MARCA: Readonly<Record<EstadoEtapa, { texto: string; clases: string; leer: string }>> = {
  hecho: { texto: "✓", clases: "bg-[var(--listo-fondo)] text-[var(--listo-texto)]", leer: "hecho" },
  actual: { texto: "●", clases: "bg-marca text-marca-texto", leer: "toca ahora" },
  en_curso: { texto: "…", clases: "bg-[var(--pastel-amarillo)] text-[var(--pastel-amarillo-texto)]", leer: "a medias" },
  pendiente: { texto: "", clases: "border-2 border-borde bg-superficie", leer: "falta" },
};

/** Una etapa del día en el menú: el estado en un círculo, el nombre y su avance en pocas palabras. */
export function EnlaceDeEtapa({ href, icono, etiqueta, estado, detalle }: { href: string; icono: string; etiqueta: string; estado: EstadoEtapa; detalle: string | null }) {
  const ruta = usePathname();
  const activo = esActual(ruta, href);
  const marca = MARCA[estado];
  return (
    <Link
      href={href}
      aria-current={activo ? "page" : undefined}
      className={`relative flex min-h-11 items-center gap-2 rounded-lg py-1 pr-2 pl-1 ${activo ? "bg-marca/15" : "hover:bg-fondo"} ${estado === "actual" ? "font-semibold" : "font-medium"}`}
    >
      <span className={`z-10 flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${marca.clases}`}>
        <span aria-hidden>{marca.texto}</span>
        <span className="sr-only">{marca.leer}</span>
      </span>
      <span aria-hidden className="w-5 text-center leading-none">
        <Icono icono={icono} />
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        {etiqueta}
        {detalle && <span className="block text-xs font-normal text-texto-suave">{detalle}</span>}
      </span>
      <Yendo />
    </Link>
  );
}
