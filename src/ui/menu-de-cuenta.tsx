"use client";

import { useEffect, useRef, useState } from "react";

import { Avatar, type PersonaAvatar } from "./avatar";
import Link from "./enlace";

// La persona en la barra de arriba (pedido del usuario, 11/10/2026): solo el círculo con sus
// iniciales, sin el nombre al lado ni el botón "Salir". Al tocarlo se despliegan las dos cosas que
// se hacen con la cuenta: editar el perfil (Mi cuenta) y cerrar la sesión.

export function MenuDeCuenta({ persona }: { persona: PersonaAvatar }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const afuera = (e: PointerEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    document.addEventListener("pointerdown", afuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", afuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  const opcion = "flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left font-medium hover:bg-fondo";
  const dibujo = "w-6 text-center text-lg leading-none";
  return (
    <div ref={caja} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label={`Tu cuenta: ${persona.nombre}`}
        className="flex min-h-11 items-center rounded-full outline-offset-2 transition-[filter] hover:brightness-110"
      >
        <Avatar persona={persona} tamano="barra" />
      </button>
      {abierto && (
        // `text-texto`: sobre el tablero la barra va con letra blanca, y este recuadro tiene su propio fondo.
        <div role="menu" aria-label="Tu cuenta" className="absolute top-full right-0 z-50 mt-2 flex w-60 max-w-[calc(100vw-1rem)] flex-col gap-1 rounded-2xl border border-borde bg-superficie p-2 text-texto shadow-2xl">
          <p className="truncate px-3 pt-1 pb-1 text-sm text-texto-suave">{persona.nombre}</p>
          <Link href="/mi-cuenta" role="menuitem" onClick={() => setAbierto(false)} className={opcion}>
            <span aria-hidden className={dibujo}>
              ✏️
            </span>
            Editar perfil
          </Link>
          <form action="/auth/salir" method="post">
            <button type="submit" role="menuitem" className={opcion}>
              <span aria-hidden className={dibujo}>
                🚪
              </span>
              Cerrar sesión
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
