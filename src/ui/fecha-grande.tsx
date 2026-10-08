import { sumarDias } from "@/dominio/fechas/fechas";

import { fechaConDia } from "./etiquetas";

/** De qué día se trata, en una palabra y con su color: para no confundir lo de hoy con lo de otro día. */
export function queDiaEs(fecha: string, hoy: string): { cartel: string; color: string } {
  if (fecha === hoy) return { cartel: "HOY", color: "color-verde" };
  if (fecha === sumarDias(hoy, 1)) return { cartel: "MAÑANA", color: "color-azul" };
  if (fecha === sumarDias(hoy, -1)) return { cartel: "AYER", color: "color-amarillo" };
  return fecha < hoy ? { cartel: "YA PASÓ", color: "color-amarillo" } : { cartel: "MÁS ADELANTE", color: "color-violeta" };
}

/**
 * La fecha de lo que se está mirando, bien grande (pedido del usuario, 07/10/2026): el cartel de
 * color (HOY, MAÑANA, AYER…) y el día escrito completo. Va arriba en las pantallas del día.
 */
export function FechaGrande({ fecha, hoy, className = "" }: { fecha: string; hoy: string; className?: string }) {
  const cual = queDiaEs(fecha, hoy);
  return (
    <p className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${className}`}>
      <span className={`${cual.color} rounded-xl bg-[var(--col-fuerte)] px-3 py-1.5 text-lg font-extrabold tracking-wide text-[var(--col-fuerte-texto)]`}>{cual.cartel}</span>
      <span className="text-3xl leading-tight font-extrabold first-letter:uppercase sm:text-4xl">{fechaConDia(fecha)}</span>
    </p>
  );
}

/** La fecha de un documento (remito, lista, hoja): grande y en negrita, también impresa. */
export function FechaDeDocumento({ fecha, etiqueta = "Fecha" }: { fecha: string; etiqueta?: string }) {
  return (
    <p className="flex flex-col leading-tight">
      <span className="text-sm font-semibold tracking-wide uppercase opacity-70">{etiqueta}</span>
      <span className="text-2xl font-extrabold first-letter:uppercase print:text-xl">{fechaConDia(fecha)}</span>
    </p>
  );
}
