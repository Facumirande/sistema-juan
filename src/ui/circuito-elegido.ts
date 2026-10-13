import { COOKIE_CIRCUITO, SIN_CIRCUITO } from "@/dominio/compras/circuitos";

/**
 * Deja anotado en este aparato con qué circuito se recorre el mercado (vacío = sin circuito). Va en una
 * cookie para que la lista y su hoja impresa lleguen ya en ese orden.
 */
export function recordarCircuito(id: string): void {
  document.cookie = `${COOKIE_CIRCUITO}=${id || SIN_CIRCUITO}; path=/; max-age=31536000; samesite=lax`;
}
