import type { EstadoPedido } from "../precios/venta";

// Tablero de pedidos del día (uso interno, 28/09/2026): una columna por etapa, como un tablero de
// tarjetas. Los pedidos cargados se eligen para mandarlos a la lista de compras.

export type PrioridadPedido = "ALTA" | "NORMAL" | "BAJA";
export type ClaveColumna = "pedidos" | "en_lista" | "comprados" | "preparando" | "en_camino" | "entregados";

export interface Columna {
  clave: ClaveColumna;
  titulo: string;
  ayuda: string;
  estados: readonly EstadoPedido[];
  /** Sus tarjetas se pueden elegir (para la lista de compra o para cambiarles la prioridad). */
  seleccionable: boolean;
}

export const COLUMNAS: readonly Columna[] = [
  // No hay confirmación: un pedido cargado ya está listo para mandarse a la lista de compras.
  { clave: "pedidos", titulo: "Pedidos", ayuda: "Cargados: mandalos a la lista de compras cuando quieras.", estados: ["BORRADOR", "CONFIRMADO"], seleccionable: true },
  { clave: "en_lista", titulo: "Lista de compras", ayuda: "Se están comprando: tildá lo que ya está.", estados: ["EN_COMPRA"], seleccionable: true },
  // Pedidos en la lista con todo lo suyo ya comprado (la columna se decide con columnaDeTarjeta).
  { clave: "comprados", titulo: "Comprado", ayuda: "Ya está todo lo suyo: listo para preparar.", estados: [], seleccionable: false },
  { clave: "preparando", titulo: "Preparando", ayuda: "Armándose con lo que se compró.", estados: ["EN_PREPARACION", "PREPARADO"], seleccionable: false },
  { clave: "en_camino", titulo: "En camino", ayuda: "Salieron en un reparto.", estados: ["EN_REPARTO"], seleccionable: false },
  { clave: "entregados", titulo: "Entregados", ayuda: "Ya los recibió el cliente.", estados: ["ENTREGADO"], seleccionable: false },
];

/**
 * La columna de una tarjeta: la de su etapa, salvo un pedido en la lista de compras con todo lo
 * suyo comprado, que pasa a "Comprado" (listo para preparar), y uno que ya tiene armada su
 * preparación aunque todavía no se separó nada, que va a "Preparando".
 */
export function columnaDeTarjeta(estado: EstadoPedido, todoComprado: boolean, enPreparacion = false): ClaveColumna | null {
  if (enPreparacion && (estado === "CONFIRMADO" || estado === "EN_COMPRA")) return "preparando";
  return estado === "EN_COMPRA" && todoComprado ? "comprados" : columnaDePedido(estado);
}

/** La columna de un pedido; los cancelados no van en ninguna. */
export function columnaDePedido(estado: EstadoPedido): ClaveColumna | null {
  return COLUMNAS.find((c) => c.estados.includes(estado))?.clave ?? null;
}

const RANGO_PRIORIDAD: Readonly<Record<PrioridadPedido, number>> = { ALTA: 0, NORMAL: 1, BAJA: 2 };

export interface TarjetaOrdenable {
  prioridad: PrioridadPedido;
  entregaDesde: string | null;
  entregaHasta: string | null;
  numero: number;
}

/** Primero la prioridad alta, después lo que tiene que llegar antes, después el pedido más viejo. */
export function ordenarTarjetas<T extends TarjetaOrdenable>(tarjetas: readonly T[]): T[] {
  const limite = (t: T) => (t.entregaHasta ?? t.entregaDesde ?? "99:99").slice(0, 5);
  return [...tarjetas].sort(
    (a, b) => RANGO_PRIORIDAD[a.prioridad] - RANGO_PRIORIDAD[b.prioridad] || limite(a).localeCompare(limite(b)) || a.numero - b.numero,
  );
}

export type EstadoDelPlazo = "listo" | "vencido" | "pronto" | "a_tiempo";

/**
 * Cómo viene el plazo de una tarjeta, como la fecha de vencimiento de Trello: "listo" si ya se
 * entregó, "vencido" si pasó la hora límite, "pronto" si faltan 2 horas o menos, "a_tiempo" si no.
 * `ahora` va en la zona de la empresa: día "aaaa-mm-dd" y hora "HH:MM".
 */
export function estadoDelPlazo(datos: { fecha: string; hasta: string | null; estado: EstadoPedido; hoy: string; hora: string }): EstadoDelPlazo {
  if (datos.estado === "ENTREGADO") return "listo";
  if (!datos.hasta || datos.estado === "CANCELADO") return "a_tiempo";
  if (datos.fecha !== datos.hoy) return datos.fecha < datos.hoy ? "vencido" : "a_tiempo";
  const minutos = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  const faltan = minutos(datos.hasta) - minutos(datos.hora);
  if (faltan < 0) return "vencido";
  return faltan <= 120 ? "pronto" : "a_tiempo";
}

/** El plazo de entrega dicho en palabras: "entre 07:00 y 09:00", "antes de las 09:00" o "desde las 07:00". */
export function textoPlazo(desde: string | null, hasta: string | null): string | null {
  const d = desde?.slice(0, 5) ?? null;
  const h = hasta?.slice(0, 5) ?? null;
  if (d && h) return `entre ${d} y ${h}`;
  if (h) return `antes de las ${h}`;
  if (d) return `desde las ${d}`;
  return null;
}

export type AccionAlMover = "AGREGAR_A_LISTA" | "AGREGAR_Y_COMPRAR" | "SACAR_DE_LISTA" | "MARCAR_COMPRADO" | "DESMARCAR_COMPRADO" | "PREPARAR";

/** Columnas cuyas tarjetas se pueden arrastrar: desde que empieza la preparación, avanzan solas. */
export const COLUMNAS_ARRASTRABLES: readonly ClaveColumna[] = ["pedidos", "en_lista", "comprados"];

/**
 * Qué pasa al arrastrar una tarjeta de una columna a otra (null = no se puede). Entre Pedidos,
 * Lista de compras y Comprado se va y se vuelve; soltarla en Preparando empieza a preparar el día.
 */
export function accionAlMover(desde: ClaveColumna, hacia: ClaveColumna): AccionAlMover | null {
  if (desde === hacia || !COLUMNAS_ARRASTRABLES.includes(desde)) return null;
  if (hacia === "preparando") return "PREPARAR";
  if (hacia === "pedidos") return "SACAR_DE_LISTA";
  if (hacia === "en_lista") return desde === "pedidos" ? "AGREGAR_A_LISTA" : "DESMARCAR_COMPRADO";
  if (hacia === "comprados") return desde === "pedidos" ? "AGREGAR_Y_COMPRAR" : "MARCAR_COMPRADO";
  return null;
}

/** A qué pantalla ir para hacer el paso que el tablero no hace arrastrando. */
export type DondeSeHace = "preparacion" | "viaje";

/** Por qué una tarjeta no se puede soltar ahí y dónde se hace ese paso (para decirlo con su botón). */
export function porQueNoSeMueve(desde: ClaveColumna, hacia: ClaveColumna): { mensaje: string; ir: DondeSeHace } {
  if (!COLUMNAS_ARRASTRABLES.includes(desde)) {
    if (hacia === "entregados" && desde === "en_camino") return { mensaje: "Pasa a Entregados cuando tocás “✅ Entregar” en Logística.", ir: "viaje" };
    if (hacia === "en_camino" && desde === "preparando") return { mensaje: "Pasa a En camino cuando terminás de prepararlo y sale el reparto: se arma en Logística.", ir: "viaje" };
    return { mensaje: "Este pedido ya se está preparando o ya salió: no vuelve atrás desde el tablero. Si hay que corregir algo, se hace en la preparación.", ir: "preparacion" };
  }
  if (hacia === "entregados") return { mensaje: "Para que quede Entregado primero hay que prepararlo y llevarlo: pasa solo al tocar “✅ Entregar” en el viaje.", ir: "preparacion" };
  return { mensaje: "Para que salga En camino primero hay que prepararlo: después se arma el viaje en Logística y pasa solo.", ir: "preparacion" };
}

/** Qué se puede hacer con las tarjetas elegidas. */
export function resumenDeSeleccion(estados: readonly EstadoPedido[]): { total: number; paraLista: number; paraSacar: number } {
  return {
    total: estados.length,
    paraLista: estados.filter((e) => e === "BORRADOR" || e === "CONFIRMADO").length,
    paraSacar: estados.filter((e) => e === "EN_COMPRA").length,
  };
}

/**
 * Prioridad para repartir lo que falta (RN-115 ampliada): primero los pedidos de prioridad alta,
 * después los normales y al final los de prioridad baja; dentro de cada grupo, la prioridad del
 * cliente (1 = máxima). Menor número = se abastece antes.
 */
export function prioridadParaFaltantes(prioridadCliente: number, prioridadPedido: PrioridadPedido): number {
  return RANGO_PRIORIDAD[prioridadPedido] * 10 + prioridadCliente;
}

/** La prioridad de una entrega que junta varios pedidos: la más alta de ellos. */
export function prioridadMasAlta(prioridades: readonly PrioridadPedido[]): PrioridadPedido {
  if (prioridades.length === 0) return "NORMAL";
  return prioridades.reduce<PrioridadPedido>((mejor, p) => (RANGO_PRIORIDAD[p] < RANGO_PRIORIDAD[mejor] ? p : mejor), "BAJA");
}
