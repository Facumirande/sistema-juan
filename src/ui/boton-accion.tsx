"use client";

import Link from "next/link";
import { startTransition, useActionState, type ReactNode } from "react";

import { ESTADO_INICIAL, type EstadoAccion } from "./estado-accion";

// Un botón que llama a una acción de servidor con algunos datos fijos (borrar una nota, elegir una
// prioridad, mandar un pedido en camino). Si falla, muestra el motivo al lado con el botón para
// arreglarlo; si el servidor pide confirmar, ofrece "Confirmar"; si se pide, también muestra el
// resultado cuando sale bien.

export function BotonAccion({
  accion,
  datos,
  children,
  className = "",
  confirmar,
  titulo,
  mostrarExito = false,
}: {
  accion: (estado: EstadoAccion, datos: FormData) => Promise<EstadoAccion>;
  datos: Record<string, string | string[]>;
  children: ReactNode;
  className?: string;
  confirmar?: string;
  titulo?: string;
  /** Muestra el mensaje también cuando sale bien (ej. "Salió el reparto…" con su enlace). */
  mostrarExito?: boolean;
}) {
  const [estado, ejecutar, enviando] = useActionState(accion, ESTADO_INICIAL);
  const enviar = (confirmado: boolean) => {
    const fd = new FormData();
    for (const [clave, valor] of Object.entries(datos)) for (const v of Array.isArray(valor) ? valor : [valor]) fd.append(clave, v);
    if (confirmado) fd.append("confirmarVariacion", "on");
    startTransition(() => ejecutar(fd));
  };
  const visible = estado.mensaje && (!estado.ok || mostrarExito);
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        title={titulo}
        disabled={enviando}
        aria-busy={enviando}
        className={`disabled:animate-pulse disabled:opacity-60 ${className}`}
        onClick={() => {
          if (confirmar && !window.confirm(confirmar)) return;
          enviar(false);
        }}
      >
        {enviando ? "Un momento…" : children}
      </button>
      {visible && (
        <span role={estado.ok ? "status" : "alert"} className={`mt-1 flex flex-col gap-1 text-sm ${estado.ok ? "font-medium" : "text-error"}`}>
          {estado.mensaje}
          {estado.requiereConfirmacion && (
            <button type="button" disabled={enviando} onClick={() => enviar(true)} className="flex min-h-10 items-center justify-center rounded-lg bg-marca px-3 font-semibold text-marca-texto disabled:opacity-60">
              Confirmar
            </button>
          )}
          {estado.enlace && (
            <Link href={estado.enlace.href} className="flex min-h-10 items-center justify-center rounded-lg border border-marca px-3 font-semibold">
              {estado.enlace.texto}{"\u00a0→"}
            </Link>
          )}
        </span>
      )}
    </span>
  );
}
