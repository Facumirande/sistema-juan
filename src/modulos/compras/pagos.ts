import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { auditar } from "@/db/auditoria";
import { compra, empresa, imputacionPagoProveedor, medioPago, modoImputacion, movimientoCuentaProveedor, pagoProveedor, proveedor, usuario } from "@/db/esquema";
import { siguienteNumero } from "@/db/secuencia";
import type { BaseDatos, Transaccion } from "@/db/tipos";
import { indicadoresCredito, validarImputacionManual, type IndicadoresCredito } from "@/dominio/compras/credito";
import { aNumeric, dec } from "@/dominio/dinero/decimal";
import { formatearMoneda } from "@/dominio/dinero/formato";
import { ErrorDeNegocio } from "@/dominio/errores";
import { hoyEnEmpresa, type FechaISO } from "@/dominio/fechas/fechas";
import { registrarActividad } from "@/modulos/colaboracion/registro";
import { ejecutarComoUsuario, type ContextoUsuario } from "@/modulos/seguridad/contexto";
import { numeroObligatorio, textoOpcional, validar } from "@/modulos/validacion";

import { numeroCompra, numeroPago, proveedorBloqueado, registrarMovimiento, saldoNeto, umbralesSemaforo } from "./cuenta";
import { aplicarSaldoAFavor, desactivarImputaciones, imputar, imputarPorFIFO, partidasDeudoras, type ClaveDeudora } from "./imputaciones";

// Pagos, reimputaciones y ajustes de la cuenta con cada proveedor (06 §4 a §6): RN-095 a RN-102.

export type MedioPago = (typeof medioPago.enumValues)[number];
export type ModoImputacion = (typeof modoImputacion.enumValues)[number];

const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MENSAJE_MOTIVO = "Escribí el motivo (al menos 5 letras).";

const esquemaAsignacion = z.object({
  clave: z.string().regex(/^[CD]:[0-9a-f-]{36}$/, "Elegí a qué compra va el pago."),
  monto: numeroObligatorio("Escribí cuánto va a esa compra."),
});

const esquemaPago = z.object({
  proveedorId: z.uuid("Elegí el proveedor."),
  fecha: z.string().regex(PATRON_FECHA, "Elegí la fecha del pago."),
  monto: numeroObligatorio("Escribí cuánto se pagó.").refine((v) => dec(v).gt(0), { message: "El pago tiene que ser mayor que $0." }),
  medio: z.enum(medioPago.enumValues, "Elegí cómo se pagó."),
  referencia: textoOpcional(120),
  chequeBanco: textoOpcional(80),
  chequeFechaCobro: z
    .string()
    .nullish()
    .transform((v) => (v?.trim() ? v.trim() : null)),
  observaciones: textoOpcional(500),
  modo: z.enum(modoImputacion.enumValues).default("FIFO"),
  /** Solo en modo MANUAL: a qué deudas va cada parte (RN-097). */
  asignaciones: z.array(esquemaAsignacion).default([]),
  claveIdempotencia: z.uuid().nullish(),
});

export interface ResultadoPago {
  pagoId: string;
  numero: string;
  credito: IndicadoresCredito;
}

/** Momento del pago: ahora si es de hoy; si no, el mediodía de ese día (la fecha es lo que cuenta). */
function instanteDelDia(fecha: FechaISO, hoy: FechaISO): Date {
  return fecha === hoy ? new Date() : new Date(`${fecha}T15:00:00Z`);
}

/** Imputa un crédito según el modo elegido. Devuelve lo que queda a favor. */
async function imputarSegunModo(
  tx: Transaccion,
  c: ContextoUsuario,
  proveedorId: string,
  pagoId: string,
  monto: string,
  modo: ModoImputacion,
  asignaciones: { clave: string; monto: string }[],
): Promise<void> {
  if (modo === "FIFO") {
    await imputarPorFIFO(tx, c, proveedorId, `P:${pagoId}`, monto);
    return;
  }
  const pendientes = await partidasDeudoras(tx, proveedorId);
  const validas = asignaciones.filter((a) => a.clave && a.monto.trim() !== "" && !dec(a.monto).isZero());
  validarImputacionManual(
    pendientes.map((p) => ({ id: p.clave, pendiente: p.pendiente })),
    validas.map((a) => ({ id: a.clave, monto: a.monto })),
    monto,
  );
  for (const a of validas) await imputar(tx, c, proveedorId, `P:${pagoId}`, a.clave as ClaveDeudora, a.monto, "MANUAL");
}

/** P-62 Registrar pago (06 §4.1): movimiento PAGO por el total e imputación FIFO o manual. */
export async function registrarPago(db: BaseDatos, authUserId: string, datos: z.input<typeof esquemaPago>): Promise<ResultadoPago> {
  const d = validar(esquemaPago, datos);
  return ejecutarComoUsuario(db, authUserId, "pagos.registrar", (tx, c) => pagoEnTransaccion(tx, c, d));
}

async function pagoEnTransaccion(tx: Transaccion, c: ContextoUsuario, d: z.output<typeof esquemaPago>): Promise<ResultadoPago> {
  if (d.claveIdempotencia) {
    const [ya] = await tx.select().from(pagoProveedor).where(eq(pagoProveedor.claveIdempotencia, d.claveIdempotencia));
    if (ya) {
      const [p] = await tx.select({ limite: proveedor.limiteCredito }).from(proveedor).where(eq(proveedor.id, ya.proveedorId));
      return { pagoId: ya.id, numero: numeroPago(ya.numero), credito: indicadoresCredito(await saldoNeto(tx, ya.proveedorId), p?.limite ?? null, await umbralesSemaforo(tx)) };
    }
  }
  // A un proveedor desactivado se le puede pagar lo que se le debe (RN-108).
  const prov = await proveedorBloqueado(tx, d.proveedorId);
  const [e] = await tx.select({ zona: empresa.zonaHoraria }).from(empresa);
  const hoy = hoyEnEmpresa(new Date(), e!.zona);
  if (d.fecha > hoy) throw new ErrorDeNegocio("VALIDACION", "La fecha del pago no puede ser futura (RN-095).");

  const { numero, visible } = await siguienteNumero(tx, "PAGO_PROVEEDOR");
  const [pago] = await tx
    .insert(pagoProveedor)
    .values({
      empresaId: c.empresaId,
      numero,
      proveedorId: prov.id,
      fechaPago: instanteDelDia(d.fecha, hoy),
      monto: aNumeric(d.monto, 2),
      medioPago: d.medio,
      referencia: d.referencia,
      chequeBanco: d.medio === "CHEQUE" ? d.chequeBanco : null,
      chequeFechaCobro: d.medio === "CHEQUE" ? d.chequeFechaCobro : null,
      origen: "POSTERIOR",
      modoImputacion: d.modo,
      observaciones: d.observaciones,
      claveIdempotencia: d.claveIdempotencia ?? null,
      creadoPor: c.usuarioId,
      actualizadoPor: c.usuarioId,
    })
    .returning({ id: pagoProveedor.id });
  await registrarMovimiento(tx, c, {
    proveedorId: prov.id,
    tipo: "PAGO",
    importe: aNumeric(dec(d.monto).neg(), 2),
    descripcion: `Pago ${visible} (${d.medio.toLowerCase()})${d.referencia ? ` ${d.referencia}` : ""}`,
    pagoProveedorId: pago!.id,
    fechaOrigen: d.fecha === hoy ? null : d.fecha,
  });
  await imputarSegunModo(tx, c, prov.id, pago!.id, d.monto, d.modo, d.asignaciones);
  await auditar(tx, {
    empresaId: c.empresaId,
    usuarioId: c.usuarioId,
    accion: "CREAR",
    entidad: "pago_proveedor",
    entidadId: pago!.id,
    resumen: `${visible} a ${prov.nombre}: ${formatearMoneda(d.monto)} (${d.modo === "FIFO" ? "a las compras más viejas" : "imputación manual"}).`,
  });
  await registrarActividad(tx, c, { accion: "PAGAR", entidadTipo: "PAGO", entidadId: pago!.id, resumen: `le pagó a ${prov.nombre} (${visible})` });
  return { pagoId: pago!.id, numero: visible, credito: indicadoresCredito(await saldoNeto(tx, prov.id), prov.limiteCredito, await umbralesSemaforo(tx)) };
}

const esquemaPagarDeuda = z.object({
  proveedorId: z.uuid("Elegí el proveedor."),
  clave: z.string().regex(/^[CD]:[0-9a-f-]{36}$/, "Elegí qué compra se pagó."),
  medio: z.enum(["EFECTIVO", "TRANSFERENCIA"], "Elegí cómo se pagó."),
  claveIdempotencia: z.uuid().nullish(),
});

/**
 * "Pagué esta compra" (uso interno, 05/10/2026): un pago de hoy por todo lo que falta de una
 * compra (o de una deuda cargada a mano), imputado a ella. Lo que falta se calcula en la misma
 * transacción, así un doble toque o un pago anterior no hacen pagar de más.
 */
export async function pagarDeuda(db: BaseDatos, authUserId: string, datos: z.input<typeof esquemaPagarDeuda>): Promise<ResultadoPago & { pagado: string; deuda: string }> {
  const d = validar(esquemaPagarDeuda, datos);
  return ejecutarComoUsuario(db, authUserId, "pagos.registrar", async (tx, c) => {
    await tx.select({ id: proveedor.id }).from(proveedor).where(eq(proveedor.id, d.proveedorId)).for("update");
    // El mismo toque repetido (misma clave) devuelve el pago que ya se hizo.
    if (d.claveIdempotencia) {
      const [ya] = await tx.select({ id: pagoProveedor.id, numero: pagoProveedor.numero, monto: pagoProveedor.monto }).from(pagoProveedor).where(eq(pagoProveedor.claveIdempotencia, d.claveIdempotencia));
      if (ya) {
        const [p] = await tx.select({ limite: proveedor.limiteCredito }).from(proveedor).where(eq(proveedor.id, d.proveedorId));
        return { pagoId: ya.id, numero: numeroPago(ya.numero), credito: indicadoresCredito(await saldoNeto(tx, d.proveedorId), p?.limite ?? null, await umbralesSemaforo(tx)), pagado: ya.monto, deuda: "La compra" };
      }
    }
    const deuda = (await partidasDeudoras(tx, d.proveedorId)).find((x) => x.clave === d.clave);
    if (!deuda) throw new ErrorDeNegocio("VALIDACION", "Esa compra ya está pagada: no queda nada pendiente.");
    const [e] = await tx.select({ zona: empresa.zonaHoraria }).from(empresa);
    const r = await pagoEnTransaccion(tx, c, {
      proveedorId: d.proveedorId,
      fecha: hoyEnEmpresa(new Date(), e!.zona),
      monto: deuda.pendiente,
      medio: d.medio,
      referencia: null,
      chequeBanco: null,
      chequeFechaCobro: null,
      observaciones: null,
      modo: "MANUAL",
      asignaciones: [{ clave: d.clave, monto: deuda.pendiente }],
      claveIdempotencia: d.claveIdempotencia ?? null,
    });
    return { ...r, pagado: deuda.pendiente, deuda: deuda.descripcion };
  });
}

/**
 * Anula un pago dentro de una transacción ya abierta (06 §6.2): movimiento ANULACION_PAGO que
 * compensa el PAGO, imputaciones desactivadas y pago ANULADO. También la usa la anulación de una
 * compra cuando el proveedor devolvió la plata.
 */
export async function anularPagoEnTransaccion(tx: Transaccion, c: ContextoUsuario, pago: typeof pagoProveedor.$inferSelect, motivo: string): Promise<void> {
  const visible = numeroPago(pago.numero);
  await tx
    .update(pagoProveedor)
    .set({ estado: "ANULADO", anuladoEn: sql`now()`, anuladoPor: c.usuarioId, motivoAnulacion: motivo, actualizadoPor: c.usuarioId })
    .where(eq(pagoProveedor.id, pago.id));
  const [mov] = await tx
    .select({ id: movimientoCuentaProveedor.id })
    .from(movimientoCuentaProveedor)
    .where(and(eq(movimientoCuentaProveedor.pagoProveedorId, pago.id), eq(movimientoCuentaProveedor.tipo, "PAGO")));
  await registrarMovimiento(tx, c, {
    proveedorId: pago.proveedorId,
    tipo: "ANULACION_PAGO",
    importe: aNumeric(pago.monto, 2),
    descripcion: `Anulación del pago ${visible}`,
    pagoProveedorId: pago.id,
    movimientoCompensadoId: mov?.id ?? null,
    motivo,
  });
  await desactivarImputaciones(tx, c, { pagoId: pago.id }, `Anulación de ${visible}`);
  await auditar(tx, { empresaId: c.empresaId, usuarioId: c.usuarioId, accion: "ANULAR", entidad: "pago_proveedor", entidadId: pago.id, resumen: `Anulación de ${visible}.`, motivo });
  await registrarActividad(tx, c, { accion: "ANULAR", entidadTipo: "PAGO", entidadId: pago.id, resumen: `anuló el pago ${visible} (${motivo})` });
}

/** P-64 Anular pago (RN-100). Devuelve un aviso si el proveedor queda por encima del límite. */
export async function anularPago(db: BaseDatos, authUserId: string, datos: { pagoId: string; motivo: string }): Promise<{ advertencia: string | null }> {
  const motivo = datos.motivo?.trim() ?? "";
  if (motivo.length < 5) throw new ErrorDeNegocio("VALIDACION", MENSAJE_MOTIVO);
  return ejecutarComoUsuario(db, authUserId, "pagos.anular", async (tx, c) => {
    const [pago] = await tx.select().from(pagoProveedor).where(eq(pagoProveedor.id, datos.pagoId));
    if (!pago) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el pago.");
    const prov = await proveedorBloqueado(tx, pago.proveedorId);
    if (pago.estado === "ANULADO") return { advertencia: null };
    await anularPagoEnTransaccion(tx, c, pago, motivo);
    // Las deudas que quedaron libres pueden cancelarse con otro saldo a favor.
    await aplicarSaldoAFavor(tx, c, pago.proveedorId);
    const credito = indicadoresCredito(await saldoNeto(tx, prov.id), prov.limiteCredito, await umbralesSemaforo(tx));
    return { advertencia: credito.semaforo === "EXCEDIDO" ? `${prov.nombre} quedó por encima del límite de crédito (${formatearMoneda(credito.saldoPendiente)}).` : null };
  });
}

const esquemaReimputacion = z.object({
  pagoId: z.uuid(),
  motivo: z.string().trim().min(5, MENSAJE_MOTIVO),
  modo: z.enum(modoImputacion.enumValues).default("FIFO"),
  asignaciones: z.array(esquemaAsignacion).default([]),
});

/** Reimputar un pago (06 §4.5): se desactivan sus imputaciones y se imputa de nuevo. El saldo no cambia. */
export async function reimputarPago(db: BaseDatos, authUserId: string, datos: z.input<typeof esquemaReimputacion>): Promise<void> {
  const d = validar(esquemaReimputacion, datos);
  await ejecutarComoUsuario(db, authUserId, "pagos.anular", async (tx, c) => {
    const [pago] = await tx.select().from(pagoProveedor).where(eq(pagoProveedor.id, d.pagoId));
    if (!pago) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el pago.");
    if (pago.estado === "ANULADO") throw new ErrorDeNegocio("VALIDACION", "El pago está anulado.");
    await proveedorBloqueado(tx, pago.proveedorId);
    await desactivarImputaciones(tx, c, { pagoId: pago.id }, d.motivo);
    await imputarSegunModo(tx, c, pago.proveedorId, pago.id, pago.monto, d.modo, d.asignaciones);
    await auditar(tx, {
      empresaId: c.empresaId,
      usuarioId: c.usuarioId,
      accion: "MODIFICAR",
      entidad: "pago_proveedor",
      entidadId: pago.id,
      resumen: `Reimputación de ${numeroPago(pago.numero)} (${d.modo === "FIFO" ? "a las compras más viejas" : "manual"}).`,
      motivo: d.motivo,
    });
  });
}

const esquemaAjuste = z.object({
  proveedorId: z.uuid("Elegí el proveedor."),
  tipo: z.enum(["AJUSTE_DEBITO", "AJUSTE_CREDITO"], "Elegí si el ajuste sube o baja la deuda."),
  monto: numeroObligatorio("Escribí el importe del ajuste.").refine((v) => dec(v).gt(0), { message: "El importe tiene que ser mayor que $0." }),
  motivo: z.string().trim().min(5, MENSAJE_MOTIVO).max(300),
  /** Compra a la que se refiere (opcional): un crédito se imputa primero a ella. */
  compraId: z
    .string()
    .nullish()
    .transform((v) => (v?.trim() ? v.trim() : null))
    .pipe(z.uuid().nullable()),
  vencimiento: z
    .string()
    .nullish()
    .transform((v) => (v?.trim() ? v.trim() : null)),
});

/**
 * P-63 Ajuste de cuenta (06 §5, RN-102): un débito sube la deuda y queda como partida pendiente;
 * un crédito la baja y se imputa a la compra indicada o por FIFO. Devuelve un aviso si un débito
 * deja al proveedor por encima del límite.
 */
export async function registrarAjuste(db: BaseDatos, authUserId: string, datos: z.input<typeof esquemaAjuste>): Promise<{ advertencia: string | null }> {
  const d = validar(esquemaAjuste, datos);
  return ejecutarComoUsuario(db, authUserId, "pagos.ajustar", async (tx, c) => {
    const prov = await proveedorBloqueado(tx, d.proveedorId);
    let referencia = "";
    if (d.compraId) {
      const [cp] = await tx.select({ numero: compra.numero, proveedorId: compra.proveedorId, estado: compra.estado }).from(compra).where(eq(compra.id, d.compraId));
      if (!cp || cp.proveedorId !== prov.id) throw new ErrorDeNegocio("VALIDACION", "La compra elegida no es de este proveedor.");
      referencia = ` (${numeroCompra(cp.numero)})`;
    }
    const credito = d.tipo === "AJUSTE_CREDITO";
    const movimientoId = await registrarMovimiento(tx, c, {
      proveedorId: prov.id,
      tipo: d.tipo,
      importe: aNumeric(credito ? dec(d.monto).neg() : dec(d.monto), 2),
      descripcion: `${credito ? "Ajuste a nuestro favor" : "Ajuste a favor del proveedor"}${referencia}`,
      compraId: d.compraId,
      fechaVencimiento: credito ? null : d.vencimiento,
      motivo: d.motivo,
    });
    if (credito && d.compraId) {
      const pendiente = (await partidasDeudoras(tx, prov.id)).find((p) => p.clave === `C:${d.compraId}`)?.pendiente ?? "0";
      const aLaCompra = dec(pendiente).lt(d.monto) ? dec(pendiente) : dec(d.monto);
      if (aLaCompra.gt(0)) await imputar(tx, c, prov.id, `A:${movimientoId}`, `C:${d.compraId}`, aLaCompra.toString(), "MANUAL");
    }
    // Lo que no se imputó (o el débito nuevo) se concilia por FIFO con el resto de la cuenta.
    await aplicarSaldoAFavor(tx, c, prov.id);
    await auditar(tx, {
      empresaId: c.empresaId,
      usuarioId: c.usuarioId,
      accion: "CREAR",
      entidad: "movimiento_cuenta_proveedor",
      entidadId: movimientoId,
      resumen: `${credito ? "Ajuste a nuestro favor" : "Ajuste a favor del proveedor"} con ${prov.nombre}: ${formatearMoneda(d.monto)}${referencia}.`,
      motivo: d.motivo,
    });
    const indicadores = indicadoresCredito(await saldoNeto(tx, prov.id), prov.limiteCredito, await umbralesSemaforo(tx));
    return { advertencia: !credito && indicadores.semaforo === "EXCEDIDO" ? `${prov.nombre} quedó por encima del límite de crédito.` : null };
  });
}

export interface ImputacionDePago {
  id: string;
  compraId: string | null;
  deuda: string;
  monto: string;
  modo: ModoImputacion;
  activa: boolean;
  creadaEn: Date;
  desactivadaEn: Date | null;
  motivoDesactivacion: string | null;
}

export interface DetallePago {
  id: string;
  numero: string;
  proveedorId: string;
  proveedor: string;
  fecha: Date;
  monto: string;
  medio: MedioPago;
  referencia: string | null;
  chequeBanco: string | null;
  chequeFechaCobro: FechaISO | null;
  origen: "EN_COMPRA" | "POSTERIOR";
  compra: { id: string; numero: string; condicion: string } | null;
  modo: ModoImputacion;
  estado: "REGISTRADO" | "ANULADO";
  motivoAnulacion: string | null;
  observaciones: string | null;
  registradoPor: string | null;
  imputado: string;
  aFavor: string;
  imputaciones: ImputacionDePago[];
}

/** P-64 Detalle de pago: imputaciones activas y las que se desactivaron (con su motivo). */
export async function obtenerPago(db: BaseDatos, authUserId: string, pagoId: string): Promise<DetallePago> {
  return ejecutarComoUsuario(db, authUserId, "pagos.ver", async (tx) => {
    const [f] = await tx
      .select({ pago: pagoProveedor, proveedor: proveedor.nombre, registradoPor: usuario.nombre })
      .from(pagoProveedor)
      .innerJoin(proveedor, eq(proveedor.id, pagoProveedor.proveedorId))
      .leftJoin(usuario, eq(usuario.id, pagoProveedor.creadoPor))
      .where(eq(pagoProveedor.id, pagoId));
    if (!f) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el pago.");
    const p = f.pago;
    const imputaciones = await tx
      .select({ i: imputacionPagoProveedor, numeroCompra: compra.numero, deudor: movimientoCuentaProveedor.descripcion })
      .from(imputacionPagoProveedor)
      .leftJoin(compra, eq(compra.id, imputacionPagoProveedor.compraId))
      .leftJoin(movimientoCuentaProveedor, eq(movimientoCuentaProveedor.id, imputacionPagoProveedor.movimientoDeudorId))
      .where(eq(imputacionPagoProveedor.pagoProveedorId, p.id))
      .orderBy(desc(imputacionPagoProveedor.activa), asc(imputacionPagoProveedor.creadoEn), asc(compra.fechaCompra), asc(compra.numero));
    const [cp] = p.compraId ? await tx.select({ id: compra.id, numero: compra.numero, condicion: compra.condicionPago }).from(compra).where(eq(compra.id, p.compraId)) : [];
    const imputado = imputaciones.filter((x) => x.i.activa).reduce((s, x) => s.plus(x.i.monto), dec(0));
    return {
      id: p.id,
      numero: numeroPago(p.numero),
      proveedorId: p.proveedorId,
      proveedor: f.proveedor,
      fecha: p.fechaPago,
      monto: p.monto,
      medio: p.medioPago,
      referencia: p.referencia,
      chequeBanco: p.chequeBanco,
      chequeFechaCobro: p.chequeFechaCobro,
      origen: p.origen,
      compra: cp ? { id: cp.id, numero: numeroCompra(cp.numero), condicion: cp.condicion } : null,
      modo: p.modoImputacion,
      estado: p.estado,
      motivoAnulacion: p.motivoAnulacion,
      observaciones: p.observaciones,
      registradoPor: f.registradoPor,
      imputado: imputado.toFixed(2),
      aFavor: p.estado === "REGISTRADO" ? dec(p.monto).minus(imputado).toFixed(2) : "0.00",
      imputaciones: imputaciones.map((x) => ({
        id: x.i.id,
        compraId: x.i.compraId,
        deuda: x.numeroCompra !== null ? numeroCompra(x.numeroCompra) : (x.deudor ?? "Ajuste"),
        monto: x.i.monto,
        modo: x.i.modo,
        activa: x.i.activa,
        creadaEn: x.i.creadoEn,
        desactivadaEn: x.i.desactivadaEn,
        motivoDesactivacion: x.i.motivoDesactivacion,
      })),
    };
  });
}
