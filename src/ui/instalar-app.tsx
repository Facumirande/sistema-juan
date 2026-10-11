"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

// "📲 Instalar la app" al final del menú (pedido del usuario, 08/10/2026: que el sistema se vea como
// una aplicación, sin nada del navegador). Instalada, se abre desde su ícono a pantalla completa. En
// Android y en la computadora el navegador ofrece instalarla; en el iPhone no hay ese aviso, así que
// se explica cómo agregarla a la pantalla de inicio. Abierta ya como app, no aparece.

interface EventoInstalar extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const sinCambios = () => () => undefined;
/** Abierta desde el ícono (como app). */
const comoApp = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
const esIPhone = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export function InstalarApp() {
  const [evento, setEvento] = useState<EventoInstalar | null>(null);
  const [ayuda, setAyuda] = useState(false);
  const iPhoneSinInstalar = useSyncExternalStore(sinCambios, () => esIPhone() && !comoApp(), () => false);

  useEffect(() => {
    const guardar = (e: Event) => {
      // El navegador no muestra su cartel: se instala desde el botón del menú.
      e.preventDefault();
      if (!comoApp()) setEvento(e as EventoInstalar);
    };
    const instalada = () => setEvento(null);
    window.addEventListener("beforeinstallprompt", guardar);
    window.addEventListener("appinstalled", instalada);
    return () => {
      window.removeEventListener("beforeinstallprompt", guardar);
      window.removeEventListener("appinstalled", instalada);
    };
  }, []);

  if (!evento && !iPhoneSinInstalar) return null;
  const instalar = async () => {
    if (!evento) {
      setAyuda((a) => !a);
      return;
    }
    await evento.prompt();
    await evento.userChoice;
    setEvento(null);
  };
  return (
    <div className="flex flex-col gap-1">
      <button type="button" onClick={() => void instalar()} aria-expanded={evento ? undefined : ayuda} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left font-semibold text-marca hover:bg-marca/10">
        <span aria-hidden className="w-6 text-center text-lg leading-none">
          📲
        </span>
        Instalar la app
      </button>
      {ayuda && (
        <p className="rounded-lg bg-fondo px-3 py-2 text-sm">
          En Safari tocá <b>Compartir</b> <span aria-hidden>⬆️</span> y después <b>Agregar a inicio</b>. Se abre desde su ícono, sin la barra del navegador.
        </p>
      )}
    </div>
  );
}
