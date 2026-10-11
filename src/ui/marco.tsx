"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

// El armazón de la aplicación: el menú de la izquierda y la barra de arriba. El menú se pliega y
// se vuelve a abrir con el botón ☰ (pedido del usuario, 07/10/2026: que se pueda guardar para que
// no moleste). En la computadora queda como se lo dejó la última vez (se recuerda en una cookie,
// así la página ya llega armada de esa forma); en el celular es un cajón que se abre sobre la
// pantalla y se cierra solo al elegir a dónde ir.
//
// En el celular el sistema se usa como una app (10/10/2026): la página no se mueve; lo que se
// desplaza es el contenido, adentro de este marco, con la barra de arriba quieta (los estilos están
// en `globals.css`, clases `marco…`). Como ya no es la página la que se desplaza, el marco se ocupa
// de lo que antes hacía el navegador: cada pantalla nueva arranca arriba y, al volver atrás, se
// retoma donde se la había dejado.

const COOKIE = "menu";
const esComputadora = () => window.matchMedia("(min-width: 768px)").matches;

export function MarcoConMenu({ menu, barra, menuCerrado, children }: { menu: ReactNode; barra: ReactNode; menuCerrado: boolean; children: ReactNode }) {
  const [enComputadora, setEnComputadora] = useState(!menuCerrado);
  const [enCelular, setEnCelular] = useState(false);
  const principal = useRef<HTMLElement>(null);
  const pantalla = usePathname();
  /** Hasta dónde se había bajado en cada pantalla (por su dirección), para retomarla al volver atrás. */
  const posiciones = useRef(new Map<string, number>());
  const volviendo = useRef(false);

  useEffect(() => {
    const el = principal.current;
    if (!el) return;
    const direccion = () => window.location.pathname + window.location.search;
    const alDesplazar = () => posiciones.current.set(direccion(), el.scrollTop);
    const alVolver = () => {
      volviendo.current = true;
      const hasta = posiciones.current.get(direccion());
      if (!hasta) return;
      // La pantalla anterior tarda un instante en dibujarse: se baja apenas tiene el alto que hace falta.
      let intentos = 0;
      const bajar = () => {
        if (el.scrollHeight - el.clientHeight >= hasta - 1 || intentos++ > 40) el.scrollTop = hasta;
        else requestAnimationFrame(bajar);
      };
      requestAnimationFrame(bajar);
    };
    el.addEventListener("scroll", alDesplazar, { passive: true });
    window.addEventListener("popstate", alVolver);
    return () => {
      el.removeEventListener("scroll", alDesplazar);
      window.removeEventListener("popstate", alVolver);
    };
  }, []);
  // Una pantalla nueva arranca arriba (salvo que se esté volviendo atrás).
  useLayoutEffect(() => {
    if (!volviendo.current) principal.current?.scrollTo(0, 0);
    volviendo.current = false;
  }, [pantalla]);

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
    <div className="marco flex flex-1">
      {enCelular && <button type="button" aria-label="Cerrar el menú" onClick={() => setEnCelular(false)} className="fixed inset-0 z-40 bg-black/55 md:hidden print:hidden" />}
      <aside
        id="menu-lateral"
        // En el celular, al elegir a dónde ir el cajón se guarda solo.
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a")) setEnCelular(false);
        }}
        className={`menu-lateral fixed inset-y-0 left-0 z-50 w-[19.5rem] max-w-[88vw] overflow-y-auto border-r border-borde bg-superficie shadow-2xl transition-transform duration-200 md:sticky md:top-0 md:z-auto md:h-dvh md:w-[19rem] md:max-w-none md:shrink-0 md:translate-x-0 md:shadow-none md:transition-none print:hidden ${
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
      <div className="marco-contenido flex min-w-0 flex-1 flex-col">
        {/* En el celular, la barra y los márgenes son algo más chicos: queda más lugar para el contenido. */}
        <header className="flex min-h-12 items-center justify-between gap-2 border-b border-borde bg-superficie px-2 sm:min-h-14 sm:px-3 print:hidden">
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
        <main ref={principal} className="marco-principal min-w-0 flex-1 p-3 sm:p-4 print:p-0">
          {children}
        </main>
      </div>
    </div>
  );
}
