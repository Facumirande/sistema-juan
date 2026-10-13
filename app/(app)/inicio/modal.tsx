"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

import Link from "@/ui/enlace";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/60 p-2.5 pt-[calc(0.625rem+var(--arriba-seguro))] sm:p-6 sm:pt-[calc(1.5rem+var(--arriba-seguro))]" role="dialog" aria-modal="true" aria-label={titulo}>
      <Link href={cerrar} scroll={false} tabIndex={-1} aria-hidden className="absolute inset-0 cursor-default" />
      <div ref={panel} tabIndex={-1} className="tarjeta-abriendose relative flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-modal text-tarjeta-texto shadow-2xl ring-1 ring-black/10 outline-none dark:ring-white/10">
        <Link
          href={cerrar}
          scroll={false}
          aria-label="Cerrar la tarjeta"
          title="Cerrar"
          // Corrido de la esquina redondeada y de la barra de desplazamiento, y con fondo liso para que se lea sobre lo que pasa por detrás.
          className="absolute top-3 right-5 z-30 flex size-11 items-center justify-center rounded-full bg-modal text-2xl leading-none font-bold text-tarjeta-texto shadow-md ring-1 ring-black/15 hover:brightness-95 dark:ring-white/25 dark:hover:brightness-125"
        >
          ✕
        </Link>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin]">{children}</div>
      </div>
    </div>
  );
}
