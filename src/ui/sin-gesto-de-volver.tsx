"use client";

import { useEffect } from "react";

// En el celular el sistema se usa como una app: arrastrar el dedo hacia la derecha no tiene que
// "volver atrás" como en una página común (pedido del usuario, 11/10/2026). Pasaba sobre todo en el
// tablero, donde las columnas se deslizan de costado.
//
// En Android alcanza con los estilos (`overscroll-behavior` en `globals.css`). El iPhone no los
// tiene en cuenta para su gesto, que nace en el borde izquierdo de la pantalla: ahí lo único que
// lo frena es que la página se quede con ese toque apenas empieza. Como al quedárselo tampoco llega
// el toque común, si el dedo no se movió se lo hace llegar a lo que había debajo (un botón pegado
// al borde se sigue pudiendo tocar).

/** El ancho de la franja del borde izquierdo donde nace el gesto de volver del iPhone. */
const BORDE_PX = 24;
const SE_MOVIO_PX = 10;
const MUY_LARGO_MS = 700;

const esIPhone = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export function SinGestoDeVolver() {
  useEffect(() => {
    if (!esIPhone()) return;
    let toque: { id: number; x: number; y: number; cuando: number } | null = null;

    const alEmpezar = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      toque = null;
      if (!t || e.touches.length !== 1 || t.clientX > BORDE_PX || !e.cancelable) return;
      e.preventDefault();
      toque = { id: t.identifier, x: t.clientX, y: t.clientY, cuando: Date.now() };
    };
    const alSoltar = (e: TouchEvent) => {
      const inicio = toque;
      toque = null;
      if (!inicio) return;
      const t = Array.from(e.changedTouches).find((c) => c.identifier === inicio.id);
      if (!t || Math.hypot(t.clientX - inicio.x, t.clientY - inicio.y) > SE_MOVIO_PX || Date.now() - inicio.cuando > MUY_LARGO_MS) return;
      const debajo = document.elementFromPoint(t.clientX, t.clientY);
      if (!(debajo instanceof HTMLElement)) return;
      if (debajo.matches("input, textarea, select")) debajo.focus();
      debajo.click();
    };
    const alCancelar = () => {
      toque = null;
    };

    // `passive: false`: sin eso el navegador no deja quedarse con el toque.
    document.addEventListener("touchstart", alEmpezar, { passive: false });
    document.addEventListener("touchend", alSoltar);
    document.addEventListener("touchcancel", alCancelar);
    return () => {
      document.removeEventListener("touchstart", alEmpezar);
      document.removeEventListener("touchend", alSoltar);
      document.removeEventListener("touchcancel", alCancelar);
    };
  }, []);
  return null;
}
