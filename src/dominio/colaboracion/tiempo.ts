import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";

import { hoyEnEmpresa, sumarDias } from "../fechas/fechas";

// Cuándo pasó algo, dicho como lo diría una persona: "recién", "hace 5 min", "hoy 14:32",
// "ayer 09:10" o "lun 21/09 18:05". Siempre en la zona horaria de la empresa.

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

export function tiempoRelativo(instante: Date, ahora: Date, zonaHoraria: string): string {
  const segundos = Math.round((ahora.getTime() - instante.getTime()) / 1000);
  if (segundos < 60 && segundos > -60) return "recién";
  if (segundos > 0 && segundos < 3600) return `hace ${Math.floor(segundos / 60)} min`;
  const local = new TZDate(instante, zonaHoraria);
  const hora = format(local, "HH:mm");
  const dia = hoyEnEmpresa(instante, zonaHoraria);
  const hoy = hoyEnEmpresa(ahora, zonaHoraria);
  if (dia === hoy) return `hoy ${hora}`;
  if (dia === sumarDias(hoy, -1)) return `ayer ${hora}`;
  return `${DIAS[local.getDay()]} ${format(local, "dd/MM")} ${hora}`;
}

/** Título de un grupo de actividad por día: "Hoy", "Ayer" o "Lunes 21/09". */
export function tituloDeDia(dia: string, hoy: string): string {
  if (dia === hoy) return "Hoy";
  if (dia === sumarDias(hoy, -1)) return "Ayer";
  const [a, m, d] = dia.split("-").map(Number);
  const nombre = new Date(Date.UTC(a!, m! - 1, d!)).toLocaleDateString("es-AR", { weekday: "long", timeZone: "UTC" });
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}
