import { and, asc, count, desc, eq, inArray, max, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { auditar } from "@/db/auditoria";
import { canalPedido, cliente, jornada, pedido, pedidoItem, presentacion, prioridadPedido, producto, puntoEntrega, usuario } from "@/db/esquema";
import { siguienteNumero } from "@/db/secuencia";
import type { BaseDatos, Transaccion } from "@/db/tipos";
import { aNumeric, dec, sumar } from "@/dominio/dinero/decimal";
import { ErrorDeNegocio, esErrorDeNegocio } from "@/dominio/errores";
import type { FechaISO } from "@/dominio/fechas/fechas";
import { formatearNumeroDocumento } from "@/dominio/numeracion/numeracion";
import { diferenciasDeLineas, juntarLineas, type LineaElegida } from "@/dominio/pedidos/carga";
import { textoPlazo, type PrioridadPedido } from "@/dominio/pedidos/tablero";
import { subtotalLinea, transicionPedidoPermitida, type AlertaPrecio, type EstadoPedido, type OrigenPrecioVenta } from "@/dominio/precios/venta";
import { aUnidadBase } from "@/dominio/unidades/unidades";
import { registrarActividad } from "@/modulos/colaboracion/registro";
import { marcarListaDesactualizada } from "@/modulos/compras/lista-compra";
import { calcularPrecios } from "@/modulos/precios-venta/calculo";
import { ejecutarComoUsuario, type ContextoUsuario } from "@/modulos/seguridad/contexto";
import { numeroObligatorio, textoOpcional, validar } from "@/modulos/validacion";

import { hoyYSugerida, jornadaParaPedidos } from "./jornadas";

// Pedidos (04 §5.b, 08 §5.7): RN-017 a RN-034. Los precios son estimados (se congelan al
// emitir los documentos de la entrega, iteración 6) y se ven según los permisos de precios.

export type CanalPedido = (typeof canalPedido.enumValues)[number];

export interface PrecioDeLinea {
  /** Por unidad base. */
  precio: string | null;
  subtotal: string | null;
  origen: OrigenPrecioVenta | null;
  alertas: AlertaPrecio[];
  manual: boolean;
  motivoManual: string | null;
  /** Solo con `precios.ver_costos`. */
  costo: string | null;
  /** Solo con `precios.ver_margenes`. */
  recargo: string | null;
}

export interface LineaDePedido {
  id: string;
  linea: number;
  productoId: string;
  producto: string;
  unidadBase: string;
  presentacionId: string | null;
  presentacion: string | null;
  factor: string;
  cantidad: string;
  cantidadBase: string;
  observaciones: string | null;
  cancelado: boolean;
  motivoCancelacion: string | null;
  /** Solo con `precios.ver_venta`. */
  precio: PrecioDeLinea | null;
}

export interface DetallePedido {
  id: string;
  numero: string;
  estado: EstadoPedido;
  jornadaId: string;
  fecha: FechaISO;
  estadoJornada: string;
  clienteId: string;
  cliente: string;
  tipoCliente: string;
  requiereOrdenCompra: boolean;
  puntoEntregaId: string;
  puntoEntrega: string;
  direccion: string;
  localidad: string | null;
  /** Ubicación marcada del lugar de entrega (para ir con el GPS). */
  coordenada: { lat: number; lng: number } | null;
  /** Horario de recepción del lugar ("06:00–10:00"). */
  horarioLugar: string | null;
  canal: CanalPedido | null;
  referenciaCliente: string | null;
  observaciones: string | null;
  observacionesInternas: string | null;
  esTardio: boolean;
  prioridad: PrioridadPedido;
  /** Plazo de entrega pedido por el cliente ("HH:MM"). */
  entregaDesde: string | null;
  entregaHasta: string | null;
  totalEstimado: string | null;
  fechaPedido: Date;
  lineas: LineaDePedido[];
  /** Se pueden cambiar líneas y datos con los permisos del usuario. */
  editable: boolean;
  /** Otros pedidos del cliente para la misma jornada y punto (RN-022). */
  otrosDelMismoDia: { id: string; numero: string }[];
}

export interface PedidoListado {
  id: string;
  numero: string;
  estado: EstadoPedido;
  fecha: FechaISO;
  cliente: string;
  puntoEntrega: string;
  lineas: number;
  esTardio: boolean;
  totalEstimado: string | null;
  conAlertas: boolean;
}

export const numeroPedido = (n: number) => formatearNumeroDocumento("PED-", n);

const ESTADOS_ABIERTOS: readonly EstadoPedido[] = ["BORRADOR", "CONFIRMADO", "EN_COMPRA"];

/** "29/09" para las frases de la actividad. */
const diaCorto = (fecha: FechaISO) => `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`;

// ——— Consultas ———

export async function listarPedidos(
  db: BaseDatos,
  authUserId: string,
  filtros: { fecha?: FechaISO; estado?: EstadoPedido; clienteId?: string } = {},
): Promise<{ pedidos: PedidoListado[]; fecha: FechaISO }> {
  return ejecutarComoUsuario(db, authUserId, "pedidos.ver", async (tx, c) => {
    const fecha = filtros.fecha ?? (await hoyYSugerida(tx)).sugerida;
    const lineas = tx
      .select({ pedidoId: pedidoItem.pedidoId, n: count().as("n"), alertas: sql<number>`count(*) filter (where cardinality(${pedidoItem.alertas}) > 0)`.as("alertas") })
      .from(pedidoItem)
      .where(eq(pedidoItem.cancelado, false))
      .groupBy(pedidoItem.pedidoId)
      .as("lin");
    const filas = await tx
      .select({
        id: pedido.id,
        numero: pedido.numero,
        estado: pedido.estado,
        fecha: jornada.fecha,
        cliente: cliente.nombre,
        puntoEntrega: puntoEntrega.nombre,
        lineas: lineas.n,
        alertas: lineas.alertas,
        esTardio: pedido.esTardio,
        total: pedido.totalEstimado,
      })
      .from(pedido)
      .innerJoin(jornada, eq(jornada.id, pedido.jornadaId))
      .innerJoin(cliente, eq(cliente.id, pedido.clienteId))
      .innerJoin(puntoEntrega, eq(puntoEntrega.id, pedido.puntoEntregaId))
      .leftJoin(lineas, eq(lineas.pedidoId, pedido.id))
      .where(
        and(
          eq(jornada.fecha, fecha),
          filtros.estado ? eq(pedido.estado, filtros.estado) : undefined,
          filtros.clienteId ? eq(pedido.clienteId, filtros.clienteId) : undefined,
        ),
      )
      .orderBy(sql`${pedido.estado} = 'CANCELADO'`, asc(cliente.nombre), asc(pedido.numero));
    const verVenta = c.permisos.tiene("precios.ver_venta");
    return {
      fecha,
      pedidos: filas.map((f) => ({
        id: f.id,
        numero: numeroPedido(f.numero),
        estado: f.estado,
        fecha: f.fecha,
        cliente: f.cliente,
        puntoEntrega: f.puntoEntrega,
        lineas: Number(f.lineas ?? 0),
        esTardio: f.esTardio,
        totalEstimado: verVenta ? f.total : null,
        conAlertas: c.permisos.tiene("precios.ver_margenes") && Number(f.alertas ?? 0) > 0,
      })),
    };
  });
}

function puedeEditar(c: ContextoUsuario, estado: EstadoPedido): boolean {
  if (estado === "BORRADOR" || estado === "CONFIRMADO") return c.permisos.tiene("pedidos.editar");
  if (estado === "EN_COMPRA") return c.permisos.tiene("pedidos.editar_en_curso");
  return false;
}

export async function obtenerPedido(db: BaseDatos, authUserId: string, pedidoId: string): Promise<DetallePedido> {
  return ejecutarComoUsuario(db, authUserId, "pedidos.ver", async (tx, c) => {
    const [p] = await tx
      .select({
        pedido,
        fecha: jornada.fecha,
        estadoJornada: jornada.estado,
        cliente: cliente.nombre,
        tipoCliente: cliente.tipoCliente,
        requiereOrdenCompra: cliente.requiereOrdenCompra,
        punto: puntoEntrega.nombre,
        direccion: puntoEntrega.direccion,
        localidad: puntoEntrega.localidad,
        latitud: puntoEntrega.latitud,
        longitud: puntoEntrega.longitud,
        horarioDesde: puntoEntrega.horarioDesde,
        horarioHasta: puntoEntrega.horarioHasta,
      })
      .from(pedido)
      .innerJoin(jornada, eq(jornada.id, pedido.jornadaId))
      .innerJoin(cliente, eq(cliente.id, pedido.clienteId))
      .innerJoin(puntoEntrega, eq(puntoEntrega.id, pedido.puntoEntregaId))
      .where(eq(pedido.id, pedidoId));
    if (!p) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el pedido.");

    const items = await tx
      .select({ item: pedidoItem, producto: producto.nombre, unidadBase: producto.unidadBase, presentacion: presentacion.nombre, factor: presentacion.factorABase })
      .from(pedidoItem)
      .innerJoin(producto, eq(producto.id, pedidoItem.productoId))
      .leftJoin(presentacion, eq(presentacion.id, pedidoItem.presentacionId))
      .where(eq(pedidoItem.pedidoId, pedidoId))
      .orderBy(asc(pedidoItem.linea));
    const otros = await tx
      .select({ id: pedido.id, numero: pedido.numero })
      .from(pedido)
      .where(
        and(
          eq(pedido.jornadaId, p.pedido.jornadaId),
          eq(pedido.clienteId, p.pedido.clienteId),
          eq(pedido.puntoEntregaId, p.pedido.puntoEntregaId),
          ne(pedido.id, pedidoId),
          ne(pedido.estado, "CANCELADO"),
        ),
      );

    const verVenta = c.permisos.tiene("precios.ver_venta");
    const verCostos = c.permisos.tiene("precios.ver_costos");
    const verMargenes = c.permisos.tiene("precios.ver_margenes");
    return {
      id: p.pedido.id,
      numero: numeroPedido(p.pedido.numero),
      estado: p.pedido.estado,
      jornadaId: p.pedido.jornadaId,
      fecha: p.fecha,
      estadoJornada: p.estadoJornada,
      clienteId: p.pedido.clienteId,
      cliente: p.cliente,
      tipoCliente: p.tipoCliente,
      requiereOrdenCompra: p.requiereOrdenCompra,
      puntoEntregaId: p.pedido.puntoEntregaId,
      puntoEntrega: p.punto,
      direccion: p.direccion,
      localidad: p.localidad,
      coordenada: p.latitud !== null && p.longitud !== null ? { lat: Number(p.latitud), lng: Number(p.longitud) } : null,
      horarioLugar: p.horarioDesde || p.horarioHasta ? `${p.horarioDesde?.slice(0, 5) ?? "?"}–${p.horarioHasta?.slice(0, 5) ?? "?"}` : null,
      canal: p.pedido.canal,
      referenciaCliente: p.pedido.referenciaCliente,
      observaciones: p.pedido.observaciones,
      observacionesInternas: p.pedido.observacionesInternas,
      esTardio: p.pedido.esTardio,
      prioridad: p.pedido.prioridad,
      entregaDesde: p.pedido.entregaDesde?.slice(0, 5) ?? null,
      entregaHasta: p.pedido.entregaHasta?.slice(0, 5) ?? null,
      totalEstimado: verVenta ? p.pedido.totalEstimado : null,
      fechaPedido: p.pedido.fechaPedido,
      editable: puedeEditar(c, p.pedido.estado),
      otrosDelMismoDia: otros.map((o) => ({ id: o.id, numero: numeroPedido(o.numero) })),
      lineas: items.map(({ item: i, ...x }) => ({
        id: i.id,
        linea: i.linea,
        productoId: i.productoId,
        producto: x.producto,
        unidadBase: x.unidadBase,
        presentacionId: i.presentacionId,
        presentacion: x.presentacion,
        factor: x.factor ?? "1",
        cantidad: i.cantidad,
        cantidadBase: i.cantidadBase,
        observaciones: i.observaciones,
        cancelado: i.cancelado,
        motivoCancelacion: i.motivoCancelacion,
        precio: verVenta
          ? {
              precio: i.precioEstimado,
              subtotal: i.subtotalEstimado,
              origen: i.origenReglaEstimada,
              alertas: (verMargenes ? i.alertas : []) as AlertaPrecio[],
              manual: i.precioManual !== null,
              motivoManual: i.motivoPrecioManual,
              costo: verCostos ? i.costoEstimado : null,
              recargo: verMargenes ? i.recargoEstimado : null,
            }
          : null,
      })),
    };
  });
}

// ——— Cálculo y guardado de precios ———

/**
 * Recalcula el precio estimado de las líneas no canceladas de un pedido (RN-032, RN-088). Las
 * líneas con precio manual lo conservan (RN-090). Actualiza el total estimado.
 */
export async function recalcularPedido(tx: Transaccion, pedidoId: string): Promise<void> {
  const [p] = await tx
    .select({ clienteId: pedido.clienteId, fecha: jornada.fecha })
    .from(pedido)
    .innerJoin(jornada, eq(jornada.id, pedido.jornadaId))
    .where(eq(pedido.id, pedidoId));
  if (!p) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el pedido.");
  const items = await tx.select().from(pedidoItem).where(and(eq(pedidoItem.pedidoId, pedidoId), eq(pedidoItem.cancelado, false)));
  const precios = await calcularPrecios(tx, {
    clienteId: p.clienteId,
    fecha: p.fecha,
    lineas: items.map((i) => ({ productoId: i.productoId, presentacionId: i.presentacionId })),
  });

  const subtotales = [];
  for (const [n, i] of items.entries()) {
    const r = precios[n]!;
    const precio = i.precioManual ?? (r.precioUnitario ? aNumeric(r.precioUnitario, 4) : null);
    const subtotal = precio ? aNumeric(subtotalLinea(i.cantidadBase, precio), 2) : null;
    if (subtotal) subtotales.push(subtotal);
    await tx
      .update(pedidoItem)
      .set({
        costoEstimado: r.costoUnitario ? aNumeric(r.costoUnitario, 4) : null,
        origenCostoEstimado: r.origenCosto,
        recargoEstimado: i.precioManual ? null : r.recargoAplicado ? aNumeric(r.recargoAplicado, 3) : null,
        origenReglaEstimada: i.precioManual ? "MANUAL" : r.origen,
        reglaPrecioId: i.precioManual ? null : r.reglaId,
        precioEstimado: precio,
        subtotalEstimado: subtotal,
        alertas: i.precioManual ? [] : r.alertas,
        precioCalculadoEn: sql`now()`,
      })
      .where(eq(pedidoItem.id, i.id));
  }
  await tx
    .update(pedido)
    .set({ totalEstimado: aNumeric(sumar(subtotales), 2) })
    .where(eq(pedido.id, pedidoId));
}

/**
 * RN-088: recalcula los precios estimados de los pedidos que todavía no se congelaron
 * (BORRADOR, CONFIRMADO, EN_COMPRA de jornadas desde hoy), opcionalmente solo los que tienen
 * alguno de esos productos o son de ese cliente.
 */
export async function recalcularPedidosPendientes(tx: Transaccion, filtro: { productoIds?: string[]; clienteId?: string } = {}): Promise<number> {
  const { hoy } = await hoyYSugerida(tx);
  const conProducto = filtro.productoIds?.length
    ? inArray(
        pedido.id,
        tx.select({ id: pedidoItem.pedidoId }).from(pedidoItem).where(inArray(pedidoItem.productoId, filtro.productoIds)),
      )
    : undefined;
  const pendientes = await tx
    .select({ id: pedido.id })
    .from(pedido)
    .innerJoin(jornada, eq(jornada.id, pedido.jornadaId))
    .where(
      and(
        inArray(pedido.estado, [...ESTADOS_ABIERTOS]),
        sql`${jornada.fecha} >= ${hoy}`,
        filtro.clienteId ? eq(pedido.clienteId, filtro.clienteId) : undefined,
        conProducto,
      ),
    );
  for (const p of pendientes) await recalcularPedido(tx, p.id);
  return pendientes.length;
}

// ——— Alta y cambios ———

const esquemaNuevoPedido = z.object({
  fecha: z.string(),
  clienteId: z.uuid("Elegí el cliente."),
  puntoEntregaId: z.uuid().nullish(),
  canal: z.enum(canalPedido.enumValues).nullish(),
  referenciaCliente: textoOpcional(60),
  observaciones: textoOpcional(500),
});

async function clienteParaPedido(tx: Transaccion, clienteId: string, puntoEntregaId: string | null | undefined) {
  const [cli] = await tx.select({ nombre: cliente.nombre, activo: cliente.activo }).from(cliente).where(eq(cliente.id, clienteId));
  if (!cli) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el cliente.");
  if (!cli.activo) {
    throw new ErrorDeNegocio("VALIDACION", `${cli.nombre} está dado de baja: para cargarle pedidos, reactivalo en su ficha.`, {
      enlace: { href: `/clientes/${clienteId}`, texto: "Abrir la ficha del cliente" },
    });
  }
  const puntos = await tx
    .select({ id: puntoEntrega.id, esPrincipal: puntoEntrega.esPrincipal })
    .from(puntoEntrega)
    .where(and(eq(puntoEntrega.clienteId, clienteId), eq(puntoEntrega.activo, true)));
  const punto = puntoEntregaId ? puntos.find((x) => x.id === puntoEntregaId) : (puntos.find((x) => x.esPrincipal) ?? puntos[0]);
  if (!punto) {
    throw new ErrorDeNegocio("VALIDACION", `${cli.nombre} no tiene cargado dónde se le entrega: agregale una dirección en su ficha y volvé a intentar (RN-010).`, {
      enlace: { href: `/clientes/${clienteId}`, texto: "Cargar la dirección" },
    });
  }
  return { nombre: cli.nombre, puntoId: punto.id };
}

/** Crea un pedido en BORRADOR (RN-017). Avisa si el cliente ya tiene otro para ese día y lugar (RN-022). */
export async function crearPedido(
  db: BaseDatos,
  authUserId: string,
  datos: z.input<typeof esquemaNuevoPedido>,
): Promise<{ pedidoId: string; numero: string; duplicadoDe: string | null }> {
  const d = validar(esquemaNuevoPedido, datos);
  return ejecutarComoUsuario(db, authUserId, "pedidos.crear", (tx, c) => crearEnTransaccion(tx, c, d));
}

async function crearEnTransaccion(tx: Transaccion, c: ContextoUsuario, d: z.output<typeof esquemaNuevoPedido>): Promise<{ pedidoId: string; numero: string; duplicadoDe: string | null }> {
  const j = await jornadaParaPedidos(tx, c, d.fecha);
  const cli = await clienteParaPedido(tx, d.clienteId, d.puntoEntregaId);
  const [existente] = await tx
    .select({ numero: pedido.numero })
    .from(pedido)
    .where(and(eq(pedido.jornadaId, j.id), eq(pedido.clienteId, d.clienteId), eq(pedido.puntoEntregaId, cli.puntoId), ne(pedido.estado, "CANCELADO")))
    .limit(1);
  const { numero, visible } = await siguienteNumero(tx, "PEDIDO");
  const [nuevo] = await tx
    .insert(pedido)
    .values({
      empresaId: c.empresaId,
      numero,
      jornadaId: j.id,
      clienteId: d.clienteId,
      puntoEntregaId: cli.puntoId,
      canal: d.canal ?? null,
      referenciaCliente: d.referenciaCliente,
      observaciones: d.observaciones,
      creadoPor: c.usuarioId,
      actualizadoPor: c.usuarioId,
    })
    .returning({ id: pedido.id });
  await auditar(tx, {
    empresaId: c.empresaId,
    usuarioId: c.usuarioId,
    accion: "CREAR",
    entidad: "pedido",
    entidadId: nuevo!.id,
    resumen: `${visible} de ${cli.nombre} para el ${d.fecha}.`,
  });
  await registrarActividad(tx, c, {
    accion: "CREAR",
    entidadTipo: "PEDIDO",
    entidadId: nuevo!.id,
    jornadaId: j.id,
    resumen: `cargó el pedido ${visible} de ${cli.nombre} para el ${diaCorto(d.fecha)}`,
  });
  return { pedidoId: nuevo!.id, numero: visible, duplicadoDe: existente ? numeroPedido(existente.numero) : null };
}

const ETAPA_EN_PALABRAS: Partial<Record<EstadoPedido, string>> = {
  EN_PREPARACION: "preparándose",
  PREPARADO: "preparado",
  EN_REPARTO: "en camino",
  ENTREGADO: "entregado",
  CANCELADO: "cancelado",
};

/** Cantidad en unidad base, con un mensaje que nombra el producto si no admite fracción (RN-009). */
function cantidadBaseDe(cantidad: Parameters<typeof aUnidadBase>[0], prod: { nombre: string; factor: string; admiteFraccion: boolean }) {
  try {
    return aUnidadBase(cantidad, prod.factor, prod.admiteFraccion);
  } catch (error) {
    if (!esErrorDeNegocio(error, "VALIDACION")) throw error;
    throw new ErrorDeNegocio("VALIDACION", `${prod.nombre} se pide en unidades enteras: poné una cantidad sin coma, por ejemplo 2 o 3 (RN-009).`);
  }
}

/** Pedido que se va a modificar, bloqueado hasta el final de la transacción (RN-025, RN-026). */
async function pedidoParaModificar(tx: Transaccion, c: ContextoUsuario, pedidoId: string) {
  const [p] = await tx
    .select({ pedido, fecha: jornada.fecha, estadoJornada: jornada.estado })
    .from(pedido)
    .innerJoin(jornada, eq(jornada.id, pedido.jornadaId))
    .where(eq(pedido.id, pedidoId))
    .for("update", { of: pedido });
  if (!p) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el pedido.");
  const estado = p.pedido.estado;
  if (estado === "EN_COMPRA") c.permisos.exigir("pedidos.editar_en_curso");
  else if (estado === "BORRADOR" || estado === "CONFIRMADO") c.permisos.exigir("pedidos.editar");
  else {
    throw new ErrorDeNegocio(
      "TRANSICION_INVALIDA",
      `Este pedido ya está ${ETAPA_EN_PALABRAS[estado] ?? "cerrado"} y no se puede cambiar. Si hace falta mandar algo más, cargá un pedido nuevo para el cliente (RN-027).`,
    );
  }
  return p;
}

const MENSAJE_CANTIDAD = "Escribí la cantidad (ej. 36 o 2,5).";

const esquemaLinea = z.object({
  pedidoId: z.uuid(),
  productoId: z.uuid("Elegí el producto."),
  presentacionId: z.uuid().nullish(),
  cantidad: numeroObligatorio(MENSAJE_CANTIDAD).refine((v) => dec(v).gt(0), { message: "La cantidad tiene que ser mayor que 0." }),
  observaciones: textoOpcional(200),
});

async function productoParaLinea(tx: Transaccion, productoId: string, presentacionId: string | null | undefined) {
  const [prod] = await tx
    .select({ nombre: producto.nombre, activo: producto.activo, admiteFraccion: producto.admiteFraccion, unidadBase: producto.unidadBase })
    .from(producto)
    .where(eq(producto.id, productoId));
  if (!prod) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el producto.");
  if (!prod.activo) throw new ErrorDeNegocio("VALIDACION", `${prod.nombre} está dado de baja: sacalo del pedido o reactivalo en Productos.`);
  if (!presentacionId) return { ...prod, factor: "1" };
  const [pr] = await tx
    .select({ factor: presentacion.factorABase, activo: presentacion.activo, venta: presentacion.usableEnVenta, nombre: presentacion.nombre })
    .from(presentacion)
    .where(and(eq(presentacion.id, presentacionId), eq(presentacion.productoId, productoId)));
  if (!pr?.activo || !pr.venta) throw new ErrorDeNegocio("VALIDACION", `${prod.nombre}: ese envase ya no se usa para vender. Elegí otro, por ejemplo por ${prod.unidadBase === "KG" ? "kilo" : "unidad"} (RN-019).`);
  return { ...prod, factor: pr.factor };
}

/**
 * Agrega una línea (RN-019, RN-020). Si el producto ya está en el pedido con la misma
 * presentación, suma la cantidad en esa línea (RN-021).
 */
export async function agregarLinea(db: BaseDatos, authUserId: string, datos: z.input<typeof esquemaLinea>): Promise<{ sumada: boolean }> {
  const d = validar(esquemaLinea, datos);
  return ejecutarComoUsuario(db, authUserId, null, async (tx, c) => {
    const p = await pedidoParaModificar(tx, c, d.pedidoId);
    const prod = await productoParaLinea(tx, d.productoId, d.presentacionId);
    const presentacionId = d.presentacionId ?? null;

    const [igual] = await tx
      .select({ id: pedidoItem.id, cantidad: pedidoItem.cantidad, observaciones: pedidoItem.observaciones })
      .from(pedidoItem)
      .where(
        and(
          eq(pedidoItem.pedidoId, d.pedidoId),
          eq(pedidoItem.productoId, d.productoId),
          presentacionId ? eq(pedidoItem.presentacionId, presentacionId) : sql`${pedidoItem.presentacionId} is null`,
          eq(pedidoItem.cancelado, false),
        ),
      );
    if (igual) {
      const cantidad = dec(igual.cantidad).plus(d.cantidad);
      await tx
        .update(pedidoItem)
        .set({
          cantidad: aNumeric(cantidad, 3),
          cantidadBase: aNumeric(cantidadBaseDe(cantidad, prod), 3),
          observaciones: [igual.observaciones, d.observaciones].filter(Boolean).join(" / ") || null,
          actualizadoPor: c.usuarioId,
        })
        .where(eq(pedidoItem.id, igual.id));
    } else {
      const [ultima] = await tx.select({ n: max(pedidoItem.linea) }).from(pedidoItem).where(eq(pedidoItem.pedidoId, d.pedidoId));
      await tx.insert(pedidoItem).values({
        empresaId: c.empresaId,
        pedidoId: d.pedidoId,
        linea: (ultima?.n ?? 0) + 1,
        productoId: d.productoId,
        presentacionId,
        cantidad: aNumeric(d.cantidad, 3),
        cantidadBase: aNumeric(cantidadBaseDe(d.cantidad, prod), 3),
        observaciones: d.observaciones,
        creadoPor: c.usuarioId,
        actualizadoPor: c.usuarioId,
      });
    }
    await recalcularPedido(tx, d.pedidoId);
    if (p.pedido.estado === "EN_COMPRA") await marcarListaDesactualizada(tx, p.pedido.jornadaId); // RN-052
    if (p.pedido.estado === "EN_COMPRA") {
      await auditar(tx, {
        empresaId: c.empresaId,
        usuarioId: c.usuarioId,
        accion: "MODIFICAR",
        entidad: "pedido",
        entidadId: d.pedidoId,
        resumen: `Se agregó ${prod.nombre} a ${numeroPedido(p.pedido.numero)} con la compra en curso (RN-026).`,
      });
    }
    return { sumada: Boolean(igual) };
  });
}

const esquemaCambioLinea = z.object({
  itemId: z.uuid(),
  cantidad: numeroObligatorio(MENSAJE_CANTIDAD).refine((v) => dec(v).gt(0), { message: "La cantidad tiene que ser mayor que 0." }),
  observaciones: textoOpcional(200),
});

async function lineaParaModificar(tx: Transaccion, c: ContextoUsuario, itemId: string) {
  const [i] = await tx.select().from(pedidoItem).where(eq(pedidoItem.id, itemId));
  if (!i) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró la línea.");
  const p = await pedidoParaModificar(tx, c, i.pedidoId);
  if (i.cancelado) throw new ErrorDeNegocio("VALIDACION", "La línea está cancelada.");
  return { item: i, pedido: p };
}

export async function cambiarLinea(db: BaseDatos, authUserId: string, datos: z.input<typeof esquemaCambioLinea>): Promise<void> {
  const d = validar(esquemaCambioLinea, datos);
  await ejecutarComoUsuario(db, authUserId, null, async (tx, c) => {
    const { item, pedido: p } = await lineaParaModificar(tx, c, d.itemId);
    const prod = await productoParaLinea(tx, item.productoId, item.presentacionId);
    if (p.pedido.estado === "EN_COMPRA") await marcarListaDesactualizada(tx, p.pedido.jornadaId);
    await tx
      .update(pedidoItem)
      .set({
        cantidad: aNumeric(d.cantidad, 3),
        cantidadBase: aNumeric(cantidadBaseDe(d.cantidad, prod), 3),
        observaciones: d.observaciones,
        actualizadoPor: c.usuarioId,
      })
      .where(eq(pedidoItem.id, item.id));
    await recalcularPedido(tx, item.pedidoId);
  });
}

/** En BORRADOR la línea se borra; desde CONFIRMADO se cancela con motivo (03 §1.5, RN-028). */
export async function quitarLinea(db: BaseDatos, authUserId: string, datos: { itemId: string; motivo?: string }): Promise<void> {
  await ejecutarComoUsuario(db, authUserId, null, async (tx, c) => {
    const { item, pedido: p } = await lineaParaModificar(tx, c, datos.itemId);
    if (p.pedido.estado === "BORRADOR") {
      await tx.delete(pedidoItem).where(eq(pedidoItem.id, item.id));
    } else {
      c.permisos.exigir("pedidos.cancelar");
      const motivo = datos.motivo?.trim() ?? "";
      if (motivo.length < 5) throw new ErrorDeNegocio("VALIDACION", "Escribí por qué se cancela la línea (al menos 5 letras).");
      await tx.update(pedidoItem).set({ cancelado: true, motivoCancelacion: motivo, actualizadoPor: c.usuarioId }).where(eq(pedidoItem.id, item.id));
      if (p.pedido.estado === "EN_COMPRA") await marcarListaDesactualizada(tx, p.pedido.jornadaId);
      await auditar(tx, {
        empresaId: c.empresaId,
        usuarioId: c.usuarioId,
        accion: "CANCELAR",
        entidad: "pedido_item",
        entidadId: item.id,
        resumen: `Línea ${item.linea} de ${numeroPedido(p.pedido.numero)} cancelada.`,
        motivo,
      });
    }
    await recalcularPedido(tx, item.pedidoId);
  });
}

const esquemaDatosPedido = z.object({
  pedidoId: z.uuid(),
  fecha: z.string().optional(),
  puntoEntregaId: z.uuid().nullish(),
  canal: z.enum(canalPedido.enumValues).nullish(),
  referenciaCliente: textoOpcional(60),
  observaciones: textoOpcional(500),
  observacionesInternas: textoOpcional(500),
});

/** Datos del pedido; cambiar la fecha solo en BORRADOR o CONFIRMADO (04 §5.b.4) y recalcula precios. */
export async function cambiarDatosPedido(db: BaseDatos, authUserId: string, datos: z.input<typeof esquemaDatosPedido>): Promise<void> {
  const d = validar(esquemaDatosPedido, datos);
  await ejecutarComoUsuario(db, authUserId, null, async (tx, c) => {
    const p = await pedidoParaModificar(tx, c, d.pedidoId);
    let jornadaId = p.pedido.jornadaId;
    if (d.fecha && d.fecha !== p.fecha) {
      if (p.pedido.estado === "EN_COMPRA") {
        throw new ErrorDeNegocio("VALIDACION", "El pedido ya está en la lista de compras: para pasarlo a otro día, primero sacalo de la lista desde el tablero.");
      }
      jornadaId = (await jornadaParaPedidos(tx, c, d.fecha)).id;
    }
    const cli = await clienteParaPedido(tx, p.pedido.clienteId, d.puntoEntregaId ?? p.pedido.puntoEntregaId);
    await tx
      .update(pedido)
      .set({
        jornadaId,
        puntoEntregaId: cli.puntoId,
        canal: d.canal ?? null,
        referenciaCliente: d.referenciaCliente,
        observaciones: d.observaciones,
        observacionesInternas: d.observacionesInternas,
        actualizadoPor: c.usuarioId,
      })
      .where(eq(pedido.id, d.pedidoId));
    if (jornadaId !== p.pedido.jornadaId) {
      await recalcularPedido(tx, d.pedidoId);
    }
    await registrarActividad(tx, c, {
      accion: "MODIFICAR",
      entidadTipo: "PEDIDO",
      entidadId: d.pedidoId,
      jornadaId,
      resumen: `cambió los datos del pedido ${numeroPedido(p.pedido.numero)} de ${cli.nombre}${d.fecha && d.fecha !== p.fecha ? ` (pasa al ${diaCorto(d.fecha)})` : ""}`,
    });
  });
}

/** BORRADOR → CONFIRMADO (RN-017, RN-018, RN-029). Recalcula los precios estimados. */
export async function confirmarPedido(db: BaseDatos, authUserId: string, pedidoId: string): Promise<void> {
  await ejecutarComoUsuario(db, authUserId, "pedidos.confirmar", (tx, c) => confirmarEnTransaccion(tx, c, pedidoId));
}

async function confirmarEnTransaccion(tx: Transaccion, c: ContextoUsuario, pedidoId: string): Promise<void> {
  const p = await pedidoParaModificar(tx, c, pedidoId);
  if (!transicionPedidoPermitida(p.pedido.estado, "CONFIRMADO")) throw new ErrorDeNegocio("TRANSICION_INVALIDA", "El pedido ya está confirmado.");
  const [lineas] = await tx
    .select({ n: count() })
    .from(pedidoItem)
    .where(and(eq(pedidoItem.pedidoId, pedidoId), eq(pedidoItem.cancelado, false)));
  if (Number(lineas?.n ?? 0) === 0) {
    throw new ErrorDeNegocio("VALIDACION", "Este pedido todavía no tiene productos: agregale al menos uno (RN-018).", {
      enlace: { href: `/pedidos/${pedidoId}/cambiar`, texto: "Agregar productos" },
    });
  }
  const [cli] = await tx.select({ nombre: cliente.nombre, requiereOC: cliente.requiereOrdenCompra, activo: cliente.activo }).from(cliente).where(eq(cliente.id, p.pedido.clienteId));
  if (!cli?.activo) {
    throw new ErrorDeNegocio("VALIDACION", "Este cliente está dado de baja: reactivalo en su ficha para poder seguir con el pedido (RN-012).", {
      enlace: { href: `/clientes/${p.pedido.clienteId}`, texto: "Abrir la ficha del cliente" },
    });
  }
  if (cli.requiereOC && !p.pedido.referenciaCliente) {
    throw new ErrorDeNegocio("VALIDACION", `${cli.nombre} trabaja con orden de compra: cargá el número de la orden en el pedido antes de mandarlo a la lista de compras (RN-017).`, {
      enlace: { href: `/pedidos/${pedidoId}`, texto: "Cargar el número de orden" },
    });
  }
  const [punto] = await tx.select({ activo: puntoEntrega.activo }).from(puntoEntrega).where(eq(puntoEntrega.id, p.pedido.puntoEntregaId));
  if (!punto?.activo) {
    throw new ErrorDeNegocio("VALIDACION", "El lugar de entrega de este pedido fue dado de baja: elegí otro en el pedido (RN-010).", {
      enlace: { href: `/pedidos/${pedidoId}`, texto: "Elegir otro lugar" },
    });
  }
  if (p.estadoJornada === "CERRADA") throw new ErrorDeNegocio("JORNADA_CERRADA", "Ese día ya está cerrado: para seguir con sus pedidos, primero reabrilo desde “Cierre del día”.");
  if (p.estadoJornada === "PREPARANDO" || p.estadoJornada === "REPARTIENDO") c.permisos.exigir("pedidos.editar_en_curso");

  await tx
    .update(pedido)
    .set({
      estado: "CONFIRMADO",
      esTardio: p.estadoJornada !== "ABIERTA",
      confirmadoEn: sql`now()`,
      confirmadoPor: c.usuarioId,
      actualizadoPor: c.usuarioId,
    })
    .where(eq(pedido.id, pedidoId));
  await recalcularPedido(tx, pedidoId);
  await auditar(tx, {
    empresaId: c.empresaId,
    usuarioId: c.usuarioId,
    accion: "CAMBIO_ESTADO",
    entidad: "pedido",
    entidadId: pedidoId,
    resumen: `${numeroPedido(p.pedido.numero)} confirmado.`,
    datosAntes: { estado: p.pedido.estado },
    datosDespues: { estado: "CONFIRMADO" },
  });
  await registrarActividad(tx, c, {
    accion: "CONFIRMAR",
    entidadTipo: "PEDIDO",
    entidadId: pedidoId,
    jornadaId: p.pedido.jornadaId,
    resumen: `confirmó el pedido ${numeroPedido(p.pedido.numero)} de ${cli.nombre}`,
  });
}

/** RN-028: solo desde BORRADOR, CONFIRMADO o EN_COMPRA; con motivo salvo en BORRADOR. */
export async function cancelarPedido(db: BaseDatos, authUserId: string, datos: { pedidoId: string; motivo?: string }): Promise<void> {
  await ejecutarComoUsuario(db, authUserId, "pedidos.cancelar", async (tx, c) => {
    const [p] = await tx.select().from(pedido).where(eq(pedido.id, datos.pedidoId)).for("update");
    if (!p) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el pedido.");
    if (!transicionPedidoPermitida(p.estado, "CANCELADO")) {
      throw new ErrorDeNegocio("TRANSICION_INVALIDA", "Este pedido ya no se puede cancelar porque ya se está preparando o entregando. Si el cliente no lo quiere, anotalo al confirmar la entrega (RN-028).");
    }
    const motivo = datos.motivo?.trim() || null;
    if (p.estado !== "BORRADOR" && (!motivo || motivo.length < 5)) {
      throw new ErrorDeNegocio("VALIDACION", "Escribí por qué se cancela (al menos 5 letras).");
    }
    await tx
      .update(pedido)
      .set({ estado: "CANCELADO", canceladoEn: sql`now()`, canceladoPor: c.usuarioId, motivoCancelacion: motivo, actualizadoPor: c.usuarioId })
      .where(eq(pedido.id, p.id));
    if (p.estado === "EN_COMPRA") await marcarListaDesactualizada(tx, p.jornadaId);
    await auditar(tx, {
      empresaId: c.empresaId,
      usuarioId: c.usuarioId,
      accion: motivo ? "CANCELAR" : "CAMBIO_ESTADO",
      entidad: "pedido",
      entidadId: p.id,
      resumen: `${numeroPedido(p.numero)} cancelado.`,
      motivo,
      datosAntes: { estado: p.estado },
      datosDespues: { estado: "CANCELADO" },
    });
    const [cli] = await tx.select({ nombre: cliente.nombre }).from(cliente).where(eq(cliente.id, p.clienteId));
    await registrarActividad(tx, c, {
      accion: "CANCELAR",
      entidadTipo: "PEDIDO",
      entidadId: p.id,
      jornadaId: p.jornadaId,
      resumen: `canceló el pedido ${numeroPedido(p.numero)} de ${cli?.nombre ?? "un cliente"}${motivo ? ` (${motivo})` : ""}`,
    });
  });
}

/** RN-033: copia las líneas de productos activos a un BORRADOR en otra fecha; los precios se recalculan. */
export async function duplicarPedido(
  db: BaseDatos,
  authUserId: string,
  datos: { pedidoId: string; fecha: string },
): Promise<{ pedidoId: string; numero: string; omitidos: string[] }> {
  return ejecutarComoUsuario(db, authUserId, "pedidos.crear", async (tx, c) => {
    const [origen] = await tx.select().from(pedido).where(eq(pedido.id, datos.pedidoId));
    if (!origen) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el pedido.");
    const j = await jornadaParaPedidos(tx, c, datos.fecha);
    const cli = await clienteParaPedido(tx, origen.clienteId, origen.puntoEntregaId);
    const items = await tx
      .select({ item: pedidoItem, activo: producto.activo, nombre: producto.nombre })
      .from(pedidoItem)
      .innerJoin(producto, eq(producto.id, pedidoItem.productoId))
      .where(and(eq(pedidoItem.pedidoId, origen.id), eq(pedidoItem.cancelado, false)))
      .orderBy(asc(pedidoItem.linea));

    const { numero, visible } = await siguienteNumero(tx, "PEDIDO");
    const [nuevo] = await tx
      .insert(pedido)
      .values({
        empresaId: c.empresaId,
        numero,
        jornadaId: j.id,
        clienteId: origen.clienteId,
        puntoEntregaId: cli.puntoId,
        canal: origen.canal,
        observaciones: origen.observaciones,
        creadoPor: c.usuarioId,
        actualizadoPor: c.usuarioId,
      })
      .returning({ id: pedido.id });
    const activos = items.filter((x) => x.activo);
    if (activos.length > 0) {
      await tx.insert(pedidoItem).values(
        activos.map((x, n) => ({
          empresaId: c.empresaId,
          pedidoId: nuevo!.id,
          linea: n + 1,
          productoId: x.item.productoId,
          presentacionId: x.item.presentacionId,
          cantidad: x.item.cantidad,
          cantidadBase: x.item.cantidadBase,
          observaciones: x.item.observaciones,
          creadoPor: c.usuarioId,
          actualizadoPor: c.usuarioId,
        })),
      );
    }
    await recalcularPedido(tx, nuevo!.id);
    await auditar(tx, {
      empresaId: c.empresaId,
      usuarioId: c.usuarioId,
      accion: "CREAR",
      entidad: "pedido",
      entidadId: nuevo!.id,
      resumen: `${visible} duplicado de ${numeroPedido(origen.numero)} para el ${datos.fecha}.`,
    });
    await registrarActividad(tx, c, {
      accion: "DUPLICAR",
      entidadTipo: "PEDIDO",
      entidadId: nuevo!.id,
      jornadaId: j.id,
      resumen: `repitió el pedido ${numeroPedido(origen.numero)} de ${cli.nombre} para el ${diaCorto(datos.fecha)} (${visible})`,
    });
    return { pedidoId: nuevo!.id, numero: visible, omitidos: items.filter((x) => !x.activo).map((x) => x.nombre) };
  });
}

export async function recalcularPreciosPedido(db: BaseDatos, authUserId: string, pedidoId: string): Promise<void> {
  await ejecutarComoUsuario(db, authUserId, null, async (tx, c) => {
    await pedidoParaModificar(tx, c, pedidoId);
    await recalcularPedido(tx, pedidoId);
  });
}

/** RN-090: precio a mano de una línea (con motivo, auditado); los recálculos no lo tocan. `precio` nulo lo quita. */
export async function fijarPrecioManual(
  db: BaseDatos,
  authUserId: string,
  datos: { itemId: string; precio: string | null; motivo?: string },
): Promise<void> {
  const precio = datos.precio === null ? null : validar(numeroObligatorio("Escribí el precio por unidad base."), datos.precio);
  await ejecutarComoUsuario(db, authUserId, "precios.override_linea", async (tx, c) => {
    const { item, pedido: p } = await lineaParaModificar(tx, c, datos.itemId);
    const motivo = datos.motivo?.trim() ?? "";
    if (precio !== null && motivo.length < 5) throw new ErrorDeNegocio("VALIDACION", "Escribí por qué se cambia el precio (al menos 5 letras).");
    if (precio !== null && dec(precio).lt(0)) throw new ErrorDeNegocio("VALIDACION", "El precio no puede ser negativo.");
    await tx
      .update(pedidoItem)
      .set({
        precioManual: precio === null ? null : aNumeric(precio, 4),
        motivoPrecioManual: precio === null ? null : motivo,
        actualizadoPor: c.usuarioId,
      })
      .where(eq(pedidoItem.id, item.id));
    await recalcularPedido(tx, item.pedidoId);
    await auditar(tx, {
      empresaId: c.empresaId,
      usuarioId: c.usuarioId,
      accion: precio === null ? "MODIFICAR" : "OVERRIDE_PRECIO",
      entidad: "pedido_item",
      entidadId: item.id,
      resumen: `${precio === null ? "Se quitó el precio manual" : `Precio manual ${precio}`} en la línea ${item.linea} de ${numeroPedido(p.pedido.numero)}.`,
      motivo: precio === null ? null : motivo,
      datosAntes: { precio: item.precioEstimado, manual: item.precioManual },
      datosDespues: { manual: precio },
    });
  });
}

/** Último pedido de un cliente (para "Duplicar el último" y la ficha del cliente). */
export async function ultimosPedidosDeCliente(db: BaseDatos, authUserId: string, clienteId: string, limite = 5) {
  return ejecutarComoUsuario(db, authUserId, "pedidos.ver", async (tx) =>
    (
      await tx
        .select({ id: pedido.id, numero: pedido.numero, estado: pedido.estado, fecha: jornada.fecha })
        .from(pedido)
        .innerJoin(jornada, eq(jornada.id, pedido.jornadaId))
        .where(eq(pedido.clienteId, clienteId))
        .orderBy(desc(jornada.fecha), desc(pedido.numero))
        .limit(limite)
    ).map((p) => ({ ...p, numero: numeroPedido(p.numero) })),
  );
}

// ——— Tablero: prioridad y plazo (uso interno, 28/09/2026) ———

/** Hasta que se entrega, a un pedido se le puede cambiar la prioridad y el plazo (no cambia lo que se compra). */
const ESTADOS_ORGANIZABLES: readonly EstadoPedido[] = ["BORRADOR", "CONFIRMADO", "EN_COMPRA", "EN_PREPARACION", "PREPARADO", "EN_REPARTO"];

const NOMBRE_PRIORIDAD: Readonly<Record<PrioridadPedido, string>> = { ALTA: "alta", NORMAL: "normal", BAJA: "baja" };

const esquemaPrioridad = z.object({
  pedidoIds: z.array(z.uuid()).min(1, "Elegí al menos un pedido."),
  prioridad: z.enum(prioridadPedido.enumValues, "Elegí la prioridad."),
});

/** Cambia la prioridad de uno o varios pedidos (tablero). Con faltantes, los de prioridad alta se abastecen primero. */
export async function cambiarPrioridad(db: BaseDatos, authUserId: string, datos: z.input<typeof esquemaPrioridad>): Promise<number> {
  const d = validar(esquemaPrioridad, datos);
  return ejecutarComoUsuario(db, authUserId, "pedidos.editar", async (tx, c) => {
    const filas = await tx
      .select({ id: pedido.id, numero: pedido.numero, estado: pedido.estado, prioridad: pedido.prioridad, jornadaId: pedido.jornadaId, cliente: cliente.nombre })
      .from(pedido)
      .innerJoin(cliente, eq(cliente.id, pedido.clienteId))
      .where(inArray(pedido.id, d.pedidoIds))
      .for("update", { of: pedido });
    if (filas.length !== new Set(d.pedidoIds).size) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró alguno de los pedidos.");
    const cambian = filas.filter((p) => (ESTADOS_ORGANIZABLES as readonly string[]).includes(p.estado) && p.prioridad !== d.prioridad);
    for (const p of cambian) {
      await tx.update(pedido).set({ prioridad: d.prioridad, actualizadoPor: c.usuarioId }).where(eq(pedido.id, p.id));
      await registrarActividad(tx, c, {
        accion: "PRIORIDAD",
        entidadTipo: "PEDIDO",
        entidadId: p.id,
        jornadaId: p.jornadaId,
        resumen: `le puso prioridad ${NOMBRE_PRIORIDAD[d.prioridad]} al pedido ${numeroPedido(p.numero)} de ${p.cliente}`,
      });
    }
    return cambian.length;
  });
}

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const horaDePlazo = textoOpcional(5).refine((v) => v === null || HORA.test(v), { message: "La hora va en formato 24 h, ej. 08:30." });

const esquemaPlazo = z
  .object({ pedidoId: z.uuid(), entregaDesde: horaDePlazo, entregaHasta: horaDePlazo })
  .refine((d) => !d.entregaDesde || !d.entregaHasta || d.entregaDesde < d.entregaHasta, { message: "El plazo termina antes de empezar." });

/** El plazo de entrega que pidió el cliente ("antes de las 9", "entre 7 y 9"). Vacío = sin plazo. */
export async function cambiarPlazo(db: BaseDatos, authUserId: string, datos: z.input<typeof esquemaPlazo>): Promise<void> {
  const d = validar(esquemaPlazo, datos);
  await ejecutarComoUsuario(db, authUserId, "pedidos.editar", async (tx, c) => {
    const [p] = await tx
      .select({ numero: pedido.numero, estado: pedido.estado, jornadaId: pedido.jornadaId, cliente: cliente.nombre })
      .from(pedido)
      .innerJoin(cliente, eq(cliente.id, pedido.clienteId))
      .where(eq(pedido.id, d.pedidoId))
      .for("update", { of: pedido });
    if (!p) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el pedido.");
    if (!(ESTADOS_ORGANIZABLES as readonly string[]).includes(p.estado)) throw new ErrorDeNegocio("TRANSICION_INVALIDA", "Ese pedido ya no se organiza: está entregado o cancelado.");
    await tx.update(pedido).set({ entregaDesde: d.entregaDesde, entregaHasta: d.entregaHasta, actualizadoPor: c.usuarioId }).where(eq(pedido.id, d.pedidoId));
    const plazo = textoPlazo(d.entregaDesde, d.entregaHasta);
    await registrarActividad(tx, c, {
      accion: "PLAZO",
      entidadTipo: "PEDIDO",
      entidadId: d.pedidoId,
      jornadaId: p.jornadaId,
      resumen: plazo ? `anotó que el pedido ${numeroPedido(p.numero)} de ${p.cliente} se entrega ${plazo}` : `le sacó el plazo al pedido ${numeroPedido(p.numero)} de ${p.cliente}`,
    });
  });
}

const esquemaResponsable = z.object({
  pedidoIds: z.array(z.uuid()).min(1, "Elegí al menos un pedido."),
  /** Nulo = sin nadie asignado (queda quien lo cargó). */
  usuarioId: z.uuid().nullable(),
});

/** Quién se encarga de uno o varios pedidos (el "miembro" de la tarjeta). */
export async function asignarResponsable(db: BaseDatos, authUserId: string, datos: z.input<typeof esquemaResponsable>): Promise<number> {
  const d = validar(esquemaResponsable, datos);
  return ejecutarComoUsuario(db, authUserId, "pedidos.editar", async (tx, c) => {
    let nombre: string | null = null;
    if (d.usuarioId) {
      const [u] = await tx.select({ nombre: usuario.nombre, activo: usuario.activo }).from(usuario).where(eq(usuario.id, d.usuarioId));
      if (!u?.activo) throw new ErrorDeNegocio("VALIDACION", "Esa persona no está habilitada en el sistema.");
      nombre = u.nombre;
    }
    const filas = await tx
      .select({ id: pedido.id, numero: pedido.numero, estado: pedido.estado, responsableId: pedido.responsableId, jornadaId: pedido.jornadaId, cliente: cliente.nombre })
      .from(pedido)
      .innerJoin(cliente, eq(cliente.id, pedido.clienteId))
      .where(inArray(pedido.id, d.pedidoIds))
      .for("update", { of: pedido });
    if (filas.length !== new Set(d.pedidoIds).size) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró alguno de los pedidos.");
    const cambian = filas.filter((p) => (ESTADOS_ORGANIZABLES as readonly string[]).includes(p.estado) && p.responsableId !== d.usuarioId);
    for (const p of cambian) {
      await tx.update(pedido).set({ responsableId: d.usuarioId, actualizadoPor: c.usuarioId }).where(eq(pedido.id, p.id));
      await registrarActividad(tx, c, {
        accion: "ASIGNAR",
        entidadTipo: "PEDIDO",
        entidadId: p.id,
        jornadaId: p.jornadaId,
        paraUsuarioId: d.usuarioId,
        resumen: nombre
          ? d.usuarioId === c.usuarioId
            ? `se hizo cargo del pedido ${numeroPedido(p.numero)} de ${p.cliente}`
            : `le pasó el pedido ${numeroPedido(p.numero)} de ${p.cliente} a ${nombre}`
          : `dejó sin responsable el pedido ${numeroPedido(p.numero)} de ${p.cliente}`,
      });
    }
    return cambian.length;
  });
}

// ——— Carga visual de pedidos: "Nuevo pedido" y "Cambiar productos" (28/09/2026) ———

const esquemaLineaElegida = z.object({
  productoId: z.uuid("Elegí el producto."),
  presentacionId: z.uuid().nullish(),
  cantidad: numeroObligatorio(MENSAJE_CANTIDAD).refine((v) => dec(v).gt(0), { message: "La cantidad tiene que ser mayor que 0." }),
  observaciones: textoOpcional(200),
});

const lineasElegidas = z.array(esquemaLineaElegida).min(1, "Elegí al menos un producto: tocá los recuadros de lo que lleva.");

const organizacionDelPedido = {
  prioridad: z.enum(prioridadPedido.enumValues).default("NORMAL"),
  entregaDesde: horaDePlazo,
  entregaHasta: horaDePlazo,
  observaciones: textoOpcional(500),
  confirmar: z.boolean().default(false),
};

const plazoOrdenado = (d: { entregaDesde: string | null; entregaHasta: string | null }) => !d.entregaDesde || !d.entregaHasta || d.entregaDesde < d.entregaHasta;
const MENSAJE_PLAZO = "El plazo termina antes de empezar: revisá las horas (por ejemplo, entre 07:00 y 09:00).";

const esquemaCargaPedido = z
  .object({ fecha: z.string(), clienteId: z.uuid("Elegí el cliente."), puntoEntregaId: z.uuid().nullish(), lineas: lineasElegidas, ...organizacionDelPedido })
  .refine(plazoOrdenado, { message: MENSAJE_PLAZO });

const esquemaCambioProductos = z
  .object({ pedidoId: z.uuid(), fecha: z.string().optional(), puntoEntregaId: z.uuid().nullish(), lineas: lineasElegidas, ...organizacionDelPedido })
  .refine(plazoOrdenado, { message: MENSAJE_PLAZO });

/** Lo que muestra la pantalla después de guardar. */
export interface PedidoCargado {
  pedidoId: string;
  numero: string;
  fecha: FechaISO;
  cliente: string;
  estado: EstadoPedido;
  /** El cliente ya tenía otro pedido para ese día y lugar (RN-022). */
  duplicadoDe: string | null;
  /** Solo con `precios.ver_venta`. */
  totalEstimado: string | null;
}

const lineaElegida = (l: z.output<typeof esquemaLineaElegida>): LineaElegida => ({
  productoId: l.productoId,
  presentacionId: l.presentacionId ?? null,
  cantidad: String(l.cantidad),
  observaciones: l.observaciones ?? null,
});

async function insertarLineas(tx: Transaccion, c: ContextoUsuario, pedidoId: string, lineas: readonly LineaElegida[]): Promise<void> {
  const [ultima] = await tx.select({ n: max(pedidoItem.linea) }).from(pedidoItem).where(eq(pedidoItem.pedidoId, pedidoId));
  let numero = ultima?.n ?? 0;
  for (const l of lineas) {
    const prod = await productoParaLinea(tx, l.productoId, l.presentacionId);
    await tx.insert(pedidoItem).values({
      empresaId: c.empresaId,
      pedidoId,
      linea: ++numero,
      productoId: l.productoId,
      presentacionId: l.presentacionId,
      cantidad: aNumeric(l.cantidad, 3),
      cantidadBase: aNumeric(cantidadBaseDe(l.cantidad, prod), 3),
      observaciones: l.observaciones,
      creadoPor: c.usuarioId,
      actualizadoPor: c.usuarioId,
    });
  }
}

async function resumenDeCarga(tx: Transaccion, c: ContextoUsuario, pedidoId: string, duplicadoDe: string | null): Promise<PedidoCargado> {
  const [p] = await tx
    .select({ numero: pedido.numero, estado: pedido.estado, total: pedido.totalEstimado, fecha: jornada.fecha, cliente: cliente.nombre })
    .from(pedido)
    .innerJoin(jornada, eq(jornada.id, pedido.jornadaId))
    .innerJoin(cliente, eq(cliente.id, pedido.clienteId))
    .where(eq(pedido.id, pedidoId));
  return {
    pedidoId,
    numero: numeroPedido(p!.numero),
    fecha: p!.fecha,
    cliente: p!.cliente,
    estado: p!.estado,
    duplicadoDe,
    totalEstimado: c.permisos.tiene("precios.ver_venta") ? p!.total : null,
  };
}

/**
 * "Nuevo pedido": crea el pedido con todos sus productos, la prioridad y el plazo en una sola
 * transacción y, si se pide, lo confirma. Si algo falla no queda nada a medias (nunca un pedido
 * vacío). Un producto repetido se suma (RN-021).
 */
export async function cargarPedido(db: BaseDatos, authUserId: string, datos: z.input<typeof esquemaCargaPedido>): Promise<PedidoCargado> {
  const d = validar(esquemaCargaPedido, datos);
  return ejecutarComoUsuario(db, authUserId, "pedidos.crear", (tx, c) => cargarEnTransaccion(tx, c, d));
}

async function cargarEnTransaccion(tx: Transaccion, c: ContextoUsuario, d: z.output<typeof esquemaCargaPedido>): Promise<PedidoCargado> {
  if (d.confirmar) c.permisos.exigir("pedidos.confirmar");
  const nuevo = await crearEnTransaccion(tx, c, {
    fecha: d.fecha,
    clienteId: d.clienteId,
    puntoEntregaId: d.puntoEntregaId,
    canal: null,
    referenciaCliente: null,
    observaciones: d.observaciones,
  });
  await insertarLineas(tx, c, nuevo.pedidoId, juntarLineas(d.lineas.map(lineaElegida)));
  await tx.update(pedido).set({ prioridad: d.prioridad, entregaDesde: d.entregaDesde, entregaHasta: d.entregaHasta }).where(eq(pedido.id, nuevo.pedidoId));
  await recalcularPedido(tx, nuevo.pedidoId);
  if (d.confirmar) await confirmarEnTransaccion(tx, c, nuevo.pedidoId);
  return resumenDeCarga(tx, c, nuevo.pedidoId, nuevo.duplicadoDe);
}

/**
 * Varios pedidos de una vez (los de una planilla de Excel): se cargan todos en una sola
 * transacción, así que si uno no se puede cargar no queda ninguno a medias.
 */
export async function cargarPedidos(db: BaseDatos, authUserId: string, datos: readonly z.input<typeof esquemaCargaPedido>[]): Promise<PedidoCargado[]> {
  if (datos.length === 0) throw new ErrorDeNegocio("VALIDACION", "No hay ningún pedido para cargar.");
  if (datos.length > 300) throw new ErrorDeNegocio("VALIDACION", "Son demasiados pedidos juntos: cargá hasta 300 por planilla.");
  const pedidos = datos.map((d) => validar(esquemaCargaPedido, d));
  return ejecutarComoUsuario(db, authUserId, "pedidos.crear", async (tx, c) => {
    const cargados: PedidoCargado[] = [];
    for (const d of pedidos) cargados.push(await cargarEnTransaccion(tx, c, d));
    return cargados;
  });
}

/**
 * "Cambiar productos": guarda de una vez lo que lleva el pedido (agrega, cambia cantidades y saca
 * lo que ya no va), su día, lugar, prioridad, plazo y nota. En borrador lo que se saca se borra;
 * desde confirmado queda cancelado con el motivo (RN-028). Con la compra en curso, la lista queda
 * desactualizada (RN-026, RN-052).
 */
export async function cambiarProductosDePedido(db: BaseDatos, authUserId: string, datos: z.input<typeof esquemaCambioProductos>): Promise<PedidoCargado> {
  const d = validar(esquemaCambioProductos, datos);
  return ejecutarComoUsuario(db, authUserId, null, async (tx, c) => {
    const p = await pedidoParaModificar(tx, c, d.pedidoId);
    const estado = p.pedido.estado;
    const numero = numeroPedido(p.pedido.numero);
    let jornadaId = p.pedido.jornadaId;
    if (d.fecha && d.fecha !== p.fecha) {
      if (estado === "EN_COMPRA") {
        throw new ErrorDeNegocio("VALIDACION", "Este pedido ya está en la lista de compras de su día: para pasarlo a otro día, primero sacalo de la lista desde el tablero.");
      }
      jornadaId = (await jornadaParaPedidos(tx, c, d.fecha)).id;
    }
    const cli = await clienteParaPedido(tx, p.pedido.clienteId, d.puntoEntregaId ?? p.pedido.puntoEntregaId);
    const actuales = await tx
      .select({ itemId: pedidoItem.id, productoId: pedidoItem.productoId, presentacionId: pedidoItem.presentacionId, cantidad: pedidoItem.cantidad, observaciones: pedidoItem.observaciones, linea: pedidoItem.linea })
      .from(pedidoItem)
      .where(and(eq(pedidoItem.pedidoId, d.pedidoId), eq(pedidoItem.cancelado, false)));
    const cambios = diferenciasDeLineas(actuales, d.lineas.map(lineaElegida));

    if (cambios.quitar.length > 0) {
      if (estado === "BORRADOR") {
        await tx.delete(pedidoItem).where(inArray(pedidoItem.id, cambios.quitar));
      } else {
        c.permisos.exigir("pedidos.cancelar");
        const motivo = "Se sacó al cambiar los productos del pedido.";
        await tx.update(pedidoItem).set({ cancelado: true, motivoCancelacion: motivo, actualizadoPor: c.usuarioId }).where(inArray(pedidoItem.id, cambios.quitar));
        for (const id of cambios.quitar) {
          await auditar(tx, {
            empresaId: c.empresaId,
            usuarioId: c.usuarioId,
            accion: "CANCELAR",
            entidad: "pedido_item",
            entidadId: id,
            resumen: `Línea ${actuales.find((a) => a.itemId === id)!.linea} de ${numero} cancelada.`,
            motivo,
          });
        }
      }
    }
    for (const cambio of cambios.cambiar) {
      const item = actuales.find((a) => a.itemId === cambio.itemId)!;
      const prod = await productoParaLinea(tx, item.productoId, item.presentacionId);
      await tx
        .update(pedidoItem)
        .set({ cantidad: aNumeric(cambio.cantidad, 3), cantidadBase: aNumeric(cantidadBaseDe(cambio.cantidad, prod), 3), observaciones: cambio.observaciones, actualizadoPor: c.usuarioId })
        .where(eq(pedidoItem.id, cambio.itemId));
    }
    await insertarLineas(tx, c, d.pedidoId, cambios.agregar);
    await tx
      .update(pedido)
      .set({
        jornadaId,
        puntoEntregaId: cli.puntoId,
        prioridad: d.prioridad,
        entregaDesde: d.entregaDesde,
        entregaHasta: d.entregaHasta,
        observaciones: d.observaciones,
        actualizadoPor: c.usuarioId,
      })
      .where(eq(pedido.id, d.pedidoId));
    await recalcularPedido(tx, d.pedidoId);

    const cambiaron = cambios.agregar.length + cambios.cambiar.length + cambios.quitar.length;
    if (cambiaron > 0) {
      if (estado === "EN_COMPRA") {
        await marcarListaDesactualizada(tx, p.pedido.jornadaId);
        await auditar(tx, {
          empresaId: c.empresaId,
          usuarioId: c.usuarioId,
          accion: "MODIFICAR",
          entidad: "pedido",
          entidadId: d.pedidoId,
          resumen: `Se cambiaron los productos de ${numero} con la compra en curso (RN-026).`,
        });
      }
      await registrarActividad(tx, c, {
        accion: "CAMBIAR_PRODUCTOS",
        entidadTipo: "PEDIDO",
        entidadId: d.pedidoId,
        jornadaId,
        resumen: `cambió los productos del pedido ${numero} de ${cli.nombre}`,
      });
    }
    if (d.confirmar && estado === "BORRADOR") {
      c.permisos.exigir("pedidos.confirmar");
      await confirmarEnTransaccion(tx, c, d.pedidoId);
    }
    return resumenDeCarga(tx, c, d.pedidoId, null);
  });
}
