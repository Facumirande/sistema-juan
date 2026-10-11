"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * Ventana encima del tablero (la tarjeta abierta). La tarjeta queda quieta en su lugar, con un
 * margen alrededor (también en el celular), y lo que se desliza es su contenido, por dentro
 * (pedido del usuario, 08/10/2026). Se cierra con el botón flotante ✕, tocando afuera o con Escape.
 */
export function Modal({ cerrar, titulo, children }: { cerrar: string; titulo: string; children: ReactNode }) {
  const router = useRouter();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") router.push(cerrar, { scroll: false });
    };
    window.addEventListener("keydown", alTeclear);
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => {
      window.removeEventListener("keydown", alTeclear);
      document.body.style.overflow = antes;
    };
  }, [cerrar, router]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/60 p-2.5 sm:p-6" role="dialog" aria-modal="true" aria-label={titulo}>
      <Link href={cerrar} scroll={false} tabIndex={-1} aria-hidden className="absolute inset-0 cursor-default" />
      <div ref={panel} tabIndex={-1} className="tarjeta-abriendose relative flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-modal text-tarjeta-texto shadow-2xl ring-1 ring-black/10 outline-none dark:ring-white/10">
        <Link
          href={cerrar}
          scroll={false}
          aria-label="Cerrar la tarjeta"
          title="Cerrar"
          className="absolute top-2 right-2 z-30 flex size-11 items-center justify-center rounded-full bg-black/10 text-2xl leading-none font-bold text-tarjeta-texto shadow-sm backdrop-blur hover:bg-black/20 dark:bg-white/15 dark:hover:bg-white/25"
        >
          ✕
        </Link>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin]">{children}</div>
      </div>
    </div>
  );
}
