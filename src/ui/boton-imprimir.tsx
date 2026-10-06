"use client";

import { useEffect } from "react";

import { clasesBoton } from "./formularios";

/** Abre el diálogo de impresión del navegador (A4, 09 §6). No sale en el papel. */
export function BotonImprimir() {
  return (
    <button type="button" onClick={() => window.print()} className={`${clasesBoton("principal")} print:hidden`}>
      Imprimir
    </button>
  );
}

/** Abre el diálogo de impresión apenas se ve la hoja (cuando se llega desde un botón "Imprimir"). */
export function ImprimirAlAbrir() {
  useEffect(() => {
    const espera = window.setTimeout(() => window.print(), 300);
    return () => window.clearTimeout(espera);
  }, []);
  return null;
}
