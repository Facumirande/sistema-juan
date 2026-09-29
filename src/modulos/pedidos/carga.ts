import { and, asc, count, desc, eq, gte, inArray, ne, notInArray } from "drizzle-orm";

import { categoria, cliente, jornada, pedido, pedidoItem, presentacion, producto, puntoEntrega } from "@/db/esquema";
import type { BaseDatos } from "@/db/tipos";
import type { UnidadMedida } from "@/dominio/dinero/formato";
import type { FechaISO } from "@/dominio/fechas/fechas";
import { juntarLineas, type LineaElegida, type PresentacionDeVenta } from "@/dominio/pedidos/carga";
import type { PrioridadPedido } from "@/dominio/pedidos/tablero";
import type { EstadoPedido } from "@/dominio/precios/venta";
import { ejecutarComoUsuario } from "@/modulos/seguridad/contexto";

import { hoyYSugerida } from "./jornadas";
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
  /** Los productos que más pide, del más pedido al menos. */
  habituales: string[];
  /** Su último pedido (para "Repetir el último pedido"). */
  ultimo: { numero: string; fecha: FechaISO; lineas: LineaElegida[] } | null;
  /** Pedidos que ya tiene de hoy en adelante (para avisar antes de cargarle otro el mismo día). */
  abiertos: { id: string; numero: string; fecha: FechaISO; estado: EstadoPedido }[];
}

export interface ProductoParaCargar {
  id: string;
  nombre: string;
  grupo: string | null;
  categoria: string | null;
  unidadBase: UnidadMedida;
  admiteFraccion: boolean;
  presentaciones: PresentacionDeVenta[];
  presentacionDefectoId: string | null;
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
    const { hoy, sugerida } = await hoyYSugerida(tx);

    const [clientes, puntos, frecuencia, abiertos, productos, presentaciones, cerrados] = await Promise.all([
      tx.select({ id: cliente.id, nombre: cliente.nombre, tipo: cliente.tipoCliente }).from(cliente).where(eq(cliente.activo, true)).orderBy(asc(cliente.nombre)),
      tx
        .select({ id: puntoEntrega.id, clienteId: puntoEntrega.clienteId, nombre: puntoEntrega.nombre, direccion: puntoEntrega.direccion, localidad: puntoEntrega.localidad, esPrincipal: puntoEntrega.esPrincipal })
        .from(puntoEntrega)
        .where(eq(puntoEntrega.activo, true))
        .orderBy(desc(puntoEntrega.esPrincipal), asc(puntoEntrega.nombre)),
      tx
        .select({ clienteId: pedido.clienteId, productoId: pedidoItem.productoId, veces: count() })
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
    ]);

    // El último pedido de cada cliente con productos, para repetirlo.
    const ultimos = await tx
      .selectDistinctOn([pedido.clienteId], { id: pedido.id, clienteId: pedido.clienteId, numero: pedido.numero, fecha: jornada.fecha })
      .from(pedido)
      .innerJoin(jornada, eq(jornada.id, pedido.jornadaId))
      .where(and(ne(pedido.estado, "CANCELADO"), opciones.pedidoId ? ne(pedido.id, opciones.pedidoId) : undefined))
      .orderBy(pedido.clienteId, desc(jornada.fecha), desc(pedido.numero));
    const lineasDeUltimos = ultimos.length
      ? await tx
          .select({ pedidoId: pedidoItem.pedidoId, productoId: pedidoItem.productoId, presentacionId: pedidoItem.presentacionId, cantidad: pedidoItem.cantidad, observaciones: pedidoItem.observaciones })
          .from(pedidoItem)
          .where(and(inArray(pedidoItem.pedidoId, ultimos.map((u) => u.id)), eq(pedidoItem.cancelado, false)))
          .orderBy(asc(pedidoItem.linea))
      : [];

    let pedidoACambiar: PedidoParaCambiar | null = null;
    if (opciones.pedidoId) {
      const [p] = await tx
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
        .where(eq(pedido.id, opciones.pedidoId));
      if (p) {
        const lineas = await tx
          .select({ productoId: pedidoItem.productoId, presentacionId: pedidoItem.presentacionId, cantidad: pedidoItem.cantidad, observaciones: pedidoItem.observaciones })
          .from(pedidoItem)
          .where(and(eq(pedidoItem.pedidoId, p.id), eq(pedidoItem.cancelado, false)))
          .orderBy(asc(pedidoItem.linea));
        pedidoACambiar = {
          ...p,
          numero: numeroPedido(p.numero),
          entregaDesde: hora(p.entregaDesde),
          entregaHasta: hora(p.entregaHasta),
          lineas: juntarLineas(lineas),
        };
      }
    }

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
          habituales: frecuencia
            .filter((f) => f.clienteId === cl.id)
            .sort((a, b) => Number(b.veces) - Number(a.veces))
            .slice(0, MAX_HABITUALES)
            .map((f) => f.productoId),
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
        nombre: pr.nombre,
        grupo: pr.grupo,
        categoria: pr.categoria,
        unidadBase: pr.unidadBase as UnidadMedida,
        admiteFraccion: pr.admiteFraccion,
        presentacionDefectoId: pr.presentacionDefectoId,
        presentaciones: presentaciones.filter((x) => x.productoId === pr.id).map((x) => ({ id: x.id, nombre: x.nombre, factor: x.factor, esUnidadBase: x.esUnidadBase })),
      })),
      pedido: pedidoACambiar,
    };
  });
}
