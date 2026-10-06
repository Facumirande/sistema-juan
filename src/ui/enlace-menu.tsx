"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";

// Un enlace del menú de la izquierda, marcado cuando es la pantalla en la que se está. Al tocarlo
// reacciona enseguida (un circulito que gira) aunque la pantalla todavía esté llegando.

/** Pantallas cuyas subpáginas no las marcan (ej. "/balance/movimientos" no marca "Balance"). */
const SOLO_EXACTA = ["/inicio", "/balance"];

/** Mientras se está yendo a esa pantalla. Va dentro del enlace. */
function Yendo() {
  const { pending } = useLinkStatus();
  return pending ? <span aria-label="Cargando" className="ml-auto size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null;
}

export function EnlaceDeMenu({ href, icono, etiqueta, destacado }: { href: string; icono: string; etiqueta: string; destacado?: boolean }) {
  const ruta = usePathname();
  const activo = !href.includes("?") && (ruta === href || (!SOLO_EXACTA.includes(href) && ruta.startsWith(`${href}/`)));
  if (destacado) {
    return (
      <Link
        href={href}
        aria-current={activo ? "page" : undefined}
        className="my-1 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-marca px-3 text-base font-semibold text-marca-texto shadow-sm hover:opacity-90 active:scale-[0.98]"
      >
        <span aria-hidden className="text-lg leading-none">
          {icono}
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
        {icono}
      </span>
      {etiqueta}
      <Yendo />
    </Link>
  );
}
