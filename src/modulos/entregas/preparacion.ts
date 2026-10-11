import { randomUUID } from "node:crypto";

import { and, asc, count, eq, inArray, max, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { categoria, cliente, compra, documentoEmitido, entrega, entregaItem, jornada, pedido, pedidoItem, presentacion, producto, puntoEntrega, reparto } from "@/db/esquema";
import { siguienteNumero } from "@/db/secuencia";
import type { BaseDatos, Transaccion } from "@/db/tipos";
import { dec, sumar } from "@/dominio/dinero/decimal";
import { avisoDeFaltante, distribuirFaltante, evaluarPreparado, pasoDeReparto, type MotivoDiferencia } from "@/dominio/entregas/entregas";
import { ErrorDeNegocio } from "@/dominio/errores";
import { prioridadParaFaltantes } from "@/dominio/pedidos/tablero";
import { formatearCantidad, formatearPorcentaje, type UnidadMedida } from "@/dominio/dinero/formato";
import type { FechaISO } from "@/dominio/fechas/fechas";
import { compradoPorProducto, productosTildados } from "@/modulos/compras/lista-compra";
import { registrarActividad } from "@/modulos/colaboracion/registro";
import { ejecutarComoUsuario, type ContextoUsuario } from "@/modulos/seguridad/contexto";
import { id, numeroObligatorio, textoOpcional, validar } from "@/modulos/validacion";

import { PATRON_FECHA, configuracionEmpresa, entregaBloqueada, unico, exigirJornadaAbierta, jornadaDeFecha, moverPedidosDeEntrega, numeroEntrega, numeroReparto } from "./comun";
import { documentosAlDia, emitirDocumentosEntrega, lineasOperativas, reemitirSiCorresponde, type ResultadoEmision } from "./documentos";

// Preparación de la mercadería (04 §5.e): RN-111 a RN-119. Ninguna función de este archivo lee
// precios, costos ni importes (RN-119).

const ESTADOS_PEDIDO_A_PREPARAR = ["CONFIRMADO", "EN_COMPRA", "EN_PREPARACION", "PREPARADO"] as const;
const EDITABLES = ["BORRADOR", "EN_PREPARACION", "PREPARADA"] as const;
const MOTIVOS_FALTANTE = ["NO_CONSEGUIDO", "FALTANTE", "RECHAZO_CALIDAD", "ERROR_PREPARACION", "CAMBIO_CLIENTE", "OTRO"] as const;

/**
 * RN-111: una entrega por cliente + punto de entrega con pedidos confirmados; cada línea referencia
 * su línea de pedido. Se puede volver a correr: suma lo que llegó tarde (pedido tardío) y actualiza
 * lo pedido en las líneas que todavía no se prepararon.
 */
async function sincronizarEntregas(tx: Transaccion, c: ContextoUsuario, jornadaId: string, soloPedidos: ReadonlySet<string> | null = null): Promise<{ entregasNuevas: number; lineasNuevas: number }> {
  const aPreparar = and(eq(pedido.jornadaId, jornadaId), inArray(pedido.estado, [...ESTADOS_PEDIDO_A_PREPARAR]));
  // Todo lo que hay que mirar sale junto (una ida a la base).
  const [vivos, entregas, existentes, notas] = await Promise.all([
    tx
      .select({
        itemId: pedidoItem.id,
        productoId: pedidoItem.productoId,
        cantidadBase: pedidoItem.cantidadBase,
        presentacionId: pedidoItem.presentacionId,
        observacionesItem: pedidoItem.observaciones,
        pedidoId: pedido.id,
        clienteId: pedido.clienteId,
        puntoEntregaId: pedido.puntoEntregaId,
        producto: producto.nombre,
        unidad: producto.unidadBase,
        factor: presentacion.factorABase,
      })
      .from(pedidoItem)
      .innerJoin(pedido, eq(pedido.id, pedidoItem.pedidoId))
      .innerJoin(producto, eq(producto.id, pedidoItem.productoId))
      .leftJoin(presentacion, eq(presentacion.id, pedidoItem.presentacionId))
      .where(and(aPreparar, eq(pedidoItem.cancelado, false)))
      .orderBy(asc(pedido.numero), asc(pedidoItem.linea)),
    tx
      .select({ id: entrega.id, clienteId: entrega.clienteId, puntoEntregaId: entrega.puntoEntregaId, estado: entrega.estado, observaciones: entrega.observaciones, referenciaCliente: entrega.referenciaCliente })
      .from(entrega)
      .where(and(eq(entrega.jornadaId, jornadaId), ne(entrega.estado, "ANULADA"))),
    tx
      .select({ id: entregaItem.id, entregaId: entregaItem.entregaId, linea: entregaItem.linea, pedidoItemId: entregaItem.pedidoItemId, esSustitucion: entregaItem.esSustitucion, pedida: entregaItem.cantidadPedida, preparada: entregaItem.cantidadPreparada })
      .from(entregaItem)
      .innerJoin(entrega, and(eq(entrega.id, entregaItem.entregaId), ne(entrega.estado, "ANULADA")))
      .where(eq(entrega.jornadaId, jornadaId)),
    // Observaciones y orden de compra de los pedidos que se preparan.
    tx
      .select({ clienteId: pedido.clienteId, puntoEntregaId: pedido.puntoEntregaId, observaciones: pedido.observaciones, referencia: pedido.referenciaCliente })
      .from(pedido)
      .where(aPreparar)
      .orderBy(asc(pedido.numero)),
  ]);
  const esEditable = (e: { estado: string }) => (EDITABLES as readonly string[]).includes(e.estado);
  const unir = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => Boolean(x?.trim())))].join(" · ") || null;
  const notasDe = (e: { clienteId: string; puntoEntregaId: string }) => {
    const suyas = notas.filter((n) => n.clienteId === e.clienteId && n.puntoEntregaId === e.puntoEntregaId);
    return { observaciones: unir(suyas.map((n) => n.observaciones)), referenciaCliente: unir(suyas.map((n) => n.referencia)) };
  };

  const yaEsta = new Map(existentes.filter((x) => !x.esSustitucion && x.pedidoItemId).map((x) => [x.pedidoItemId!, x]));
  const ultimaLinea = new Map<string, number>();
  for (const x of existentes) ultimaLinea.set(x.entregaId, Math.max(ultimaLinea.get(x.entregaId) ?? 0, x.linea));
  type EntregaAbierta = (typeof entregas)[number] & { nueva?: true };
  const abiertas: EntregaAbierta[] = [...entregas];
  const entregasNuevas: EntregaAbierta[] = [];
  const lineasNuevas: (typeof entregaItem.$inferInsert)[] = [];
  const cambios: PromiseLike<unknown>[] = [];
  const vuelvenAPrepararse = new Set<string>();
  for (const v of vivos) {
    const ya = yaEsta.get(v.itemId);
    if (ya) {
      // Lo pedido cambió y la línea todavía no se preparó: se actualiza.
      if (ya.preparada === null && !dec(ya.pedida).eq(v.cantidadBase)) cambios.push(tx.update(entregaItem).set({ cantidadPedida: v.cantidadBase }).where(eq(entregaItem.id, ya.id)));
      continue;
    }
    // Al preparar un solo pedido (desde su tarjeta del tablero), los demás no se tocan.
    if (soloPedidos && !soloPedidos.has(v.pedidoId)) continue;
    // Si al cliente ya le salió (o se le entregó) lo de ese día, lo que pide después va en otra entrega.
    let e = abiertas.find((x) => x.clienteId === v.clienteId && x.puntoEntregaId === v.puntoEntregaId && esEditable(x));
    if (!e) {
      e = { id: randomUUID(), clienteId: v.clienteId, puntoEntregaId: v.puntoEntregaId, estado: "BORRADOR", observaciones: null, referenciaCliente: null, nueva: true };
      abiertas.push(e);
      entregasNuevas.push(e);
    }
    const linea = (ultimaLinea.get(e.id) ?? 0) + 1;
    ultimaLinea.set(e.id, linea);
    lineasNuevas.push({
      empresaId: c.empresaId,
      entregaId: e.id,
      linea,
      pedidoItemId: v.itemId,
      productoId: v.productoId,
      presentacionId: v.presentacionId,
      factorABase: v.factor,
      productoNombre: v.producto,
      unidadBase: v.unidad,
      cantidadPedida: v.cantidadBase,
      observaciones: v.observacionesItem,
      creadoPor: c.usuarioId,
      actualizadoPor: c.usuarioId,
    });
    // Una entrega que ya estaba preparada vuelve a quedar en preparación hasta separar lo nuevo.
    if (e.estado === "PREPARADA") {
      vuelvenAPrepararse.add(e.id);
      e.estado = "EN_PREPARACION";
    }
  }
  // Líneas cuyo pedido se canceló o cuya línea se quitó: si no se prepararon, quedan en 0.
  const vivosIds = new Set(vivos.map((v) => v.itemId));
  for (const x of existentes) {
    if (!x.esSustitucion && x.pedidoItemId && !vivosIds.has(x.pedidoItemId) && x.preparada === null && !dec(x.pedida).isZero()) {
      cambios.push(tx.update(entregaItem).set({ cantidadPedida: "0" }).where(eq(entregaItem.id, x.id)));
    }
  }
  // Observaciones y orden de compra de los pedidos incluidos (solo si cambiaron).
  for (const e of abiertas.filter((x) => !x.nueva && esEditable(x))) {
    const n = notasDe(e);
    const vuelve = vuelvenAPrepararse.has(e.id);
    if (vuelve || n.observaciones !== e.observaciones || n.referenciaCliente !== e.referenciaCliente) {
      cambios.push(tx.update(entrega).set({ ...n, ...(vuelve ? { estado: "EN_PREPARACION" as const, actualizadoPor: c.usuarioId } : {}) }).where(eq(entrega.id, e.id)));
    }
  }
  // Cada entrega nueva toma su número (salen juntos y en orden) y después se guarda todo de una vez:
  // primero las entregas, después sus líneas.
  const numeros = await Promise.all(entregasNuevas.map(() => siguienteNumero(tx, "ENTREGA")));
  await Promise.all([
    ...(entregasNuevas.length
      ? [tx.insert(entrega).values(entregasNuevas.map((e, n) => ({ id: e.id, empresaId: c.empresaId, numero: numeros[n]!.numero, jornadaId, clienteId: e.clienteId, puntoEntregaId: e.puntoEntregaId, ...notasDe(e), creadoPor: c.usuarioId, actualizadoPor: c.usuarioId })))]
      : []),
    ...(lineasNuevas.length ? [tx.insert(entregaItem).values(lineasNuevas)] : []),
    ...cambios,
  ]);
  return { entregasNuevas: entregasNuevas.length, lineasNuevas: lineasNuevas.length };
}

/**
 * Cantidad propuesta de cada línea (04 §5.e paso 2): lo pedido si alcanza lo comprado; si no, el
 * reparto de faltantes (RN-115). Si en la jornada no se registró ninguna compra no hay con qué
 * comparar y se propone lo pedido; lo mismo con los productos tildados a mano como comprados.
 */
async function recalcularPropuestas(tx: Transaccion, jornadaId: string): Promise<void> {
  const [empresa, filasCompras, comprado, tildados, lineas] = await Promise.all([
    configuracionEmpresa(tx),
    tx.select({ compras: count() }).from(compra).where(and(eq(compra.jornadaId, jornadaId), eq(compra.estado, "REGISTRADA"))),
    compradoPorProducto(tx, jornadaId),
    productosTildados(tx, jornadaId),
    tx
      .select({
        id: entregaItem.id,
        productoId: entregaItem.productoId,
        pedida: entregaItem.cantidadPedida,
        propuesta: entregaItem.cantidadPropuesta,
        prioridad: cliente.prioridadFaltantes,
        prioridadPedido: pedido.prioridad,
        orden: entrega.numero,
        admiteFraccion: producto.admiteFraccion,
      })
      .from(entregaItem)
      .innerJoin(entrega, and(eq(entrega.id, entregaItem.entregaId), ne(entrega.estado, "ANULADA")))
      .innerJoin(cliente, eq(cliente.id, entrega.clienteId))
      .innerJoin(producto, eq(producto.id, entregaItem.productoId))
      .leftJoin(pedidoItem, eq(pedidoItem.id, entregaItem.pedidoItemId))
      .leftJoin(pedido, eq(pedido.id, pedidoItem.pedidoId))
      .where(and(eq(entrega.jornadaId, jornadaId), eq(entregaItem.esSustitucion, false))),
  ]);
  const { compras } = unico(filasCompras);
  const porProducto = new Map<string, typeof lineas>();
  for (const l of lineas) porProducto.set(l.productoId, [...(porProducto.get(l.productoId) ?? []), l]);
  const cambios: PromiseLike<unknown>[] = [];
  for (const [productoId, grupo] of porProducto) {
    const propuesta =
      Number(compras) === 0 || tildados.has(productoId)
        ? new Map(grupo.map((l) => [l.id, dec(l.pedida)]))
        : distribuirFaltante(
            comprado.get(productoId) ?? "0",
            // Primero los pedidos de prioridad alta; dentro de cada grupo, la prioridad del cliente.
            grupo.map((l) => ({ id: l.id, pedida: l.pedida, prioridad: prioridadParaFaltantes(l.prioridad, l.prioridadPedido ?? "NORMAL"), orden: l.orden })),
            { paso: pasoDeReparto(grupo[0]!.admiteFraccion), politica: empresa.politicaFaltantes },
          );
    for (const l of grupo) {
      const nueva = propuesta ? propuesta.get(l.id)!.toFixed(3) : null;
      if (nueva !== l.propuesta) cambios.push(tx.update(entregaItem).set({ cantidadPropuesta: nueva }).where(eq(entregaItem.id, l.id)));
    }
  }
  // Las que cambiaron se guardan juntas (una ida).
  await Promise.all(cambios);
}

/**
 * "Iniciar preparación" (P-46, RN-038, RN-111): crea las entregas y propone las cantidades; la
 * jornada pasa a PREPARANDO. Volver a correrlo suma los pedidos que llegaron tarde (si al cliente
 * ya le salió lo suyo, en una entrega nueva). Con `pedidoIds` se preparan solo esos pedidos (al
 * pasar una tarjeta a Preparando en el tablero).
 */
export async function iniciarPreparacion(
  db: BaseDatos,
  authUserId: string,
  fecha: FechaISO,
  opciones: { pedidoIds?: readonly string[] } = {},
): Promise<{ entregasNuevas: number; lineasNuevas: number; borradores: number }> {
  return ejecutarComoUsuario(db, authUserId, "preparacion.registrar", async (tx, c) => {
    if (!PATRON_FECHA.test(fecha)) throw new ErrorDeNegocio("VALIDACION", "Elegí el día de entrega.");
    // El día queda bloqueado hasta terminar: dos personas no arman las entregas a la vez.
    const [j] = await tx.select().from(jornada).where(eq(jornada.fecha, fecha)).for("update");
    if (!j) throw new ErrorDeNegocio("VALIDACION", "No hay pedidos para ese día.");
    exigirJornadaAbierta(j);
    const r = await sincronizarEntregas(tx, c, j.id, opciones.pedidoIds ? new Set(opciones.pedidoIds) : null);
    await recalcularPropuestas(tx, j.id);
    const empieza = j.estado === "ABIERTA" || j.estado === "COMPRANDO";
    const [filasBorradores] = await Promise.all([
      tx.select({ borradores: count() }).from(pedido).where(and(eq(pedido.jornadaId, j.id), eq(pedido.estado, "BORRADOR"))),
      empieza ? tx.update(jornada).set({ estado: "PREPARANDO", preparacionIniciadaEn: sql`now()`, actualizadoPor: c.usuarioId }).where(eq(jornada.id, j.id)) : null,
      empieza || r.entregasNuevas > 0
        ? registrarActividad(tx, c, { accion: "PREPARAR", entidadTipo: "JORNADA", entidadId: j.id, jornadaId: j.id, resumen: `empezó a preparar los pedidos del ${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`, paraUsuarioId: c.responsables.preparando ?? null })
        : null,
    ]);
    return { ...r, borradores: Number(unico(filasBorradores).borradores) };
  });
}

export interface EntregaEnPreparacion {
  id: string;
  numero: string;
  cliente: string;
  punto: string;
  horario: string | null;
  reparto: string | null;
  orden: number | null;
  estado: string;
  lineas: number;
  preparadas: number;
  faltantes: number;
  sustituciones: number;
  bultos: number | null;
  documentosPendientes: boolean;
  /** El remito (lista de entrega) de la versión vigente ya está hecho. */
  remito: boolean;
  /** Lo que hay que separar para el cliente, con lo ya separado tildado y lo que faltó y por qué. */
  detalle: { id: string; producto: string; grupo: string | null; cantidad: string; hecha: boolean; aviso: string | null; reemplazo: boolean }[];
}

export interface ProductoEnPreparacion {
  productoId: string;
  producto: string;
  unidad: string;
  comprado: string;
  necesidad: string;
  propuesto: string;
  preparado: string;
  /** Comprado − (preparado o, si falta, propuesto). Negativo = falta mercadería. */
  sobrante: string;
  lineas: number;
  sinPreparar: number;
}

const horario = (desde: string | null, hasta: string | null) => (desde || hasta ? `${desde?.slice(0, 5) ?? "?"}–${hasta?.slice(0, 5) ?? "?"}` : null);

/** P-70: la preparación del día por cliente y por producto, sin precios. */
export async function obtenerPreparacion(
  db: BaseDatos,
  authUserId: string,
  fecha: FechaISO,
): Promise<{ jornada: { id: string; estado: string } | null; hayCompras: boolean; entregas: EntregaEnPreparacion[]; productos: ProductoEnPreparacion[]; pedidosSinEntrega: number }> {
  return ejecutarComoUsuario(db, authUserId, "preparacion.ver", async (tx) => {
    const j = await jornadaDeFecha(tx, fecha);
    if (!j) return { jornada: null, hayCompras: false, entregas: [], productos: [], pedidosSinEntrega: 0 };
    const delDia = and(eq(entrega.jornadaId, j.id), ne(entrega.estado, "ANULADA"));
    // Todo lo del día sale junto (una ida a la base).
    const [empresa, filas, items, emitidos, comprado, filasCompras, filasSinEntrega] = await Promise.all([
      configuracionEmpresa(tx),
      tx
        .select({
          id: entrega.id,
          numero: entrega.numero,
          cliente: cliente.nombre,
          punto: puntoEntrega.nombre,
          desde: puntoEntrega.horarioDesde,
          hasta: puntoEntrega.horarioHasta,
          reparto: reparto.numero,
          orden: entrega.ordenEnReparto,
          estado: entrega.estado,
          version: entrega.version,
          bultos: entrega.cantidadBultos,
        })
        .from(entrega)
        .innerJoin(cliente, eq(cliente.id, entrega.clienteId))
        .innerJoin(puntoEntrega, eq(puntoEntrega.id, entrega.puntoEntregaId))
        .leftJoin(reparto, eq(reparto.id, entrega.repartoId))
        .where(delDia)
        .orderBy(sql`${reparto.numero} nulls last`, sql`${entrega.ordenEnReparto} nulls last`, sql`${puntoEntrega.horarioDesde} nulls last`, asc(cliente.nombre)),
      tx
        .select({
          id: entregaItem.id,
          entregaId: entregaItem.entregaId,
          productoId: entregaItem.productoId,
          producto: entregaItem.productoNombre,
          unidad: entregaItem.unidadBase,
          esSustitucion: entregaItem.esSustitucion,
          pedida: entregaItem.cantidadPedida,
          propuesta: entregaItem.cantidadPropuesta,
          preparada: entregaItem.cantidadPreparada,
          motivo: entregaItem.motivoFaltante,
          grupo: categoria.grupo,
        })
        .from(entregaItem)
        .innerJoin(entrega, eq(entrega.id, entregaItem.entregaId))
        .innerJoin(producto, eq(producto.id, entregaItem.productoId))
        .leftJoin(categoria, eq(categoria.id, producto.categoriaId))
        .where(delDia)
        .orderBy(asc(entregaItem.linea)),
      // Los remitos ya hechos de las entregas del día (para saber cuáles están al día).
      tx
        .select({ entregaId: documentoEmitido.entregaId, version: documentoEmitido.version })
        .from(documentoEmitido)
        .innerJoin(entrega, eq(entrega.id, documentoEmitido.entregaId))
        .where(and(delDia, eq(documentoEmitido.tipo, "DOC_02"), eq(documentoEmitido.evento, "EMISION"))),
      compradoPorProducto(tx, j.id),
      tx.select({ compras: count() }).from(compra).where(and(eq(compra.jornadaId, j.id), eq(compra.estado, "REGISTRADA"))),
      tx
        .select({ sinEntrega: count() })
        .from(pedido)
        .where(
          and(
            eq(pedido.jornadaId, j.id),
            inArray(pedido.estado, ["CONFIRMADO", "EN_COMPRA"]),
            sql`not exists (select 1 from ${pedidoItem} pi join ${entregaItem} ei on ei.pedido_item_id = pi.id join ${entrega} e on e.id = ei.entrega_id and e.estado <> 'ANULADA' where pi.pedido_id = pedido.id)`,
          ),
        ),
    ]);
    const hechos = new Set(emitidos.map((d) => `${d.entregaId}:${d.version}`));
    const alDia = new Set(filas.filter((f) => f.version > 0 && hechos.has(`${f.id}:${f.version}`)).map((f) => f.id));
    const entregas: EntregaEnPreparacion[] = [];
    for (const f of filas) {
      const propias = items.filter((i) => i.entregaId === f.id);
      entregas.push({
        id: f.id,
        numero: numeroEntrega(f.numero),
        cliente: f.cliente,
        punto: f.punto,
        horario: horario(f.desde, f.hasta),
        reparto: f.reparto !== null ? numeroReparto(f.reparto) : null,
        orden: f.orden,
        estado: f.estado,
        lineas: propias.length,
        preparadas: propias.filter((i) => i.preparada !== null).length,
        faltantes: propias.filter((i) => !i.esSustitucion && dec(i.preparada ?? i.propuesta ?? i.pedida).lt(i.pedida) && evaluarPreparado(i.pedida, i.preparada ?? i.propuesta ?? i.pedida, empresa.toleranciaPesoPct).menor).length,
        sustituciones: propias.filter((i) => i.esSustitucion).length,
        bultos: f.bultos,
        documentosPendientes: f.estado === "PREPARADA" && !alDia.has(f.id),
        remito: alDia.has(f.id),
        detalle: propias.map((i) => ({
          id: i.id,
          producto: i.producto,
          grupo: i.grupo,
          cantidad: formatearCantidad(i.esSustitucion ? (i.preparada ?? i.pedida) : i.pedida, i.unidad as UnidadMedida),
          hecha: i.preparada !== null,
          aviso: i.esSustitucion ? null : avisoDeFaltante({ ...i, unidad: i.unidad as UnidadMedida }),
          reemplazo: i.esSustitucion,
        })),
      });
    }
    const { compras } = unico(filasCompras);
    const porProducto = new Map<string, typeof items>();
    for (const i of items) porProducto.set(i.productoId, [...(porProducto.get(i.productoId) ?? []), i]);
    const productos = [...porProducto.entries()]
      .map(([productoId, ls]): ProductoEnPreparacion => {
        const preparado = sumar(ls.map((l) => l.preparada ?? "0"));
        const c = comprado.get(productoId) ?? "0";
        return {
          productoId,
          producto: ls[0]!.producto,
          unidad: ls[0]!.unidad,
          comprado: c,
          necesidad: sumar(ls.map((l) => l.pedida)).toString(),
          propuesto: sumar(ls.map((l) => l.propuesta ?? l.pedida)).toString(),
          preparado: preparado.toString(),
          // Lo que quedaría: lo ya preparado y, en lo que falta, lo propuesto.
          sobrante: dec(c).minus(sumar(ls.map((l) => l.preparada ?? l.propuesta ?? l.pedida))).toString(),
          lineas: ls.length,
          sinPreparar: ls.filter((l) => l.preparada === null).length,
        };
      })
      .sort((a, b) => a.producto.localeCompare(b.producto, "es"));
    return { jornada: { id: j.id, estado: j.estado }, hayCompras: Number(compras) > 0, entregas, productos, pedidosSinEntrega: Number(unico(filasSinEntrega).sinEntrega) };
  });
}

export interface LineaAPreparar {
  id: string;
  producto: string;
  productoId: string;
  unidad: string;
  pedida: string;
  pedidaEnPresentacion: string | null;
  propuesta: string | null;
  preparada: string | null;
  motivoFaltante: MotivoDiferencia | null;
  esSustitucion: boolean;
  reemplazaA: string | null;
  observaciones: string | null;
  /** Diferencia con lo pedido y si está dentro de la tolerancia (RN-113). */
  evaluacion: { diferenciaPct: string | null; dentro: boolean; menor: boolean } | null;
}

/** P-71: una entrega para preparar, sin precios. */
export async function obtenerEntregaParaPreparar(db: BaseDatos, authUserId: string, entregaId: string) {
  return ejecutarComoUsuario(db, authUserId, "preparacion.ver", async (tx) => {
    const [f] = await tx
      .select({
        e: entrega,
        cliente: cliente.nombre,
        aceptaSustituciones: cliente.aceptaSustituciones,
        punto: puntoEntrega.nombre,
        desde: puntoEntrega.horarioDesde,
        hasta: puntoEntrega.horarioHasta,
        instrucciones: puntoEntrega.instruccionesEntrega,
        fecha: jornada.fecha,
        reparto: reparto.numero,
      })
      .from(entrega)
      .innerJoin(cliente, eq(cliente.id, entrega.clienteId))
      .innerJoin(puntoEntrega, eq(puntoEntrega.id, entrega.puntoEntregaId))
      .innerJoin(jornada, eq(jornada.id, entrega.jornadaId))
      .leftJoin(reparto, eq(reparto.id, entrega.repartoId))
      .where(eq(entrega.id, entregaId));
    if (!f) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró la entrega.");
    const empresa = await configuracionEmpresa(tx);
    const alDia = await documentosAlDia(tx, f.e.id, f.e.version);
    const lineas: LineaAPreparar[] = (await lineasOperativas(tx, entregaId)).map((l) => {
      const n = l.factor && l.presentacion && dec(l.factor).gt(1) ? dec(l.cantidadPedida).div(l.factor) : null;
      const ev = l.cantidadPreparada !== null ? evaluarPreparado(l.cantidadPedida, l.cantidadPreparada, empresa.toleranciaPesoPct) : null;
      return {
        id: l.id,
        producto: l.producto,
        productoId: l.productoId,
        unidad: l.unidad,
        pedida: l.cantidadPedida,
        pedidaEnPresentacion: n && n.isInteger() && n.gt(0) ? `${n.toString()} × ${l.presentacion}` : null,
        propuesta: l.cantidadPropuesta,
        preparada: l.cantidadPreparada,
        motivoFaltante: l.motivoFaltante,
        esSustitucion: l.esSustitucion,
        reemplazaA: l.reemplazaA,
        observaciones: l.observaciones,
        evaluacion: ev ? { diferenciaPct: ev.diferenciaPct?.toString() ?? null, dentro: ev.dentro, menor: ev.menor } : null,
      };
    });
    return {
      id: f.e.id,
      numero: numeroEntrega(f.e.numero),
      fecha: f.fecha,
      estado: f.e.estado,
      cliente: f.cliente,
      aceptaSustituciones: f.aceptaSustituciones,
      punto: f.punto,
      horario: horario(f.desde, f.hasta),
      instrucciones: f.instrucciones,
      observaciones: f.e.observaciones,
      reparto: f.reparto !== null ? numeroReparto(f.reparto) : null,
      orden: f.e.ordenEnReparto,
      bultos: f.e.cantidadBultos,
      tolerancia: empresa.toleranciaPesoPct,
      documentosPendientes: f.e.estado === "PREPARADA" && !alDia,
      remito: alDia,
      lineas,
    };
  });
}

const esquemaPreparado = z.object({
  itemId: id(),
  cantidad: numeroObligatorio("Escribí cuánto se preparó (0 si no hay).").refine((v) => dec(v).gte(0), { message: "La cantidad no puede ser negativa." }),
  motivo: z
    .enum(MOTIVOS_FALTANTE)
    .nullish()
    .transform((v) => v ?? null),
  confirmar: z.boolean().default(false),
});

/** La línea con su entrega (bloqueada hasta el final) y su día, en una sola consulta. */
async function itemEditable(tx: Transaccion, itemId: string) {
  const [f] = await tx
    .select({ i: entregaItem, e: entrega, j: jornada })
    .from(entregaItem)
    .innerJoin(entrega, eq(entrega.id, entregaItem.entregaId))
    .innerJoin(jornada, eq(jornada.id, entrega.jornadaId))
    .where(eq(entregaItem.id, itemId))
    .for("update", { of: entrega });
  if (!f) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró la línea.");
  if (!(EDITABLES as readonly string[]).includes(f.e.estado)) throw new ErrorDeNegocio("VALIDACION", "La entrega ya salió o se entregó: se corrige desde el detalle de la entrega.");
  exigirJornadaAbierta(f.j);
  return f;
}

/** Al empezar a cargar, la entrega y sus pedidos pasan a EN_PREPARACION. */
async function abrirSiHaceFalta(tx: Transaccion, c: ContextoUsuario, e: { id: string; estado: string }) {
  if (e.estado !== "BORRADOR") return;
  await Promise.all([
    tx.update(entrega).set({ estado: "EN_PREPARACION", actualizadoPor: c.usuarioId }).where(eq(entrega.id, e.id)),
    moverPedidosDeEntrega(tx, e.id, ["CONFIRMADO", "EN_COMPRA"], "EN_PREPARACION"),
  ]);
}

/**
 * Cantidad preparada de una línea (RN-112, RN-113, RN-114). Fuera de la tolerancia: si falta
 * mercadería pide el motivo; si sobra, pide confirmar. Si se prepara más de lo comprado, también.
 */
export async function registrarPreparado(db: BaseDatos, authUserId: string, datos: z.input<typeof esquemaPreparado>): Promise<{ reemision: ResultadoEmision | null }> {
  const d = validar(esquemaPreparado, datos);
  return ejecutarComoUsuario(db, authUserId, "preparacion.registrar", async (tx, c) => {
    const { i, e, j } = await itemEditable(tx, d.itemId);
    const [empresa, comprados, tildados, filasTotal] = await Promise.all([
      configuracionEmpresa(tx),
      compradoPorProducto(tx, j.id),
      productosTildados(tx, j.id),
      tx
        .select({ total: sql<string>`coalesce(sum(${entregaItem.cantidadPreparada}), 0)` })
        .from(entregaItem)
        .innerJoin(entrega, and(eq(entrega.id, entregaItem.entregaId), ne(entrega.estado, "ANULADA")))
        .where(and(eq(entrega.jornadaId, j.id), eq(entregaItem.productoId, i.productoId), ne(entregaItem.id, i.id))),
    ]);
    const ev = evaluarPreparado(i.cantidadPedida, d.cantidad, empresa.toleranciaPesoPct);
    if (ev.menor && !d.motivo) throw new ErrorDeNegocio("VALIDACION", `Falta mercadería de ${i.productoNombre}: elegí el motivo (no se consiguió, faltante…).`);
    if (!ev.dentro && !ev.menor && !d.confirmar) {
      throw new ErrorDeNegocio("VALIDACION", `${i.productoNombre}: se preparó ${formatearPorcentaje(ev.diferenciaPct!, 1)} más de lo pedido. Si está bien, tocá "Confirmar".`, { requiereConfirmacion: true });
    }
    const comprado = dec(comprados.get(i.productoId) ?? "0");
    if (comprado.gt(0) && !d.confirmar && !tildados.has(i.productoId)) {
      const { total } = unico(filasTotal);
      if (dec(total).plus(d.cantidad).gt(comprado)) {
        throw new ErrorDeNegocio(
          "VALIDACION",
          `De ${i.productoNombre} se compraron ${formatearCantidad(comprado, i.unidadBase as UnidadMedida)} y con esto se prepararían ${formatearCantidad(dec(total).plus(d.cantidad), i.unidadBase as UnidadMedida)}. ¿Está bien el peso? Si es así, tocá "Confirmar" (RN-114).`,
          { requiereConfirmacion: true },
        );
      }
    }
    await Promise.all([
      tx
        .update(entregaItem)
        .set({ cantidadPreparada: d.cantidad, motivoFaltante: ev.dentro || !ev.menor ? null : d.motivo, actualizadoPor: c.usuarioId })
        .where(eq(entregaItem.id, i.id)),
      abrirSiHaceFalta(tx, c, e),
    ]);
    return { reemision: e.estado === "PREPARADA" ? await reemitirSiCorresponde(tx, c, e.id) : null };
  });
}

/**
 * El tilde de un producto (en la tarjeta del tablero, en la tarjeta abierta o en la pantalla de
 * preparación): queda separado con la cantidad propuesta (lo pedido si alcanzó), o vuelve a quedar
 * sin separar. Para anotar que falta algo y por qué está el detalle de la preparación.
 */
export async function separarLinea(db: BaseDatos, authUserId: string, datos: { itemId: string; separado: boolean }): Promise<void> {
  await ejecutarComoUsuario(db, authUserId, "preparacion.registrar", async (tx, c) => {
    const { i, e } = await itemEditable(tx, datos.itemId);
    const cantidad = i.cantidadPropuesta ?? i.cantidadPedida;
    // La línea y el estado de la entrega se guardan juntos (una ida a la base).
    await Promise.all([
      tx
        .update(entregaItem)
        .set(
          datos.separado
            ? { cantidadPreparada: cantidad, motivoFaltante: dec(cantidad).lt(i.cantidadPedida) ? "FALTANTE" : null, actualizadoPor: c.usuarioId }
            : { cantidadPreparada: null, motivoFaltante: null, actualizadoPor: c.usuarioId },
        )
        .where(eq(entregaItem.id, i.id)),
      datos.separado
        ? abrirSiHaceFalta(tx, c, e)
        : e.estado === "PREPARADA"
          ? // Ya estaba marcada como preparada: vuelve a quedar en preparación hasta completarla.
            tx.update(entrega).set({ estado: "EN_PREPARACION", actualizadoPor: c.usuarioId }).where(eq(entrega.id, e.id))
          : null,
    ]);
    if (datos.separado && e.estado === "PREPARADA") await reemitirSiCorresponde(tx, c, e.id);
  });
}

/** "= pedido" en todas las líneas sin cargar: la cantidad propuesta (lo pedido si alcanzó). */
export async function prepararTodoComoPropuesto(db: BaseDatos, authUserId: string, entregaId: string): Promise<number> {
  return ejecutarComoUsuario(db, authUserId, "preparacion.registrar", async (tx, c) => {
    const e = await entregaBloqueada(tx, entregaId);
    if (!(EDITABLES as readonly string[]).includes(e.estado)) throw new ErrorDeNegocio("VALIDACION", "La entrega ya salió.");
    const pendientes = await tx
      .select()
      .from(entregaItem)
      .where(and(eq(entregaItem.entregaId, entregaId), sql`${entregaItem.cantidadPreparada} is null`));
    await Promise.all([
      ...pendientes.map((l) => {
        const cantidad = l.cantidadPropuesta ?? l.cantidadPedida;
        // Si la propuesta es menor (faltante repartido), queda con motivo FALTANTE hasta que se corrija.
        const menor = dec(cantidad).lt(l.cantidadPedida);
        return tx
          .update(entregaItem)
          .set({ cantidadPreparada: cantidad, motivoFaltante: menor ? "FALTANTE" : null, actualizadoPor: c.usuarioId })
          .where(eq(entregaItem.id, l.id));
      }),
      abrirSiHaceFalta(tx, c, e),
    ]);
    if (e.estado === "PREPARADA") await reemitirSiCorresponde(tx, c, e.id);
    return pendientes.length;
  });
}

const esquemaSustitucion = z.object({
  itemId: id(),
  productoId: z.uuid("Elegí el producto que va en reemplazo."),
  cantidad: numeroObligatorio("Escribí cuánto se lleva del reemplazo.").refine((v) => dec(v).gt(0), { message: "La cantidad tiene que ser mayor que 0." }),
  autorizadoPor: textoOpcional(160),
});

/** Sustitución (04 §5.e.2, RN-117): línea nueva "en reemplazo de…" con su propio precio al emitir. */
export async function sustituirProducto(db: BaseDatos, authUserId: string, datos: z.input<typeof esquemaSustitucion>): Promise<void> {
  const d = validar(esquemaSustitucion, datos);
  await ejecutarComoUsuario(db, authUserId, "preparacion.registrar", async (tx, c) => {
    const { i, e } = await itemEditable(tx, d.itemId);
    if (i.esSustitucion) throw new ErrorDeNegocio("VALIDACION", "Elegí la línea original, no la del reemplazo.");
    if (d.productoId === i.productoId) throw new ErrorDeNegocio("VALIDACION", "El reemplazo tiene que ser otro producto.");
    const [cli] = await tx.select({ acepta: cliente.aceptaSustituciones }).from(cliente).where(eq(cliente.id, e.clienteId));
    if (!cli!.acepta && (d.autorizadoPor?.length ?? 0) < 3) {
      throw new ErrorDeNegocio("VALIDACION", "Este cliente no acepta reemplazos: anotá quién lo autorizó y por qué medio (ej. jefe de cocina por WhatsApp).");
    }
    const [p] = await tx.select({ nombre: producto.nombre, unidad: producto.unidadBase, activo: producto.activo }).from(producto).where(eq(producto.id, d.productoId));
    if (!p?.activo) throw new ErrorDeNegocio("VALIDACION", "El producto de reemplazo no existe o está desactivado.");
    const [ultima] = await tx.select({ n: max(entregaItem.linea) }).from(entregaItem).where(eq(entregaItem.entregaId, e.id));
    await tx.insert(entregaItem).values({
      empresaId: c.empresaId,
      entregaId: e.id,
      linea: (ultima?.n ?? 0) + 1,
      pedidoItemId: i.pedidoItemId,
      productoId: d.productoId,
      esSustitucion: true,
      sustituyeProductoId: i.productoId,
      sustitucionAutorizadaPor: d.autorizadoPor,
      productoNombre: p.nombre,
      unidadBase: p.unidad,
      cantidadPedida: "0",
      cantidadPreparada: d.cantidad,
      creadoPor: c.usuarioId,
      actualizadoPor: c.usuarioId,
    });
    await abrirSiHaceFalta(tx, c, e);
    if (e.estado === "PREPARADA") await reemitirSiCorresponde(tx, c, e.id);
  });
}

/**
 * "Marcar PREPARADA" (RN-118): todas las líneas con cantidad. Los pedidos pasan a PREPARADO y, si
 * la empresa lo tiene así, se emiten DOC-02 y DOC-03. Si falta un precio la entrega queda
 * preparada igual, con los documentos pendientes para el administrador.
 */
export async function marcarPreparada(db: BaseDatos, authUserId: string, datos: { entregaId: string; bultos?: string | null }): Promise<{ documentos: ResultadoEmision | null }> {
  const bultos = datos.bultos?.trim() ? Number(datos.bultos) : null;
  if (bultos !== null && (!Number.isInteger(bultos) || bultos < 0 || bultos > 999)) throw new ErrorDeNegocio("VALIDACION", "Los bultos son un número entero.");
  return ejecutarComoUsuario(db, authUserId, "preparacion.registrar", async (tx, c) => {
    const e = await entregaBloqueada(tx, datos.entregaId);
    if (!(EDITABLES as readonly string[]).includes(e.estado)) throw new ErrorDeNegocio("VALIDACION", "La entrega ya salió.");
    const [filasFaltan, [cli], empresa] = await Promise.all([
      tx
        .select({ faltan: count() })
        .from(entregaItem)
        .where(and(eq(entregaItem.entregaId, e.id), sql`${entregaItem.cantidadPreparada} is null`)),
      tx.select({ nombre: cliente.nombre }).from(cliente).where(eq(cliente.id, e.clienteId)),
      configuracionEmpresa(tx),
    ]);
    const { faltan } = unico(filasFaltan);
    if (Number(faltan) > 0) throw new ErrorDeNegocio("VALIDACION", `Faltan cargar ${faltan} ${Number(faltan) === 1 ? "línea" : "líneas"} (0 si no hay).`);
    const yaEstaba = e.estado === "PREPARADA";
    await Promise.all([
      tx.update(entrega).set({ estado: "PREPARADA", cantidadBultos: bultos ?? e.cantidadBultos, actualizadoPor: c.usuarioId }).where(eq(entrega.id, e.id)),
      moverPedidosDeEntrega(tx, e.id, ["CONFIRMADO", "EN_COMPRA", "EN_PREPARACION"], "PREPARADO"),
      yaEstaba ? null : registrarActividad(tx, c, { accion: "PREPARADA", entidadTipo: "ENTREGA", entidadId: e.id, jornadaId: e.jornadaId, resumen: `terminó de preparar el pedido de ${cli?.nombre ?? "un cliente"}`, paraUsuarioId: c.responsables.en_camino ?? null }),
    ]);
    if (yaEstaba) return { documentos: await reemitirSiCorresponde(tx, c, e.id) };
    if (!empresa.emitirDocumentosAlPreparar) return { documentos: null };
    if (e.version > 0) return { documentos: await reemitirSiCorresponde(tx, c, e.id) };
    return { documentos: await emitirDocumentosEntrega(tx, c, e.id) };
  });
}

/** P-72: un producto y todas las entregas que lo llevan, para pesar de una vez. */
export async function productoEnPreparacion(db: BaseDatos, authUserId: string, fecha: FechaISO, productoId: string) {
  return ejecutarComoUsuario(db, authUserId, "preparacion.ver", async (tx) => {
    const j = await jornadaDeFecha(tx, fecha);
    if (!j) throw new ErrorDeNegocio("NO_ENCONTRADO", "No hay preparación para ese día.");
    const [p] = await tx.select({ nombre: producto.nombre, unidad: producto.unidadBase }).from(producto).where(eq(producto.id, productoId));
    if (!p) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el producto.");
    const empresa = await configuracionEmpresa(tx);
    const lineas = await tx
      .select({
        id: entregaItem.id,
        entregaId: entrega.id,
        numero: entrega.numero,
        estado: entrega.estado,
        cliente: cliente.nombre,
        prioridad: cliente.prioridadFaltantes,
        esSustitucion: entregaItem.esSustitucion,
        pedida: entregaItem.cantidadPedida,
        propuesta: entregaItem.cantidadPropuesta,
        preparada: entregaItem.cantidadPreparada,
        motivo: entregaItem.motivoFaltante,
      })
      .from(entregaItem)
      .innerJoin(entrega, and(eq(entrega.id, entregaItem.entregaId), ne(entrega.estado, "ANULADA")))
      .innerJoin(cliente, eq(cliente.id, entrega.clienteId))
      .where(and(eq(entrega.jornadaId, j.id), eq(entregaItem.productoId, productoId)))
      .orderBy(asc(cliente.prioridadFaltantes), asc(cliente.nombre));
    const comprado = (await compradoPorProducto(tx, j.id)).get(productoId) ?? "0";
    return {
      producto: p.nombre,
      unidad: p.unidad,
      comprado,
      tolerancia: empresa.toleranciaPesoPct,
      preparado: sumar(lineas.map((l) => l.preparada ?? "0")).toString(),
      lineas: lineas.map((l) => ({ ...l, numero: numeroEntrega(l.numero), editable: (EDITABLES as readonly string[]).includes(l.estado) })),
    };
  });
}

/** DOC-07 Hoja de preparación (09): cada entrega con sus líneas, sin precios. */
export async function hojaDePreparacion(db: BaseDatos, authUserId: string, fecha: FechaISO) {
  return ejecutarComoUsuario(db, authUserId, "documentos.imprimir_entrega", async (tx) => {
    const j = await jornadaDeFecha(tx, fecha);
    if (!j) return [];
    const filas = await tx
      .select({
        id: entrega.id,
        numero: entrega.numero,
        cliente: cliente.nombre,
        punto: puntoEntrega.nombre,
        desde: puntoEntrega.horarioDesde,
        hasta: puntoEntrega.horarioHasta,
        observaciones: entrega.observaciones,
        reparto: reparto.numero,
        orden: entrega.ordenEnReparto,
      })
      .from(entrega)
      .innerJoin(cliente, eq(cliente.id, entrega.clienteId))
      .innerJoin(puntoEntrega, eq(puntoEntrega.id, entrega.puntoEntregaId))
      .leftJoin(reparto, eq(reparto.id, entrega.repartoId))
      .where(and(eq(entrega.jornadaId, j.id), inArray(entrega.estado, ["BORRADOR", "EN_PREPARACION", "PREPARADA"])))
      .orderBy(sql`${reparto.numero} nulls last`, sql`${entrega.ordenEnReparto} nulls last`, sql`${puntoEntrega.horarioDesde} nulls last`, asc(cliente.nombre));
    const hojas = [];
    for (const f of filas) {
      hojas.push({
        ...f,
        numero: numeroEntrega(f.numero),
        reparto: f.reparto !== null ? numeroReparto(f.reparto) : null,
        horario: horario(f.desde, f.hasta),
        lineas: await lineasOperativas(tx, f.id),
      });
    }
    return hojas;
  });
}
