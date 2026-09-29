import type { Coordenada } from "./recorrido";

// Enlaces para ir a entregar con el GPS del celular (Google Maps o Waze). Si el lugar tiene la
// ubicación marcada se usan sus coordenadas; si no, la dirección escrita (el mapa la busca).

export interface DestinoGps {
  coordenada: Coordenada | null;
  direccion: string;
  localidad?: string | null;
}

/** Google Maps acepta hasta 9 puntos intermedios en un mismo viaje. */
const PARADAS_POR_ENLACE = 10;

const coordenadas = (c: Coordenada) => `${c.lat.toFixed(6)},${c.lng.toFixed(6)}`;

/** Cómo se le pasa el destino al mapa: coordenadas, o la dirección con la localidad y el país. */
export function textoDeDestino(d: DestinoGps): string {
  if (d.coordenada) return coordenadas(d.coordenada);
  return [d.direccion, d.localidad, "Argentina"].filter((x) => x?.trim()).join(", ");
}

/**
 * Enlaces de Google Maps para hacer el viaje en orden. Sin origen, arranca desde donde está el
 * celular. Con más de 10 paradas se parte en varios viajes: cada uno sale de la última parada del
 * anterior.
 */
export function enlacesGoogleMaps(destinos: readonly DestinoGps[], origen?: DestinoGps | null): string[] {
  const enlaces: string[] = [];
  let desde = origen ?? null;
  for (let i = 0; i < destinos.length; i += PARADAS_POR_ENLACE) {
    const tramo = destinos.slice(i, i + PARADAS_POR_ENLACE);
    const destino = tramo[tramo.length - 1]!;
    const intermedios = tramo.slice(0, -1);
    const parametros = new URLSearchParams({ api: "1" });
    if (desde) parametros.set("origin", textoDeDestino(desde));
    parametros.set("destination", textoDeDestino(destino));
    if (intermedios.length > 0) parametros.set("waypoints", intermedios.map(textoDeDestino).join("|"));
    parametros.set("travelmode", "driving");
    enlaces.push(`https://www.google.com/maps/dir/?${parametros.toString()}`);
    desde = destino;
  }
  return enlaces;
}

/** Waze va a un solo destino por vez. */
export function enlaceWaze(destino: DestinoGps): string {
  const parametros = new URLSearchParams(destino.coordenada ? { ll: coordenadas(destino.coordenada), navigate: "yes" } : { q: textoDeDestino(destino), navigate: "yes" });
  return `https://waze.com/ul?${parametros.toString()}`;
}

/** Ver el lugar en el mapa (para revisar que la ubicación marcada sea la correcta). */
export function enlaceVerEnMapa(destino: DestinoGps): string {
  return `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query: textoDeDestino(destino) }).toString()}`;
}
