import { randomUUID } from "node:crypto";

import Decimal from "decimal.js";
import { and, asc, desc, eq, inArray, sql, sum } from "drizzle-orm";
import { z } from "zod";

import { auditar } from "@/db/auditoria";
import {
  categoria,
  cliente,
  compra,
  compraItem,
  empresa,
  imputacionPagoProveedor,
  jornada,
  listaCompra,
  listaCompraItem,
  pedido,
  pedidoItem,
  presentacion,
  producto,
  proveedor,
  proveedorProducto,
} from "@/db/esquema";
import { siguienteNumero } from "@/db/secuencia";
import type { BaseDatos, Transaccion } from "@/db/tipos";
import { calcularLineaLista, estadoLineaLista, sugerirProveedor, tildeSigueValiendo, type AlertaLista, type Candidato, type EstadoLineaLista } from "@/dominio/compras/lista";
import { RETIRO_A_LA_VISTA } from "@/dominio/pedidos/tablero";
import { indicadoresCredito, type Semaforo } from "@/dominio/compras/credito";
import { aNumeric, dec, redondearPesos, sumar } from "@/dominio/dinero/decimal";
import { ErrorDeNegocio } from "@/dominio/errores";
import { diasEntre, hoyEnEmpresa, type FechaISO } from "@/dominio/fechas/fechas";
import { formatearNumeroDocumento } from "@/dominio/numeracion/numeracion";
import { registrarActividad } from "@/modulos/colaboracion/registro";
import { ejecutarComoUsuario, type ContextoUsuario } from "@/modulos/seguridad/contexto";
import { numeroObligatorio, textoOpcional, validar } from "@/modulos/validacion";

import { saldosNetos, umbralesSemaforo } from "./cuenta";

// Lista de compra (04 §5.c, 08 §5.8): RN-034, RN-037, RN-043 a RN-053.

export interface LineaDeLista {
  id: string;
  productoId: string;
  producto: string;
  codigo: string;
  /** Grupo de su categoría (FRUTA, VERDURA…), para el dibujo. */
  grupo: string | null;
  /** Su categoría (Duras, De hoja…), para agruparla en la lista. */
  categoria: string;
  categoriaOrden: number;
  /** Para qué clientes es (los pedidos que están en la lista), con cuánto lleva cada uno en la unidad del producto. */
  paraQuien: { cliente: string; cantidadBase: string }[];
  unidadBase: string;
  necesidadBase: string;
  compradoBase: string;
  pendienteBase: string;
  presentacionId: string | null;
  presentacion: string | null;
  factor: string;
  cantidadPresentaciones: string | null;
  aComprarBase: string | null;
  sobrantePrevistoBase: string;
  ajusteManual: boolean;
  motivoAjuste: string | null;
  proveedorId: string | null;
  proveedor: string | null;
  ubicacion: string | null;
  asignacionManual: boolean;
  /** Solo con `precios.ver_costos`. */
  precioSugerido: string | null;
  costoEstimado: string | null;
  estado: EstadoLineaLista;
  motivoNoConseguido: string | null;
  /** Tildado a mano como comprado, sin anotar la compra (puesto y precio). */
  tildado: boolean;
  sinPedido: boolean;
  alertas: AlertaLista[];
  necesidadModificada: boolean;
  observaciones: string | null;
  /** Lugar en la lista cuando se ordenó a mano; nulo = sin ordenar. */
  ordenManual: number | null;
  /** Las compras ya anotadas de ese producto en el día: en qué puesto, cuánto y a cuánto (el precio, solo con `precios.ver_costos`) y si falta pagarla. */
  compras: { proveedor: string; presentacion: string; cantidad: string; precio: string | null; aCuenta: boolean }[];
  /** Con `paraComprar`: los puestos que lo venden (con su último precio) y sus envases de compra, para anotar la compra en el mismo renglón. */
  ofertas: { ofertaId: string; proveedorId: string; presentacionId: string; precio: string; factor: string }[];
  envases: { id: string; nombre: string; factor: string }[];
}

export interface PlanProveedor {
  proveedorId: string | null;
  proveedor: string;
  ubicacion: string | null;
  lineas: LineaDeLista[];
  /** Solo con `precios.ver_costos`. */
  subtotal: string | null;
  /** Solo con `proveedores.ver_credito`. */
  credito: { disponibleHoy: string | null; disponibleDespues: string | null; semaforoProyectado: Semaforo } | null;
}

export interface ListaDeCompra {
  id: string;
  numero: string;
  jornadaId: string;
  fecha: FechaISO;
  estadoJornada: string;
  version: number;
  desactualizada: boolean;
  generadaEn: Date;
  costoEstimadoTotal: string | null;
  /** Cuántos pedidos tiene adentro. */
  pedidos: number;
  plan: PlanProveedor[];
  /** Con `paraComprar`: los puestos activos, para elegir dónde se compró. */
  proveedores: { id: string; nombre: string; aCuenta: boolean }[];
}

const ESTADOS_EN_LISTA = ["CONFIRMADO", "EN_COMPRA"] as const;

async function jornadaDeFecha(tx: Transaccion, fecha: FechaISO) {
  const [j] = await tx.select().from(jornada).where(eq(jornada.fecha, fecha));
  return j ?? null;
}

/** Lo comprado por producto en la jornada, sumado en unidad base (04 §5.d.2). */
export async function compradoPorProducto(tx: Transaccion, jornadaId: string): Promise<Map<string, string>> {
  const filas = await tx
    .select({ productoId: compraItem.productoId, cantidad: sum(compraItem.cantidadBase).mapWith(String) })
    .from(compraItem)
    .innerJoin(compra, and(eq(compra.id, compraItem.compraId), eq(compra.estado, "REGISTRADA")))
    .where(eq(compra.jornadaId, jornadaId))
    .groupBy(compraItem.productoId);
  return new Map(filas.map((f) => [f.productoId, f.cantidad ?? "0"]));
}

/** RN-052: un pedido de la jornada cambió después de generar la lista. */
export async function marcarListaDesactualizada(tx: Transaccion, jornadaId: string): Promise<void> {
  await tx.update(listaCompra).set({ desactualizada: true }).where(eq(listaCompra.jornadaId, jornadaId));
}

/**
 * Después de registrar o anular compras: actualiza lo comprado y el estado de cada línea (sin
 * mover proveedores ni cantidades sugeridas) y agrega como "sin pedido" lo comprado que no estaba (RN-060).
 */
export async function actualizarComprado(tx: Transaccion, empresaId: string, jornadaId: string): Promise<void> {
  const [[lista], comprado, lineas] = await Promise.all([
    tx.select({ id: listaCompra.id }).from(listaCompra).where(eq(listaCompra.jornadaId, jornadaId)),
    compradoPorProducto(tx, jornadaId),
    tx
      .select()
      .from(listaCompraItem)
      .where(inArray(listaCompraItem.listaCompraId, tx.select({ id: listaCompra.id }).from(listaCompra).where(eq(listaCompra.jornadaId, jornadaId)))),
  ]);
  if (!lista) return;
  const faltan = [...comprado.keys()].filter((id) => !lineas.some((l) => l.productoId === id));
  // Todos los renglones se guardan juntos (una ida a la base).
  await Promise.all([
    ...lineas.map((l) => {
      const c = comprado.get(l.productoId) ?? "0";
      const factor = l.aComprarBase && l.cantidadPresentaciones && !dec(l.cantidadPresentaciones).isZero() ? dec(l.aComprarBase).div(l.cantidadPresentaciones) : dec(1);
      const calculo = calcularLineaLista({
        necesidadBase: l.necesidadNetaBase,
        compradoBase: c,
        factor,
        cantidadManual: l.ajusteManual ? l.cantidadPresentaciones : null,
        marcadaNoConseguido: l.estado === "NO_CONSEGUIDO",
        tildada: l.tildado,
      });
      return tx
        .update(listaCompraItem)
        .set({
          compradoBase: aNumeric(c, 3),
          estado: calculo.estado,
          // Con la compra ya anotada por todo lo que hacía falta, el tilde a mano no hace falta.
          tildado: l.tildado && dec(c).lt(l.necesidadNetaBase),
          motivoNoConseguido: calculo.estado === "NO_CONSEGUIDO" ? l.motivoNoConseguido : null,
        })
        .where(eq(listaCompraItem.id, l.id));
    }),
    faltan.length
      ? tx.insert(listaCompraItem).values(
          faltan.map((productoId) => ({
            empresaId,
            listaCompraId: lista.id,
            productoId,
            necesidadBase: "0",
            necesidadNetaBase: "0",
            compradoBase: aNumeric(comprado.get(productoId)!, 3),
            sobrantePrevistoBase: aNumeric(comprado.get(productoId)!, 3),
            estado: "COMPRADO" as const,
            sinPedido: true,
          })),
        )
      : null,
  ]);
}

export interface ResultadoLista {
  listaId: string;
  numero: string;
  version: number;
  borradores: number;
  cambios: string[];
  /** Pedidos que entraron en esta versión. */
  agregados: number;
  /** Pedidos confirmados que quedaron afuera (no se eligieron en el tablero). */
  fueraDeLista: number;
}

/**
 * "Cerrar pedidos y generar lista de compra" o "Regenerar" (04 §5.c.1). Conserva lo comprado,
 * las cantidades fijadas a mano y los proveedores elegidos a mano (RN-049, RN-050). Sin elegir
 * pedidos entran todos los confirmados; desde el tablero se eligen cuáles (los que ya estaban en
 * la lista siguen).
 */
export async function generarListaCompra(db: BaseDatos, authUserId: string, fecha: FechaISO, opciones: { pedidoIds?: readonly string[] } = {}): Promise<ResultadoLista> {
  return ejecutarComoUsuario(db, authUserId, "lista_compra.generar", (tx, c) => armarLista(tx, c, fecha, opciones.pedidoIds ?? null));
}

/**
 * Saca un pedido de la lista (vuelve a confirmado, afuera de la compra) y la rearma sin él. Lo ya
 * comprado se conserva: si sobra, queda como sobrante.
 */
export async function sacarPedidoDeLista(db: BaseDatos, authUserId: string, pedidoId: string): Promise<ResultadoLista> {
  return ejecutarComoUsuario(db, authUserId, "lista_compra.generar", async (tx, c) => {
    const [p] = await tx
      .select({ id: pedido.id, numero: pedido.numero, estado: pedido.estado, jornadaId: pedido.jornadaId, fecha: jornada.fecha })
      .from(pedido)
      .innerJoin(jornada, eq(jornada.id, pedido.jornadaId))
      .where(eq(pedido.id, pedidoId))
      .for("update", { of: pedido });
    if (!p) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el pedido.");
    if (p.estado !== "EN_COMPRA") throw new ErrorDeNegocio("TRANSICION_INVALIDA", "Ese pedido no está en la lista de compras.");
    const [otros] = await tx.select({ n: sql<number>`count(*)` }).from(pedido).where(and(eq(pedido.jornadaId, p.jornadaId), eq(pedido.estado, "EN_COMPRA")));
    if (Number(otros?.n ?? 0) <= 1) throw new ErrorDeNegocio("VALIDACION", "Es el único pedido de la lista: si no se compra nada, cancelá el pedido.");
    await tx.update(pedido).set({ estado: "CONFIRMADO", actualizadoPor: c.usuarioId }).where(eq(pedido.id, p.id));
    const r = await armarLista(tx, c, p.fecha, []);
    await registrarActividad(tx, c, {
      accion: "SACAR_DE_LISTA",
      entidadTipo: "PEDIDO",
      entidadId: p.id,
      jornadaId: p.jornadaId,
      resumen: `sacó el pedido ${formatearNumeroDocumento("PED-", p.numero)} de la lista de compras`,
    });
    return r;
  });
}

async function armarLista(tx: Transaccion, c: ContextoUsuario, fecha: FechaISO, seleccion: readonly string[] | null): Promise<ResultadoLista> {
  const [[j], [e]] = await Promise.all([tx.select().from(jornada).where(eq(jornada.fecha, fecha)), tx.select().from(empresa)]);
  if (!j) throw new ErrorDeNegocio("VALIDACION", "No hay pedidos para ese día.");
  // Con repartos ya en la calle se sigue pudiendo sumar lo de un pedido que llegó después.
  if (j.estado === "CERRADA") {
    throw new ErrorDeNegocio("JORNADA_CERRADA", "Ese día ya está cerrado, así que su lista de compras no se puede cambiar. Si hace falta agregar o corregir algo, primero reabrí el día.", {
      enlace: { href: `/jornadas/${fecha}/cierre`, texto: "Ir al cierre del día" },
    });
  }
  // Lo del día sale junto (una ida): los pedidos, lo ya comprado y la lista que hubiera, bloqueada.
  const [pedidos, comprado, [existente], anteriores] = await Promise.all([
    tx.select({ id: pedido.id, estado: pedido.estado, numero: pedido.numero }).from(pedido).where(eq(pedido.jornadaId, j.id)),
    compradoPorProducto(tx, j.id),
    tx.select().from(listaCompra).where(eq(listaCompra.jornadaId, j.id)).for("update"),
    tx
      .select()
      .from(listaCompraItem)
      .where(inArray(listaCompraItem.listaCompraId, tx.select({ id: listaCompra.id }).from(listaCompra).where(eq(listaCompra.jornadaId, j.id)))),
  ]);
  let incluidos = pedidos.filter((p) => (ESTADOS_EN_LISTA as readonly string[]).includes(p.estado));
  if (seleccion) {
    const elegidos = new Set(seleccion);
    if ([...elegidos].some((id) => !pedidos.some((p) => p.id === id))) throw new ErrorDeNegocio("VALIDACION", "Algunos de los pedidos elegidos son de otro día.");
    const noConfirmados = pedidos.filter((p) => elegidos.has(p.id) && !(ESTADOS_EN_LISTA as readonly string[]).includes(p.estado));
    if (noConfirmados.length > 0) {
      throw new ErrorDeNegocio("VALIDACION", `Estos pedidos no pueden entrar en la lista (les faltan productos o ya pasaron a preparación): ${noConfirmados.map((p) => formatearNumeroDocumento("PED-", p.numero)).join(", ")}.`);
    }
    incluidos = incluidos.filter((p) => p.estado === "EN_COMPRA" || elegidos.has(p.id));
  }
  if (incluidos.length === 0) throw new ErrorDeNegocio("VALIDACION", "Para armar la lista hace falta al menos un pedido con productos (RN-037).");
  const borradores = pedidos.filter((p) => p.estado === "BORRADOR").length;

  // 1. Necesidad por producto en unidad base (RN-043, RN-044)
  const necesidades = await tx
    .select({ productoId: pedidoItem.productoId, cantidad: sum(pedidoItem.cantidadBase).mapWith(String), notas: sql<string | null>`string_agg(distinct ${pedidoItem.observaciones}, ' / ')` })
    .from(pedidoItem)
    .where(and(inArray(pedidoItem.pedidoId, incluidos.map((p) => p.id)), eq(pedidoItem.cancelado, false)))
    .groupBy(pedidoItem.productoId);
  const necesidad = new Map(necesidades.map((n) => [n.productoId, n.cantidad ?? "0"]));
  const productoIds = [...new Set([...necesidad.keys(), ...comprado.keys(), ...anteriores.map((a) => a.productoId)])];

  // 2. Productos, ofertas candidatas, saldos de los proveedores y el número de la lista nueva (una ida)
  const hoy = hoyEnEmpresa(new Date(), e!.zonaHoraria);
  const conProductos = productoIds.length > 0;
  const [productos, ofertas, saldos, ultimos, factores, numeroNuevo] = await Promise.all([
    tx
      .select({ id: producto.id, nombre: producto.nombre, preferidoId: producto.proveedorPreferidoId, compraDefault: producto.presentacionCompraDefaultId })
      .from(producto)
      .innerJoin(categoria, eq(categoria.id, producto.categoriaId))
      .where(conProductos ? inArray(producto.id, productoIds) : sql`false`)
      .orderBy(asc(categoria.orden), asc(categoria.nombre), asc(producto.nombre)),
    tx
      .select({
        ofertaId: proveedorProducto.id,
        productoId: proveedorProducto.productoId,
        proveedorId: proveedorProducto.proveedorId,
        presentacionId: proveedorProducto.presentacionId,
        precio: proveedorProducto.precioVigente,
        costoBase: proveedorProducto.costoBase,
        factor: presentacion.factorABase,
        fecha: proveedorProducto.fechaActualizacion,
        limite: proveedor.limiteCredito,
        condicion: proveedor.condicionPagoHabitual,
      })
      .from(proveedorProducto)
      .innerJoin(proveedor, and(eq(proveedor.id, proveedorProducto.proveedorId), eq(proveedor.activo, true)))
      .innerJoin(presentacion, and(eq(presentacion.id, proveedorProducto.presentacionId), eq(presentacion.activo, true), eq(presentacion.usableEnCompra, true)))
      .where(
        and(
          conProductos ? inArray(proveedorProducto.productoId, productoIds) : sql`false`,
          eq(proveedorProducto.activo, true),
          eq(proveedorProducto.disponible, true),
          sql`${proveedorProducto.precioVigente} > 0`,
        ),
      ),
    saldosNetos(tx),
    tx
      .selectDistinctOn([compraItem.productoId], { productoId: compraItem.productoId, proveedorId: compra.proveedorId })
      .from(compraItem)
      .innerJoin(compra, and(eq(compra.id, compraItem.compraId), eq(compra.estado, "REGISTRADA")))
      .where(e!.estrategiaCosto === "ULTIMO_COSTO_REAL" && conProductos ? inArray(compraItem.productoId, productoIds) : sql`false`)
      .orderBy(compraItem.productoId, desc(compra.fechaCompra)),
    tx
      .select({ id: presentacion.id, factor: presentacion.factorABase })
      .from(presentacion)
      .where(conProductos ? inArray(presentacion.productoId, productoIds) : sql`false`),
    existente ? null : siguienteNumero(tx, "LISTA_COMPRA"),
  ]);
  // Crédito disponible proyectado por proveedor (06 §9.4)
  const disponible = new Map<string, Decimal>();
  for (const o of ofertas) {
    if (o.limite !== null && o.condicion !== "CONTADO" && !disponible.has(o.proveedorId)) disponible.set(o.proveedorId, dec(o.limite).minus(saldos.get(o.proveedorId) ?? "0"));
  }

  const listaId = existente?.id ?? randomUUID();
  const numero = existente ? formatearNumeroDocumento("LC-", existente.numero) : numeroNuevo!.visible;

  const cambios: string[] = [];
  const costos: Decimal[] = [];
  const escrituras: PromiseLike<unknown>[] = [];
  const lineasNuevas: (typeof listaCompraItem.$inferInsert)[] = [];
  for (const prod of productos) {
    const anterior = anteriores.find((a) => a.productoId === prod.id);
    const necesidadBase = necesidad.get(prod.id) ?? "0";
    const compradoBase = comprado.get(prod.id) ?? "0";
    const candidatos: Candidato[] = ofertas
      .filter((o) => o.productoId === prod.id)
      .map((o) => ({
        ofertaId: o.ofertaId,
        proveedorId: o.proveedorId,
        precio: o.precio,
        factor: o.factor,
        costoBase: o.costoBase,
        sinControlDeCredito: o.limite === null || o.condicion === "CONTADO",
        desactualizada: diasEntre(hoyEnEmpresa(o.fecha, e!.zonaHoraria), hoy) > e!.diasAlertaPrecioDesactualizado,
        fechaActualizacion: o.fecha,
      }));
    const pendiente = Decimal.max(dec(necesidadBase).minus(compradoBase), 0);

    // Proveedor: se respeta la asignación manual (RN-050)
    const manual = anterior?.asignacionManual
      ? (candidatos.find((x) => x.ofertaId === anterior.proveedorProductoSugeridoId) ?? candidatos.find((x) => anterior.proveedorSugeridoId !== null && x.proveedorId === anterior.proveedorSugeridoId))
      : undefined;
    // Elegido a mano un puesto que todavía no tiene precio de este producto (o "sin puesto"): queda ese.
    const aManoSinPrecio = Boolean(anterior?.asignacionManual) && !manual;
    const sugerencia = manual
      ? { candidato: manual, alertas: manual.desactualizada ? (["PRECIO_DESACTUALIZADO"] as AlertaLista[]) : [] }
      : aManoSinPrecio
        ? { candidato: null, alertas: [] as AlertaLista[] }
        : sugerirProveedor({
          candidatos,
          estrategia: e!.estrategiaCosto,
          preferidoId: prod.preferidoId,
          ultimoProveedorId: ultimos.find((u) => u.productoId === prod.id)?.proveedorId ?? null,
          pendienteBase: pendiente,
          disponibleProyectado: disponible,
        });
    const oferta = sugerencia.candidato;
    const presentacionId = oferta ? ofertas.find((o) => o.ofertaId === oferta.ofertaId)!.presentacionId : prod.compraDefault;
    const factor = oferta?.factor ?? factores.find((f) => f.id === prod.compraDefault)?.factor ?? "1";
    // El tilde a mano vale mientras no haga falta más que cuando se puso.
    const tildada = Boolean(anterior) && tildeSigueValiendo(anterior!.tildado, anterior!.necesidadBase, necesidadBase) && dec(compradoBase).lt(necesidadBase);
    const tildeVencido = Boolean(anterior?.tildado) && !tildada && dec(compradoBase).lt(necesidadBase);
    const calculo = calcularLineaLista({
      necesidadBase,
      compradoBase,
      factor,
      cantidadManual: anterior?.ajusteManual ? anterior.cantidadPresentaciones : null,
      marcadaNoConseguido: anterior?.estado === "NO_CONSEGUIDO",
      tildada,
    });
    const costo = oferta ? redondearPesos(calculo.cantidadPresentaciones.times(oferta.precio)) : null;
    if (oferta && costo) {
      costos.push(costo);
      const d = disponible.get(oferta.proveedorId);
      if (d !== undefined) disponible.set(oferta.proveedorId, d.minus(costo));
    }
    const necesidadModificada = Boolean(anterior && !dec(anterior.necesidadBase).eq(necesidadBase) && (dec(compradoBase).gt(0) || anterior.ajusteManual || tildeVencido));
    if (anterior && !dec(anterior.necesidadBase).eq(necesidadBase)) cambios.push(`${prod.nombre}: ${dec(anterior.necesidadBase)} → ${dec(necesidadBase)}`);
    if (!anterior && existente) cambios.push(`${prod.nombre}: nuevo (${dec(necesidadBase)})`);

    const valores = {
      necesidadBase: aNumeric(necesidadBase, 3),
      necesidadNetaBase: aNumeric(necesidadBase, 3),
      compradoBase: aNumeric(compradoBase, 3),
      presentacionSugeridaId: presentacionId,
      cantidadPresentaciones: aNumeric(calculo.cantidadPresentaciones, 3),
      aComprarBase: aNumeric(calculo.aComprarBase, 3),
      sobrantePrevistoBase: aNumeric(calculo.sobrantePrevistoBase, 3),
      proveedorSugeridoId: aManoSinPrecio ? (anterior?.proveedorSugeridoId ?? null) : (oferta?.proveedorId ?? null),
      proveedorProductoSugeridoId: oferta?.ofertaId ?? null,
      precioSugerido: oferta ? aNumeric(oferta.precio, 4) : null,
      costoEstimado: costo ? aNumeric(costo, 2) : null,
      estado: calculo.estado,
      tildado: tildada,
      sinPedido: dec(necesidadBase).isZero() && dec(compradoBase).gt(0),
      alertas: sugerencia.alertas,
      necesidadModificada: anterior?.necesidadModificada || necesidadModificada,
      observaciones: necesidades.find((n) => n.productoId === prod.id)?.notas ?? null,
      actualizadoPor: c.usuarioId,
    };
    if (anterior) escrituras.push(tx.update(listaCompraItem).set(valores).where(eq(listaCompraItem.id, anterior.id)));
    else lineasNuevas.push({ ...valores, empresaId: c.empresaId, listaCompraId: listaId, productoId: prod.id, creadoPor: c.usuarioId });
  }

  const version = existente ? existente.version + 1 : 1;
  const costoEstimadoTotal = aNumeric(sumar(costos), 2);
  const aMover = incluidos.filter((p) => p.estado === "CONFIRMADO").map((p) => p.id);
  const fueraDeLista = pedidos.filter((p) => p.estado === "CONFIRMADO" && !aMover.includes(p.id)).length;
  const dia = `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`;
  const cuantos = (n: number) => (n === 1 ? "1 pedido" : `${n} pedidos`);
  // Todo se guarda junto, en una sola ida: primero la lista (si es nueva), después sus renglones.
  await Promise.all([
    existente
      ? tx
          .update(listaCompra)
          .set({ version, desactualizada: false, generadaEn: sql`now()`, generadaPor: c.usuarioId, costoEstimadoTotal, actualizadoPor: c.usuarioId })
          .where(eq(listaCompra.id, listaId))
      : tx
          .insert(listaCompra)
          .values({ id: listaId, empresaId: c.empresaId, numero: numeroNuevo!.numero, jornadaId: j.id, version, costoEstimadoTotal, generadaPor: c.usuarioId, creadoPor: c.usuarioId, actualizadoPor: c.usuarioId }),
    lineasNuevas.length ? tx.insert(listaCompraItem).values(lineasNuevas) : null,
    ...escrituras,
    aMover.length > 0 ? tx.update(pedido).set({ estado: "EN_COMPRA", actualizadoPor: c.usuarioId }).where(inArray(pedido.id, aMover)) : null,
    j.estado === "ABIERTA" ? tx.update(jornada).set({ estado: "COMPRANDO", compraIniciadaEn: sql`now()`, actualizadoPor: c.usuarioId }).where(eq(jornada.id, j.id)) : null,
    auditar(tx, {
      empresaId: c.empresaId,
      usuarioId: c.usuarioId,
      accion: existente ? "MODIFICAR" : "CREAR",
      entidad: "lista_compra",
      entidadId: listaId,
      resumen: `${numero} versión ${version} para el ${fecha}.${cambios.length ? ` Cambios: ${cambios.join("; ")}.` : ""}`,
    }),
    seleccion === null || aMover.length > 0
      ? registrarActividad(tx, c, {
          accion: "ARMAR_LISTA",
          entidadTipo: "LISTA_COMPRA",
          entidadId: listaId,
          jornadaId: j.id,
          resumen: existente
            ? `actualizó la lista de compras del ${dia}${aMover.length ? ` y agregó ${cuantos(aMover.length)}` : ""}`
            : `armó la lista de compras del ${dia} con ${cuantos(incluidos.length)}`,
          // A quien se encarga de comprar le llega el aviso (RN-190).
          paraUsuarioId: c.responsables.en_lista ?? null,
        })
      : null,
  ]);
  return { listaId, numero, version, borradores, cambios, agregados: aMover.length, fueraDeLista };
}

/** P-50: la lista de un día agrupada por proveedor (plan de compra, 04 §5.c.3). */
export async function obtenerListaCompra(db: BaseDatos, authUserId: string, fecha: FechaISO, opciones: { paraComprar?: boolean } = {}): Promise<ListaDeCompra | null> {
  return ejecutarComoUsuario(db, authUserId, "lista_compra.ver", async (tx, c) => {
    const [f] = await tx.select({ j: jornada, lista: listaCompra }).from(jornada).leftJoin(listaCompra, eq(listaCompra.jornadaId, jornada.id)).where(eq(jornada.fecha, fecha));
    if (!f?.lista) return null;
    const { j, lista } = f;
    const verCostos = c.permisos.tiene("precios.ver_costos");
    const verCredito = c.permisos.tiene("proveedores.ver_credito");
    const paraComprar = Boolean(opciones.paraComprar) && c.permisos.tiene("compras.registrar");
    const susProductos = () => tx.select({ id: listaCompraItem.productoId }).from(listaCompraItem).where(eq(listaCompraItem.listaCompraId, lista.id));
    const nada = sql`false`;
    // Los renglones, para quién es cada cosa, el crédito de los puestos, las compras ya anotadas y lo
    // que hace falta para anotar una compra salen juntos (una ida).
    const [filas, destinos, umbrales, saldos, anotadas, ofertas, envases, puestos] = await Promise.all([
      tx
        .select({
          item: listaCompraItem,
          producto: producto.nombre,
          codigo: producto.codigo,
          unidadBase: producto.unidadBase,
          grupo: categoria.grupo,
          categoria: categoria.nombre,
          presentacion: presentacion.nombre,
          factor: presentacion.factorABase,
          proveedor: proveedor.nombre,
          ubicacion: proveedor.ubicacionMercado,
          limite: proveedor.limiteCredito,
          categoriaOrden: categoria.orden,
        })
        .from(listaCompraItem)
        .innerJoin(producto, eq(producto.id, listaCompraItem.productoId))
        .innerJoin(categoria, eq(categoria.id, producto.categoriaId))
        .leftJoin(presentacion, eq(presentacion.id, listaCompraItem.presentacionSugeridaId))
        .leftJoin(proveedor, eq(proveedor.id, listaCompraItem.proveedorSugeridoId))
        .where(eq(listaCompraItem.listaCompraId, lista.id))
        .orderBy(asc(categoria.orden), asc(producto.nombre)),
      // Para quién es cada producto: los pedidos que ya entraron en la lista (y los que siguieron de largo a preparación).
      tx
        .select({ pedidoId: pedido.id, productoId: pedidoItem.productoId, cliente: cliente.nombre, cantidad: sum(pedidoItem.cantidadBase).mapWith(String) })
        .from(pedidoItem)
        .innerJoin(pedido, eq(pedido.id, pedidoItem.pedidoId))
        .innerJoin(cliente, eq(cliente.id, pedido.clienteId))
        .where(and(eq(pedido.jornadaId, j.id), sql`${pedido.estado} not in ('BORRADOR', 'CONFIRMADO', 'CANCELADO')`, eq(pedidoItem.cancelado, false)))
        .groupBy(pedido.id, pedidoItem.productoId, cliente.nombre)
        .orderBy(asc(cliente.nombre)),
      umbralesSemaforo(tx),
      verCredito ? saldosNetos(tx) : new Map<string, string>(),
      tx
        .select({
          productoId: compraItem.productoId,
          proveedor: proveedor.nombre,
          presentacion: presentacion.nombre,
          cantidad: compraItem.cantidad,
          precio: compraItem.precioUnitario,
          total: compra.total,
          // Lo pagado de la compra: lo que le imputaron los pagos vigentes.
          imputado: sql<string>`coalesce((select sum(i.monto) from ${imputacionPagoProveedor} i where i.compra_id = "compra"."id" and i.activa), 0)`,
        })
        .from(compraItem)
        .innerJoin(compra, and(eq(compra.id, compraItem.compraId), eq(compra.estado, "REGISTRADA")))
        .innerJoin(proveedor, eq(proveedor.id, compra.proveedorId))
        .innerJoin(presentacion, eq(presentacion.id, compraItem.presentacionId))
        .where(eq(compra.jornadaId, j.id))
        .orderBy(asc(compra.fechaCompra)),
      tx
        .select({ ofertaId: proveedorProducto.id, productoId: proveedorProducto.productoId, proveedorId: proveedorProducto.proveedorId, presentacionId: proveedorProducto.presentacionId, precio: proveedorProducto.precioVigente, factor: presentacion.factorABase })
        .from(proveedorProducto)
        .innerJoin(proveedor, and(eq(proveedor.id, proveedorProducto.proveedorId), eq(proveedor.activo, true)))
        .innerJoin(presentacion, eq(presentacion.id, proveedorProducto.presentacionId))
        .where(paraComprar ? and(inArray(proveedorProducto.productoId, susProductos()), eq(proveedorProducto.activo, true)) : nada)
        .orderBy(asc(proveedorProducto.costoBase)),
      tx
        .select({ id: presentacion.id, productoId: presentacion.productoId, nombre: presentacion.nombre, factor: presentacion.factorABase })
        .from(presentacion)
        .where(paraComprar ? and(inArray(presentacion.productoId, susProductos()), eq(presentacion.activo, true), eq(presentacion.usableEnCompra, true)) : nada)
        .orderBy(asc(presentacion.factorABase)),
      tx
        .select({ id: proveedor.id, nombre: proveedor.nombre, condicion: proveedor.condicionPagoHabitual })
        .from(proveedor)
        .where(paraComprar ? eq(proveedor.activo, true) : nada)
        .orderBy(asc(proveedor.nombre)),
    ]);
    const paraQuien = (productoId: string) => {
      const porCliente = new Map<string, string>();
      for (const d of destinos.filter((x) => x.productoId === productoId)) porCliente.set(d.cliente, dec(porCliente.get(d.cliente) ?? "0").plus(d.cantidad).toString());
      return [...porCliente].map(([nombre, cantidadBase]) => ({ cliente: nombre, cantidadBase }));
    };

    const lineas = filas
      .filter((f) => !(dec(f.item.necesidadBase).isZero() && dec(f.item.compradoBase).isZero()))
      .map(
        (f): LineaDeLista => ({
          id: f.item.id,
          productoId: f.item.productoId,
          producto: f.producto,
          codigo: f.codigo,
          grupo: f.grupo,
          categoria: f.categoria,
          categoriaOrden: f.categoriaOrden ?? 0,
          paraQuien: paraQuien(f.item.productoId),
          unidadBase: f.unidadBase,
          necesidadBase: f.item.necesidadBase,
          compradoBase: f.item.compradoBase,
          pendienteBase: Decimal.max(dec(f.item.necesidadNetaBase).minus(f.item.compradoBase), 0).toString(),
          presentacionId: f.item.presentacionSugeridaId,
          presentacion: f.presentacion,
          factor: f.factor ?? "1",
          cantidadPresentaciones: f.item.cantidadPresentaciones,
          aComprarBase: f.item.aComprarBase,
          // Ya comprado: el sobrante es el real (lo que se compró de más), no el previsto.
          sobrantePrevistoBase:
            f.item.estado === "COMPRADO" ? Decimal.max(dec(f.item.compradoBase).minus(f.item.necesidadNetaBase), 0).toFixed(3) : f.item.sobrantePrevistoBase,
          ajusteManual: f.item.ajusteManual,
          motivoAjuste: f.item.motivoAjuste,
          proveedorId: f.item.proveedorSugeridoId,
          proveedor: f.proveedor,
          ubicacion: f.ubicacion,
          asignacionManual: f.item.asignacionManual,
          precioSugerido: verCostos ? f.item.precioSugerido : null,
          costoEstimado: verCostos ? f.item.costoEstimado : null,
          estado: f.item.estado,
          motivoNoConseguido: f.item.motivoNoConseguido,
          tildado: f.item.tildado,
          sinPedido: f.item.sinPedido,
          alertas: f.item.alertas as AlertaLista[],
          necesidadModificada: f.item.necesidadModificada,
          ordenManual: f.item.ordenManual,
          observaciones: f.item.observaciones,
          compras: anotadas
            .filter((a) => a.productoId === f.item.productoId)
            .map((a) => ({ proveedor: a.proveedor, presentacion: a.presentacion, cantidad: a.cantidad, precio: verCostos ? a.precio : null, aCuenta: dec(a.total).minus(a.imputado).gt(0) })),
          ofertas: ofertas.filter((o) => o.productoId === f.item.productoId).map((o) => ({ ofertaId: o.ofertaId, proveedorId: o.proveedorId, presentacionId: o.presentacionId, precio: o.precio, factor: o.factor })),
          envases: envases.filter((e) => e.productoId === f.item.productoId).map((e) => ({ id: e.id, nombre: e.nombre, factor: e.factor })),
        }),
      );
    const limites = new Map(filas.map((f) => [f.item.proveedorSugeridoId, f.limite]));

    const grupos = new Map<string, LineaDeLista[]>();
    for (const l of lineas) grupos.set(l.proveedorId ?? "", [...(grupos.get(l.proveedorId ?? "") ?? []), l]);
    const plan: PlanProveedor[] = [];
    for (const [provId, ls] of grupos) {
      const subtotal = sumar(ls.filter((l) => l.estado !== "COMPRADO").map((l) => l.costoEstimado ?? "0"));
      let credito: PlanProveedor["credito"] = null;
      if (verCredito && provId) {
        const neto = saldos.get(provId) ?? "0";
        const limite = limites.get(provId) ?? null;
        const despues = indicadoresCredito(dec(neto).plus(subtotal), limite, umbrales);
        credito = {
          disponibleHoy: limite === null ? null : dec(limite).minus(neto).toString(),
          disponibleDespues: despues.disponible?.toString() ?? null,
          semaforoProyectado: despues.semaforo,
        };
      }
      plan.push({
        proveedorId: provId || null,
        proveedor: ls[0]!.proveedor ?? "Sin proveedor",
        ubicacion: ls[0]!.ubicacion,
        lineas: ls,
        subtotal: verCostos ? subtotal.toFixed(2) : null,
        credito,
      });
    }
    plan.sort((a, b) => (a.proveedorId === null ? 1 : b.proveedorId === null ? -1 : (a.ubicacion ?? a.proveedor).localeCompare(b.ubicacion ?? b.proveedor, "es", { numeric: true })));

    return {
      id: lista.id,
      numero: formatearNumeroDocumento("LC-", lista.numero),
      jornadaId: j.id,
      fecha,
      estadoJornada: j.estado,
      version: lista.version,
      desactualizada: lista.desactualizada,
      generadaEn: lista.generadaEn,
      costoEstimadoTotal: verCostos ? lista.costoEstimadoTotal : null,
      pedidos: new Set(destinos.map((d) => d.pedidoId)).size,
      plan,
      proveedores: puestos.map((p) => ({ id: p.id, nombre: p.nombre, aCuenta: p.condicion !== "CONTADO" })),
    };
  });
}

const esquemaCambioLinea = z.object({
  itemId: z.uuid(),
  /** Cantidad de presentaciones a comprar fijada a mano (con motivo). Vacío = volver al cálculo. */
  cantidad: numeroObligatorio("Escribí cuántos bultos comprar.").nullish(),
  motivo: textoOpcional(200),
  /** Otra oferta (proveedor y presentación) para esta línea. */
  ofertaId: z.uuid().nullish(),
});

/** Cambios del comprador en una línea (RN-050): cantidad a mano con motivo o proveedor elegido a mano. */
export async function cambiarLineaLista(db: BaseDatos, authUserId: string, datos: z.input<typeof esquemaCambioLinea>): Promise<void> {
  const d = validar(esquemaCambioLinea, datos);
  await ejecutarComoUsuario(db, authUserId, "lista_compra.editar", async (tx, c) => {
    const [l] = await tx.select().from(listaCompraItem).where(eq(listaCompraItem.id, d.itemId)).for("update");
    if (!l) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró la línea.");
    let oferta = null as null | { id: string; proveedorId: string; presentacionId: string; precio: string; factor: string };
    if (d.ofertaId) {
      const [o] = await tx
        .select({ id: proveedorProducto.id, proveedorId: proveedorProducto.proveedorId, presentacionId: proveedorProducto.presentacionId, precio: proveedorProducto.precioVigente, factor: presentacion.factorABase })
        .from(proveedorProducto)
        .innerJoin(presentacion, eq(presentacion.id, proveedorProducto.presentacionId))
        .where(and(eq(proveedorProducto.id, d.ofertaId), eq(proveedorProducto.productoId, l.productoId), eq(proveedorProducto.activo, true)));
      if (!o) throw new ErrorDeNegocio("VALIDACION", "Ese proveedor no tiene oferta activa para este producto.");
      oferta = o;
    }
    const manual = d.cantidad !== undefined && d.cantidad !== null;
    if (manual && dec(d.cantidad!).lt(0)) throw new ErrorDeNegocio("VALIDACION", "La cantidad no puede ser negativa.");
    if (manual && (!d.motivo || d.motivo.length < 3)) throw new ErrorDeNegocio("VALIDACION", "Anotá por qué cambiás la cantidad (ej. un cajón de más por las dudas).");
    const factor = oferta?.factor ?? (l.cantidadPresentaciones && l.aComprarBase && !dec(l.cantidadPresentaciones).isZero() ? dec(l.aComprarBase).div(l.cantidadPresentaciones).toString() : "1");
    const precio = oferta?.precio ?? l.precioSugerido;
    const calculo = calcularLineaLista({
      necesidadBase: l.necesidadNetaBase,
      compradoBase: l.compradoBase,
      factor,
      cantidadManual: manual ? d.cantidad! : l.ajusteManual && !oferta ? l.cantidadPresentaciones : null,
      marcadaNoConseguido: l.estado === "NO_CONSEGUIDO",
      tildada: l.tildado,
    });
    await tx
      .update(listaCompraItem)
      .set({
        cantidadPresentaciones: aNumeric(calculo.cantidadPresentaciones, 3),
        aComprarBase: aNumeric(calculo.aComprarBase, 3),
        sobrantePrevistoBase: aNumeric(calculo.sobrantePrevistoBase, 3),
        ajusteManual: manual || (l.ajusteManual && !oferta),
        motivoAjuste: manual ? d.motivo : l.motivoAjuste,
        ...(oferta && {
          proveedorSugeridoId: oferta.proveedorId,
          proveedorProductoSugeridoId: oferta.id,
          presentacionSugeridaId: oferta.presentacionId,
          asignacionManual: true,
          alertas: [],
        }),
        precioSugerido: precio,
        costoEstimado: precio ? aNumeric(redondearPesos(calculo.cantidadPresentaciones.times(precio)), 2) : null,
        actualizadoPor: c.usuarioId,
      })
      .where(eq(listaCompraItem.id, l.id));
  });
}

/**
 * Elegir en qué puesto se va a comprar un renglón (pedido del usuario, 10/10/2026: "elegir puesto en
 * lista de compras para comprar más rápido"). Nulo = sin puesto (se compra en efectivo donde sea). Si
 * ese puesto ya lo vende, toma su último precio y su envase; si no, queda el puesto sin precio. Queda
 * elegido a mano: al rearmar la lista se respeta (RN-050, RN-187).
 */
export async function elegirPuestoDeLinea(db: BaseDatos, authUserId: string, datos: { itemId: string; proveedorId: string | null }): Promise<void> {
  const d = validar(z.object({ itemId: z.uuid(), proveedorId: z.uuid().nullable() }), datos);
  await ejecutarComoUsuario(db, authUserId, "lista_compra.editar", async (tx, c) => {
    const f = await renglonBloqueado(tx, d.itemId);
    if (!f) throw new ErrorDeNegocio("NO_ENCONTRADO", "Ese producto ya no está en la lista de compras: recargá la página.");
    const { l } = f;
    const [[p], [o]] = await Promise.all([
      tx.select({ nombre: proveedor.nombre }).from(proveedor).where(d.proveedorId ? and(eq(proveedor.id, d.proveedorId), eq(proveedor.activo, true)) : sql`false`),
      tx
        .select({ id: proveedorProducto.id, precio: proveedorProducto.precioVigente, presentacionId: proveedorProducto.presentacionId, factor: presentacion.factorABase })
        .from(proveedorProducto)
        .innerJoin(presentacion, eq(presentacion.id, proveedorProducto.presentacionId))
        .where(d.proveedorId ? and(eq(proveedorProducto.proveedorId, d.proveedorId), eq(proveedorProducto.productoId, l.productoId), eq(proveedorProducto.activo, true)) : sql`false`)
        .orderBy(asc(proveedorProducto.costoBase))
        .limit(1),
    ]);
    if (d.proveedorId && !p) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró ese puesto (puede que lo hayan dado de baja).");
    const calculo = o
      ? calcularLineaLista({
          necesidadBase: l.necesidadNetaBase,
          compradoBase: l.compradoBase,
          factor: o.factor,
          cantidadManual: null,
          marcadaNoConseguido: l.estado === "NO_CONSEGUIDO",
          tildada: l.tildado,
        })
      : null;
    await Promise.all([
      tx
        .update(listaCompraItem)
        .set({
          proveedorSugeridoId: d.proveedorId,
          proveedorProductoSugeridoId: o?.id ?? null,
          asignacionManual: true,
          alertas: [],
          ...(o && calculo
            ? {
                presentacionSugeridaId: o.presentacionId,
                cantidadPresentaciones: aNumeric(calculo.cantidadPresentaciones, 3),
                aComprarBase: aNumeric(calculo.aComprarBase, 3),
                sobrantePrevistoBase: aNumeric(calculo.sobrantePrevistoBase, 3),
                ajusteManual: false,
                precioSugerido: aNumeric(o.precio, 4),
                costoEstimado: aNumeric(redondearPesos(calculo.cantidadPresentaciones.times(o.precio)), 2),
              }
            : { precioSugerido: null, costoEstimado: null }),
          actualizadoPor: c.usuarioId,
        })
        .where(eq(listaCompraItem.id, l.id)),
      registrarActividad(tx, c, {
        accion: "MODIFICAR",
        entidadTipo: "LISTA_COMPRA",
        entidadId: l.listaCompraId,
        jornadaId: f.jornadaId,
        resumen: p ? `eligió comprar ${f.producto} en ${p.nombre}` : `dejó ${f.producto} sin puesto (en efectivo)`,
      }),
    ]);
  });
}

/** Un renglón de la lista, bloqueado hasta el final, con el nombre de su producto y su día (una sola consulta). */
async function renglonBloqueado(tx: Transaccion, itemId: string) {
  const [f] = await tx
    .select({ l: listaCompraItem, producto: producto.nombre, jornadaId: listaCompra.jornadaId })
    .from(listaCompraItem)
    .innerJoin(producto, eq(producto.id, listaCompraItem.productoId))
    .innerJoin(listaCompra, eq(listaCompra.id, listaCompraItem.listaCompraId))
    .where(eq(listaCompraItem.id, itemId))
    .for("update", { of: listaCompraItem });
  return f ?? null;
}

/** "No se consiguió" con motivo (RN-051); `motivo` nulo quita la marca. */
export async function marcarNoConseguido(db: BaseDatos, authUserId: string, datos: { itemId: string; motivo: string | null }): Promise<void> {
  await ejecutarComoUsuario(db, authUserId, "lista_compra.editar", async (tx, c) => {
    const f = await renglonBloqueado(tx, datos.itemId);
    if (!f) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró la línea.");
    const { l } = f;
    const motivo = datos.motivo?.trim() ?? null;
    if (motivo !== null && motivo.length < 3) throw new ErrorDeNegocio("VALIDACION", "Anotá por qué no se consiguió (ej. no había en el mercado).");
    // Marcarlo como no conseguido le saca el tilde de comprado; sacarle la marca lo deja como estaba.
    const estado = estadoLineaLista(l.necesidadNetaBase, l.compradoBase, motivo !== null, motivo === null && l.tildado);
    if (motivo !== null && estado !== "NO_CONSEGUIDO") throw new ErrorDeNegocio("VALIDACION", "Ese producto ya está comprado.");
    await Promise.all([
      tx
        .update(listaCompraItem)
        .set({ estado, motivoNoConseguido: motivo, tildado: motivo === null && l.tildado, actualizadoPor: c.usuarioId })
        .where(eq(listaCompraItem.id, l.id)),
      motivo !== null && l.estado !== "NO_CONSEGUIDO"
        ? registrarActividad(tx, c, {
            accion: "NO_CONSEGUIDO",
            entidadTipo: "LISTA_COMPRA",
            entidadId: l.listaCompraId,
            jornadaId: f.jornadaId,
            resumen: `anotó que no se consiguió ${f.producto}`,
          })
        : null,
    ]);
  });
}

/** Ofertas activas de un producto, para elegir otro proveedor en una línea de la lista. */
export async function ofertasParaLinea(db: BaseDatos, authUserId: string, productoIds: string[]) {
  if (productoIds.length === 0) return [];
  return ejecutarComoUsuario(db, authUserId, "lista_compra.ver", async (tx) =>
    tx
      .select({
        ofertaId: proveedorProducto.id,
        productoId: proveedorProducto.productoId,
        proveedorId: proveedorProducto.proveedorId,
        proveedor: proveedor.nombre,
        ubicacion: proveedor.ubicacionMercado,
        condicionHabitual: proveedor.condicionPagoHabitual,
        presentacionId: proveedorProducto.presentacionId,
        presentacion: presentacion.nombre,
        factor: presentacion.factorABase,
        precio: proveedorProducto.precioVigente,
        costoBase: proveedorProducto.costoBase,
      })
      .from(proveedorProducto)
      .innerJoin(proveedor, and(eq(proveedor.id, proveedorProducto.proveedorId), eq(proveedor.activo, true)))
      .innerJoin(presentacion, eq(presentacion.id, proveedorProducto.presentacionId))
      .where(and(inArray(proveedorProducto.productoId, productoIds), eq(proveedorProducto.activo, true)))
      .orderBy(asc(proveedorProducto.costoBase)),
  );
}

// ——— Tildes de "comprado" sin anotar la compra (tablero y lista, 06/10/2026) ———

/** Productos de la jornada tildados a mano como comprados: al preparar cuentan como si alcanzaran. */
export async function productosTildados(tx: Transaccion, jornadaId: string): Promise<Set<string>> {
  const filas = await tx
    .select({ productoId: listaCompraItem.productoId })
    .from(listaCompraItem)
    .innerJoin(listaCompra, eq(listaCompra.id, listaCompraItem.listaCompraId))
    .where(and(eq(listaCompra.jornadaId, jornadaId), eq(listaCompraItem.tildado, true)));
  return new Set(filas.map((f) => f.productoId));
}

/**
 * Tilda (o destilda) un producto de la lista como comprado, sin anotar en qué puesto ni a cuánto.
 * Sirve para ir marcando desde la tarjeta del tablero o con la lista impresa; la compra con su
 * precio se puede anotar después con "✓ Lo compré".
 */
export async function tildarLinea(db: BaseDatos, authUserId: string, datos: { itemId: string; tildado: boolean }): Promise<{ producto: string; estado: EstadoLineaLista }> {
  const d = validar(z.object({ itemId: z.uuid(), tildado: z.boolean() }), datos);
  return ejecutarComoUsuario(db, authUserId, "lista_compra.editar", async (tx, c) => {
    const f = await renglonBloqueado(tx, d.itemId);
    if (!f) throw new ErrorDeNegocio("NO_ENCONTRADO", "Ese producto ya no está en la lista de compras: recargá la página.");
    const { l, producto: nombre } = f;
    const yaComprado = dec(l.compradoBase).gte(l.necesidadNetaBase) && dec(l.necesidadNetaBase).gt(0);
    if (!d.tildado && !l.tildado && yaComprado) {
      // Se puede destildar igual: la pantalla pide confirmar y anula la compra (RN-186, `destildarConCompra`).
      throw new ErrorDeNegocio("VALIDACION", `${nombre} ya tiene la compra anotada. Para destildarlo se anula esa compra (y lo que se le pagó en el momento): tocá “Confirmar”.`, { requiereConfirmacion: true });
    }
    const tildado = d.tildado && !yaComprado;
    const estado = estadoLineaLista(l.necesidadNetaBase, l.compradoBase, false, tildado);
    if (l.tildado === tildado && l.estado === estado) return { producto: nombre, estado };
    // El renglón y el registro de quién lo tildó se guardan juntos (una ida a la base).
    await Promise.all([
      // Al tildarlo, la persona ya miró que alcanza: se va el aviso de "cambió un pedido después de comprar".
      tx
        .update(listaCompraItem)
        .set({ tildado, estado, motivoNoConseguido: null, ...(tildado ? { necesidadModificada: false } : {}), actualizadoPor: c.usuarioId })
        .where(eq(listaCompraItem.id, l.id)),
      registrarActividad(tx, c, {
        accion: "TILDAR",
        entidadTipo: "LISTA_COMPRA",
        entidadId: l.listaCompraId,
        jornadaId: f.jornadaId,
        resumen: d.tildado ? `tildó como comprado: ${nombre}` : `volvió a dejar por comprar: ${nombre}`,
      }),
    ]);
    return { producto: nombre, estado };
  });
}

async function pedidoEnLaLista(tx: Transaccion, pedidoId: string) {
  const [p] = await tx
    .select({ id: pedido.id, numero: pedido.numero, estado: pedido.estado, jornadaId: pedido.jornadaId, clienteId: pedido.clienteId, fecha: jornada.fecha, listaId: listaCompra.id })
    .from(pedido)
    .innerJoin(jornada, eq(jornada.id, pedido.jornadaId))
    .leftJoin(listaCompra, eq(listaCompra.jornadaId, pedido.jornadaId))
    .where(eq(pedido.id, pedidoId))
    .for("update", { of: pedido });
  if (!p) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el pedido: puede que lo hayan cancelado. Recargá la página.");
  if (p.estado !== "EN_COMPRA") throw new ErrorDeNegocio("TRANSICION_INVALIDA", "Ese pedido no está en la lista de compras.");
  const suyos = () => tx.selectDistinct({ id: pedidoItem.productoId }).from(pedidoItem).where(and(eq(pedidoItem.pedidoId, p.id), eq(pedidoItem.cancelado, false)));
  // Lo que lleva y sus renglones en la lista (bloqueados) salen juntos.
  const [productos, lineas] = await Promise.all([
    suyos(),
    tx
      .select()
      .from(listaCompraItem)
      .where(p.listaId ? and(eq(listaCompraItem.listaCompraId, p.listaId), inArray(listaCompraItem.productoId, suyos())) : sql`false`)
      .for("update"),
  ]);
  return { pedido: p, lineas, faltanEnLista: productos.some((x) => !lineas.some((l) => l.productoId === x.id)) };
}

/**
 * Pasar una tarjeta a "Retiro" sin tildar producto por producto: todo lo suyo que faltaba queda
 * tildado como comprado (lo marcado "no se consiguió" queda así). Devuelve cuántos productos tildó.
 */
export async function marcarPedidoComprado(db: BaseDatos, authUserId: string, pedidoId: string): Promise<number> {
  return ejecutarComoUsuario(db, authUserId, "lista_compra.editar", async (tx, c) => {
    let { pedido: p, lineas, faltanEnLista } = await pedidoEnLaLista(tx, pedidoId);
    // Si el pedido cambió después de armar la lista, primero se pone al día para que no quede nada afuera.
    if (faltanEnLista) {
      await armarLista(tx, c, p.fecha, []);
      ({ pedido: p, lineas, faltanEnLista } = await pedidoEnLaLista(tx, pedidoId));
    }
    const faltan = lineas.filter((l) => l.estado === "PENDIENTE" || l.estado === "PARCIAL");
    if (faltan.length === 0) return 0;
    await Promise.all([
      tx
        .update(listaCompraItem)
        .set({ tildado: true, estado: "COMPRADO", motivoNoConseguido: null, necesidadModificada: false, actualizadoPor: c.usuarioId })
        .where(inArray(listaCompraItem.id, faltan.map((l) => l.id))),
      registrarActividad(tx, c, {
        accion: "TILDAR",
        entidadTipo: "PEDIDO",
        entidadId: p.id,
        jornadaId: p.jornadaId,
        // Con la columna Retiro guardada no hay a quién pasarle ese paso: sigue la preparación, que avisa por su cuenta.
        resumen: `${RETIRO_A_LA_VISTA ? "pasó a Retiro" : "marcó como comprado"} el pedido ${formatearNumeroDocumento("PED-", p.numero)} (${faltan.length === 1 ? "1 producto tildado" : `${faltan.length} productos tildados`})`,
        paraUsuarioId: RETIRO_A_LA_VISTA ? (c.responsables.comprados ?? null) : null,
      }),
    ]);
    return faltan.length;
  });
}

/** Devolver una tarjeta de "Retiro" a la lista de compras: saca los tildes puestos a mano en lo suyo. */
export async function desmarcarPedidoComprado(db: BaseDatos, authUserId: string, pedidoId: string): Promise<number> {
  return ejecutarComoUsuario(db, authUserId, "lista_compra.editar", async (tx, c) => {
    const { pedido: p, lineas } = await pedidoEnLaLista(tx, pedidoId);
    const tildadas = lineas.filter((l) => l.tildado);
    if (tildadas.length === 0) {
      throw new ErrorDeNegocio("VALIDACION", "No hay tildes para sacar: lo de este pedido ya tiene la compra anotada (o se marcó como no conseguido). Para deshacer una compra, anulala desde “Compras anotadas”.", {
        enlace: { href: "/compras", texto: "Ver las compras anotadas" },
      });
    }
    await Promise.all([
      ...tildadas.map((l) =>
        tx
          .update(listaCompraItem)
          .set({ tildado: false, estado: estadoLineaLista(l.necesidadNetaBase, l.compradoBase, false), actualizadoPor: c.usuarioId })
          .where(eq(listaCompraItem.id, l.id)),
      ),
      registrarActividad(tx, c, {
        accion: "TILDAR",
        entidadTipo: "PEDIDO",
        entidadId: p.id,
        jornadaId: p.jornadaId,
        resumen: `devolvió a la lista de compras el pedido ${formatearNumeroDocumento("PED-", p.numero)}`,
      }),
    ]);
    return tildadas.length;
  });
}

// ——— La lista de compras en una planilla (06/10/2026) ———

const ESTADO_EN_PALABRAS: Readonly<Record<EstadoLineaLista, string>> = { PENDIENTE: "Falta comprar", PARCIAL: "Falta una parte", COMPRADO: "Comprado", NO_CONSEGUIDO: "No se consiguió" };

/**
 * La lista de compras de un día para bajarla a Excel (o CSV): una fila por producto, en el orden
 * de los puestos, con cuánto hay que comprar, dónde conviene, para quién es y cómo va. Los precios
 * salen solo para quien puede ver costos. Null si ese día no tiene lista.
 */
export async function hojaDeListaDeCompras(db: BaseDatos, authUserId: string, fecha: FechaISO): Promise<{ nombre: string; columnas: string[]; filas: (string | { numero: string } | null)[][] } | null> {
  const lista = await obtenerListaCompra(db, authUserId, fecha);
  if (!lista) return null;
  const conPrecios = lista.costoEstimadoTotal !== null;
  const numero = (v: string | null) => (v === null ? null : { numero: dec(v).toString() });
  return {
    nombre: `Lista de compras ${fecha.slice(8, 10)}-${fecha.slice(5, 7)}`,
    columnas: ["Puesto", "Código", "Producto", "Comprar", "Envase", "Se necesita", "Unidad", "Para quién", ...(conPrecios ? ["Precio del envase", "Se calcula gastar"] : []), "Cómo va", "Ya comprado", "Notas"],
    filas: lista.plan.flatMap((p) =>
      p.lineas.map((l) => {
        const unidad = l.unidadBase.toLowerCase();
        return [
          p.proveedorId ? p.proveedor : "Sin puesto",
          l.codigo,
          l.producto,
          numero(l.presentacion && l.cantidadPresentaciones ? l.cantidadPresentaciones : l.pendienteBase),
          l.presentacion ?? unidad,
          numero(l.necesidadBase),
          unidad,
          l.paraQuien.map((q) => `${q.cliente} (${dec(q.cantidadBase).toString().replace(".", ",")})`).join(" · ") || null,
          ...(conPrecios ? [numero(l.precioSugerido), numero(l.costoEstimado)] : []),
          l.tildado ? "Tildado como comprado" : ESTADO_EN_PALABRAS[l.estado],
          numero(l.compradoBase),
          [l.motivoNoConseguido, l.observaciones].filter(Boolean).join(" / ") || null,
        ];
      }),
    ),
  };
}

/** Guarda el orden puesto a mano (arrastrando) en la lista de un día: el lugar de cada producto. */
export async function ordenarLista(db: BaseDatos, authUserId: string, datos: { fecha: FechaISO; itemIds: readonly string[] }): Promise<void> {
  const d = validar(z.object({ fecha: z.string(), itemIds: z.array(z.uuid()).min(1).max(2000) }), datos);
  await ejecutarComoUsuario(db, authUserId, "lista_compra.editar", async (tx, c) => {
    const j = await jornadaDeFecha(tx, d.fecha);
    const [lista] = j ? await tx.select({ id: listaCompra.id }).from(listaCompra).where(eq(listaCompra.jornadaId, j.id)) : [];
    if (!lista) throw new ErrorDeNegocio("NO_ENCONTRADO", "Ese día todavía no tiene lista de compras: armala primero.");
    await Promise.all(
      d.itemIds.map((id, i) =>
        tx
          .update(listaCompraItem)
          .set({ ordenManual: i + 1, actualizadoPor: c.usuarioId })
          .where(and(eq(listaCompraItem.id, id), eq(listaCompraItem.listaCompraId, lista.id))),
      ),
    );
  });
}
