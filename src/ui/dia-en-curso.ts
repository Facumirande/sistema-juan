"use client";

import { useSyncExternalStore } from "react";

// El día en el que se está trabajando, del lado del navegador. Al elegir un día (en la fila de días,
// en el calendario, con ‹ › en el menú o al abrir una pantalla de un día) se guarda en la cookie
// `dia` (la que leen las pantallas que se abren sin decir el día, `src/ui/dia-elegido.ts`) y se le
// avisa enseguida al menú, que cambia de día en el momento, sin esperar a que llegue la pantalla ni
// volver a pedirla entera (pedido del usuario, 10/10/2026: que el menú no demore al cambiar de día).

const DOCE_HORAS = 12 * 60 * 60;

/** El día elegido en esta pestaña; nulo mientras no se eligió ninguno (vale el que mandó el servidor). */
let elegido: string | null = null;
const oyentes = new Set<() => void>();

const suscribir = (avisar: () => void) => {
  oyentes.add(avisar);
  return () => {
    oyentes.delete(avisar);
  };
};

/** Elige el día de trabajo: lo recuerda por 12 horas y avisa al menú. */
export function elegirDia(fecha: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return;
  document.cookie = `dia=${fecha}; path=/; max-age=${DOCE_HORAS}; samesite=lax`;
  if (elegido === fecha) return;
  elegido = fecha;
  for (const avisar of oyentes) avisar();
}

/** El día elegido; mientras no se eligió ninguno en esta pestaña, el que vino del servidor. */
export function useDiaEnCurso(delServidor: string | null): string | null {
  return useSyncExternalStore(
    suscribir,
    () => elegido ?? delServidor,
    () => delServidor,
  );
}
