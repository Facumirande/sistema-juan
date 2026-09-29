"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

/** Ventana encima del tablero (la tarjeta abierta). Se cierra con ×, tocando afuera o con Escape. */
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
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 sm:px-4 sm:py-10" role="dialog" aria-modal="true" aria-label={titulo}>
      <Link href={cerrar} scroll={false} tabIndex={-1} aria-hidden className="fixed inset-0 cursor-default" />
      <div ref={panel} tabIndex={-1} className="relative mx-auto min-h-full w-full max-w-3xl bg-modal text-tarjeta-texto shadow-2xl outline-none sm:min-h-0 sm:rounded-xl">
        <Link
          href={cerrar}
          scroll={false}
          aria-label="Cerrar"
          className="absolute top-2 right-2 z-10 flex size-10 items-center justify-center rounded-full text-2xl text-tarjeta-suave hover:bg-black/10 dark:hover:bg-white/10"
        >
          ×
        </Link>
        {children}
      </div>
    </div>
  );
}
