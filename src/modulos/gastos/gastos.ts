import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";

import { auditar } from "@/db/auditoria";
import { medioPago, movimientoExtra, rubroGasto, tipoMovimientoExtra, usuario } from "@/db/esquema";
import type { BaseDatos, Transaccion } from "@/db/tipos";
import { aNumeric, dec, sumar } from "@/dominio/dinero/decimal";
import { formatearMoneda } from "@/dominio/dinero/formato";
import { ErrorDeNegocio } from "@/dominio/errores";
import { hoyEnEmpresa, type FechaISO } from "@/dominio/fechas/fechas";
import { registrarActividad } from "@/modulos/colaboracion/registro";
import { ejecutarComoUsuario, type ContextoUsuario } from "@/modulos/seguridad/contexto";
import { numeroObligatorio, numeroOpcional, textoObligatorio, textoOpcional, validar } from "@/modulos/validacion";

// "Gastos e ingresos" (07/10/2026): lo que se gasta o entra por fuera de la mercadería (nafta,
// peajes, arreglos, otros ingresos). Cada anotación va a un rubro, que se crea libremente con un
// dibujo y un título; si el rubro lo pide, además del importe se anota una cantidad (litros de
// nafta). Lo anotado no se edita ni se borra: se anula con motivo. Se usa con los permisos de pagos.

export type TipoDeMovimiento = (typeof tipoMovimientoExtra.enumValues)[number];
export type MedioDePago = (typeof medioPago.enumValues)[number];
const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Los rubros con los que arranca un negocio (se pueden cambiar, sumar otros o sacar los que no se usan). */
export const RUBROS_PREDEFINIDOS: readonly { nombre: string; dibujo: string; tipo: TipoDeMovimiento; unidad: string | null }[] = [
  { nombre: "Nafta", dibujo: "⛽", tipo: "GASTO", unidad: "litros" },
  { nombre: "Peajes y estacionamiento", dibujo: "🛣️", tipo: "GASTO", unidad: null },
  { nombre: "Arreglos del vehículo", dibujo: "🔧", tipo: "GASTO", unidad: null },
  { nombre: "Bolsas y envases", dibujo: "📦", tipo: "GASTO", unidad: null },
  { nombre: "Ayudantes y jornales", dibujo: "👷", tipo: "GASTO", unidad: null },
  { nombre: "Comidas y viáticos", dibujo: "🍽️", tipo: "GASTO", unidad: null },
  { nombre: "Café", dibujo: "☕", tipo: "GASTO", unidad: null },
  { nombre: "Impuestos y servicios", dibujo: "🧾", tipo: "GASTO", unidad: null },
  { nombre: "Otros gastos", dibujo: "💸", tipo: "GASTO", unidad: null },
  { nombre: "Venta de cajones y envases", dibujo: "♻️", tipo: "INGRESO", unidad: null },
  { nombre: "Otros ingresos", dibujo: "💵", tipo: "INGRESO", unidad: null },
];

export interface RubroDeGasto {
  id: string;
  nombre: string;
  dibujo: string;
  tipo: TipoDeMovimiento;
  unidad: string | null;
  activo: boolean;
}

/** Los rubros del negocio; la primera vez (todavía no hay ninguno) se crean los predefinidos. */
async function rubrosDelNegocio(tx: Transaccion, c: ContextoUsuario): Promise<RubroDeGasto[]> {
  const campos = { id: rubroGasto.id, nombre: rubroGasto.nombre, dibujo: rubroGasto.dibujo, tipo: rubroGasto.tipo, unidad: rubroGasto.unidad, activo: rubroGasto.activo };
  const filas = await tx.select(campos).from(rubroGasto).orderBy(asc(rubroGasto.orden), asc(rubroGasto.nombre));
  if (filas.length > 0) return filas;
  return tx
    .insert(rubroGasto)
    .values(RUBROS_PREDEFINIDOS.map((r, n) => ({ ...r, orden: n + 1, empresaId: c.empresaId, creadoPor: c.usuarioId, actualizadoPor: c.usuarioId })))
    .returning(campos);
}

export interface MovimientoExtraListado {
  id: string;
  fecha: FechaISO;
  tipo: TipoDeMovimiento;
  rubro: string;
  dibujo: string;
  monto: string;
  cantidad: string | null;
  unidad: string | null;
  detalle: string | null;
  medioPago: MedioDePago;
  anulado: boolean;
  motivoAnulacion: string | null;
  quien: string | null;
}

export interface TotalPorRubro {
  rubroId: string;
  rubro: string;
  dibujo: string;
  tipo: TipoDeMovimiento;
  total: string;
  cantidad: string | null;
  unidad: string | null;
  veces: number;
}

/** Lo anotado (sin lo anulado) entre dos fechas, sumado por rubro: de lo que más se gastó a lo que menos. */
export async function totalesPorRubro(tx: Transaccion, periodo: { desde: FechaISO; hasta: FechaISO }): Promise<TotalPorRubro[]> {
  const filas = await tx
    .select({
      rubroId: rubroGasto.id,
      rubro: rubroGasto.nombre,
      dibujo: rubroGasto.dibujo,
      tipo: movimientoExtra.tipo,
      unidad: rubroGasto.unidad,
      total: sql<string>`sum(${movimientoExtra.monto})`,
      cantidad: sql<string | null>`sum(${movimientoExtra.cantidad})`,
      veces: sql<number>`count(*)`,
    })
    .from(movimientoExtra)
    .innerJoin(rubroGasto, eq(rubroGasto.id, movimientoExtra.rubroId))
    .where(and(eq(movimientoExtra.estado, "REGISTRADO"), gte(movimientoExtra.fecha, periodo.desde), lte(movimientoExtra.fecha, periodo.hasta)))
    .groupBy(rubroGasto.id, rubroGasto.nombre, rubroGasto.dibujo, movimientoExtra.tipo, rubroGasto.unidad)
    .orderBy(sql`sum(${movimientoExtra.monto}) desc`);
  return filas.map((f) => ({ ...f, total: dec(f.total).toFixed(2), cantidad: f.cantidad && f.unidad ? dec(f.cantidad).toString() : null, veces: Number(f.veces) }));
}

/** P-66 Gastos e ingresos: los rubros, lo anotado en esas fechas (lo más nuevo primero) y los totales. */
export async function gastosEIngresos(
  db: BaseDatos,
  authUserId: string,
  periodo: { desde: FechaISO; hasta: FechaISO },
): Promise<{ hoy: FechaISO; rubros: RubroDeGasto[]; movimientos: MovimientoExtraListado[]; porRubro: TotalPorRubro[]; totales: { gastos: string; ingresos: string } }> {
  return ejecutarComoUsuario(db, authUserId, "pagos.ver", async (tx, c) => {
    const [rubros, movimientos, porRubro] = await Promise.all([
      rubrosDelNegocio(tx, c),
      tx
        .select({
          id: movimientoExtra.id,
          fecha: movimientoExtra.fecha,
          tipo: movimientoExtra.tipo,
          rubro: rubroGasto.nombre,
          dibujo: rubroGasto.dibujo,
          monto: movimientoExtra.monto,
          cantidad: movimientoExtra.cantidad,
          unidad: rubroGasto.unidad,
          detalle: movimientoExtra.detalle,
          medioPago: movimientoExtra.medioPago,
          estado: movimientoExtra.estado,
          motivoAnulacion: movimientoExtra.motivoAnulacion,
          quien: usuario.nombre,
        })
        .from(movimientoExtra)
        .innerJoin(rubroGasto, eq(rubroGasto.id, movimientoExtra.rubroId))
        .leftJoin(usuario, eq(usuario.id, movimientoExtra.creadoPor))
        .where(and(gte(movimientoExtra.fecha, periodo.desde), lte(movimientoExtra.fecha, periodo.hasta)))
        .orderBy(desc(movimientoExtra.fecha), desc(movimientoExtra.creadoEn))
        .limit(300),
      totalesPorRubro(tx, periodo),
    ]);
    return {
      hoy: hoyEnEmpresa(new Date(), c.zonaHoraria),
      rubros,
      movimientos: movimientos.map((m) => ({
        id: m.id,
        fecha: m.fecha,
        tipo: m.tipo,
        rubro: m.rubro,
        dibujo: m.dibujo,
        monto: m.monto,
        cantidad: m.cantidad && m.unidad ? dec(m.cantidad).toString() : null,
        unidad: m.unidad,
        detalle: m.detalle,
        medioPago: m.medioPago,
        anulado: m.estado === "ANULADO",
        motivoAnulacion: m.motivoAnulacion,
        quien: m.quien,
      })),
      porRubro,
      totales: {
        gastos: sumar(porRubro.filter((r) => r.tipo === "GASTO").map((r) => r.total)).toFixed(2),
        ingresos: sumar(porRubro.filter((r) => r.tipo === "INGRESO").map((r) => r.total)).toFixed(2),
      },
    };
  });
}

const esquemaMovimiento = z.object({
  rubroId: z.uuid("Elegí el rubro (por ejemplo ⛽ Nafta)."),
  monto: numeroObligatorio("Escribí cuánto fue (ej. 35.000)."),
  /** Solo si el rubro se cuenta en algo (litros, km…). */
  cantidad: numeroOpcional("La cantidad tiene que ser un número (ej. 40)."),
  fecha: z.string().regex(PATRON_FECHA, "Elegí el día.").nullish(),
  detalle: textoOpcional(300),
  medioPago: z.enum(medioPago.enumValues, "Elegí cómo se pagó.").default("EFECTIVO"),
});

/** Anota un gasto o un ingreso en su rubro. */
export async function registrarMovimientoExtra(db: BaseDatos, authUserId: string, datos: z.input<typeof esquemaMovimiento>): Promise<{ id: string; rubro: string; tipo: TipoDeMovimiento; monto: string }> {
  const d = validar(esquemaMovimiento, datos);
  if (dec(d.monto).lte(0)) throw new ErrorDeNegocio("VALIDACION", "El importe tiene que ser mayor que $0.");
  if (d.cantidad !== null && dec(d.cantidad).lte(0)) throw new ErrorDeNegocio("VALIDACION", "La cantidad tiene que ser mayor que 0 (o dejala vacía).");
  return ejecutarComoUsuario(db, authUserId, "pagos.registrar", async (tx, c) => {
    const [r] = await tx.select().from(rubroGasto).where(eq(rubroGasto.id, d.rubroId));
    if (!r) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró ese rubro: recargá la página.");
    if (!r.activo) throw new ErrorDeNegocio("VALIDACION", `El rubro ${r.nombre} está dado de baja: elegí otro o volvé a activarlo.`);
    const hoy = hoyEnEmpresa(new Date(), c.zonaHoraria);
    const fecha = d.fecha ?? hoy;
    if (fecha > hoy) throw new ErrorDeNegocio("VALIDACION", "El día no puede ser posterior a hoy.");
    const [nuevo] = await tx
      .insert(movimientoExtra)
      .values({ empresaId: c.empresaId, rubroId: r.id, tipo: r.tipo, fecha, monto: aNumeric(d.monto, 2), cantidad: r.unidad && d.cantidad !== null ? aNumeric(d.cantidad, 3) : null, detalle: d.detalle, medioPago: d.medioPago, creadoPor: c.usuarioId, actualizadoPor: c.usuarioId })
      .returning({ id: movimientoExtra.id });
    const que = r.tipo === "GASTO" ? "un gasto" : "un ingreso";
    await Promise.all([
      auditar(tx, { empresaId: c.empresaId, usuarioId: c.usuarioId, accion: "CREAR", entidad: "movimiento_extra", entidadId: nuevo!.id, resumen: `${r.tipo === "GASTO" ? "Gasto" : "Ingreso"} de ${r.nombre}: ${formatearMoneda(d.monto)} el ${fecha}.` }),
      registrarActividad(tx, c, { accion: "GASTO", entidadTipo: "PAGO", resumen: `anotó ${que} de ${r.nombre.toLowerCase()}` }),
    ]);
    return { id: nuevo!.id, rubro: r.nombre, tipo: r.tipo, monto: aNumeric(d.monto, 2) };
  });
}

/** Anula un gasto o un ingreso con motivo (deja de contar en el balance). */
export async function anularMovimientoExtra(db: BaseDatos, authUserId: string, datos: { movimientoId: string; motivo: string }): Promise<void> {
  const motivo = datos.motivo?.trim() ?? "";
  if (motivo.length < 3) throw new ErrorDeNegocio("VALIDACION", "Escribí por qué se anula (por ejemplo: se anotó dos veces).");
  await ejecutarComoUsuario(db, authUserId, "pagos.anular", async (tx, c) => {
    const [m] = await tx
      .select({ id: movimientoExtra.id, estado: movimientoExtra.estado, monto: movimientoExtra.monto, rubro: rubroGasto.nombre })
      .from(movimientoExtra)
      .innerJoin(rubroGasto, eq(rubroGasto.id, movimientoExtra.rubroId))
      .where(eq(movimientoExtra.id, datos.movimientoId))
      .for("update", { of: movimientoExtra });
    if (!m) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró esa anotación.");
    if (m.estado === "ANULADO") throw new ErrorDeNegocio("VALIDACION", "Esa anotación ya estaba anulada.");
    await Promise.all([
      tx.update(movimientoExtra).set({ estado: "ANULADO", anuladoEn: new Date(), anuladoPor: c.usuarioId, motivoAnulacion: motivo, actualizadoPor: c.usuarioId }).where(eq(movimientoExtra.id, m.id)),
      auditar(tx, { empresaId: c.empresaId, usuarioId: c.usuarioId, accion: "ANULAR", entidad: "movimiento_extra", entidadId: m.id, resumen: `${m.rubro} por ${formatearMoneda(m.monto)} anulado.`, motivo }),
    ]);
  });
}

const esquemaRubro = z.object({
  rubroId: z.uuid().nullish(),
  nombre: textoObligatorio("Escribí el nombre del rubro (ej. Nafta).", 60),
  dibujo: z
    .string()
    .trim()
    .max(16)
    .nullish()
    .transform((v) => v || "🧾"),
  tipo: z.enum(tipoMovimientoExtra.enumValues, "Elegí si es un gasto o un ingreso.").default("GASTO"),
  unidad: textoOpcional(20),
});

/** Crea un rubro o cambia su título, su dibujo y en qué se cuenta. Lo ya anotado en el rubro se conserva. */
export async function guardarRubro(db: BaseDatos, authUserId: string, datos: z.input<typeof esquemaRubro>): Promise<string> {
  const d = validar(esquemaRubro, datos);
  return ejecutarComoUsuario(db, authUserId, "pagos.registrar", async (tx, c) => {
    const [repetido] = await tx
      .select({ id: rubroGasto.id, activo: rubroGasto.activo })
      .from(rubroGasto)
      .where(and(sql`lower(${rubroGasto.nombre}) = lower(${d.nombre})`, eq(rubroGasto.tipo, d.tipo)));
    if (repetido && repetido.id !== d.rubroId) {
      throw new ErrorDeNegocio("VALIDACION", repetido.activo ? `Ya hay un rubro que se llama ${d.nombre}: usá ese o elegí otro nombre.` : `Ya había un rubro ${d.nombre} dado de baja: volvé a activarlo desde “Rubros”.`);
    }
    if (d.rubroId) {
      const [r] = await tx.update(rubroGasto).set({ nombre: d.nombre, dibujo: d.dibujo, unidad: d.unidad, actualizadoPor: c.usuarioId }).where(eq(rubroGasto.id, d.rubroId)).returning({ id: rubroGasto.id });
      if (!r) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró ese rubro.");
      return r.id;
    }
    // La primera vez, antes de sumar uno propio, quedan creados los predefinidos.
    const existentes = await rubrosDelNegocio(tx, c);
    const [nuevo] = await tx
      .insert(rubroGasto)
      .values({ empresaId: c.empresaId, nombre: d.nombre, dibujo: d.dibujo, tipo: d.tipo, unidad: d.unidad, orden: existentes.length + 1, creadoPor: c.usuarioId, actualizadoPor: c.usuarioId })
      .returning({ id: rubroGasto.id });
    return nuevo!.id;
  });
}

/** Da de baja un rubro que ya no se usa (lo anotado queda) o lo vuelve a activar. */
export async function cambiarEstadoDeRubro(db: BaseDatos, authUserId: string, datos: { rubroId: string; activo: boolean }): Promise<void> {
  await ejecutarComoUsuario(db, authUserId, "pagos.registrar", async (tx, c) => {
    const [r] = await tx.update(rubroGasto).set({ activo: datos.activo, actualizadoPor: c.usuarioId }).where(eq(rubroGasto.id, datos.rubroId)).returning({ id: rubroGasto.id });
    if (!r) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró ese rubro.");
  });
}
