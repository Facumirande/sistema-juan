"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { fechaConDia, nombreDelDia } from "@/ui/etiquetas";

import { elegirDia } from "./dia-en-curso";
import { diasDelMesAccion } from "./dias-acciones";

// Los días para elegir en qué jornada se trabaja (como el selector de tableros de Trello). Una tira
// con hoy y los próximos días (siempre) más los que tienen algo, cada uno con cuántos pedidos tiene;
// y al final, el calendario (pedido del usuario, 08/10/2026): se abre ahí mismo, sin ir a otra
// pantalla, con los días que tienen pedidos marcados, y al tocar un día se va a ese día. Lo usan el
// tablero, el paso a paso y la lista de compras. Al tocar un día responde en el momento: ese día
// queda marcado y el menú ya pasa a él (`elegirDia`), mientras llega la pantalla.

export interface DiaParaElegir {
  fecha: string;
  estado: string | null;
  pedidos: number;
}

const SEMANA = ["lu", "ma", "mi", "ju", "vi", "sá", "do"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const cuantosPedidos = (d: DiaParaElegir) => (d.estado === "CERRADA" ? "cerrado" : d.pedidos === 0 ? "sin pedidos" : d.pedidos === 1 ? "1 pedido" : `${d.pedidos} pedidos`);

/** El mes siguiente o anterior de "AAAA-MM". */
function otroMes(mes: string, paso: number): string {
  const [a, m] = mes.split("-").map(Number) as [number, number];
  const total = a * 12 + (m - 1) + paso;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** Las semanas del mes (de lunes a domingo); los huecos antes del día 1 y después del último van vacíos. */
function semanasDelMes(mes: string): (string | null)[][] {
  const [a, m] = mes.split("-").map(Number) as [number, number];
  const dias = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const antes = (new Date(Date.UTC(a, m - 1, 1)).getUTCDay() + 6) % 7;
  const celdas: (string | null)[] = [...Array.from({ length: antes }, () => null), ...Array.from({ length: dias }, (_, i) => `${mes}-${String(i + 1).padStart(2, "0")}`)];
  while (celdas.length % 7) celdas.push(null);
  return Array.from({ length: celdas.length / 7 }, (_, i) => celdas.slice(i * 7, i * 7 + 7));
}

function Calendario({ fecha, hoy, conocidos, ruta, cerrar, alElegir }: { fecha: string; hoy: string; conocidos: readonly DiaParaElegir[]; ruta: string; cerrar: () => void; alElegir: (fecha: string) => void }) {
  const router = useRouter();
  const [mes, setMes] = useState(fecha.slice(0, 7));
  const [marcas, setMarcas] = useState<Map<string, DiaParaElegir>>(() => new Map(conocidos.map((d) => [d.fecha, d])));
  const [cargado, setCargado] = useState<string | null>(null);
  // Las marcas (pedidos, cerrado) del mes que se ve se piden al servidor cada vez que cambia el mes.
  useEffect(() => {
    let vivo = true;
    void diasDelMesAccion(mes).then((dias) => {
      if (!vivo) return;
      setMarcas((previas) => new Map([...previas, ...dias.map((d) => [d.fecha, d] as const)]));
      setCargado(mes);
    });
    return () => {
      vivo = false;
    };
  }, [mes]);
  const buscando = cargado !== mes;
  const cargar = setMes;
  const [a, m] = mes.split("-").map(Number) as [number, number];
  const ir = (f: string) => {
    cerrar();
    alElegir(f);
    router.push(ruta.replace("{fecha}", f));
  };
  const flecha = "flex size-11 items-center justify-center rounded-full text-2xl font-bold hover:bg-fondo";
  // Colgado del documento: sobre toda la pantalla, también desde adentro del tablero.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Elegir el día en el calendario">
      <button type="button" aria-label="Cerrar el calendario" onClick={cerrar} className="hoja-fondo absolute inset-0 cursor-default bg-black/55" />
      <div className="hoja-panel relative flex w-full flex-col gap-3 rounded-t-3xl bg-superficie px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] text-texto shadow-2xl sm:max-w-sm sm:rounded-3xl sm:pb-4">
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={() => cargar(otroMes(mes, -1))} aria-label="Mes anterior" className={flecha}>
            ‹
          </button>
          <p className="text-xl font-bold capitalize" aria-live="polite">
            {MESES[m - 1]} {a}
            {buscando && <span className="ml-2 inline-block size-3 animate-pulse rounded-full bg-marca align-middle" aria-hidden />}
          </p>
          <button type="button" onClick={() => cargar(otroMes(mes, 1))} aria-label="Mes siguiente" className={flecha}>
            ›
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-sm font-semibold text-texto-suave" aria-hidden>
          {SEMANA.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1" role="grid">
          {semanasDelMes(mes).flatMap((semana, i) =>
            semana.map((f, j) => {
              if (!f) return <span key={`${i}-${j}`} />;
              const d = marcas.get(f);
              const elegido = f === fecha;
              const esHoy = f === hoy;
              const conPedidos = d && d.pedidos > 0;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => ir(f)}
                  aria-current={elegido ? "date" : undefined}
                  aria-label={`${fechaConDia(f)}${d ? `, ${cuantosPedidos(d)}` : ""}`}
                  className={`relative flex aspect-square flex-col items-center justify-center rounded-xl text-lg leading-none font-bold transition-colors ${
                    elegido ? "bg-marca text-marca-texto" : conPedidos ? "bg-marca/15 hover:bg-marca/25" : f < hoy ? "text-texto-suave hover:bg-fondo" : "hover:bg-fondo"
                  } ${esHoy && !elegido ? "ring-2 ring-marca" : ""}`}
                >
                  {Number(f.slice(8, 10))}
                  {d?.estado === "CERRADA" ? (
                    <span aria-hidden className="text-[0.6rem] leading-none">
                      🔒
                    </span>
                  ) : (
                    conPedidos && <span className={`mt-0.5 text-xs font-extrabold ${elegido ? "" : "text-marca"}`}>{d.pedidos}</span>
                  )}
                </button>
              );
            }),
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-borde pt-3">
          <span className="text-sm text-texto-suave">El número es cuántos pedidos tiene.</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => ir(hoy)} className="min-h-11 rounded-xl border-2 border-borde px-4 font-semibold hover:border-marca">
              Hoy
            </button>
            <button type="button" onClick={cerrar} className="min-h-11 rounded-xl px-3 font-semibold hover:bg-fondo">
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function SelectorDeDia({
  dias,
  fecha,
  hoy,
  ruta,
  sobreFondo = false,
}: {
  dias: readonly DiaParaElegir[];
  fecha: string;
  hoy: string;
  /** A dónde lleva cada día: la dirección con `{fecha}` donde va el día ("/inicio?fecha={fecha}"). */
  ruta: string;
  /** Va sobre el fondo con imagen del tablero (botones blancos translúcidos). */
  sobreFondo?: boolean;
}) {
  const [calendario, setCalendario] = useState(false);
  const tira = useRef<HTMLDivElement>(null);
  // El día que se tocó queda marcado en el momento, hasta que llega su pantalla (ahí `fecha` ya es ese día).
  const [tocado, setTocado] = useState<{ desde: string; fecha: string } | null>(null);
  const marcado = tocado && tocado.desde === fecha ? tocado.fecha : fecha;
  const yendo = marcado !== fecha;
  const elegir = (f: string) => {
    if (f !== fecha) setTocado({ desde: fecha, fecha: f });
    elegirDia(f);
  };
  // El día que se está mirando queda a la vista en la tira (al medio, si se puede).
  useLayoutEffect(() => {
    const t = tira.current;
    const elegido = t?.querySelector<HTMLElement>('[aria-current="date"]');
    if (t && elegido && t.scrollWidth > t.clientWidth) t.scrollLeft = elegido.offsetLeft - (t.clientWidth - elegido.offsetWidth) / 2;
  }, [fecha]);
  const boton = sobreFondo ? "bg-white/20 text-white hover:bg-white/30" : "border border-borde bg-superficie hover:border-marca/60";
  return (
    <nav aria-label="Elegir el día" className="flex min-w-0 items-center gap-2">
      <div ref={tira} className="sin-barra relative -mx-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-1 pt-2 pb-1">
        {dias.map((x) => {
          const elegido = x.fecha === marcado;
          const clases = sobreFondo
            ? elegido
              ? "bg-white text-[#172b4d] shadow-md"
              : "bg-white/20 text-white hover:bg-white/30"
            : elegido
              ? "border border-marca bg-marca text-marca-texto"
              : "border border-borde bg-superficie hover:border-marca/60";
          return (
            <Link
              key={x.fecha}
              href={ruta.replace("{fecha}", x.fecha)}
              onClick={() => elegir(x.fecha)}
              aria-current={elegido ? "date" : undefined}
              aria-label={`${fechaConDia(x.fecha)}, ${cuantosPedidos(x)}`}
              className={`relative flex min-h-12 min-w-[3.6rem] shrink-0 flex-col items-center justify-center rounded-xl px-2 py-1 text-center leading-none ${clases} ${x.fecha === hoy && !elegido ? "ring-2 ring-white/70" : ""} ${elegido && yendo ? "animate-pulse" : ""}`}
            >
              <span className="text-xs font-bold uppercase">{nombreDelDia(x.fecha, hoy)}</span>
              <span className="mt-0.5 text-lg font-extrabold tabular-nums">
                {x.fecha.slice(8, 10)}/{x.fecha.slice(5, 7)}
              </span>
              {x.estado === "CERRADA" ? (
                <span aria-hidden className="absolute -top-2 -right-1 text-sm leading-none">
                  🔒
                </span>
              ) : (
                x.pedidos > 0 && (
                  <span aria-hidden className="absolute -top-2 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--etiqueta-azul)] px-1 text-xs font-extrabold text-white shadow">
                    {x.pedidos}
                  </span>
                )
              )}
            </Link>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => setCalendario(true)}
        aria-haspopup="dialog"
        aria-label="Elegir otro día en el calendario"
        title="Elegir otro día en el calendario"
        className={`mt-1 flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl px-3 font-semibold ${boton}`}
      >
        <span aria-hidden className="text-xl leading-none">
          📅
        </span>
        <span className="hidden text-sm xl:inline">Calendario</span>
      </button>
      {calendario && <Calendario fecha={fecha} hoy={hoy} conocidos={dias} ruta={ruta} cerrar={() => setCalendario(false)} alElegir={elegir} />}
    </nav>
  );
}
