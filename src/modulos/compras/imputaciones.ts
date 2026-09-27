import { and, asc, eq, sql } from "drizzle-orm";

import { compra, imputacionPagoProveedor, movimientoCuentaProveedor, pagoProveedor } from "@/db/esquema";
import type { Transaccion } from "@/db/tipos";
import { conciliarFIFO, imputarFIFO } from "@/dominio/compras/credito";
import { aNumeric, dec } from "@/dominio/dinero/decimal";
import type { ContextoUsuario } from "@/modulos/seguridad/contexto";

import { numeroCompra } from "./cuenta";

// Partidas e imputaciones de la cuenta de un proveedor (06 §2.2). Las deudas son compras
// vigentes (también las de saldo inicial) y ajustes de débito; los créditos, pagos vigentes y
// ajustes de crédito. Cada una se identifica con una clave: "C:<compra>", "D:<movimiento>",
// "P:<pago>", "A:<movimiento>".

export type ClaveDeudora = `C:${string}` | `D:${string}`;
export type ClaveAcreedora = `P:${string}` | `A:${string}`;
type Modo = "FIFO" | "MANUAL";

export interface PartidaPendiente {
  clave: ClaveDeudora;
  fecha: Date;
  numero: number | null;
  /** "COM-000140" o la descripción del ajuste. */
  descripcion: string;
  vence: string | null;
  total: string;
  pendiente: string;
}

/** Deudas con saldo pendiente, la más vieja primero (RN-096). */
export async function partidasDeudoras(tx: Transaccion, proveedorId: string): Promise<PartidaPendiente[]> {
  const compras = await tx
    .select({
      id: compra.id,
      fecha: compra.fechaCompra,
      numero: compra.numero,
      vence: compra.fechaVencimiento,
      total: compra.total,
      imputado: sql<string>`coalesce((select sum(i.monto) from ${imputacionPagoProveedor} i where i.compra_id = compra.id and i.activa), 0)`,
    })
    .from(compra)
    .where(and(eq(compra.proveedorId, proveedorId), eq(compra.estado, "REGISTRADA")));
  const debitos = await tx
    .select({
      id: movimientoCuentaProveedor.id,
      fecha: movimientoCuentaProveedor.fecha,
      descripcion: movimientoCuentaProveedor.descripcion,
      vence: movimientoCuentaProveedor.fechaVencimiento,
      total: movimientoCuentaProveedor.importe,
      imputado: sql<string>`coalesce((select sum(i.monto) from ${imputacionPagoProveedor} i where i.movimiento_deudor_id = movimiento_cuenta_proveedor.id and i.activa), 0)`,
    })
    .from(movimientoCuentaProveedor)
    .where(and(eq(movimientoCuentaProveedor.proveedorId, proveedorId), eq(movimientoCuentaProveedor.tipo, "AJUSTE_DEBITO")));
  return [
    ...compras.map((c) => ({ clave: `C:${c.id}` as const, fecha: c.fecha, numero: c.numero, descripcion: numeroCompra(c.numero), vence: c.vence, total: c.total, pendiente: dec(c.total).minus(c.imputado).toString() })),
    ...debitos.map((d) => ({ clave: `D:${d.id}` as const, fecha: d.fecha, numero: null, descripcion: d.descripcion, vence: d.vence, total: d.total, pendiente: dec(d.total).minus(d.imputado).toString() })),
  ]
    .filter((p) => dec(p.pendiente).gt(0))
    .sort((a, b) => a.fecha.getTime() - b.fecha.getTime() || (a.numero ?? 0) - (b.numero ?? 0));
}

/** Pagos y créditos con algo sin imputar (saldo a favor), el más viejo primero. */
export async function partidasAcreedoras(tx: Transaccion, proveedorId: string): Promise<{ clave: ClaveAcreedora; libre: string }[]> {
  const pagos = await tx
    .select({
      id: pagoProveedor.id,
      fecha: pagoProveedor.fechaPago,
      monto: pagoProveedor.monto,
      imputado: sql<string>`coalesce((select sum(i.monto) from ${imputacionPagoProveedor} i where i.pago_proveedor_id = pago_proveedor.id and i.activa), 0)`,
    })
    .from(pagoProveedor)
    .where(and(eq(pagoProveedor.proveedorId, proveedorId), eq(pagoProveedor.estado, "REGISTRADO")))
    .orderBy(asc(pagoProveedor.fechaPago), asc(pagoProveedor.numero));
  const creditos = await tx
    .select({
      id: movimientoCuentaProveedor.id,
      fecha: movimientoCuentaProveedor.fecha,
      monto: sql<string>`-${movimientoCuentaProveedor.importe}`,
      imputado: sql<string>`coalesce((select sum(i.monto) from ${imputacionPagoProveedor} i where i.movimiento_acreedor_id = movimiento_cuenta_proveedor.id and i.activa), 0)`,
    })
    .from(movimientoCuentaProveedor)
    .where(and(eq(movimientoCuentaProveedor.proveedorId, proveedorId), eq(movimientoCuentaProveedor.tipo, "AJUSTE_CREDITO")));
  return [
    ...pagos.map((p) => ({ clave: `P:${p.id}` as const, fecha: p.fecha, libre: dec(p.monto).minus(p.imputado).toString() })),
    ...creditos.map((a) => ({ clave: `A:${a.id}` as const, fecha: a.fecha, libre: dec(a.monto).minus(a.imputado).toString() })),
  ]
    .filter((p) => dec(p.libre).gt(0))
    .sort((a, b) => a.fecha.getTime() - b.fecha.getTime())
    .map(({ clave, libre }) => ({ clave, libre }));
}

function columnasAcreedor(clave: ClaveAcreedora) {
  const id = clave.slice(2);
  return clave.startsWith("P:") ? { pagoProveedorId: id, movimientoAcreedorId: null } : { pagoProveedorId: null, movimientoAcreedorId: id };
}

function columnasDeudor(clave: ClaveDeudora) {
  const id = clave.slice(2);
  return clave.startsWith("C:") ? { compraId: id, movimientoDeudorId: null } : { compraId: null, movimientoDeudorId: id };
}

/**
 * Imputa un monto de un crédito a una deuda. Si ya había una imputación activa entre las dos, se
 * reemplaza por una con la suma (las imputaciones no se editan: se desactivan y se crean).
 */
export async function imputar(tx: Transaccion, c: ContextoUsuario, proveedorId: string, acreedor: ClaveAcreedora, deudor: ClaveDeudora, monto: string, modo: Modo): Promise<void> {
  const a = columnasAcreedor(acreedor);
  const d = columnasDeudor(deudor);
  const [previa] = await tx
    .update(imputacionPagoProveedor)
    .set({ activa: false, desactivadaEn: sql`now()`, motivoDesactivacion: "Se juntó con otra imputación", actualizadoPor: c.usuarioId })
    .where(
      and(
        eq(imputacionPagoProveedor.activa, true),
        a.pagoProveedorId ? eq(imputacionPagoProveedor.pagoProveedorId, a.pagoProveedorId) : eq(imputacionPagoProveedor.movimientoAcreedorId, a.movimientoAcreedorId!),
        d.compraId ? eq(imputacionPagoProveedor.compraId, d.compraId) : eq(imputacionPagoProveedor.movimientoDeudorId, d.movimientoDeudorId!),
      ),
    )
    .returning({ monto: imputacionPagoProveedor.monto });
  await tx.insert(imputacionPagoProveedor).values({
    empresaId: c.empresaId,
    proveedorId,
    ...a,
    ...d,
    monto: aNumeric(dec(monto).plus(previa?.monto ?? 0), 2),
    modo,
    creadoPor: c.usuarioId,
    actualizadoPor: c.usuarioId,
  });
}

/** Imputa un crédito por FIFO a las deudas pendientes; lo que sobra queda a favor (RN-096, RN-098). */
export async function imputarPorFIFO(tx: Transaccion, c: ContextoUsuario, proveedorId: string, acreedor: ClaveAcreedora, monto: string): Promise<void> {
  const pendientes = await partidasDeudoras(tx, proveedorId);
  const { imputaciones } = imputarFIFO(
    pendientes.map((p) => ({ id: p.clave, pendiente: p.pendiente })),
    monto,
  );
  for (const i of imputaciones) await imputar(tx, c, proveedorId, acreedor, i.id as ClaveDeudora, i.monto.toString(), "FIFO");
}

/** El saldo a favor se aplica a las deudas pendientes, la más vieja primero (RN-098). */
export async function aplicarSaldoAFavor(tx: Transaccion, c: ContextoUsuario, proveedorId: string): Promise<void> {
  const acreedoras = await partidasAcreedoras(tx, proveedorId);
  if (acreedoras.length === 0) return;
  const deudoras = await partidasDeudoras(tx, proveedorId);
  const pares = conciliarFIFO(
    acreedoras.map((a) => ({ id: a.clave, libre: a.libre })),
    deudoras.map((d) => ({ id: d.clave, pendiente: d.pendiente })),
  );
  for (const p of pares) await imputar(tx, c, proveedorId, p.acreedorId as ClaveAcreedora, p.deudorId as ClaveDeudora, p.monto.toString(), "FIFO");
}

/** Desactiva imputaciones con su motivo (reimputación, anulación): el saldo no cambia. */
export async function desactivarImputaciones(
  tx: Transaccion,
  c: ContextoUsuario,
  de: { pagoId: string } | { compraId: string } | { movimientoId: string },
  motivo: string,
): Promise<void> {
  const condicion =
    "pagoId" in de
      ? eq(imputacionPagoProveedor.pagoProveedorId, de.pagoId)
      : "compraId" in de
        ? eq(imputacionPagoProveedor.compraId, de.compraId)
        : sql`(${imputacionPagoProveedor.movimientoAcreedorId} = ${de.movimientoId} or ${imputacionPagoProveedor.movimientoDeudorId} = ${de.movimientoId})`;
  await tx
    .update(imputacionPagoProveedor)
    .set({ activa: false, desactivadaEn: sql`now()`, motivoDesactivacion: motivo, actualizadoPor: c.usuarioId })
    .where(and(eq(imputacionPagoProveedor.activa, true), condicion));
}
