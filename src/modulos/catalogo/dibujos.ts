import { isNotNull } from "drizzle-orm";

import { producto } from "@/db/esquema";
import type { BaseDatos } from "@/db/tipos";
import { claveDeDibujo, type DibujosElegidos } from "@/dominio/catalogo/productos";
import { ejecutarComoUsuario } from "@/modulos/seguridad/contexto";

// Los dibujos elegidos a mano para los productos (11/10/2026). Son pocos y cambian poco, y hacen
// falta en casi todas las pantallas (donde aparece un producto va su dibujo): se buscan una vez y se
// recuerdan un rato por persona, para no ir a la base en cada pantalla. Al cambiar el dibujo o el
// nombre de un producto se olvidan, así quien lo cambió lo ve enseguida.

const RECORDAR_MS = 60_000;
const MAXIMO = 200;

const recordados = new Map<string, { valor: DibujosElegidos; hasta: number }>();

/** El dibujo elegido de cada producto que tiene uno, por su nombre (`claveDeDibujo`). */
export async function dibujosElegidos(db: BaseDatos, authUserId: string): Promise<DibujosElegidos> {
  const r = recordados.get(authUserId);
  if (r && r.hasta > Date.now()) return r.valor;
  const valor = await ejecutarComoUsuario(db, authUserId, null, async (tx) => {
    const filas = await tx.select({ nombre: producto.nombre, dibujo: producto.dibujo }).from(producto).where(isNotNull(producto.dibujo));
    return Object.fromEntries(filas.map((f) => [claveDeDibujo(f.nombre), f.dibujo!]));
  });
  if (recordados.size >= MAXIMO) recordados.clear();
  recordados.set(authUserId, { valor, hasta: Date.now() + RECORDAR_MS });
  return valor;
}

/** Hay que llamarla cuando cambia el dibujo o el nombre de un producto. */
export function olvidarDibujos(): void {
  recordados.clear();
}
