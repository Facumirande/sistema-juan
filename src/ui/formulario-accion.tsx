"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef, useState, type ReactNode } from "react";

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
 * botón pasa a "Confirmar" y el reenvío lleva `confirmarVariacion`. Antes de enviar revisa los
 * casilleros obligatorios (`required`): los que quedaron vacíos se marcan en rojo y no se envía.
 */
export function FormularioAccion({ accion, boton, variante = "principal", confirmar, enLinea, className, children }: Props) {
  const [estado, ejecutar, enviando] = useActionState(accion, ESTADO_INICIAL);
  const formulario = useRef<HTMLFormElement>(null);
  const [faltan, setFaltan] = useState(0);

  /** Marca en rojo los obligatorios vacíos, lleva al primero y dice si se puede enviar. */
  const estaCompleto = (form: HTMLFormElement): boolean => {
    const obligatorios = [...form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("[required]")].filter((el) => !el.disabled);
    const vacio = (el: (typeof obligatorios)[number]) =>
      el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio") ? ![...form.querySelectorAll<HTMLInputElement>("input")].some((otro) => otro.name === el.name && otro.checked) : !el.value.trim();
    const vacios = obligatorios.filter(vacio);
    for (const el of obligatorios) el.setAttribute("aria-invalid", String(vacios.includes(el)));
    setFaltan(vacios.length);
    const primero = vacios[0];
    if (primero) {
      // Si está dentro de algo plegado ("Más opciones"), se abre para que se vea.
      for (let d = primero.closest("details"); d; d = d.parentElement?.closest("details") ?? null) d.open = true;
      primero.focus();
    }
    return vacios.length === 0;
  };

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
      {estado.enlace && (
        <Link href={estado.enlace.href} className="mt-2 inline-flex min-h-10 items-center rounded-lg bg-marca px-3 font-semibold text-marca-texto">
          {estado.enlace.texto}{"\u00a0→"}
        </Link>
      )}
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
        if (!estaCompleto(evento.currentTarget)) return;
        if (confirmar && !window.confirm(confirmar)) return;
        const datos = new FormData(evento.currentTarget);
        startTransition(() => ejecutar(datos));
      }}
      onInput={(evento) => {
        // Apenas se completa un casillero marcado, deja de estar en rojo.
        const el = evento.target as HTMLElement;
        if (el.getAttribute("aria-invalid") !== "true") return;
        el.setAttribute("aria-invalid", "false");
        setFaltan(evento.currentTarget.querySelectorAll('[aria-invalid="true"]').length);
      }}
      className={className ?? (enLinea ? "flex flex-wrap items-end gap-2" : "flex flex-col gap-4")}
      noValidate
    >
      {children}
      {estado.requiereConfirmacion && <input type="hidden" name="confirmarVariacion" value="on" />}
      {faltan > 0 && (
        <p role="alert" className={`font-semibold text-error ${enLinea ? "w-full text-sm" : ""}`}>
          Falta completar {faltan === 1 ? "el casillero marcado" : `los ${faltan} casilleros marcados`} en rojo.
        </p>
      )}
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
