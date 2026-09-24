"use client";

import { useActionState } from "react";

import { ingresar, type EstadoIngreso } from "./acciones";

const estadoInicial: EstadoIngreso = { error: null, email: "" };

export function FormularioIngreso() {
  const [estado, accion, enviando] = useActionState(ingresar, estadoInicial);

  return (
    <form action={accion} className="flex flex-col gap-4" noValidate>
      <label className="flex flex-col gap-1">
        <span className="font-medium">Correo electrónico</span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          defaultValue={estado.email}
          required
          className="h-12 rounded-lg border border-borde bg-superficie px-3 text-base"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-medium">Contraseña</span>
        <input
          name="clave"
          type="password"
          autoComplete="current-password"
          required
          className="h-12 rounded-lg border border-borde bg-superficie px-3 text-base"
        />
      </label>
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
        {enviando ? "Ingresando…" : "Ingresar"}
      </button>
    </form>
  );
}
