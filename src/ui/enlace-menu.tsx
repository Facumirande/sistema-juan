"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Un enlace del menú de la izquierda, marcado cuando es la pantalla en la que se está.

/** Pantallas cuyas subpáginas tienen su propio lugar en el menú (ej. "/pedidos/nuevo" no marca "Lista de pedidos"). */
const SOLO_EXACTA = ["/inicio", "/pedidos", "/balance"];

export function EnlaceDeMenu({ href, icono, etiqueta, destacado }: { href: string; icono: string; etiqueta: string; destacado?: boolean }) {
  const ruta = usePathname();
  const activo = !href.includes("?") && (ruta === href || (!SOLO_EXACTA.includes(href) && ruta.startsWith(`${href}/`)));
  if (destacado) {
    return (
      <Link
        href={href}
        aria-current={activo ? "page" : undefined}
        className="my-1 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-marca px-3 text-base font-semibold text-marca-texto shadow-sm hover:opacity-90"
      >
        <span aria-hidden className="text-lg leading-none">
          {icono}
        </span>
        {etiqueta}
      </Link>
    );
  }
  return (
    <Link
      href={href}
      aria-current={activo ? "page" : undefined}
      className={`flex min-h-11 items-center gap-3 rounded-lg px-3 ${activo ? "bg-marca/15 font-semibold" : "font-medium hover:bg-fondo"}`}
    >
      <span aria-hidden className="w-6 text-center text-lg leading-none">
        {icono}
      </span>
      {etiqueta}
    </Link>
  );
}
