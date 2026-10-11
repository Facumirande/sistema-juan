import "server-only";

import { cookies } from "next/headers";

// El día en el que se está trabajando (pedido del usuario, 08/10/2026: que el tablero, el menú y
// las pantallas del día vayan coordinados). Lo recuerda el navegador cuando se mira un día en el
// tablero, la lista de compras, la preparación, los remitos o Logística (`RecordarDia`); el menú
// muestra las etapas de ese día y las pantallas que se abren sin decir el día van a ese.

export const COOKIE_DIA = "dia";

/** El día elegido por última vez (en las últimas horas), o nulo. */
export async function diaElegido(): Promise<string | null> {
  const valor = (await cookies()).get(COOKIE_DIA)?.value ?? null;
  return valor && /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : null;
}
