import { and, asc, count, eq, ilike, ne, or, sql } from "drizzle-orm";
import { z } from "zod";

import { auditar, diferencias } from "@/db/auditoria";
import { cliente, jornada, pedido, periodicidadFacturacion, puntoEntrega, tipoCliente } from "@/db/esquema";
import type { BaseDatos, Transaccion } from "@/db/tipos";
import { coordenadaValida } from "@/dominio/entregas/ubicacion";
import { ErrorDeNegocio } from "@/dominio/errores";
import { registrarActividad } from "@/modulos/colaboracion/registro";
import { ejecutarComoUsuario } from "@/modulos/seguridad/contexto";
import { textoObligatorio, textoOpcional, validar } from "@/modulos/validacion";

// P-15 Clientes y P-16 Ficha de cliente (08 §5.3), reglas RN-010 a RN-016. El recargo del
// cliente se edita con los precios de venta (iteración 3).

export type TipoCliente = (typeof tipoCliente.enumValues)[number];
export type PeriodicidadFacturacion = (typeof periodicidadFacturacion.enumValues)[number];

export interface ClienteListado {
  id: string;
  nombre: string;
  tipoCliente: TipoCliente;
  telefono: string | null;
  prioridadFaltantes: number;
  periodicidadFacturacion: PeriodicidadFacturacion;
  puntosEntrega: number;
  activo: boolean;
  /** Lugar principal de entrega: dirección, horario y si tiene la ubicación marcada. */
  direccion: string | null;
  horario: string | null;
  ubicado: boolean;
  /** Próximo día con un pedido (confirmado o no) y el último día que se le entregó. */
  proximoPedido: string | null;
  ultimaEntrega: string | null;
}

export interface PuntoDeEntrega {
  id: string;
  nombre: string;
  direccion: string;
  localidad: string | null;
  referencias: string | null;
  contactoNombre: string | null;
  contactoTelefono: string | null;
  horarioDesde: string | null;
  horarioHasta: string | null;
  diasEntrega: number[];
  instruccionesEntrega: string | null;
  esPrincipal: boolean;
  activo: boolean;
  /** Dónde queda en el mapa (para calcular el recorrido e ir con el GPS). */
  coordenada: { lat: number; lng: number } | null;
}

export type FichaCliente = Omit<typeof cliente.$inferSelect, "empresaId" | "creadoPor" | "actualizadoPor" | "creadoEn" | "actualizadoEn"> & {
  puntosEntrega: PuntoDeEntrega[];
};

const CAMPOS_INTERNOS = new Set(["empresaId", "creadoPor", "actualizadoPor", "creadoEn", "actualizadoEn"]);

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const horaOpcional = textoOpcional(5).refine((v) => v === null || HORA.test(v), { message: "El horario va en formato 24 h, ej. 06:30." });

/** CUIT/RUT sin guiones ni espacios, para que "20-12345678-3" y "20123456783" sean el mismo (RN-011). */
function normalizarIdentificacion(v: string | null): string | null {
  const limpio = v?.replace(/[\s.-]/g, "") ?? "";
  return limpio === "" ? null : limpio;
}

const esquemaCliente = z.object({
  id: z.uuid().optional(),
  codigo: textoOpcional(20).transform((v) => v?.toUpperCase() ?? null),
  nombre: textoObligatorio("Escribí el nombre del cliente.", 120),
  tipoCliente: z.enum(tipoCliente.enumValues, "Elegí el tipo de cliente."),
  razonSocial: textoOpcional(160),
  identificacionFiscal: textoOpcional(20).transform(normalizarIdentificacion),
  condicionFiscal: textoOpcional(60),
  direccionFiscal: textoOpcional(200),
  telefono: textoOpcional(40),
  email: textoOpcional(120).refine((v) => v === null || z.email().safeParse(v).success, { message: "El correo no es válido." }),
  emailContable: textoOpcional(120).refine((v) => v === null || z.email().safeParse(v).success, { message: "El correo contable no es válido." }),
  contactoNombre: textoOpcional(120),
  prioridadFaltantes: z.coerce.number().int().min(1).max(5, "La prioridad va de 1 (máxima) a 5 (mínima)."),
  periodicidadFacturacion: z.enum(periodicidadFacturacion.enumValues, "Elegí la periodicidad de facturación."),
  requiereOrdenCompra: z.boolean(),
  aceptaSustituciones: z.boolean(),
  requiereFirma: z.boolean(),
  observaciones: textoOpcional(1000),
});

const esquemaPunto = z
  .object({
    id: z.uuid().optional(),
    nombre: textoObligatorio("Escribí un nombre para el punto de entrega (ej. Cocina central, Local).", 80),
    direccion: textoObligatorio("Escribí la dirección.", 200),
    localidad: textoOpcional(80),
    referencias: textoOpcional(300),
    contactoNombre: textoOpcional(120),
    contactoTelefono: textoOpcional(40),
    horarioDesde: horaOpcional,
    horarioHasta: horaOpcional,
    diasEntrega: z.array(z.coerce.number().int().min(1).max(7)).default([]),
    instruccionesEntrega: textoOpcional(500),
    /** Dónde queda, si se eligió al escribir la dirección (10/10/2026). */
    coordenada: z
      .object({ lat: z.number(), lng: z.number() })
      .refine((c) => coordenadaValida(c.lat, c.lng), { message: "Esa ubicación no es válida: elegí la dirección de nuevo." })
      .nullish(),
  })
  .refine((d) => !d.horarioDesde || !d.horarioHasta || d.horarioDesde < d.horarioHasta, {
    message: "El horario de recepción termina antes de empezar.",
  });

export type DatosPuntoEntrega = z.input<typeof esquemaPunto>;

export async function listarClientes(
  db: BaseDatos,
  authUserId: string,
  filtros: { texto?: string; estado?: "activos" | "inactivos" | "todos" } = {},
): Promise<ClienteListado[]> {
  return ejecutarComoUsuario(db, authUserId, "clientes.ver", async (tx) => {
    const texto = filtros.texto?.trim();
    const estado = filtros.estado ?? "activos";
    const filas = await tx
      .select({
        id: cliente.id,
        nombre: cliente.nombre,
        tipoCliente: cliente.tipoCliente,
        telefono: cliente.telefono,
        prioridadFaltantes: cliente.prioridadFaltantes,
        periodicidadFacturacion: cliente.periodicidadFacturacion,
        activo: cliente.activo,
        puntosEntrega: count(puntoEntrega.id),
        direccion: sql<string | null>`(select concat_ws(', ', pe.direccion, pe.localidad) from ${puntoEntrega} pe where pe.cliente_id = cliente.id and pe.activo order by pe.es_principal desc, pe.creado_en limit 1)`,
        horario: sql<string | null>`(select case when pe.horario_desde is null and pe.horario_hasta is null then null else concat(coalesce(to_char(pe.horario_desde, 'HH24:MI'), '?'), '–', coalesce(to_char(pe.horario_hasta, 'HH24:MI'), '?')) end from ${puntoEntrega} pe where pe.cliente_id = cliente.id and pe.activo order by pe.es_principal desc, pe.creado_en limit 1)`,
        ubicado: sql<boolean>`exists (select 1 from ${puntoEntrega} pe where pe.cliente_id = cliente.id and pe.activo and pe.latitud is not null)`,
        proximoPedido: sql<string | null>`(select min(j.fecha)::text from ${pedido} p join ${jornada} j on j.id = p.jornada_id where p.cliente_id = cliente.id and p.estado not in ('CANCELADO', 'ENTREGADO') and j.fecha >= current_date)`,
        ultimaEntrega: sql<string | null>`(select max(j.fecha)::text from ${pedido} p join ${jornada} j on j.id = p.jornada_id where p.cliente_id = cliente.id and p.estado = 'ENTREGADO')`,
      })
      .from(cliente)
      .leftJoin(puntoEntrega, and(eq(puntoEntrega.clienteId, cliente.id), eq(puntoEntrega.activo, true)))
      .where(
        and(
          estado === "todos" ? undefined : eq(cliente.activo, estado === "activos"),
          texto ? or(ilike(cliente.nombre, `%${texto}%`), ilike(cliente.identificacionFiscal, `%${texto.replace(/[\s.-]/g, "")}%`)) : undefined,
        ),
      )
      .groupBy(cliente.id)
      .orderBy(sql`${cliente.activo} desc`, asc(cliente.nombre));
    return filas.map((f) => ({ ...f, puntosEntrega: Number(f.puntosEntrega), ubicado: Boolean(f.ubicado) }));
  });
}

export async function obtenerCliente(db: BaseDatos, authUserId: string, id: string): Promise<FichaCliente> {
  return ejecutarComoUsuario(db, authUserId, "clientes.ver", async (tx) => {
    const [c] = await tx.select().from(cliente).where(eq(cliente.id, id));
    if (!c) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el cliente.");
    const puntos = await tx
      .select()
      .from(puntoEntrega)
      .where(eq(puntoEntrega.clienteId, id))
      .orderBy(sql`${puntoEntrega.activo} desc`, sql`${puntoEntrega.esPrincipal} desc`, asc(puntoEntrega.nombre));
    const datos = Object.fromEntries(Object.entries(c).filter(([clave]) => !CAMPOS_INTERNOS.has(clave))) as Omit<FichaCliente, "puntosEntrega">;
    return {
      ...datos,
      puntosEntrega: puntos.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        direccion: p.direccion,
        localidad: p.localidad,
        referencias: p.referencias,
        contactoNombre: p.contactoNombre,
        contactoTelefono: p.contactoTelefono,
        horarioDesde: p.horarioDesde?.slice(0, 5) ?? null,
        horarioHasta: p.horarioHasta?.slice(0, 5) ?? null,
        diasEntrega: p.diasEntrega ?? [],
        instruccionesEntrega: p.instruccionesEntrega,
        esPrincipal: p.esPrincipal,
        activo: p.activo,
        coordenada: p.latitud !== null && p.longitud !== null ? { lat: Number(p.latitud), lng: Number(p.longitud) } : null,
      })),
    };
  });
}

async function exigirClienteLibre(tx: Transaccion, d: { nombre: string; codigo: string | null; identificacionFiscal: string | null }, excluirId?: string) {
  const [repetido] = await tx
    .select({ nombre: cliente.nombre, identificacionFiscal: cliente.identificacionFiscal })
    .from(cliente)
    .where(
      and(
        or(
          eq(sql`lower(${cliente.nombre})`, d.nombre.toLowerCase()),
          d.codigo ? eq(sql`upper(${cliente.codigo})`, d.codigo) : undefined,
          d.identificacionFiscal ? eq(cliente.identificacionFiscal, d.identificacionFiscal) : undefined,
        ),
        excluirId ? ne(cliente.id, excluirId) : undefined,
      ),
    );
  if (!repetido) return;
  if (d.identificacionFiscal && repetido.identificacionFiscal === d.identificacionFiscal) {
    throw new ErrorDeNegocio("VALIDACION", `El CUIT ${d.identificacionFiscal} ya es del cliente "${repetido.nombre}" (RN-011).`);
  }
  throw new ErrorDeNegocio("VALIDACION", `Ya existe el cliente "${repetido.nombre}" (mismo nombre o código).`);
}

function valoresPunto(d: z.output<typeof esquemaPunto>) {
  return {
    nombre: d.nombre,
    direccion: d.direccion,
    localidad: d.localidad,
    referencias: d.referencias,
    contactoNombre: d.contactoNombre,
    contactoTelefono: d.contactoTelefono,
    horarioDesde: d.horarioDesde,
    horarioHasta: d.horarioHasta,
    diasEntrega: d.diasEntrega.length > 0 ? [...new Set(d.diasEntrega)].sort() : null,
    instruccionesEntrega: d.instruccionesEntrega,
    ...(d.coordenada ? { latitud: d.coordenada.lat.toFixed(6), longitud: d.coordenada.lng.toFixed(6) } : {}),
  };
}

/**
 * Crea o modifica un cliente. Al crearlo se puede cargar su primer punto de entrega, que queda
 * como principal (sin punto de entrega no se le pueden confirmar pedidos, RN-010).
 */
export async function guardarCliente(
  db: BaseDatos,
  authUserId: string,
  datos: z.input<typeof esquemaCliente> & { primerPunto?: DatosPuntoEntrega | null },
): Promise<string> {
  const { id, ...d } = validar(esquemaCliente, datos);
  const primerPunto = datos.primerPunto ? validar(esquemaPunto, datos.primerPunto) : null;
  return ejecutarComoUsuario(db, authUserId, "clientes.editar", async (tx, c) => {
    await exigirClienteLibre(tx, d, id);

    if (!id) {
      const [nuevo] = await tx
        .insert(cliente)
        .values({ ...d, empresaId: c.empresaId, creadoPor: c.usuarioId, actualizadoPor: c.usuarioId })
        .returning({ id: cliente.id });
      if (primerPunto) {
        await tx.insert(puntoEntrega).values({
          ...valoresPunto(primerPunto),
          empresaId: c.empresaId,
          clienteId: nuevo!.id,
          esPrincipal: true,
          creadoPor: c.usuarioId,
          actualizadoPor: c.usuarioId,
        });
      }
      await auditar(tx, {
        empresaId: c.empresaId,
        usuarioId: c.usuarioId,
        accion: "CREAR",
        entidad: "cliente",
        entidadId: nuevo!.id,
        resumen: `Alta del cliente ${d.nombre}.`,
        datosDespues: d,
      });
      await registrarActividad(tx, c, { accion: "CREAR", entidadTipo: "CLIENTE", entidadId: nuevo!.id, resumen: `agregó el cliente ${d.nombre}` });
      return nuevo!.id;
    }

    const [actual] = await tx.select().from(cliente).where(eq(cliente.id, id));
    if (!actual) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el cliente.");
    const cambios = diferencias(actual, d);
    if (!cambios.hayCambios) return id;
    await tx.update(cliente).set({ ...d, actualizadoPor: c.usuarioId }).where(eq(cliente.id, id));
    // RN-015: prioridad y datos fiscales quedan auditados junto con el resto de los cambios.
    await auditar(tx, {
      empresaId: c.empresaId,
      usuarioId: c.usuarioId,
      accion: "MODIFICAR",
      entidad: "cliente",
      entidadId: id,
      resumen: `Cambios en el cliente ${d.nombre}.`,
      datosAntes: cambios.datosAntes,
      datosDespues: cambios.datosDespues,
    });
    await registrarActividad(tx, c, { accion: "MODIFICAR", entidadTipo: "CLIENTE", entidadId: id, resumen: `cambió los datos del cliente ${d.nombre}` });
    return id;
  });
}

/** RN-012: un cliente desactivado no admite pedidos nuevos (los pedidos llegan en la iteración 3). */
export async function cambiarEstadoCliente(db: BaseDatos, authUserId: string, datos: { id: string; activo: boolean }): Promise<void> {
  await ejecutarComoUsuario(db, authUserId, "clientes.editar", async (tx, c) => {
    const [actual] = await tx.select({ nombre: cliente.nombre, activo: cliente.activo }).from(cliente).where(eq(cliente.id, datos.id));
    if (!actual) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el cliente.");
    if (actual.activo === datos.activo) return;
    await tx.update(cliente).set({ activo: datos.activo, actualizadoPor: c.usuarioId }).where(eq(cliente.id, datos.id));
    await auditar(tx, {
      empresaId: c.empresaId,
      usuarioId: c.usuarioId,
      accion: "CAMBIO_ESTADO",
      entidad: "cliente",
      entidadId: datos.id,
      resumen: `${datos.activo ? "Reactivación" : "Desactivación"} del cliente ${actual.nombre}.`,
      datosAntes: { activo: actual.activo },
      datosDespues: { activo: datos.activo },
    });
    await registrarActividad(tx, c, { accion: "MODIFICAR", entidadTipo: "CLIENTE", entidadId: datos.id, resumen: `${datos.activo ? "reactivó" : "dio de baja"} al cliente ${actual.nombre}` });
  });
}

async function exigirNombrePuntoLibre(tx: Transaccion, clienteId: string, nombre: string, excluirId?: string) {
  const [repetido] = await tx
    .select({ id: puntoEntrega.id })
    .from(puntoEntrega)
    .where(
      and(
        eq(puntoEntrega.clienteId, clienteId),
        eq(sql`lower(${puntoEntrega.nombre})`, nombre.toLowerCase()),
        excluirId ? ne(puntoEntrega.id, excluirId) : undefined,
      ),
    );
  if (repetido) throw new ErrorDeNegocio("VALIDACION", `El cliente ya tiene un punto de entrega "${nombre}".`);
}

/** Crea o modifica un punto de entrega. El primer punto activo del cliente queda como principal. */
export async function guardarPuntoEntrega(db: BaseDatos, authUserId: string, datos: { clienteId: string } & DatosPuntoEntrega): Promise<string> {
  const d = validar(esquemaPunto, datos);
  return ejecutarComoUsuario(db, authUserId, "clientes.editar", async (tx, c) => {
    const [cli] = await tx.select({ nombre: cliente.nombre }).from(cliente).where(eq(cliente.id, datos.clienteId));
    if (!cli) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el cliente.");
    await exigirNombrePuntoLibre(tx, datos.clienteId, d.nombre, d.id);
    const valores = valoresPunto(d);

    if (!d.id) {
      const [principal] = await tx
        .select({ id: puntoEntrega.id })
        .from(puntoEntrega)
        .where(and(eq(puntoEntrega.clienteId, datos.clienteId), eq(puntoEntrega.esPrincipal, true), eq(puntoEntrega.activo, true)));
      const [nuevo] = await tx
        .insert(puntoEntrega)
        .values({
          ...valores,
          empresaId: c.empresaId,
          clienteId: datos.clienteId,
          esPrincipal: !principal,
          creadoPor: c.usuarioId,
          actualizadoPor: c.usuarioId,
        })
        .returning({ id: puntoEntrega.id });
      await auditar(tx, {
        empresaId: c.empresaId,
        usuarioId: c.usuarioId,
        accion: "CREAR",
        entidad: "punto_entrega",
        entidadId: nuevo!.id,
        resumen: `Nuevo punto de entrega "${d.nombre}" de ${cli.nombre}.`,
        datosDespues: valores,
      });
      await registrarActividad(tx, c, { accion: "MODIFICAR", entidadTipo: "CLIENTE", entidadId: datos.clienteId, resumen: `le agregó un lugar de entrega a ${cli.nombre}` });
      return nuevo!.id;
    }

    const [actual] = await tx
      .select()
      .from(puntoEntrega)
      .where(and(eq(puntoEntrega.id, d.id), eq(puntoEntrega.clienteId, datos.clienteId)));
    if (!actual) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el punto de entrega.");
    const cambios = diferencias({ ...actual, horarioDesde: actual.horarioDesde?.slice(0, 5) ?? null, horarioHasta: actual.horarioHasta?.slice(0, 5) ?? null }, valores);
    if (!cambios.hayCambios) return d.id;
    await tx.update(puntoEntrega).set({ ...valores, actualizadoPor: c.usuarioId }).where(eq(puntoEntrega.id, d.id));
    await auditar(tx, {
      empresaId: c.empresaId,
      usuarioId: c.usuarioId,
      accion: "MODIFICAR",
      entidad: "punto_entrega",
      entidadId: d.id,
      resumen: `Cambios en el punto de entrega "${d.nombre}" de ${cli.nombre}.`,
      datosAntes: cambios.datosAntes,
      datosDespues: cambios.datosDespues,
    });
    await registrarActividad(tx, c, { accion: "MODIFICAR", entidadTipo: "CLIENTE", entidadId: datos.clienteId, resumen: `cambió un lugar de entrega de ${cli.nombre}` });
    return d.id;
  });
}

async function puntoParaCambiar(tx: Transaccion, id: string) {
  const [p] = await tx
    .select({ id: puntoEntrega.id, clienteId: puntoEntrega.clienteId, nombre: puntoEntrega.nombre, activo: puntoEntrega.activo, esPrincipal: puntoEntrega.esPrincipal })
    .from(puntoEntrega)
    .where(eq(puntoEntrega.id, id))
    .for("update");
  if (!p) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el punto de entrega.");
  return p;
}

export async function marcarPuntoPrincipal(db: BaseDatos, authUserId: string, puntoId: string): Promise<void> {
  await ejecutarComoUsuario(db, authUserId, "clientes.editar", async (tx, c) => {
    const p = await puntoParaCambiar(tx, puntoId);
    if (!p.activo) throw new ErrorDeNegocio("VALIDACION", "Un punto de entrega desactivado no puede ser el principal.");
    if (p.esPrincipal) return;
    await tx.update(puntoEntrega).set({ esPrincipal: false, actualizadoPor: c.usuarioId }).where(eq(puntoEntrega.clienteId, p.clienteId));
    await tx.update(puntoEntrega).set({ esPrincipal: true, actualizadoPor: c.usuarioId }).where(eq(puntoEntrega.id, p.id));
  });
}

/**
 * Desactivar o reactivar un punto (RN-016: cuando existan las entregas, no se desactiva uno con
 * entregas sin terminar). Si era el principal, pasa a serlo otro punto activo del cliente.
 */
export async function cambiarEstadoPuntoEntrega(db: BaseDatos, authUserId: string, datos: { id: string; activo: boolean }): Promise<void> {
  await ejecutarComoUsuario(db, authUserId, "clientes.editar", async (tx, c) => {
    const p = await puntoParaCambiar(tx, datos.id);
    if (p.activo === datos.activo) return;
    if (!datos.activo) {
      await tx.update(puntoEntrega).set({ activo: false, esPrincipal: false, actualizadoPor: c.usuarioId }).where(eq(puntoEntrega.id, p.id));
      if (p.esPrincipal) {
        const [otro] = await tx
          .select({ id: puntoEntrega.id })
          .from(puntoEntrega)
          .where(and(eq(puntoEntrega.clienteId, p.clienteId), eq(puntoEntrega.activo, true)))
          .orderBy(asc(puntoEntrega.creadoEn))
          .limit(1);
        if (otro) await tx.update(puntoEntrega).set({ esPrincipal: true, actualizadoPor: c.usuarioId }).where(eq(puntoEntrega.id, otro.id));
      }
    } else {
      const [principal] = await tx
        .select({ id: puntoEntrega.id })
        .from(puntoEntrega)
        .where(and(eq(puntoEntrega.clienteId, p.clienteId), eq(puntoEntrega.esPrincipal, true), eq(puntoEntrega.activo, true)));
      await tx.update(puntoEntrega).set({ activo: true, esPrincipal: !principal, actualizadoPor: c.usuarioId }).where(eq(puntoEntrega.id, p.id));
    }
    await auditar(tx, {
      empresaId: c.empresaId,
      usuarioId: c.usuarioId,
      accion: "CAMBIO_ESTADO",
      entidad: "punto_entrega",
      entidadId: p.id,
      resumen: `${datos.activo ? "Reactivación" : "Desactivación"} del punto de entrega "${p.nombre}".`,
      datosAntes: { activo: p.activo },
      datosDespues: { activo: datos.activo },
    });
  });
}
