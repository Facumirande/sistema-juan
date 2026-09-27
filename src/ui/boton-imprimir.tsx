"use client";

import { clasesBoton } from "./formularios";

/** Abre el diálogo de impresión del navegador (A4, 09 §6). No sale en el papel. */
export function BotonImprimir() {
  return (
    <button type="button" onClick={() => window.print()} className={`${clasesBoton("principal")} print:hidden`}>
      Imprimir
    </button>
  );
}
