// Etiquetas de colores de las tarjetas (como las de Trello): el tipo de cliente, la prioridad y
// si el pedido llegó tarde. El color siempre va con su texto: nunca dice algo solo con el color.

export type ColorEtiqueta = "verde" | "amarillo" | "naranja" | "rojo" | "violeta" | "azul" | "celeste" | "gris";

export interface Etiqueta {
  texto: string;
  color: ColorEtiqueta;
}

const DEL_TIPO: Readonly<Record<string, Etiqueta>> = {
  HOSPITAL: { texto: "Hospital", color: "violeta" },
  RESTAURANTE: { texto: "Restaurante", color: "naranja" },
  COMERCIO: { texto: "Comercio", color: "verde" },
  INSTITUCION: { texto: "Institución", color: "azul" },
  OTRO: { texto: "Otro", color: "gris" },
};

const DIBUJO_DEL_TIPO: Readonly<Record<string, string>> = { HOSPITAL: "🏥", RESTAURANTE: "🍽️", COMERCIO: "🏪", INSTITUCION: "🏫", OTRO: "👤" };

/** Un dibujo para reconocer de un vistazo qué tipo de cliente es. */
export function dibujoDeCliente(tipoCliente: string): string {
  return DIBUJO_DEL_TIPO[tipoCliente] ?? "👤";
}

export function etiquetaDeTipo(tipoCliente: string): Etiqueta {
  return DEL_TIPO[tipoCliente] ?? { texto: tipoCliente, color: "gris" };
}

export const ETIQUETA_PRIORIDAD: Readonly<Record<string, Etiqueta | null>> = {
  ALTA: { texto: "Urgente", color: "rojo" },
  NORMAL: null,
  BAJA: { texto: "Sin apuro", color: "celeste" },
};

export function etiquetasDePedido(p: { tipoCliente: string; prioridad: string; esTardio: boolean }): Etiqueta[] {
  // "Otro" no dice nada: solo se muestra el tipo si es uno conocido (hospital, restaurante…).
  return [ETIQUETA_PRIORIDAD[p.prioridad], p.tipoCliente === "OTRO" ? null : etiquetaDeTipo(p.tipoCliente), p.esTardio ? { texto: "Llegó tarde", color: "amarillo" as const } : null].filter(
    (e): e is Etiqueta => e !== null && e !== undefined,
  );
}

/** Clases del fondo de cada color (variables del tema: claro con texto oscuro, oscuro con texto blanco). */
export const FONDO_ETIQUETA: Readonly<Record<ColorEtiqueta, string>> = {
  verde: "bg-[var(--etiqueta-verde)]",
  amarillo: "bg-[var(--etiqueta-amarillo)]",
  naranja: "bg-[var(--etiqueta-naranja)]",
  rojo: "bg-[var(--etiqueta-rojo)]",
  violeta: "bg-[var(--etiqueta-violeta)]",
  azul: "bg-[var(--etiqueta-azul)]",
  celeste: "bg-[var(--etiqueta-celeste)]",
  gris: "bg-[var(--etiqueta-gris)]",
};
