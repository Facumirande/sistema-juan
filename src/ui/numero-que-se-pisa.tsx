"use client";

import { useRef, useState, type InputHTMLAttributes } from "react";

// Un casillero que ya trae un número cargado (el último precio, la cantidad que se propone, lo que se
// debe) y que se pisa al escribir (pedido del usuario, 12/10/2026: al cambiar un precio en el celular,
// lo nuevo se pegaba a lo que ya había). Al tocarlo queda vacío, con lo que tenía a la vista en gris:
// lo que se escribe lo reemplaza entero. Si se sale sin escribir nada, vuelve a quedar como estaba.
// No depende de que el teléfono seleccione el texto al tocar, que en el iPhone y en algunos Android
// no pasa.

/**
 * Lo mismo para un casillero suelto de un formulario (el que llega con su valor en `defaultValue`: la
 * ganancia en %, la caja inicial, la cantidad preparada): al tocarlo se vacía y muestra en gris lo que
 * tenía; si no se escribe nada, lo recupera al salir (o al dar Enter, antes de que salga el formulario).
 */
export function EntradaQueSePisa({ onFocus, onInput, onBlur, onKeyDown, placeholder, ...resto }: InputHTMLAttributes<HTMLInputElement>) {
  // Lo que había al tocarlo, mientras no se escribió nada encima.
  const guardado = useRef<string | null>(null);
  const recuperar = (el: HTMLInputElement) => {
    if (guardado.current !== null) el.value = guardado.current;
    guardado.current = null;
    el.placeholder = placeholder ?? "";
  };
  return (
    <input
      {...resto}
      placeholder={placeholder}
      onFocus={(e) => {
        const el = e.currentTarget;
        if (el.value !== "" && !el.readOnly) {
          guardado.current = el.value;
          el.placeholder = el.value;
          el.value = "";
        }
        onFocus?.(e);
      }}
      onInput={(e) => {
        guardado.current = null;
        onInput?.(e);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") recuperar(e.currentTarget);
        onKeyDown?.(e);
      }}
      onBlur={(e) => {
        recuperar(e.currentTarget);
        onBlur?.(e);
      }}
    />
  );
}

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange"> & {
  valor: string;
  alCambiar: (texto: string) => void;
};

export function NumeroQueSePisa({ valor, alCambiar, placeholder, name, onFocus, onBlur, onKeyDown, ...resto }: Props) {
  // Recién tocado y todavía sin escribir: se muestra vacío y lo que había pasa a ser la pista.
  const [intacto, setIntacto] = useState(false);
  return (
    <>
      {/* En un formulario viaja el valor de verdad, aunque el casillero se esté mostrando vacío. */}
      {name && <input type="hidden" name={name} value={valor} />}
      <input
        inputMode="decimal"
        autoComplete="off"
        {...resto}
        value={intacto ? "" : valor}
        placeholder={intacto && valor ? valor : placeholder}
        onFocus={(e) => {
          setIntacto(valor !== "");
          onFocus?.(e);
        }}
        onChange={(e) => {
          setIntacto(false);
          alCambiar(e.target.value);
        }}
        onKeyDown={(e) => {
          // Enter guarda lo que había: el casillero vuelve a mostrarlo antes de que salga el formulario.
          if (e.key === "Enter") setIntacto(false);
          onKeyDown?.(e);
        }}
        onBlur={(e) => {
          setIntacto(false);
          onBlur?.(e);
        }}
      />
    </>
  );
}
