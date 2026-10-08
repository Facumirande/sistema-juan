import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { auditar } from "@/db/auditoria";
import { cliente, cobroCliente, entrega, jornada, medioPago, puntoEntrega, usuario } from "@/db/esquema";
import { siguienteNumero } from "@/db/secuencia";
import type { BaseDatos, Transaccion } from "@/db/tipos";
import { debeDesde, repartirCobros, type CuentaDeCliente, type EstadoDeCobro } from "@/dominio/cuentas/clientes";
import { aNumeric, dec, sumar } from "@/dominio/dinero/decimal";
import { formatearMoneda } from "@/dominio/dinero/formato";
import { ErrorDeNegocio } from "@/dominio/errores";
import { hoyEnEmpresa, type FechaISO } from "@/dominio/fechas/fechas";
import { formatearNumeroDocumento } from "@/dominio/numeracion/numeracion";
import { registrarActividad } from "@/modulos/colaboracion/registro";
import { numeroEntrega } from "@/modulos/entregas/comun";
import { ejecutarComoUsuario } from "@/modulos/seguridad/contexto";
import { numeroOpcional, textoOpcional, validar } from "@/modulos/validacion";

// "A cobrar": la cuenta de cada cliente (07/10/2026). Lo que se le entregó es lo que debe; cada
// cobro baja la cuenta. No hay que elegir a qué entrega va un cobro: cancela lo más viejo, salvo
// que se cobre una entrega en particular ("💵 Cobrado" en esa entrega). Un cobro no se borra: se
// anula con motivo. El reparto de lo cobrado está en `src/dominio/cuentas/clientes.ts`.

export const numeroCobro = (n: number) => formatearNumeroDocumento("COB-", n);
const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export type MedioDeCobro = (typeof medioPago.enumValues)[number];

interface FilaCliente {
  id: string;
  nombre: string;
  tipo: string;
  saldoInicial: string;
  activo: boolean;
}
interface FilaEntrega {
  id: string;
  clienteId: string;
  numero: number;
  fecha: FechaISO;
  importe: string;
  punto: string;
}
interface FilaCobro {
  id: string;
  clienteId: string;
  entregaId: string | null;
  numero: number;
  fecha: FechaISO;
  monto: string;
  medioPago: MedioDeCobro;
}

/**
 * Lo entregado y lo cobrado de un cliente (o de todos), con la cuenta ya repartida. Tres consultas
 * que salen juntas: sirve para la pantalla "A cobrar", la cuenta de un cliente y el balance.
 */
export async function cuentasDeClientes(tx: Transaccion, clienteId?: string): Promise<{ cliente: FilaCliente; entregas: FilaEntrega[]; cobros: FilaCobro[]; cuenta: CuentaDeCliente }[]> {
  const [clientes, entregas, cobros] = await Promise.all([
    tx
      .select({ id: cliente.id, nombre: cliente.nombre, tipo: cliente.tipoCliente, saldoInicial: cliente.saldoInicial, activo: cliente.activo })
      .from(cliente)
      .where(clienteId ? eq(cliente.id, clienteId) : undefined)
      .orderBy(asc(cliente.nombre)),
    tx
      .select({ id: entrega.id, clienteId: entrega.clienteId, numero: entrega.numero, fecha: jornada.fecha, importe: entrega.importeTotal, punto: puntoEntrega.nombre })
      .from(entrega)
      .innerJoin(jornada, eq(jornada.id, entrega.jornadaId))
      .innerJoin(puntoEntrega, eq(puntoEntrega.id, entrega.puntoEntregaId))
      .where(and(eq(entrega.estado, "ENTREGADA"), clienteId ? eq(entrega.clienteId, clienteId) : undefined))
      .orderBy(asc(jornada.fecha), asc(entrega.numero)),
    tx
      .select({ id: cobroCliente.id, clienteId: cobroCliente.clienteId, entregaId: cobroCliente.entregaId, numero: cobroCliente.numero, fecha: cobroCliente.fecha, monto: cobroCliente.monto, medioPago: cobroCliente.medioPago })
      .from(cobroCliente)
      .where(and(eq(cobroCliente.estado, "REGISTRADO"), clienteId ? eq(cobroCliente.clienteId, clienteId) : undefined))
      .orderBy(asc(cobroCliente.fecha), asc(cobroCliente.numero)),
  ]);
  return clientes.map((c) => {
    const suyas = entregas.filter((e) => e.clienteId === c.id);
    const suyos = cobros.filter((k) => k.clienteId === c.id);
    return { cliente: c, entregas: suyas, cobros: suyos, cuenta: repartirCobros(c.saldoInicial, suyas, suyos) };
  });
}

export interface CuentaClienteListada {
  clienteId: string;
  cliente: string;
  tipo: string;
  /** Lo que falta cobrarle. */
  aCobrar: string;
  /** Lo que pagó de más. */
  aFavor: string;
  entregasSinCobrar: number;
  /** El día de la entrega más vieja que debe. */
  desde: FechaISO | null;
  ultimoCobro: FechaISO | null;
}

/** P-65 "A cobrar": cada cliente con lo que debe (primero el que más), y el total. */
export async function listarCuentasClientes(db: BaseDatos, authUserId: string): Promise<{ cuentas: CuentaClienteListada[]; total: { aCobrar: string; aFavor: string; clientes: number } }> {
  return ejecutarComoUsuario(db, authUserId, "cobranzas.ver", async (tx) => {
    const cuentas = (await cuentasDeClientes(tx))
      .map(
        ({ cliente: c, cobros, cuenta }): CuentaClienteListada => ({
          clienteId: c.id,
          cliente: c.nombre,
          tipo: c.tipo,
          aCobrar: cuenta.aCobrar.toFixed(2),
          aFavor: cuenta.aFavor.toFixed(2),
          entregasSinCobrar: cuenta.entregas.filter((e) => !e.pendiente.isZero()).length,
          desde: debeDesde(cuenta),
          ultimoCobro: cobros.at(-1)?.fecha ?? null,
        }),
      )
      // Solo quien tiene algo: lo que debe, o plata a favor.
      .filter((c) => dec(c.aCobrar).gt(0) || dec(c.aFavor).gt(0))
      .sort((a, b) => dec(b.aCobrar).cmp(a.aCobrar) || a.cliente.localeCompare(b.cliente, "es"));
    return {
      cuentas,
      total: { aCobrar: sumar(cuentas.map((c) => c.aCobrar)).toFixed(2), aFavor: sumar(cuentas.map((c) => c.aFavor)).toFixed(2), clientes: cuentas.filter((c) => dec(c.aCobrar).gt(0)).length },
    };
  });
}

export interface CuentaDeUnCliente {
  clienteId: string;
  cliente: string;
  saldoInicial: string;
  saldoInicialPendiente: string;
  aCobrar: string;
  aFavor: string;
  entregado: string;
  cobrado: string;
  /** De la más nueva a la más vieja. */
  entregas: { id: string; numero: string; fecha: FechaISO; punto: string; importe: string; cobrado: string; pendiente: string; estado: EstadoDeCobro }[];
  /** Del más nuevo al más viejo, también los anulados. */
  cobros: { id: string; numero: string; fecha: FechaISO; monto: string; medioPago: MedioDeCobro; entrega: string | null; observaciones: string | null; anulado: boolean; motivoAnulacion: string | null; quien: string | null }[];
}

/** P-65b La cuenta de un cliente: cada entrega con lo que se cobró y lo que falta, y sus cobros. */
export async function cuentaDeCliente(db: BaseDatos, authUserId: string, clienteId: string): Promise<CuentaDeUnCliente> {
  const id = validar(z.uuid(), clienteId);
  return ejecutarComoUsuario(db, authUserId, "cobranzas.ver", async (tx) => {
    const [[datos], cobros] = await Promise.all([
      cuentasDeClientes(tx, id),
      tx
        .select({
          id: cobroCliente.id,
          numero: cobroCliente.numero,
          fecha: cobroCliente.fecha,
          monto: cobroCliente.monto,
          medioPago: cobroCliente.medioPago,
          entregaNumero: entrega.numero,
          observaciones: cobroCliente.observaciones,
          estado: cobroCliente.estado,
          motivoAnulacion: cobroCliente.motivoAnulacion,
          quien: usuario.nombre,
        })
        .from(cobroCliente)
        .leftJoin(entrega, eq(entrega.id, cobroCliente.entregaId))
        .leftJoin(usuario, eq(usuario.id, cobroCliente.creadoPor))
        .where(eq(cobroCliente.clienteId, id))
        .orderBy(desc(cobroCliente.fecha), desc(cobroCliente.numero)),
    ]);
    if (!datos) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el cliente.");
    const { cliente: c, entregas, cuenta } = datos;
    const numeros = new Map(entregas.map((e) => [e.id, e]));
    return {
      clienteId: c.id,
      cliente: c.nombre,
      saldoInicial: c.saldoInicial,
      saldoInicialPendiente: cuenta.saldoInicialPendiente.toFixed(2),
      aCobrar: cuenta.aCobrar.toFixed(2),
      aFavor: cuenta.aFavor.toFixed(2),
      entregado: sumar(entregas.map((e) => e.importe)).toFixed(2),
      cobrado: cuenta.cobrado.toFixed(2),
      entregas: cuenta.entregas
        .map((e) => ({
          id: e.id,
          numero: numeroEntrega(numeros.get(e.id)!.numero),
          fecha: e.fecha,
          punto: numeros.get(e.id)!.punto,
          importe: e.importe.toFixed(2),
          cobrado: e.cobrado.toFixed(2),
          pendiente: e.pendiente.toFixed(2),
          estado: e.estado,
        }))
        .reverse(),
      cobros: cobros.map((k) => ({
        id: k.id,
        numero: numeroCobro(k.numero),
        fecha: k.fecha,
        monto: k.monto,
        medioPago: k.medioPago,
        entrega: k.entregaNumero !== null ? numeroEntrega(k.entregaNumero) : null,
        observaciones: k.observaciones,
        anulado: k.estado === "ANULADO",
        motivoAnulacion: k.motivoAnulacion,
        quien: k.quien,
      })),
    };
  });
}

const esquemaCobro = z.object({
  clienteId: z.uuid("Elegí el cliente."),
  /** Cobrar una entrega en particular (lo que le falta, si no se dice cuánto). */
  entregaId: z.uuid().nullish(),
  /** Vacío = todo lo que debe (o todo lo que falta de esa entrega). */
  monto: numeroOpcional("Escribí cuánto cobraste (ej. 120.000)."),
  medioPago: z.enum(medioPago.enumValues, "Elegí cómo te pagó.").default("EFECTIVO"),
  fecha: z.string().regex(PATRON_FECHA, "Elegí el día del cobro.").nullish(),
  observaciones: textoOpcional(300),
});

export interface CobroRegistrado {
  cobroId: string;
  numero: string;
  cliente: string;
  monto: string;
  /** Lo que le queda por pagar después de este cobro. */
  aCobrar: string;
}

/**
 * Anota lo que pagó un cliente. Sin importe, es todo lo que debe (o todo lo que falta de la entrega
 * elegida): así "💵 Cobré" es un solo toque, y un segundo toque no cobra dos veces.
 */
export async function registrarCobro(db: BaseDatos, authUserId: string, datos: z.input<typeof esquemaCobro>): Promise<CobroRegistrado> {
  const d = validar(esquemaCobro, datos);
  return ejecutarComoUsuario(db, authUserId, "cobranzas.registrar", async (tx, c) => {
    // El cliente queda bloqueado hasta terminar: dos toques seguidos no anotan dos cobros.
    const [bloqueado] = await tx.select({ id: cliente.id }).from(cliente).where(eq(cliente.id, d.clienteId)).for("update");
    if (!bloqueado) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el cliente.");
    const [datosDeCuenta] = await cuentasDeClientes(tx, d.clienteId);
    const { cliente: cli, cuenta, entregas } = datosDeCuenta!;
    const hoy = hoyEnEmpresa(new Date(), c.zonaHoraria);
    const fecha = d.fecha ?? hoy;
    if (fecha > hoy) throw new ErrorDeNegocio("VALIDACION", "El día del cobro no puede ser posterior a hoy.");
    const deLaEntrega = d.entregaId ? cuenta.entregas.find((e) => e.id === d.entregaId) : null;
    if (d.entregaId && !deLaEntrega) throw new ErrorDeNegocio("VALIDACION", `Esa entrega no es de ${cli.nombre} o todavía no se entregó: recargá la página.`);
    const loQueFalta = deLaEntrega ? deLaEntrega.pendiente : cuenta.aCobrar;
    if (d.monto === null && loQueFalta.lte(0)) {
      throw new ErrorDeNegocio("VALIDACION", deLaEntrega ? "Esa entrega ya figura cobrada." : `${cli.nombre} no debe nada: ya está todo cobrado.`);
    }
    const monto = d.monto === null ? loQueFalta : dec(d.monto);
    if (monto.lte(0)) throw new ErrorDeNegocio("VALIDACION", "El importe tiene que ser mayor que $0.");
    const { numero, visible } = await siguienteNumero(tx, "COBRO_CLIENTE");
    const [nuevo] = await tx
      .insert(cobroCliente)
      .values({ empresaId: c.empresaId, numero, clienteId: d.clienteId, entregaId: d.entregaId ?? null, fecha, monto: aNumeric(monto, 2), medioPago: d.medioPago, observaciones: d.observaciones, creadoPor: c.usuarioId, actualizadoPor: c.usuarioId })
      .returning({ id: cobroCliente.id });
    const deCual = deLaEntrega ? ` por la entrega ${numeroEntrega(entregas.find((e) => e.id === deLaEntrega.id)!.numero)}` : "";
    await Promise.all([
      auditar(tx, { empresaId: c.empresaId, usuarioId: c.usuarioId, accion: "CREAR", entidad: "cobro_cliente", entidadId: nuevo!.id, resumen: `${visible} a ${cli.nombre}: ${formatearMoneda(monto)}${deCual}.` }),
      registrarActividad(tx, c, { accion: "COBRAR", entidadTipo: "CLIENTE", entidadId: d.clienteId, resumen: `anotó un cobro a ${cli.nombre}${deCual}` }),
    ]);
    return { cobroId: nuevo!.id, numero: visible, cliente: cli.nombre, monto: aNumeric(monto, 2), aCobrar: aNumeric(dec(cuenta.aCobrar).minus(monto).lt(0) ? 0 : dec(cuenta.aCobrar).minus(monto), 2) };
  });
}

/** Anula un cobro con motivo: lo que cancelaba vuelve a quedar por cobrar. */
export async function anularCobro(db: BaseDatos, authUserId: string, datos: { cobroId: string; motivo: string }): Promise<void> {
  const motivo = datos.motivo?.trim() ?? "";
  if (motivo.length < 3) throw new ErrorDeNegocio("VALIDACION", "Escribí por qué se anula el cobro (por ejemplo: se anotó dos veces).");
  await ejecutarComoUsuario(db, authUserId, "cobranzas.anular", async (tx, c) => {
    const [k] = await tx
      .select({ id: cobroCliente.id, numero: cobroCliente.numero, estado: cobroCliente.estado, monto: cobroCliente.monto, clienteId: cobroCliente.clienteId, cliente: cliente.nombre })
      .from(cobroCliente)
      .innerJoin(cliente, eq(cliente.id, cobroCliente.clienteId))
      .where(eq(cobroCliente.id, datos.cobroId))
      .for("update", { of: cobroCliente });
    if (!k) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el cobro.");
    if (k.estado === "ANULADO") throw new ErrorDeNegocio("VALIDACION", "Ese cobro ya estaba anulado.");
    await Promise.all([
      tx.update(cobroCliente).set({ estado: "ANULADO", anuladoEn: new Date(), anuladoPor: c.usuarioId, motivoAnulacion: motivo, actualizadoPor: c.usuarioId }).where(eq(cobroCliente.id, k.id)),
      auditar(tx, { empresaId: c.empresaId, usuarioId: c.usuarioId, accion: "ANULAR", entidad: "cobro_cliente", entidadId: k.id, resumen: `${numeroCobro(k.numero)} a ${k.cliente} (${formatearMoneda(k.monto)}) anulado.`, motivo }),
      registrarActividad(tx, c, { accion: "ANULAR", entidadTipo: "CLIENTE", entidadId: k.clienteId, resumen: `anuló el cobro ${numeroCobro(k.numero)} a ${k.cliente}` }),
    ]);
  });
}

const esquemaSaldoInicial = z.object({
  clienteId: z.uuid(),
  monto: numeroOpcional("Escribí cuánto debía (ej. 80.000), o dejalo vacío si no debía nada."),
});

/** Lo que el cliente ya debía antes de empezar a usar el sistema: es lo más viejo de su cuenta. */
export async function guardarSaldoInicialDeCliente(db: BaseDatos, authUserId: string, datos: z.input<typeof esquemaSaldoInicial>): Promise<void> {
  const d = validar(esquemaSaldoInicial, datos);
  const monto = dec(d.monto ?? "0");
  if (monto.lt(0)) throw new ErrorDeNegocio("VALIDACION", "Lo que debía no puede ser negativo.");
  await ejecutarComoUsuario(db, authUserId, "cobranzas.registrar", async (tx, c) => {
    const [cli] = await tx.select({ nombre: cliente.nombre, antes: cliente.saldoInicial }).from(cliente).where(eq(cliente.id, d.clienteId)).for("update");
    if (!cli) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el cliente.");
    if (dec(cli.antes).eq(monto)) return;
    await Promise.all([
      tx.update(cliente).set({ saldoInicial: aNumeric(monto, 2), actualizadoPor: c.usuarioId }).where(eq(cliente.id, d.clienteId)),
      auditar(tx, { empresaId: c.empresaId, usuarioId: c.usuarioId, accion: "MODIFICAR", entidad: "cliente", entidadId: d.clienteId, resumen: `Deuda de ${cli.nombre} anterior al sistema: ${formatearMoneda(cli.antes)} → ${formatearMoneda(monto)}.`, datosAntes: { saldoInicial: cli.antes }, datosDespues: { saldoInicial: aNumeric(monto, 2) } }),
      registrarActividad(tx, c, { accion: "MODIFICAR", entidadTipo: "CLIENTE", entidadId: d.clienteId, resumen: `cambió lo que debía de antes ${cli.nombre}` }),
    ]);
  });
}
