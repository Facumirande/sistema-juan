import type { Coordenada } from "./recorrido";

// Leer una ubicación pegada por una persona: coordenadas ("-34.6037, -58.3816") o un enlace de
// Google Maps con el punto adentro (de la barra del navegador o compartido por WhatsApp).

const NUMERO = String.raw`-?\d{1,3}(?:\.\d+)?`;

const PATRONES: readonly RegExp[] = [
  // El lugar marcado ("!3d-34.6!4d-58.3") es más exacto que el centro del mapa ("@-34.6,-58.3").
  new RegExp(String.raw`!3d(${NUMERO})!4d(${NUMERO})`),
  new RegExp(String.raw`[?&](?:q|query|ll|destination|daddr|center)=(${NUMERO}),\s*(${NUMERO})`),
  new RegExp(String.raw`@(${NUMERO}),(${NUMERO})`),
  new RegExp(String.raw`^\s*(${NUMERO})\s*[,;]?\s+(${NUMERO})\s*$`),
  new RegExp(String.raw`^\s*(${NUMERO})\s*[,;]\s*(${NUMERO})\s*$`),
];

export function coordenadaValida(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
}

/** Con coma decimal, a la argentina: "-34,6037; -58,3816" o "-34,6037 -58,3816". */
const CON_COMA = /^\s*(-?\d{1,3},\d+)\s*[;\s]\s*(-?\d{1,3},\d+)\s*$/;

function decodificar(texto: string): string {
  try {
    return decodeURIComponent(texto);
  } catch {
    return texto;
  }
}

function coordenada(lat: number, lng: number): Coordenada | null {
  return coordenadaValida(lat, lng) ? { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 } : null;
}

/** La coordenada que hay en el texto, o null si no se reconoce ninguna. */
export function leerCoordenadas(texto: string): Coordenada | null {
  const limpio = decodificar(texto.trim());
  const coma = CON_COMA.exec(limpio);
  if (coma) return coordenada(Number(coma[1]!.replace(",", ".")), Number(coma[2]!.replace(",", ".")));
  for (const patron of PATRONES) {
    const m = patron.exec(limpio);
    if (!m) continue;
    const c = coordenada(Number(m[1]), Number(m[2]));
    if (c) return c;
  }
  return null;
}

/** "-34,603700; -58,381600" para mostrar (6 decimales, coma decimal). */
export function mostrarCoordenadas(c: Coordenada): string {
  const n = (x: number) => x.toFixed(6).replace(".", ",");
  return `${n(c.lat)}; ${n(c.lng)}`;
}

/** Los enlaces cortos de Google Maps que se pueden seguir para encontrar el punto (se piden al servidor). */
export function esEnlaceCortoDeMapa(texto: string): boolean {
  try {
    const u = new URL(texto.trim());
    return u.protocol === "https:" && (u.hostname === "maps.app.goo.gl" || (u.hostname === "goo.gl" && u.pathname.startsWith("/maps")));
  } catch {
    return false;
  }
}
