"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

// Las pantallas se ponen al día solas (pedido del usuario, 08/10/2026: que la interacción entre las
// dos personas sea fluida). Cada pocos segundos se pregunta el "pulso" de la base, un número que sube
// con cada cosa que se guarda (`src/modulos/colaboracion/pulso.ts`); si cambió, la pantalla se vuelve
// a dibujar con los datos nuevos, sin recargar ni perder lo que se está mirando. Avisa además con el
// evento "sistema:cambio", que usa la campanita para buscar las novedades al instante.

const CADA_CUANTO_MS = 5_000;
/** Después de tocar algo, se espera un poco antes de redibujar: que nada se mueva bajo el dedo. */
const QUIETO_MS = 1_500;
/** Donde se está escribiendo o se imprime, no se redibuja solo (se ve al volver a la pantalla). */
const SIN_REDIBUJAR = /\/(nuevo|nueva|cambiar|cargar|importar|pago|ajuste|imprimir|documento|estado-de-cuenta|comprar|rapida|exportar|configuracion|mi-cuenta|crear-clave)(\/|$)/;

export const EVENTO_CAMBIO = "sistema:cambio";

/** Algo en pantalla pide no redibujar ahora: se escribe en un campo, se arrastra o se está guardando. */
function ocupada(): boolean {
  const activo = document.activeElement as HTMLElement | null;
  if (activo && (activo.isContentEditable || (/^(INPUT|TEXTAREA|SELECT)$/.test(activo.tagName) && !["checkbox", "radio", "button", "submit"].includes((activo as HTMLInputElement).type)))) return true;
  return document.querySelector('[data-no-redibujar], [aria-busy="true"]') !== null;
}

export function Pulso() {
  const router = useRouter();
  const pantalla = usePathname();
  const pantallaActual = useRef(pantalla);
  /** El pulso cambió y todavía no se pudo redibujar. */
  const atrasada = useRef(false);
  useEffect(() => {
    pantallaActual.current = pantalla;
    // Una pantalla recién abierta ya trae los datos al día.
    atrasada.current = false;
  }, [pantalla]);

  useEffect(() => {
    let viva = true;
    let conocido: string | null = null;
    let tocado = 0;
    let preguntando = false;

    const redibujarSiSePuede = () => {
      if (!atrasada.current || SIN_REDIBUJAR.test(pantallaActual.current) || Date.now() - tocado < QUIETO_MS || ocupada()) return;
      atrasada.current = false;
      router.refresh();
    };
    const preguntar = async () => {
      if (preguntando || document.visibilityState !== "visible") return;
      preguntando = true;
      try {
        const respuesta = await fetch("/pulso", { cache: "no-store" });
        if (!respuesta.ok || !viva) return;
        const { pulso } = (await respuesta.json()) as { pulso: string };
        if (conocido !== null && pulso !== conocido) {
          atrasada.current = true;
          window.dispatchEvent(new Event(EVENTO_CAMBIO));
        }
        conocido = pulso;
      } catch {
        // Sin conexión por un momento: se vuelve a preguntar en la próxima vuelta.
      } finally {
        preguntando = false;
      }
      redibujarSiSePuede();
    };

    void preguntar();
    const reloj = setInterval(() => void preguntar(), CADA_CUANTO_MS);
    const alVolver = () => {
      if (document.visibilityState === "visible") void preguntar();
    };
    const alTocar = () => {
      tocado = Date.now();
    };
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", alVolver);
    window.addEventListener("pointerdown", alTocar, { passive: true });
    window.addEventListener("keydown", alTocar);
    return () => {
      viva = false;
      clearInterval(reloj);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", alVolver);
      window.removeEventListener("pointerdown", alTocar);
      window.removeEventListener("keydown", alTocar);
    };
  }, [router]);

  return null;
}
