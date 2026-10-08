import { and, desc, eq, gte, inArray, lte, sql, type Column } from "drizzle-orm";

import { cliente, cobroCliente, compra, entrega, entregaItem, jornada, movimientoCuentaProveedor, movimientoExtra, pagoProveedor, proveedor } from "@/db/esquema";
import type { BaseDatos, Transaccion } from "@/db/tipos";
import { debeDesde } from "@/dominio/cuentas/clientes";
import { dec, redondear2, sumar } from "@/dominio/dinero/decimal";
import type { FechaISO } from "@/dominio/fechas/fechas";
import { balanceDeDinero, partesDe } from "@/dominio/reportes/dinero";
import { agruparPorPeriodo, saldoAlFinalDeCadaPeriodo, type Agrupacion, type Serie } from "@/dominio/reportes/periodos";
import { numeroCompra, numeroPago, pagadoDeCompra } from "@/modulos/compras/cuenta";
import { cuentasDeClientes } from "@/modulos/cuentas-clientes/cuentas";
import { configuracionEmpresa, numeroEntrega } from "@/modulos/entregas/comun";
import { totalesPorRubro, type TotalPorRubro } from "@/modulos/gastos/gastos";
import { ejecutarComoUsuario, type ContextoUsuario } from "@/modulos/seguridad/contexto";

import type { Periodo } from "./reportes";

// Balance en el tiempo (pantalla "Balance") y registro de movimientos: lo vendido (entregas
// confirmadas, por día de entrega), lo comprado (por día de la jornada o de la compra), los pagos a
// proveedores y la deuda con ellos. Los importes dependen de los permisos de precios de quien mira.

/** `entro` y `salio`: la plata que de verdad se movió (cobros e ingresos; pagos y gastos). */
export type CampoBalance = "vendido" | "comprado" | "ganancia" | "entro" | "salio";

export interface Balance {
  periodo: Periodo & { agrupacion: Agrupacion };
  ver: { venta: boolean; costo: boolean; deuda: boolean; dinero: boolean };
  totales: {
    entregas: number;
    vendido: string | null;
    costoVendido: string | null;
    ganancia: string | null;
    gananciaPct: string | null;
    comprado: string | null;
    pagado: string | null;
    /** Lo entregado que todavía no está en un comprobante (de cualquier fecha). */
    sinFacturar: string | null;
    /** Deuda con proveedores hoy. */
    deuda: string | null;
  };
  series: Serie<CampoBalance>[];
  /** Deuda con proveedores al final de cada período. */
  deuda: Serie<"saldo">[];
  clientes: { cliente: string; vendido: string; ganancia: string | null }[];
  productos: { producto: string; vendido: string; ganancia: string | null }[];
  /**
   * El balance del dinero (`src/dominio/reportes/dinero.ts`): lo REAL es lo que entró y salió en
   * estas fechas (cobrado e ingresos, pagado y gastos); lo PENDIENTE es, a hoy, lo que falta cobrar
   * menos lo que falta pagar; el TOTAL es la suma. Nulo para quien no puede ver todas esas cuentas.
   */
  dinero: { cobrado: string; ingresos: string; pagado: string; gastos: string; aCobrar: string; aPagar: string; entro: string; salio: string; real: string; pendiente: string; total: string } | null;
  /** Las compras de estas fechas: lo retirado de los proveedores, lo que ya se pagó de eso y lo que quedó a pagar (crédito). */
  compras: { total: string; pagado: string; aPagar: string; pctPagado: number; pctAPagar: number; porProveedor: { proveedorId: string; proveedor: string; total: string; pagado: string; aPagar: string }[] } | null;
  /** Las ventas de estas fechas: lo entregado, lo que ya se cobró de eso y lo que falta cobrar. */
  ventas: { total: string; cobrado: string; aCobrar: string; pctCobrado: number; pctACobrar: number; porCliente: { clienteId: string; cliente: string; total: string; cobrado: string; aCobrar: string }[] } | null;
  /** A hoy: lo que falta cobrarle a cada cliente (del que más debe al que menos). */
  aCobrarPorCliente: { clienteId: string; cliente: string; saldo: string; desde: FechaISO | null }[];
  /** A hoy: lo que falta pagarle a cada proveedor. */
  aPagarPorProveedor: { proveedorId: string; proveedor: string; saldo: string }[];
  /** Los gastos y los ingresos generales de estas fechas, por rubro. */
  gastosPorRubro: TotalPorRubro[];
}

function permisos(c: ContextoUsuario) {
  return {
    venta: c.permisos.tiene("precios.ver_venta"),
    costo: c.permisos.tiene("precios.ver_costos") && c.permisos.tiene("precios.ver_margenes"),
    compras: c.permisos.tiene("precios.ver_costos"),
    deuda: c.permisos.tiene("proveedores.ver_credito"),
    cobros: c.permisos.tiene("cobranzas.ver") && c.permisos.tiene("precios.ver_venta"),
    gastos: c.permisos.tiene("pagos.ver"),
  };
}

/**
 * Día local de un instante, en la zona de la empresa. La zona va escrita en la consulta (no como
 * parámetro) para que la misma expresión sirva en el SELECT y en el GROUP BY.
 */
function diaLocal(columna: Column, zona: string) {
  if (!/^[A-Za-z0-9_/+-]+$/.test(zona)) throw new Error(`Zona horaria inválida: ${zona}`);
  return sql<string>`(${columna} at time zone ${sql.raw(`'${zona}'`)})::date`;
}
/** Día de una compra: el de su jornada, o el de la compra si no tiene (deuda anterior al sistema). */
const diaDeCompra = (zona: string) => sql<string>`coalesce(${jornada.fecha}, ${diaLocal(compra.fechaCompra, zona)})`;

const pct = (parte: string, total: string) => (dec(total).isZero() ? null : redondear2(dec(parte).div(total).times(100)).toFixed(2));

async function ventasPorDia(tx: Transaccion, p: Periodo) {
  return tx
    .select({ fecha: jornada.fecha, entregas: sql<number>`count(*)`, vendido: sql<string>`sum(${entrega.importeTotal})`, costo: sql<string>`sum(${entrega.costoTotal})` })
    .from(entrega)
    .innerJoin(jornada, eq(jornada.id, entrega.jornadaId))
    .where(and(eq(entrega.estado, "ENTREGADA"), gte(jornada.fecha, p.desde), lte(jornada.fecha, p.hasta)))
    .groupBy(jornada.fecha);
}

async function comprasPorDia(tx: Transaccion, p: Periodo, zona: string) {
  const dia = diaDeCompra(zona);
  return tx
    .select({ fecha: dia, total: sql<string>`sum(${compra.total})` })
    .from(compra)
    .leftJoin(jornada, eq(jornada.id, compra.jornadaId))
    .where(and(eq(compra.estado, "REGISTRADA"), eq(compra.tipo, "MERCADERIA"), sql`${dia} between ${p.desde} and ${p.hasta}`))
    .groupBy(dia);
}

export async function balance(db: BaseDatos, authUserId: string, periodo: Periodo & { agrupacion: Agrupacion }): Promise<Balance> {
  return ejecutarComoUsuario(db, authUserId, "reportes.ver", async (tx, c) => {
    const ver = permisos(c);
    const zona = c.zonaHoraria;
    const { desde, hasta, agrupacion } = periodo;
    const nada = sql`false`;
    const enFechas = (dia: ReturnType<typeof diaLocal>) => sql`${dia} between ${desde} and ${hasta}`;
    const diaDePago = diaLocal(pagoProveedor.fechaPago, zona);
    const diaDeMovimiento = sql<string>`coalesce(${movimientoCuentaProveedor.fechaOrigen}, ${diaLocal(movimientoCuentaProveedor.fecha, zona)})`;
    const diaCompra = diaDeCompra(zona);
    const entregadas = and(eq(entrega.estado, "ENTREGADA"), gte(jornada.fecha, desde), lte(jornada.fecha, hasta));

    // Todo el balance sale junto, en una sola ida a la base.
    const [ventas, compras, pagos, [sinFacturarFila], [deudaAntes], movimientosDeDeuda, saldosDeProveedores, clientes, productos, comprasPorProveedor, cuentas, cobros, extras, gastosPorRubro] = await Promise.all([
      ventasPorDia(tx, periodo),
      ver.compras ? comprasPorDia(tx, periodo, zona) : [],
      tx
        .select({ fecha: diaDePago, total: sql<string>`sum(${pagoProveedor.monto})` })
        .from(pagoProveedor)
        .where(ver.compras ? and(eq(pagoProveedor.estado, "REGISTRADO"), enFechas(diaDePago)) : nada)
        .groupBy(diaDePago),
      tx
        .select({ total: sql<string>`coalesce(sum(${entrega.importeTotal}), 0)` })
        .from(entrega)
        .where(ver.venta ? and(eq(entrega.estado, "ENTREGADA"), eq(entrega.estadoFacturacion, "SIN_FACTURAR")) : nada),
      tx
        .select({ saldo: sql<string>`coalesce(sum(${movimientoCuentaProveedor.importe}), 0)` })
        .from(movimientoCuentaProveedor)
        .where(ver.deuda ? sql`${diaDeMovimiento} < ${desde}` : nada),
      tx
        .select({ fecha: diaDeMovimiento, importe: sql<string>`sum(${movimientoCuentaProveedor.importe})` })
        .from(movimientoCuentaProveedor)
        .where(ver.deuda ? enFechas(diaDeMovimiento) : nada)
        .groupBy(diaDeMovimiento),
      // A hoy: cuánto se le debe a cada proveedor.
      tx
        .select({ proveedorId: proveedor.id, proveedor: proveedor.nombre, saldo: sql<string>`sum(${movimientoCuentaProveedor.importe})` })
        .from(movimientoCuentaProveedor)
        .innerJoin(proveedor, eq(proveedor.id, movimientoCuentaProveedor.proveedorId))
        .where(ver.deuda ? undefined : nada)
        .groupBy(proveedor.id, proveedor.nombre),
      tx
        .select({ cliente: cliente.nombre, vendido: sql<string>`sum(${entrega.importeTotal})`, costo: sql<string>`sum(${entrega.costoTotal})` })
        .from(entrega)
        .innerJoin(jornada, eq(jornada.id, entrega.jornadaId))
        .innerJoin(cliente, eq(cliente.id, entrega.clienteId))
        .where(ver.venta ? entregadas : nada)
        .groupBy(cliente.nombre)
        .orderBy(sql`sum(${entrega.importeTotal}) desc`),
      tx
        .select({
          producto: entregaItem.productoNombre,
          vendido: sql<string>`sum(coalesce(${entregaItem.importe}, 0))`,
          costo: sql<string>`sum(round(coalesce(${entregaItem.cantidadEntregada}, 0) * coalesce(${entregaItem.costoUnitario}, 0), 2))`,
        })
        .from(entregaItem)
        .innerJoin(entrega, eq(entrega.id, entregaItem.entregaId))
        .innerJoin(jornada, eq(jornada.id, entrega.jornadaId))
        .where(ver.venta ? entregadas : nada)
        .groupBy(entregaItem.productoNombre)
        .orderBy(sql`sum(coalesce(${entregaItem.importe}, 0)) desc`),
      // Las compras de estas fechas por proveedor: lo retirado y lo que ya se pagó de eso.
      tx
        .select({ proveedorId: proveedor.id, proveedor: proveedor.nombre, total: sql<string>`sum(${compra.total})`, pagado: sql<string>`sum(least(${pagadoDeCompra()}, ${compra.total}))` })
        .from(compra)
        .leftJoin(jornada, eq(jornada.id, compra.jornadaId))
        .innerJoin(proveedor, eq(proveedor.id, compra.proveedorId))
        .where(ver.compras && ver.deuda ? and(eq(compra.estado, "REGISTRADA"), eq(compra.tipo, "MERCADERIA"), sql`${diaCompra} between ${desde} and ${hasta}`) : nada)
        .groupBy(proveedor.id, proveedor.nombre)
        .orderBy(sql`sum(${compra.total}) desc`),
      ver.cobros ? cuentasDeClientes(tx) : [],
      tx
        .select({ fecha: cobroCliente.fecha, total: sql<string>`sum(${cobroCliente.monto})` })
        .from(cobroCliente)
        .where(ver.cobros ? and(eq(cobroCliente.estado, "REGISTRADO"), gte(cobroCliente.fecha, desde), lte(cobroCliente.fecha, hasta)) : nada)
        .groupBy(cobroCliente.fecha),
      tx
        .select({ fecha: movimientoExtra.fecha, tipo: movimientoExtra.tipo, total: sql<string>`sum(${movimientoExtra.monto})` })
        .from(movimientoExtra)
        .where(ver.gastos ? and(eq(movimientoExtra.estado, "REGISTRADO"), gte(movimientoExtra.fecha, desde), lte(movimientoExtra.fecha, hasta)) : nada)
        .groupBy(movimientoExtra.fecha, movimientoExtra.tipo),
      ver.gastos ? totalesPorRubro(tx, periodo) : [],
    ]);

    const verDinero = ver.cobros && ver.compras && ver.deuda && ver.gastos;
    const series = agruparPorPeriodo<CampoBalance>(
      [
        ...ventas.map((v) => ({
          fecha: v.fecha,
          valores: { vendido: ver.venta ? v.vendido : "0", ganancia: ver.costo ? dec(v.vendido).minus(v.costo).toFixed(2) : "0" },
        })),
        ...compras.map((k) => ({ fecha: k.fecha, valores: { comprado: k.total } })),
        // La plata que de verdad entró y salió cada día.
        ...(verDinero
          ? [
              ...cobros.map((k) => ({ fecha: k.fecha, valores: { entro: k.total } })),
              ...extras.map((x) => ({ fecha: x.fecha, valores: x.tipo === "INGRESO" ? { entro: x.total } : { salio: x.total } })),
              ...pagos.map((p) => ({ fecha: p.fecha, valores: { salio: p.total } })),
            ]
          : []),
      ],
      ["vendido", "comprado", "ganancia", "entro", "salio"],
      desde,
      hasta,
      agrupacion,
    );

    const vendido = sumar(ventas.map((v) => v.vendido)).toFixed(2);
    const costoVendido = sumar(ventas.map((v) => v.costo)).toFixed(2);
    const ganancia = dec(vendido).minus(costoVendido).toFixed(2);
    const pagado = sumar(pagos.map((p) => p.total)).toFixed(2);
    const deudaHoy = sumar(saldosDeProveedores.map((p) => p.saldo)).toFixed(2);
    const fila = (x: { vendido: string; costo: string }) => ({ vendido: dec(x.vendido).toFixed(2), ganancia: ver.costo ? dec(x.vendido).minus(x.costo).toFixed(2) : null });

    // Las compras de estas fechas: lo retirado = lo ya pagado + lo que quedó a pagar (crédito).
    const retirado = sumar(comprasPorProveedor.map((p) => p.total));
    const partesDeCompras = partesDe(retirado, sumar(comprasPorProveedor.map((p) => p.pagado)));
    // Las ventas de estas fechas: lo entregado = lo ya cobrado + lo que falta cobrar.
    const delPeriodo = cuentas
      .map(({ cliente: cli, cuenta }) => {
        const suyas = cuenta.entregas.filter((e) => e.fecha >= desde && e.fecha <= hasta);
        return { clienteId: cli.id, cliente: cli.nombre, total: sumar(suyas.map((e) => e.importe)), cobrado: sumar(suyas.map((e) => e.cobrado)), aCobrar: sumar(suyas.map((e) => e.pendiente)) };
      })
      .filter((x) => x.total.gt(0))
      .sort((a, b) => b.total.cmp(a.total));
    const partesDeVentas = partesDe(sumar(delPeriodo.map((x) => x.total)), sumar(delPeriodo.map((x) => x.cobrado)));
    const aCobrarPorCliente = cuentas
      .filter((x) => x.cuenta.aCobrar.gt(0))
      .map((x) => ({ clienteId: x.cliente.id, cliente: x.cliente.nombre, saldo: x.cuenta.aCobrar.toFixed(2), desde: debeDesde(x.cuenta) }))
      .sort((a, b) => dec(b.saldo).cmp(a.saldo));
    const aPagarPorProveedor = saldosDeProveedores
      .filter((p) => dec(p.saldo).gt(0))
      .map((p) => ({ proveedorId: p.proveedorId, proveedor: p.proveedor, saldo: dec(p.saldo).toFixed(2) }))
      .sort((a, b) => dec(b.saldo).cmp(a.saldo));
    const aCobrar = sumar(aCobrarPorCliente.map((x) => x.saldo));
    const datosDelDinero = {
      cobrado: sumar(cobros.map((k) => k.total)),
      ingresos: sumar(extras.filter((x) => x.tipo === "INGRESO").map((x) => x.total)),
      pagado,
      gastos: sumar(extras.filter((x) => x.tipo === "GASTO").map((x) => x.total)),
      aCobrar,
      // Lo que se debe en total (si con algún proveedor hay plata a favor, la descuenta).
      aPagar: deudaHoy,
    };
    const d = balanceDeDinero(datosDelDinero);
    const enTexto = (v: { toFixed: (n: number) => string } | string) => (typeof v === "string" ? dec(v).toFixed(2) : v.toFixed(2));

    return {
      periodo,
      ver: { venta: ver.venta, costo: ver.costo, deuda: ver.deuda, dinero: verDinero },
      totales: {
        entregas: ventas.reduce((s, v) => s + Number(v.entregas), 0),
        vendido: ver.venta ? vendido : null,
        costoVendido: ver.costo ? costoVendido : null,
        ganancia: ver.costo ? ganancia : null,
        gananciaPct: ver.costo ? pct(ganancia, vendido) : null,
        comprado: ver.compras ? sumar(compras.map((k) => k.total)).toFixed(2) : null,
        pagado: ver.compras ? pagado : null,
        sinFacturar: ver.venta ? dec(sinFacturarFila?.total ?? "0").toFixed(2) : null,
        deuda: ver.deuda ? deudaHoy : null,
      },
      series,
      deuda: ver.deuda ? saldoAlFinalDeCadaPeriodo(deudaAntes?.saldo ?? "0", movimientosDeDeuda, desde, hasta, agrupacion) : [],
      clientes: clientes.map((x) => ({ cliente: x.cliente, ...fila(x) })),
      productos: productos.map((x) => ({ producto: x.producto, ...fila(x) })),
      dinero: verDinero
        ? {
            cobrado: enTexto(datosDelDinero.cobrado),
            ingresos: enTexto(datosDelDinero.ingresos),
            pagado: enTexto(datosDelDinero.pagado),
            gastos: enTexto(datosDelDinero.gastos),
            aCobrar: enTexto(datosDelDinero.aCobrar),
            aPagar: enTexto(datosDelDinero.aPagar),
            entro: enTexto(d.entro),
            salio: enTexto(d.salio),
            real: enTexto(d.real),
            pendiente: enTexto(d.pendiente),
            total: enTexto(d.total),
          }
        : null,
      compras:
        ver.compras && ver.deuda
          ? {
              total: retirado.toFixed(2),
              pagado: partesDeCompras.saldado.toFixed(2),
              aPagar: partesDeCompras.pendiente.toFixed(2),
              pctPagado: partesDeCompras.pctSaldado,
              pctAPagar: partesDeCompras.pctPendiente,
              porProveedor: comprasPorProveedor.map((p) => {
                const partes = partesDe(p.total, p.pagado);
                return { proveedorId: p.proveedorId, proveedor: p.proveedor, total: dec(p.total).toFixed(2), pagado: partes.saldado.toFixed(2), aPagar: partes.pendiente.toFixed(2) };
              }),
            }
          : null,
      ventas: ver.cobros
        ? {
            total: sumar(delPeriodo.map((x) => x.total)).toFixed(2),
            cobrado: partesDeVentas.saldado.toFixed(2),
            aCobrar: partesDeVentas.pendiente.toFixed(2),
            pctCobrado: partesDeVentas.pctSaldado,
            pctACobrar: partesDeVentas.pctPendiente,
            porCliente: delPeriodo.map((x) => ({ clienteId: x.clienteId, cliente: x.cliente, total: x.total.toFixed(2), cobrado: x.cobrado.toFixed(2), aCobrar: x.aCobrar.toFixed(2) })),
          }
        : null,
      aCobrarPorCliente: ver.cobros ? aCobrarPorCliente : [],
      aPagarPorProveedor: ver.deuda ? aPagarPorProveedor : [],
      gastosPorRubro,
    };
  });
}

// ─── Registro de movimientos ────────────────────────────────────────────────────────────────────

export type TipoRegistro = "VENTA" | "COMPRA" | "PAGO" | "AJUSTE";

export interface MovimientoRegistrado {
  id: string;
  tipo: TipoRegistro;
  fecha: FechaISO;
  numero: string;
  /** Cliente o proveedor. */
  quien: string;
  detalle: string | null;
  importe: string;
  enlace: string;
}

const MAXIMO_REGISTRO = 500;

/**
 * Lo que pasó en el período, del más nuevo al más viejo: entregas confirmadas (lo vendido),
 * compras, pagos a proveedores y ajustes de sus cuentas. Sin lo anulado.
 */
export async function registroDeMovimientos(db: BaseDatos, authUserId: string, datos: Periodo & { tipos: readonly TipoRegistro[] }): Promise<{ movimientos: MovimientoRegistrado[]; totales: Partial<Record<TipoRegistro, { cantidad: number; importe: string }>>; recortado: boolean }> {
  return ejecutarComoUsuario(db, authUserId, "reportes.ver", async (tx, c) => {
    const ver = permisos(c);
    const { zonaHoraria: zona } = await configuracionEmpresa(tx);
    const { desde, hasta } = datos;
    const quiere = (t: TipoRegistro) => datos.tipos.length === 0 || datos.tipos.includes(t);
    const res: (MovimientoRegistrado & { orden: Date })[] = [];

    if (quiere("VENTA") && ver.venta) {
      const filas = await tx
        .select({ id: entrega.id, fecha: jornada.fecha, numero: entrega.numero, quien: cliente.nombre, importe: entrega.importeTotal, conDiferencias: entrega.conDiferencias, orden: entrega.actualizadoEn })
        .from(entrega)
        .innerJoin(jornada, eq(jornada.id, entrega.jornadaId))
        .innerJoin(cliente, eq(cliente.id, entrega.clienteId))
        .where(and(eq(entrega.estado, "ENTREGADA"), gte(jornada.fecha, desde), lte(jornada.fecha, hasta)))
        .orderBy(desc(jornada.fecha))
        .limit(MAXIMO_REGISTRO + 1);
      for (const f of filas) {
        res.push({ id: f.id, tipo: "VENTA", fecha: f.fecha, numero: numeroEntrega(f.numero), quien: f.quien, detalle: f.conDiferencias ? "Con diferencias" : null, importe: f.importe, enlace: `/entregas/${f.id}`, orden: f.orden });
      }
    }
    if (quiere("COMPRA") && ver.compras) {
      const dia = diaDeCompra(zona);
      const filas = await tx
        .select({ id: compra.id, fecha: dia, numero: compra.numero, quien: proveedor.nombre, importe: compra.total, condicion: compra.condicionPago, orden: compra.fechaCompra })
        .from(compra)
        .leftJoin(jornada, eq(jornada.id, compra.jornadaId))
        .innerJoin(proveedor, eq(proveedor.id, compra.proveedorId))
        .where(and(eq(compra.estado, "REGISTRADA"), eq(compra.tipo, "MERCADERIA"), sql`${dia} between ${desde} and ${hasta}`))
        .orderBy(desc(compra.fechaCompra))
        .limit(MAXIMO_REGISTRO + 1);
      const condicion: Record<string, string> = { CONTADO: "Contado", CREDITO: "A crédito", MIXTA: "Parte a crédito" };
      for (const f of filas) {
        res.push({ id: f.id, tipo: "COMPRA", fecha: f.fecha, numero: numeroCompra(f.numero), quien: f.quien, detalle: condicion[f.condicion] ?? null, importe: f.importe, enlace: `/compras/${f.id}`, orden: f.orden });
      }
    }
    if (quiere("PAGO") && ver.compras) {
      const dia = diaLocal(pagoProveedor.fechaPago, zona);
      const filas = await tx
        .select({ id: pagoProveedor.id, fecha: dia, numero: pagoProveedor.numero, quien: proveedor.nombre, importe: pagoProveedor.monto, medio: pagoProveedor.medioPago, orden: pagoProveedor.fechaPago })
        .from(pagoProveedor)
        .innerJoin(proveedor, eq(proveedor.id, pagoProveedor.proveedorId))
        .where(and(eq(pagoProveedor.estado, "REGISTRADO"), sql`${dia} between ${desde} and ${hasta}`))
        .orderBy(desc(pagoProveedor.fechaPago))
        .limit(MAXIMO_REGISTRO + 1);
      const medio: Record<string, string> = { EFECTIVO: "Efectivo", TRANSFERENCIA: "Transferencia", CHEQUE: "Cheque", TARJETA: "Tarjeta", OTRO: "Otro medio" };
      for (const f of filas) {
        res.push({ id: f.id, tipo: "PAGO", fecha: f.fecha, numero: numeroPago(f.numero), quien: f.quien, detalle: medio[f.medio] ?? null, importe: f.importe, enlace: `/cuentas-proveedores/pagos/${f.id}`, orden: f.orden });
      }
    }
    if (quiere("AJUSTE") && ver.deuda) {
      const dia = diaLocal(movimientoCuentaProveedor.fecha, zona);
      const filas = await tx
        .select({
          id: movimientoCuentaProveedor.id,
          fecha: dia,
          quien: proveedor.nombre,
          proveedorId: proveedor.id,
          importe: movimientoCuentaProveedor.importe,
          descripcion: movimientoCuentaProveedor.descripcion,
          orden: movimientoCuentaProveedor.fecha,
        })
        .from(movimientoCuentaProveedor)
        .innerJoin(proveedor, eq(proveedor.id, movimientoCuentaProveedor.proveedorId))
        .where(and(inArray(movimientoCuentaProveedor.tipo, ["AJUSTE_DEBITO", "AJUSTE_CREDITO"]), sql`${dia} between ${desde} and ${hasta}`))
        .orderBy(desc(movimientoCuentaProveedor.fecha))
        .limit(MAXIMO_REGISTRO + 1);
      for (const f of filas) {
        res.push({ id: f.id, tipo: "AJUSTE", fecha: f.fecha, numero: dec(f.importe).gt(0) ? "Débito" : "Crédito", quien: f.quien, detalle: f.descripcion, importe: dec(f.importe).abs().toFixed(2), enlace: `/cuentas-proveedores/${f.proveedorId}`, orden: f.orden });
      }
    }

    res.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.orden.getTime() - a.orden.getTime());
    const totales: Partial<Record<TipoRegistro, { cantidad: number; importe: string }>> = {};
    for (const m of res) {
      const t = totales[m.tipo] ?? { cantidad: 0, importe: "0" };
      totales[m.tipo] = { cantidad: t.cantidad + 1, importe: dec(t.importe).plus(m.importe).toFixed(2) };
    }
    const movimientos = res.slice(0, MAXIMO_REGISTRO).map((m): MovimientoRegistrado => ({ id: m.id, tipo: m.tipo, fecha: m.fecha, numero: m.numero, quien: m.quien, detalle: m.detalle, importe: m.importe, enlace: m.enlace }));
    return { movimientos, totales, recortado: res.length > MAXIMO_REGISTRO };
  });
}
