"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { textoDeNovedades } from "@/dominio/colaboracion/avisos";
import { tiempoRelativo } from "@/dominio/colaboracion/tiempo";
import { formatearMoneda } from "@/dominio/dinero/formato";
import type { AvisoVisible, BandejaDeAvisos } from "@/modulos/colaboracion/avisos";

import { Avatar } from "@/ui/avatar";
import { BotonAccion } from "@/ui/boton-accion";
import { enlaceDeEntidad } from "@/ui/enlaces";
import { fechaConDia, nombreDelDia } from "@/ui/etiquetas";
import { FormularioAccion } from "@/ui/formulario-accion";
import { EVENTO_CAMBIO } from "@/ui/pulso";

import { marcarAvisosVistosAccion, marcarTodasLeidasAccion, pedirAlgoAccion } from "./acciones";

// La campanita del encabezado: cuántas novedades hay, el panel con lo que cargó o cambió cada
// persona (lo dirigido a uno, destacado). No hay carteles emergentes dentro de la app (pedido del
// usuario, 07/10/2026): las novedades suman en el número de la campanita. Pregunta al servidor cada medio minuto
// y, además, apenas alguien guarda algo (el evento del pulso, `src/ui/pulso.tsx`, que es el que redibuja las pantallas).

const CADA_CUANTO_MS = 30_000;

const destinoDe = (a: AvisoVisible) => (!a.entidad ? "/actividad" : a.entidad.tipo === "USUARIO" && a.clase === "NOTA" ? "/actividad?ver=notas" : enlaceDeEntidad(a.entidad.tipo, a.entidad.id, a.entidad.fecha));

/** "cargó el pedido…" o, si es una nota, "te dejó una nota en PED-000012 · Hospital". */
const textoDe = (a: AvisoVisible) => (a.clase === "NOTA" && a.entidad && a.entidad.tipo !== "USUARIO" ? `${a.resumen} en ${a.entidad.etiqueta}` : a.resumen);

// El panel en tres partes (pedido del usuario, 10/10/2026): "Avisos" (lo importante para corregir,
// como productos sin precio o un día en el que los gastos superan la caja inicial), "Actividad" (lo que se toca en el sistema, quién y hace cuánto) y
// "Notificaciones" (lo dirigido a uno: una tarea que le pasaron, un mensaje, una nota).
type Pestana = "avisos" | "actividad" | "notificaciones";
const esNotificacion = (a: AvisoVisible) => a.paraMi || a.clase === "NOTA";

const SIN_AVISOS: BandejaDeAvisos = { nuevos: 0, notasSinLeer: 0, avisos: [], personas: [], paraRevisar: [], cajaSuperada: [] };

/** "Hoy, viernes 10/10": el día de un aviso de caja, dicho como en el resto del sistema. */
function diaDeCaja(c: BandejaDeAvisos["cajaSuperada"][number]): string {
  const cercano = nombreDelDia(c.fecha, c.hoy);
  return ["Hoy", "Mañana", "Ayer"].includes(cercano) ? `${cercano}, ${fechaConDia(c.fecha)}` : fechaConDia(c.fecha).replace(/^./, (l) => l.toUpperCase());
}

export function Campanita({ zonaHoraria }: { zonaHoraria: string }) {
  // Los avisos no demoran ninguna pantalla: los pide la campanita apenas aparece y después cada medio minuto.
  const [bandeja, setBandeja] = useState<BandejaDeAvisos>(SIN_AVISOS);
  const cargada = useRef(false);
  const consultarAhora = useRef<() => void>(() => undefined);

  const [abierta, setAbierta] = useState(false);
  const [pestana, setPestana] = useState<Pestana>("notificaciones");
  const [vistos, setVistos] = useState(false);
  const [ahora, setAhora] = useState(0);
  const [permiso, setPermiso] = useState<NotificationPermission | "sin-soporte">("sin-soporte");
  const conocidos = useRef(new Set<string>());
  /** Los días que ya se sabía que tenían la caja superada: el aviso de afuera sale una vez por día. */
  const cajasAvisadas = useRef(new Set<string>());
  const caja = useRef<HTMLDivElement>(null);
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
        // La primera vez solo se toma nota de lo que hay: no es una novedad.
        const novedades = cargada.current ? nueva.avisos.filter((a) => a.nuevo && !conocidos.current.has(a.id)) : [];
        // Un día que recién ahora superó la caja inicial: con la pantalla tapada, se avisa afuera.
        const cajasNuevas = cargada.current ? nueva.cajaSuperada.filter((c) => !cajasAvisadas.current.has(c.fecha)) : [];
        cargada.current = true;
        for (const a of nueva.avisos) conocidos.current.add(a.id);
        cajasAvisadas.current = new Set(nueva.cajaSuperada.map((c) => c.fecha));
        setBandeja(nueva);
        if (cajasNuevas.length > 0 && document.visibilityState !== "visible" && conPermiso) {
          try {
            const c = cajasNuevas[0]!;
            new Notification("Sistema Repartos", { body: `${diaDeCaja(c)}: los gastos superan la caja inicial por ${formatearMoneda(c.exceso)}.`, tag: "sistema-repartos-caja" });
          } catch {
            // En el celular el navegador no deja avisar así: queda la campanita.
          }
        }
        if (novedades.length === 0) return;
        setVistos(false);
        const texto = textoDeNovedades(novedades.map((a) => ({ persona: a.persona.nombre, resumen: textoDe(a) })));
        if (texto) {
          if (document.visibilityState !== "visible" && conPermiso) {
            try {
              new Notification("Sistema Repartos", { body: texto, tag: "sistema-repartos" });
            } catch {
              // En el celular el navegador no deja avisar así: queda la campanita.
            }
          }
        }
      } catch {
        // Sin conexión por un momento: se vuelve a preguntar en la próxima vuelta.
      }
    };
    consultarAhora.current = () => void consultar();
    void consultar();
    const reloj = setInterval(consultar, CADA_CUANTO_MS);
    const alVolver = () => {
      if (document.visibilityState === "visible") void consultar();
    };
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener(EVENTO_CAMBIO, alVolver);
    return () => {
      viva = false;
      clearInterval(reloj);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener(EVENTO_CAMBIO, alVolver);
    };
  }, []);

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
  /** Lo importante para corregir: productos para revisar y días con la caja inicial superada. */
  const importantes = bandeja.paraRevisar.length + bandeja.cajaSuperada.length;
  const notificaciones = bandeja.avisos.filter(esNotificacion);
  const actividad = bandeja.avisos.filter((a) => !esNotificacion(a));
  const alternar = () => {
    if (abierta) {
      setAbierta(false);
      return;
    }
    setAbierta(true);
    setAhora(Date.now());
    const notificacionesNuevas = bandeja.avisos.some((a) => a.nuevo && esNotificacion(a));
    const actividadNueva = bandeja.avisos.some((a) => a.nuevo && !esNotificacion(a));
    setPestana(notificacionesNuevas ? "notificaciones" : bandeja.cajaSuperada.length > 0 ? "avisos" : actividadNueva ? "actividad" : importantes > 0 ? "avisos" : "notificaciones");
    setPermiso("Notification" in window ? Notification.permission : "sin-soporte");
    if (bandeja.nuevos > bandeja.notasSinLeer && !vistos) {
      setVistos(true);
      void marcarAvisosVistosAccion();
      setBandeja((b) => ({ ...b, nuevos: b.notasSinLeer, avisos: b.avisos.map((a) => (a.clase === "NOTA" ? a : { ...a, nuevo: false })) }));
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
        {nuevos === 0 && importantes > 0 && (
          <span
            className={`absolute top-1 right-0.5 min-w-5 rounded-full px-1 text-center text-xs leading-5 font-bold ${bandeja.cajaSuperada.length > 0 ? "bg-[var(--vence-fondo)] text-white" : "bg-amber-500 text-black"}`}
            title={bandeja.cajaSuperada.length > 0 ? "Los gastos superan la caja inicial" : "Hay productos para revisar"}
          >
            !
          </span>
        )}
      </button>

      {abierta && (
        <div role="dialog" aria-label="Avisos, actividad y notificaciones" className="fixed inset-x-2 top-16 z-50 flex max-h-[78dvh] flex-col overflow-hidden rounded-2xl border border-borde bg-superficie shadow-2xl sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2 sm:w-[26rem]">
          <div className="flex flex-col gap-2 border-b border-borde px-3 pt-3 pb-2">
            <div role="tablist" aria-label="Qué ver" className="grid grid-cols-3 gap-1 rounded-xl bg-fondo p-1">
              {(
                [
                  ["avisos", "Avisos", importantes],
                  ["actividad", "Actividad", actividad.filter((a) => a.nuevo).length],
                  ["notificaciones", "Notificaciones", notificaciones.filter((a) => a.nuevo).length],
                ] as const
              ).map(([clave, texto, n]) => (
                <button
                  key={clave}
                  type="button"
                  role="tab"
                  aria-selected={pestana === clave}
                  onClick={() => setPestana(clave)}
                  className={`flex min-h-10 flex-wrap items-center justify-center gap-x-1.5 rounded-lg px-1 text-sm font-semibold ${pestana === clave ? "bg-superficie shadow-sm" : "text-texto-suave hover:text-texto"}`}
                >
                  {texto}
                  {n > 0 && <span className={`min-w-5 rounded-full px-1.5 text-xs leading-5 font-bold ${clave === "avisos" ? "bg-amber-500 text-black" : "bg-[var(--vence-fondo)] text-white"}`}>{n > 9 ? "9+" : n}</span>}
                </button>
              ))}
            </div>
            {pestana === "notificaciones" && bandeja.notasSinLeer > 0 && (
              <BotonAccion accion={marcarTodasLeidasAccion} datos={{}} className="min-h-9 self-end rounded-lg border border-borde px-3 text-sm font-semibold">
                Marcar las notas como leídas
              </BotonAccion>
            )}
          </div>
          <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto" role="tabpanel">
            {pestana === "avisos" &&
              bandeja.cajaSuperada.map((c) => (
                <li key={`caja-${c.fecha}`} className="border-b border-borde last:border-b-0">
                  <Link href={c.href} onClick={() => setAbierta(false)} className="block bg-[var(--vence-fondo)]/10 px-4 py-3 hover:bg-[var(--vence-fondo)]/20">
                    <b className="underline underline-offset-2">⚠ Los gastos superan la caja inicial</b>
                    <span className="block text-sm">
                      {diaDeCaja(c)}: gastos {formatearMoneda(c.gastos)}, caja inicial {formatearMoneda(c.cajaInicial)}. Se pasan por <b>{formatearMoneda(c.exceso)}</b>.
                    </span>
                  </Link>
                </li>
              ))}
            {pestana === "avisos" &&
              (importantes === 0 ? (
                <li className="px-4 py-6 text-center text-texto-suave">Nada para corregir. Acá aparece lo importante, como un producto sin precio o gastos que superan la caja inicial.</li>
              ) : (
                bandeja.paraRevisar.map((p) => (
                  <li key={p.id} className="border-b border-borde last:border-b-0">
                    <Link href={p.href} onClick={() => setAbierta(false)} className="block px-4 py-3 hover:bg-fondo">
                      <b className="underline underline-offset-2">⚠ {p.producto}</b>
                      {p.problemas.map((texto) => (
                        <span key={texto} className="block text-sm text-texto-suave">
                          {texto}
                        </span>
                      ))}
                    </Link>
                  </li>
                ))
              ))}
            {pestana !== "avisos" && (pestana === "actividad" ? actividad : notificaciones).length === 0 && (
              <li className="px-4 py-6 text-center text-texto-suave">
                {pestana === "actividad" ? "Todavía no hay actividad de los demás. Acá vas a ver lo que cargue o cambie cada uno." : "Nada para vos. Acá llegan las tareas que te pasan, las notas y lo que te piden."}
              </li>
            )}
            {pestana !== "avisos" &&
              (pestana === "actividad" ? actividad : notificaciones).map((a) => (
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
            {pestana === "notificaciones" && bandeja.personas.length > 0 && (
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
