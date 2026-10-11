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

/**
 * La zona del negocio (pedido del usuario, 08/10/2026: todo lo del mapa enfocado en Tucumán): el
 * mapa arranca ahí y las direcciones se buscan primero adentro de esta caja, que abarca la provincia.
 */
export const ZONA_DEL_NEGOCIO = {
  nombre: "Tucumán",
  /** Plaza Independencia, San Miguel de Tucumán. */
  centro: { lat: -26.8303, lng: -65.2038 },
  caja: { oeste: -66.25, norte: -26.05, este: -64.45, sur: -28.05 },
} as const;

/** Si un punto está adentro de la zona del negocio. */
export function enLaZona(c: Coordenada): boolean {
  const { caja } = ZONA_DEL_NEGOCIO;
  return c.lat <= caja.norte && c.lat >= caja.sur && c.lng >= caja.oeste && c.lng <= caja.este;
}

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

/** Un lugar sugerido mientras se escribe: el renglón principal, el de abajo (barrio, ciudad) y dónde queda. */
export interface LugarSugerido {
  etiqueta: string;
  detalle: string | null;
  coordenada: Coordenada;
}

interface PropiedadesPhoton {
  name?: string;
  street?: string;
  housenumber?: string;
  district?: string;
  locality?: string;
  city?: string;
  county?: string;
  state?: string;
  countrycode?: string;
}

/**
 * Los lugares que devuelve Photon (el buscador de OpenStreetMap hecho para ir completando mientras se
 * escribe, 10/10/2026): "Av. Mitre 450" con "San Miguel de Tucumán, Tucumán" debajo. Solo de
 * Argentina, sin repetidos y con su ubicación válida.
 */
export function lugaresDePhoton(respuesta: unknown): LugarSugerido[] {
  const features = (respuesta as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) return [];
  const vistos = new Set<string>();
  const lugares: LugarSugerido[] = [];
  for (const f of features as { geometry?: { coordinates?: unknown }; properties?: PropiedadesPhoton }[]) {
    const p = f.properties ?? {};
    const [lng, lat] = Array.isArray(f.geometry?.coordinates) ? (f.geometry.coordinates as unknown[]).map(Number) : [];
    if (lat === undefined || lng === undefined || !coordenadaValida(lat, lng)) continue;
    if (p.countrycode && p.countrycode.toUpperCase() !== "AR") continue;
    const calle = p.street ? [p.street, p.housenumber].filter(Boolean).join(" ") : null;
    const etiqueta = (p.name && p.name !== p.street ? p.name : calle) ?? p.name ?? null;
    if (!etiqueta) continue;
    const partes = [p.name && calle && p.name !== p.street ? calle : null, p.district ?? p.locality, p.city ?? p.county, p.state].filter((x): x is string => Boolean(x));
    const detalle = [...new Set(partes)].filter((x) => x !== etiqueta).join(", ") || null;
    const clave = `${etiqueta}|${detalle ?? ""}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    lugares.push({ etiqueta, detalle, coordenada: { lat, lng } });
  }
  return lugares;
}
