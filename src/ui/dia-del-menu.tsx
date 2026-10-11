"use client";

import { usePathname, useRouter } from "next/navigation";

import { sumarDias } from "@/dominio/fechas/fechas";

import { elegirDia } from "./dia-en-curso";
import { nombreDelDia } from "./etiquetas";

// El día de las etapas del menú, con ‹ › para cambiarlo (pedido del usuario, 10/10/2026: el paso a
// paso del menú atado a un día, y que el día cambie en todos lados a la vez). Cambiarlo acá cambia el
// día elegido (`elegirDia`): el menú pasa a ese día en el momento y, si se está mirando una pantalla
// del día, también se la lleva a ese día.

const FECHA = /\d{4}-\d{2}-\d{2}/;

/** La misma pantalla del día con otra fecha, o nulo si la pantalla no es de un día. */
export function rutaConDia(pantalla: string, busqueda: string, fecha: string): string | null {
  if (/^\/preparacion\/\d{4}-\d{2}-\d{2}$/.test(pantalla)) return pantalla.replace(FECHA, fecha);
  if (!/^\/(inicio|lista-compra|entregas\/remitos|viaje)$/.test(pantalla)) return null;
  const parametros = new URLSearchParams(busqueda);
  parametros.set("fecha", fecha);
  parametros.delete("pedido");
  return `${pantalla}?${parametros.toString()}`;
}

export function DiaDelMenu({ fecha, hoy }: { fecha: string; hoy: string }) {
  const router = useRouter();
  const pantalla = usePathname();
  const ir = (nueva: string) => {
    // El menú cambia de día ya mismo (pide solo sus etapas); la pantalla del día, si se está en una, lo acompaña.
    elegirDia(nueva);
    const destino = rutaConDia(pantalla, window.location.search, nueva);
    if (destino) router.push(destino);
  };
  const flecha = "flex size-8 shrink-0 items-center justify-center rounded-lg text-lg leading-none text-texto-suave hover:bg-fondo hover:text-texto";
  return (
    <div className="flex items-center gap-1 px-1 pb-1">
      <button type="button" onClick={() => ir(sumarDias(fecha, -1))} aria-label="Día anterior" className={flecha}>
        ‹
      </button>
      <p className="min-w-0 flex-1 text-center leading-tight">
        <span className="block text-sm font-bold first-letter:uppercase">
          {nombreDelDia(fecha, hoy)} {fecha.slice(8, 10)}/{fecha.slice(5, 7)}
        </span>
        <span className="block text-xs text-texto-suave">Etapas del día</span>
      </p>
      <button type="button" onClick={() => ir(sumarDias(fecha, 1))} aria-label="Día siguiente" className={flecha}>
        ›
      </button>
    </div>
  );
}
