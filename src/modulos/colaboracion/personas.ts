import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { usuario } from "@/db/esquema";
import type { BaseDatos, Transaccion } from "@/db/tipos";
import { colorDePersona, esColorDeAvatar } from "@/dominio/colaboracion/personas";
import { coloresDelNegocio } from "./colores";
import { ejecutarComoUsuario } from "@/modulos/seguridad/contexto";
import { textoObligatorio, validar } from "@/modulos/validacion";

// Las personas del negocio como se ven en las tarjetas, las notas y la actividad: nombre y color.

export interface PersonaVisible {
  id: string;
  nombre: string;
  color: string;
}

export function personaVisible(
  u: { id: string; nombre: string; preferencias: Record<string, unknown> | null },
  colores?: Map<string, string>,
): PersonaVisible {
  return { id: u.id, nombre: u.nombre, color: colores?.get(u.id) ?? colorDePersona(u.id, u.preferencias?.color) };
}

/** Solo lo que se muestra (sin si está activa). */
export const soloVisible = (p: PersonaVisible): PersonaVisible => ({ id: p.id, nombre: p.nombre, color: p.color });

/** Todas las personas con cuenta en el negocio (también las desactivadas, para mostrar lo que hicieron). */
export async function personasDelNegocio(tx: Transaccion): Promise<(PersonaVisible & { activa: boolean })[]> {
  const filas = await tx
    .select({ id: usuario.id, nombre: usuario.nombre, preferencias: usuario.preferencias, activo: usuario.activo })
    .from(usuario)
    .orderBy(asc(usuario.nombre));
  const colores = await coloresDelNegocio(tx);
  return filas.map((u) => ({ ...personaVisible(u, colores), activa: u.activo }));
}

/** Las demás personas activas del negocio (para mostrar en "Mi cuenta" qué colores ya usan). */
export async function otrasPersonas(db: BaseDatos, authUserId: string): Promise<PersonaVisible[]> {
  return ejecutarComoUsuario(db, authUserId, null, async (tx, c) =>
    (await personasDelNegocio(tx)).filter((p) => p.activa && p.id !== c.usuarioId).map(soloVisible),
  );
}

const esquemaPerfil = z.object({
  nombre: textoObligatorio("Escribí tu nombre.", 80),
  color: z.string().refine(esColorDeAvatar, { message: "Elegí uno de los colores." }),
});

/** "Mi cuenta": cómo te ven los demás (nombre y color del avatar). */
export async function cambiarMiPerfil(db: BaseDatos, authUserId: string, datos: z.input<typeof esquemaPerfil>): Promise<void> {
  const d = validar(esquemaPerfil, datos);
  await ejecutarComoUsuario(db, authUserId, null, async (tx, c) => {
    const [u] = await tx.select({ preferencias: usuario.preferencias }).from(usuario).where(eq(usuario.id, c.usuarioId));
    await tx
      .update(usuario)
      .set({ nombre: d.nombre, preferencias: { ...(u?.preferencias ?? {}), color: d.color.toLowerCase() }, actualizadoPor: c.usuarioId })
      .where(eq(usuario.id, c.usuarioId));
  });
}
