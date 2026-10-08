import { and, asc, count, desc, eq, gte, inArray, ne, notInArray, sql } from "drizzle-orm";
import { z } from "zod";

import { categoria, cliente, jornada, pedido, pedidoItem, presentacion, producto, puntoEntrega } from "@/db/esquema";
import type { BaseDatos } from "@/db/tipos";
import { ErrorDeNegocio } from "@/dominio/errores";
import type { UnidadMedida } from "@/dominio/dinero/formato";
import type { FechaISO } from "@/dominio/fechas/fechas";
import { juntarLineas, type LineaElegida, type PresentacionDeVenta } from "@/dominio/pedidos/carga";
import type { PrioridadPedido } from "@/dominio/pedidos/tablero";
import type { EstadoPedido } from "@/dominio/precios/venta";
import { ejecutarComoUsuario } from "@/modulos/seguridad/contexto";
import { validar } from "@/modulos/validacion";

import { hoyYSugeridaDe } from "./jornadas";
import { numeroPedido } from "./pedidos";

// Lo que necesita la carga visual de pedidos: los clientes en recuadros (con lo que suelen pedir y
// su último pedido para repetirlo), los productos con sus envases de venta y, al cambiar un
// pedido, lo que ya lleva.

export interface ClienteParaCargar {
  id: string;
  nombre: string;
  tipo: string;
  direccion: string | null;
  puntos: { id: string; nombre: string; direccion: string; esPrincipal: boolean }[];
  /** Lo que se le sugiere: los productos de sus pedidos frecuentes (los marcados con la estrella) o, si no marcó ninguno, los que más pide. */
  habituales: string[];
  /** Las sugerencias salen de pedidos marcados como frecuentes. */
  deFrecuentes: boolean;
  /** Su último pedido (para "Repetir el último pedido"). */
  ultimo: { numero: string; fecha: FechaISO; lineas: LineaElegida[] } | null;
  /** Pedidos que ya tiene de hoy en adelante (para avisar antes de cargarle otro el mismo día). */
  abiertos: { id: string; numero: string; fecha: FechaISO; estado: EstadoPedido }[];
}

export interface ProductoParaCargar {
  id: string;
  /** Código del producto: también sirve para buscarlo. */
  codigo: string;
  nombre: string;
  grupo: string | null;
  categoria: string | null;
  unidadBase: UnidadMedida;
  admiteFraccion: boolean;
  presentaciones: PresentacionDeVenta[];
  presentacionDefectoId: string | null;
  /** Cuándo se pidió por última vez (cualquier cliente), para listar primero lo más reciente; nulo si nunca. */
  ultimaVez: string | null;
}

export interface PedidoParaCambiar {
  id: string;
  numero: string;
  estado: EstadoPedido;
  fecha: FechaISO;
  clienteId: string;
  puntoEntregaId: string;
  prioridad: PrioridadPedido;
  entregaDesde: string | null;
  entregaHasta: string | null;
  observaciones: string | null;
  lineas: LineaElegida[];
}

export interface DatosDeCarga {
  hoy: FechaISO;
  /** El día para el que se toman pedidos ahora (según la hora de corte). */
  sugerida: FechaISO;
  /** Días que ya están cerrados (no admiten pedidos). */
  cerrados: FechaISO[];
  clientes: ClienteParaCargar[];
  productos: ProductoParaCargar[];
  pedido: PedidoParaCambiar | null;
}

const MAX_HABITUALES = 12;
const hora = (t: string | null) => t?.slice(0, 5) ?? null;

export async function datosParaCargarPedido(db: BaseDatos, authUserId: string, opciones: { pedidoId?: string } = {}): Promise<DatosDeCarga> {
  return ejecutarComoUsuario(db, authUserId, "pedidos.ver", async (tx, c) => {
    c.permisos.exigir(opciones.pedidoId ? "pedidos.editar" : "pedidos.crear");
    const { hoy, sugerida } = hoyYSugeridaDe(c);
    // El último pedido de cada cliente con productos, para repetirlo.
    const ultimoDeCadaCliente = () =>
      tx
        .selectDistinctOn([pedido.clienteId], { id: pedido.id, clienteId: pedido.clienteId, numero: pedido.numero, fecha: jornada.fecha })
        .from(pedido)
        .innerJoin(jornada, eq(jornada.id, pedido.jornadaId))
        .where(and(ne(pedido.estado, "CANCELADO"), opciones.pedidoId ? ne(pedido.id, opciones.pedidoId) : undefined))
        .orderBy(pedido.clienteId, desc(jornada.fecha), desc(pedido.numero));
    const idsDeUltimos = tx
      .selectDistinctOn([pedido.clienteId], { id: pedido.id })
      .from(pedido)
      .innerJoin(jornada, eq(jornada.id, pedido.jornadaId))
      .where(and(ne(pedido.estado, "CANCELADO"), opciones.pedidoId ? ne(pedido.id, opciones.pedidoId) : undefined))
      .orderBy(pedido.clienteId, desc(jornada.fecha), desc(pedido.numero));
    const sinPedido = sql`false`;

    // Todo sale junto, en una sola ida a la base.
    const [clientes, puntos, frecuencia, abiertos, productos, presentaciones, cerrados, ultimos, lineasDeUltimos, [p], lineasDelPedido] = await Promise.all([
      tx.select({ id: cliente.id, nombre: cliente.nombre, tipo: cliente.tipoCliente }).from(cliente).where(eq(cliente.activo, true)).orderBy(asc(cliente.nombre)),
      tx
        .select({ id: puntoEntrega.id, clienteId: puntoEntrega.clienteId, nombre: puntoEntrega.nombre, direccion: puntoEntrega.direccion, localidad: puntoEntrega.localidad, esPrincipal: puntoEntrega.esPrincipal })
        .from(puntoEntrega)
        .where(eq(puntoEntrega.activo, true))
        .orderBy(desc(puntoEntrega.esPrincipal), asc(puntoEntrega.nombre)),
      tx
        .select({
          clienteId: pedido.clienteId,
          productoId: pedidoItem.productoId,
          veces: count(),
          // En cuántos pedidos marcados como frecuentes (con la estrella) está.
          marcadas: sql<number>`count(*) filter (where ${pedido.frecuente})`,
          ultima: sql<string>`max(${pedido.creadoEn})::text`,
        })
        .from(pedidoItem)
        .innerJoin(pedido, eq(pedido.id, pedidoItem.pedidoId))
        .where(and(ne(pedido.estado, "CANCELADO"), eq(pedidoItem.cancelado, false)))
        .groupBy(pedido.clienteId, pedidoItem.productoId),
      tx
        .select({ id: pedido.id, numero: pedido.numero, clienteId: pedido.clienteId, estado: pedido.estado, fecha: jornada.fecha })
        .from(pedido)
        .innerJoin(jornada, eq(jornada.id, pedido.jornadaId))
        .where(and(gte(jornada.fecha, hoy), notInArray(pedido.estado, ["CANCELADO", "ENTREGADO"])))
        .orderBy(asc(jornada.fecha), asc(pedido.numero)),
      tx
        .select({
          id: producto.id,
          codigo: producto.codigo,
          nombre: producto.nombre,
          unidadBase: producto.unidadBase,
          admiteFraccion: producto.admiteFraccion,
          presentacionDefectoId: producto.presentacionVentaDefaultId,
          categoria: categoria.nombre,
          grupo: categoria.grupo,
          ordenCategoria: categoria.orden,
        })
        .from(producto)
        .leftJoin(categoria, eq(categoria.id, producto.categoriaId))
        .where(eq(producto.activo, true))
        .orderBy(asc(categoria.orden), asc(categoria.nombre), asc(producto.nombre)),
      tx
        .select({ id: presentacion.id, productoId: presentacion.productoId, nombre: presentacion.nombre, factor: presentacion.factorABase, esUnidadBase: presentacion.esUnidadBase })
        .from(presentacion)
        .where(and(eq(presentacion.activo, true), eq(presentacion.usableEnVenta, true)))
        .orderBy(desc(presentacion.esUnidadBase), asc(presentacion.orden), asc(presentacion.factorABase)),
      tx.select({ fecha: jornada.fecha }).from(jornada).where(and(gte(jornada.fecha, hoy), eq(jornada.estado, "CERRADA"))),
      ultimoDeCadaCliente(),
      tx
        .select({ pedidoId: pedidoItem.pedidoId, productoId: pedidoItem.productoId, presentacionId: pedidoItem.presentacionId, cantidad: pedidoItem.cantidad, observaciones: pedidoItem.observaciones })
        .from(pedidoItem)
        .where(and(inArray(pedidoItem.pedidoId, idsDeUltimos), eq(pedidoItem.cancelado, false)))
        .orderBy(asc(pedidoItem.linea)),
      // El pedido que se está cambiando (si es eso) y lo que lleva.
      tx
        .select({
          id: pedido.id,
          numero: pedido.numero,
          estado: pedido.estado,
          fecha: jornada.fecha,
          clienteId: pedido.clienteId,
          puntoEntregaId: pedido.puntoEntregaId,
          prioridad: pedido.prioridad,
          entregaDesde: pedido.entregaDesde,
          entregaHasta: pedido.entregaHasta,
          observaciones: pedido.observaciones,
        })
        .from(pedido)
        .innerJoin(jornada, eq(jornada.id, pedido.jornadaId))
        .where(opciones.pedidoId ? eq(pedido.id, opciones.pedidoId) : sinPedido),
      tx
        .select({ productoId: pedidoItem.productoId, presentacionId: pedidoItem.presentacionId, cantidad: pedidoItem.cantidad, observaciones: pedidoItem.observaciones })
        .from(pedidoItem)
        .where(opciones.pedidoId ? and(eq(pedidoItem.pedidoId, opciones.pedidoId), eq(pedidoItem.cancelado, false)) : sinPedido)
        .orderBy(asc(pedidoItem.linea)),
    ]);

    const pedidoACambiar: PedidoParaCambiar | null = p
      ? {
          ...p,
          numero: numeroPedido(p.numero),
          entregaDesde: hora(p.entregaDesde),
          entregaHasta: hora(p.entregaHasta),
          lineas: juntarLineas(lineasDelPedido),
        }
      : null;

    // Cuándo se pidió cada producto por última vez, entre todos los clientes.
    const ultimaVez = new Map<string, string>();
    for (const f of frecuencia) if (f.ultima && f.ultima > (ultimaVez.get(f.productoId) ?? "")) ultimaVez.set(f.productoId, f.ultima);
    // Lo que se le sugiere a un cliente: lo de sus pedidos frecuentes; sin ninguno marcado, lo que más pide.
    const sugerencias = (suyos: typeof frecuencia) => {
      const marcados = suyos.filter((f) => Number(f.marcadas) > 0);
      const base = marcados.length > 0 ? [...marcados].sort((a, b) => Number(b.marcadas) - Number(a.marcadas) || Number(b.veces) - Number(a.veces)) : [...suyos].sort((a, b) => Number(b.veces) - Number(a.veces));
      return { habituales: base.slice(0, MAX_HABITUALES).map((f) => f.productoId), deFrecuentes: marcados.length > 0 };
    };

    return {
      hoy,
      sugerida,
      cerrados: cerrados.map((j) => j.fecha),
      clientes: clientes.map((cl) => {
        const suyos = puntos.filter((pt) => pt.clienteId === cl.id);
        const principal = suyos[0];
        const ultimo = ultimos.find((u) => u.clienteId === cl.id);
        const lineas = ultimo ? lineasDeUltimos.filter((l) => l.pedidoId === ultimo.id) : [];
        return {
          id: cl.id,
          nombre: cl.nombre,
          tipo: cl.tipo,
          direccion: principal ? [principal.direccion, principal.localidad].filter(Boolean).join(", ") : null,
          puntos: suyos.map((pt) => ({ id: pt.id, nombre: pt.nombre, direccion: pt.direccion, esPrincipal: pt.esPrincipal })),
          ...sugerencias(frecuencia.filter((f) => f.clienteId === cl.id)),
          ultimo:
            ultimo && lineas.length > 0
              ? {
                  numero: numeroPedido(ultimo.numero),
                  fecha: ultimo.fecha,
                  lineas: juntarLineas(lineas.map((l) => ({ productoId: l.productoId, presentacionId: l.presentacionId, cantidad: l.cantidad, observaciones: l.observaciones }))),
                }
              : null,
          abiertos: abiertos
            .filter((a) => a.clienteId === cl.id && a.id !== opciones.pedidoId)
            .map((a) => ({ id: a.id, numero: numeroPedido(a.numero), fecha: a.fecha, estado: a.estado })),
        };
      }),
      productos: productos.map((pr) => ({
        id: pr.id,
        codigo: pr.codigo,
        nombre: pr.nombre,
        grupo: pr.grupo,
        categoria: pr.categoria,
        unidadBase: pr.unidadBase as UnidadMedida,
        admiteFraccion: pr.admiteFraccion,
        presentacionDefectoId: pr.presentacionDefectoId,
        ultimaVez: ultimaVez.get(pr.id) ?? null,
        presentaciones: presentaciones.filter((x) => x.productoId === pr.id).map((x) => ({ id: x.id, nombre: x.nombre, factor: x.factor, esUnidadBase: x.esUnidadBase })),
      })),
      pedido: pedidoACambiar,
    };
  });
}

export interface PedidoDelHistorial {
  id: string;
  numero: string;
  fecha: FechaISO;
  estado: EstadoPedido;
  /** Marcado con la estrella: es un "pedido frecuente" del cliente. */
  frecuente: boolean;
  lineas: LineaElegida[];
}

const PEDIDOS_EN_EL_HISTORIAL = 30;

/** Los últimos pedidos de un cliente (sin los cancelados), con lo que llevó cada uno, del más nuevo al más viejo. */
export async function historialDeCliente(db: BaseDatos, authUserId: string, clienteId: string): Promise<PedidoDelHistorial[]> {
  const id = validar(z.uuid(), clienteId);
  return ejecutarComoUsuario(db, authUserId, "pedidos.ver", async (tx) => {
    const pedidos = await tx
      .select({ id: pedido.id, numero: pedido.numero, fecha: jornada.fecha, estado: pedido.estado, frecuente: pedido.frecuente })
      .from(pedido)
      .innerJoin(jornada, eq(jornada.id, pedido.jornadaId))
      .where(and(eq(pedido.clienteId, id), ne(pedido.estado, "CANCELADO")))
      .orderBy(desc(jornada.fecha), desc(pedido.numero))
      .limit(PEDIDOS_EN_EL_HISTORIAL);
    const lineas = pedidos.length
      ? await tx
          .select({ pedidoId: pedidoItem.pedidoId, productoId: pedidoItem.productoId, presentacionId: pedidoItem.presentacionId, cantidad: pedidoItem.cantidad, observaciones: pedidoItem.observaciones })
          .from(pedidoItem)
          .where(and(inArray(pedidoItem.pedidoId, pedidos.map((p) => p.id)), eq(pedidoItem.cancelado, false)))
          .orderBy(asc(pedidoItem.linea))
      : [];
    return pedidos
      .map((p) => ({
        ...p,
        numero: numeroPedido(p.numero),
        lineas: juntarLineas(lineas.filter((l) => l.pedidoId === p.id).map((l) => ({ productoId: l.productoId, presentacionId: l.presentacionId, cantidad: l.cantidad, observaciones: l.observaciones }))),
      }))
      .filter((p) => p.lineas.length > 0);
  });
}

/** La estrella de un pedido: lo marca (o desmarca) como "pedido frecuente" del cliente. De ahí salen los productos que se sugieren al cargarle un pedido. */
export async function marcarPedidoFrecuente(db: BaseDatos, authUserId: string, datos: { pedidoId: string; frecuente: boolean }): Promise<void> {
  const d = validar(z.object({ pedidoId: z.uuid(), frecuente: z.boolean() }), datos);
  await ejecutarComoUsuario(db, authUserId, "pedidos.crear", async (tx, c) => {
    const cambiados = await tx.update(pedido).set({ frecuente: d.frecuente, actualizadoPor: c.usuarioId }).where(eq(pedido.id, d.pedidoId)).returning({ id: pedido.id });
    if (cambiados.length === 0) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró ese pedido: recargá la página y probá de nuevo.");
  });
}
