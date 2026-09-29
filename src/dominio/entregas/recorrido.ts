// Recorrido del reparto (uso interno, 28/09/2026): el orden de las paradas que hace el viaje más
// corto, con la primera parada elegida a mano si se quiere. Las distancias son en línea recta
// multiplicadas por un factor de calles, y el tiempo, a una velocidad promedio de ciudad: son
// aproximadas y sirven para ordenar y para darse una idea. El camino exacto lo da el GPS.

export interface Coordenada {
  lat: number;
  lng: number;
}

export interface ParadaRecorrido {
  id: string;
  coordenada: Coordenada | null;
}

export interface OpcionesRecorrido {
  /** De dónde sale el viaje (el depósito o donde está el repartidor); nulo = desde la primera parada. */
  salida: Coordenada | null;
  /** Parada que va primero, elegida a mano. */
  primeraId?: string | null;
  /** Volver a la salida al terminar. */
  volver?: boolean;
}

export interface TramoRecorrido {
  /** Parada a la que se llega; nulo = la vuelta a la salida. */
  hastaId: string | null;
  /** Nulo si falta la ubicación de alguna punta. */
  km: number | null;
  minutos: number | null;
}

export interface Recorrido {
  orden: string[];
  tramos: TramoRecorrido[];
  kmTotal: number;
  minutosTotal: number;
  /** Paradas sin ubicación: van al final, en el orden en que estaban. */
  sinUbicacion: string[];
}

const RADIO_TIERRA_KM = 6371;
/** Las calles no van en línea recta. */
export const FACTOR_CALLES = 1.3;
/** Velocidad promedio de un reparto en la ciudad, con semáforos y descargas en el camino. */
export const VELOCIDAD_KMH = 25;
/** Hasta esta cantidad de paradas se prueban todos los órdenes posibles. */
const MAXIMO_EXACTO = 8;

/** Distancia en línea recta entre dos puntos, en km (fórmula del haversine). */
export function distanciaKm(a: Coordenada, b: Coordenada): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * RADIO_TIERRA_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Kilómetros por calle (aprox., con un decimal) y minutos de manejo (al menos 1) de un tramo. */
export function estimarTramo(a: Coordenada, b: Coordenada): { km: number; minutos: number } {
  const km = distanciaKm(a, b) * FACTOR_CALLES;
  return { km: Math.round(km * 10) / 10, minutos: Math.max(1, Math.round((km / VELOCIDAD_KMH) * 60)) };
}

/** Largo de un viaje que pasa por los puntos en ese orden (y vuelve, si se pide). */
function largo(inicio: Coordenada | null, puntos: readonly Coordenada[], volverA: Coordenada | null): number {
  let total = 0;
  let previo = inicio;
  for (const p of puntos) {
    if (previo) total += distanciaKm(previo, p);
    previo = p;
  }
  if (volverA && previo) total += distanciaKm(previo, volverA);
  return total;
}

/**
 * El mejor orden probando todos (pocas paradas). Si dos órdenes miden lo mismo (ida y vuelta por
 * la misma calle, en un sentido o en el otro), se prefiere el que va primero a la más cercana.
 */
function mejorOrdenExacto(inicio: Coordenada | null, paradas: readonly ParadaConUbicacion[], volverA: Coordenada | null): ParadaConUbicacion[] {
  const primerTramo = (orden: readonly ParadaConUbicacion[]) => (inicio && orden[0] ? distanciaKm(inicio, orden[0].coordenada) : 0);
  let mejor: ParadaConUbicacion[] = [...paradas];
  let mejorLargo = largo(inicio, mejor.map((p) => p.coordenada), volverA);
  const permutar = (elegidas: ParadaConUbicacion[], resto: ParadaConUbicacion[]) => {
    if (resto.length === 0) {
      const l = largo(inicio, elegidas.map((p) => p.coordenada), volverA);
      const empata = Math.abs(l - mejorLargo) <= 1e-9;
      if (l < mejorLargo - 1e-9 || (empata && primerTramo(elegidas) < primerTramo(mejor) - 1e-9)) {
        mejor = elegidas;
        mejorLargo = l;
      }
      return;
    }
    for (const [i, p] of resto.entries()) permutar([...elegidas, p], [...resto.slice(0, i), ...resto.slice(i + 1)]);
  };
  permutar([], [...paradas]);
  return mejor;
}

/** Muchas paradas: la más cercana cada vez y después se mejoran los cruces (2-opt). */
function mejorOrdenAproximado(inicio: Coordenada | null, paradas: readonly ParadaConUbicacion[], volverA: Coordenada | null): ParadaConUbicacion[] {
  const pendientes = [...paradas];
  const orden: ParadaConUbicacion[] = [];
  let actual = inicio ?? pendientes[0]!.coordenada;
  while (pendientes.length > 0) {
    let i = 0;
    for (let j = 1; j < pendientes.length; j++) {
      if (distanciaKm(actual, pendientes[j]!.coordenada) < distanciaKm(actual, pendientes[i]!.coordenada)) i = j;
    }
    const [siguiente] = pendientes.splice(i, 1);
    orden.push(siguiente!);
    actual = siguiente!.coordenada;
  }
  let mejoro = true;
  while (mejoro) {
    mejoro = false;
    for (let i = 0; i < orden.length - 1; i++) {
      for (let k = i + 1; k < orden.length; k++) {
        const candidato = [...orden.slice(0, i), ...orden.slice(i, k + 1).reverse(), ...orden.slice(k + 1)];
        if (largo(inicio, candidato.map((p) => p.coordenada), volverA) < largo(inicio, orden.map((p) => p.coordenada), volverA) - 1e-9) {
          orden.splice(0, orden.length, ...candidato);
          mejoro = true;
        }
      }
    }
  }
  return orden;
}

interface ParadaConUbicacion {
  id: string;
  coordenada: Coordenada;
}

/**
 * El orden de las paradas que hace el viaje más corto. La primera elegida a mano va primero;
 * las paradas sin ubicación van al final, en el orden en que estaban.
 */
export function planearRecorrido(paradas: readonly ParadaRecorrido[], opciones: OpcionesRecorrido): Recorrido {
  const primera = opciones.primeraId ? (paradas.find((p) => p.id === opciones.primeraId) ?? null) : null;
  const conUbicacion = paradas.filter((p): p is ParadaConUbicacion => p.coordenada !== null && p.id !== primera?.id);
  const sinUbicacion = paradas.filter((p) => p.coordenada === null && p.id !== primera?.id).map((p) => p.id);
  const volverA = opciones.volver ? opciones.salida : null;
  const inicio = primera?.coordenada ?? opciones.salida;

  let ordenados: ParadaConUbicacion[];
  if (conUbicacion.length <= 1) ordenados = conUbicacion;
  else if (conUbicacion.length <= MAXIMO_EXACTO) ordenados = mejorOrdenExacto(inicio, conUbicacion, volverA);
  else ordenados = mejorOrdenAproximado(inicio, conUbicacion, volverA);

  const orden = [...(primera ? [primera.id] : []), ...ordenados.map((p) => p.id), ...sinUbicacion];
  const donde = new Map(paradas.map((p) => [p.id, p.coordenada]));
  const tramos: TramoRecorrido[] = [];
  let previo: Coordenada | null = opciones.salida;
  let hayPrevio = opciones.salida !== null;
  for (const id of orden) {
    const aca = donde.get(id) ?? null;
    if (hayPrevio) tramos.push(previo && aca ? { hastaId: id, ...estimarTramo(previo, aca) } : { hastaId: id, km: null, minutos: null });
    previo = aca;
    hayPrevio = true;
  }
  if (opciones.volver && opciones.salida && orden.length > 0) {
    tramos.push(previo ? { hastaId: null, ...estimarTramo(previo, opciones.salida) } : { hastaId: null, km: null, minutos: null });
  }
  return {
    orden,
    tramos,
    kmTotal: Math.round(tramos.reduce((s, t) => s + (t.km ?? 0), 0) * 10) / 10,
    minutosTotal: tramos.reduce((s, t) => s + (t.minutos ?? 0), 0),
    sinUbicacion,
  };
}
