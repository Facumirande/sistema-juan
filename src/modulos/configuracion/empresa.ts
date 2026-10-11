import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { auditar } from "@/db/auditoria";
import { empresa, usuario } from "@/db/esquema";
import type { BaseDatos } from "@/db/tipos";
import { dec } from "@/dominio/dinero/decimal";
import { ErrorDeNegocio } from "@/dominio/errores";
import { ETAPAS_CON_RESPONSABLE, leerResponsables, type EtapaConResponsable, type Responsables } from "@/dominio/pedidos/responsables";
import { recalcularPedidosPendientes } from "@/modulos/pedidos/pedidos";
import { registrarActividad } from "@/modulos/colaboracion/registro";
import { ejecutarComoUsuario } from "@/modulos/seguridad/contexto";
import { numeroObligatorio, textoObligatorio, textoOpcional, validar } from "@/modulos/validacion";
import { olvidarSesiones } from "@/modulos/seguridad/memoria-sesion";

// P-95 Configuración del negocio (iteración 8): los datos que salen en los documentos y los
// parámetros que el dueño puede ajustar (03 §4.1). La ganancia general se cambia en Precios de
// venta y el lugar de salida de los repartos, en el viaje de entrega.

/** Cómo se redondea el precio de venta: el modo y el múltiplo, en opciones con nombre. */
export const REDONDEOS = {
  CERCANO_1: { modo: "CERCANO", multiplo: "1", texto: "Al peso más cercano" },
  CERCANO_10: { modo: "CERCANO", multiplo: "10", texto: "A los $10 más cercanos" },
  ARRIBA_10: { modo: "ARRIBA", multiplo: "10", texto: "Para arriba, a los $10" },
  ARRIBA_50: { modo: "ARRIBA", multiplo: "50", texto: "Para arriba, a los $50" },
  CERCANO_100: { modo: "CERCANO", multiplo: "100", texto: "A los $100 más cercanos" },
} as const;
export type ClaveRedondeo = keyof typeof REDONDEOS;

export interface ConfiguracionEmpresa {
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  email: string | null;
  identificacionFiscal: string | null;
  /** Para el remito (10/10/2026): el nombre legal y la condición frente al IVA. */
  razonSocial: string | null;
  condicionFiscal: string | null;
  /** Nulo si el redondeo guardado no es ninguna de las opciones (se muestra como "otro"). */
  redondeo: ClaveRedondeo | null;
  margenMinimoPct: string;
  variacionBruscaPct: string;
  diasAlertaPrecioDesactualizado: number;
  semaforoAmarilloPct: string;
  semaforoRojoPct: string;
  diasAvisoVencimiento: number;
  horaCortePedidos: string | null;
  toleranciaPesoPct: string;
}

const numero = (v: string) => String(Number(v));

export async function configuracionDeEmpresa(db: BaseDatos, authUserId: string): Promise<ConfiguracionEmpresa> {
  return ejecutarComoUsuario(db, authUserId, "configuracion.ver", async (tx) => {
    const [e] = await tx.select().from(empresa);
    if (!e) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró la configuración del negocio.");
    const redondeo = (Object.keys(REDONDEOS) as ClaveRedondeo[]).find((k) => REDONDEOS[k].modo === e.redondeoModo && dec(REDONDEOS[k].multiplo).eq(e.redondeoMultiplo)) ?? null;
    return {
      nombre: e.nombre,
      direccion: e.direccion,
      telefono: e.telefono,
      email: e.email,
      identificacionFiscal: e.identificacionFiscal,
      razonSocial: e.razonSocial,
      condicionFiscal: e.condicionFiscal,
      redondeo,
      margenMinimoPct: numero(e.margenMinimoPct),
      variacionBruscaPct: numero(e.variacionBruscaPct),
      diasAlertaPrecioDesactualizado: e.diasAlertaPrecioDesactualizado,
      semaforoAmarilloPct: numero(e.semaforoAmarilloPct),
      semaforoRojoPct: numero(e.semaforoRojoPct),
      diasAvisoVencimiento: e.diasAvisoVencimiento,
      horaCortePedidos: e.horaCortePedidos?.slice(0, 5) ?? null,
      toleranciaPesoPct: numero(e.toleranciaPesoPct),
    };
  });
}

const porcentaje = (mensaje: string) => numeroObligatorio(mensaje).refine((v) => dec(v).gte(0) && dec(v).lte(100), { message: mensaje });
const dias = (mensaje: string) => z.coerce.number(mensaje).int(mensaje).min(0, mensaje).max(365, mensaje);
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

const esquemaConfiguracion = z
  .object({
    nombre: textoObligatorio("Escribí el nombre del negocio (sale en los remitos).", 120),
    direccion: textoOpcional(200),
    telefono: textoOpcional(40),
    email: textoOpcional(120).refine((v) => v === null || z.email().safeParse(v).success, { message: "El correo no es válido." }),
    identificacionFiscal: textoOpcional(20),
    razonSocial: textoOpcional(160),
    condicionFiscal: textoOpcional(60),
    redondeo: z.enum(Object.keys(REDONDEOS) as [ClaveRedondeo, ...ClaveRedondeo[]], "Elegí cómo se redondean los precios."),
    margenMinimoPct: porcentaje("La ganancia mínima es un porcentaje entre 0 y 100 (ej. 15)."),
    variacionBruscaPct: porcentaje("El cambio de precio para pedir confirmación es un porcentaje entre 0 y 100 (ej. 30)."),
    diasAlertaPrecioDesactualizado: dias("Los días para marcar un precio como viejo van de 0 a 365."),
    semaforoAmarilloPct: porcentaje("El amarillo del semáforo es un porcentaje entre 0 y 100 (ej. 70)."),
    semaforoRojoPct: porcentaje("El rojo del semáforo es un porcentaje entre 0 y 100 (ej. 90)."),
    diasAvisoVencimiento: dias("Los días de aviso antes de un vencimiento van de 0 a 365."),
    horaCortePedidos: textoOpcional(5).refine((v) => v === null || HORA.test(v), { message: "La hora de corte va en formato 24 h, ej. 20:00." }),
    toleranciaPesoPct: porcentaje("La tolerancia de peso es un porcentaje entre 0 y 100 (ej. 3)."),
  })
  .refine((d) => dec(d.semaforoAmarilloPct).gt(0) && dec(d.semaforoAmarilloPct).lt(d.semaforoRojoPct), {
    message: "El amarillo del semáforo tiene que ser menor que el rojo (ej. amarillo 70 % y rojo 90 %).",
  });

/** Guarda la configuración (auditado). Si cambian el redondeo o la ganancia mínima, recalcula los pedidos pendientes. */
export async function guardarConfiguracion(db: BaseDatos, authUserId: string, datos: z.input<typeof esquemaConfiguracion>): Promise<{ pedidosRecalculados: number }> {
  // Cambia lo que la sesión muestra (o quién puede entrar): que no quede recordado lo viejo.
  olvidarSesiones();
  const d = validar(esquemaConfiguracion, datos);
  return ejecutarComoUsuario(db, authUserId, "configuracion.editar", async (tx, c) => {
    const [antes] = await tx.select().from(empresa);
    if (!antes) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró la configuración del negocio.");
    const r = REDONDEOS[d.redondeo];
    const nuevos = {
      nombre: d.nombre,
      direccion: d.direccion,
      telefono: d.telefono,
      email: d.email,
      identificacionFiscal: d.identificacionFiscal,
      razonSocial: d.razonSocial,
      condicionFiscal: d.condicionFiscal,
      redondeoModo: r.modo,
      redondeoMultiplo: r.multiplo,
      margenMinimoPct: d.margenMinimoPct,
      variacionBruscaPct: d.variacionBruscaPct,
      diasAlertaPrecioDesactualizado: d.diasAlertaPrecioDesactualizado,
      semaforoAmarilloPct: d.semaforoAmarilloPct,
      semaforoRojoPct: d.semaforoRojoPct,
      diasAvisoVencimiento: d.diasAvisoVencimiento,
      horaCortePedidos: d.horaCortePedidos,
      toleranciaPesoPct: d.toleranciaPesoPct,
    };
    await tx.update(empresa).set({ ...nuevos, actualizadoPor: c.usuarioId }).where(eq(empresa.id, c.empresaId));
    await auditar(tx, {
      empresaId: c.empresaId,
      usuarioId: c.usuarioId,
      accion: "CAMBIO_CONFIGURACION",
      entidad: "empresa",
      entidadId: c.empresaId,
      resumen: "Se cambió la configuración del negocio.",
      datosAntes: Object.fromEntries(Object.keys(nuevos).map((k) => [k, antes[k as keyof typeof antes]])),
      datosDespues: nuevos,
    });
    await registrarActividad(tx, c, { accion: "MODIFICAR", entidadTipo: "USUARIO", resumen: "cambió la configuración del negocio" });
    const cambianPrecios =
      antes.redondeoModo !== r.modo || !dec(antes.redondeoMultiplo).eq(r.multiplo) || !dec(antes.margenMinimoPct).eq(d.margenMinimoPct);
    return { pedidosRecalculados: cambianPrecios ? await recalcularPedidosPendientes(tx) : 0 };
  });
}

// ——— Quién se encarga de cada paso (10/10/2026) ———

export interface ResponsablesDelNegocio {
  responsables: Responsables;
  personas: { id: string; nombre: string }[];
}

/** Quién está a cargo de cada parte del proceso y las personas que se pueden elegir. */
export async function responsablesDelNegocio(db: BaseDatos, authUserId: string): Promise<ResponsablesDelNegocio> {
  return ejecutarComoUsuario(db, authUserId, "configuracion.ver", async (tx, c) => {
    const personas = await tx.select({ id: usuario.id, nombre: usuario.nombre }).from(usuario).where(eq(usuario.activo, true)).orderBy(asc(usuario.nombre));
    return { responsables: c.responsables, personas };
  });
}

/**
 * Fija quién se encarga de cada parte del proceso (RN-190). Una etapa sin nadie queda libre. Solo
 * se puede elegir a personas que tienen acceso.
 */
export async function guardarResponsables(db: BaseDatos, authUserId: string, datos: Partial<Record<EtapaConResponsable, string | null>>): Promise<void> {
  await ejecutarComoUsuario(db, authUserId, "configuracion.editar", async (tx, c) => {
    // Solo cambian las etapas que vienen: una que no está a la vista (Retiro, mientras está guardada) queda como estaba.
    const elegidos = Object.fromEntries(
      ETAPAS_CON_RESPONSABLE.filter((e) => e.clave in datos)
        .map((e) => [e.clave, datos[e.clave] || null])
        .filter(([, id]) => id),
    ) as Record<string, string>;
    const sinTocar = Object.fromEntries(ETAPAS_CON_RESPONSABLE.filter((e) => !(e.clave in datos) && c.responsables[e.clave]).map((e) => [e.clave, c.responsables[e.clave]!]));
    const ids = [...new Set(Object.values(elegidos))];
    if (ids.length) {
      const activos = await tx.select({ id: usuario.id }).from(usuario).where(and(inArray(usuario.id, ids), eq(usuario.activo, true)));
      if (activos.length !== ids.length) throw new ErrorDeNegocio("VALIDACION", "Una de las personas elegidas ya no tiene acceso: elegí a otra.");
    }
    const limpio = leerResponsables({ ...sinTocar, ...elegidos });
    await tx.update(empresa).set({ responsablesEtapa: limpio, actualizadoPor: c.usuarioId }).where(eq(empresa.id, c.empresaId));
    await registrarActividad(tx, c, { accion: "MODIFICAR", entidadTipo: "USUARIO", resumen: "cambió quién se encarga de cada paso del proceso" });
  });
}
