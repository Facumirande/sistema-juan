"use client";

import { useActionState } from "react";

import { CampoClave } from "@/ui/campo-clave";

import { ingresar, type EstadoIngreso } from "./acciones";

const estadoInicial: EstadoIngreso = { error: null, identificador: "" };

export function FormularioIngreso() {
  const [estado, accion, enviando] = useActionState(ingresar, estadoInicial);

  return (
    <form action={accion} className="flex flex-col gap-4" noValidate>
      <label className="flex flex-col gap-1">
        <span className="font-medium">Usuario</span>
        <input
          name="identificador"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          defaultValue={estado.identificador}
          required
          className="h-12 rounded-lg border border-borde bg-superficie px-3 text-base"
        />
      </label>
      <CampoClave etiqueta="Contraseña" name="clave" autoComplete="current-password" required />
      {estado.error && (
        <p role="alert" className="rounded-lg border border-error px-3 py-2 text-error">
          {estado.error}
        </p>
      )}
      <button
        type="submit"
        disabled={enviando}
        className="h-12 rounded-lg bg-marca font-semibold text-marca-texto disabled:opacity-60"
      >
        {enviando ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
