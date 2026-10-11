"use client";

import Link from "next/link";
import { useState, type ComponentProps } from "react";

// El enlace de todo el sistema (en lugar del de Next directamente). Precarga su pantalla recién
// cuando se lo va a usar: al pasarle el mouse por encima, al apoyar el dedo o al llegar con el
// teclado. El enlace común de Next precarga todo lo que está a la vista, y vuelve a hacerlo después
// de cada cosa que se guarda: con el menú, los días y las columnas del tablero eran entre 18 y 35
// pedidos al servidor por cada toque (11/10/2026: era parte de lo que hacía lento al sistema).
// Se usa igual que el de Next; con `prefetch` se puede pedir otra cosa en un enlace puntual.

export default function Enlace({ prefetch, onMouseEnter, onPointerDown, onFocus, ...resto }: ComponentProps<typeof Link>) {
  const [conIntencion, setConIntencion] = useState(false);
  return (
    <Link
      {...resto}
      prefetch={prefetch ?? (conIntencion ? null : false)}
      onMouseEnter={(evento) => {
        setConIntencion(true);
        onMouseEnter?.(evento);
      }}
      onPointerDown={(evento) => {
        setConIntencion(true);
        onPointerDown?.(evento);
      }}
      onFocus={(evento) => {
        setConIntencion(true);
        onFocus?.(evento);
      }}
    />
  );
}
