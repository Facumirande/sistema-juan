import { desc, eq, sql, sum } from "drizzle-orm";

import { empresa, imputacionPagoProveedor, movimientoCuentaProveedor, proveedor, tipoMovimientoProveedor } from "@/db/esquema";
import type { BaseDatos, Transaccion } from "@/db/tipos";
import { aNumeric } from "@/dominio/dinero/decimal";
import { indicadoresCredito, type IndicadoresCredito } from "@/dominio/compras/credito";
import { ErrorDeNegocio } from "@/dominio/errores";
import { formatearNumeroDocumento } from "@/dominio/numeracion/numeracion";
import { ejecutarComoUsuario, type ContextoUsuario } from "@/modulos/seguridad/contexto";

// Cuenta corriente con cada proveedor (06): libro de movimientos con signo, saldo y semáforo.

export type TipoMovimiento = (typeof tipoMovimientoProveedor.enumValues)[number];

export const numeroCompra = (n: number) => formatearNumeroDocumento("COM-", n);
export const numeroPago = (n: number) => formatearNumeroDocumento("PAG-", n);

export async function umbralesSemaforo(tx: Transaccion) {
  const [e] = await tx.select({ amarillo: empresa.semaforoAmarilloPct, rojo: empresa.semaforoRojoPct }).from(empresa);
  if (!e) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró la configuración de la empresa.");
  return { amarilloPct: e.amarillo, rojoPct: e.rojo };
}

/** Saldo neto = suma del libro (RN-093). Positivo: se le debe al proveedor. */
export async function saldoNeto(tx: Transaccion, proveedorId: string): Promise<string> {
  const [fila] = await tx
    .select({ saldo: sum(movimientoCuentaProveedor.importe).mapWith(String) })
    .from(movimientoCuentaProveedor)
    .where(eq(movimientoCuentaProveedor.proveedorId, proveedorId));
  return fila?.saldo ?? "0";
}

/** El saldo neto de todos los proveedores en una sola consulta (el que no tiene movimientos no figura: es 0). */
export async function saldosNetos(tx: Transaccion): Promise<Map<string, string>> {
  const filas = await tx
    .select({ proveedorId: movimientoCuentaProveedor.proveedorId, saldo: sum(movimientoCuentaProveedor.importe).mapWith(String) })
    .from(movimientoCuentaProveedor)
    .groupBy(movimientoCuentaProveedor.proveedorId);
  return new Map(filas.map((f) => [f.proveedorId, f.saldo ?? "0"]));
}

/**
 * Agrega un movimiento al libro y actualiza el saldo guardado en el proveedor (caché del libro,
 * 03 §6.1), en la misma transacción.
 */
export async function registrarMovimiento(
  tx: Transaccion,
  c: ContextoUsuario,
  m: {
    proveedorId: string;
    tipo: TipoMovimiento;
    importe: string;
    descripcion: string;
    compraId?: string | null;
    pagoProveedorId?: string | null;
    movimientoCompensadoId?: string | null;
    fechaVencimiento?: string | null;
    fechaOrigen?: string | null;
    motivo?: string | null;
  },
): Promise<string> {
  // El movimiento y el saldo guardado salen juntos (una ida a la base): el saldo se vuelve a sumar
  // del libro en la misma consulta que lo actualiza, ya con el movimiento nuevo adentro.
  const [[nuevo]] = await Promise.all([
    tx
      .insert(movimientoCuentaProveedor)
      .values({
        empresaId: c.empresaId,
        proveedorId: m.proveedorId,
        tipo: m.tipo,
        importe: aNumeric(m.importe, 2),
        descripcion: m.descripcion,
        compraId: m.compraId ?? null,
        pagoProveedorId: m.pagoProveedorId ?? null,
        movimientoCompensadoId: m.movimientoCompensadoId ?? null,
        fechaVencimiento: m.fechaVencimiento ?? null,
        fechaOrigen: m.fechaOrigen ?? null,
        motivo: m.motivo ?? null,
        creadoPor: c.usuarioId,
        actualizadoPor: c.usuarioId,
      })
      .returning({ id: movimientoCuentaProveedor.id }),
    tx
      .update(proveedor)
      .set({ saldoActual: sql`(select coalesce(sum(m.importe), 0) from ${movimientoCuentaProveedor} m where m.proveedor_id = ${m.proveedorId})` })
      .where(eq(proveedor.id, m.proveedorId)),
  ]);
  return nuevo!.id;
}

/** Proveedor bloqueado hasta el final de la transacción: dos compras a la vez ven el saldo de la otra (RN-109). */
export async function proveedorBloqueado(tx: Transaccion, proveedorId: string) {
  const [p] = await tx.select().from(proveedor).where(eq(proveedor.id, proveedorId)).for("update");
  if (!p) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el proveedor.");
  return p;
}

export async function indicadoresDe(tx: Transaccion, p: { id: string; limiteCredito: string | null }): Promise<IndicadoresCredito> {
  return indicadoresCredito(await saldoNeto(tx, p.id), p.limiteCredito, await umbralesSemaforo(tx));
}

/** Pagado de una compra: imputaciones activas (06 §8.2). */
export function pagadoDeCompra() {
  return sql<string>`coalesce((select sum(i.monto) from ${imputacionPagoProveedor} i where i.compra_id = compra.id and i.activa), 0)`;
}

export interface MovimientoDeCuenta {
  id: string;
  fecha: Date;
  tipo: TipoMovimiento;
  importe: string;
  descripcion: string;
  motivo: string | null;
  compraId: string | null;
}

/** P-60/P-61 (lectura): saldo, semáforo y últimos movimientos de un proveedor. */
export async function cuentaDeProveedor(
  db: BaseDatos,
  authUserId: string,
  proveedorId: string,
  limite = 50,
): Promise<{ indicadores: IndicadoresCredito; limiteCredito: string | null; movimientos: MovimientoDeCuenta[] }> {
  return ejecutarComoUsuario(db, authUserId, "proveedores.ver_credito", async (tx) => {
    const [p] = await tx.select({ id: proveedor.id, limiteCredito: proveedor.limiteCredito }).from(proveedor).where(eq(proveedor.id, proveedorId));
    if (!p) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el proveedor.");
    const movimientos = await tx
      .select({
        id: movimientoCuentaProveedor.id,
        fecha: movimientoCuentaProveedor.fecha,
        tipo: movimientoCuentaProveedor.tipo,
        importe: movimientoCuentaProveedor.importe,
        descripcion: movimientoCuentaProveedor.descripcion,
        motivo: movimientoCuentaProveedor.motivo,
        compraId: movimientoCuentaProveedor.compraId,
      })
      .from(movimientoCuentaProveedor)
      .where(eq(movimientoCuentaProveedor.proveedorId, proveedorId))
      .orderBy(desc(movimientoCuentaProveedor.fecha), desc(movimientoCuentaProveedor.creadoEn))
      .limit(limite);
    return { indicadores: await indicadoresDe(tx, p), limiteCredito: p.limiteCredito, movimientos };
  });
}
