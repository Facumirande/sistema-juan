import { and, asc, eq, gte, isNotNull, lte, or, sql } from "drizzle-orm";

import { cliente, compra, compraItem, entrega, entregaItem, jornada, producto, proveedor } from "@/db/esquema";
import type { BaseDatos } from "@/db/tipos";
import { diasDeAtraso } from "@/dominio/compras/credito";
import { dec, redondear2, sumar } from "@/dominio/dinero/decimal";
import { hoyEnEmpresa, type FechaISO } from "@/dominio/fechas/fechas";
import { partidasDeudoras } from "@/modulos/compras/imputaciones";
import type { ResumenGuardado } from "@/modulos/jornadas/cierre";
import { configuracionEmpresa } from "@/modulos/entregas/comun";
import { ejecutarComoUsuario } from "@/modulos/seguridad/contexto";

// P-90 Reportes (MVP básico, 08 §5.13): R-01/R-02 ventas y margen, R-04 jornadas, R-05 compras,
// R-07 deuda con proveedores por antigüedad y R-09 faltantes y diferencias. Los importes dependen
// de los permisos de precios de quien mira.

export interface Periodo {
  desde: FechaISO;
  hasta: FechaISO;
}

const enPeriodo = (p: Periodo) => and(gte(jornada.fecha, p.desde), lte(jornada.fecha, p.hasta));
const margenPct = (venta: string, costo: string) => (dec(venta).isZero() ? null : redondear2(dec(venta).minus(costo).div(venta).times(100)).toFixed(2));

/** R-01 y R-02: lo entregado en el período por cliente y por producto (cantidad entregada × precio congelado). */
export async function reporteVentas(db: BaseDatos, authUserId: string, periodo: Periodo) {
  return ejecutarComoUsuario(db, authUserId, "reportes.ver", async (tx, c) => {
    const verVenta = c.permisos.tiene("precios.ver_venta");
    const verCosto = c.permisos.tiene("precios.ver_costos") && c.permisos.tiene("precios.ver_margenes");
    const entregadas = and(eq(entrega.estado, "ENTREGADA"), enPeriodo(periodo));
    const clientes = await tx
      .select({ cliente: cliente.nombre, entregas: sql<number>`count(*)`, venta: sql<string>`sum(${entrega.importeTotal})`, costo: sql<string>`sum(${entrega.costoTotal})` })
      .from(entrega)
      .innerJoin(jornada, eq(jornada.id, entrega.jornadaId))
      .innerJoin(cliente, eq(cliente.id, entrega.clienteId))
      .where(entregadas)
      .groupBy(cliente.nombre)
      .orderBy(sql`sum(${entrega.importeTotal}) desc`);
    const productos = await tx
      .select({
        producto: entregaItem.productoNombre,
        unidad: entregaItem.unidadBase,
        cantidad: sql<string>`sum(coalesce(${entregaItem.cantidadEntregada}, 0))`,
        venta: sql<string>`sum(coalesce(${entregaItem.importe}, 0))`,
        costo: sql<string>`sum(round(coalesce(${entregaItem.cantidadEntregada}, 0) * coalesce(${entregaItem.costoUnitario}, 0), 2))`,
      })
      .from(entregaItem)
      .innerJoin(entrega, eq(entrega.id, entregaItem.entregaId))
      .innerJoin(jornada, eq(jornada.id, entrega.jornadaId))
      .where(entregadas)
      .groupBy(entregaItem.productoNombre, entregaItem.unidadBase)
      .orderBy(sql`sum(coalesce(${entregaItem.importe}, 0)) desc`);
    const venta = sumar(clientes.map((x) => x.venta ?? "0"));
    const costo = sumar(clientes.map((x) => x.costo ?? "0"));
    const fila = <T extends { venta: string | null; costo: string | null }>(x: T) => ({
      ...x,
      venta: verVenta ? dec(x.venta ?? "0").toFixed(2) : null,
      costo: verCosto ? dec(x.costo ?? "0").toFixed(2) : null,
      margenPct: verCosto ? margenPct(x.venta ?? "0", x.costo ?? "0") : null,
    });
    return {
      porCliente: clientes.map((x) => ({ ...fila(x), entregas: Number(x.entregas) })),
      porProducto: productos.map(fila),
      total: { venta: verVenta ? venta.toFixed(2) : null, costo: verCosto ? costo.toFixed(2) : null, margenPct: verCosto ? margenPct(venta.toString(), costo.toString()) : null },
    };
  });
}

/** R-05 Compras del período por proveedor y por producto, con el costo promedio por unidad base. */
export async function reporteCompras(db: BaseDatos, authUserId: string, periodo: Periodo) {
  return ejecutarComoUsuario(db, authUserId, "reportes.ver", async (tx, c) => {
    if (!c.permisos.tiene("precios.ver_costos")) return { porProveedor: [], porProducto: [] };
    const vigentes = and(eq(compra.estado, "REGISTRADA"), enPeriodo(periodo));
    const porProveedor = await tx
      .select({ proveedor: proveedor.nombre, compras: sql<number>`count(*)`, total: sql<string>`sum(${compra.total})`, pagado: sql<string>`sum(${compra.montoPagadoEnElActo})` })
      .from(compra)
      .innerJoin(jornada, eq(jornada.id, compra.jornadaId))
      .innerJoin(proveedor, eq(proveedor.id, compra.proveedorId))
      .where(vigentes)
      .groupBy(proveedor.nombre)
      .orderBy(sql`sum(${compra.total}) desc`);
    const porProducto = await tx
      .select({ producto: producto.nombre, unidad: producto.unidadBase, cantidad: sql<string>`sum(${compraItem.cantidadBase})`, total: sql<string>`sum(${compraItem.subtotal})` })
      .from(compraItem)
      .innerJoin(compra, eq(compra.id, compraItem.compraId))
      .innerJoin(jornada, eq(jornada.id, compra.jornadaId))
      .innerJoin(producto, eq(producto.id, compraItem.productoId))
      .where(vigentes)
      .groupBy(producto.nombre, producto.unidadBase)
      .orderBy(sql`sum(${compraItem.subtotal}) desc`);
    return {
      porProveedor: porProveedor.map((x) => ({ ...x, compras: Number(x.compras) })),
      porProducto: porProducto.map((x) => ({ ...x, costoPromedio: dec(x.cantidad).gt(0) ? dec(x.total).div(x.cantidad).toDecimalPlaces(2).toFixed(2) : null })),
    };
  });
}

/** R-04 Resumen de jornadas: los resúmenes congelados de las jornadas cerradas. */
export async function reporteJornadas(db: BaseDatos, authUserId: string, periodo: Periodo) {
  return ejecutarComoUsuario(db, authUserId, "reportes.ver", async (tx, c) => {
    if (!c.permisos.tiene("precios.ver_margenes")) return [];
    const filas = await tx
      .select({ fecha: jornada.fecha, resumen: jornada.resumen })
      .from(jornada)
      .where(and(enPeriodo(periodo), eq(jornada.estado, "CERRADA")))
      .orderBy(asc(jornada.fecha));
    return filas.map((f) => ({ fecha: f.fecha, resumen: f.resumen as unknown as ResumenGuardado }));
  });
}

export type Tramo = "noVencido" | "de1a7" | "de8a15" | "de16a30" | "masDe30";

/** R-07 Deuda con proveedores por antigüedad (días de atraso respecto del vencimiento). */
export async function reporteDeuda(db: BaseDatos, authUserId: string) {
  return ejecutarComoUsuario(db, authUserId, "reportes.ver", async (tx, c) => {
    if (!c.permisos.tiene("proveedores.ver_credito")) return { hoy: "", filas: [] };
    const empresa = await configuracionEmpresa(tx);
    const hoy = hoyEnEmpresa(new Date(), empresa.zonaHoraria);
    const proveedores = await tx.select({ id: proveedor.id, nombre: proveedor.nombre }).from(proveedor).orderBy(asc(proveedor.nombre));
    const filas = [];
    for (const p of proveedores) {
      const pendientes = await partidasDeudoras(tx, p.id);
      if (pendientes.length === 0) continue;
      const tramos: Record<Tramo, string> = { noVencido: "0", de1a7: "0", de8a15: "0", de16a30: "0", masDe30: "0" };
      for (const d of pendientes) {
        const atraso = diasDeAtraso(d.vence, hoy);
        const t: Tramo = atraso === null ? "noVencido" : atraso <= 7 ? "de1a7" : atraso <= 15 ? "de8a15" : atraso <= 30 ? "de16a30" : "masDe30";
        tramos[t] = dec(tramos[t]).plus(d.pendiente).toFixed(2);
      }
      filas.push({ proveedor: p.nombre, ...tramos, total: sumar(pendientes.map((d) => d.pendiente)).toFixed(2) });
    }
    return { hoy, filas };
  });
}

/** R-09 Faltantes al preparar y diferencias al entregar, con su motivo. Sin importes. */
export async function reporteDiferencias(db: BaseDatos, authUserId: string, periodo: Periodo) {
  return ejecutarComoUsuario(db, authUserId, "reportes.ver", async (tx) => {
    const filas = await tx
      .select({
        fecha: jornada.fecha,
        cliente: cliente.nombre,
        producto: entregaItem.productoNombre,
        unidad: entregaItem.unidadBase,
        pedida: entregaItem.cantidadPedida,
        preparada: entregaItem.cantidadPreparada,
        entregada: entregaItem.cantidadEntregada,
        motivoFaltante: entregaItem.motivoFaltante,
        motivoDiferencia: entregaItem.motivoDiferencia,
        detalle: entregaItem.detalleDiferencia,
      })
      .from(entregaItem)
      .innerJoin(entrega, eq(entrega.id, entregaItem.entregaId))
      .innerJoin(jornada, eq(jornada.id, entrega.jornadaId))
      .innerJoin(cliente, eq(cliente.id, entrega.clienteId))
      .where(and(enPeriodo(periodo), sql`${entrega.estado} <> 'ANULADA'`, or(isNotNull(entregaItem.motivoFaltante), isNotNull(entregaItem.motivoDiferencia))))
      .orderBy(asc(jornada.fecha), asc(cliente.nombre), asc(entregaItem.linea));
    return filas.map((f) => ({
      ...f,
      faltante: f.motivoFaltante ? diferencia(f.pedida, f.preparada) : null,
      rechazo: f.motivoDiferencia ? diferencia(f.preparada, f.entregada) : null,
    }));
  });
}

function diferencia(mayor: string | null, menor: string | null): string {
  return dec(mayor ?? "0").minus(menor ?? "0").toFixed(3);
}
