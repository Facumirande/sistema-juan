import { and, asc, count, eq, gte, sql, sum } from "drizzle-orm";

import { empresa, jornada, pedido } from "@/db/esquema";
import type { BaseDatos, Transaccion } from "@/db/tipos";
import { ErrorDeNegocio } from "@/dominio/errores";
import { hoyEnEmpresa, jornadaSugerida, type FechaISO } from "@/dominio/fechas/fechas";
import type { EstadoJornada } from "@/dominio/precios/venta";
import { ejecutarComoUsuario, type ContextoUsuario } from "@/modulos/seguridad/contexto";

// Jornadas (03 §8.1, RN-035, RN-031): una por fecha de entrega, creada al cargar el primer pedido.

export interface JornadaListada {
  id: string;
  fecha: FechaISO;
  estado: EstadoJornada;
  pedidos: number;
  confirmados: number;
  borradores: number;
  /** Solo con `precios.ver_venta`. */
  totalEstimado: string | null;
}

const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export async function hoyYSugerida(tx: Transaccion): Promise<{ hoy: FechaISO; sugerida: FechaISO; zonaHoraria: string }> {
  const [e] = await tx.select({ zona: empresa.zonaHoraria, corte: empresa.horaCortePedidos }).from(empresa);
  if (!e) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró la configuración de la empresa.");
  const ahora = new Date();
  return { hoy: hoyEnEmpresa(ahora, e.zona), sugerida: jornadaSugerida(ahora, e.zona, e.corte), zonaHoraria: e.zona };
}

/**
 * Jornada de una fecha, creándola si no existe (RN-035). No se cargan pedidos para fechas
 * pasadas ni jornadas cerradas (RN-031); en preparación o reparto hace falta
 * `pedidos.editar_en_curso` (RN-030).
 */
export async function jornadaParaPedidos(tx: Transaccion, c: ContextoUsuario, fecha: string) {
  if (!PATRON_FECHA.test(fecha)) throw new ErrorDeNegocio("VALIDACION", "Elegí la fecha de entrega.");
  const { hoy } = await hoyYSugerida(tx);
  if (fecha < hoy) throw new ErrorDeNegocio("VALIDACION", "No se cargan pedidos para fechas pasadas: elegí hoy o un día siguiente (RN-031).");

  await tx
    .insert(jornada)
    .values({ empresaId: c.empresaId, fecha, creadoPor: c.usuarioId, actualizadoPor: c.usuarioId })
    .onConflictDoNothing({ target: [jornada.empresaId, jornada.fecha] });
  const [j] = await tx.select().from(jornada).where(eq(jornada.fecha, fecha));
  if (!j) throw new Error("No se pudo crear la jornada.");
  if (j.estado === "CERRADA") throw new ErrorDeNegocio("JORNADA_CERRADA", "La jornada de esa fecha ya está cerrada (RN-031).");
  if (j.estado === "PREPARANDO" || j.estado === "REPARTIENDO") c.permisos.exigir("pedidos.editar_en_curso");
  return j;
}

/** P-45 Jornadas: desde hoy en adelante (y las que quedaron abiertas de días anteriores). */
export async function listarJornadas(db: BaseDatos, authUserId: string): Promise<{ jornadas: JornadaListada[]; hoy: FechaISO; sugerida: FechaISO }> {
  return ejecutarComoUsuario(db, authUserId, "jornada.ver", async (tx, c) => {
    const { hoy, sugerida } = await hoyYSugerida(tx);
    const verVenta = c.permisos.tiene("precios.ver_venta");
    const filas = await tx
      .select({
        id: jornada.id,
        fecha: jornada.fecha,
        estado: jornada.estado,
        pedidos: count(pedido.id),
        confirmados: sql<number>`count(${pedido.id}) filter (where ${pedido.estado} not in ('BORRADOR', 'CANCELADO'))`,
        borradores: sql<number>`count(${pedido.id}) filter (where ${pedido.estado} = 'BORRADOR')`,
        total: sum(sql`case when ${pedido.estado} <> 'CANCELADO' then ${pedido.totalEstimado} end`),
      })
      .from(jornada)
      .leftJoin(pedido, eq(pedido.jornadaId, jornada.id))
      .where(sql`${jornada.fecha} >= ${hoy} or ${jornada.estado} <> 'CERRADA'`)
      .groupBy(jornada.id)
      .orderBy(asc(jornada.fecha));
    return {
      hoy,
      sugerida,
      jornadas: filas.map((f) => ({
        id: f.id,
        fecha: f.fecha,
        estado: f.estado,
        pedidos: Number(f.pedidos),
        confirmados: Number(f.confirmados),
        borradores: Number(f.borradores),
        totalEstimado: verVenta ? (f.total ?? "0") : null,
      })),
    };
  });
}

/** Jornadas próximas con pedidos, para elegir la fecha en la lista de pedidos. */
export async function fechasConPedidos(tx: Transaccion, desde: FechaISO): Promise<FechaISO[]> {
  const filas = await tx
    .selectDistinct({ fecha: jornada.fecha })
    .from(jornada)
    .innerJoin(pedido, eq(pedido.jornadaId, jornada.id))
    .where(and(gte(jornada.fecha, desde)))
    .orderBy(asc(jornada.fecha));
  return filas.map((f) => f.fecha);
}

/** Hoy y el día de entrega que se propone (mañana, o pasado mañana después de la hora de corte). */
export async function fechasDeTrabajo(db: BaseDatos, authUserId: string): Promise<{ hoy: FechaISO; sugerida: FechaISO }> {
  return ejecutarComoUsuario(db, authUserId, null, async (tx) => {
    const { hoy, sugerida } = await hoyYSugerida(tx);
    return { hoy, sugerida };
  });
}
