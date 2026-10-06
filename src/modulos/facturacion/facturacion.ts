import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";

import { auditar } from "@/db/auditoria";
import { cliente, entrega, entregaItem, factura, facturaEntrega, jornada, puntoEntrega } from "@/db/esquema";
import { siguienteNumero } from "@/db/secuencia";
import type { BaseDatos, Transaccion } from "@/db/tipos";
import { aNumeric, dec, sumar } from "@/dominio/dinero/decimal";
import { formatearMoneda } from "@/dominio/dinero/formato";
import { ErrorDeNegocio } from "@/dominio/errores";
import { hoyEnEmpresa, type FechaISO } from "@/dominio/fechas/fechas";
import { formatearNumeroDocumento } from "@/dominio/numeracion/numeracion";
import { configuracionEmpresa, numeroEntrega } from "@/modulos/entregas/comun";
import { documentosAlDia, documentosAlDiaDe } from "@/modulos/entregas/documentos";
import { registrarActividad } from "@/modulos/colaboracion/registro";
import { ejecutarComoUsuario, type ContextoUsuario } from "@/modulos/seguridad/contexto";

// Facturación del MVP (04 §5.g): comprobante interno no fiscal que agrupa entregas confirmadas
// del mismo cliente (RN-135 a RN-143).

export const numeroFactura = (n: number) => formatearNumeroDocumento("FAC-", n);
export type Periodicidad = "POR_ENTREGA" | "SEMANAL" | "QUINCENAL" | "MENSUAL";

/**
 * Emite un comprobante con entregas del mismo cliente (RN-136, RN-137): confirmadas, sin facturar,
 * con total mayor que 0 y documentos de su última versión. Las entregas pasan a FACTURADA.
 */
export async function emitirComprobante(
  tx: Transaccion,
  c: ContextoUsuario,
  datos: { entregaIds: string[]; periodoDesde?: FechaISO | null; periodoHasta?: FechaISO | null },
): Promise<{ facturaId: string; numero: string; total: string }> {
  if (datos.entregaIds.length === 0) throw new ErrorDeNegocio("VALIDACION", "Elegí al menos una entrega.");
  const entregas = await tx.select().from(entrega).where(inArray(entrega.id, datos.entregaIds)).orderBy(asc(entrega.numero)).for("update");
  if (entregas.length !== new Set(datos.entregaIds).size) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró alguna de las entregas.");
  const clienteId = entregas[0]!.clienteId;
  for (const e of entregas) {
    const n = numeroEntrega(e.numero);
    if (e.clienteId !== clienteId) throw new ErrorDeNegocio("VALIDACION", "Un comprobante es de un solo cliente (RN-136).");
    if (e.estado !== "ENTREGADA") throw new ErrorDeNegocio("VALIDACION", `${n} todavía no se entregó.`);
    if (e.estadoFacturacion === "FACTURADA") throw new ErrorDeNegocio("VALIDACION", `${n} ya está facturada.`);
    if (!dec(e.importeTotal).gt(0)) throw new ErrorDeNegocio("VALIDACION", `${n} tiene total $0: no se factura (RN-136).`);
    if (!(await documentosAlDia(tx, e.id, e.version))) throw new ErrorDeNegocio("VALIDACION", `${n}: faltan emitir los documentos de su última versión.`);
  }
  const [cli] = await tx.select().from(cliente).where(eq(cliente.id, clienteId));
  const empresa = await configuracionEmpresa(tx);
  const neto = sumar(entregas.map((e) => e.importeNeto));
  const iva = sumar(entregas.map((e) => e.importeIva));
  const total = sumar(entregas.map((e) => e.importeTotal));
  const { numero, visible } = await siguienteNumero(tx, "FACTURA");
  const [f] = await tx
    .insert(factura)
    .values({
      empresaId: c.empresaId,
      numero,
      clienteId,
      fechaEmision: hoyEnEmpresa(new Date(), empresa.zonaHoraria),
      periodoDesde: datos.periodoDesde ?? null,
      periodoHasta: datos.periodoHasta ?? null,
      clienteNombre: cli!.nombre,
      clienteRazonSocial: cli!.razonSocial,
      clienteIdentificacionFiscal: cli!.identificacionFiscal,
      clienteCondicionFiscal: cli!.condicionFiscal,
      clienteDireccionFiscal: cli!.direccionFiscal,
      importeNeto: aNumeric(neto, 2),
      importeIva: aNumeric(iva, 2),
      importeTotal: aNumeric(total, 2),
      creadoPor: c.usuarioId,
      actualizadoPor: c.usuarioId,
    })
    .returning({ id: factura.id });
  for (const e of entregas) {
    await tx.insert(facturaEntrega).values({
      empresaId: c.empresaId,
      facturaId: f!.id,
      entregaId: e.id,
      entregaVersion: e.version,
      importeTotal: e.importeTotal,
      creadoPor: c.usuarioId,
      actualizadoPor: c.usuarioId,
    });
  }
  await tx
    .update(entrega)
    .set({ estadoFacturacion: "FACTURADA", actualizadoPor: c.usuarioId })
    .where(inArray(
      entrega.id,
      entregas.map((e) => e.id),
    ));
  await auditar(tx, {
    empresaId: c.empresaId,
    usuarioId: c.usuarioId,
    accion: "CREAR",
    entidad: "factura",
    entidadId: f!.id,
    resumen: `${visible} a ${cli!.nombre}: ${formatearMoneda(total)} (${entregas.length} ${entregas.length === 1 ? "entrega" : "entregas"}).`,
  });
  await registrarActividad(tx, c, { accion: "FACTURAR", entidadTipo: "FACTURA", entidadId: f!.id, resumen: `emitió el comprobante ${visible} a ${cli!.nombre}` });
  return { facturaId: f!.id, numero: visible, total: aNumeric(total, 2) };
}

/**
 * RN-143: si el cliente factura por entrega y la empresa lo tiene activado, el comprobante se
 * emite solo al confirmar la entrega (siempre que tenga total y documentos al día).
 */
export async function facturarAlConfirmar(tx: Transaccion, c: ContextoUsuario, entregaId: string): Promise<string | null> {
  const [e] = await tx
    .select({ total: entrega.importeTotal, version: entrega.version, estado: entrega.estado, facturacion: entrega.estadoFacturacion, periodicidad: cliente.periodicidadFacturacion })
    .from(entrega)
    .innerJoin(cliente, eq(cliente.id, entrega.clienteId))
    .where(eq(entrega.id, entregaId));
  if (!e || e.estado !== "ENTREGADA" || e.facturacion !== "SIN_FACTURAR" || e.periodicidad !== "POR_ENTREGA" || !dec(e.total).gt(0)) return null;
  const empresa = await configuracionEmpresa(tx);
  if (!empresa.facturarAutomaticoPorEntrega || !(await documentosAlDia(tx, entregaId, e.version))) return null;
  return (await emitirComprobante(tx, c, { entregaIds: [entregaId] })).numero;
}

export interface EntregaPorFacturar {
  id: string;
  numero: string;
  version: number;
  fecha: FechaISO;
  punto: string;
  total: string;
  documentosAlDia: boolean;
}

export interface ClientePorFacturar {
  clienteId: string;
  cliente: string;
  periodicidad: Periodicidad;
  sinIdentificacionFiscal: boolean;
  entregas: EntregaPorFacturar[];
  total: string;
}

/** P-85 / P-86: entregas confirmadas sin facturar (con total > 0), agrupadas por cliente (RN-141). */
export async function pendientesDeFacturar(
  db: BaseDatos,
  authUserId: string,
  filtros: { desde?: FechaISO; hasta?: FechaISO; periodicidad?: Periodicidad } = {},
): Promise<ClientePorFacturar[]> {
  return ejecutarComoUsuario(db, authUserId, "facturacion.ver", async (tx) => {
    const filas = await tx
      .select({
        id: entrega.id,
        numero: entrega.numero,
        version: entrega.version,
        fecha: jornada.fecha,
        punto: puntoEntrega.nombre,
        total: entrega.importeTotal,
        clienteId: cliente.id,
        cliente: cliente.nombre,
        periodicidad: cliente.periodicidadFacturacion,
        cuit: cliente.identificacionFiscal,
      })
      .from(entrega)
      .innerJoin(jornada, eq(jornada.id, entrega.jornadaId))
      .innerJoin(cliente, eq(cliente.id, entrega.clienteId))
      .innerJoin(puntoEntrega, eq(puntoEntrega.id, entrega.puntoEntregaId))
      .where(
        and(
          eq(entrega.estado, "ENTREGADA"),
          eq(entrega.estadoFacturacion, "SIN_FACTURAR"),
          sql`${entrega.importeTotal} > 0`,
          filtros.desde ? gte(jornada.fecha, filtros.desde) : undefined,
          filtros.hasta ? lte(jornada.fecha, filtros.hasta) : undefined,
          filtros.periodicidad ? eq(cliente.periodicidadFacturacion, filtros.periodicidad) : undefined,
        ),
      )
      .orderBy(asc(cliente.nombre), asc(jornada.fecha), asc(entrega.numero));
    const alDia = await documentosAlDiaDe(tx, filas);
    const grupos = new Map<string, ClientePorFacturar>();
    for (const f of filas) {
      const g = grupos.get(f.clienteId) ?? { clienteId: f.clienteId, cliente: f.cliente, periodicidad: f.periodicidad, sinIdentificacionFiscal: !f.cuit, entregas: [], total: "0" };
      g.entregas.push({ id: f.id, numero: numeroEntrega(f.numero), version: f.version, fecha: f.fecha, punto: f.punto, total: f.total, documentosAlDia: alDia.has(f.id) });
      g.total = dec(g.total).plus(f.total).toFixed(2);
      grupos.set(f.clienteId, g);
    }
    return [...grupos.values()];
  });
}

/**
 * P-86 "Facturar período" (04 §5.g.2): un comprobante por cliente con las entregas elegidas. Si
 * alguna no se puede facturar, no se emite ninguno.
 */
export async function facturarPeriodo(
  db: BaseDatos,
  authUserId: string,
  datos: { entregaIds: string[]; desde?: FechaISO | null; hasta?: FechaISO | null },
): Promise<{ numero: string; total: string }[]> {
  return ejecutarComoUsuario(db, authUserId, "facturacion.emitir", async (tx, c) => {
    if (datos.entregaIds.length === 0) throw new ErrorDeNegocio("VALIDACION", "Elegí al menos una entrega.");
    // Un comprobante por cliente, en orden alfabético (la numeración queda siempre igual).
    const filas = await tx
      .select({ id: entrega.id, clienteId: entrega.clienteId })
      .from(entrega)
      .innerJoin(cliente, eq(cliente.id, entrega.clienteId))
      .where(inArray(entrega.id, datos.entregaIds))
      .orderBy(asc(cliente.nombre), asc(entrega.numero));
    const porCliente = new Map<string, string[]>();
    for (const f of filas) porCliente.set(f.clienteId, [...(porCliente.get(f.clienteId) ?? []), f.id]);
    const emitidos = [];
    for (const ids of porCliente.values()) {
      const r = await emitirComprobante(tx, c, { entregaIds: ids, periodoDesde: datos.desde ?? null, periodoHasta: datos.hasta ?? null });
      emitidos.push({ numero: r.numero, total: r.total });
    }
    return emitidos;
  });
}

export interface ComprobanteListado {
  id: string;
  numero: string;
  fecha: FechaISO;
  cliente: string;
  periodo: { desde: FechaISO; hasta: FechaISO } | null;
  entregas: number;
  total: string;
  estado: "EMITIDA" | "ANULADA";
  exportadaEn: Date | null;
}

/** P-85 Comprobantes emitidos en un período. */
export async function listarComprobantes(db: BaseDatos, authUserId: string, periodo: { desde: FechaISO; hasta: FechaISO }): Promise<ComprobanteListado[]> {
  return ejecutarComoUsuario(db, authUserId, "facturacion.ver", async (tx) => {
    const filas = await tx
      .select({
        f: factura,
        entregas: sql<number>`(select count(*) from ${facturaEntrega} fe where fe.factura_id = factura.id)`,
      })
      .from(factura)
      .where(and(gte(factura.fechaEmision, periodo.desde), lte(factura.fechaEmision, periodo.hasta)))
      .orderBy(desc(factura.numero));
    return filas.map(({ f, entregas }) => ({
      id: f.id,
      numero: numeroFactura(f.numero),
      fecha: f.fechaEmision,
      cliente: f.clienteNombre ?? "",
      periodo: f.periodoDesde && f.periodoHasta ? { desde: f.periodoDesde, hasta: f.periodoHasta } : null,
      entregas: Number(entregas),
      total: f.importeTotal,
      estado: f.estado,
      exportadaEn: f.exportadaEn,
    }));
  });
}

export interface DetalleComprobante {
  id: string;
  numero: string;
  fecha: FechaISO;
  estado: "EMITIDA" | "ANULADA";
  motivoAnulacion: string | null;
  periodo: { desde: FechaISO; hasta: FechaISO } | null;
  cliente: { nombre: string; razonSocial: string | null; identificacionFiscal: string | null; condicionFiscal: string | null; direccionFiscal: string | null };
  entregas: { id: string; numero: string; version: number; fecha: FechaISO; punto: string; referencia: string | null; total: string }[];
  lineas: { producto: string; cantidad: string; unidad: string; precio: string | null; importe: string }[];
  neto: string;
  iva: string;
  total: string;
  exportadaEn: Date | null;
}

/** P-87 y DOC-08: el comprobante con sus entregas y, para el detalle, sus líneas. */
export async function obtenerComprobante(db: BaseDatos, authUserId: string, facturaId: string): Promise<DetalleComprobante> {
  return ejecutarComoUsuario(db, authUserId, "facturacion.ver", async (tx) => {
    const [f] = await tx.select().from(factura).where(eq(factura.id, facturaId));
    if (!f) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el comprobante.");
    const entregas = await tx
      .select({
        id: entrega.id,
        numero: entrega.numero,
        version: facturaEntrega.entregaVersion,
        fecha: jornada.fecha,
        punto: entrega.puntoEntregaNombre,
        referencia: entrega.referenciaCliente,
        total: facturaEntrega.importeTotal,
      })
      .from(facturaEntrega)
      .innerJoin(entrega, eq(entrega.id, facturaEntrega.entregaId))
      .innerJoin(jornada, eq(jornada.id, entrega.jornadaId))
      .where(eq(facturaEntrega.facturaId, f.id))
      .orderBy(asc(jornada.fecha), asc(entrega.numero));
    const lineas = entregas.length
      ? await tx
          .select({
            producto: entregaItem.productoNombre,
            cantidad: sql<string>`coalesce(${entregaItem.cantidadEntregada}, ${entregaItem.cantidadPreparada}, 0)`,
            unidad: entregaItem.unidadBase,
            precio: entregaItem.precioUnitario,
            importe: sql<string>`coalesce(${entregaItem.importe}, 0)`,
          })
          .from(entregaItem)
          .where(
            inArray(
              entregaItem.entregaId,
              entregas.map((e) => e.id),
            ),
          )
          .orderBy(asc(entregaItem.entregaId), asc(entregaItem.linea))
      : [];
    return {
      id: f.id,
      numero: numeroFactura(f.numero),
      fecha: f.fechaEmision,
      estado: f.estado,
      motivoAnulacion: f.motivoAnulacion,
      periodo: f.periodoDesde && f.periodoHasta ? { desde: f.periodoDesde, hasta: f.periodoHasta } : null,
      cliente: { nombre: f.clienteNombre ?? "", razonSocial: f.clienteRazonSocial, identificacionFiscal: f.clienteIdentificacionFiscal, condicionFiscal: f.clienteCondicionFiscal, direccionFiscal: f.clienteDireccionFiscal },
      entregas: entregas.map((e) => ({ ...e, numero: numeroEntrega(e.numero), punto: e.punto ?? "" })),
      lineas: lineas.filter((l) => dec(l.cantidad).gt(0)),
      neto: f.importeNeto,
      iva: f.importeIva,
      total: f.importeTotal,
      exportadaEn: f.exportadaEn,
    };
  });
}

/** Anular un comprobante (RN-139): sus entregas vuelven a SIN_FACTURAR para corregirlas y facturarlas de nuevo. */
export async function anularComprobante(db: BaseDatos, authUserId: string, datos: { facturaId: string; motivo: string }): Promise<void> {
  const motivo = datos.motivo?.trim() ?? "";
  if (motivo.length < 5) throw new ErrorDeNegocio("VALIDACION", "Escribí por qué se anula (al menos 5 letras).");
  await ejecutarComoUsuario(db, authUserId, "facturacion.anular", async (tx, c) => {
    const [f] = await tx.select().from(factura).where(eq(factura.id, datos.facturaId)).for("update");
    if (!f) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el comprobante.");
    if (f.estado === "ANULADA") return;
    await tx.update(factura).set({ estado: "ANULADA", anuladoEn: sql`now()`, anuladoPor: c.usuarioId, motivoAnulacion: motivo, actualizadoPor: c.usuarioId }).where(eq(factura.id, f.id));
    const liberadas = await tx
      .update(facturaEntrega)
      .set({ activa: false, actualizadoPor: c.usuarioId })
      .where(and(eq(facturaEntrega.facturaId, f.id), eq(facturaEntrega.activa, true)))
      .returning({ entregaId: facturaEntrega.entregaId });
    if (liberadas.length) {
      await tx
        .update(entrega)
        .set({ estadoFacturacion: "SIN_FACTURAR", actualizadoPor: c.usuarioId })
        .where(inArray(
          entrega.id,
          liberadas.map((l) => l.entregaId),
        ));
    }
    await auditar(tx, { empresaId: c.empresaId, usuarioId: c.usuarioId, accion: "ANULAR", entidad: "factura", entidadId: f.id, resumen: `Anulación de ${numeroFactura(f.numero)}.`, motivo });
    await registrarActividad(tx, c, { accion: "ANULAR", entidadTipo: "FACTURA", entidadId: f.id, resumen: `anuló el comprobante ${numeroFactura(f.numero)} (${motivo})` });
  });
}
