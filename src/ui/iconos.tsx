import type { ReactNode } from "react";

// Dibujos propios en SVG para lo que un emoji no muestra bien.

/**
 * La flecha de navegación (la del GPS): acompaña todo lo que lleva a un lugar (viaje de entrega,
 * cómo llegar, abrir el GPS). Toma el tamaño del texto; el color es el de la navegación salvo que
 * se pase otro.
 */
export function FlechaNavegacion({ className = "text-navegacion" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden focusable="false" className={`inline-block size-[1em] shrink-0 align-[-0.125em] ${className}`}>
      <path d="M3.4 10.6 20.2 3.3c.5-.2 1 .3.8.8l-7.3 16.8c-.3.6-1.1.5-1.3-.1l-1.6-6.3-6.3-1.6c-.6-.2-.7-1-.1-1.3Z" fill="currentColor" />
    </svg>
  );
}

// Los dibujos de los botones del menú (11/10/2026): un carácter de texto (☰, «, ‹) nunca queda bien
// centrado, porque cada letra trae su propio aire arriba y abajo. Estos se dibujan en un cuadrado y
// quedan en el medio del botón. Toman el tamaño del texto (`text-…`) y su color.

function Trazos({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden focusable="false" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={`block size-[1em] shrink-0 ${className}`}>
      {children}
    </svg>
  );
}

/** Las tres rayas del botón que abre el menú. */
export function IconoMenu({ className }: { className?: string }) {
  return (
    <Trazos className={className}>
      <path d="M4 6.5h16M4 12h16M4 17.5h16" />
    </Trazos>
  );
}

/** Las dos flechitas del botón que guarda el menú (hacia la izquierda). */
export function IconoGuardarMenu({ className }: { className?: string }) {
  return (
    <Trazos className={className}>
      <path d="m11.5 6.5-5.5 5.5 5.5 5.5M18 6.5 12.5 12l5.5 5.5" />
    </Trazos>
  );
}

/** Una flechita para ir al anterior o al siguiente. */
export function Flechita({ hacia, className }: { hacia: "izquierda" | "derecha"; className?: string }) {
  return (
    <Trazos className={className}>
      <path d={hacia === "izquierda" ? "m14.5 6-6 6 6 6" : "m9.5 6 6 6-6 6"} />
    </Trazos>
  );
}
