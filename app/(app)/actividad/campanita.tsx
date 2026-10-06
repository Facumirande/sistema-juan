"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { textoDeNovedades } from "@/dominio/colaboracion/avisos";
import { tiempoRelativo } from "@/dominio/colaboracion/tiempo";
import type { AvisoVisible, BandejaDeAvisos } from "@/modulos/colaboracion/avisos";

import { Avatar } from "@/ui/avatar";
import { BotonAccion } from "@/ui/boton-accion";
import { enlaceDeEntidad } from "@/ui/enlaces";
import { FormularioAccion } from "@/ui/formulario-accion";

import { marcarAvisosVistosAccion, marcarTodasLeidasAccion, pedirAlgoAccion } from "./acciones";

// La campanita del encabezado: cuántas novedades hay, el panel con lo que cargó o cambió cada
// persona (lo dirigido a uno, destacado), y un cartelito cuando llega algo mientras la pantalla
// está abierta. Pregunta al servidor cada medio minuto; en las pantallas del día de trabajo,
// además, vuelve a dibujar los datos para que el tablero quede al día sin recargar.

const CADA_CUANTO_MS = 30_000;
const CARTEL_MS = 10_000;
/** Pantallas que se redibujan solas cuando la otra persona hace algo. */
const PANTALLAS_VIVAS = ["/inicio", "/lista-compra", "/preparacion", "/viaje", "/actividad"];

const destinoDe = (a: AvisoVisible) => (!a.entidad ? "/actividad" : a.entidad.tipo === "USUARIO" && a.clase === "NOTA" ? "/actividad?ver=notas" : enlaceDeEntidad(a.entidad.tipo, a.entidad.id, a.entidad.fecha));

/** "cargó el pedido…" o, si es una nota, "te dejó una nota en PED-000012 · Hospital". */
const textoDe = (a: AvisoVisible) => (a.clase === "NOTA" && a.entidad && a.entidad.tipo !== "USUARIO" ? `${a.resumen} en ${a.entidad.etiqueta}` : a.resumen);

export function Campanita({ inicial, zonaHoraria }: { inicial: BandejaDeAvisos; zonaHoraria: string }) {
  // Lo que trae la página al dibujarse manda sobre lo último que se consultó.
  const [guardada, setGuardada] = useState({ de: inicial, datos: inicial });
  if (guardada.de !== inicial) setGuardada({ de: inicial, datos: inicial });
  const bandeja = guardada.datos;

  const [abierta, setAbierta] = useState(false);
  const [vistos, setVistos] = useState(false);
  const [ahora, setAhora] = useState(0);
  const [cartel, setCartel] = useState<{ texto: string; href: string; paraMi: boolean } | null>(null);
  const [permiso, setPermiso] = useState<NotificationPermission | "sin-soporte">("sin-soporte");
  const conocidos = useRef(new Set<string>());
  const caja = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pantalla = usePathname();
  const pantallaActual = useRef(pantalla);

  useEffect(() => {
    pantallaActual.current = pantalla;
  }, [pantalla]);
  useEffect(() => {
    for (const a of inicial.avisos) conocidos.current.add(a.id);
  }, [inicial]);

  useEffect(() => {
    let viva = true;
    const consultar = async () => {
      const conPermiso = "Notification" in window && Notification.permission === "granted";
      // Con la pestaña tapada solo vale la pena preguntar si se puede avisar afuera de ella.
      if (document.visibilityState !== "visible" && !conPermiso) return;
      try {
        const respuesta = await fetch("/avisos", { cache: "no-store" });
        if (!respuesta.ok || !viva) return;
        const nueva = (await respuesta.json()) as BandejaDeAvisos;
        const novedades = nueva.avisos.filter((a) => a.nuevo && !conocidos.current.has(a.id));
        for (const a of nueva.avisos) conocidos.current.add(a.id);
        setGuardada((g) => ({ de: g.de, datos: nueva }));
        if (novedades.length === 0) return;
        setVistos(false);
        const paraMi = novedades.some((a) => a.paraMi);
        const texto = textoDeNovedades(novedades.map((a) => ({ persona: a.persona.nombre, resumen: textoDe(a) })));
        if (texto) {
          setCartel({ texto, href: novedades.length === 1 ? destinoDe(novedades[0]!) : "/actividad", paraMi });
          if (document.visibilityState !== "visible" && conPermiso) {
            try {
              new Notification("Sistema Repartos", { body: texto, tag: "sistema-repartos" });
            } catch {
              // En el celular el navegador no deja avisar así: queda la campanita.
            }
          }
        }
        if (PANTALLAS_VIVAS.some((p) => pantallaActual.current.startsWith(p))) router.refresh();
      } catch {
        // Sin conexión por un momento: se vuelve a preguntar en la próxima vuelta.
      }
    };
    const reloj = setInterval(consultar, CADA_CUANTO_MS);
    const alVolver = () => {
      if (document.visibilityState === "visible") void consultar();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      viva = false;
      clearInterval(reloj);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [router]);

  useEffect(() => {
    if (!cartel) return;
    const reloj = setTimeout(() => setCartel(null), CARTEL_MS);
    return () => clearTimeout(reloj);
  }, [cartel]);

  useEffect(() => {
    if (!abierta) return;
    const afuera = (e: PointerEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierta(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierta(false);
    };
    document.addEventListener("pointerdown", afuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", afuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierta]);

  const nuevos = vistos ? bandeja.notasSinLeer : bandeja.nuevos;
  const alternar = () => {
    if (abierta) {
      setAbierta(false);
      return;
    }
    setAbierta(true);
    setCartel(null);
    setAhora(Date.now());
    setPermiso("Notification" in window ? Notification.permission : "sin-soporte");
    if (bandeja.nuevos > bandeja.notasSinLeer && !vistos) {
      setVistos(true);
      void marcarAvisosVistosAccion();
    }
  };
  const pedirPermiso = async () => {
    try {
      setPermiso(await Notification.requestPermission());
    } catch {
      setPermiso("denied");
    }
  };

  return (
    <div ref={caja} className="relative">
      <button
        type="button"
        onClick={alternar}
        aria-expanded={abierta}
        aria-haspopup="dialog"
        aria-label={nuevos ? `${nuevos} ${nuevos === 1 ? "aviso nuevo" : "avisos nuevos"}` : "Avisos"}
        className={`relative flex size-11 items-center justify-center rounded-full text-xl hover:bg-fondo ${abierta ? "bg-fondo" : ""}`}
      >
        <span aria-hidden>🔔</span>
        {nuevos > 0 && <span className="absolute top-1 right-0.5 min-w-5 rounded-full bg-[var(--vence-fondo)] px-1 text-center text-xs leading-5 font-bold text-white">{nuevos > 9 ? "9+" : nuevos}</span>}
      </button>

      {cartel && !abierta && (
        <div role="status" className="fixed inset-x-2 top-16 z-50 flex items-center gap-2 rounded-2xl bg-[#172b4d] p-2 pl-4 text-white shadow-xl sm:right-4 sm:left-auto sm:w-96">
          <Link href={cartel.href} onClick={() => setCartel(null)} className="min-w-0 flex-1 py-2">
            <span className="block text-sm font-semibold opacity-80">{cartel.paraMi ? "👉 Para vos" : "🔔 Novedad"}</span>
            <span className="block font-medium">{cartel.texto}</span>
          </Link>
          <button type="button" onClick={() => setCartel(null)} aria-label="Cerrar el aviso" className="flex size-10 shrink-0 items-center justify-center rounded-full text-xl hover:bg-white/15">
            ×
          </button>
        </div>
      )}

      {abierta && (
        <div role="dialog" aria-label="Avisos" className="fixed inset-x-2 top-16 z-50 flex max-h-[78dvh] flex-col overflow-hidden rounded-2xl border border-borde bg-superficie shadow-2xl sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2 sm:w-[26rem]">
          <div className="flex items-center justify-between gap-2 border-b border-borde px-4 py-3">
            <p className="text-lg font-semibold">🔔 Avisos</p>
            {bandeja.notasSinLeer > 0 && (
              <BotonAccion accion={marcarTodasLeidasAccion} datos={{}} className="min-h-10 rounded-lg border border-borde px-3 text-sm font-semibold">
                Marcar las notas como leídas
              </BotonAccion>
            )}
          </div>
          <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {bandeja.avisos.length === 0 && (
              <li className="px-4 py-6 text-center text-texto-suave">No hay novedades. Acá vas a ver lo que cargue o cambie la otra persona, y lo que te pidan.</li>
            )}
            {bandeja.avisos.map((a) => (
              <li key={a.id} className="border-b border-borde last:border-b-0">
                <Link href={destinoDe(a)} onClick={() => setAbierta(false)} scroll={false} className={`flex gap-3 px-4 py-3 hover:bg-fondo ${a.nuevo ? "bg-marca/10" : ""}`}>
                  <Avatar persona={a.persona} />
                  <span className="min-w-0 flex-1">
                    {a.paraMi && <span className="mb-1 inline-block rounded-md bg-[var(--etiqueta-amarillo)] px-2 text-xs leading-5 font-bold text-etiqueta-texto">👉 Para vos</span>}
                    <span className="block">
                      <b>{a.persona.nombre.split(" ")[0]}</b> {textoDe(a)}
                    </span>
                    {a.texto && <span className="mt-1 block rounded-lg bg-fondo px-3 py-2 break-words whitespace-pre-line">{a.texto}</span>}
                    <span className="mt-0.5 flex items-center gap-2 text-xs text-texto-suave">
                      {a.nuevo && <span className="size-2 rounded-full bg-marca" aria-label="nuevo" />}
                      {ahora > 0 && tiempoRelativo(new Date(a.en), new Date(ahora), zonaHoraria)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2 border-t border-borde px-4 py-3">
            {bandeja.personas.length > 0 && (
              <details>
                <summary className="min-h-10 cursor-pointer py-2 font-semibold">✍️ Pedirle o avisarle algo a {bandeja.personas.length === 1 ? bandeja.personas[0]!.nombre.split(" ")[0] : "alguien"}</summary>
                <FormularioAccion accion={pedirAlgoAccion} boton="Enviar el aviso" className="flex flex-col gap-2 pt-1">
                  {bandeja.personas.length === 1 ? (
                    <input type="hidden" name="para" value={bandeja.personas[0]!.id} />
                  ) : (
                    <select name="para" aria-label="Para quién" className="h-11 rounded-lg border border-borde bg-superficie px-2">
                      {bandeja.personas.map((p) => (
                        <option key={p.id} value={p.id}>
                          Para {p.nombre}
                        </option>
                      ))}
                    </select>
                  )}
                  <textarea name="texto" rows={2} required maxLength={2000} placeholder="Ej. ¿Podés llamar al hospital por el pedido de mañana?" aria-label="Qué le querés pedir o avisar" className="rounded-lg border border-borde bg-superficie px-3 py-2" />
                </FormularioAccion>
              </details>
            )}
            {permiso === "default" && (
              <button type="button" onClick={pedirPermiso} className="min-h-10 rounded-lg border border-borde px-3 text-left text-sm font-medium">
                🖥️ Avisarme también cuando tengo la pantalla tapada (en la computadora)
              </button>
            )}
            <Link href="/actividad" onClick={() => setAbierta(false)} className="font-medium underline underline-offset-4">
              Ver toda la actividad y las notas →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
