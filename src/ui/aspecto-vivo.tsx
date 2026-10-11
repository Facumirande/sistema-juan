"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { colorDeBarraDeEstado } from "@/dominio/aspecto/aspecto";

import { aplicarAspecto, useAspecto } from "./aspecto";

// Mantiene el aspecto al día en cada página: sigue al aparato cuando pasa solo a oscuro, toma lo que
// se cambia en otra pestaña y le da a la barra del teléfono (la de la hora y la batería) el color
// que tiene la pantalla arriba, así la pantalla "llega hasta arriba" sin una franja de otro color
// (pedido del usuario, 11/10/2026): en el tablero, el cielo de la imagen de fondo; en el resto, el
// fondo del sistema, claro u oscuro según lo elegido.

/** Las pantallas que tienen la imagen de campo de fondo hasta arriba: el tablero y el paso a paso. */
const CON_IMAGEN_DE_FONDO = new Set(["/inicio"]);

export function AspectoVivo() {
  const { tema } = useAspecto();
  const ruta = usePathname();

  // Por si el guion de la página no llegó a correr.
  useEffect(() => aplicarAspecto(), []);

  useEffect(() => {
    const color = colorDeBarraDeEstado(tema, CON_IMAGEN_DE_FONDO.has(ruta));
    const poner = () => {
      for (const meta of document.querySelectorAll('meta[name="theme-color"]')) if (meta.getAttribute("content") !== color) meta.setAttribute("content", color);
    };
    poner();
    // Al pasar de una pantalla a otra, Next vuelve a escribir estas etiquetas con el color del aparato: se lo corrige cada vez.
    const vigia = new MutationObserver(poner);
    vigia.observe(document.head, { childList: true, subtree: true, attributes: true, attributeFilter: ["content"] });
    return () => vigia.disconnect();
  }, [tema, ruta]);

  return null;
}
