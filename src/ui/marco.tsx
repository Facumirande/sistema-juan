"use client";

import Link from "./enlace";
import { IconoGuardarMenu, IconoMenu } from "./iconos";

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
/** Lo que tarda el cajón del celular en entrar o salir (el mismo tiempo que su transición). */
const DESLIZAR_MS = 200;

/**
 * El cajón del menú en el celular. Cerrado no existe en la página (`display: none`), no solo corrido afuera de la
 * pantalla: los iPhone nuevos pintan la zona de la hora y la batería con el color de lo que esté fijo arriba, y un
 * cajón escondido al costado le prestaba su color a esa zona. Por eso abre y cierra en dos pasos.
 */
type Cajon = "cerrado" | "abriendo" | "abierto" | "cerrando";
const esComputadora = () => window.matchMedia("(min-width: 768px)").matches;

export function MarcoConMenu({ menu, barra, menuCerrado, children }: { menu: ReactNode; barra: ReactNode; menuCerrado: boolean; children: ReactNode }) {
  const [enComputadora, setEnComputadora] = useState(!menuCerrado);
  const [cajon, setCajon] = useState<Cajon>("cerrado");
  const lateral = useRef<HTMLElement>(null);
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

  const cerrarCajon = () => setCajon((c) => (c === "cerrado" ? c : "cerrando"));

  // El cajón entra deslizándose: primero aparece corrido afuera y, ya dibujado así, se lo trae; al cerrarlo
  // se lo corre y recién después se lo saca de la página.
  useEffect(() => {
    if (cajon === "abriendo") {
      // Leer su ancho hace que el navegador lo dibuje corrido antes de traerlo (si no, no hay deslizamiento).
      void lateral.current?.offsetWidth;
      const cuadro = requestAnimationFrame(() => setCajon("abierto"));
      return () => cancelAnimationFrame(cuadro);
    }
    if (cajon === "cerrando") {
      const espera = setTimeout(() => setCajon("cerrado"), DESLIZAR_MS);
      return () => clearTimeout(espera);
    }
  }, [cajon]);

  // Con el cajón abierto, Escape lo cierra.
  useEffect(() => {
    if (cajon !== "abierto") return;
    const alTeclear = (e: KeyboardEvent) => e.key === "Escape" && cerrarCajon();
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [cajon]);

  const alternar = () => {
    if (!esComputadora()) return setCajon((c) => (c === "cerrado" || c === "cerrando" ? "abriendo" : "cerrando"));
    const abierto = !enComputadora;
    setEnComputadora(abierto);
    document.cookie = `${COOKIE}=${abierto ? "abierto" : "cerrado"}; path=/; max-age=31536000; samesite=lax`;
  };

  return (
    <div className="marco flex flex-1">
      {(cajon === "abierto" || cajon === "abriendo") && <button type="button" aria-label="Cerrar el menú" onClick={cerrarCajon} className="fixed inset-0 z-40 bg-black/55 md:hidden print:hidden" />}
      <aside
        ref={lateral}
        id="menu-lateral"
        // En el celular, al elegir a dónde ir el cajón se guarda solo.
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a")) cerrarCajon();
        }}
        // La esquina de arriba a la derecha va redondeada (pedido del usuario, 11/10/2026).
        className={`menu-lateral fixed inset-y-0 left-0 z-50 w-[19.5rem] max-w-[88vw] overflow-y-auto rounded-tr-3xl border-r border-borde bg-superficie shadow-2xl transition-transform duration-200 md:sticky md:top-0 md:z-auto md:h-dvh md:w-[19rem] md:max-w-none md:shrink-0 md:translate-x-0 md:shadow-none md:transition-none print:hidden ${
          cajon === "abierto" ? "translate-x-0" : "-translate-x-full"
        } ${cajon === "cerrado" ? "max-md:hidden" : ""} ${enComputadora ? "" : "md:hidden"}`}
      >
        {/* El botón de guardar el menú queda adentro de la esquina redondeada, con sus flechitas en el medio. */}
        <div className="flex items-center justify-between gap-2 pt-3 pr-4 pl-3">
          <Link href="/inicio" className="flex min-h-10 items-center px-1 font-semibold">
            Sistema Repartos
          </Link>
          <button type="button" onClick={alternar} title="Guardar el menú" aria-label="Guardar el menú" className="flex size-10 shrink-0 items-center justify-center rounded-full text-xl text-texto-suave hover:bg-fondo hover:text-texto">
            <IconoGuardarMenu />
          </button>
        </div>
        <div className="px-3 pt-1 pb-4">{menu}</div>
      </aside>
      <div className="marco-contenido flex min-w-0 flex-1 flex-col">
        {/* La barra de arriba no tiene fondo ni raya (pedido del usuario, 11/10/2026): se ve la pantalla
            detrás y cada cosa queda donde estaba. Su alto y sus colores salen de `globals.css`
            (`--alto-barra`, `marco-barra`). En el celular, el ☰, la campana y la persona van grandes. */}
        <header className="marco-barra flex min-h-[var(--alto-barra-sola)] items-center justify-between gap-2 px-2 sm:px-3 print:hidden">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={alternar}
              aria-controls="menu-lateral"
              aria-label="Abrir o guardar el menú"
              title="Menú"
              // Las tres rayas son un dibujo (no la letra ☰), así quedan justo en el medio del recuadro.
              className={`flex size-[3.6rem] shrink-0 items-center justify-center rounded-2xl border border-[var(--nav-borde)] text-[2rem] hover:bg-[var(--nav-encima)] sm:size-11 sm:rounded-xl sm:text-2xl ${enComputadora ? "md:hidden" : ""}`}
            >
              <IconoMenu />
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
