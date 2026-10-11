"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

// Las pantallas se ponen al día solas (pedido del usuario, 08/10/2026: que la interacción entre las
// dos personas sea fluida). Cada pocos segundos se pregunta el "pulso" de la base, un número que sube
// con cada cosa que se guarda (`src/modulos/colaboracion/pulso.ts`); si cambió, la pantalla se vuelve
// a dibujar con los datos nuevos, sin recargar ni perder lo que se está mirando. Avisa además con el
// evento "sistema:cambio", que usa la campanita para buscar las novedades al instante.
//
// Lo que guarda uno mismo no hace redibujar de nuevo (11/10/2026): la respuesta de cada acción ya
// trae la pantalla al día y, con ella, hasta qué número del pulso llega (`alDia`, que anota
// `ejecutarAccion`). Antes, cada tilde o cada tarjeta movida hacía pedir la pantalla entera una
// segunda vez a los pocos segundos.

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

/** El pulso como número (es un contador: entra de sobra en un número común); nulo si no se entiende. */
function aNumero(pulso: string | null | undefined): number | null {
  if (!pulso || !/^\d+$/.test(pulso)) return null;
  const n = Number(pulso);
  return Number.isSafeInteger(n) ? n : null;
}

export function Pulso({ alDia = null }: { /** Hasta qué número del pulso llegan los datos que vinieron con la pantalla (lo anota cada acción que guarda). */ alDia?: string | null }) {
  const router = useRouter();
  const pantalla = usePathname();
  const pantallaActual = useRef(pantalla);
  /** El pulso cambió y todavía no se pudo redibujar. */
  const atrasada = useRef(false);
  /** El último número que respondió el servidor. */
  const visto = useRef<number | null>(null);
  /** Hasta qué número la pantalla ya tiene los datos: lo que se redibujó, lo que se abrió o lo que se guardó desde acá. */
  const tengo = useRef<number | null>(null);

  useEffect(() => {
    pantallaActual.current = pantalla;
    // Una pantalla recién abierta ya trae los datos al día.
    atrasada.current = false;
    if (visto.current !== null && (tengo.current === null || visto.current > tengo.current)) tengo.current = visto.current;
  }, [pantalla]);

  // Llegó la pantalla después de guardar algo desde acá: ya incluye ese cambio, no hay que volver a pedirla.
  useEffect(() => {
    const n = aNumero(alDia);
    if (n === null) return;
    if (tengo.current === null || n > tengo.current) tengo.current = n;
    if (visto.current !== null && visto.current <= tengo.current) atrasada.current = false;
  }, [alDia]);

  useEffect(() => {
    let viva = true;
    let tocado = 0;
    let preguntando = false;

    const redibujarSiSePuede = () => {
      if (!atrasada.current || SIN_REDIBUJAR.test(pantallaActual.current) || Date.now() - tocado < QUIETO_MS || ocupada()) return;
      atrasada.current = false;
      if (visto.current !== null && (tengo.current === null || visto.current > tengo.current)) tengo.current = visto.current;
      router.refresh();
    };
    const preguntar = async () => {
      if (preguntando || document.visibilityState !== "visible") return;
      preguntando = true;
      try {
        const respuesta = await fetch("/pulso", { cache: "no-store" });
        if (!respuesta.ok || !viva) return;
        const n = aNumero(((await respuesta.json()) as { pulso: string }).pulso);
        if (n === null) return;
        const previo = visto.current;
        visto.current = n;
        if (previo === null) {
          // La primera vez solo se toma nota: la pantalla recién se abrió.
          if (tengo.current === null || n > tengo.current) tengo.current = n;
        } else {
          // Algo se guardó (acá o en otro aparato): la campanita busca las novedades.
          if (n !== previo) window.dispatchEvent(new Event(EVENTO_CAMBIO));
          // Y si es más de lo que esta pantalla ya tiene, hay que redibujarla.
          if (tengo.current === null || n > tengo.current) atrasada.current = true;
        }
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
