"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

// El armazón de la aplicación: el menú de la izquierda y la barra de arriba. El menú se pliega y
// se vuelve a abrir con el botón ☰ (pedido del usuario, 07/10/2026: que se pueda guardar para que
// no moleste). En la computadora queda como se lo dejó la última vez (se recuerda en una cookie,
// así la página ya llega armada de esa forma); en el celular es un cajón que se abre sobre la
// pantalla y se cierra solo al elegir a dónde ir.

const COOKIE = "menu";
const esComputadora = () => window.matchMedia("(min-width: 768px)").matches;

export function MarcoConMenu({ menu, barra, menuCerrado, children }: { menu: ReactNode; barra: ReactNode; menuCerrado: boolean; children: ReactNode }) {
  const [enComputadora, setEnComputadora] = useState(!menuCerrado);
  const [enCelular, setEnCelular] = useState(false);

  // Con el cajón abierto, Escape lo cierra.
  useEffect(() => {
    if (!enCelular) return;
    const alTeclear = (e: KeyboardEvent) => e.key === "Escape" && setEnCelular(false);
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [enCelular]);

  const alternar = () => {
    if (!esComputadora()) return setEnCelular((v) => !v);
    const abierto = !enComputadora;
    setEnComputadora(abierto);
    document.cookie = `${COOKIE}=${abierto ? "abierto" : "cerrado"}; path=/; max-age=31536000; samesite=lax`;
  };

  return (
    <div className="flex flex-1">
      {enCelular && <button type="button" aria-label="Cerrar el menú" onClick={() => setEnCelular(false)} className="fixed inset-0 z-40 bg-black/55 md:hidden print:hidden" />}
      <aside
        id="menu-lateral"
        // En el celular, al elegir a dónde ir el cajón se guarda solo.
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a")) setEnCelular(false);
        }}
        className={`fixed inset-y-0 left-0 z-50 w-[17rem] max-w-[85vw] overflow-y-auto border-r border-borde bg-superficie shadow-2xl transition-transform duration-200 md:sticky md:top-0 md:z-auto md:h-dvh md:w-[16.5rem] md:max-w-none md:shrink-0 md:translate-x-0 md:shadow-none md:transition-none print:hidden ${
          enCelular ? "translate-x-0" : "-translate-x-full"
        } ${enComputadora ? "" : "md:hidden"}`}
      >
        <div className="flex items-center justify-between gap-2 px-3 pt-2">
          <Link href="/inicio" className="flex min-h-10 items-center px-1 font-semibold">
            Sistema Repartos
          </Link>
          <button type="button" onClick={alternar} title="Guardar el menú" aria-label="Guardar el menú" className="flex size-10 items-center justify-center rounded-lg text-xl hover:bg-fondo">
            <span aria-hidden>«</span>
          </button>
        </div>
        <div className="px-3 pt-1 pb-4">{menu}</div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-14 items-center justify-between gap-2 border-b border-borde bg-superficie px-3 print:hidden">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={alternar}
              aria-controls="menu-lateral"
              aria-label="Abrir o guardar el menú"
              title="Menú"
              className={`flex size-11 shrink-0 items-center justify-center rounded-lg border border-borde text-xl hover:bg-fondo ${enComputadora ? "md:hidden" : ""}`}
            >
              <span aria-hidden>☰</span>
            </button>
            <Link href="/inicio" className={`flex min-h-11 items-center truncate font-semibold ${enComputadora ? "md:hidden" : ""}`}>
              Sistema Repartos
            </Link>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">{barra}</div>
        </header>
        <main className="min-w-0 flex-1 p-4 print:p-0">{children}</main>
      </div>
    </div>
  );
}
