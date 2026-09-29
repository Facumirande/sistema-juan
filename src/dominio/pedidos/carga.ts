import { dec } from "../dinero/decimal";
import { ABREVIATURA_UNIDAD, formatearNumero, type UnidadMedida } from "../dinero/formato";

// Carga visual de pedidos (28/09/2026): los productos se eligen tocando recuadros y la cantidad se
// ajusta con + y − o escribiéndola. Estas reglas son las mismas en la pantalla y en el servidor.

export interface PresentacionDeVenta {
  id: string;
  nombre: string;
  factor: string;
  esUnidadBase: boolean;
}

/** Una línea como la elige la persona: producto, en qué se pide y cuánto. */
export interface LineaElegida {
  productoId: string;
  presentacionId: string | null;
  cantidad: string;
  observaciones: string | null;
}

/** Una línea que el pedido ya tiene (para comparar al cambiar los productos). */
export interface LineaExistente extends LineaElegida {
  itemId: string;
}

/**
 * Lo que escribe la persona ("2,5", "2.5", " 3 ") como número ("2.5"). Null si no es un número
 * mayor que 0 con hasta 3 decimales.
 */
export function leerCantidad(texto: string): string | null {
  const limpio = texto.replace(/\s/g, "");
  if (!/^\d+([.,]\d{1,3})?$/.test(limpio)) return null;
  const valor = dec(limpio.replace(",", "."));
  return valor.gt(0) ? valor.toString() : null;
}

/** Suma (o resta, con un paso negativo) a la cantidad; nunca queda por debajo de 0. */
export function sumarCantidad(actual: string, paso: string): string {
  const valor = dec(actual || "0").plus(paso);
  return valor.gt(0) ? valor.toString() : "0";
}

/** Si esa cantidad se puede pedir: un producto que no admite fracción va en unidades enteras. */
export function cantidadPermitida(cantidad: string, factor: string, admiteFraccion: boolean): boolean {
  return admiteFraccion || dec(cantidad).times(factor).isInteger();
}

/** Con qué presentación arranca un producto: la de venta por defecto, si no la unidad base, si no la primera. */
export function presentacionInicial(presentaciones: readonly PresentacionDeVenta[], defecto: string | null): PresentacionDeVenta | null {
  return presentaciones.find((p) => p.id === defecto) ?? presentaciones.find((p) => p.esUnidadBase) ?? presentaciones[0] ?? null;
}

/** Cantidades para tocar de una, según si se pide por envase, por kilo (o litro) o por unidad. */
export function cantidadesRapidas(unidad: UnidadMedida, esUnidadBase: boolean): string[] {
  if (!esUnidadBase) return ["1", "2", "3", "5"];
  if (unidad === "KG" || unidad === "LITRO") return ["1", "2", "5", "10", "20"];
  return ["1", "5", "10", "12", "24"];
}

/** "2 × Cajón 18 kg", "5 kg", "12 u": cómo se lee la cantidad de una línea. */
export function textoCantidad(cantidad: string, presentacion: Pick<PresentacionDeVenta, "nombre" | "esUnidadBase">, unidad: UnidadMedida): string {
  const numero = formatearNumero(cantidad, { decimales: 3, recortarCeros: true });
  return presentacion.esUnidadBase ? `${numero} ${ABREVIATURA_UNIDAD[unidad]}` : `${numero} × ${presentacion.nombre}`;
}

/** Sin tildes ni mayúsculas: "limon" encuentra "Limón". */
export function normalizarBusqueda(texto: string): string {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

/** Si el nombre tiene todas las palabras buscadas (en cualquier orden). Sin búsqueda, todos coinciden. */
export function coincideBusqueda(nombre: string, busqueda: string): boolean {
  const palabras = normalizarBusqueda(busqueda).split(/\s+/).filter(Boolean);
  const n = normalizarBusqueda(nombre);
  return palabras.every((p) => n.includes(p));
}

const clave = (l: Pick<LineaElegida, "productoId" | "presentacionId">) => `${l.productoId}:${l.presentacionId ?? ""}`;

/** Junta las líneas repetidas (mismo producto y presentación) sumando las cantidades y las notas. */
export function juntarLineas(lineas: readonly LineaElegida[]): LineaElegida[] {
  const juntas = new Map<string, LineaElegida>();
  for (const l of lineas) {
    const previa = juntas.get(clave(l));
    juntas.set(
      clave(l),
      previa
        ? { ...previa, cantidad: dec(previa.cantidad).plus(l.cantidad).toString(), observaciones: [previa.observaciones, l.observaciones].filter(Boolean).join(" / ") || null }
        : { ...l, cantidad: dec(l.cantidad).toString() },
    );
  }
  return [...juntas.values()];
}

/**
 * Qué cambia al guardar los productos de un pedido que ya existe: las líneas nuevas, las que
 * cambian de cantidad o nota, y las que se sacan.
 */
export function diferenciasDeLineas(
  actuales: readonly LineaExistente[],
  nuevas: readonly LineaElegida[],
): { agregar: LineaElegida[]; cambiar: { itemId: string; cantidad: string; observaciones: string | null }[]; quitar: string[] } {
  const porClave = new Map(actuales.map((l) => [clave(l), l]));
  const agregar: LineaElegida[] = [];
  const cambiar: { itemId: string; cantidad: string; observaciones: string | null }[] = [];
  const siguen = new Set<string>();
  for (const l of juntarLineas(nuevas)) {
    const actual = porClave.get(clave(l));
    if (!actual) {
      agregar.push(l);
      continue;
    }
    siguen.add(actual.itemId);
    if (!dec(actual.cantidad).eq(l.cantidad) || (actual.observaciones ?? null) !== (l.observaciones ?? null)) {
      cambiar.push({ itemId: actual.itemId, cantidad: l.cantidad, observaciones: l.observaciones ?? null });
    }
  }
  return { agregar, cambiar, quitar: actuales.filter((l) => !siguen.has(l.itemId)).map((l) => l.itemId) };
}
