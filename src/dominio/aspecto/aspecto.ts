// El aspecto del sistema en cada aparato (pedido del usuario, 11/10/2026): modo claro u oscuro —o el
// que tenga el aparato— y las tarjetas del tablero en colores o neutras. Es una preferencia de cada
// aparato (el celular al sol, la computadora de noche): se guarda en el navegador, no en la cuenta.

export const TEMAS = ["sistema", "claro", "oscuro"] as const;
/** Lo que se elige: claro, oscuro o "sistema" (como esté el aparato). */
export type PreferenciaDeTema = (typeof TEMAS)[number];
/** Lo que se ve. */
export type Tema = "claro" | "oscuro";

export const ASPECTOS_DE_TARJETAS = ["color", "neutro"] as const;
/** Las columnas y tarjetas del tablero: cada etapa con su color, o todas sin color. */
export type AspectoDeTarjetas = (typeof ASPECTOS_DE_TARJETAS)[number];

/** Dónde se guarda cada cosa en el navegador (si no hay nada guardado: como el aparato y en colores). */
export const CLAVE_TEMA = "aspecto:tema";
export const CLAVE_TARJETAS = "aspecto:tarjetas";

/** Lo guardado puede no estar, o venir de otra versión: todo lo que no se entiende es "como el aparato". */
export function interpretarTema(guardado: string | null | undefined): PreferenciaDeTema {
  return guardado === "claro" || guardado === "oscuro" ? guardado : "sistema";
}

export function interpretarTarjetas(guardado: string | null | undefined): AspectoDeTarjetas {
  return guardado === "neutro" ? "neutro" : "color";
}

/** El modo que se ve: el elegido o, si se sigue al aparato, el que tenga el aparato. */
export function temaEfectivo(preferencia: PreferenciaDeTema, aparatoEnOscuro: boolean): Tema {
  if (preferencia === "sistema") return aparatoEnOscuro ? "oscuro" : "claro";
  return preferencia;
}

/** A qué modo pasa el interruptor de la barra. */
export function temaContrario(tema: Tema): Tema {
  return tema === "oscuro" ? "claro" : "oscuro";
}

/**
 * El color de la barra del teléfono (la de la hora y la batería) para que la pantalla "llegue hasta
 * arriba": el mismo que tiene la pantalla en su borde de arriba. En el tablero y el paso a paso es
 * el cielo de la imagen de fondo con su velo (`--tablero-fondo` en `globals.css`: #5b8fc7 con 30 % de
 * velo en claro y 62 % en oscuro); en el resto, el fondo del sistema (`--fondo`).
 */
export function colorDeBarraDeEstado(tema: Tema, sobreLaImagenDeFondo: boolean): string {
  if (sobreLaImagenDeFondo) return tema === "oscuro" ? "#253d50" : "#436d91";
  return tema === "oscuro" ? "#121614" : "#f6f7f5";
}
