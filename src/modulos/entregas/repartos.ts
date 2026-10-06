import { and, asc, count, desc, eq, gte, inArray, isNull, ne, sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import { auditar } from "@/db/auditoria";
import { cliente, entrega, entregaItem, jornada, pedido, pedidoItem, puntoEntrega, reparto, rol, usuario, usuarioRol } from "@/db/esquema";
import { siguienteNumero } from "@/db/secuencia";
import type { BaseDatos, Transaccion } from "@/db/tipos";
import { dec } from "@/dominio/dinero/decimal";
import { ordenarParadas } from "@/dominio/entregas/entregas";
import { enumerar, planDeSalida } from "@/dominio/entregas/salida";
import { ErrorDeNegocio } from "@/dominio/errores";
import { hoyEnEmpresa, sumarDias, type FechaISO } from "@/dominio/fechas/fechas";
import { registrarActividad } from "@/modulos/colaboracion/registro";
import { ejecutarComoUsuario, type ContextoUsuario } from "@/modulos/seguridad/contexto";
import { textoOpcional, validar } from "@/modulos/validacion";

import { configuracionEmpresa, exigirJornadaAbierta, jornadaDeFecha, moverPedidosDeEntrega, numeroEntrega, numeroReparto, unico } from "./comun";
import { documentosAlDia, documentosAlDiaDe, emitirDocumentosEntrega, type ResultadoEmision } from "./documentos";

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

type ContextoDeSalida = { tx: Transaccion; c: ContextoUsuario };

/**
 * Lo que comparten "Salir" y "🚚 Sale ahora": exige documentos emitidos de la versión vigente de
 * todas las paradas, que tienen que estar preparadas; si nadie quedó a cargo del reparto, lo hace
 * quien lo manda a salir. Entregas y pedidos pasan a EN_REPARTO; la jornada, a REPARTIENDO si era
 * el primero.
 */
async function salirEnTransaccion({ tx, c }: ContextoDeSalida, r: typeof reparto.$inferSelect, j: typeof jornada.$inferSelect): Promise<string[]> {
  if (r.estado !== "PLANIFICADO") throw new ErrorDeNegocio("VALIDACION", "El reparto ya salió.");
  const paradas = await tx
    .select({ id: entrega.id, estado: entrega.estado, version: entrega.version, cliente: cliente.nombre })
    .from(entrega)
    .innerJoin(cliente, eq(cliente.id, entrega.clienteId))
    .where(and(eq(entrega.repartoId, r.id), ne(entrega.estado, "ANULADA")))
    .orderBy(sql`${entrega.ordenEnReparto} nulls last`, asc(cliente.nombre));
  const enlace = { href: `/repartos/${r.id}`, texto: `Ver el reparto ${numeroReparto(r.numero)}` };
  if (paradas.length === 0) throw new ErrorDeNegocio("VALIDACION", "El reparto no tiene entregas.");
  const sinPreparar = paradas.filter((p) => p.estado !== "PREPARADA").map((p) => p.cliente);
  if (sinPreparar.length) {
    throw new ErrorDeNegocio("VALIDACION", `El reparto ${numeroReparto(r.numero)} también lleva lo de ${enumerar(sinPreparar)}, que todavía no está preparado: terminá de prepararlo o sacalo del reparto.`, { enlace });
  }
  const alDia = await documentosAlDiaDe(tx, paradas);
  const sinDocumentos = paradas.filter((p) => !alDia.has(p.id)).map((p) => p.cliente);
  if (sinDocumentos.length) {
    throw new ErrorDeNegocio("VALIDACION", `Falta hacer el remito de ${enumerar(sinDocumentos)} (RN-122): tocá "Hacer los remitos que faltan" en el reparto.`, { enlace });
  }
  await tx
    .update(reparto)
    .set({ estado: "EN_CURSO", salidaEn: sql`now()`, repartidorId: r.repartidorId ?? c.usuarioId, actualizadoPor: c.usuarioId })
    .where(eq(reparto.id, r.id));
  for (const p of paradas) {
    await tx.update(entrega).set({ estado: "EN_REPARTO", actualizadoPor: c.usuarioId }).where(eq(entrega.id, p.id));
    await moverPedidosDeEntrega(tx, p.id, ["PREPARADO"], "EN_REPARTO");
  }
  if (j.estado === "PREPARANDO") {
    await tx.update(jornada).set({ estado: "REPARTIENDO", repartoIniciadoEn: sql`now()`, actualizadoPor: c.usuarioId }).where(eq(jornada.id, j.id));
    j.estado = "REPARTIENDO";
  }
  await registrarActividad(tx, c, {
    accion: "SALIR",
    entidadTipo: "REPARTO",
    entidadId: r.id,
    jornadaId: j.id,
    resumen: `salió con el reparto ${numeroReparto(r.numero)} (${paradas.length === 1 ? "1 entrega" : `${paradas.length} entregas`})`,
  });
  return paradas.map((p) => p.cliente);
}

/**
 * "Salir" (RN-122, RN-039) desde el reparto: todas las paradas preparadas y con su remito. Si no
 * se eligió quién lo hace, lo hace quien toca "Salir".
 */
export async function salirDeReparto(db: BaseDatos, authUserId: string, repartoId: string): Promise<void> {
  await ejecutarComoUsuario(db, authUserId, null, async (tx, c) => {
    const { r, j } = await repartoBloqueado(tx, repartoId);
    exigirManejo(c, r);
    await salirEnTransaccion({ tx, c }, r, j);
  });
}

export interface ResultadoSalida {
  /** El día de las entregas. */
  fecha: FechaISO;
  /** Los repartos que salieron, con los clientes que llevan. */
  repartos: { id: string; numero: string; clientes: string[] }[];
  /** Clientes elegidos que ya estaban en camino o entregados. */
  yaEnCamino: string[];
}

const ESTADOS_SIN_SALIR = ["BORRADOR", "EN_PREPARACION", "PREPARADA"];

/**
 * "🚚 Sale ahora" (pedido del usuario, 06/10/2026): lleva a "En camino" los pedidos elegidos en un
 * solo paso, como arrastrar la tarjeta en el tablero. Lo que falte separar se marca con lo propuesto
 * (lo pedido o lo que alcanzó), pero solo después de que la persona lo confirma; la entrega queda
 * preparada, se hacen los remitos que falten y sale el reparto: el armado en el que ya estaba (con
 * todas sus paradas) o uno nuevo con las entregas sueltas, a cargo de quien lo manda (RN-122, RN-123,
 * RN-153). Todo en una transacción: si algo frena (falta un precio para el remito, otra parada del
 * reparto sin preparar), no cambia nada y el mensaje dice cómo seguir.
 */
export async function mandarEnCamino(
  db: BaseDatos,
  authUserId: string,
  datos: { pedidoIds?: readonly string[]; entregaIds?: readonly string[]; confirmar?: boolean },
): Promise<ResultadoSalida> {
  return ejecutarComoUsuario(db, authUserId, "repartos.gestionar", async (tx, c) => {
    const pedidoIds = [...new Set(datos.pedidoIds ?? [])];
    const ids = new Set(datos.entregaIds ?? []);
    if (pedidoIds.length) {
      const vinculos = await tx
        .selectDistinct({ pedidoId: pedidoItem.pedidoId, entregaId: entrega.id })
        .from(entregaItem)
        .innerJoin(entrega, and(eq(entrega.id, entregaItem.entregaId), ne(entrega.estado, "ANULADA")))
        .innerJoin(pedidoItem, eq(pedidoItem.id, entregaItem.pedidoItemId))
        .where(inArray(pedidoItem.pedidoId, pedidoIds));
      for (const v of vinculos) ids.add(v.entregaId);
      const sinPreparar = pedidoIds.filter((id) => !vinculos.some((v) => v.pedidoId === id));
      if (sinPreparar.length) {
        const pedidos = await tx
          .select({ cliente: cliente.nombre, fecha: jornada.fecha })
          .from(pedido)
          .innerJoin(cliente, eq(cliente.id, pedido.clienteId))
          .innerJoin(jornada, eq(jornada.id, pedido.jornadaId))
          .where(inArray(pedido.id, sinPreparar));
        if (pedidos.length) {
          throw new ErrorDeNegocio("VALIDACION", `Todavía no se empezó a preparar lo de ${enumerar(pedidos.map((p) => p.cliente))}: primero tocá "Empezar a preparar".`, {
            enlace: { href: `/preparacion/${pedidos[0]!.fecha}`, texto: "Ir a preparación" },
          });
        }
      }
    }
    if (ids.size === 0) throw new ErrorDeNegocio("VALIDACION", "Elegí al menos un pedido que se esté preparando.");

    const elegidas = await tx.select().from(entrega).where(inArray(entrega.id, [...ids])).orderBy(asc(entrega.numero)).for("update");
    if (elegidas.length !== ids.size) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró alguna de las entregas: recargá la página.");
    const jornadas = new Set(elegidas.map((e) => e.jornadaId));
    if (jornadas.size > 1) throw new ErrorDeNegocio("VALIDACION", "Elegí pedidos de un mismo día: cada reparto es de un día.");
    const [j] = await tx.select().from(jornada).where(eq(jornada.id, elegidas[0]!.jornadaId)).for("update");
    exigirJornadaAbierta(j);
    const nombres = new Map(
      (await tx.select({ id: cliente.id, nombre: cliente.nombre }).from(cliente).where(inArray(cliente.id, [...new Set(elegidas.map((e) => e.clienteId))]))).map((x) => [x.id, x.nombre]),
    );
    const nombre = (e: { clienteId: string }) => nombres.get(e.clienteId) ?? "un cliente";
    const anuladas = elegidas.filter((e) => e.estado === "ANULADA");
    if (anuladas.length) throw new ErrorDeNegocio("VALIDACION", `La entrega de ${enumerar(anuladas.map(nombre))} está anulada.`);
    const pendientes = elegidas.filter((e) => ESTADOS_SIN_SALIR.includes(e.estado));

    // 1. Lo que falta separar: se marca con lo propuesto, solo si la persona lo confirmó.
    const sinSeparar = pendientes.length
      ? await tx
          .select({ id: entregaItem.id, entregaId: entregaItem.entregaId, producto: entregaItem.productoNombre, pedida: entregaItem.cantidadPedida, propuesta: entregaItem.cantidadPropuesta })
          .from(entregaItem)
          .where(and(inArray(entregaItem.entregaId, pendientes.map((e) => e.id)), isNull(entregaItem.cantidadPreparada)))
          .orderBy(asc(entregaItem.linea))
      : [];
    if (sinSeparar.length) {
      c.permisos.exigir("preparacion.registrar");
      if (!datos.confirmar) {
        const detalle = pendientes
          .filter((e) => sinSeparar.some((l) => l.entregaId === e.id))
          .map((e) => `${nombre(e)} (${enumerar(sinSeparar.filter((l) => l.entregaId === e.id).map((l) => l.producto.toLowerCase()))})`);
        const primera = pendientes.find((e) => sinSeparar.some((l) => l.entregaId === e.id))!;
        throw new ErrorDeNegocio("VALIDACION", `Falta tildar lo separado de ${enumerar(detalle)}. Si sale así, tocá "Confirmar": se marca lo pedido (o lo que alcanzó) y después se puede corregir.`, {
          requiereConfirmacion: true,
          enlace: { href: `/preparacion/${j!.fecha}/entrega/${primera.id}`, texto: `Ver lo de ${nombre(primera)}` },
        });
      }
      for (const l of sinSeparar) {
        const cantidad = l.propuesta ?? l.pedida;
        await tx
          .update(entregaItem)
          .set({ cantidadPreparada: cantidad, motivoFaltante: dec(cantidad).lt(l.pedida) ? "FALTANTE" : null, actualizadoPor: c.usuarioId })
          .where(eq(entregaItem.id, l.id));
      }
    }

    // 2. Preparadas: la entrega y sus pedidos.
    for (const e of pendientes.filter((x) => x.estado !== "PREPARADA")) {
      c.permisos.exigir("preparacion.registrar");
      await tx.update(entrega).set({ estado: "PREPARADA", actualizadoPor: c.usuarioId }).where(eq(entrega.id, e.id));
      await moverPedidosDeEntrega(tx, e.id, ["CONFIRMADO", "EN_COMPRA", "EN_PREPARACION"], "PREPARADO");
      await registrarActividad(tx, c, { accion: "PREPARADA", entidadTipo: "ENTREGA", entidadId: e.id, jornadaId: e.jornadaId, resumen: `terminó de preparar el pedido de ${nombre(e)}` });
      e.estado = "PREPARADA";
    }

    // 3. Los remitos que falten (lista de entrega y lista contable de la versión vigente).
    const alDia = await documentosAlDiaDe(tx, pendientes);
    for (const e of pendientes.filter((x) => !alDia.has(x.id))) {
      c.permisos.exigir("entregas.emitir_documentos");
      const r = await emitirDocumentosEntrega(tx, c, e.id, { confirmaMargenNegativo: true });
      if (r.resultado === "SIN_PRECIO") {
        const [falta] = await tx
          .select({ id: entregaItem.productoId })
          .from(entregaItem)
          .where(and(eq(entregaItem.entregaId, e.id), eq(entregaItem.productoNombre, r.productos[0]!)))
          .limit(1);
        throw new ErrorDeNegocio("PRECIO_SIN_COSTO", `No se puede hacer el remito de ${nombre(e)}: falta el precio de ${enumerar(r.productos)}. Cargale el precio de compra y volvé a mandarlo.`, {
          enlace: { href: falta ? `/productos/${falta.id}` : "/precios/compra", texto: `Poner el precio de ${r.productos[0]}` },
        });
      }
    }

    // 4. Los repartos: el armado en el que estaban o uno nuevo con las sueltas.
    const repartosDe = [...new Set(pendientes.map((e) => e.repartoId).filter((x): x is string => x !== null))];
    const planificados = new Set(
      repartosDe.length
        ? (await tx.select({ id: reparto.id }).from(reparto).where(and(inArray(reparto.id, repartosDe), eq(reparto.estado, "PLANIFICADO")))).map((r) => r.id)
        : [],
    );
    const plan = planDeSalida(elegidas.map((e) => ({ id: e.id, repartoPlanificado: e.repartoId && planificados.has(e.repartoId) ? e.repartoId : null, yaSalio: !ESTADOS_SIN_SALIR.includes(e.estado) })));
    const aSalir = [...plan.repartos];
    if (plan.agregar) {
      const { n } = unico(await tx.select({ n: count() }).from(entrega).where(eq(entrega.repartoId, plan.agregar.repartoId)));
      for (const [i, id] of plan.agregar.entregaIds.entries()) {
        await tx.update(entrega).set({ repartoId: plan.agregar.repartoId, ordenEnReparto: Number(n) + i + 1, actualizadoPor: c.usuarioId }).where(eq(entrega.id, id));
      }
    }
    if (plan.nuevo.length) {
      const lugares = await tx
        .select({ id: entrega.id, horarioDesde: puntoEntrega.horarioDesde, localidad: puntoEntrega.localidad })
        .from(entrega)
        .innerJoin(puntoEntrega, eq(puntoEntrega.id, entrega.puntoEntregaId))
        .where(inArray(entrega.id, plan.nuevo));
      const { numero } = await siguienteNumero(tx, "REPARTO");
      const [r] = await tx
        .insert(reparto)
        .values({ empresaId: c.empresaId, numero, jornadaId: j!.id, repartidorId: c.usuarioId, creadoPor: c.usuarioId, actualizadoPor: c.usuarioId })
        .returning({ id: reparto.id });
      for (const [i, l] of ordenarParadas(lugares).entries()) {
        await tx.update(entrega).set({ repartoId: r!.id, ordenEnReparto: i + 1, actualizadoPor: c.usuarioId }).where(eq(entrega.id, l.id));
      }
      aSalir.push(r!.id);
    }
    const salieron: ResultadoSalida["repartos"] = [];
    for (const id of aSalir) {
      const { r } = await repartoBloqueado(tx, id);
      salieron.push({ id, numero: numeroReparto(r.numero), clientes: await salirEnTransaccion({ tx, c }, r, j!) });
    }
    return { fecha: j!.fecha, repartos: salieron, yaEnCamino: elegidas.filter((e) => plan.yaSalieron.includes(e.id)).map(nombre) };
  });
}

/** "Regresé": el reparto termina (también al confirmar la última parada). */
export async function regresarDeReparto(db: BaseDatos, authUserId: string, repartoId: string): Promise<void> {
  await ejecutarComoUsuario(db, authUserId, null, async (tx, c) => {
    const { r } = await repartoBloqueado(tx, repartoId);
    exigirManejo(c, r);
    if (r.estado !== "EN_CURSO") throw new ErrorDeNegocio("VALIDACION", "El reparto no está en curso.");
    await tx.update(reparto).set({ estado: "FINALIZADO", regresoEn: sql`now()`, actualizadoPor: c.usuarioId }).where(eq(reparto.id, r.id));
    await registrarActividad(tx, c, { accion: "VOLVER", entidadTipo: "REPARTO", entidadId: r.id, jornadaId: r.jornadaId, resumen: `volvió del reparto ${numeroReparto(r.numero)}` });
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
    await registrarActividad(tx, c, { accion: "ANULAR", entidadTipo: "REPARTO", entidadId: r.id, jornadaId: r.jornadaId, resumen: `anuló el reparto ${numeroReparto(r.numero)} (${motivo})` });
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
    const alDiaParadas = await documentosAlDiaDe(tx, filas);
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
        documentosAlDia: alDiaParadas.has(f.id),
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

// ——— Recorrido (uso interno, 28/09/2026) ———

/**
 * Guarda el orden de las paradas elegido en el recorrido (calculado o a mano). Lo puede hacer
 * quien maneja el reparto (también el repartidor asignado) mientras no terminó.
 */
export async function fijarOrdenDeReparto(db: BaseDatos, authUserId: string, datos: { repartoId: string; orden: readonly string[] }): Promise<void> {
  await ejecutarComoUsuario(db, authUserId, null, async (tx, c) => {
    const { r, j } = await repartoBloqueado(tx, datos.repartoId);
    exigirManejo(c, r);
    if (r.estado !== "PLANIFICADO" && r.estado !== "EN_CURSO") throw new ErrorDeNegocio("VALIDACION", "El reparto ya terminó.");
    const actuales = (await paradasEnOrden(tx, r.id)).map((p) => p.id);
    const nuevo = [...new Set(datos.orden)];
    if (nuevo.length !== actuales.length || nuevo.some((id) => !actuales.includes(id))) {
      throw new ErrorDeNegocio("VALIDACION", "El orden tiene que incluir todas las paradas del reparto (cambió algo: volvé a calcularlo).");
    }
    await renumerar(tx, nuevo);
    await registrarActividad(tx, c, { accion: "ORDENAR", entidadTipo: "REPARTO", entidadId: r.id, jornadaId: j.id, resumen: `ordenó las paradas del reparto ${numeroReparto(r.numero)}` });
  });
}

/**
 * Arma un reparto con las entregas del día en el orden del recorrido calculado (RN-123: cada
 * entrega en un solo reparto y de la misma jornada).
 */
export async function armarRepartoConOrden(db: BaseDatos, authUserId: string, datos: { fecha: FechaISO; entregaIds: readonly string[] }): Promise<string> {
  return ejecutarComoUsuario(db, authUserId, "repartos.gestionar", async (tx, c) => {
    const j = await jornadaDeFecha(tx, datos.fecha);
    if (!j) throw new ErrorDeNegocio("VALIDACION", "No hay jornada para ese día.");
    exigirJornadaAbierta(j);
    const ids = [...new Set(datos.entregaIds)];
    if (ids.length === 0) throw new ErrorDeNegocio("VALIDACION", "Elegí al menos una entrega.");
    const entregas = await tx.select().from(entrega).where(inArray(entrega.id, ids)).for("update");
    if (entregas.length !== ids.length || entregas.some((e) => e.jornadaId !== j.id)) throw new ErrorDeNegocio("VALIDACION", "Alguna entrega no es de este día (RN-123).");
    const otrosRepartos = [...new Set(entregas.map((e) => e.repartoId).filter((x): x is string => x !== null))];
    const vivos = otrosRepartos.length
      ? await tx.select({ id: reparto.id }).from(reparto).where(and(inArray(reparto.id, otrosRepartos), ne(reparto.estado, "ANULADO")))
      : [];
    const ocupadas = entregas.filter((e) => e.repartoId && vivos.some((v) => v.id === e.repartoId));
    if (ocupadas.length) throw new ErrorDeNegocio("VALIDACION", "Alguna entrega ya está en otro reparto: sacala de ahí o ordená ese reparto (RN-123).");
    if (entregas.some((e) => !["BORRADOR", "EN_PREPARACION", "PREPARADA"].includes(e.estado))) throw new ErrorDeNegocio("VALIDACION", "Alguna entrega ya salió, se entregó o está anulada.");
    const { numero } = await siguienteNumero(tx, "REPARTO");
    const [r] = await tx
      .insert(reparto)
      .values({ empresaId: c.empresaId, numero, jornadaId: j.id, repartidorId: c.usuarioId, creadoPor: c.usuarioId, actualizadoPor: c.usuarioId })
      .returning({ id: reparto.id });
    for (const [i, id] of ids.entries()) {
      await tx.update(entrega).set({ repartoId: r!.id, ordenEnReparto: i + 1, actualizadoPor: c.usuarioId }).where(eq(entrega.id, id));
    }
    await registrarActividad(tx, c, {
      accion: "CREAR",
      entidadTipo: "REPARTO",
      entidadId: r!.id,
      jornadaId: j.id,
      resumen: `armó el reparto ${numeroReparto(numero)} con el recorrido calculado (${ids.length === 1 ? "1 parada" : `${ids.length} paradas`})`,
    });
    return r!.id;
  });
}
