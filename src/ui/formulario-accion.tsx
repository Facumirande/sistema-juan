"use client";

import { startTransition, useActionState, useEffect, useRef, type ReactNode } from "react";

import { ESTADO_INICIAL, type EstadoAccion } from "./estado-accion";
import { clasesBoton, type VarianteBoton } from "./formularios";

interface Props {
  accion: (estado: EstadoAccion, datos: FormData) => Promise<EstadoAccion>;
  boton: string;
  variante?: VarianteBoton;
  /** Pregunta antes de enviar (acciones que cortan el acceso de alguien o que no se deshacen). */
  confirmar?: string;
  /** Campos y botón en una sola fila (ediciones rápidas dentro de una tabla). */
  enLinea?: boolean;
  className?: string;
  children?: ReactNode;
}

/**
 * Formulario que llama a una acción de servidor y muestra su resultado junto al botón. Si la
 * acción falla, lo escrito queda como estaba para corregirlo; si sale bien, el formulario vuelve
 * a sus valores iniciales (que ya son los datos nuevos). Si el servidor pide confirmación, el
 * botón pasa a "Confirmar" y el reenvío lleva `confirmarVariacion`.
 */
export function FormularioAccion({ accion, boton, variante = "principal", confirmar, enLinea, className, children }: Props) {
  const [estado, ejecutar, enviando] = useActionState(accion, ESTADO_INICIAL);
  const formulario = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (estado.ok) formulario.current?.reset();
  }, [estado]);

  const mensaje = estado.mensaje && (
    <div
      role={estado.ok ? "status" : "alert"}
      className={`rounded-lg border px-3 py-2 ${enLinea ? "w-full text-sm" : ""} ${estado.ok ? "border-marca" : "border-error text-error"}`}
    >
      <p>{estado.mensaje}</p>
      {estado.detalle?.map((linea) => (
        <p key={linea} className="font-mono text-lg font-semibold">
          {linea}
        </p>
      ))}
    </div>
  );
  const botonEnviar = (
    <button type="submit" disabled={enviando} className={clasesBoton(estado.requiereConfirmacion ? "principal" : variante)}>
      {enviando ? "Un momento…" : estado.requiereConfirmacion ? "Confirmar" : boton}
    </button>
  );

  return (
    <form
      ref={formulario}
      onSubmit={(evento) => {
        evento.preventDefault();
        if (confirmar && !window.confirm(confirmar)) return;
        const datos = new FormData(evento.currentTarget);
        startTransition(() => ejecutar(datos));
      }}
      className={className ?? (enLinea ? "flex flex-wrap items-end gap-2" : "flex flex-col gap-4")}
      noValidate
    >
      {children}
      {estado.requiereConfirmacion && <input type="hidden" name="confirmarVariacion" value="on" />}
      {enLinea ? (
        <>
          {botonEnviar}
          {mensaje}
        </>
      ) : (
        <>
          {mensaje}
          <div>{botonEnviar}</div>
        </>
      )}
    </form>
  );
}
