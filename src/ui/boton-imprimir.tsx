"use client";

import { useEffect } from "react";

import { clasesBoton } from "./formularios";

/**
 * Abre el diálogo de impresión del navegador (A4, 09 §6). No sale en el papel. Con `automatico`
 * (cuando se llega desde un botón "Imprimir"), lo abre solo al terminar de cargar.
 */
export function BotonImprimir({ automatico = false, texto = "🖨️ Imprimir" }: { automatico?: boolean; texto?: string }) {
  useEffect(() => {
    if (!automatico) return;
    const t = window.setTimeout(() => window.print(), 300);
    return () => window.clearTimeout(t);
  }, [automatico]);
  return (
    <button type="button" onClick={() => window.print()} className={`${clasesBoton("principal")} print:hidden`}>
      {texto}
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
