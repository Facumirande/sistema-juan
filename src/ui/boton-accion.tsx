"use client";

import { startTransition, useActionState, type ReactNode } from "react";

import { ESTADO_INICIAL, type EstadoAccion } from "./estado-accion";

// Un botón chico que llama a una acción de servidor con algunos datos fijos (borrar una nota,
// elegir una prioridad, asignar a alguien). Si falla, muestra el motivo al lado.

export function BotonAccion({
  accion,
  datos,
  children,
  className = "",
  confirmar,
  titulo,
}: {
  accion: (estado: EstadoAccion, datos: FormData) => Promise<EstadoAccion>;
  datos: Record<string, string | string[]>;
  children: ReactNode;
  className?: string;
  confirmar?: string;
  titulo?: string;
}) {
  const [estado, ejecutar, enviando] = useActionState(accion, ESTADO_INICIAL);
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        title={titulo}
        disabled={enviando}
        className={`disabled:opacity-60 ${className}`}
        onClick={() => {
          if (confirmar && !window.confirm(confirmar)) return;
          const fd = new FormData();
          for (const [clave, valor] of Object.entries(datos)) for (const v of Array.isArray(valor) ? valor : [valor]) fd.append(clave, v);
          startTransition(() => ejecutar(fd));
        }}
      >
        {children}
      </button>
      {estado.mensaje && !estado.ok && (
        <span role="alert" className="text-xs text-error">
          {estado.mensaje}
        </span>
      )}
    </span>
  );
}
