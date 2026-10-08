"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * Ventana encima del tablero (la tarjeta abierta). Se cierra con ×, tocando afuera o con Escape. En
 * el celular ocupa toda la pantalla, como una pantalla más: arriba queda siempre a la vista la
 * barra para volver al tablero.
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
    <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-black/60 sm:px-4 sm:py-10" role="dialog" aria-modal="true" aria-label={titulo}>
      <Link href={cerrar} scroll={false} tabIndex={-1} aria-hidden className="fixed inset-0 cursor-default" />
      <div ref={panel} tabIndex={-1} className="relative mx-auto min-h-full w-full max-w-5xl bg-modal text-tarjeta-texto shadow-2xl outline-none sm:min-h-0 sm:rounded-xl">
        <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-black/10 bg-modal px-2 py-1.5 sm:hidden dark:border-white/10">
          <Link href={cerrar} scroll={false} className="flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-3 text-lg font-bold hover:bg-black/10 dark:hover:bg-white/10">
            ← Tablero
          </Link>
          <span className="min-w-0 flex-1 truncate text-right text-sm text-tarjeta-suave">{titulo}</span>
        </div>
        <Link
          href={cerrar}
          scroll={false}
          aria-label="Cerrar"
          className="absolute top-2 right-2 z-10 hidden size-10 items-center justify-center rounded-full text-2xl text-tarjeta-suave hover:bg-black/10 sm:flex dark:hover:bg-white/10"
        >
          ×
        </Link>
        {children}
      </div>
    </div>
  );
}
