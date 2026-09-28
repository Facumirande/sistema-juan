import { and, asc, count, desc, eq, gte, inArray, isNull, ne, sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import { auditar } from "@/db/auditoria";
import { cliente, entrega, jornada, puntoEntrega, reparto, rol, usuario, usuarioRol } from "@/db/esquema";
import { siguienteNumero } from "@/db/secuencia";
import type { BaseDatos, Transaccion } from "@/db/tipos";
import { ordenarParadas } from "@/dominio/entregas/entregas";
import { ErrorDeNegocio } from "@/dominio/errores";
import { hoyEnEmpresa, sumarDias, type FechaISO } from "@/dominio/fechas/fechas";
import { ejecutarComoUsuario, type ContextoUsuario } from "@/modulos/seguridad/contexto";
import { textoOpcional, validar } from "@/modulos/validacion";

import { configuracionEmpresa, exigirJornadaAbierta, jornadaDeFecha, moverPedidosDeEntrega, numeroEntrega, numeroReparto, unico } from "./comun";
import { documentosAlDia, emitirDocumentosEntrega, type ResultadoEmision } from "./documentos";

// Repartos y hoja de ruta (04 §5.f.1): RN-122, RN-123, RN-131. Sin precios.

export type EstadoReparto = "PLANIFICADO" | "EN_CURSO" | "FINALIZADO" | "ANULADO";

async function repartoBloqueado(tx: Transaccion, repartoId: string) {
  const [r] = await tx.select().from(reparto).where(eq(reparto.id, repartoId)).for("update");
  if (!r) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el reparto.");
  const [j] = await tx.select().from(jornada).where(eq(jornada.id, r.jornadaId));
  exigirJornadaAbierta(j);
  return { r, j: j! };
}

/** Quien puede manejar un reparto: con `repartos.gestionar`, o el repartidor asignado (RN-131). */
function exigirManejo(c: ContextoUsuario, r: { repartidorId: string | null }) {
  if (c.permisos.tiene("repartos.gestionar")) return;
  if (c.permisos.tiene("repartos.ver_propios") && r.repartidorId === c.usuarioId) return;
  throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el reparto.");
}

/** Hora "07:00" del día de la jornada, en la zona de la empresa (Argentina, UTC−3). */
function salidaPrevista(fecha: FechaISO, hora: string | null): Date | null {
  if (!hora) return null;
  if (!/^\d{2}:\d{2}$/.test(hora)) throw new ErrorDeNegocio("VALIDACION", "La hora de salida es HH:MM (ej. 07:00).");
  return new Date(`${fecha}T${hora}:00-03:00`);
}

const esquemaReparto = z.object({
  repartidorId: z
    .string()
    .nullish()
    .transform((v) => (v?.trim() ? v.trim() : null))
    .pipe(z.uuid().nullable()),
  vehiculo: textoOpcional(80),
  salida: z
    .string()
    .nullish()
    .transform((v) => (v?.trim() ? v.trim() : null)),
  observaciones: textoOpcional(500),
});

export async function crearReparto(db: BaseDatos, authUserId: string, datos: z.input<typeof esquemaReparto> & { fecha: FechaISO }): Promise<string> {
  const d = validar(esquemaReparto, datos);
  return ejecutarComoUsuario(db, authUserId, "repartos.gestionar", async (tx, c) => {
    const j = await jornadaDeFecha(tx, datos.fecha);
    if (!j) throw new ErrorDeNegocio("VALIDACION", "No hay jornada para ese día.");
    exigirJornadaAbierta(j);
    const { numero } = await siguienteNumero(tx, "REPARTO");
    const [r] = await tx
      .insert(reparto)
      .values({
        empresaId: c.empresaId,
        numero,
        jornadaId: j.id,
        repartidorId: d.repartidorId,
        vehiculo: d.vehiculo,
        salidaPrevistaEn: salidaPrevista(j.fecha, d.salida),
        observaciones: d.observaciones,
        creadoPor: c.usuarioId,
        actualizadoPor: c.usuarioId,
      })
      .returning({ id: reparto.id });
    return r!.id;
  });
}

export async function actualizarReparto(db: BaseDatos, authUserId: string, datos: z.input<typeof esquemaReparto> & { repartoId: string }): Promise<void> {
  const d = validar(esquemaReparto, datos);
  await ejecutarComoUsuario(db, authUserId, "repartos.gestionar", async (tx, c) => {
    const { r, j } = await repartoBloqueado(tx, datos.repartoId);
    if (r.estado !== "PLANIFICADO") throw new ErrorDeNegocio("VALIDACION", "El reparto ya salió.");
    await tx
      .update(reparto)
      .set({ repartidorId: d.repartidorId, vehiculo: d.vehiculo, salidaPrevistaEn: salidaPrevista(j.fecha, d.salida), observaciones: d.observaciones, actualizadoPor: c.usuarioId })
      .where(eq(reparto.id, r.id));
  });
}

/** Agrega una entrega al final del reparto (RN-123: una entrega, un reparto, de la misma jornada). */
export async function agregarAlReparto(db: BaseDatos, authUserId: string, datos: { repartoId: string; entregaId: string }): Promise<void> {
  await ejecutarComoUsuario(db, authUserId, "repartos.gestionar", async (tx, c) => {
    const { r } = await repartoBloqueado(tx, datos.repartoId);
    if (r.estado !== "PLANIFICADO") throw new ErrorDeNegocio("VALIDACION", "El reparto ya salió: armá otro.");
    const [e] = await tx.select().from(entrega).where(eq(entrega.id, datos.entregaId)).for("update");
    if (!e || e.jornadaId !== r.jornadaId) throw new ErrorDeNegocio("VALIDACION", "La entrega no es de esta jornada (RN-123).");
    if (!["BORRADOR", "EN_PREPARACION", "PREPARADA"].includes(e.estado)) throw new ErrorDeNegocio("VALIDACION", "Esa entrega ya salió o está anulada.");
    if (e.repartoId && e.repartoId !== r.id) {
      const [otro] = await tx.select({ estado: reparto.estado }).from(reparto).where(eq(reparto.id, e.repartoId));
      if (otro && otro.estado !== "ANULADO") throw new ErrorDeNegocio("VALIDACION", "Esa entrega ya está en otro reparto: sacala de ahí primero (RN-123).");
    }
    const { n } = unico(await tx.select({ n: count() }).from(entrega).where(eq(entrega.repartoId, r.id)));
    await tx.update(entrega).set({ repartoId: r.id, ordenEnReparto: Number(n) + 1, actualizadoPor: c.usuarioId }).where(eq(entrega.id, e.id));
  });
}

async function renumerar(tx: Transaccion, ids: string[]) {
  for (const [i, id] of ids.entries()) await tx.update(entrega).set({ ordenEnReparto: i + 1 }).where(eq(entrega.id, id));
}

async function paradasEnOrden(tx: Transaccion, repartoId: string) {
  return tx
    .select({ id: entrega.id, orden: entrega.ordenEnReparto, estado: entrega.estado, horarioDesde: puntoEntrega.horarioDesde, localidad: puntoEntrega.localidad })
    .from(entrega)
    .innerJoin(puntoEntrega, eq(puntoEntrega.id, entrega.puntoEntregaId))
    .where(and(eq(entrega.repartoId, repartoId), ne(entrega.estado, "ANULADA")))
    .orderBy(sql`${entrega.ordenEnReparto} nulls last`, asc(entrega.numero));
}

export async function quitarDelReparto(db: BaseDatos, authUserId: string, datos: { repartoId: string; entregaId: string }): Promise<void> {
  await ejecutarComoUsuario(db, authUserId, "repartos.gestionar", async (tx, c) => {
    const { r } = await repartoBloqueado(tx, datos.repartoId);
    const [e] = await tx.select().from(entrega).where(and(eq(entrega.id, datos.entregaId), eq(entrega.repartoId, r.id)));
    if (!e) throw new ErrorDeNegocio("NO_ENCONTRADO", "La entrega no está en este reparto.");
    if (e.estado === "ENTREGADA") throw new ErrorDeNegocio("VALIDACION", "Esa entrega ya se entregó.");
    // Si el reparto ya había salido, la entrega vuelve a quedar preparada (no se llevó).
    await tx
      .update(entrega)
      .set({ repartoId: null, ordenEnReparto: null, estado: e.estado === "EN_REPARTO" ? "PREPARADA" : e.estado, actualizadoPor: c.usuarioId })
      .where(eq(entrega.id, e.id));
    if (e.estado === "EN_REPARTO") await moverPedidosDeEntrega(tx, e.id, ["EN_REPARTO"], "PREPARADO");
    await renumerar(
      tx,
      (await paradasEnOrden(tx, r.id)).map((p) => p.id),
    );
  });
}

/** Sube o baja una parada. */
export async function moverParada(db: BaseDatos, authUserId: string, datos: { repartoId: string; entregaId: string; hacia: "arriba" | "abajo" }): Promise<void> {
  await ejecutarComoUsuario(db, authUserId, "repartos.gestionar", async (tx) => {
    const { r } = await repartoBloqueado(tx, datos.repartoId);
    const ids = (await paradasEnOrden(tx, r.id)).map((p) => p.id);
    const i = ids.indexOf(datos.entregaId);
    const j = datos.hacia === "arriba" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    await renumerar(
      tx,
      ids);
  });
}

/** Orden propuesto: por inicio de la franja de recepción y localidad (P-76). */
export async function proponerOrden(db: BaseDatos, authUserId: string, repartoId: string): Promise<void> {
  await ejecutarComoUsuario(db, authUserId, "repartos.gestionar", async (tx) => {
    const { r } = await repartoBloqueado(tx, repartoId);
    await renumerar(
      tx,
      ordenarParadas(await paradasEnOrden(tx, r.id)).map((p) => p.id),
    );
  });
}

async function emitirLosQueFaltan(tx: Transaccion, c: ContextoUsuario, donde: SQL | undefined, soloPreparadas: boolean): Promise<{ emitidas: number; problemas: string[] }> {
  const entregas = await tx
    .select({ id: entrega.id, numero: entrega.numero, estado: entrega.estado, version: entrega.version, cliente: cliente.nombre })
    .from(entrega)
    .innerJoin(cliente, eq(cliente.id, entrega.clienteId))
    .where(and(donde, ne(entrega.estado, "ANULADA")))
    .orderBy(asc(cliente.nombre));
  let emitidas = 0;
  const problemas: string[] = [];
  for (const e of entregas) {
    if (e.estado !== "PREPARADA" && e.estado !== "EN_REPARTO") {
      if (!soloPreparadas) problemas.push(`${e.cliente}: todavía no está preparada.`);
      continue;
    }
    if (await documentosAlDia(tx, e.id, e.version)) continue;
    const res: ResultadoEmision = await emitirDocumentosEntrega(tx, c, e.id, { confirmaMargenNegativo: true });
    if (res.resultado === "EMITIDOS") emitidas++;
    if (res.resultado === "SIN_PRECIO") problemas.push(`${e.cliente}: falta precio de ${res.productos.join(", ")}.`);
  }
  return { emitidas, problemas };
}

/** Emite los documentos que falten de las entregas preparadas del reparto (P-76). */
export async function emitirDocumentosDelReparto(db: BaseDatos, authUserId: string, repartoId: string): Promise<{ emitidas: number; problemas: string[] }> {
  return ejecutarComoUsuario(db, authUserId, "entregas.emitir_documentos", async (tx, c) => {
    const { r } = await repartoBloqueado(tx, repartoId);
    return emitirLosQueFaltan(tx, c, eq(entrega.repartoId, r.id), false);
  });
}

/** Emite los documentos que falten de todas las entregas preparadas del día (pantalla "Hoy"). */
export async function emitirDocumentosDelDia(db: BaseDatos, authUserId: string, fecha: FechaISO): Promise<{ emitidas: number; problemas: string[] }> {
  return ejecutarComoUsuario(db, authUserId, "entregas.emitir_documentos", async (tx, c) => {
    const j = await jornadaDeFecha(tx, fecha);
    if (!j) return { emitidas: 0, problemas: [] };
    exigirJornadaAbierta(j);
    return emitirLosQueFaltan(tx, c, eq(entrega.jornadaId, j.id), true);
  });
}

/**
 * "Salir" (RN-122, RN-039): exige repartidor y documentos emitidos de la versión vigente de todas
 * las entregas, que tienen que estar preparadas. Entregas y pedidos pasan a EN_REPARTO; la jornada,
 * a REPARTIENDO si era el primero.
 */
export async function salirDeReparto(db: BaseDatos, authUserId: string, repartoId: string): Promise<void> {
  await ejecutarComoUsuario(db, authUserId, null, async (tx, c) => {
    const { r, j } = await repartoBloqueado(tx, repartoId);
    exigirManejo(c, r);
    if (r.estado !== "PLANIFICADO") throw new ErrorDeNegocio("VALIDACION", "El reparto ya salió.");
    if (!r.repartidorId) throw new ErrorDeNegocio("VALIDACION", "Elegí quién hace el reparto antes de salir.");
    const paradas = await tx
      .select({ id: entrega.id, estado: entrega.estado, version: entrega.version, cliente: cliente.nombre })
      .from(entrega)
      .innerJoin(cliente, eq(cliente.id, entrega.clienteId))
      .where(and(eq(entrega.repartoId, r.id), ne(entrega.estado, "ANULADA")));
    if (paradas.length === 0) throw new ErrorDeNegocio("VALIDACION", "El reparto no tiene entregas.");
    const sinPreparar = paradas.filter((p) => p.estado !== "PREPARADA").map((p) => p.cliente);
    if (sinPreparar.length) throw new ErrorDeNegocio("VALIDACION", `Todavía no están preparadas: ${sinPreparar.join(", ")}.`);
    const sinDocumentos: string[] = [];
    for (const p of paradas) if (!(await documentosAlDia(tx, p.id, p.version))) sinDocumentos.push(p.cliente);
    if (sinDocumentos.length) throw new ErrorDeNegocio("VALIDACION", `Faltan emitir los documentos de: ${sinDocumentos.join(", ")} (RN-122).`);
    await tx.update(reparto).set({ estado: "EN_CURSO", salidaEn: sql`now()`, actualizadoPor: c.usuarioId }).where(eq(reparto.id, r.id));
    for (const p of paradas) {
      await tx.update(entrega).set({ estado: "EN_REPARTO", actualizadoPor: c.usuarioId }).where(eq(entrega.id, p.id));
      await moverPedidosDeEntrega(tx, p.id, ["PREPARADO"], "EN_REPARTO");
    }
    if (j.estado === "PREPARANDO") await tx.update(jornada).set({ estado: "REPARTIENDO", repartoIniciadoEn: sql`now()`, actualizadoPor: c.usuarioId }).where(eq(jornada.id, j.id));
  });
}

/** "Regresé": el reparto termina (también al confirmar la última parada). */
export async function regresarDeReparto(db: BaseDatos, authUserId: string, repartoId: string): Promise<void> {
  await ejecutarComoUsuario(db, authUserId, null, async (tx, c) => {
    const { r } = await repartoBloqueado(tx, repartoId);
    exigirManejo(c, r);
    if (r.estado !== "EN_CURSO") throw new ErrorDeNegocio("VALIDACION", "El reparto no está en curso.");
    await tx.update(reparto).set({ estado: "FINALIZADO", regresoEn: sql`now()`, actualizadoPor: c.usuarioId }).where(eq(reparto.id, r.id));
  });
}

/** Si todas las paradas se confirmaron, el reparto queda FINALIZADO. */
export async function finalizarSiCorresponde(tx: Transaccion, c: ContextoUsuario, repartoId: string | null): Promise<void> {
  if (!repartoId) return;
  const { pendientes } = unico(
    await tx
      .select({ pendientes: count() })
      .from(entrega)
      .where(and(eq(entrega.repartoId, repartoId), inArray(entrega.estado, ["BORRADOR", "EN_PREPARACION", "PREPARADA", "EN_REPARTO"]))),
  );
  if (Number(pendientes) === 0) {
    await tx
      .update(reparto)
      .set({ estado: "FINALIZADO", regresoEn: sql`coalesce(${reparto.regresoEn}, now())`, actualizadoPor: c.usuarioId })
      .where(and(eq(reparto.id, repartoId), eq(reparto.estado, "EN_CURSO")));
  }
}

/** Anular un reparto sin entregas confirmadas: sus entregas quedan sin reparto (03 §15.8). */
export async function anularReparto(db: BaseDatos, authUserId: string, datos: { repartoId: string; motivo: string }): Promise<void> {
  const motivo = datos.motivo?.trim() ?? "";
  if (motivo.length < 5) throw new ErrorDeNegocio("VALIDACION", "Escribí por qué se anula (al menos 5 letras).");
  await ejecutarComoUsuario(db, authUserId, "repartos.gestionar", async (tx, c) => {
    const { r } = await repartoBloqueado(tx, datos.repartoId);
    if (r.estado === "ANULADO") return;
    const { entregadas } = unico(await tx.select({ entregadas: count() }).from(entrega).where(and(eq(entrega.repartoId, r.id), eq(entrega.estado, "ENTREGADA"))));
    if (Number(entregadas) > 0) throw new ErrorDeNegocio("VALIDACION", "El reparto tiene entregas confirmadas: no se puede anular.");
    const enCamino = await tx.select({ id: entrega.id }).from(entrega).where(and(eq(entrega.repartoId, r.id), eq(entrega.estado, "EN_REPARTO")));
    for (const e of enCamino) await moverPedidosDeEntrega(tx, e.id, ["EN_REPARTO"], "PREPARADO");
    await tx
      .update(entrega)
      .set({ repartoId: null, ordenEnReparto: null, estado: sql`case when ${entrega.estado} = 'EN_REPARTO' then 'PREPARADA'::estado_entrega else ${entrega.estado} end`, actualizadoPor: c.usuarioId })
      .where(eq(entrega.repartoId, r.id));
    await tx.update(reparto).set({ estado: "ANULADO", anuladoEn: sql`now()`, anuladoPor: c.usuarioId, motivoAnulacion: motivo, actualizadoPor: c.usuarioId }).where(eq(reparto.id, r.id));
    await auditar(tx, { empresaId: c.empresaId, usuarioId: c.usuarioId, accion: "ANULAR", entidad: "reparto", entidadId: r.id, resumen: `Anulación de ${numeroReparto(r.numero)}.`, motivo });
  });
}

export interface RepartoListado {
  id: string;
  numero: string;
  repartidor: string | null;
  vehiculo: string | null;
  salidaPrevista: Date | null;
  salida: Date | null;
  regreso: Date | null;
  estado: EstadoReparto;
  paradas: number;
  entregadas: number;
  bultos: number;
}

async function consultarRepartos(tx: Transaccion, condicion: ReturnType<typeof and>) {
  const filas = await tx
    .select({
      id: reparto.id,
      numero: reparto.numero,
      repartidor: usuario.nombre,
      vehiculo: reparto.vehiculo,
      salidaPrevista: reparto.salidaPrevistaEn,
      salida: reparto.salidaEn,
      regreso: reparto.regresoEn,
      estado: reparto.estado,
      fecha: jornada.fecha,
      paradas: sql<number>`(select count(*) from ${entrega} e where e.reparto_id = reparto.id and e.estado <> 'ANULADA')`,
      entregadas: sql<number>`(select count(*) from ${entrega} e where e.reparto_id = reparto.id and e.estado = 'ENTREGADA')`,
      bultos: sql<number>`(select coalesce(sum(e.cantidad_bultos), 0) from ${entrega} e where e.reparto_id = reparto.id and e.estado <> 'ANULADA')`,
    })
    .from(reparto)
    .innerJoin(jornada, eq(jornada.id, reparto.jornadaId))
    .leftJoin(usuario, eq(usuario.id, reparto.repartidorId))
    .where(condicion)
    .orderBy(desc(jornada.fecha), asc(reparto.numero));
  return filas.map((f) => ({ ...f, numero: numeroReparto(f.numero), paradas: Number(f.paradas), entregadas: Number(f.entregadas), bultos: Number(f.bultos) }));
}

/** P-75: repartos del día y las entregas preparadas que todavía no están en ninguno. */
export async function listarRepartos(db: BaseDatos, authUserId: string, fecha: FechaISO) {
  return ejecutarComoUsuario(db, authUserId, "repartos.ver", async (tx) => {
    const j = await jornadaDeFecha(tx, fecha);
    if (!j) return { jornadaEstado: null, repartos: [] as RepartoListado[], sinReparto: 0 };
    const repartos = await consultarRepartos(tx, and(eq(reparto.jornadaId, j.id)));
    const { sinReparto } = unico(
      await tx
        .select({ sinReparto: count() })
        .from(entrega)
        .where(and(eq(entrega.jornadaId, j.id), isNull(entrega.repartoId), inArray(entrega.estado, ["BORRADOR", "EN_PREPARACION", "PREPARADA"]))),
    );
    return { jornadaEstado: j.estado, repartos, sinReparto: Number(sinReparto) };
  });
}

/** P-77: los repartos del usuario (de ayer en adelante), sin anulados (RN-131). */
export async function misRepartos(db: BaseDatos, authUserId: string) {
  return ejecutarComoUsuario(db, authUserId, "repartos.ver_propios", async (tx, c) => {
    const empresa = await configuracionEmpresa(tx);
    const desde = sumarDias(hoyEnEmpresa(new Date(), empresa.zonaHoraria), -1);
    return consultarRepartos(tx, and(eq(reparto.repartidorId, c.usuarioId), ne(reparto.estado, "ANULADO"), gte(jornada.fecha, desde)));
  });
}

export interface Parada {
  id: string;
  numero: string;
  version: number;
  orden: number | null;
  estado: string;
  cliente: string;
  punto: string;
  direccion: string;
  localidad: string | null;
  referencias: string | null;
  horario: string | null;
  contacto: string | null;
  telefono: string | null;
  instrucciones: string | null;
  latitud: string | null;
  longitud: string | null;
  bultos: number | null;
  conDiferencias: boolean;
  documentosAlDia: boolean;
}

/**
 * P-76, P-77 y DOC-04: el reparto con sus paradas, sin precios. Un repartidor sin `repartos.ver`
 * solo ve los suyos; los ajenos responden "no encontrado" (RN-131).
 */
export async function obtenerReparto(db: BaseDatos, authUserId: string, repartoId: string) {
  return ejecutarComoUsuario(db, authUserId, null, async (tx, c) => {
    const [r] = await tx
      .select({ r: reparto, fecha: jornada.fecha, jornadaEstado: jornada.estado, repartidor: usuario.nombre })
      .from(reparto)
      .innerJoin(jornada, eq(jornada.id, reparto.jornadaId))
      .leftJoin(usuario, eq(usuario.id, reparto.repartidorId))
      .where(eq(reparto.id, repartoId));
    if (!r) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el reparto.");
    if (!c.permisos.tiene("repartos.ver") && !(c.permisos.tiene("repartos.ver_propios") && r.r.repartidorId === c.usuarioId)) {
      throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el reparto.");
    }
    const filas = await tx
      .select({
        id: entrega.id,
        numero: entrega.numero,
        version: entrega.version,
        orden: entrega.ordenEnReparto,
        estado: entrega.estado,
        cliente: cliente.nombre,
        punto: puntoEntrega.nombre,
        direccion: puntoEntrega.direccion,
        localidad: puntoEntrega.localidad,
        referencias: puntoEntrega.referencias,
        desde: puntoEntrega.horarioDesde,
        hasta: puntoEntrega.horarioHasta,
        contacto: puntoEntrega.contactoNombre,
        telefono: puntoEntrega.contactoTelefono,
        instrucciones: puntoEntrega.instruccionesEntrega,
        latitud: puntoEntrega.latitud,
        longitud: puntoEntrega.longitud,
        bultos: entrega.cantidadBultos,
        conDiferencias: entrega.conDiferencias,
      })
      .from(entrega)
      .innerJoin(cliente, eq(cliente.id, entrega.clienteId))
      .innerJoin(puntoEntrega, eq(puntoEntrega.id, entrega.puntoEntregaId))
      .where(and(eq(entrega.repartoId, r.r.id), ne(entrega.estado, "ANULADA")))
      .orderBy(sql`${entrega.ordenEnReparto} nulls last`, asc(entrega.numero));
    const paradas: Parada[] = [];
    for (const f of filas) {
      paradas.push({
        id: f.id,
        numero: numeroEntrega(f.numero),
        version: f.version,
        orden: f.orden,
        estado: f.estado,
        cliente: f.cliente,
        punto: f.punto,
        direccion: f.direccion,
        localidad: f.localidad,
        referencias: f.referencias,
        horario: f.desde || f.hasta ? `${f.desde?.slice(0, 5) ?? "?"}–${f.hasta?.slice(0, 5) ?? "?"}` : null,
        contacto: f.contacto,
        telefono: f.telefono,
        instrucciones: f.instrucciones,
        latitud: f.latitud,
        longitud: f.longitud,
        bultos: f.bultos,
        conDiferencias: f.conDiferencias,
        documentosAlDia: await documentosAlDia(tx, f.id, f.version),
      });
    }
    return {
      id: r.r.id,
      numero: numeroReparto(r.r.numero),
      fecha: r.fecha,
      jornadaEstado: r.jornadaEstado,
      estado: r.r.estado as EstadoReparto,
      repartidorId: r.r.repartidorId,
      repartidor: r.repartidor,
      vehiculo: r.r.vehiculo,
      salidaPrevista: r.r.salidaPrevistaEn,
      salida: r.r.salidaEn,
      regreso: r.r.regresoEn,
      observaciones: r.r.observaciones,
      motivoAnulacion: r.r.motivoAnulacion,
      esMio: r.r.repartidorId === c.usuarioId,
      paradas,
    };
  });
}

/** Entregas de la jornada sin reparto, para agregar (P-76). */
export async function entregasSinReparto(db: BaseDatos, authUserId: string, repartoId: string) {
  return ejecutarComoUsuario(db, authUserId, "repartos.gestionar", async (tx) => {
    const [r] = await tx.select({ jornadaId: reparto.jornadaId }).from(reparto).where(eq(reparto.id, repartoId));
    if (!r) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el reparto.");
    const filas = await tx
      .select({
        id: entrega.id,
        numero: entrega.numero,
        estado: entrega.estado,
        cliente: cliente.nombre,
        punto: puntoEntrega.nombre,
        localidad: puntoEntrega.localidad,
        desde: puntoEntrega.horarioDesde,
        bultos: entrega.cantidadBultos,
      })
      .from(entrega)
      .innerJoin(cliente, eq(cliente.id, entrega.clienteId))
      .innerJoin(puntoEntrega, eq(puntoEntrega.id, entrega.puntoEntregaId))
      .where(and(eq(entrega.jornadaId, r.jornadaId), isNull(entrega.repartoId), inArray(entrega.estado, ["BORRADOR", "EN_PREPARACION", "PREPARADA"])))
      .orderBy(sql`case when ${entrega.estado} = 'PREPARADA' then 0 else 1 end`, sql`${puntoEntrega.horarioDesde} nulls last`, asc(cliente.nombre));
    return filas.map((f) => ({ ...f, numero: numeroEntrega(f.numero), desde: f.desde?.slice(0, 5) ?? null }));
  });
}

/** Personas que pueden hacer un reparto: usuarios activos con rol REPARTIDOR o ADMIN. */
export async function repartidoresDisponibles(db: BaseDatos, authUserId: string) {
  return ejecutarComoUsuario(db, authUserId, "repartos.gestionar", async (tx) =>
    tx
      .selectDistinct({ id: usuario.id, nombre: usuario.nombre })
      .from(usuario)
      .innerJoin(usuarioRol, eq(usuarioRol.usuarioId, usuario.id))
      .innerJoin(rol, eq(rol.id, usuarioRol.rolId))
      .where(and(eq(usuario.activo, true), inArray(rol.codigo, ["REPARTIDOR", "ADMIN"])))
      .orderBy(asc(usuario.nombre)),
  );
}
