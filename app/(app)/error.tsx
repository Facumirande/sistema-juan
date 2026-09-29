"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Si una pantalla falla por un problema del sistema (la base no responde, un error de
 * programación), se explica qué hacer en vez de mostrar el error técnico.
 */
export default function ErrorDePantalla({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <section role="alert" className="mx-auto flex w-full max-w-2xl flex-col items-center gap-5 rounded-2xl border border-borde bg-superficie p-6 text-center sm:p-10">
      <span aria-hidden className="text-6xl leading-none">
        🛠️
      </span>
      <h1 className="text-2xl font-semibold">Esta pantalla no se pudo abrir</h1>
      <p className="text-lg text-texto-suave">
        Es un problema del sistema, no algo que hayas hecho mal. Probá de nuevo; si sigue pasando, avisale a Facundo qué estabas haciendo
        {error.digest ? ` y este código: ${error.digest}` : ""}.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" onClick={() => retry()} className="min-h-12 rounded-xl bg-marca px-5 text-lg font-semibold text-marca-texto">
          Probar de nuevo
        </button>
        <Link href="/inicio" className="flex min-h-12 items-center rounded-xl border-2 border-borde px-5 text-lg font-semibold">
          Ir al tablero
        </Link>
      </div>
    </section>
  );
}
