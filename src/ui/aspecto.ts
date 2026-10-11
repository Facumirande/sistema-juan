import { useSyncExternalStore } from "react";

import {
  CLAVE_TARJETAS,
  CLAVE_TEMA,
  interpretarTarjetas,
  interpretarTema,
  temaEfectivo,
  type AspectoDeTarjetas,
  type PreferenciaDeTema,
  type Tema,
} from "@/dominio/aspecto/aspecto";

// El aspecto elegido en este aparato (modo claro u oscuro, tarjetas en colores o neutras), del lado
// del navegador: se guarda en `localStorage`, se pone en <html> como `data-tema` y `data-tarjetas`
// (de ahí lo toman los estilos de `globals.css` y las clases `dark:`) y avisa a lo que lo muestra
// (el interruptor de la barra, "Aspecto" en Mi cuenta). Al cargar la página lo pone
// `aspecto-inicial.ts`, antes de que se dibuje nada.

export interface Aspecto {
  /** Lo elegido: claro, oscuro o "sistema" (como el aparato). */
  preferencia: PreferenciaDeTema;
  /** Lo que se ve. */
  tema: Tema;
  tarjetas: AspectoDeTarjetas;
}

const EVENTO = "aspecto:cambio";
const APARATO_EN_OSCURO = "(prefers-color-scheme: dark)";
/** Lo que se dibuja en el servidor, que no sabe qué eligió cada aparato. */
const SIN_ELEGIR: Aspecto = { preferencia: "sistema", tema: "claro", tarjetas: "color" };

/** Si el navegador no deja guardar (modo privado), lo elegido vale hasta cerrar la página. */
const sinGuardar = new Map<string, string | null>();

function leer(clave: string): string | null {
  if (sinGuardar.has(clave)) return sinGuardar.get(clave) ?? null;
  try {
    return window.localStorage.getItem(clave);
  } catch {
    return null;
  }
}

function guardar(clave: string, valor: string | null): void {
  try {
    if (valor === null) window.localStorage.removeItem(clave);
    else window.localStorage.setItem(clave, valor);
    sinGuardar.delete(clave);
  } catch {
    sinGuardar.set(clave, valor);
  }
}

let ultimo: Aspecto = SIN_ELEGIR;

/** El aspecto de ahora; devuelve el mismo objeto mientras no cambie nada. */
function aspectoActual(): Aspecto {
  const preferencia = interpretarTema(leer(CLAVE_TEMA));
  const tema = temaEfectivo(preferencia, window.matchMedia(APARATO_EN_OSCURO).matches);
  const tarjetas = interpretarTarjetas(leer(CLAVE_TARJETAS));
  if (ultimo.preferencia !== preferencia || ultimo.tema !== tema || ultimo.tarjetas !== tarjetas) ultimo = { preferencia, tema, tarjetas };
  return ultimo;
}

/** Deja <html> como dice lo elegido. */
export function aplicarAspecto(): void {
  const { tema, tarjetas } = aspectoActual();
  const raiz = document.documentElement;
  raiz.setAttribute("data-tema", tema);
  if (tarjetas === "neutro") raiz.setAttribute("data-tarjetas", "neutro");
  else raiz.removeAttribute("data-tarjetas");
}

function avisar(): void {
  aplicarAspecto();
  window.dispatchEvent(new Event(EVENTO));
}

/** Elegir el modo: claro, oscuro o "sistema" (vuelve a seguir al aparato). */
export function elegirTema(preferencia: PreferenciaDeTema): void {
  guardar(CLAVE_TEMA, preferencia === "sistema" ? null : preferencia);
  avisar();
}

/** Elegir las tarjetas del tablero: en colores o neutras. */
export function elegirTarjetas(tarjetas: AspectoDeTarjetas): void {
  guardar(CLAVE_TARJETAS, tarjetas === "color" ? null : tarjetas);
  avisar();
}

function suscribir(alCambiar: () => void): () => void {
  const aparato = window.matchMedia(APARATO_EN_OSCURO);
  // Cambió en otra pestaña, o el aparato pasó solo a oscuro (de noche): también hay que ponerlo en <html>.
  const desdeAfuera = () => {
    sinGuardar.clear();
    aplicarAspecto();
    alCambiar();
  };
  window.addEventListener(EVENTO, alCambiar);
  window.addEventListener("storage", desdeAfuera);
  aparato.addEventListener("change", desdeAfuera);
  return () => {
    window.removeEventListener(EVENTO, alCambiar);
    window.removeEventListener("storage", desdeAfuera);
    aparato.removeEventListener("change", desdeAfuera);
  };
}

/** El aspecto de este aparato, al día. */
export function useAspecto(): Aspecto {
  return useSyncExternalStore(suscribir, aspectoActual, () => SIN_ELEGIR);
}
