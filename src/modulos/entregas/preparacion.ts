import { and, asc, count, eq, inArray, max, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { cliente, compra, entrega, entregaItem, jornada, pedido, pedidoItem, presentacion, producto, puntoEntrega, reparto } from "@/db/esquema";
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

import { configuracionEmpresa, entregaBloqueada, unico, exigirJornadaAbierta, jornadaDeFecha, moverPedidosDeEntrega, numeroEntrega, numeroReparto } from "./comun";
import { documentosAlDia, documentosAlDiaDe, emitirDocumentosEntrega, lineasOperativas, reemitirSiCorresponde, type ResultadoEmision } from "./documentos";

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
async function sincronizarEntregas(tx: Transaccion, c: ContextoUsuario, jornadaId: string): Promise<{ entregasNuevas: number; lineasNuevas: number; sinLugar: number }> {
  const vivos = await tx
    .select({
      itemId: pedidoItem.id,
      productoId: pedidoItem.productoId,
      cantidadBase: pedidoItem.cantidadBase,
      presentacionId: pedidoItem.presentacionId,
      observacionesItem: pedidoItem.observaciones,
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
    .where(and(eq(pedido.jornadaId, jornadaId), inArray(pedido.estado, [...ESTADOS_PEDIDO_A_PREPARAR]), eq(pedidoItem.cancelado, false)))
    .orderBy(asc(pedido.numero), asc(pedidoItem.linea));
  const entregas = await tx.select().from(entrega).where(and(eq(entrega.jornadaId, jornadaId), ne(entrega.estado, "ANULADA")));
  const existentes = await tx
    .select({ id: entregaItem.id, pedidoItemId: entregaItem.pedidoItemId, esSustitucion: entregaItem.esSustitucion, pedida: entregaItem.cantidadPedida, preparada: entregaItem.cantidadPreparada })
    .from(entregaItem)
    .innerJoin(entrega, and(eq(entrega.id, entregaItem.entregaId), ne(entrega.estado, "ANULADA")))
    .where(eq(entrega.jornadaId, jornadaId));

  let entregasNuevas = 0;
  let lineasNuevas = 0;
  let sinLugar = 0;
  for (const v of vivos) {
    const ya = existentes.find((x) => x.pedidoItemId === v.itemId && !x.esSustitucion);
    if (ya) {
      // Lo pedido cambió y la línea todavía no se preparó: se actualiza.
      if (ya.preparada === null && !dec(ya.pedida).eq(v.cantidadBase)) await tx.update(entregaItem).set({ cantidadPedida: v.cantidadBase }).where(eq(entregaItem.id, ya.id));
      continue;
    }
    let e = entregas.find((x) => x.clienteId === v.clienteId && x.puntoEntregaId === v.puntoEntregaId);
    if (!e) {
      const { numero } = await siguienteNumero(tx, "ENTREGA");
      [e] = await tx
        .insert(entrega)
        .values({ empresaId: c.empresaId, numero, jornadaId, clienteId: v.clienteId, puntoEntregaId: v.puntoEntregaId, creadoPor: c.usuarioId, actualizadoPor: c.usuarioId })
        .returning();
      entregas.push(e!);
      entregasNuevas++;
    }
    // Un pedido tardío no entra en una entrega que ya salió (04 §5.b.5): va en otra entrega o al día siguiente.
    if (!(EDITABLES as readonly string[]).includes(e!.estado)) {
      sinLugar++;
      continue;
    }
    const [ultima] = await tx.select({ n: max(entregaItem.linea) }).from(entregaItem).where(eq(entregaItem.entregaId, e!.id));
    await tx.insert(entregaItem).values({
      empresaId: c.empresaId,
      entregaId: e!.id,
      linea: (ultima?.n ?? 0) + 1,
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
    lineasNuevas++;
    if (e!.estado === "PREPARADA") {
      await tx.update(entrega).set({ estado: "EN_PREPARACION", actualizadoPor: c.usuarioId }).where(eq(entrega.id, e!.id));
      e!.estado = "EN_PREPARACION";
    }
  }
  // Líneas cuyo pedido se canceló o cuya línea se quitó: si no se prepararon, quedan en 0.
  const vivosIds = new Set(vivos.map((v) => v.itemId));
  for (const x of existentes) {
    if (!x.esSustitucion && x.pedidoItemId && !vivosIds.has(x.pedidoItemId) && x.preparada === null && !dec(x.pedida).isZero()) {
      await tx.update(entregaItem).set({ cantidadPedida: "0" }).where(eq(entregaItem.id, x.id));
    }
  }
  // Observaciones y orden de compra de los pedidos incluidos.
  for (const e of entregas.filter((x) => (EDITABLES as readonly string[]).includes(x.estado))) {
    const pedidos = await tx
      .selectDistinct({ observaciones: pedido.observaciones, referencia: pedido.referenciaCliente })
      .from(pedido)
      .where(and(eq(pedido.jornadaId, jornadaId), eq(pedido.clienteId, e.clienteId), eq(pedido.puntoEntregaId, e.puntoEntregaId), inArray(pedido.estado, [...ESTADOS_PEDIDO_A_PREPARAR])));
    const unir = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => Boolean(x?.trim())))].join(" · ") || null;
    await tx
      .update(entrega)
      .set({ observaciones: unir(pedidos.map((p) => p.observaciones)), referenciaCliente: unir(pedidos.map((p) => p.referencia)) })
      .where(eq(entrega.id, e.id));
  }
  return { entregasNuevas, lineasNuevas, sinLugar };
}

/**
 * Cantidad propuesta de cada línea (04 §5.e paso 2): lo pedido si alcanza lo comprado; si no, el
 * reparto de faltantes (RN-115). Si en la jornada no se registró ninguna compra no hay con qué
 * comparar y se propone lo pedido; lo mismo con los productos tildados a mano como comprados.
 */
async function recalcularPropuestas(tx: Transaccion, jornadaId: string): Promise<void> {
  const empresa = await configuracionEmpresa(tx);
  const { compras } = unico(await tx.select({ compras: count() }).from(compra).where(and(eq(compra.jornadaId, jornadaId), eq(compra.estado, "REGISTRADA"))));
  const comprado = await compradoPorProducto(tx, jornadaId);
  const tildados = await productosTildados(tx, jornadaId);
  const lineas = await tx
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
    .where(and(eq(entrega.jornadaId, jornadaId), eq(entregaItem.esSustitucion, false)));
  const porProducto = new Map<string, typeof lineas>();
  for (const l of lineas) porProducto.set(l.productoId, [...(porProducto.get(l.productoId) ?? []), l]);
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
      if (nueva !== l.propuesta) await tx.update(entregaItem).set({ cantidadPropuesta: nueva }).where(eq(entregaItem.id, l.id));
    }
  }
}

/**
 * "Iniciar preparación" (P-46, RN-038, RN-111): crea las entregas y propone las cantidades; la
 * jornada pasa a PREPARANDO. Volver a correrlo suma los pedidos que llegaron tarde.
 */
export async function iniciarPreparacion(db: BaseDatos, authUserId: string, fecha: FechaISO): Promise<{ entregasNuevas: number; lineasNuevas: number; sinLugar: number; borradores: number }> {
  return ejecutarComoUsuario(db, authUserId, "preparacion.registrar", async (tx, c) => {
    const j = await jornadaDeFecha(tx, fecha);
    if (!j) throw new ErrorDeNegocio("VALIDACION", "No hay pedidos para ese día.");
    exigirJornadaAbierta(j);
    await tx.select({ id: jornada.id }).from(jornada).where(eq(jornada.id, j.id)).for("update");
    const r = await sincronizarEntregas(tx, c, j.id);
    await recalcularPropuestas(tx, j.id);
    if (j.estado === "ABIERTA" || j.estado === "COMPRANDO") {
      await tx.update(jornada).set({ estado: "PREPARANDO", preparacionIniciadaEn: sql`now()`, actualizadoPor: c.usuarioId }).where(eq(jornada.id, j.id));
    }
    const { borradores } = unico(await tx.select({ borradores: count() }).from(pedido).where(and(eq(pedido.jornadaId, j.id), eq(pedido.estado, "BORRADOR"))));
    if (j.estado === "ABIERTA" || j.estado === "COMPRANDO" || r.entregasNuevas > 0) {
      await registrarActividad(tx, c, { accion: "PREPARAR", entidadTipo: "JORNADA", entidadId: j.id, jornadaId: j.id, resumen: `empezó a preparar los pedidos del ${fecha.slice(8, 10)}/${fecha.slice(5, 7)}` });
    }
    return { ...r, borradores: Number(borradores) };
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
  /** Lo que hay que separar para el cliente, con lo ya separado tildado y lo que faltó y por qué. */
  detalle: { producto: string; cantidad: string; hecha: boolean; aviso: string | null; reemplazo: boolean }[];
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
    const empresa = await configuracionEmpresa(tx);
    const filas = await tx
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
      .where(and(eq(entrega.jornadaId, j.id), ne(entrega.estado, "ANULADA")))
      .orderBy(sql`${reparto.numero} nulls last`, sql`${entrega.ordenEnReparto} nulls last`, sql`${puntoEntrega.horarioDesde} nulls last`, asc(cliente.nombre));
    const items = filas.length
      ? await tx
          .select({
            entregaId: entregaItem.entregaId,
            productoId: entregaItem.productoId,
            producto: entregaItem.productoNombre,
            unidad: entregaItem.unidadBase,
            esSustitucion: entregaItem.esSustitucion,
            pedida: entregaItem.cantidadPedida,
            propuesta: entregaItem.cantidadPropuesta,
            preparada: entregaItem.cantidadPreparada,
            motivo: entregaItem.motivoFaltante,
            categoria: producto.categoriaId,
          })
          .from(entregaItem)
          .innerJoin(producto, eq(producto.id, entregaItem.productoId))
          .where(
            inArray(
              entregaItem.entregaId,
              filas.map((f) => f.id),
            ),
          )
          .orderBy(asc(entregaItem.linea))
      : [];
    const alDia = await documentosAlDiaDe(tx, filas);
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
        detalle: propias.map((i) => ({
          producto: i.producto,
          cantidad: formatearCantidad(i.esSustitucion ? (i.preparada ?? i.pedida) : i.pedida, i.unidad as UnidadMedida),
          hecha: i.preparada !== null,
          aviso: i.esSustitucion ? null : avisoDeFaltante({ ...i, unidad: i.unidad as UnidadMedida }),
          reemplazo: i.esSustitucion,
        })),
      });
    }
    const comprado = await compradoPorProducto(tx, j.id);
    const { compras } = unico(await tx.select({ compras: count() }).from(compra).where(and(eq(compra.jornadaId, j.id), eq(compra.estado, "REGISTRADA"))));
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
    const { sinEntrega } = unico(await tx
      .select({ sinEntrega: count() })
      .from(pedido)
      .where(
        and(
          eq(pedido.jornadaId, j.id),
          inArray(pedido.estado, ["CONFIRMADO", "EN_COMPRA"]),
          sql`not exists (select 1 from ${pedidoItem} pi join ${entregaItem} ei on ei.pedido_item_id = pi.id join ${entrega} e on e.id = ei.entrega_id and e.estado <> 'ANULADA' where pi.pedido_id = pedido.id)`,
        ),
      ));
    return { jornada: { id: j.id, estado: j.estado }, hayCompras: Number(compras) > 0, entregas, productos, pedidosSinEntrega: Number(sinEntrega) };
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
      documentosPendientes: f.e.estado === "PREPARADA" && !(await documentosAlDia(tx, f.e.id, f.e.version)),
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

async function itemEditable(tx: Transaccion, itemId: string) {
  const [i] = await tx.select().from(entregaItem).where(eq(entregaItem.id, itemId));
  if (!i) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró la línea.");
  const e = await entregaBloqueada(tx, i.entregaId);
  if (!(EDITABLES as readonly string[]).includes(e.estado)) throw new ErrorDeNegocio("VALIDACION", "La entrega ya salió o se entregó: se corrige desde el detalle de la entrega.");
  const [j] = await tx.select().from(jornada).where(eq(jornada.id, e.jornadaId));
  exigirJornadaAbierta(j);
  return { i, e, j: j! };
}

/** Al empezar a cargar, la entrega y sus pedidos pasan a EN_PREPARACION. */
async function abrirSiHaceFalta(tx: Transaccion, c: ContextoUsuario, e: { id: string; estado: string }) {
  if (e.estado !== "BORRADOR") return;
  await tx.update(entrega).set({ estado: "EN_PREPARACION", actualizadoPor: c.usuarioId }).where(eq(entrega.id, e.id));
  await moverPedidosDeEntrega(tx, e.id, ["CONFIRMADO", "EN_COMPRA"], "EN_PREPARACION");
}

/**
 * Cantidad preparada de una línea (RN-112, RN-113, RN-114). Fuera de la tolerancia: si falta
 * mercadería pide el motivo; si sobra, pide confirmar. Si se prepara más de lo comprado, también.
 */
export async function registrarPreparado(db: BaseDatos, authUserId: string, datos: z.input<typeof esquemaPreparado>): Promise<{ reemision: ResultadoEmision | null }> {
  const d = validar(esquemaPreparado, datos);
  return ejecutarComoUsuario(db, authUserId, "preparacion.registrar", async (tx, c) => {
    const { i, e, j } = await itemEditable(tx, d.itemId);
    const empresa = await configuracionEmpresa(tx);
    const ev = evaluarPreparado(i.cantidadPedida, d.cantidad, empresa.toleranciaPesoPct);
    if (ev.menor && !d.motivo) throw new ErrorDeNegocio("VALIDACION", `Falta mercadería de ${i.productoNombre}: elegí el motivo (no se consiguió, faltante…).`);
    if (!ev.dentro && !ev.menor && !d.confirmar) {
      throw new ErrorDeNegocio("VALIDACION", `${i.productoNombre}: se preparó ${formatearPorcentaje(ev.diferenciaPct!, 1)} más de lo pedido. Si está bien, tocá "Confirmar".`, { requiereConfirmacion: true });
    }
    const comprado = dec((await compradoPorProducto(tx, j.id)).get(i.productoId) ?? "0");
    if (comprado.gt(0) && !d.confirmar && !(await productosTildados(tx, j.id)).has(i.productoId)) {
      const { total } = unico(await tx
        .select({ total: sql<string>`coalesce(sum(${entregaItem.cantidadPreparada}), 0)` })
        .from(entregaItem)
        .innerJoin(entrega, and(eq(entrega.id, entregaItem.entregaId), ne(entrega.estado, "ANULADA")))
        .where(and(eq(entrega.jornadaId, j.id), eq(entregaItem.productoId, i.productoId), ne(entregaItem.id, i.id))));
      if (dec(total).plus(d.cantidad).gt(comprado)) {
        throw new ErrorDeNegocio(
          "VALIDACION",
          `De ${i.productoNombre} se compraron ${formatearCantidad(comprado, i.unidadBase as UnidadMedida)} y con esto se prepararían ${formatearCantidad(dec(total).plus(d.cantidad), i.unidadBase as UnidadMedida)}. ¿Está bien el peso? Si es así, tocá "Confirmar" (RN-114).`,
          { requiereConfirmacion: true },
        );
      }
    }
    await tx
      .update(entregaItem)
      .set({ cantidadPreparada: d.cantidad, motivoFaltante: ev.dentro || !ev.menor ? null : d.motivo, actualizadoPor: c.usuarioId })
      .where(eq(entregaItem.id, i.id));
    await abrirSiHaceFalta(tx, c, e);
    return { reemision: e.estado === "PREPARADA" ? await reemitirSiCorresponde(tx, c, e.id) : null };
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
    let cargadas = 0;
    for (const l of pendientes) {
      const cantidad = l.cantidadPropuesta ?? l.cantidadPedida;
      // Si la propuesta es menor (faltante repartido), queda con motivo FALTANTE hasta que se corrija.
      const menor = dec(cantidad).lt(l.cantidadPedida);
      await tx
        .update(entregaItem)
        .set({ cantidadPreparada: cantidad, motivoFaltante: menor ? "FALTANTE" : null, actualizadoPor: c.usuarioId })
        .where(eq(entregaItem.id, l.id));
      cargadas++;
    }
    await abrirSiHaceFalta(tx, c, e);
    if (e.estado === "PREPARADA") await reemitirSiCorresponde(tx, c, e.id);
    return cargadas;
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
    const { faltan } = unico(await tx
      .select({ faltan: count() })
      .from(entregaItem)
      .where(and(eq(entregaItem.entregaId, e.id), sql`${entregaItem.cantidadPreparada} is null`)));
    if (Number(faltan) > 0) throw new ErrorDeNegocio("VALIDACION", `Faltan cargar ${faltan} ${Number(faltan) === 1 ? "línea" : "líneas"} (0 si no hay).`);
    await tx.update(entrega).set({ estado: "PREPARADA", cantidadBultos: bultos ?? e.cantidadBultos, actualizadoPor: c.usuarioId }).where(eq(entrega.id, e.id));
    await moverPedidosDeEntrega(tx, e.id, ["CONFIRMADO", "EN_COMPRA", "EN_PREPARACION"], "PREPARADO");
    if (e.estado === "PREPARADA") return { documentos: await reemitirSiCorresponde(tx, c, e.id) };
    const [cli] = await tx.select({ nombre: cliente.nombre }).from(cliente).where(eq(cliente.id, e.clienteId));
    await registrarActividad(tx, c, { accion: "PREPARADA", entidadTipo: "ENTREGA", entidadId: e.id, jornadaId: e.jornadaId, resumen: `terminó de preparar el pedido de ${cli?.nombre ?? "un cliente"}` });
    const empresa = await configuracionEmpresa(tx);
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
