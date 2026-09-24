import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";

import { ErrorDeNegocio } from "../errores";

/** Fecha operativa en formato `aaaa-mm-dd` (tipo `date` de PostgreSQL). */
export type FechaISO = string;

const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * "Hoy" en la zona horaria de la empresa. El servidor corre en UTC: nunca se usa su
 * fecha local (01 §18). `ahora` se recibe como parámetro para que la función sea pura.
 */
export function hoyEnEmpresa(ahora: Date, zonaHoraria: string): FechaISO {
  return format(new TZDate(ahora, zonaHoraria), "yyyy-MM-dd");
}

/** "24/09/2026" */
export function formatearFecha(fecha: FechaISO): string {
  if (!PATRON_FECHA.test(fecha)) throw new ErrorDeNegocio("VALIDACION", `Fecha inválida: ${fecha}.`);
  const [anio, mes, dia] = fecha.split("-");
  return `${dia}/${mes}/${anio}`;
}

/** "24/09/2026 07:40" en la zona de la empresa, 24 h. */
export function formatearFechaHora(instante: Date, zonaHoraria: string): string {
  return format(new TZDate(instante, zonaHoraria), "dd/MM/yyyy HH:mm");
}

/** Suma días a una fecha operativa (vencimientos: fecha de compra + plazo, RN-106). */
export function sumarDias(fecha: FechaISO, dias: number): FechaISO {
  if (!PATRON_FECHA.test(fecha)) throw new ErrorDeNegocio("VALIDACION", `Fecha inválida: ${fecha}.`);
  if (!Number.isInteger(dias)) throw new ErrorDeNegocio("VALIDACION", "La cantidad de días debe ser entera.");
  const base = new Date(`${fecha}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
}
