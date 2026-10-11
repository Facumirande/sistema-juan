import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { and, asc, eq, inArray, ne } from "drizzle-orm";

import { categoria, cliente, entrega, entregaItem, jornada, listaCompra, listaCompraItem, pedido, pedidoItem, presentacion, producto, puntoEntrega } from "@/db/esquema";
import type { BaseDatos, Transaccion } from "@/db/tipos";
import type { EstadoLineaLista } from "@/dominio/compras/lista";
import { formatearCantidad, formatearNumero, type UnidadMedida } from "@/dominio/dinero/formato";
import { avisoDeFaltante } from "@/dominio/entregas/entregas";
import { hoyEnEmpresa, type FechaISO } from "@/dominio/fechas/fechas";
import { COLUMNAS_A_LA_VISTA, columnaDeTarjeta, estadoDelPlazo, ordenarTarjetas, textoPlazo, type ClaveColumna, type EstadoDelPlazo, type PrioridadPedido } from "@/dominio/pedidos/tablero";
import type { EstadoPedido } from "@/dominio/precios/venta";
import { contarNotasDePedidosDelDia } from "@/modulos/colaboracion/notas";
import { personasDelNegocio, soloVisible, type PersonaVisible } from "@/modulos/colaboracion/personas";
import { ejecutarComoUsuario, type ContextoUsuario } from "@/modulos/seguridad/contexto";

import { numeroPedido } from "./pedidos";

// Tablero de pedidos de un día, estilo Trello (uso interno, 28/09/2026): cada pedido es una
// tarjeta en la columna de su etapa, con etiquetas (tipo de cliente, prioridad), miembro (quién se
// encarga), plazo como fecha de vencimiento, avance como checklist y notas como comentarios.

export interface AvanceDePedido {
  /** Qué mide: lo comprado (en la lista de compras) o lo preparado. */
  que: "comprado" | "preparado";
  hechos: number;
  total: number;
}

export interface TarjetaPedido {
  id: string;
  numero: string;
  estado: EstadoPedido;
  columna: ClaveColumna | null;
  clienteId: string;
  cliente: string;
  tipoCliente: string;
  puntoEntrega: string;
  direccion: string;
  /** Horario de recepción del lugar ("06:00–10:00"). */
  horarioLugar: string | null;
  prioridad: PrioridadPedido;
  entregaDesde: string | null;
  entregaHasta: string | null;
  plazo: string | null;
  estadoPlazo: EstadoDelPlazo;
  lineas: number;
  /** Lo que lleva, para verlo en la tarjeta sin abrirla. */
  productos: ProductoDeTarjeta[];
  avance: AvanceDePedido | null;
  /** Solo con `precios.ver_venta`. */
  totalEstimado: string | null;
  notas: { total: number; sinLeer: number };
  /** El miembro de la tarjeta: quién se encarga (o quien lo cargó, si nadie lo tomó). */
  responsable: PersonaVisible | null;
  observaciones: string | null;
  esTardio: boolean;
}

export interface ProductoDeTarjeta {
  nombre: string;
  cantidad: string;
  grupo: string | null;
  hecha: boolean;
  aviso: string | null;
  /** Su renglón en la lista de compras del día, para tildarlo desde la tarjeta. */
  listaItemId: string | null;
  /** Cómo va su compra en la lista (nulo si el pedido no está en la lista). */
  compra: EstadoLineaLista | null;
  /** Tildado a mano como comprado: se puede destildar (una compra anotada, no). */
  tildado: boolean;
  /** Su renglón en la preparación, mientras se puede tildar como separado desde la tarjeta (nulo si no). */
  entregaItemId: string | null;
  /** Todavía no tiene precio de venta (se le pone desde la tarjeta abierta). */
  sinPrecio: boolean;
}

export interface ColumnaDelTablero {
  clave: ClaveColumna;
  titulo: string;
  ayuda: string;
  seleccionable: boolean;
  tarjetas: TarjetaPedido[];
}

export interface TableroDePedidos {
  fecha: FechaISO;
  estadoJornada: string | null;
  columnas: ColumnaDelTablero[];
  cancelados: TarjetaPedido[];
  personas: PersonaVisible[];
  yo: string;
  /** Quién se encarga de cada columna, de manera fija (RN-190). */
  responsables: Partial<Record<ClaveColumna, PersonaVisible>>;
}

export interface LineaConAvance {
  id: string;
  producto: string;
  /** Lo que faltó y por qué ("Va 30 kg de 36 kg · no se consiguió"), o que no se consiguió en el mercado. */
  aviso: string | null;
  /** Grupo de su categoría (FRUTA, VERDURA…), para el dibujo. */
  grupo: string | null;
  cantidad: string;
  hecha: boolean;
  listaItemId: string | null;
  compra: EstadoLineaLista | null;
  tildado: boolean;
  entregaItemId: string | null;
  sinPrecio: boolean;
}

const hora = (t: string | null) => t?.slice(0, 5) ?? null;
const RESUELTAS = ["COMPRADO", "NO_CONSEGUIDO"];

/** De qué pedidos se quiere el avance: los de un día o uno solo. */
type Alcance = { fecha: FechaISO } | { pedidoId: string };

/**
 * Las tres consultas del avance (lo que lleva cada pedido, cómo va su compra en la lista y lo que se
 * separó). El día o el pedido se buscan dentro de cada consulta, así salen juntas con el resto de la
 * pantalla, en una sola ida a la base.
 */
function consultasDeAvance(tx: Transaccion, a: Alcance) {
  const deEsosPedidos =
    "fecha" in a
      ? inArray(pedidoItem.pedidoId, tx.select({ id: pedido.id }).from(pedido).innerJoin(jornada, eq(jornada.id, pedido.jornadaId)).where(eq(jornada.fecha, a.fecha)))
      : eq(pedidoItem.pedidoId, a.pedidoId);
  const suDia = "fecha" in a ? tx.select({ id: jornada.id }).from(jornada).where(eq(jornada.fecha, a.fecha)) : tx.select({ id: pedido.jornadaId }).from(pedido).where(eq(pedido.id, a.pedidoId));
  return [
    tx
      .select({
        id: pedidoItem.id,
        pedidoId: pedidoItem.pedidoId,
        productoId: pedidoItem.productoId,
        producto: producto.nombre,
        grupo: categoria.grupo,
        unidad: producto.unidadBase,
        cantidad: pedidoItem.cantidad,
        cantidadBase: pedidoItem.cantidadBase,
        presentacion: presentacion.nombre,
        precio: pedidoItem.precioEstimado,
      })
      .from(pedidoItem)
      .innerJoin(producto, eq(producto.id, pedidoItem.productoId))
      .leftJoin(categoria, eq(categoria.id, producto.categoriaId))
      .leftJoin(presentacion, eq(presentacion.id, pedidoItem.presentacionId))
      .where(and(deEsosPedidos, eq(pedidoItem.cancelado, false)))
      .orderBy(asc(pedidoItem.linea)),
    tx
      .select({ id: listaCompraItem.id, productoId: listaCompraItem.productoId, estado: listaCompraItem.estado, tildado: listaCompraItem.tildado })
      .from(listaCompraItem)
      .innerJoin(listaCompra, eq(listaCompra.id, listaCompraItem.listaCompraId))
      .where(inArray(listaCompra.jornadaId, suDia)),
    // Lo que se separó para cada línea (y lo que faltó y por qué), para la columna "Preparando".
    tx
      .select({ id: entregaItem.id, estadoEntrega: entrega.estado, pedidoItemId: entregaItem.pedidoItemId, entregaId: entregaItem.entregaId, pedida: entregaItem.cantidadPedida, propuesta: entregaItem.cantidadPropuesta, preparada: entregaItem.cantidadPreparada, motivo: entregaItem.motivoFaltante })
      .from(entregaItem)
      .innerJoin(entrega, eq(entrega.id, entregaItem.entregaId))
      .innerJoin(pedidoItem, eq(pedidoItem.id, entregaItem.pedidoItemId))
      .where(and(deEsosPedidos, eq(entregaItem.esSustitucion, false), ne(entrega.estado, "ANULADA"))),
  ] as const;
}

type ConsultasDeAvance = ReturnType<typeof consultasDeAvance>;
type DatosDeAvance = readonly [Awaited<ConsultasDeAvance[0]>, Awaited<ConsultasDeAvance[1]>, Awaited<ConsultasDeAvance[2]>];

/** Las líneas de cada pedido y si ya se compraron (en la lista) o se prepararon, según su etapa. */
function lineasConAvance(pedidos: readonly { id: string; estado: EstadoPedido }[], [items, enLista, separados]: DatosDeAvance): Map<string, { que: AvanceDePedido["que"] | null; lineas: LineaConAvance[]; entregaId: string | null }> {
  const resultado = new Map<string, { que: AvanceDePedido["que"] | null; lineas: LineaConAvance[]; entregaId: string | null }>();
  const comprado = new Set(enLista.filter((l) => RESUELTAS.includes(l.estado)).map((l) => l.productoId));
  const noConseguido = new Set(enLista.filter((l) => l.estado === "NO_CONSEGUIDO").map((l) => l.productoId));
  const renglon = new Map(enLista.map((l) => [l.productoId, l]));
  const separado = new Map(separados.map((e) => [e.pedidoItemId, e]));
  const aviso = (i: (typeof items)[number], que: AvanceDePedido["que"] | null): string | null => {
    const e = separado.get(i.id);
    if (e) return avisoDeFaltante({ ...e, unidad: i.unidad as UnidadMedida });
    return que === "comprado" && noConseguido.has(i.productoId) ? "No se consiguió en el mercado" : null;
  };
  for (const p of pedidos) {
    const propias = items.filter((i) => i.pedidoId === p.id);
    const conEntrega = propias.some((i) => separado.has(i.id));
    const que = p.estado === "EN_PREPARACION" || p.estado === "PREPARADO" || (conEntrega && (p.estado === "CONFIRMADO" || p.estado === "EN_COMPRA")) ? "preparado" : p.estado === "EN_COMPRA" ? "comprado" : null;
    resultado.set(p.id, {
      que,
      entregaId: propias.map((i) => separado.get(i.id)?.entregaId).find(Boolean) ?? null,
      lineas: propias.map((i) => ({
        id: i.id,
        producto: i.producto,
        grupo: i.grupo,
        listaItemId: p.estado === "EN_COMPRA" ? (renglon.get(i.productoId)?.id ?? null) : null,
        compra: p.estado === "EN_COMPRA" ? (renglon.get(i.productoId)?.estado ?? null) : null,
        tildado: p.estado === "EN_COMPRA" && (renglon.get(i.productoId)?.tildado ?? false),
        cantidad: i.presentacion
          ? `${formatearNumero(i.cantidad, { decimales: 3, recortarCeros: true })} × ${i.presentacion}`
          : formatearCantidad(i.cantidadBase, i.unidad as UnidadMedida),
        hecha: que === "comprado" ? comprado.has(i.productoId) : que === "preparado" ? separado.get(i.id)?.preparada != null : p.estado === "EN_REPARTO" || p.estado === "ENTREGADO",
        aviso: aviso(i, que),
        entregaItemId: ["BORRADOR", "EN_PREPARACION", "PREPARADA"].includes(separado.get(i.id)?.estadoEntrega ?? "") ? separado.get(i.id)!.id : null,
        sinPrecio: i.precio === null,
      })),
    });
  }
  return resultado;
}

function ahoraEnEmpresa(c: ContextoUsuario) {
  const ahora = new Date();
  return { hoy: hoyEnEmpresa(ahora, c.zonaHoraria), hora: format(new TZDate(ahora, c.zonaHoraria), "HH:mm") };
}

export async function tableroDePedidos(db: BaseDatos, authUserId: string, fecha: FechaISO): Promise<TableroDePedidos> {
  return ejecutarComoUsuario(db, authUserId, "pedidos.ver", (tx, c) => tableroEnTransaccion(tx, c, fecha));
}

/** El tablero dentro de una transacción ya abierta: se puede pedir junto con el resto del día. */
export async function tableroEnTransaccion(tx: Transaccion, c: ContextoUsuario, fecha: FechaISO): Promise<TableroDePedidos> {
  // Todo el tablero sale junto, en una sola ida a la base.
  const [personas, [j], filas, notas, ...avance] = await Promise.all([
    personasDelNegocio(tx),
    tx.select({ id: jornada.id, estado: jornada.estado }).from(jornada).where(eq(jornada.fecha, fecha)),
    tx
      .select({
        id: pedido.id,
        numero: pedido.numero,
        estado: pedido.estado,
        prioridad: pedido.prioridad,
        entregaDesde: pedido.entregaDesde,
        entregaHasta: pedido.entregaHasta,
        total: pedido.totalEstimado,
        observaciones: pedido.observaciones,
        esTardio: pedido.esTardio,
        creadoPor: pedido.creadoPor,
        responsableId: pedido.responsableId,
        clienteId: cliente.id,
        cliente: cliente.nombre,
        tipoCliente: cliente.tipoCliente,
        punto: puntoEntrega.nombre,
        direccion: puntoEntrega.direccion,
        horarioDesde: puntoEntrega.horarioDesde,
        horarioHasta: puntoEntrega.horarioHasta,
      })
      .from(pedido)
      .innerJoin(jornada, eq(jornada.id, pedido.jornadaId))
      .innerJoin(cliente, eq(cliente.id, pedido.clienteId))
      .innerJoin(puntoEntrega, eq(puntoEntrega.id, pedido.puntoEntregaId))
      .where(eq(jornada.fecha, fecha)),
    contarNotasDePedidosDelDia(tx, c, fecha),
    ...consultasDeAvance(tx, { fecha }),
  ]);
  const persona = new Map(personas.map((p) => [p.id, soloVisible(p)]));
  const vacio: TableroDePedidos = {
    fecha,
    estadoJornada: null,
    columnas: COLUMNAS_A_LA_VISTA.map((col) => ({ clave: col.clave, titulo: col.titulo, ayuda: col.ayuda, seleccionable: col.seleccionable, tarjetas: [] })),
    cancelados: [],
    personas: personas.filter((p) => p.activa).map(soloVisible),
    yo: c.usuarioId,
    responsables: Object.fromEntries(
      Object.entries(c.responsables).flatMap(([etapa, id]) => {
        const quien = persona.get(id);
        return quien ? [[etapa, quien]] : [];
      }),
    ),
  };
  if (!j) return vacio;
  const avances = lineasConAvance(filas, avance);
  const verVenta = c.permisos.tiene("precios.ver_venta");
  const ahora = ahoraEnEmpresa(c);

  const tarjetas = filas.map((f): TarjetaPedido => {
    const a = avances.get(f.id)!;
    return {
      id: f.id,
      numero: numeroPedido(f.numero),
      estado: f.estado,
      columna: columnaDeTarjeta(f.estado, a.que === "comprado" && a.lineas.length > 0 && a.lineas.every((l) => l.hecha), a.entregaId !== null),
      clienteId: f.clienteId,
      cliente: f.cliente,
      tipoCliente: f.tipoCliente,
      puntoEntrega: f.punto,
      direccion: f.direccion,
      horarioLugar: f.horarioDesde || f.horarioHasta ? `${hora(f.horarioDesde) ?? "?"}–${hora(f.horarioHasta) ?? "?"}` : null,
      prioridad: f.prioridad,
      entregaDesde: hora(f.entregaDesde),
      entregaHasta: hora(f.entregaHasta),
      plazo: textoPlazo(f.entregaDesde, f.entregaHasta),
      estadoPlazo: estadoDelPlazo({ fecha, hasta: hora(f.entregaHasta), estado: f.estado, ...ahora }),
      lineas: a.lineas.length,
      productos: a.lineas.map((l) => ({ nombre: l.producto, cantidad: l.cantidad, grupo: l.grupo, hecha: l.hecha, aviso: l.aviso, listaItemId: l.listaItemId, compra: l.compra, tildado: l.tildado, entregaItemId: l.entregaItemId, sinPrecio: l.sinPrecio })),
      avance: a.que ? { que: a.que, hechos: a.lineas.filter((l) => l.hecha).length, total: a.lineas.length } : null,
      totalEstimado: verVenta ? f.total : null,
      notas: notas.get(f.id) ?? { total: 0, sinLeer: 0 },
      responsable: persona.get(f.responsableId ?? f.creadoPor ?? "") ?? null,
      observaciones: f.observaciones,
      esTardio: f.esTardio,
    };
  });
  const numeros = new Map(filas.map((f) => [f.id, f.numero]));
  const ordenadas = ordenarTarjetas(tarjetas.map((t) => ({ ...t, tarjeta: t, numero: numeros.get(t.id)! }))).map((x) => x.tarjeta);
  return {
    ...vacio,
    estadoJornada: j.estado,
    columnas: vacio.columnas.map((col) => ({ ...col, tarjetas: ordenadas.filter((t) => t.columna === col.clave) })),
    cancelados: ordenadas.filter((t) => t.estado === "CANCELADO"),
  };
}

/** Lo que se ve al abrir una tarjeta: el pedido con sus líneas marcadas (compradas o preparadas). */
export async function avanceDeTarjeta(db: BaseDatos, authUserId: string, pedidoId: string): Promise<{ que: AvanceDePedido["que"] | null; lineas: LineaConAvance[]; entregaId: string | null; responsable: PersonaVisible | null; estadoPlazo: EstadoDelPlazo; personas: PersonaVisible[] }> {
  return ejecutarComoUsuario(db, authUserId, "pedidos.ver", async (tx, c) => {
    const [[p], personas, ...avance] = await Promise.all([
      tx
        .select({ id: pedido.id, estado: pedido.estado, jornadaId: pedido.jornadaId, fecha: jornada.fecha, hasta: pedido.entregaHasta, responsableId: pedido.responsableId, creadoPor: pedido.creadoPor })
        .from(pedido)
        .innerJoin(jornada, eq(jornada.id, pedido.jornadaId))
        .where(eq(pedido.id, pedidoId)),
      personasDelNegocio(tx),
      ...consultasDeAvance(tx, { pedidoId }),
    ]);
    if (!p) return { que: null, lineas: [], entregaId: null, responsable: null, estadoPlazo: "a_tiempo", personas: [] };
    const persona = new Map(personas.map((x) => [x.id, soloVisible(x)]));
    const a = lineasConAvance([p], avance).get(p.id)!;
    return {
      que: a.que,
      lineas: a.lineas,
      entregaId: a.entregaId,
      responsable: persona.get(p.responsableId ?? p.creadoPor ?? "") ?? null,
      estadoPlazo: estadoDelPlazo({ fecha: p.fecha, hasta: hora(p.hasta), estado: p.estado, ...ahoraEnEmpresa(c) }),
      personas: personas.filter((x) => x.activa).map(soloVisible),
    };
  });
}

/** Qué pedidos se eligieron y en qué estado están (para las acciones del tablero). */
export async function estadosDePedidos(
  db: BaseDatos,
  authUserId: string,
  ids: readonly string[],
): Promise<{ id: string; estado: EstadoPedido; fecha: FechaISO; numero: string; cliente: string }[]> {
  if (ids.length === 0) return [];
  return ejecutarComoUsuario(db, authUserId, "pedidos.ver", async (tx) =>
    (
      await tx
        .select({ id: pedido.id, estado: pedido.estado, fecha: jornada.fecha, numero: pedido.numero, cliente: cliente.nombre })
        .from(pedido)
        .innerJoin(jornada, eq(jornada.id, pedido.jornadaId))
        .innerJoin(cliente, eq(cliente.id, pedido.clienteId))
        .where(inArray(pedido.id, [...ids]))
        .orderBy(asc(pedido.numero))
    ).map((p) => ({ ...p, numero: numeroPedido(p.numero) })),
  );
}
