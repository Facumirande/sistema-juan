import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";

import { auditar } from "@/db/auditoria";
import { cliente, compra, empresa, entrega, entregaItem, factura, facturaEntrega, jornada, movimientoCuentaProveedor, pagoProveedor, proveedor } from "@/db/esquema";
import type { BaseDatos } from "@/db/tipos";
import { resumenVencimientos } from "@/dominio/compras/credito";
import { dec } from "@/dominio/dinero/decimal";
import { formatearFecha, hoyEnEmpresa, type FechaISO } from "@/dominio/fechas/fechas";
import { type Celda, type Hoja } from "@/lib/planilla";
import { numeroCompra, numeroPago } from "@/modulos/compras/cuenta";
import { partidasDeudoras } from "@/modulos/compras/imputaciones";
import { numeroEntrega } from "@/modulos/entregas/comun";
import { ejecutarComoUsuario } from "@/modulos/seguridad/contexto";

import { numeroFactura } from "./facturacion";

// P-88 Exportar para el contador (04 §5.g.3, RN-142): las seis hojas del período. Los anulados
// figuran marcados. El contenido depende solo de los datos, en un orden fijo.

const n = (v: string | null | undefined): Celda => (v === null || v === undefined ? null : { numero: dec(v).toFixed(2) });
const cant = (v: string | null | undefined): Celda => (v === null || v === undefined ? null : { numero: dec(v).toFixed(3) });
const fecha = (f: FechaISO | null) => (f ? formatearFecha(f) : null);

export async function hojasParaElContador(db: BaseDatos, authUserId: string, periodo: { desde: FechaISO; hasta: FechaISO }, marcarExportado = false): Promise<Hoja[]> {
  return ejecutarComoUsuario(db, authUserId, "facturacion.exportar", async (tx, c) => {
    const [e] = await tx.select({ zona: empresa.zonaHoraria }).from(empresa);
    const zona = e!.zona;
    const diaLocal = (col: unknown) => sql<FechaISO>`(${col} at time zone ${zona})::date`;

    const facturas = await tx
      .select()
      .from(factura)
      .where(and(gte(factura.fechaEmision, periodo.desde), lte(factura.fechaEmision, periodo.hasta)))
      .orderBy(asc(factura.numero));
    const ventas: Hoja = {
      nombre: "Ventas",
      columnas: ["Fecha", "Número", "Cliente", "CUIT", "Neto", "IVA", "Total", "Estado"],
      filas: facturas.map((f) => [
        fecha(f.fechaEmision),
        numeroFactura(f.numero),
        f.clienteNombre,
        f.clienteIdentificacionFiscal,
        n(f.importeNeto),
        n(f.importeIva),
        n(f.importeTotal),
        f.estado === "ANULADA" ? `ANULADA: ${f.motivoAnulacion ?? ""}` : "Emitida",
      ]),
    };

    const emitidas = facturas.filter((f) => f.estado === "EMITIDA");
    const detalle = emitidas.length
      ? await tx
          .select({
            fecha: jornada.fecha,
            entrega: entrega.numero,
            version: facturaEntrega.entregaVersion,
            factura: factura.numero,
            cliente: factura.clienteNombre,
            producto: entregaItem.productoNombre,
            cantidad: sql<string>`coalesce(${entregaItem.cantidadEntregada}, ${entregaItem.cantidadPreparada}, 0)`,
            unidad: entregaItem.unidadBase,
            precio: entregaItem.precioUnitario,
            importe: entregaItem.importe,
            alicuota: entregaItem.alicuotaIva,
          })
          .from(facturaEntrega)
          .innerJoin(factura, eq(factura.id, facturaEntrega.facturaId))
          .innerJoin(entrega, eq(entrega.id, facturaEntrega.entregaId))
          .innerJoin(jornada, eq(jornada.id, entrega.jornadaId))
          .innerJoin(entregaItem, eq(entregaItem.entregaId, entrega.id))
          .where(
            and(
              eq(facturaEntrega.activa, true),
              inArray(
                facturaEntrega.facturaId,
                emitidas.map((f) => f.id),
              ),
            ),
          )
          .orderBy(asc(factura.numero), asc(entrega.numero), asc(entregaItem.linea))
      : [];
    const ventasDetalle: Hoja = {
      nombre: "Ventas detalle",
      columnas: ["Fecha de entrega", "Entrega", "Comprobante", "Cliente", "Producto", "Cantidad", "Unidad", "Precio unitario", "Total", "Alícuota IVA"],
      filas: detalle
        .filter((d) => dec(d.cantidad).gt(0))
        .map((d) => [
          fecha(d.fecha),
          `${numeroEntrega(d.entrega)} v${d.version}`,
          numeroFactura(d.factura),
          d.cliente,
          d.producto,
          cant(d.cantidad),
          d.unidad,
          n(d.precio),
          n(d.importe),
          n(d.alicuota),
        ]),
    };

    const sinFacturar = await tx
      .select({ fecha: jornada.fecha, numero: entrega.numero, version: entrega.version, cliente: cliente.nombre, total: entrega.importeTotal })
      .from(entrega)
      .innerJoin(jornada, eq(jornada.id, entrega.jornadaId))
      .innerJoin(cliente, eq(cliente.id, entrega.clienteId))
      .where(and(eq(entrega.estado, "ENTREGADA"), eq(entrega.estadoFacturacion, "SIN_FACTURAR"), gte(jornada.fecha, periodo.desde), lte(jornada.fecha, periodo.hasta)))
      .orderBy(asc(jornada.fecha), asc(entrega.numero));
    const entregasSinFacturar: Hoja = {
      nombre: "Entregas sin facturar",
      columnas: ["Fecha", "Entrega", "Cliente", "Total"],
      filas: sinFacturar.map((s) => [fecha(s.fecha), `${numeroEntrega(s.numero)} v${s.version}`, s.cliente, n(s.total)]),
    };

    const compras = await tx
      .select({ fecha: diaLocal(compra.fechaCompra), numero: compra.numero, tipo: compra.tipo, proveedor: proveedor.nombre, cuit: proveedor.identificacionFiscal, total: compra.total, condicion: compra.condicionPago, estado: compra.estado, motivo: compra.motivoAnulacion })
      .from(compra)
      .innerJoin(proveedor, eq(proveedor.id, compra.proveedorId))
      .where(and(gte(diaLocal(compra.fechaCompra), periodo.desde), lte(diaLocal(compra.fechaCompra), periodo.hasta)))
      .orderBy(asc(compra.numero));
    const hojaCompras: Hoja = {
      nombre: "Compras",
      columnas: ["Fecha", "Número", "Proveedor", "CUIT", "Total", "Condición", "Estado"],
      filas: compras.map((x) => [
        fecha(x.fecha),
        numeroCompra(x.numero),
        x.proveedor,
        x.cuit,
        n(x.total),
        x.tipo === "SALDO_INICIAL" ? "Deuda anterior" : { CONTADO: "Contado", CREDITO: "Crédito", MIXTA: "Mixta" }[x.condicion],
        x.estado === "ANULADA" ? `ANULADA: ${x.motivo ?? ""}` : "Registrada",
      ]),
    };

    const pagos = await tx
      .select({ fecha: diaLocal(pagoProveedor.fechaPago), numero: pagoProveedor.numero, proveedor: proveedor.nombre, medio: pagoProveedor.medioPago, referencia: pagoProveedor.referencia, monto: pagoProveedor.monto, estado: pagoProveedor.estado, motivo: pagoProveedor.motivoAnulacion })
      .from(pagoProveedor)
      .innerJoin(proveedor, eq(proveedor.id, pagoProveedor.proveedorId))
      .where(and(gte(diaLocal(pagoProveedor.fechaPago), periodo.desde), lte(diaLocal(pagoProveedor.fechaPago), periodo.hasta)))
      .orderBy(asc(pagoProveedor.numero));
    const hojaPagos: Hoja = {
      nombre: "Pagos a proveedores",
      columnas: ["Fecha", "Número", "Proveedor", "Medio", "Referencia", "Monto", "Estado"],
      filas: pagos.map((p) => [fecha(p.fecha), numeroPago(p.numero), p.proveedor, p.medio, p.referencia, n(p.monto), p.estado === "ANULADO" ? `ANULADO: ${p.motivo ?? ""}` : "Registrado"]),
    };

    // Saldo al cierre del período, desde el libro (fecha de la boleta o del pago si se cargó después).
    const fc = sql<FechaISO>`coalesce(${movimientoCuentaProveedor.fechaOrigen}, (${movimientoCuentaProveedor.fecha} at time zone ${zona})::date)`;
    const saldos = await tx
      .select({ id: proveedor.id, proveedor: proveedor.nombre, cuit: proveedor.identificacionFiscal, saldo: sql<string>`coalesce(sum(${movimientoCuentaProveedor.importe}), 0)` })
      .from(proveedor)
      .leftJoin(movimientoCuentaProveedor, and(eq(movimientoCuentaProveedor.proveedorId, proveedor.id), lte(fc, periodo.hasta)))
      .groupBy(proveedor.id)
      .orderBy(asc(proveedor.nombre));
    const filasSaldos: Celda[][] = [];
    for (const s of saldos) {
      if (dec(s.saldo).isZero()) continue;
      const v = resumenVencimientos(await partidasDeudoras(tx, s.id), periodo.hasta, 0);
      filasSaldos.push([s.proveedor, s.cuit, n(s.saldo), n(v.vencida.toFixed(2))]);
    }
    const hojaSaldos: Hoja = { nombre: "Saldos de proveedores", columnas: [`Proveedor`, "CUIT", `Saldo al ${formatearFecha(periodo.hasta)}`, "Deuda vencida"], filas: filasSaldos };

    if (marcarExportado) {
      if (facturas.length) {
        await tx
          .update(factura)
          .set({ exportadaEn: sql`now()`, actualizadoPor: c.usuarioId })
          .where(inArray(
            factura.id,
            facturas.map((f) => f.id),
          ));
      }
      await auditar(tx, {
        empresaId: c.empresaId,
        usuarioId: c.usuarioId,
        accion: "EXPORTACION",
        entidad: "factura",
        resumen: `Exportación para el contador del ${formatearFecha(periodo.desde)} al ${formatearFecha(periodo.hasta)} (${facturas.length} comprobantes).`,
        datosDespues: { desde: periodo.desde, hasta: periodo.hasta, generadaEl: hoyEnEmpresa(new Date(), zona) },
      });
    }
    return [ventas, ventasDetalle, entregasSinFacturar, hojaCompras, hojaPagos, hojaSaldos];
  });
}
