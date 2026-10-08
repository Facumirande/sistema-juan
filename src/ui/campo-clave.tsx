"use client";

import { useState, type InputHTMLAttributes } from "react";

/** Contraseña con un botón para verla mientras se escribe (evita errores de tipeo sin pedir repetirla). */
export function CampoClave({ etiqueta, ayuda, ...input }: InputHTMLAttributes<HTMLInputElement> & { etiqueta: string; ayuda?: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="flex flex-col gap-1">
      <span className="font-medium">
        {etiqueta}
        {input.required && <span className="text-error"> *</span>}
      </span>
      <span className="flex gap-2">
        <input
          {...input}
          type={visible ? "text" : "password"}
          autoCapitalize="none"
          spellCheck={false}
          className="h-12 min-w-0 flex-1 rounded-lg border border-borde bg-superficie px-3 text-base"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          className="h-12 shrink-0 rounded-lg border border-borde px-3 font-medium"
        >
          {visible ? "Ocultar" : "Ver"}
        </button>
      </span>
      {ayuda && <span className="text-sm text-texto-suave">{ayuda}</span>}
    </label>
  );
}
