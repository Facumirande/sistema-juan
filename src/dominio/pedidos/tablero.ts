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
  { clave: "pedidos", titulo: "Pedidos", ayuda: "Mandalos a la lista de compras.", estados: ["BORRADOR", "CONFIRMADO"], seleccionable: true },
  { clave: "en_lista", titulo: "Lista de compras", ayuda: "Tildá lo que ya se compró.", estados: ["EN_COMPRA"], seleccionable: true },
  // Pedidos en la lista con todo lo suyo ya comprado (la columna se decide con columnaDeTarjeta).
  { clave: "comprados", titulo: "Comprado", ayuda: "Listos para preparar.", estados: [], seleccionable: false },
  // Desde "Preparando" se arrastran (o se eligen) a "En camino" cuando salen a entregar.
  { clave: "preparando", titulo: "Preparando", ayuda: "Tildá lo que ya separaste.", estados: ["EN_PREPARACION", "PREPARADO"], seleccionable: true },
  { clave: "en_camino", titulo: "En camino", ayuda: "Al entregarlo, marcalo.", estados: ["EN_REPARTO"], seleccionable: false },
  { clave: "entregados", titulo: "Entregados", ayuda: "Con todo entregado, cerrá el día.", estados: ["ENTREGADO"], seleccionable: false },
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

/**
 * En el celular el tablero muestra una columna por vez: al abrirlo arranca en la primera que tiene
 * pedidos (donde está lo que sigue por hacer); sin pedidos, en la primera.
 */
export function columnaParaEmpezar(columnas: readonly { clave: ClaveColumna; tarjetas: readonly unknown[] }[]): ClaveColumna {
  return columnas.find((c) => c.tarjetas.length > 0)?.clave ?? "pedidos";
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

export type AccionAlMover =
  | "AGREGAR_A_LISTA"
  | "AGREGAR_Y_COMPRAR"
  | "SACAR_DE_LISTA"
  | "MARCAR_COMPRADO"
  | "DESMARCAR_COMPRADO"
  | "PREPARAR"
  | "SALIR"
  | "ENTREGAR"
  // Un paso atrás, por si una tarjeta se pasó por accidente.
  | "DEJAR_DE_PREPARAR"
  | "VOLVER_DE_CAMINO"
  | "DESHACER_ENTREGA";

/** Columnas entre las que una tarjeta va y vuelve: lo anterior a la preparación. */
const VAN_Y_VUELVEN: readonly ClaveColumna[] = ["pedidos", "en_lista", "comprados"];

/** Columnas cuyas tarjetas se pueden arrastrar: todas (también hacia atrás, de a un paso). */
export const COLUMNAS_ARRASTRABLES: readonly ClaveColumna[] = [...VAN_Y_VUELVEN, "preparando", "en_camino", "entregados"];

/**
 * El paso atrás de una tarjeta de cada columna, por si se pasó por accidente: adónde vuelve y cómo
 * se llama el botón. De "Lista de compras" y "Comprado" se vuelve a Pedidos (sale de la lista).
 */
export const PASO_ANTERIOR: Readonly<Record<ClaveColumna, { hacia: ClaveColumna; texto: string } | null>> = {
  pedidos: null,
  en_lista: { hacia: "pedidos", texto: "↩ Volver a Pedidos" },
  comprados: { hacia: "pedidos", texto: "↩ Volver a Pedidos" },
  preparando: { hacia: "comprados", texto: "↩ Todavía no se prepara: volver atrás" },
  en_camino: { hacia: "preparando", texto: "↩ No salió: volver a Preparando" },
  entregados: { hacia: "en_camino", texto: "↩ No se entregó: volver a En camino" },
};

/**
 * El paso que sigue para una tarjeta de cada columna: adónde va y cómo se llama el botón verde que
 * la hace avanzar. "Entregados" es el final: no tiene paso siguiente.
 */
export const PASO_SIGUIENTE: Readonly<Record<ClaveColumna, { hacia: ClaveColumna; texto: string } | null>> = {
  pedidos: { hacia: "en_lista", texto: "🛒 Mandar a la lista de compras" },
  en_lista: { hacia: "comprados", texto: "✓ Ya está todo comprado" },
  comprados: { hacia: "preparando", texto: "📦 Empezar a prepararlo" },
  preparando: { hacia: "en_camino", texto: "🚚 Sale ahora" },
  en_camino: { hacia: "entregados", texto: "✅ Ya se entregó" },
  entregados: null,
};

/**
 * Qué pasa al arrastrar una tarjeta de una columna a otra (null = no se puede). Entre Pedidos,
 * Lista de compras y Comprado se va y se vuelve; soltarla en Preparando empieza a preparar
 * ese pedido; de "Preparando" a "En camino" sale a entregar (se termina de preparar, se hace el
 * remito y sale el reparto), y de "En camino" a "Entregados" queda entregado completo. Hacia atrás
 * se vuelve de a un paso: de "Preparando" a donde estaba antes, de "En camino" a "Preparando" y de
 * "Entregados" a "En camino".
 */
export function accionAlMover(desde: ClaveColumna, hacia: ClaveColumna): AccionAlMover | null {
  if (desde === hacia) return null;
  if (desde === "preparando") return hacia === "en_camino" ? "SALIR" : VAN_Y_VUELVEN.includes(hacia) ? "DEJAR_DE_PREPARAR" : null;
  if (desde === "en_camino") return hacia === "entregados" ? "ENTREGAR" : hacia === "preparando" ? "VOLVER_DE_CAMINO" : null;
  if (desde === "entregados") return hacia === "en_camino" ? "DESHACER_ENTREGA" : null;
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
  if (!VAN_Y_VUELVEN.includes(desde)) {
    if (hacia === "entregados" && desde === "preparando") return { mensaje: "Todavía no salió a entregar. Primero pasalo a “En camino” (el botón “🚚 Sale ahora” de la tarjeta) y, cuando lo recibe el cliente, marcalo entregado.", ir: "viaje" };
    if (desde === "entregados") return { mensaje: "Un pedido entregado vuelve de a un paso: soltalo en “En camino” (si no se entregó) y, desde ahí, en “Preparando” (si tampoco salió).", ir: "viaje" };
    return { mensaje: "Un pedido que ya salió vuelve de a un paso: soltalo primero en “Preparando” (queda preparado, sin salir) y, si hace falta, después más atrás.", ir: "preparacion" };
  }
  if (hacia === "entregados") return { mensaje: "Para marcarlo Entregado primero hay que prepararlo y que salga: pasalo a “Preparando”, después a “En camino” y recién ahí a “Entregados”.", ir: "preparacion" };
  return { mensaje: "Para que salga En camino primero hay que prepararlo: pasalo a “Preparando”, separá lo suyo y después tocá “🚚 Sale ahora”.", ir: "preparacion" };
}

/** Qué se puede hacer con las tarjetas elegidas (según su estado y la columna en la que están). */
export function resumenDeSeleccion(tarjetas: readonly { estado: EstadoPedido; columna: ClaveColumna | null }[]): {
  total: number;
  paraLista: number;
  paraSacar: number;
  paraSalir: number;
} {
  return {
    total: tarjetas.length,
    paraLista: tarjetas.filter((t) => t.columna === "pedidos" && (t.estado === "BORRADOR" || t.estado === "CONFIRMADO")).length,
    paraSacar: tarjetas.filter((t) => t.estado === "EN_COMPRA" && t.columna !== "preparando").length,
    paraSalir: tarjetas.filter((t) => t.columna === "preparando").length,
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
