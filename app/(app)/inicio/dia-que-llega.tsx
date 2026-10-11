"use client";

import { useSearchParams } from "next/navigation";

import { useDiaEnCurso } from "@/ui/dia-en-curso";
import { fechaConDia } from "@/ui/etiquetas";

/**
 * Mientras llega el tablero: el día al que se está yendo, en grande. Es el de la dirección
 * ("?fecha=…") o, si no lo dice, el que se eligió por última vez.
 */
export function DiaQueLlega() {
  const pedida = useSearchParams().get("fecha");
  const elegido = useDiaEnCurso(null);
  const fecha = pedida && /^\d{4}-\d{2}-\d{2}$/.test(pedida) ? pedida : elegido;
  return <p className="min-h-9 shrink-0 text-2xl leading-tight font-extrabold text-white first-letter:uppercase sm:text-3xl">{fecha ? fechaConDia(fecha) : " "}</p>;
}
