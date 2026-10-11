import { and, asc, eq, sql } from "drizzle-orm";

import { proveedor } from "@/db/esquema";
import type { Transaccion } from "@/db/tipos";
import type { ContextoUsuario } from "@/modulos/seguridad/contexto";

// Comprar sin decir en qué puesto (pedido del usuario, 10/10/2026): "al ir en efectivo no importa qué
// puesto es, solo el valor y la transacción para el balance". Toda compra necesita un proveedor, así
// que esas compras van a un puesto genérico: el que el negocio ya usa para eso ("EFECTIVO" o "Sin
// puesto") o, si no hay ninguno, uno que se crea solo. Siempre quedan pagadas en el momento.

export const NOMBRE_SIN_PUESTO = "Sin puesto (efectivo)";
const NOMBRES = ["efectivo", "sin puesto", "sin puesto (efectivo)"];

/** El puesto genérico para lo que se compra sin decir dónde; lo crea la primera vez. */
export async function proveedorSinPuesto(tx: Transaccion, c: ContextoUsuario): Promise<{ id: string; nombre: string }> {
  const [ya] = await tx
    .select({ id: proveedor.id, nombre: proveedor.nombre })
    .from(proveedor)
    .where(and(eq(proveedor.activo, true), sql`lower(trim(${proveedor.nombre})) in (${sql.join(NOMBRES.map((n) => sql`${n}`), sql`, `)})`))
    .orderBy(asc(proveedor.creadoEn))
    .limit(1);
  if (ya) return ya;
  const [nuevo] = await tx
    .insert(proveedor)
    .values({ empresaId: c.empresaId, nombre: NOMBRE_SIN_PUESTO, condicionPagoHabitual: "CONTADO", creadoPor: c.usuarioId, actualizadoPor: c.usuarioId })
    .returning({ id: proveedor.id, nombre: proveedor.nombre });
  return nuevo!;
}
