// Circuitos de compra (pedido del usuario, 12/10/2026: "poder estar ordenado en la compra", en
// relación con los puestos). Un circuito es el orden en que se recorren los puestos del mercado: se
// arma una vez, con su nombre, y se elige al comprar. La lista de compras se acomoda sola en ese
// orden —primero lo del primer puesto, después lo del segundo…— y dice cuál toca ahora. Puede haber
// más de uno (el mercado de siempre, la vuelta corta, el mayorista).

export interface CircuitoDeCompra {
  id: string;
  nombre: string;
  /** Los puestos (id de proveedor), en el orden en que se recorren. */
  paradas: string[];
}

/** El circuito elegido se recuerda en cada aparato, en una cookie: así la hoja impresa sale en el mismo orden. */
export const COOKIE_CIRCUITO = "circuito";
/** Lo que guarda esa cookie cuando se eligió comprar sin circuito. */
export const SIN_CIRCUITO = "ninguno";

export const MAXIMO_DE_CIRCUITOS = 8;
export const MAXIMO_DE_PARADAS = 60;
export const LARGO_DEL_NOMBRE = 40;

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sinRepetir = (ids: readonly unknown[]) => [...new Set(ids.filter((id): id is string => typeof id === "string" && ID.test(id)))];

/** Lee lo guardado en la base (`empresa.circuitos_compra`), quedándose solo con lo que es válido. */
export function leerCircuitos(guardado: unknown): CircuitoDeCompra[] {
  if (!Array.isArray(guardado)) return [];
  const circuitos: CircuitoDeCompra[] = [];
  for (const c of guardado as unknown[]) {
    if (!c || typeof c !== "object") continue;
    const { id, nombre, paradas } = c as Record<string, unknown>;
    if (typeof id !== "string" || !ID.test(id) || typeof nombre !== "string" || !nombre.trim() || circuitos.some((x) => x.id === id)) continue;
    circuitos.push({ id, nombre: nombre.trim().slice(0, LARGO_DEL_NOMBRE), paradas: Array.isArray(paradas) ? sinRepetir(paradas).slice(0, MAXIMO_DE_PARADAS) : [] });
  }
  return circuitos.slice(0, MAXIMO_DE_CIRCUITOS);
}

/**
 * Revisa los circuitos antes de guardarlos (RN-201): cada uno con su nombre (sin repetir) y al menos
 * un puesto; los puestos que ya no existen se sacan solos y uno repetido cuenta una vez. Devuelve los
 * circuitos como quedan, o qué hay que corregir.
 */
export function revisarCircuitos(propuestos: readonly { id: string; nombre: string; paradas: readonly string[] }[], puestos: ReadonlySet<string>): { circuitos: CircuitoDeCompra[] } | { error: string } {
  if (propuestos.length > MAXIMO_DE_CIRCUITOS) return { error: `Se pueden armar hasta ${MAXIMO_DE_CIRCUITOS} circuitos: quitá alguno que no uses.` };
  const circuitos: CircuitoDeCompra[] = [];
  for (const p of propuestos) {
    const nombre = p.nombre.replace(/\s+/g, " ").trim();
    if (!nombre) return { error: "A un circuito le falta el nombre (ej. “Mercofrut de siempre”)." };
    if (nombre.length > LARGO_DEL_NOMBRE) return { error: `El nombre “${nombre.slice(0, 20)}…” es muy largo: hasta ${LARGO_DEL_NOMBRE} letras.` };
    if (circuitos.some((c) => c.nombre.toLowerCase() === nombre.toLowerCase())) return { error: `Hay dos circuitos que se llaman “${nombre}”: cambiale el nombre a uno.` };
    if (!ID.test(p.id) || circuitos.some((c) => c.id === p.id)) return { error: "No se pudo leer uno de los circuitos: recargá la página y probá de nuevo." };
    const paradas = sinRepetir(p.paradas).filter((id) => puestos.has(id));
    if (paradas.length === 0) return { error: `Al circuito “${nombre}” le faltan los puestos: agregale al menos uno.` };
    if (paradas.length > MAXIMO_DE_PARADAS) return { error: `El circuito “${nombre}” tiene demasiados puestos: hasta ${MAXIMO_DE_PARADAS}.` };
    circuitos.push({ id: p.id, nombre, paradas });
  }
  return { circuitos };
}

/** Lo que tiene que decir un renglón de la lista para ubicarlo en el recorrido. */
export interface RenglonConPuesto {
  puestoId: string | null;
  puestoNombre: string | null;
  /** Dónde queda en el mercado ("Nave 2, puesto 14"). */
  puestoUbicacion: string | null;
}

/** Una parada del recorrido de hoy: un puesto con lo que hay que comprarle. */
export interface ParadaDelRecorrido<R> {
  clave: string;
  puestoId: string | null;
  titulo: string;
  detalle: string | null;
  /** Su lugar en el recorrido de hoy (1, 2, 3…); nulo si el puesto no está en el circuito elegido. */
  numero: number | null;
  renglones: R[];
}

export const SIN_PUESTO = "Sin puesto (efectivo)";

/**
 * El orden de los puestos cuando nadie dijo otro: por dónde quedan en el mercado ("Nave 1, puesto 3"
 * antes que "Nave 2, puesto 14"), los que no lo dicen después, y a igual lugar por nombre.
 */
export function porDondeQuedan(a: { nombre: string; ubicacion: string | null }, b: { nombre: string; ubicacion: string | null }): number {
  return Number(!a.ubicacion) - Number(!b.ubicacion) || (a.ubicacion ?? "").localeCompare(b.ubicacion ?? "", "es", { numeric: true }) || a.nombre.localeCompare(b.nombre, "es", { numeric: true });
}

/**
 * La lista de compras acomodada como se recorre el mercado (RN-201): primero los puestos del circuito
 * elegido, en su orden y numerados de corrido (los que hoy no tienen nada no aparecen); después los
 * puestos que no están en el circuito, por dónde quedan en el mercado; y al final lo que va sin
 * puesto. Sin circuito elegido, todos los puestos van por su ubicación. Adentro de cada parada, los
 * productos quedan en el orden en que llegaron.
 */
export function recorrerPorCircuito<R extends RenglonConPuesto>(renglones: readonly R[], circuito: Pick<CircuitoDeCompra, "paradas"> | null): ParadaDelRecorrido<R>[] {
  const porPuesto = new Map<string, ParadaDelRecorrido<R>>();
  for (const r of renglones) {
    const clave = r.puestoId ?? "";
    const parada = porPuesto.get(clave) ?? { clave, puestoId: r.puestoId, titulo: r.puestoId ? (r.puestoNombre ?? "Puesto") : SIN_PUESTO, detalle: r.puestoId ? r.puestoUbicacion : null, numero: null, renglones: [] };
    parada.renglones.push(r);
    porPuesto.set(clave, parada);
  }
  const delCircuito = (circuito?.paradas ?? []).flatMap((id) => (porPuesto.has(id) ? [porPuesto.get(id)!] : []));
  delCircuito.forEach((p, i) => (p.numero = i + 1));
  const enElCircuito = new Set(delCircuito.map((p) => p.clave));
  const fuera = [...porPuesto.values()].filter((p) => p.puestoId !== null && !enElCircuito.has(p.clave)).sort((a, b) => porDondeQuedan({ nombre: a.titulo, ubicacion: a.detalle }, { nombre: b.titulo, ubicacion: b.detalle }));
  const sinPuesto = porPuesto.get("");
  return [...delCircuito, ...fuera, ...(sinPuesto ? [sinPuesto] : [])];
}

/** El circuito que vale: el elegido en este aparato si sigue existiendo; si no, el primero (o ninguno). */
export function circuitoElegido(circuitos: readonly CircuitoDeCompra[], elegido: string | null): CircuitoDeCompra | null {
  if (elegido === "") return null;
  return circuitos.find((c) => c.id === elegido) ?? circuitos[0] ?? null;
}
