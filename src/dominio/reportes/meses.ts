import type { FechaISO } from "@/dominio/fechas/fechas";

// El balance de cada mes, para bajarlo en Excel: qué meses se ofrecen y qué fechas abarca cada uno.
// Se ofrecen los últimos meses hasta un máximo; los más viejos salen solos de la lista.

/** Cuántos meses se ofrecen como mucho (dos años): los anteriores dejan de listarse. */
export const MESES_QUE_SE_GUARDAN = 24;

const NOMBRES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const PATRON_MES = /^\d{4}-(0[1-9]|1[0-2])$/;

/** "2026-10" */
export type Mes = string;

export const esMes = (texto: string): texto is Mes => PATRON_MES.test(texto);

/** El mes de una fecha: "2026-10-07" → "2026-10". */
export const mesDe = (fecha: FechaISO): Mes => fecha.slice(0, 7);

/** Suma (o resta) meses: sumarMeses("2026-01", -2) → "2025-11". */
export function sumarMeses(mes: Mes, cuantos: number): Mes {
  const total = Number(mes.slice(0, 4)) * 12 + (Number(mes.slice(5, 7)) - 1) + cuantos;
  return `${String(Math.floor(total / 12)).padStart(4, "0")}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** "octubre de 2026" */
export const nombreDeMes = (mes: Mes): string => `${NOMBRES[Number(mes.slice(5, 7)) - 1]} de ${mes.slice(0, 4)}`;

/** El mes más viejo que todavía se ofrece. */
export const primerMesGuardado = (hoy: FechaISO, maximo: number = MESES_QUE_SE_GUARDAN): Mes => sumarMeses(mesDe(hoy), -(maximo - 1));

export interface RangoDeMes {
  mes: Mes;
  desde: FechaISO;
  /** El último día del mes, o hoy si el mes todavía no terminó. */
  hasta: FechaISO;
  enCurso: boolean;
}

/**
 * Las fechas que abarca un mes. Devuelve null si el mes todavía no empezó o si ya es más viejo
 * que los que se guardan.
 */
export function rangoDeMes(mes: Mes, hoy: FechaISO, maximo: number = MESES_QUE_SE_GUARDAN): RangoDeMes | null {
  if (!esMes(mes) || mes > mesDe(hoy) || mes < primerMesGuardado(hoy, maximo)) return null;
  const ultimoDia = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).getUTCDate();
  const enCurso = mes === mesDe(hoy);
  return { mes, desde: `${mes}-01`, hasta: enCurso ? hoy : `${mes}-${String(ultimoDia).padStart(2, "0")}`, enCurso };
}

/**
 * Los meses que se listan, del más nuevo al más viejo: desde el primero que tuvo movimientos
 * (dentro de los que se guardan) hasta el mes en curso.
 */
export function mesesParaListar(hoy: FechaISO, tuvoMovimientos: (mes: Mes) => boolean, maximo: number = MESES_QUE_SE_GUARDAN): RangoDeMes[] {
  const todos = Array.from({ length: maximo }, (_, i) => sumarMeses(primerMesGuardado(hoy, maximo), i));
  const primero = todos.findIndex(tuvoMovimientos);
  if (primero < 0) return [];
  return todos
    .slice(primero)
    .reverse()
    .map((m) => rangoDeMes(m, hoy, maximo)!);
}
