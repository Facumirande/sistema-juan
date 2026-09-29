import type { EstadoPedido } from "../precios/venta";

// Tablero de pedidos del día (uso interno, 28/09/2026): una columna por etapa, como un tablero de
// tarjetas. Los pedidos por confirmar y los confirmados se eligen para armar la lista de compra.

export type PrioridadPedido = "ALTA" | "NORMAL" | "BAJA";
export type ClaveColumna = "por_confirmar" | "confirmados" | "en_lista" | "preparando" | "en_camino" | "entregados";

export interface Columna {
  clave: ClaveColumna;
  titulo: string;
  ayuda: string;
  estados: readonly EstadoPedido[];
  /** Sus tarjetas se pueden elegir (para la lista de compra o para cambiarles la prioridad). */
  seleccionable: boolean;
}

export const COLUMNAS: readonly Columna[] = [
  { clave: "por_confirmar", titulo: "Por confirmar", ayuda: "Borradores: todavía no entran en la compra.", estados: ["BORRADOR"], seleccionable: true },
  { clave: "confirmados", titulo: "Confirmados", ayuda: "Listos para agregar a la lista de compra.", estados: ["CONFIRMADO"], seleccionable: true },
  { clave: "en_lista", titulo: "En la lista de compra", ayuda: "Lo que se compra para este día.", estados: ["EN_COMPRA"], seleccionable: true },
  { clave: "preparando", titulo: "Preparando", ayuda: "Armándose con lo que se compró.", estados: ["EN_PREPARACION", "PREPARADO"], seleccionable: false },
  { clave: "en_camino", titulo: "En camino", ayuda: "Salieron en un reparto.", estados: ["EN_REPARTO"], seleccionable: false },
  { clave: "entregados", titulo: "Entregados", ayuda: "Ya los recibió el cliente.", estados: ["ENTREGADO"], seleccionable: false },
];

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

export type AccionAlMover = "CONFIRMAR" | "AGREGAR_A_LISTA" | "SACAR_DE_LISTA";

/** Qué pasa al arrastrar una tarjeta de una columna a otra (null = no se puede). */
export function accionAlMover(desde: ClaveColumna, hacia: ClaveColumna): AccionAlMover | null {
  if (desde === "por_confirmar" && hacia === "confirmados") return "CONFIRMAR";
  if ((desde === "por_confirmar" || desde === "confirmados") && hacia === "en_lista") return "AGREGAR_A_LISTA";
  if (desde === "en_lista" && hacia === "confirmados") return "SACAR_DE_LISTA";
  return null;
}

/** Qué se puede hacer con las tarjetas elegidas. */
export function resumenDeSeleccion(estados: readonly EstadoPedido[]): { total: number; paraLista: number; paraConfirmar: number; paraSacar: number } {
  return {
    total: estados.length,
    paraLista: estados.filter((e) => e === "BORRADOR" || e === "CONFIRMADO").length,
    paraConfirmar: estados.filter((e) => e === "BORRADOR").length,
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
