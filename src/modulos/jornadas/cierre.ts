import { and, eq, inArray, ne, notInArray, sql } from "drizzle-orm";

import { auditar } from "@/db/auditoria";
import { cliente, compra, compraItem, entrega, entregaItem, jornada, listaCompra, listaCompraItem, movimientoCuentaProveedor, pedido, producto, proveedor } from "@/db/esquema";
import type { BaseDatos, Transaccion } from "@/db/tipos";
import { indicadoresCredito } from "@/dominio/compras/credito";
import { dec } from "@/dominio/dinero/decimal";
import { ErrorDeNegocio } from "@/dominio/errores";
import type { FechaISO } from "@/dominio/fechas/fechas";
import { resumenDelDia, type ResumenDelDia } from "@/dominio/jornadas/resumen";
import { margenSobreVenta } from "@/dominio/precios/venta";
import { umbralesSemaforo } from "@/modulos/compras/cuenta";
import { compradoPorProducto } from "@/modulos/compras/lista-compra";
import { jornadaDeFecha, numeroEntrega, unico } from "@/modulos/entregas/comun";
import { documentosAlDiaDe } from "@/modulos/entregas/documentos";
import { numeroPedido } from "@/modulos/pedidos/pedidos";
import { costosReales } from "@/modulos/precios-venta/calculo";
import { registrarActividad } from "@/modulos/colaboracion/registro";
import { ejecutarComoUsuario } from "@/modulos/seguridad/contexto";

// Cierre de jornada (04 §5.h, P-47): RN-040 y RN-041.

export interface Observacion {
  texto: string;
  ruta: string | null;
}

export interface ResumenGuardado extends ResumenDelDia {
  alertas: string[];
  pedidos: { entregados: number; cancelados: number };
  cerradaPor?: string;
}

async function calcularResumen(tx: Transaccion, jornadaId: string, fecha: FechaISO): Promise<ResumenGuardado> {
  const compras = await tx
    .select({ proveedor: proveedor.nombre, total: compra.total, pagado: compra.montoPagadoEnElActo })
    .from(compra)
    .innerJoin(proveedor, eq(proveedor.id, compra.proveedorId))
    .where(and(eq(compra.jornadaId, jornadaId), eq(compra.estado, "REGISTRADA")));
  const entregas = await tx
    .select({ cliente: cliente.nombre, total: entrega.importeTotal, costo: entrega.costoTotal, conDiferencias: entrega.conDiferencias })
    .from(entrega)
    .innerJoin(cliente, eq(cliente.id, entrega.clienteId))
    .where(and(eq(entrega.jornadaId, jornadaId), eq(entrega.estado, "ENTREGADA")));
  const entregado = await tx
    .select({ productoId: entregaItem.productoId, nombre: producto.nombre, unidad: producto.unidadBase, cantidad: sql<string>`coalesce(sum(${entregaItem.cantidadEntregada}), 0)` })
    .from(entregaItem)
    .innerJoin(entrega, and(eq(entrega.id, entregaItem.entregaId), eq(entrega.estado, "ENTREGADA")))
    .innerJoin(producto, eq(producto.id, entregaItem.productoId))
    .where(eq(entrega.jornadaId, jornadaId))
    .groupBy(entregaItem.productoId, producto.nombre, producto.unidadBase);
  const comprado = await compradoPorProducto(tx, jornadaId);
  const idsComprados = [...comprado.keys()].filter((id) => !entregado.some((e) => e.productoId === id));
  const otros = idsComprados.length ? await tx.select({ id: producto.id, nombre: producto.nombre, unidad: producto.unidadBase }).from(producto).where(inArray(producto.id, idsComprados)) : [];
  const todos = [...entregado.map((e) => ({ id: e.productoId, nombre: e.nombre, unidad: e.unidad, entregado: e.cantidad })), ...otros.map((o) => ({ id: o.id, nombre: o.nombre, unidad: o.unidad, entregado: "0" }))];
  const costos = await costosReales(
    tx,
    todos.map((t) => t.id),
    fecha,
  );
  const saldos = await tx
    .select({ proveedor: proveedor.nombre, limite: proveedor.limiteCredito, saldo: sql<string>`coalesce(sum(${movimientoCuentaProveedor.importe}), 0)` })
    .from(proveedor)
    .leftJoin(movimientoCuentaProveedor, eq(movimientoCuentaProveedor.proveedorId, proveedor.id))
    .groupBy(proveedor.id);
  const resumen = resumenDelDia({
    compras: compras.map((x) => ({ proveedor: x.proveedor, total: x.total, pagadoEnElActo: x.pagado })),
    entregas,
    productos: todos
      .map((t) => ({ producto: t.nombre, unidad: t.unidad, comprado: comprado.get(t.id) ?? "0", entregado: t.entregado, costoUnitario: costos.get(t.id)?.delDia ?? null }))
      .sort((a, b) => a.producto.localeCompare(b.producto, "es")),
    saldos: saldos.map((s) => ({ proveedor: s.proveedor, saldo: s.saldo })),
  });

  // Alertas: márgenes bajos o negativos y precios a mano en lo entregado; proveedores cerca del límite.
  const lineas = await tx
    .select({ cliente: cliente.nombre, producto: entregaItem.productoNombre, precio: entregaItem.precioUnitario, costo: entregaItem.costoUnitario, alertas: entregaItem.alertas, override: entregaItem.esOverride })
    .from(entregaItem)
    .innerJoin(entrega, and(eq(entrega.id, entregaItem.entregaId), eq(entrega.estado, "ENTREGADA")))
    .innerJoin(cliente, eq(cliente.id, entrega.clienteId))
    .where(eq(entrega.jornadaId, jornadaId));
  const alertas: string[] = [];
  for (const l of lineas) {
    const margen = l.precio && l.costo ? margenSobreVenta(l.precio, l.costo).toFixed(2).replace(".", ",") : null;
    if (l.alertas.includes("MARGEN_NEGATIVO")) alertas.push(`${l.producto} a ${l.cliente}: se vendió por debajo del costo (margen ${margen} %).`);
    else if (l.alertas.includes("MARGEN_BAJO")) alertas.push(`${l.producto} a ${l.cliente}: margen ${margen} %, por debajo del mínimo.`);
    if (l.override) alertas.push(`${l.producto} a ${l.cliente}: precio puesto a mano.`);
  }
  const umbrales = await umbralesSemaforo(tx);
  for (const s of saldos) {
    const ind = indicadoresCredito(s.saldo, s.limite, umbrales);
    if (ind.usoPct === null) continue;
    if (ind.semaforo !== "VERDE") alertas.push(`${s.proveedor}: ${ind.usoPct.toFixed(1).replace(".", ",")} % del límite de crédito (${ind.semaforo.toLowerCase()}).`);
    else if (ind.usoPct.gte(dec(umbrales.amarilloPct).minus(5))) alertas.push(`${s.proveedor}: ${ind.usoPct.toFixed(1).replace(".", ",")} % del límite, a punto de pasar a amarillo.`);
  }
  const pedidos = await tx.select({ estado: pedido.estado, n: sql<number>`count(*)` }).from(pedido).where(eq(pedido.jornadaId, jornadaId)).groupBy(pedido.estado);
  const contar = (estado: string) => Number(pedidos.find((p) => p.estado === estado)?.n ?? 0);
  return { ...resumen, alertas, pedidos: { entregados: contar("ENTREGADO"), cancelados: contar("CANCELADO") } };
}

export interface EstadoCierre {
  fecha: FechaISO;
  estado: string;
  bloqueos: Observacion[];
  advertencias: Observacion[];
  lineasSinJustificar: number;
  resumen: ResumenGuardado;
  cerrada: { en: Date | null } | null;
}

/** P-47 paso 1 y 2: validaciones de RN-040 y el resumen del día (el guardado si ya está cerrada). */
export async function estadoDelCierre(db: BaseDatos, authUserId: string, fecha: FechaISO): Promise<EstadoCierre> {
  return ejecutarComoUsuario(db, authUserId, "jornada.cerrar", async (tx) => {
    const j = await jornadaDeFecha(tx, fecha);
    if (!j) throw new ErrorDeNegocio("NO_ENCONTRADO", "No hay jornada para ese día.");
    if (j.estado === "CERRADA") {
      return { fecha, estado: j.estado, bloqueos: [], advertencias: [], lineasSinJustificar: 0, resumen: j.resumen as unknown as ResumenGuardado, cerrada: { en: j.cerradaEn } };
    }
    const bloqueos: Observacion[] = [];
    const advertencias: Observacion[] = [];
    const entregas = await tx
      .select({ id: entrega.id, numero: entrega.numero, estado: entrega.estado, version: entrega.version, cliente: cliente.nombre })
      .from(entrega)
      .innerJoin(cliente, eq(cliente.id, entrega.clienteId))
      .where(and(eq(entrega.jornadaId, j.id), ne(entrega.estado, "ANULADA")));
    const alDia = await documentosAlDiaDe(tx, entregas);
    for (const e of entregas) {
      if (e.estado !== "ENTREGADA") bloqueos.push({ texto: `${numeroEntrega(e.numero)} de ${e.cliente} todavía no está confirmada.`, ruta: `/entregas/${e.id}` });
      else if (!alDia.has(e.id)) bloqueos.push({ texto: `${numeroEntrega(e.numero)} de ${e.cliente}: faltan emitir los documentos de su última versión.`, ruta: `/entregas/${e.id}` });
    }
    const pedidos = await tx
      .select({ id: pedido.id, numero: pedido.numero, estado: pedido.estado, cliente: cliente.nombre })
      .from(pedido)
      .innerJoin(cliente, eq(cliente.id, pedido.clienteId))
      .where(and(eq(pedido.jornadaId, j.id), notInArray(pedido.estado, ["ENTREGADO", "CANCELADO"])));
    for (const p of pedidos) bloqueos.push({ texto: `${numeroPedido(p.numero)} de ${p.cliente} no está entregado ni cancelado.`, ruta: `/pedidos/${p.id}` });
    const { sinJustificar } = unico(await tx
      .select({ sinJustificar: sql<number>`count(*)` })
      .from(listaCompraItem)
      .innerJoin(listaCompra, eq(listaCompra.id, listaCompraItem.listaCompraId))
      .where(and(eq(listaCompra.jornadaId, j.id), inArray(listaCompraItem.estado, ["PENDIENTE", "PARCIAL"]))));
    if (Number(sinJustificar) > 0) advertencias.push({ texto: `${sinJustificar} ${Number(sinJustificar) === 1 ? "producto de la lista quedó" : "productos de la lista quedaron"} sin comprar del todo.`, ruta: `/lista-compra?fecha=${fecha}` });
    const { sinPedido } = unico(await tx
      .select({ sinPedido: sql<number>`count(*)` })
      .from(compraItem)
      .innerJoin(compra, and(eq(compra.id, compraItem.compraId), eq(compra.estado, "REGISTRADA")))
      .where(and(eq(compra.jornadaId, j.id), eq(compraItem.sinPedido, true))));
    if (Number(sinPedido) > 0) advertencias.push({ texto: `${sinPedido} ${Number(sinPedido) === 1 ? "línea de compra no tenía" : "líneas de compra no tenían"} pedido: revisá que estén bien.`, ruta: `/compras?fecha=${fecha}` });
    const resumen = await calcularResumen(tx, j.id, fecha);
    for (const a of resumen.alertas) advertencias.push({ texto: a, ruta: null });
    return { fecha, estado: j.estado, bloqueos, advertencias, lineasSinJustificar: Number(sinJustificar), resumen, cerrada: null };
  });
}

/** "Marcar no conseguido: cerrada al cierre de jornada" para lo que quedó pendiente en la lista. */
export async function justificarPendientes(db: BaseDatos, authUserId: string, fecha: FechaISO): Promise<number> {
  return ejecutarComoUsuario(db, authUserId, "jornada.cerrar", async (tx, c) => {
    const j = await jornadaDeFecha(tx, fecha);
    if (!j) throw new ErrorDeNegocio("NO_ENCONTRADO", "No hay jornada para ese día.");
    const [l] = await tx.select({ id: listaCompra.id }).from(listaCompra).where(eq(listaCompra.jornadaId, j.id));
    if (!l) return 0;
    const r = await tx
      .update(listaCompraItem)
      .set({ estado: "NO_CONSEGUIDO", motivoNoConseguido: "Cerrada al cierre de jornada", actualizadoPor: c.usuarioId })
      .where(and(eq(listaCompraItem.listaCompraId, l.id), inArray(listaCompraItem.estado, ["PENDIENTE", "PARCIAL"])))
      .returning({ id: listaCompraItem.id });
    return r.length;
  });
}

/**
 * "Cerrar jornada" (RN-040): sin bloqueos, la jornada queda CERRADA, de solo lectura, con el
 * resumen congelado. Se puede cerrar desde PREPARANDO si todo se confirmó sin reparto.
 */
export async function cerrarJornada(db: BaseDatos, authUserId: string, fecha: FechaISO): Promise<void> {
  const estado = await estadoDelCierre(db, authUserId, fecha);
  if (estado.estado === "CERRADA") return;
  if (!["PREPARANDO", "REPARTIENDO"].includes(estado.estado)) throw new ErrorDeNegocio("VALIDACION", "La jornada todavía no se preparó ni se repartió.");
  if (estado.bloqueos.length) throw new ErrorDeNegocio("VALIDACION", `No se puede cerrar: ${estado.bloqueos.map((b) => b.texto).join(" ")}`);
  await ejecutarComoUsuario(db, authUserId, "jornada.cerrar", async (tx, c) => {
    const [j] = await tx.select().from(jornada).where(eq(jornada.fecha, fecha)).for("update");
    if (!j || j.estado === "CERRADA") return;
    const resumen = { ...(await calcularResumen(tx, j.id, fecha)), cerradaPor: c.nombre };
    await tx.update(jornada).set({ estado: "CERRADA", cerradaEn: sql`now()`, cerradaPor: c.usuarioId, resumen, actualizadoPor: c.usuarioId }).where(eq(jornada.id, j.id));
    await auditar(tx, {
      empresaId: c.empresaId,
      usuarioId: c.usuarioId,
      accion: "CAMBIO_ESTADO",
      entidad: "jornada",
      entidadId: j.id,
      resumen: `Cierre de la jornada del ${fecha}: vendido $${resumen.vendido}, comprado $${resumen.comprado}.`,
      datosDespues: { vendido: resumen.vendido, comprado: resumen.comprado, resultado: resumen.resultado },
    });
    await registrarActividad(tx, c, { accion: "CERRAR", entidadTipo: "JORNADA", entidadId: j.id, jornadaId: j.id, resumen: `cerró el día ${fecha.slice(8, 10)}/${fecha.slice(5, 7)}` });
  });
}

/** Reabrir (RN-041): solo con `jornada.reabrir` y motivo; vuelve a REPARTIENDO para corregir. */
export async function reabrirJornada(db: BaseDatos, authUserId: string, datos: { fecha: FechaISO; motivo: string }): Promise<void> {
  const motivo = datos.motivo?.trim() ?? "";
  if (motivo.length < 5) throw new ErrorDeNegocio("VALIDACION", "Escribí por qué se reabre (al menos 5 letras).");
  await ejecutarComoUsuario(db, authUserId, "jornada.reabrir", async (tx, c) => {
    const [j] = await tx.select().from(jornada).where(eq(jornada.fecha, datos.fecha)).for("update");
    if (!j) throw new ErrorDeNegocio("NO_ENCONTRADO", "No hay jornada para ese día.");
    if (j.estado !== "CERRADA") throw new ErrorDeNegocio("VALIDACION", "La jornada no está cerrada.");
    await tx.update(jornada).set({ estado: "REPARTIENDO", cerradaEn: null, cerradaPor: null, actualizadoPor: c.usuarioId }).where(eq(jornada.id, j.id));
    await auditar(tx, { empresaId: c.empresaId, usuarioId: c.usuarioId, accion: "REAPERTURA_JORNADA", entidad: "jornada", entidadId: j.id, resumen: `Reapertura de la jornada del ${datos.fecha}.`, motivo });
    await registrarActividad(tx, c, { accion: "REABRIR", entidadTipo: "JORNADA", entidadId: j.id, jornadaId: j.id, resumen: `reabrió el día ${datos.fecha.slice(8, 10)}/${datos.fecha.slice(5, 7)} (${motivo})` });
  });
}
