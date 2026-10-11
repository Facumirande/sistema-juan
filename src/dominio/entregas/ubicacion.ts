import { distanciaKm, type Coordenada } from "./recorrido";

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
  /**
   * No es lo que se buscó sino la zona donde queda (11/10/2026): el lugar no figura en el mapa (`falta`),
   * así que se ofrece su localidad para abrir el mapa ahí y marcar el punto exacto a mano.
   */
  aproximado?: { falta: string };
  /**
   * Cómo se llegó a ese lugar cuando no salió tal cual del mapa (11/10/2026): "esquina" (el punto donde se
   * tocan dos calles) o "entre el 480 y el 520" (un número ubicado entre sus vecinos). Es un punto bueno
   * para empezar: se pone en el mapa y se afina si hace falta.
   */
  nota?: string;
}

/** La nota de una esquina bien calculada: el punto es el del mapa. */
export const NOTA_ESQUINA = "esquina";

/** Si el punto de un lugar sugerido se calculó a ojo (entre dos números, cerca de una esquina) y conviene revisarlo en el mapa. */
export const esAOjo = (lugar: LugarSugerido): boolean => Boolean(lugar.nota) && lugar.nota !== NOTA_ESQUINA;

/**
 * Qué probar cuando un lugar no figura en el mapa (pedido del usuario, 11/10/2026: "country pinar II, tafi
 * viejo" no aparecía porque ese country no está cargado en OpenStreetMap): se busca la zona —lo que viene
 * después de la coma o, sin comas, las últimas palabras— y se dice qué parte quedó sin encontrar. A lo
 * sumo dos intentos, para no cargar al servicio de mapas.
 */
export function consultasDeRespaldo(texto: string): { consulta: string; falta: string }[] {
  const limpio = texto.replace(/\s+/g, " ").trim();
  const partes = limpio
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const candidatas: { consulta: string; falta: string }[] = [];
  if (partes.length > 1) {
    candidatas.push({ consulta: partes.slice(1).join(", "), falta: partes[0]! });
    if (partes.length > 2) candidatas.push({ consulta: partes.at(-1)!, falta: partes.slice(0, -1).join(", ") });
  } else {
    const palabras = limpio.split(" ");
    if (palabras.length >= 3) candidatas.push({ consulta: palabras.slice(-2).join(" "), falta: palabras.slice(0, -2).join(" ") });
    if (palabras.length >= 2 && palabras.at(-1)!.length >= 4) candidatas.push({ consulta: palabras.at(-1)!, falta: palabras.slice(0, -1).join(" ") });
  }
  const vistas = new Set<string>();
  return candidatas
    .filter((c) => {
      const clave = c.consulta.toLowerCase();
      if (c.consulta.length < 3 || vistas.has(clave)) return false;
      vistas.add(clave);
      return true;
    })
    .slice(0, 2);
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
  /** Qué es en el mapa: "place" (ciudad, pueblo, barrio), "boundary", "highway", "amenity"… */
  osm_key?: string;
  /** La caja que ocupa en el mapa (una calle, un edificio): oeste, norte, este, sur. */
  extent?: unknown;
}

/** Lo que en el mapa es una zona donde ubicarse (una ciudad, un pueblo, un barrio) y no un local o una calle. */
const ES_UNA_ZONA = new Set(["place", "boundary"]);

/** Lo que sirve de cada resultado de Photon: solo de Argentina y con su ubicación válida. */
function resultadosDePhoton(respuesta: unknown): { p: PropiedadesPhoton; coordenada: Coordenada }[] {
  const features = (respuesta as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) return [];
  return (features as ({ geometry?: { coordinates?: unknown }; properties?: PropiedadesPhoton } | null)[]).flatMap((f) => {
    const p = f?.properties ?? {};
    const coordenadas = f?.geometry?.coordinates;
    const [lng, lat] = Array.isArray(coordenadas) ? (coordenadas as unknown[]).map(Number) : [];
    if (lat === undefined || lng === undefined || !coordenadaValida(lat, lng)) return [];
    if (p.countrycode && p.countrycode.toUpperCase() !== "AR") return [];
    return [{ p, coordenada: { lat, lng } }];
  });
}

/** "Barrio Norte, San Miguel de Tucumán": dónde queda algo, sin la provincia. */
const barrioYCiudad = (p: PropiedadesPhoton) => [...new Set([p.district ?? p.locality, p.city ?? p.county].filter((x): x is string => Boolean(x)))].join(", ") || null;

/**
 * Los lugares que devuelve Photon (el buscador de OpenStreetMap hecho para ir completando mientras se
 * escribe, 10/10/2026): "Av. Mitre 450" con "San Miguel de Tucumán, Tucumán" debajo. Solo de
 * Argentina, sin repetidos y con su ubicación válida.
 */
export function lugaresDePhoton(respuesta: unknown, opciones: { soloZonas?: boolean } = {}): LugarSugerido[] {
  const vistos = new Set<string>();
  const lugares: LugarSugerido[] = [];
  for (const { p, coordenada } of resultadosDePhoton(respuesta)) {
    if (opciones.soloZonas && !ES_UNA_ZONA.has(p.osm_key ?? "")) continue;
    const calle = p.street ? [p.street, p.housenumber].filter(Boolean).join(" ") : null;
    const etiqueta = (p.name && p.name !== p.street ? p.name : calle) ?? p.name ?? null;
    if (!etiqueta) continue;
    const partes = [p.name && calle && p.name !== p.street ? calle : null, p.district ?? p.locality, p.city ?? p.county, p.state].filter((x): x is string => Boolean(x));
    const detalle = [...new Set(partes)].filter((x) => x !== etiqueta).join(", ") || null;
    const clave = `${etiqueta}|${detalle ?? ""}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    lugares.push({ etiqueta, detalle, coordenada });
  }
  return lugares;
}

// ——— Direcciones como se dicen: "Buenos Aires 778" y "Muñecas y San Juan" (pedido del usuario, 11/10/2026) ———
//
// Así se busca una calle en la práctica: con su número o por la esquina. El número sale del mapa
// cuando está cargado; si no, se lo ubica entre los números vecinos de esa calle o se abre el mapa
// en la calle para marcarlo. Una esquina no la entiende ningún buscador de direcciones: se calcula
// con el punto donde se cruzan los tramos de las dos calles. Acá va la parte que no sale a internet:
// entender lo escrito y hacer la cuenta.

/** Lo que va delante del nombre de una calle y no hace falta para encontrarla. */
const TIPOS_DE_CALLE = ["calle", "av", "avda", "avenida", "pje", "pasaje", "bv", "bulevar", "boulevard", "diagonal", "diag", "peatonal"];
const TIPO_DE_CALLE = new RegExp(String.raw`^(?:${TIPOS_DE_CALLE.join("|")})\.?\s+`, "i");
const SEPARA_ESQUINA = /\s+(?:y|e|esquina|esq\.?|&|\/)\s+/i;
/** Palabras que llevan un número detrás sin ser una calle con su número de puerta ("Ruta 9", "Barrio 130 viviendas"). */
const NO_ES_UNA_CALLE = /^(?:calle|ruta|ruta nacional|ruta provincial|rn|rp|km|kil[oó]metro|barrio|b[°º]|mza|manzana|lote|casa|block|torre|piso|local)$/i;

const sinTipo = (calle: string) => calle.trim().replace(TIPO_DE_CALLE, "").trim();

/**
 * Si lo escrito es una esquina ("Muñecas y San Juan", "Laprida esq. Mendoza", "Av. Alem / Lavalle"),
 * las dos calles como se escribieron y la localidad si viene después de una coma. Cada calle necesita
 * al menos cuatro letras (sin contar "calle" o "av."): con menos, medio mapa coincide.
 */
export function leerEsquina(texto: string): { a: string; b: string; localidad: string | null } | null {
  const [antesDeLaComa, ...despues] = texto.split(",");
  const limpio = (antesDeLaComa ?? "").replace(/\s+/g, " ").trim();
  const corte = SEPARA_ESQUINA.exec(limpio);
  if (!corte) return null;
  const a = limpio.slice(0, corte.index).trim();
  const b = limpio.slice(corte.index + corte[0].length).trim();
  // Una sola esquina: "A y B y C" no se entiende. Y con un número de puerta ya no es una esquina.
  if (sinTipo(a).length < 4 || sinTipo(b).length < 4 || SEPARA_ESQUINA.test(b) || /\s\d{2,5}$/.test(a) || /\s\d{2,5}$/.test(b)) return null;
  return { a, b, localidad: despues.join(",").replace(/\s+/g, " ").trim() || null };
}

/**
 * Si lo escrito es una calle con su número ("Buenos Aires 778", "Av. Aconquija al 1500, Yerba Buena",
 * "24 de Septiembre 500"), la calle (sin "calle" ni "av." delante) y el número. Un número que es
 * parte del nombre ("9 de Julio", "24 de Septiembre") no se toma como número de puerta.
 */
export function leerCalleYNumero(texto: string): { calle: string; numero: number } | null {
  const limpio = texto.replace(/\s+/g, " ").trim();
  const partes = /^(.+?)\s+(?:al\s+|n[°ºo]\.?\s*|#\s*)?(\d{1,5})(?:\s*,\s*|\s+)?(.*)$/i.exec(limpio);
  if (!partes) return null;
  const calle = sinTipo(partes[1]!);
  // "9 de julio": lo que sigue al número es parte del nombre de la calle.
  if (/^de\s/i.test(partes[3]!.trim()) || calle.length < 3 || /^\d+$/.test(calle) || NO_ES_UNA_CALLE.test(calle)) return null;
  return { calle, numero: Number(partes[2]) };
}

const sinAcentos = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Cómo se abrevian los nombres de las calles al escribirlos, y cómo figuran en el mapa. */
const ABREVIATURAS: Readonly<Record<string, string>> = {
  av: "Avenida",
  avda: "Avenida",
  pje: "Pasaje",
  gral: "General",
  cnel: "Coronel",
  cmte: "Comandante",
  tte: "Teniente",
  sgto: "Sargento",
  cap: "Capitán",
  alte: "Almirante",
  brig: "Brigadier",
  dr: "Doctor",
  ing: "Ingeniero",
  prof: "Profesor",
  pte: "Presidente",
  gdor: "Gobernador",
  gob: "Gobernador",
  mons: "Monseñor",
  pbro: "Presbítero",
  sta: "Santa",
  sto: "Santo",
  fco: "Francisco",
};
const ABREVIADA = new RegExp(String.raw`(^|[\s,])(${Object.keys(ABREVIATURAS).join("|")})\.?(?=\s)`, "gi");
/** Palabras que no distinguen una calle de otra. */
const DE_RELLENO = new Set(["de", "del", "la", "las", "los", "el", "y"]);

/**
 * Cómo se le pregunta al mapa lo que se escribió: sin "calle" delante y con las abreviaturas
 * completas ("gral paz 500" no aparece; "General paz 500", sí). Si trae "septiembre" se prueba
 * también "setiembre" (y al revés): la avenida principal de San Miguel de Tucumán figura como
 * "24 de Setiembre de 1812". A lo sumo dos maneras, para no cargar al servicio de mapas.
 */
export function consultasParaElMapa(texto: string): string[] {
  const limpia = texto
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^calle\s+/i, "")
    .replace(ABREVIADA, (_todo: string, antes: string, abreviatura: string) => `${antes}${ABREVIATURAS[abreviatura.toLowerCase()]}`);
  const otra = /septiembre/i.test(limpia) ? limpia.replace(/septiembre/gi, "setiembre") : /setiembre/i.test(limpia) ? limpia.replace(/setiembre/gi, "septiembre") : null;
  return otra ? [limpia, otra] : [limpia];
}

/** Las palabras que identifican a una calle: sin acentos, sin "avenida" delante, sin "de" ni "las" y con las abreviaturas completas. */
export function palabrasDeCalle(nombre: string): string[] {
  const palabras = sinAcentos(nombre)
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const sinElTipo = palabras.length > 1 && TIPOS_DE_CALLE.includes(palabras[0]!) ? palabras.slice(1) : palabras;
  const completas = sinElTipo.map((p) => (ABREVIATURAS[p] ? sinAcentos(ABREVIATURAS[p]) : p === "septiembre" ? "setiembre" : p));
  const utiles = completas.filter((p) => !DE_RELLENO.has(p));
  return utiles.length > 0 ? utiles : completas;
}

/**
 * Si una calle del mapa es la que se escribió: 2 si es ese nombre ("muñecas" y "Muñecas", "aconquija" y
 * "Avenida Aconquija"), 1 si lo contiene ("muñecas" e "Ildefonso de las Muñecas", "24 de septiembre"
 * y "24 de Setiembre de 1812") o si se escribió de más (la localidad pegada al nombre), 0 si es otra.
 * La última palabra puede estar a medio escribir ("san ju" ya es "San Juan").
 */
export function parecidoDeCalle(escrita: string, enElMapa: string): 0 | 1 | 2 {
  const e = palabrasDeCalle(escrita);
  const m = palabrasDeCalle(enElMapa);
  if (e.length === 0 || m.length === 0) return 0;
  const estanTodas = e.every((p, i) => m.some((x) => x === p || (i === e.length - 1 && p.length >= 2 && x.startsWith(p))));
  if (estanTodas) return e.length === m.length ? 2 : 1;
  return m.every((p) => e.includes(p)) ? 1 : 0;
}

export interface Caja {
  oeste: number;
  norte: number;
  este: number;
  sur: number;
}

/** Un tramo de una calle como lo devuelve Photon: su nombre en el mapa, dónde queda, un punto y la caja que ocupa. */
export interface TramoDeCalle {
  nombre: string;
  zona: string | null;
  ciudad: string | null;
  coordenada: Coordenada;
  caja: Caja | null;
}

/**
 * Las calles que hay en una respuesta de Photon (sin locales ni casas). Pedidas "sin juntar", vienen
 * todos los tramos de cada calle: sirven para saber cómo se llama en el mapa ("Muñecas" es también
 * "Ildefonso de las Muñecas") y por dónde pasa.
 */
export function tramosDePhoton(respuesta: unknown): TramoDeCalle[] {
  return resultadosDePhoton(respuesta).flatMap(({ p, coordenada }) => {
    if (p.osm_key !== "highway" || !p.name) return [];
    const e = Array.isArray(p.extent) ? (p.extent as unknown[]).map(Number) : [];
    const caja = e.length === 4 && e.every(Number.isFinite) ? { oeste: Math.min(e[0]!, e[2]!), norte: Math.max(e[1]!, e[3]!), este: Math.max(e[0]!, e[2]!), sur: Math.min(e[1]!, e[3]!) } : null;
    return [{ nombre: p.name, zona: barrioYCiudad(p), ciudad: p.city ?? p.county ?? null, coordenada, caja }];
  });
}

export interface NumeroDePuerta {
  numero: number;
  coordenada: Coordenada;
}

/** Una puerta con su número: la calle como figura en el mapa y dónde queda. */
export interface CasaConNumero extends NumeroDePuerta {
  calle: string;
  zona: string | null;
  ciudad: string | null;
}

/** Las direcciones con número que hay en una respuesta de Photon (casas y también locales con su domicilio). */
export function casasDePhoton(respuesta: unknown): CasaConNumero[] {
  return resultadosDePhoton(respuesta).flatMap(({ p, coordenada }) => {
    const numero = /^\d{1,5}/.exec(p.housenumber?.trim() ?? "")?.[0];
    return p.street && numero ? [{ calle: p.street, numero: Number(numero), zona: barrioYCiudad(p), ciudad: p.city ?? p.county ?? null, coordenada }] : [];
  });
}

/** Hasta cuántos números de distancia sirve un vecino para ubicar otro entre dos (unas tres cuadras). */
const VECINO_UTIL = 300;
/** Con un solo vecino, tiene que estar en la misma cuadra o en la de al lado. */
const AL_LADO = 100;
/** Dos vecinos más separados que esto no son de la misma calle (la hay con el mismo nombre en otra localidad). */
const MISMA_CALLE_KM = 0.9;

/**
 * Dónde queda un número de una calle a partir de los números de esa calle que están en el mapa: si
 * está, ese mismo; si no, entre el vecino de abajo y el de arriba, en proporción (el 500 queda a
 * mitad de camino entre el 480 y el 520); con un solo vecino, junto a ese si está a menos de una
 * cuadra. Más lejos no se arriesga un lugar, salvo que se pida "a ojo": ahí vale cualquier vecino,
 * y sirve solo para saber por dónde abrir el mapa.
 */
export function ubicarPorNumeros(numeros: readonly NumeroDePuerta[], buscado: number, opciones: { aOjo?: boolean } = {}): { coordenada: Coordenada; exacto: boolean; entre: number[] } | null {
  const exacto = numeros.find((n) => n.numero === buscado);
  if (exacto) return { coordenada: exacto.coordenada, exacto: true, entre: [buscado] };
  const hasta = (limite: number) => (opciones.aOjo ? Number.POSITIVE_INFINITY : limite);
  const masCercano = (lista: readonly NumeroDePuerta[]) => lista.reduce<NumeroDePuerta | null>((mejor, n) => (!mejor || Math.abs(n.numero - buscado) < Math.abs(mejor.numero - buscado) ? n : mejor), null);
  const abajo = masCercano(numeros.filter((n) => n.numero < buscado && buscado - n.numero <= hasta(VECINO_UTIL)));
  const arriba = masCercano(numeros.filter((n) => n.numero > buscado && n.numero - buscado <= hasta(VECINO_UTIL)));
  if (abajo && arriba && (opciones.aOjo || distanciaKm(abajo.coordenada, arriba.coordenada) <= MISMA_CALLE_KM)) {
    const t = (buscado - abajo.numero) / (arriba.numero - abajo.numero);
    const entreDos = (x: number, y: number) => Math.round((x + (y - x) * t) * 1e6) / 1e6;
    return { coordenada: { lat: entreDos(abajo.coordenada.lat, arriba.coordenada.lat), lng: entreDos(abajo.coordenada.lng, arriba.coordenada.lng) }, exacto: false, entre: [abajo.numero, arriba.numero] };
  }
  const unico = masCercano([abajo, arriba].filter((n): n is NumeroDePuerta => n !== null && Math.abs(n.numero - buscado) <= hasta(AL_LADO)));
  return unico ? { coordenada: unico.coordenada, exacto: false, entre: [unico.numero] } : null;
}

/** Cómo se dice de dónde salió un lugar calculado: "entre el 480 y el 520", "cerca del 480". */
export function comoSeUbico(entre: readonly number[]): string {
  return entre.length === 2 ? `entre el ${entre[0]} y el ${entre[1]}` : `cerca del ${entre[0]}`;
}

/**
 * Las sugerencias de una calle con su número, con lo que sirve arriba (RN-199). Si el número está en
 * el mapa, esas direcciones van primero. Si no está, por cada ciudad donde existe esa calle (a lo
 * sumo dos) se arma "Calle 1500": con un punto calculado entre los números vecinos cuando los hay
 * cerca, o como lugar aproximado —la calle, para abrir el mapa ahí y marcar el punto— cuando no.
 * Todo sale de las mismas respuestas del mapa: no hace falta preguntarle de nuevo.
 */
export function ordenarPorNumero(pedido: { calle: string; numero: number }, respuestas: readonly unknown[], lugares: readonly LugarSugerido[]): LugarSugerido[] {
  const clave = (c: Coordenada) => `${c.lat.toFixed(5)},${c.lng.toFixed(5)}`;
  const casas = respuestas.flatMap((r) => casasDePhoton(r)).filter((c) => parecidoDeCalle(pedido.calle, c.calle) > 0);
  const exactas = new Set(casas.filter((c) => c.numero === pedido.numero).map((c) => clave(c.coordenada)));
  if (exactas.size > 0) return [...lugares.filter((l) => exactas.has(clave(l.coordenada))), ...lugares.filter((l) => !exactas.has(clave(l.coordenada)))];
  const tramos = respuestas.flatMap((r) => tramosDePhoton(r)).filter((t) => parecidoDeCalle(pedido.calle, t.nombre) > 0);
  const ciudades = [...new Set([...tramos.map((t) => t.ciudad), ...casas.map((c) => c.ciudad)])];
  const arriba: LugarSugerido[] = [];
  const yaEstan = new Set<string>();
  for (const ciudad of ciudades.slice(0, 2)) {
    const vecinas = casas.filter((c) => c.ciudad === ciudad);
    const tramo = tramos.find((t) => t.ciudad === ciudad);
    const etiqueta = `${tramo?.nombre ?? vecinas[0]!.calle} ${pedido.numero}`;
    const detalle = tramo?.zona ?? vecinas[0]?.zona ?? null;
    const ubicado = ubicarPorNumeros(vecinas, pedido.numero);
    if (ubicado) arriba.push({ etiqueta, detalle, coordenada: ubicado.coordenada, nota: comoSeUbico(ubicado.entre) });
    else arriba.push({ etiqueta, detalle, coordenada: ubicarPorNumeros(vecinas, pedido.numero, { aOjo: true })?.coordenada ?? tramo!.coordenada, aproximado: { falta: `el número ${pedido.numero}` } });
    // La calle sola ya no hace falta en la lista: quedó arriba, con su número.
    for (const t of tramos) if (t.ciudad === ciudad) yaEstan.add(clave(t.coordenada));
  }
  return [...arriba, ...lugares.filter((l) => !yaEstan.has(clave(l.coordenada)))];
}

// ——— La esquina de dos calles, calculada con los tramos de cada una ———
//
// De cada tramo de calle Photon da la caja que ocupa. Un tramo recto va de una punta de su caja a la
// opuesta, así que es una de sus dos diagonales: cuál, se sabe porque en sus puntas empalma con otros
// tramos (o, si no, por cómo se acomodan los demás tramos de esa calle). La esquina es donde se
// cruzan un tramo de cada calle. En el centro de San Miguel de Tucumán da el mismo punto que marca el
// mapa (los tramos se cortan justo en cada esquina); en una calle con curvas puede correrse unos metros.

/** Metros por grado de latitud (y de longitud en el ecuador). */
const M_POR_GRADO = 111_320;
/** Una caja así de angosta es una recta que corre a lo largo: no hace falta saber cuál de sus diagonales es. */
const FINA_M = 25;
/** Dos puntas de tramos a menos de esto son el mismo punto del mapa. */
const EMPALMAN_M = 8;
/** Cuánto se estira un tramo por cada punta para alcanzar al otro (el ancho de una avenida). */
const ESTIRA_M = 20;
/** Dos cruces a menos de esto son la misma esquina (una avenida de dos manos toca dos veces). */
const MISMA_ESQUINA_M = 80;
/** Hasta dónde un tramo de la misma calle sirve para saber hacia dónde corre. */
const MISMA_TRAZA_M = 2500;
/** Cuántas esquinas se ofrecen (la misma puede existir en más de una localidad). */
const ESQUINAS_A_OFRECER = 3;

export interface EsquinaCalculada {
  coordenada: Coordenada;
  /** Las dos calles como figuran en el mapa. */
  a: string;
  b: string;
  zona: string | null;
  /** Falso si de algún tramo no se pudo saber hacia dónde corre: el punto puede estar corrido. */
  segura: boolean;
}

interface Punto {
  x: number;
  y: number;
}

interface TramoEnElPlano {
  tramo: TramoDeCalle;
  parecido: number;
  /** Las puntas de sus dos diagonales: la que sube hacia el este y la que baja. */
  sube: [Punto, Punto];
  baja: [Punto, Punto];
  medio: Punto;
}

const lejos = (p: Punto, q: Punto) => Math.hypot(p.x - q.x, p.y - q.y);

/** Dónde se cruzan dos tramos rectos, estirando cada uno un poco por sus puntas; nulo si no se tocan o corren casi paralelos. */
function cruce([p1, p2]: [Punto, Punto], [q1, q2]: [Punto, Punto]): Punto | null {
  const r = { x: p2.x - p1.x, y: p2.y - p1.y };
  const s = { x: q2.x - q1.x, y: q2.y - q1.y };
  const largoR = Math.hypot(r.x, r.y);
  const largoS = Math.hypot(s.x, s.y);
  if (largoR < 1 || largoS < 1) return null;
  const cruz = r.x * s.y - r.y * s.x;
  // Menos de unos 12 grados entre las dos: no es una esquina, es la misma calle que sigue.
  if (Math.abs(cruz) < 0.2 * largoR * largoS) return null;
  const d = { x: q1.x - p1.x, y: q1.y - p1.y };
  const t = (d.x * s.y - d.y * s.x) / cruz;
  const u = (d.x * r.y - d.y * r.x) / cruz;
  if (t < -ESTIRA_M / largoR || t > 1 + ESTIRA_M / largoR || u < -ESTIRA_M / largoS || u > 1 + ESTIRA_M / largoS) return null;
  return { x: p1.x + t * r.x, y: p1.y + t * r.y };
}

/**
 * Las esquinas de dos calles (RN-199), a partir de los tramos de cada una que devolvió el mapa.
 * Primero las más cercanas al centro de la zona (con ventaja para las que coinciden justo con los
 * nombres escritos y para las seguras); sin repetir la misma esquina.
 */
export function esquinasEntre(esquina: { a: string; b: string }, tramosA: readonly TramoDeCalle[], tramosB: readonly TramoDeCalle[], centro: Coordenada = ZONA_DEL_NEGOCIO.centro): EsquinaCalculada[] {
  const escala = Math.cos((centro.lat * Math.PI) / 180) * M_POR_GRADO;
  const enElPlano = (escrita: string, tramos: readonly TramoDeCalle[]): TramoEnElPlano[] =>
    tramos.flatMap((tramo) => {
      const parecido = parecidoDeCalle(escrita, tramo.nombre);
      if (!tramo.caja || parecido === 0) return [];
      const oeste = (tramo.caja.oeste - centro.lng) * escala;
      const este = (tramo.caja.este - centro.lng) * escala;
      const sur = (tramo.caja.sur - centro.lat) * M_POR_GRADO;
      const norte = (tramo.caja.norte - centro.lat) * M_POR_GRADO;
      return [
        {
          tramo,
          parecido,
          sube: [
            { x: oeste, y: sur },
            { x: este, y: norte },
          ],
          baja: [
            { x: oeste, y: norte },
            { x: este, y: sur },
          ],
          medio: { x: (tramo.coordenada.lng - centro.lng) * escala, y: (tramo.coordenada.lat - centro.lat) * M_POR_GRADO },
        },
      ];
    });
  const a = enElPlano(esquina.a, tramosA);
  const b = enElPlano(esquina.b, tramosB);
  const todos = [...a, ...b];

  /** Hacia dónde corre un tramo: 1 sube hacia el este, -1 baja, 0 no se sabe. */
  const sentido = (t: TramoEnElPlano, hermanos: readonly TramoEnElPlano[]): 1 | -1 | 0 => {
    if (Math.min(t.sube[1].x - t.sube[0].x, t.sube[1].y - t.sube[0].y) <= FINA_M) return 1;
    // En sus puntas empalma con otros tramos: las puntas que coinciden dicen cuál es su diagonal.
    let sube = 0;
    let baja = 0;
    for (const otro of todos) {
      if (otro === t) continue;
      const suyas = [...otro.sube, ...otro.baja];
      if (suyas.some((p) => t.sube.some((q) => lejos(p, q) <= EMPALMAN_M))) sube++;
      if (suyas.some((p) => t.baja.some((q) => lejos(p, q) <= EMPALMAN_M))) baja++;
    }
    if (sube !== baja) return sube > baja ? 1 : -1;
    // Si no, por cómo se acomodan los demás tramos de la misma calle.
    let cruzado = 0;
    let largo = 0;
    for (const hermano of hermanos) {
      const dx = hermano.medio.x - t.medio.x;
      const dy = hermano.medio.y - t.medio.y;
      if (hermano === t || Math.hypot(dx, dy) > MISMA_TRAZA_M) continue;
      cruzado += dx * dy;
      largo += dx * dx + dy * dy;
    }
    if (largo > 0 && Math.abs((2 * cruzado) / largo) > 0.05) return cruzado > 0 ? 1 : -1;
    return 0;
  };
  const sentidos = new Map<TramoEnElPlano, 1 | -1 | 0>([...a.map((t) => [t, sentido(t, a)] as const), ...b.map((t) => [t, sentido(t, b)] as const)]);
  const rectas = (t: TramoEnElPlano): [Punto, Punto][] => {
    const [so, ne] = t.sube;
    // Una caja angosta: el tramo corre por el medio, a lo largo (a lo sumo se corre medio ancho).
    if (ne.x - so.x <= FINA_M && ne.x - so.x <= ne.y - so.y) return [[{ x: (so.x + ne.x) / 2, y: so.y }, { x: (so.x + ne.x) / 2, y: ne.y }]];
    if (ne.y - so.y <= FINA_M) return [[{ x: so.x, y: (so.y + ne.y) / 2 }, { x: ne.x, y: (so.y + ne.y) / 2 }]];
    const s = sentidos.get(t);
    return s === 1 ? [t.sube] : s === -1 ? [t.baja] : [t.sube, t.baja];
  };

  const cruces: { punto: Punto; a: TramoEnElPlano; b: TramoEnElPlano; segura: boolean }[] = [];
  for (const ta of a) {
    for (const tb of b) {
      // Dos cajas que no se tocan ni estiradas no tienen esquina en común.
      if (ta.sube[0].x - ESTIRA_M > tb.sube[1].x + ESTIRA_M || tb.sube[0].x - ESTIRA_M > ta.sube[1].x + ESTIRA_M) continue;
      if (ta.sube[0].y - ESTIRA_M > tb.sube[1].y + ESTIRA_M || tb.sube[0].y - ESTIRA_M > ta.sube[1].y + ESTIRA_M) continue;
      for (const rectaA of rectas(ta)) {
        for (const rectaB of rectas(tb)) {
          const punto = cruce(rectaA, rectaB);
          if (punto) cruces.push({ punto, a: ta, b: tb, segura: sentidos.get(ta) !== 0 && sentidos.get(tb) !== 0 });
        }
      }
    }
  }
  // Lo más cercano al centro primero; un nombre que no es justo el escrito o un punto dudoso pesan como un par de kilómetros más.
  const costo = (c: (typeof cruces)[number]) => Math.hypot(c.punto.x, c.punto.y) + (4 - c.a.parecido - c.b.parecido) * 2000 + (c.segura ? 0 : 1000);
  cruces.sort((x, y) => costo(x) - costo(y));
  // Dos tramos se cruzan una sola vez: si de uno no se supo hacia dónde corre y dio dos puntos, vale el primero.
  const distintas = cruces.filter((c, i) => cruces.slice(0, i).every((otra) => lejos(c.punto, otra.punto) > MISMA_ESQUINA_M && !(otra.a === c.a && otra.b === c.b))).slice(0, ESQUINAS_A_OFRECER);
  return distintas.map((c) => ({
    coordenada: { lat: Math.round((centro.lat + c.punto.y / M_POR_GRADO) * 1e6) / 1e6, lng: Math.round((centro.lng + c.punto.x / escala) * 1e6) / 1e6 },
    a: c.a.tramo.nombre,
    b: c.b.tramo.nombre,
    zona: c.a.tramo.zona ?? c.b.tramo.zona,
    segura: c.segura,
  }));
}
