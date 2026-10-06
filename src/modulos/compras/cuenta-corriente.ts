import { and, asc, desc, eq, gte, inArray, lt, lte, sql, sum } from "drizzle-orm";

import { compra, empresa, imputacionPagoProveedor, movimientoCuentaProveedor, pagoProveedor, proveedor } from "@/db/esquema";
import type { BaseDatos, Transaccion } from "@/db/tipos";
import { diasDeAtraso, estadoPagoCompra, indicadoresCredito, libroConSaldo, resumenVencimientos, type EstadoPagoCompra, type IndicadoresCredito } from "@/dominio/compras/credito";
import { dec, sumar } from "@/dominio/dinero/decimal";
import { ErrorDeNegocio } from "@/dominio/errores";
import { hoyEnEmpresa, type FechaISO } from "@/dominio/fechas/fechas";
import { ejecutarComoUsuario } from "@/modulos/seguridad/contexto";

import { numeroCompra, numeroPago, umbralesSemaforo, type TipoMovimiento } from "./cuenta";
import { partidasDeudoras } from "./imputaciones";
import type { MedioPago } from "./pagos";

// Lectura de la cuenta corriente con los proveedores: P-60, P-61, DOC-05 y alertas del inicio.

export interface Vencimientos {
  vencida: string;
  porVencer: string;
  proximo: { fecha: FechaISO; monto: string } | null;
  maxDiasAtraso: number | null;
}

export interface DeudaPendiente {
  clave: string;
  compraId: string | null;
  descripcion: string;
  fecha: Date;
  vence: FechaISO | null;
  diasAtraso: number | null;
  total: string;
  pagado: string;
  pendiente: string;
  estado: EstadoPagoCompra;
}

export interface MovimientoDelLibro {
  id: string;
  fecha: FechaISO;
  tipo: TipoMovimiento;
  comprobante: string | null;
  descripcion: string;
  motivo: string | null;
  compraId: string | null;
  pagoId: string | null;
  debe: string;
  haber: string;
  saldo: string;
}

export interface PagoDelPeriodo {
  id: string;
  numero: string;
  fecha: Date;
  monto: string;
  medio: MedioPago;
  referencia: string | null;
  anulado: boolean;
  aFavor: string;
  imputaciones: { deuda: string; monto: string }[];
}

export interface CuentaCorriente {
  proveedor: {
    id: string;
    nombre: string;
    razonSocial: string | null;
    identificacionFiscal: string | null;
    ubicacion: string | null;
    limiteCredito: string | null;
    plazoPagoDias: number | null;
    activo: boolean;
    aliasTransferencia: string | null;
    cbu: string | null;
    titularCuenta: string | null;
  };
  hoy: FechaISO;
  indicadores: IndicadoresCredito;
  vencimientos: Vencimientos;
  periodo: { desde: FechaISO; hasta: FechaISO };
  saldoAlInicio: string;
  saldoAlCierre: string;
  comprado: string;
  pagado: string;
  ajustes: string;
  movimientos: MovimientoDelLibro[];
  pendientes: DeudaPendiente[];
  pagos: PagoDelPeriodo[];
}

async function zonaYHoy(tx: Transaccion) {
  const [e] = await tx.select({ zona: empresa.zonaHoraria, diasAviso: empresa.diasAvisoVencimiento }).from(empresa);
  if (!e) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró la configuración de la empresa.");
  return { zona: e.zona, diasAviso: e.diasAviso, hoy: hoyEnEmpresa(new Date(), e.zona) };
}

/** Fecha en que cuenta un movimiento: la de la boleta o el pago si se cargó después; si no, la del registro. */
const fechaContable = (zona: string) => sql<FechaISO>`coalesce(${movimientoCuentaProveedor.fechaOrigen}, (${movimientoCuentaProveedor.fecha} at time zone ${zona})::date)`;

/** P-61 y DOC-05: cuenta del proveedor en un período, reconstruida desde el libro (06 §11). */
export async function cuentaCorriente(db: BaseDatos, authUserId: string, proveedorId: string, periodo: { desde: FechaISO; hasta: FechaISO }): Promise<CuentaCorriente> {
  return ejecutarComoUsuario(db, authUserId, "pagos.ver", async (tx) => {
    const [p] = await tx.select().from(proveedor).where(eq(proveedor.id, proveedorId));
    if (!p) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el proveedor.");
    const { zona, diasAviso, hoy } = await zonaYHoy(tx);
    const fc = fechaContable(zona);
    const delProveedor = eq(movimientoCuentaProveedor.proveedorId, proveedorId);

    const [antes] = await tx
      .select({ saldo: sum(movimientoCuentaProveedor.importe).mapWith(String) })
      .from(movimientoCuentaProveedor)
      .where(and(delProveedor, lt(fc, periodo.desde)));
    const [total] = await tx.select({ saldo: sum(movimientoCuentaProveedor.importe).mapWith(String) }).from(movimientoCuentaProveedor).where(delProveedor);
    const filas = await tx
      .select({
        id: movimientoCuentaProveedor.id,
        fecha: fc,
        tipo: movimientoCuentaProveedor.tipo,
        importe: movimientoCuentaProveedor.importe,
        descripcion: movimientoCuentaProveedor.descripcion,
        motivo: movimientoCuentaProveedor.motivo,
        compraId: movimientoCuentaProveedor.compraId,
        pagoId: movimientoCuentaProveedor.pagoProveedorId,
        numeroCompra: compra.numero,
        numeroPago: pagoProveedor.numero,
      })
      .from(movimientoCuentaProveedor)
      .leftJoin(compra, eq(compra.id, movimientoCuentaProveedor.compraId))
      .leftJoin(pagoProveedor, eq(pagoProveedor.id, movimientoCuentaProveedor.pagoProveedorId))
      .where(and(delProveedor, gte(fc, periodo.desde), lte(fc, periodo.hasta)))
      .orderBy(asc(fc), asc(movimientoCuentaProveedor.fecha), asc(movimientoCuentaProveedor.creadoEn));
    const saldoAlInicio = antes?.saldo ?? "0";
    const libro = libroConSaldo(saldoAlInicio, filas);
    const suma = (tipos: TipoMovimiento[]) => sumar(filas.filter((f) => tipos.includes(f.tipo)).map((f) => f.importe));

    const pendientes = (await partidasDeudoras(tx, proveedorId)).map(
      (d): DeudaPendiente => ({
        clave: d.clave,
        compraId: d.clave.startsWith("C:") ? d.clave.slice(2) : null,
        descripcion: d.descripcion,
        fecha: d.fecha,
        vence: d.vence,
        diasAtraso: diasDeAtraso(d.vence, hoy),
        total: d.total,
        pagado: dec(d.total).minus(d.pendiente).toFixed(2),
        pendiente: dec(d.pendiente).toFixed(2),
        estado: estadoPagoCompra(d.total, dec(d.total).minus(d.pendiente)),
      }),
    );
    const v = resumenVencimientos(pendientes, hoy, diasAviso);

    const pagos = await tx
      .select()
      .from(pagoProveedor)
      .where(
        and(
          eq(pagoProveedor.proveedorId, proveedorId),
          gte(sql`(${pagoProveedor.fechaPago} at time zone ${zona})::date`, periodo.desde),
          lte(sql`(${pagoProveedor.fechaPago} at time zone ${zona})::date`, periodo.hasta),
        ),
      )
      .orderBy(asc(pagoProveedor.fechaPago), asc(pagoProveedor.numero));
    const imputaciones = pagos.length
      ? await tx
          .select({ pagoId: imputacionPagoProveedor.pagoProveedorId, monto: imputacionPagoProveedor.monto, numeroCompra: compra.numero, deudor: movimientoCuentaProveedor.descripcion })
          .from(imputacionPagoProveedor)
          .leftJoin(compra, eq(compra.id, imputacionPagoProveedor.compraId))
          .leftJoin(movimientoCuentaProveedor, eq(movimientoCuentaProveedor.id, imputacionPagoProveedor.movimientoDeudorId))
          .where(and(eq(imputacionPagoProveedor.activa, true), inArray(imputacionPagoProveedor.pagoProveedorId, pagos.map((x) => x.id))))
          .orderBy(asc(compra.fechaCompra), asc(compra.numero))
      : [];

    return {
      proveedor: {
        id: p.id,
        nombre: p.nombre,
        razonSocial: p.razonSocial,
        identificacionFiscal: p.identificacionFiscal,
        ubicacion: p.ubicacionMercado,
        limiteCredito: p.limiteCredito,
        plazoPagoDias: p.plazoPagoDias,
        activo: p.activo,
        aliasTransferencia: p.aliasTransferencia,
        cbu: p.cbu,
        titularCuenta: p.titularCuenta,
      },
      hoy,
      indicadores: indicadoresCredito(total?.saldo ?? "0", p.limiteCredito, await umbralesSemaforo(tx)),
      vencimientos: { vencida: v.vencida.toFixed(2), porVencer: v.porVencer.toFixed(2), proximo: v.proximo ? { fecha: v.proximo.fecha, monto: v.proximo.monto.toFixed(2) } : null, maxDiasAtraso: v.maxDiasAtraso },
      periodo,
      saldoAlInicio: dec(saldoAlInicio).toFixed(2),
      saldoAlCierre: (libro.at(-1)?.saldo ?? dec(saldoAlInicio)).toFixed(2),
      comprado: suma(["CARGO_COMPRA", "SALDO_INICIAL", "ANULACION_COMPRA"]).toFixed(2),
      pagado: suma(["PAGO", "ANULACION_PAGO"]).neg().toFixed(2),
      ajustes: suma(["AJUSTE_DEBITO", "AJUSTE_CREDITO"]).toFixed(2),
      movimientos: filas.map((f, i) => ({
        id: f.id,
        fecha: f.fecha,
        tipo: f.tipo,
        comprobante: f.numeroPago !== null ? numeroPago(f.numeroPago) : f.numeroCompra !== null ? numeroCompra(f.numeroCompra) : null,
        descripcion: f.descripcion,
        motivo: f.motivo,
        compraId: f.compraId,
        pagoId: f.pagoId,
        debe: libro[i]!.debe.toFixed(2),
        haber: libro[i]!.haber.toFixed(2),
        saldo: libro[i]!.saldo.toFixed(2),
      })),
      pendientes,
      pagos: pagos.map((x) => {
        const propias = imputaciones.filter((i) => i.pagoId === x.id);
        const imputado = sumar(propias.map((i) => i.monto));
        return {
          id: x.id,
          numero: numeroPago(x.numero),
          fecha: x.fechaPago,
          monto: x.monto,
          medio: x.medioPago,
          referencia: x.referencia,
          anulado: x.estado === "ANULADO",
          aFavor: x.estado === "ANULADO" ? "0.00" : dec(x.monto).minus(imputado).toFixed(2),
          imputaciones: propias.map((i) => ({ deuda: i.numeroCompra !== null ? numeroCompra(i.numeroCompra) : (i.deudor ?? "Ajuste"), monto: i.monto })),
        };
      }),
    };
  });
}

export interface CuentaListada {
  proveedorId: string;
  proveedor: string;
  ubicacion: string | null;
  limiteCredito: string | null;
  plazoPagoDias: number | null;
  indicadores: IndicadoresCredito;
  vencimientos: Vencimientos;
  ultimoPago: { fecha: Date; monto: string } | null;
}

/**
 * P-60 Deudas con proveedores: saldo, semáforo, vencimientos y último pago de cada uno. Primero
 * los EXCEDIDO, ROJO y con deuda vencida (08 §5.9).
 */
export async function listarCuentasProveedores(db: BaseDatos, authUserId: string): Promise<{ hoy: FechaISO; cuentas: CuentaListada[] }> {
  return ejecutarComoUsuario(db, authUserId, "proveedores.ver_credito", async (tx) => {
    const umbrales = await umbralesSemaforo(tx);
    const { diasAviso, hoy } = await zonaYHoy(tx);
    const saldos = tx
      .select({ proveedorId: movimientoCuentaProveedor.proveedorId, saldo: sum(movimientoCuentaProveedor.importe).as("saldo") })
      .from(movimientoCuentaProveedor)
      .groupBy(movimientoCuentaProveedor.proveedorId)
      .as("saldos");
    const filas = await tx
      .select({
        proveedorId: proveedor.id,
        proveedor: proveedor.nombre,
        ubicacion: proveedor.ubicacionMercado,
        limiteCredito: proveedor.limiteCredito,
        plazoPagoDias: proveedor.plazoPagoDias,
        activo: proveedor.activo,
        saldo: saldos.saldo,
      })
      .from(proveedor)
      .leftJoin(saldos, eq(saldos.proveedorId, proveedor.id))
      .orderBy(asc(proveedor.nombre));

    // Deudas con vencimiento de todos los proveedores en dos consultas (compras y débitos).
    const compras = await tx
      .select({
        proveedorId: compra.proveedorId,
        vence: compra.fechaVencimiento,
        total: compra.total,
        imputado: sql<string>`coalesce((select sum(i.monto) from ${imputacionPagoProveedor} i where i.compra_id = compra.id and i.activa), 0)`,
      })
      .from(compra)
      .where(and(eq(compra.estado, "REGISTRADA"), sql`${compra.fechaVencimiento} is not null`));
    const debitos = await tx
      .select({
        proveedorId: movimientoCuentaProveedor.proveedorId,
        vence: movimientoCuentaProveedor.fechaVencimiento,
        total: movimientoCuentaProveedor.importe,
        imputado: sql<string>`coalesce((select sum(i.monto) from ${imputacionPagoProveedor} i where i.movimiento_deudor_id = movimiento_cuenta_proveedor.id and i.activa), 0)`,
      })
      .from(movimientoCuentaProveedor)
      .where(and(eq(movimientoCuentaProveedor.tipo, "AJUSTE_DEBITO"), sql`${movimientoCuentaProveedor.fechaVencimiento} is not null`));
    const deudas = [...compras, ...debitos].map((d) => ({ proveedorId: d.proveedorId, vence: d.vence, pendiente: dec(d.total).minus(d.imputado) }));
    const ultimos = await tx
      .selectDistinctOn([pagoProveedor.proveedorId], { proveedorId: pagoProveedor.proveedorId, fecha: pagoProveedor.fechaPago, monto: pagoProveedor.monto })
      .from(pagoProveedor)
      .where(eq(pagoProveedor.estado, "REGISTRADO"))
      .orderBy(pagoProveedor.proveedorId, desc(pagoProveedor.fechaPago));

    const orden: Record<string, number> = { EXCEDIDO: 0, ROJO: 1, AMARILLO: 2, VERDE: 3, SIN_LIMITE: 3 };
    const cuentas = filas
      .map((f) => {
        const v = resumenVencimientos(
          deudas.filter((d) => d.proveedorId === f.proveedorId),
          hoy,
          diasAviso,
        );
        const u = ultimos.find((x) => x.proveedorId === f.proveedorId);
        return {
          activo: f.activo,
          cuenta: {
            proveedorId: f.proveedorId,
            proveedor: f.proveedor,
            ubicacion: f.ubicacion,
            limiteCredito: f.limiteCredito,
            plazoPagoDias: f.plazoPagoDias,
            indicadores: indicadoresCredito(String(f.saldo ?? "0"), f.limiteCredito, umbrales),
            vencimientos: { vencida: v.vencida.toFixed(2), porVencer: v.porVencer.toFixed(2), proximo: v.proximo ? { fecha: v.proximo.fecha, monto: v.proximo.monto.toFixed(2) } : null, maxDiasAtraso: v.maxDiasAtraso },
            ultimoPago: u ? { fecha: u.fecha, monto: u.monto } : null,
          },
        };
      })
      // Un proveedor desactivado aparece solo si todavía hay algo pendiente con él (RN-108).
      .filter((x) => x.activo || !x.cuenta.indicadores.saldoNeto.isZero())
      .map((x) => x.cuenta)
      .sort(
        (a, b) =>
          orden[a.indicadores.semaforo]! - orden[b.indicadores.semaforo]! ||
          Number(dec(b.vencimientos.vencida).gt(0)) - Number(dec(a.vencimientos.vencida).gt(0)) ||
          b.indicadores.saldoPendiente.cmp(a.indicadores.saldoPendiente),
      );
    return { hoy, cuentas };
  });
}
