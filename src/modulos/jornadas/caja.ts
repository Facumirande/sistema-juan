import { and, eq, gte, isNotNull, lte, ne, sql, sum } from "drizzle-orm";
import { z } from "zod";

import { compra, imputacionPagoProveedor, jornada, movimientoExtra } from "@/db/esquema";
import type { BaseDatos, Transaccion } from "@/db/tipos";
import { aNumeric, dec } from "@/dominio/dinero/decimal";
import { ErrorDeNegocio } from "@/dominio/errores";
import { sumarDias, type FechaISO } from "@/dominio/fechas/fechas";
import { resumenBalance, type ResumenBalance } from "@/dominio/reportes/resumen-balance";
import { registrarActividad } from "@/modulos/colaboracion/registro";
import { ejecutarComoUsuario, type ContextoUsuario } from "@/modulos/seguridad/contexto";
import { numeroOpcional, validar } from "@/modulos/validacion";

// La caja inicial de cada día (la plata con la que se cuenta) y el resumen balance del tablero:
// lo gastado ese día, separado en pagado y crédito, frente a esa caja (RN-180).

/** Lo ya pagado de cada compra: sus imputaciones vigentes. Con varias tablas en la consulta, el nombre va completo. */
const PAGADO_DE_LA_COMPRA = sql<string>`coalesce((select sum(i.monto) from ${imputacionPagoProveedor} i where i.compra_id = "compra"."id" and i.activa), 0)`;

/** Los gastos anotados con una fecha (nafta, peajes…): siempre salen de la caja. */
const gastosDe = (tx: Transaccion, fecha: FechaISO) =>
  tx
    .select({ total: sum(movimientoExtra.monto) })
    .from(movimientoExtra)
    .where(and(eq(movimientoExtra.fecha, fecha), eq(movimientoExtra.tipo, "GASTO"), eq(movimientoExtra.estado, "REGISTRADO")));

/**
 * El resumen balance de un día. Las tres consultas salen juntas (y junto con lo demás que se pida
 * en el mismo `Promise.all`): una sola ida a la base.
 */
export async function resumenBalanceDelDia(tx: Transaccion, fecha: FechaISO): Promise<ResumenBalance> {
  const [[compras], [gastos], [j]] = await Promise.all([
    tx
      .select({ total: sum(compra.total), pagado: sql<string | null>`sum(${PAGADO_DE_LA_COMPRA})` })
      .from(compra)
      .innerJoin(jornada, eq(jornada.id, compra.jornadaId))
      .where(and(eq(jornada.fecha, fecha), eq(compra.estado, "REGISTRADA"))),
    gastosDe(tx, fecha),
    tx.select({ caja: jornada.cajaInicial }).from(jornada).where(eq(jornada.fecha, fecha)),
  ]);
  return resumenBalance({ compras: compras?.total ?? "0", pagadoDeCompras: compras?.pagado ?? "0", gastos: gastos?.total ?? "0", cajaInicial: j?.caja ?? null });
}

export interface CajaSuperada {
  fecha: FechaISO;
  gastos: string;
  cajaInicial: string;
  exceso: string;
}

/** Cuántos días para adelante se mira si los gastos superan la caja inicial (para la campanita). */
const DIAS_A_MIRAR = 7;

/**
 * Los días cercanos (de ayer a una semana, sin cerrar) en los que los gastos superan la caja
 * inicial: lo que avisa la campanita. Solo cuenta para quien puede ver costos y pagos.
 */
export async function diasConCajaSuperada(tx: Transaccion, c: ContextoUsuario, hoy: FechaISO): Promise<CajaSuperada[]> {
  if (!c.permisos.tiene("precios.ver_costos") || !c.permisos.tiene("pagos.ver")) return [];
  const filas = await tx
    .select({
      fecha: jornada.fecha,
      caja: jornada.cajaInicial,
      // Con una sola tabla, Drizzle escribe las columnas sin el nombre de la tabla: en las subconsultas van completas.
      compras: sql<string>`coalesce((select sum(c.total) from ${compra} c where c.jornada_id = jornada.id and c.estado = 'REGISTRADA'), 0)`,
      gastos: sql<string>`coalesce((select sum(m.monto) from ${movimientoExtra} m where m.fecha = jornada.fecha and m.tipo = 'GASTO' and m.estado = 'REGISTRADO'), 0)`,
    })
    .from(jornada)
    .where(and(isNotNull(jornada.cajaInicial), ne(jornada.estado, "CERRADA"), gte(jornada.fecha, sumarDias(hoy, -1)), lte(jornada.fecha, sumarDias(hoy, DIAS_A_MIRAR))))
    .orderBy(jornada.fecha);
  return filas.flatMap((f) => {
    // Para avisar alcanza el total: cuánto de lo comprado ya se pagó no cambia si se superó la caja.
    const r = resumenBalance({ compras: f.compras, pagadoDeCompras: "0", gastos: f.gastos, cajaInicial: f.caja });
    return r.exceso && r.cajaInicial ? [{ fecha: f.fecha, gastos: r.gastos.toString(), cajaInicial: r.cajaInicial.toString(), exceso: r.exceso.toString() }] : [];
  });
}

const esquemaCaja = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Elegí el día."),
  monto: numeroOpcional("Escribí la plata con la que contás, en números (ej. 500.000)."),
});

/**
 * Guarda la caja inicial de un día (vacío = sin cargar). Si ese día todavía no tenía nada, se crea
 * con la caja; a un día cerrado no se le cambia.
 */
export async function guardarCajaInicial(db: BaseDatos, authUserId: string, datos: z.input<typeof esquemaCaja>): Promise<{ cajaInicial: string | null }> {
  const d = validar(esquemaCaja, datos);
  if (d.monto !== null && dec(d.monto).lt(0)) throw new ErrorDeNegocio("VALIDACION", "La caja inicial no puede ser menor que $0.");
  if (d.monto !== null && dec(d.monto).gte("1000000000000")) throw new ErrorDeNegocio("VALIDACION", "Ese importe es demasiado grande: revisá los ceros.");
  const cajaInicial = d.monto === null ? null : aNumeric(d.monto, 2);
  return ejecutarComoUsuario(db, authUserId, "pagos.registrar", async (tx, c) => {
    const [j] = await tx
      .insert(jornada)
      .values({ empresaId: c.empresaId, fecha: d.fecha, cajaInicial, creadoPor: c.usuarioId, actualizadoPor: c.usuarioId })
      .onConflictDoUpdate({ target: [jornada.empresaId, jornada.fecha], set: { cajaInicial, actualizadoPor: c.usuarioId }, setWhere: ne(jornada.estado, "CERRADA") })
      .returning({ id: jornada.id });
    if (!j) {
      throw new ErrorDeNegocio("JORNADA_CERRADA", "Ese día ya está cerrado: para cambiarle la caja inicial, primero reabrilo desde el tablero.", {
        enlace: { href: `/inicio?fecha=${d.fecha}`, texto: "Ir al tablero de ese día" },
      });
    }
    await registrarActividad(tx, c, {
      accion: "MODIFICAR",
      entidadTipo: "JORNADA",
      entidadId: j.id,
      jornadaId: j.id,
      resumen: `${cajaInicial === null ? "quitó" : "cargó"} la caja inicial del ${d.fecha.slice(8, 10)}/${d.fecha.slice(5, 7)}`,
    });
    return { cajaInicial };
  });
}
