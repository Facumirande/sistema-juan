import type { Parada } from "@/modulos/entregas/repartos";
import type { ParadaDeViaje } from "@/modulos/entregas/viaje";

import type { ParadaPlan } from "./planificador";

/** Las paradas de un reparto, como las usa el planificador del viaje. */
export function paradasDeReparto(paradas: readonly Parada[]): ParadaPlan[] {
  return paradas.map((p) => ({
    id: p.id,
    cliente: p.cliente,
    punto: p.punto,
    direccion: p.direccion,
    localidad: p.localidad,
    coordenada: p.latitud !== null && p.longitud !== null ? { lat: Number(p.latitud), lng: Number(p.longitud) } : null,
    horario: p.horario,
    telefono: p.telefono,
    hecha: p.estado === "ENTREGADA",
  }));
}

/** Las entregas del día que falta llevar, como las usa el planificador. */
export function paradasDelDia(paradas: readonly ParadaDeViaje[]): ParadaPlan[] {
  return paradas.map((p) => ({
    id: p.entregaId,
    cliente: p.cliente,
    punto: p.punto,
    direccion: p.direccion,
    localidad: p.localidad,
    coordenada: p.coordenada,
    horario: p.horario,
    telefono: p.telefono,
    hecha: false,
  }));
}
