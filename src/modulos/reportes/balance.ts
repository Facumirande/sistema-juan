import { and, desc, eq, gte, inArray, lte, sql, type Column } from "drizzle-orm";

import { cliente, compra, entrega, entregaItem, jornada, movimientoCuentaProveedor, pagoProveedor, proveedor } from "@/db/esquema";
import type { BaseDatos, Transaccion } from "@/db/tipos";
import { dec, redondear2, sumar } from "@/dominio/dinero/decimal";
import type { FechaISO } from "@/dominio/fechas/fechas";
import { agruparPorPeriodo, saldoAlFinalDeCadaPeriodo, type Agrupacion, type Serie } from "@/dominio/reportes/periodos";
import { numeroCompra, numeroPago } from "@/modulos/compras/cuenta";
import { configuracionEmpresa, numeroEntrega } from "@/modulos/entregas/comun";
import { ejecutarComoUsuario, type ContextoUsuario } from "@/modulos/seguridad/contexto";

import type { Periodo } from "./reportes";

// Balance en el tiempo (pantalla "Balance") y registro de movimientos: lo vendido (entregas
// confirmadas, por día de entrega), lo comprado (por día de la jornada o de la compra), los pagos a
// proveedores y la deuda con ellos. Los importes dependen de los permisos de precios de quien mira.

export type CampoBalance = "vendido" | "comprado" | "ganancia";

export interface Balance {
  periodo: Periodo & { agrupacion: Agrupacion };
  ver: { venta: boolean; costo: boolean; deuda: boolean };
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
}

function permisos(c: ContextoUsuario) {
  return {
    venta: c.permisos.tiene("precios.ver_venta"),
    costo: c.permisos.tiene("precios.ver_costos") && c.permisos.tiene("precios.ver_margenes"),
    compras: c.permisos.tiene("precios.ver_costos"),
    deuda: c.permisos.tiene("proveedores.ver_credito"),
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
    const { zonaHoraria: zona } = await configuracionEmpresa(tx);
    const { desde, hasta, agrupacion } = periodo;

    const ventas = await ventasPorDia(tx, periodo);
    const compras = ver.compras ? await comprasPorDia(tx, periodo, zona) : [];
    const series = agruparPorPeriodo<CampoBalance>(
      [
        ...ventas.map((v) => ({
          fecha: v.fecha,
          valores: { vendido: ver.venta ? v.vendido : "0", ganancia: ver.costo ? dec(v.vendido).minus(v.costo).toFixed(2) : "0" },
        })),
        ...compras.map((k) => ({ fecha: k.fecha, valores: { comprado: k.total } })),
      ],
      ["vendido", "comprado", "ganancia"],
      desde,
      hasta,
      agrupacion,
    );

    const vendido = sumar(ventas.map((v) => v.vendido)).toFixed(2);
    const costoVendido = sumar(ventas.map((v) => v.costo)).toFixed(2);
    const ganancia = dec(vendido).minus(costoVendido).toFixed(2);

    let pagado: string | null = null;
    if (ver.compras) {
      const dia = diaLocal(pagoProveedor.fechaPago, zona);
      const [p] = await tx
        .select({ total: sql<string>`coalesce(sum(${pagoProveedor.monto}), 0)` })
        .from(pagoProveedor)
        .where(and(eq(pagoProveedor.estado, "REGISTRADO"), sql`${dia} between ${desde} and ${hasta}`));
      pagado = dec(p?.total ?? "0").toFixed(2);
    }

    let sinFacturar: string | null = null;
    if (ver.venta) {
      const [s] = await tx
        .select({ total: sql<string>`coalesce(sum(${entrega.importeTotal}), 0)` })
        .from(entrega)
        .where(and(eq(entrega.estado, "ENTREGADA"), eq(entrega.estadoFacturacion, "SIN_FACTURAR")));
      sinFacturar = dec(s?.total ?? "0").toFixed(2);
    }

    let deuda: Serie<"saldo">[] = [];
    let deudaHoy: string | null = null;
    if (ver.deuda) {
      const dia = sql<string>`coalesce(${movimientoCuentaProveedor.fechaOrigen}, ${diaLocal(movimientoCuentaProveedor.fecha, zona)})`;
      const [antes] = await tx.select({ saldo: sql<string>`coalesce(sum(${movimientoCuentaProveedor.importe}), 0)` }).from(movimientoCuentaProveedor).where(sql`${dia} < ${desde}`);
      const movimientos = await tx
        .select({ fecha: dia, importe: sql<string>`sum(${movimientoCuentaProveedor.importe})` })
        .from(movimientoCuentaProveedor)
        .where(sql`${dia} between ${desde} and ${hasta}`)
        .groupBy(dia);
      deuda = saldoAlFinalDeCadaPeriodo(antes?.saldo ?? "0", movimientos, desde, hasta, agrupacion);
      const [total] = await tx.select({ saldo: sql<string>`coalesce(sum(${movimientoCuentaProveedor.importe}), 0)` }).from(movimientoCuentaProveedor);
      deudaHoy = dec(total?.saldo ?? "0").toFixed(2);
    }

    const entregadas = and(eq(entrega.estado, "ENTREGADA"), gte(jornada.fecha, desde), lte(jornada.fecha, hasta));
    const clientes = ver.venta
      ? await tx
          .select({ cliente: cliente.nombre, vendido: sql<string>`sum(${entrega.importeTotal})`, costo: sql<string>`sum(${entrega.costoTotal})` })
          .from(entrega)
          .innerJoin(jornada, eq(jornada.id, entrega.jornadaId))
          .innerJoin(cliente, eq(cliente.id, entrega.clienteId))
          .where(entregadas)
          .groupBy(cliente.nombre)
          .orderBy(sql`sum(${entrega.importeTotal}) desc`)
      : [];
    const productos = ver.venta
      ? await tx
          .select({
            producto: entregaItem.productoNombre,
            vendido: sql<string>`sum(coalesce(${entregaItem.importe}, 0))`,
            costo: sql<string>`sum(round(coalesce(${entregaItem.cantidadEntregada}, 0) * coalesce(${entregaItem.costoUnitario}, 0), 2))`,
          })
          .from(entregaItem)
          .innerJoin(entrega, eq(entrega.id, entregaItem.entregaId))
          .innerJoin(jornada, eq(jornada.id, entrega.jornadaId))
          .where(entregadas)
          .groupBy(entregaItem.productoNombre)
          .orderBy(sql`sum(coalesce(${entregaItem.importe}, 0)) desc`)
      : [];
    const fila = (x: { vendido: string; costo: string }) => ({ vendido: dec(x.vendido).toFixed(2), ganancia: ver.costo ? dec(x.vendido).minus(x.costo).toFixed(2) : null });

    return {
      periodo,
      ver: { venta: ver.venta, costo: ver.costo, deuda: ver.deuda },
      totales: {
        entregas: ventas.reduce((s, v) => s + Number(v.entregas), 0),
        vendido: ver.venta ? vendido : null,
        costoVendido: ver.costo ? costoVendido : null,
        ganancia: ver.costo ? ganancia : null,
        gananciaPct: ver.costo ? pct(ganancia, vendido) : null,
        comprado: ver.compras ? sumar(compras.map((k) => k.total)).toFixed(2) : null,
        pagado,
        sinFacturar,
        deuda: deudaHoy,
      },
      series,
      deuda,
      clientes: clientes.map((x) => ({ cliente: x.cliente, ...fila(x) })),
      productos: productos.map((x) => ({ producto: x.producto, ...fila(x) })),
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
