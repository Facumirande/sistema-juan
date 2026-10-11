import { and, count, eq, inArray, ne, sql } from "drizzle-orm";

import { auditar } from "@/db/auditoria";
import { cliente, cobroCliente, documentoEmitido, entrega, entregaItem, factura, facturaEntrega, jornada, listaCompra, pedido, pedidoItem, reparto } from "@/db/esquema";
import { formatearNumeroDocumento } from "@/dominio/numeracion/numeracion";
import type { BaseDatos, Transaccion } from "@/db/tipos";
import { ErrorDeNegocio } from "@/dominio/errores";
import type { FechaISO } from "@/dominio/fechas/fechas";
import { registrarActividad } from "@/modulos/colaboracion/registro";
import { ejecutarComoUsuario, type ContextoUsuario } from "@/modulos/seguridad/contexto";
import type { Permiso } from "@/seguridad/catalogo-permisos";

import { moverPedidosDeEntregas, unico } from "./comun";

// Volver una tarjeta un paso atrás (pedido del usuario, 07/10/2026: una tarjeta se puede pasar de
// columna por accidente). Cada paso deshace exactamente el anterior y nada más:
//  - de "Preparando" vuelve a donde estaba antes de empezar a prepararla;
//  - de "En camino" vuelve a "Preparando" (queda preparada y con su remito, no salió);
//  - de "Entregados" vuelve a "En camino" (no se entregó).
// Si algo lo impide (el día está cerrado, ya se cobró esa entrega, se entregó con diferencias), se
// dice por qué y dónde se resuelve.

export type PasoAtras = "DEJAR_DE_PREPARAR" | "VOLVER_DE_CAMINO" | "DESHACER_ENTREGA";

const PERMISO: Readonly<Record<PasoAtras, Permiso>> = {
  DEJAR_DE_PREPARAR: "preparacion.registrar",
  VOLVER_DE_CAMINO: "repartos.gestionar",
  DESHACER_ENTREGA: "entregas.confirmar",
};

const numeroEntrega = (n: number) => formatearNumeroDocumento("ENT-", n);

/** Las entregas vigentes que llevan algo de ese pedido, con su día. */
async function entregasDelPedido(tx: Transaccion, pedidoId: string) {
  return tx
    .selectDistinct({
      id: entrega.id,
      numero: entrega.numero,
      estado: entrega.estado,
      jornadaId: entrega.jornadaId,
      repartoId: entrega.repartoId,
      clienteId: entrega.clienteId,
      cliente: cliente.nombre,
      conDiferencias: entrega.conDiferencias,
      fecha: jornada.fecha,
      jornadaEstado: jornada.estado,
    })
    .from(entregaItem)
    .innerJoin(entrega, eq(entrega.id, entregaItem.entregaId))
    .innerJoin(cliente, eq(cliente.id, entrega.clienteId))
    .innerJoin(jornada, eq(jornada.id, entrega.jornadaId))
    .innerJoin(pedidoItem, eq(pedidoItem.id, entregaItem.pedidoItemId))
    .where(and(eq(pedidoItem.pedidoId, pedidoId), ne(entrega.estado, "ANULADA")));
}

type EntregaDelPedido = Awaited<ReturnType<typeof entregasDelPedido>>[number];

function exigirDiaAbierto(e: EntregaDelPedido) {
  if (e.jornadaEstado !== "CERRADA") return;
  throw new ErrorDeNegocio("JORNADA_CERRADA", "Ese día ya está cerrado: para volver atrás un pedido, primero reabrí el día.", { enlace: { href: `/jornadas/${e.fecha}/cierre`, texto: "Reabrir el día" } });
}

/** Un reparto que se quedó sin paradas se anula solo; si le quedan y ya están todas entregadas, termina. */
async function acomodarRepartos(tx: Transaccion, c: ContextoUsuario, repartoIds: readonly string[]) {
  for (const id of new Set(repartoIds)) {
    const { paradas, pendientes } = unico(
      await tx
        .select({ paradas: count(), pendientes: sql<number>`count(*) filter (where ${entrega.estado} <> 'ENTREGADA')` })
        .from(entrega)
        .where(and(eq(entrega.repartoId, id), ne(entrega.estado, "ANULADA"))),
    );
    if (Number(paradas) === 0) {
      await tx
        .update(reparto)
        .set({ estado: "ANULADO", anuladoEn: sql`now()`, anuladoPor: c.usuarioId, motivoAnulacion: "Quedó sin paradas: el pedido volvió atrás desde el tablero.", actualizadoPor: c.usuarioId })
        .where(and(eq(reparto.id, id), inArray(reparto.estado, ["PLANIFICADO", "EN_CURSO"])));
    } else if (Number(pendientes) === 0) {
      await tx.update(reparto).set({ estado: "FINALIZADO", regresoEn: sql`coalesce(${reparto.regresoEn}, now())`, actualizadoPor: c.usuarioId }).where(and(eq(reparto.id, id), eq(reparto.estado, "EN_CURSO")));
    }
  }
}

/** De "Preparando" a donde estaba: la preparación armada se anula y el pedido vuelve a la compra (o a Pedidos). */
async function dejarDePreparar(tx: Transaccion, c: ContextoUsuario, suyas: EntregaDelPedido[]) {
  const abiertas = suyas.filter((e) => e.estado === "BORRADOR" || e.estado === "EN_PREPARACION" || e.estado === "PREPARADA");
  if (abiertas.length === 0) {
    if (suyas.some((e) => e.estado === "EN_REPARTO")) throw new ErrorDeNegocio("VALIDACION", "Este pedido ya salió a entregar: primero volvelo de “En camino” a “Preparando”.");
    if (suyas.some((e) => e.estado === "ENTREGADA")) throw new ErrorDeNegocio("VALIDACION", "Este pedido ya figura entregado: primero volvelo de “Entregados” a “En camino”.");
    throw new ErrorDeNegocio("VALIDACION", "Este pedido no se está preparando. Recargá la página para verlo en su columna.");
  }
  abiertas.forEach(exigirDiaAbierto);
  const ids = abiertas.map((e) => e.id);
  const motivo = "Se pasó a Preparando por error: volvió atrás desde el tablero.";
  const [lista] = await tx.select({ id: listaCompra.id }).from(listaCompra).where(eq(listaCompra.jornadaId, abiertas[0]!.jornadaId));
  await Promise.all([
    tx
      .update(entrega)
      .set({ estado: "ANULADA", repartoId: null, ordenEnReparto: null, anuladoEn: sql`now()`, anuladoPor: c.usuarioId, motivoAnulacion: motivo, actualizadoPor: c.usuarioId })
      .where(inArray(entrega.id, ids)),
    tx
      .update(documentoEmitido)
      .set({ estado: "ANULADO", anuladoEn: sql`now()`, anuladoPor: c.usuarioId, motivoAnulacion: motivo, actualizadoPor: c.usuarioId })
      .where(and(inArray(documentoEmitido.entregaId, ids), ne(documentoEmitido.estado, "ANULADO"))),
    // Lo que todavía no se había empezado a separar conserva su estado; lo demás vuelve a la compra
    // (o a Pedidos, si ese día no tiene lista de compras).
    moverPedidosDeEntregas(tx, ids, ["EN_PREPARACION", "PREPARADO"], lista ? "EN_COMPRA" : "CONFIRMADO"),
  ]);
  await acomodarRepartos(
    tx,
    c,
    abiertas.flatMap((e) => (e.repartoId ? [e.repartoId] : [])),
  );
  for (const e of abiertas) {
    await Promise.all([
      auditar(tx, { empresaId: c.empresaId, usuarioId: c.usuarioId, accion: "ANULAR", entidad: "entrega", entidadId: e.id, resumen: `${numeroEntrega(e.numero)} de ${e.cliente}: se deshizo la preparación.`, motivo }),
      registrarActividad(tx, c, { accion: "VOLVER", entidadTipo: "ENTREGA", entidadId: e.id, jornadaId: e.jornadaId, resumen: `volvió atrás el pedido de ${e.cliente}: todavía no se prepara` }),
    ]);
  }
}

/** De "En camino" a "Preparando": no salió. Queda preparada, con su remito, y fuera del reparto. */
async function volverDeCamino(tx: Transaccion, c: ContextoUsuario, suyas: EntregaDelPedido[]) {
  const enCamino = suyas.filter((e) => e.estado === "EN_REPARTO");
  if (enCamino.length === 0) {
    if (suyas.some((e) => e.estado === "ENTREGADA")) throw new ErrorDeNegocio("VALIDACION", "Este pedido ya figura entregado: primero volvelo de “Entregados” a “En camino”.");
    throw new ErrorDeNegocio("VALIDACION", "Este pedido no está en camino. Recargá la página para verlo en su columna.");
  }
  enCamino.forEach(exigirDiaAbierto);
  const ids = enCamino.map((e) => e.id);
  await Promise.all([
    tx.update(entrega).set({ estado: "PREPARADA", repartoId: null, ordenEnReparto: null, actualizadoPor: c.usuarioId }).where(inArray(entrega.id, ids)),
    moverPedidosDeEntregas(tx, ids, ["EN_REPARTO"], "PREPARADO"),
  ]);
  await acomodarRepartos(
    tx,
    c,
    enCamino.flatMap((e) => (e.repartoId ? [e.repartoId] : [])),
  );
  for (const e of enCamino) {
    await registrarActividad(tx, c, { accion: "VOLVER", entidadTipo: "ENTREGA", entidadId: e.id, jornadaId: e.jornadaId, resumen: `volvió atrás el pedido de ${e.cliente}: no salió a entregar` });
  }
}

/** De "Entregados" a "En camino": no se entregó. Se borra quién recibió y, si tenía comprobante propio, se anula. */
async function deshacerEntrega(tx: Transaccion, c: ContextoUsuario, suyas: EntregaDelPedido[]) {
  const entregadas = suyas.filter((e) => e.estado === "ENTREGADA");
  if (entregadas.length === 0) throw new ErrorDeNegocio("VALIDACION", "Este pedido no figura entregado. Recargá la página para verlo en su columna.");
  entregadas.forEach(exigirDiaAbierto);
  const conDiferencias = entregadas.find((e) => e.conDiferencias);
  if (conDiferencias) {
    throw new ErrorDeNegocio("VALIDACION", `La entrega de ${conDiferencias.cliente} se anotó con diferencias (no fue un toque por error): se corrige desde la entrega.`, {
      enlace: { href: `/entregas/${conDiferencias.id}`, texto: "Ir a la entrega" },
    });
  }
  const ids = entregadas.map((e) => e.id);
  const [cobros, comprobantes] = await Promise.all([
    tx
      .select({ numero: cobroCliente.numero, clienteId: cobroCliente.clienteId })
      .from(cobroCliente)
      .where(and(inArray(cobroCliente.entregaId, ids), eq(cobroCliente.estado, "REGISTRADO"))),
    tx
      .select({
        facturaId: factura.id,
        numero: factura.numero,
        entregas: sql<number>`(select count(*) from ${facturaEntrega} fe where fe.factura_id = ${factura.id} and fe.activa)`,
      })
      .from(facturaEntrega)
      .innerJoin(factura, eq(factura.id, facturaEntrega.facturaId))
      .where(and(inArray(facturaEntrega.entregaId, ids), eq(facturaEntrega.activa, true), eq(factura.estado, "EMITIDA"))),
  ]);
  if (cobros[0]) {
    throw new ErrorDeNegocio("VALIDACION", `Ya se anotó un cobro de esta entrega (${formatearNumeroDocumento("COB-", cobros[0].numero)}): anulá ese cobro y después volvé atrás el pedido.`, {
      enlace: { href: `/cuentas-clientes/${cobros[0].clienteId}`, texto: "Ir a la cuenta del cliente" },
    });
  }
  const compartido = comprobantes.find((f) => Number(f.entregas) > 1);
  if (compartido) {
    throw new ErrorDeNegocio("VALIDACION", `Esta entrega ya está en el comprobante ${formatearNumeroDocumento("FAC-", compartido.numero)} junto con otras: anulá el comprobante y después volvé atrás el pedido.`, {
      enlace: { href: `/facturacion/${compartido.facturaId}`, texto: "Ir al comprobante" },
    });
  }
  // El comprobante que se hizo solo al marcarla entregada se anula con ella.
  const motivo = "Se marcó entregado por error: el pedido volvió atrás desde el tablero.";
  const facturaIds = [...new Set(comprobantes.map((f) => f.facturaId))];
  if (facturaIds.length > 0) {
    await Promise.all([
      tx.update(factura).set({ estado: "ANULADA", anuladoEn: sql`now()`, anuladoPor: c.usuarioId, motivoAnulacion: motivo, actualizadoPor: c.usuarioId }).where(inArray(factura.id, facturaIds)),
      tx.update(facturaEntrega).set({ activa: false, actualizadoPor: c.usuarioId }).where(and(inArray(facturaEntrega.facturaId, facturaIds), eq(facturaEntrega.activa, true))),
      ...comprobantes.map((f) => auditar(tx, { empresaId: c.empresaId, usuarioId: c.usuarioId, accion: "ANULAR", entidad: "factura", entidadId: f.facturaId, resumen: `Anulación de ${formatearNumeroDocumento("FAC-", f.numero)}.`, motivo })),
    ]);
  }
  const conReparto = entregadas.filter((e) => e.repartoId).map((e) => e.id);
  const sinReparto = entregadas.filter((e) => !e.repartoId).map((e) => e.id);
  const sinRecibir = { conDiferencias: false, recibidoPor: null, recibidoCargo: null, recibidoEn: null, observacionesRecepcion: null, confirmadaPor: null, estadoFacturacion: "SIN_FACTURAR" as const, actualizadoPor: c.usuarioId };
  await Promise.all([
    tx.update(entregaItem).set({ cantidadEntregada: null, motivoDiferencia: null, detalleDiferencia: null, actualizadoPor: c.usuarioId }).where(inArray(entregaItem.entregaId, ids)),
    conReparto.length > 0 ? tx.update(entrega).set({ ...sinRecibir, estado: "EN_REPARTO" }).where(inArray(entrega.id, conReparto)) : null,
    // Una entrega confirmada desde la oficina, sin reparto, vuelve a quedar preparada.
    sinReparto.length > 0 ? tx.update(entrega).set({ ...sinRecibir, estado: "PREPARADA" }).where(inArray(entrega.id, sinReparto)) : null,
    moverPedidosDeEntregas(tx, conReparto, ["ENTREGADO"], "EN_REPARTO"),
    moverPedidosDeEntregas(tx, sinReparto, ["ENTREGADO"], "PREPARADO"),
    // El reparto que había terminado con esta parada vuelve a estar en la calle.
    conReparto.length > 0
      ? tx
          .update(reparto)
          .set({ estado: "EN_CURSO", regresoEn: null, actualizadoPor: c.usuarioId })
          .where(
            and(
              eq(reparto.estado, "FINALIZADO"),
              inArray(
                reparto.id,
                entregadas.flatMap((e) => (e.repartoId ? [e.repartoId] : [])),
              ),
            ),
          )
      : null,
  ]);
  for (const e of entregadas) {
    await Promise.all([
      auditar(tx, { empresaId: c.empresaId, usuarioId: c.usuarioId, accion: "MODIFICAR", entidad: "entrega", entidadId: e.id, resumen: `${numeroEntrega(e.numero)} de ${e.cliente}: dejó de figurar entregada.`, motivo }),
      registrarActividad(tx, c, { accion: "VOLVER", entidadTipo: "ENTREGA", entidadId: e.id, jornadaId: e.jornadaId, resumen: `volvió atrás el pedido de ${e.cliente}: todavía no se entregó` }),
    ]);
  }
}

/** Vuelve un pedido un paso atrás en el tablero. Devuelve de quién es y de qué día. */
export async function volverAtras(db: BaseDatos, authUserId: string, datos: { pedidoId: string; paso: PasoAtras }): Promise<{ cliente: string; fecha: FechaISO }> {
  return ejecutarComoUsuario(db, authUserId, PERMISO[datos.paso], async (tx, c) => {
    // El pedido queda bloqueado hasta terminar: dos toques seguidos no deshacen dos pasos.
    const [p] = await tx.select({ id: pedido.id }).from(pedido).where(eq(pedido.id, datos.pedidoId)).for("update");
    if (!p) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el pedido: puede que lo hayan cancelado. Recargá la página.");
    const suyas = await entregasDelPedido(tx, datos.pedidoId);
    if (suyas.length === 0) throw new ErrorDeNegocio("VALIDACION", "Este pedido todavía no se empezó a preparar: no hay nada que volver atrás.");
    if (datos.paso === "DEJAR_DE_PREPARAR") await dejarDePreparar(tx, c, suyas);
    else if (datos.paso === "VOLVER_DE_CAMINO") await volverDeCamino(tx, c, suyas);
    else await deshacerEntrega(tx, c, suyas);
    return { cliente: suyas[0]!.cliente, fecha: suyas[0]!.fecha };
  });
}

const ABIERTAS = ["BORRADOR", "EN_PREPARACION", "PREPARADA"];

/**
 * Eliminar un pedido aunque ya esté en proceso (pedido del usuario, 10/10/2026): se deshace lo que se
 * hizo con él (sale del reparto, se anula su preparación con el remito) y queda CANCELADO con el
 * motivo, fuera del tablero. Queda en Actividad, desde donde se recupera (`recuperarPedido`). Un
 * pedido entregado no: primero se vuelve atrás la entrega (RN-189).
 */
export async function eliminarPedido(db: BaseDatos, authUserId: string, datos: { pedidoId: string; motivo?: string | null }): Promise<{ cliente: string; fecha: FechaISO }> {
  return ejecutarComoUsuario(db, authUserId, "pedidos.cancelar", async (tx, c) => {
    const [p] = await tx
      .select({ id: pedido.id, numero: pedido.numero, estado: pedido.estado, jornadaId: pedido.jornadaId, fecha: jornada.fecha, estadoJornada: jornada.estado, cliente: cliente.nombre })
      .from(pedido)
      .innerJoin(jornada, eq(jornada.id, pedido.jornadaId))
      .innerJoin(cliente, eq(cliente.id, pedido.clienteId))
      .where(eq(pedido.id, datos.pedidoId))
      .for("update", { of: pedido });
    if (!p) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el pedido: puede que ya lo hayan eliminado. Recargá la página.");
    if (p.estado === "CANCELADO") return { cliente: p.cliente, fecha: p.fecha };
    if (p.estadoJornada === "CERRADA") throw new ErrorDeNegocio("JORNADA_CERRADA", "Ese día ya está cerrado: para eliminar un pedido, primero reabrí el día.", { enlace: { href: `/jornadas/${p.fecha}/cierre`, texto: "Reabrir el día" } });
    if (p.estado === "ENTREGADO") throw new ErrorDeNegocio("TRANSICION_INVALIDA", "Este pedido ya se entregó: para eliminarlo, primero volvelo a “En camino” (↩ No se entregó).");
    // Lo que salió vuelve, y lo que se estaba preparando se deshace.
    let suyas = await entregasDelPedido(tx, p.id);
    if (suyas.some((e) => e.estado === "EN_REPARTO")) {
      c.permisos.exigir("repartos.gestionar");
      await volverDeCamino(tx, c, suyas);
      suyas = await entregasDelPedido(tx, p.id);
    }
    if (suyas.some((e) => ABIERTAS.includes(e.estado))) {
      c.permisos.exigir("preparacion.registrar");
      await dejarDePreparar(tx, c, suyas);
    }
    const motivo = datos.motivo?.trim() || "Se eliminó desde el tablero";
    const [antes] = await tx.select({ estado: pedido.estado }).from(pedido).where(eq(pedido.id, p.id));
    await tx
      .update(pedido)
      .set({ estado: "CANCELADO", canceladoEn: sql`now()`, canceladoPor: c.usuarioId, motivoCancelacion: motivo, actualizadoPor: c.usuarioId })
      .where(eq(pedido.id, p.id));
    // Si estaba en la lista de compras, la lista queda para volver a calcular.
    if (antes?.estado === "EN_COMPRA") await tx.update(listaCompra).set({ desactualizada: true }).where(eq(listaCompra.jornadaId, p.jornadaId));
    const visible = formatearNumeroDocumento("PED-", p.numero);
    await Promise.all([
      auditar(tx, { empresaId: c.empresaId, usuarioId: c.usuarioId, accion: "CANCELAR", entidad: "pedido", entidadId: p.id, resumen: `${visible} eliminado.`, motivo, datosAntes: { estado: p.estado }, datosDespues: { estado: "CANCELADO" } }),
      registrarActividad(tx, c, { accion: "ELIMINAR", entidadTipo: "PEDIDO", entidadId: p.id, jornadaId: p.jornadaId, resumen: `eliminó el pedido ${visible} de ${p.cliente}` }),
    ]);
    return { cliente: p.cliente, fecha: p.fecha };
  });
}

/**
 * Recuperar un pedido eliminado o cancelado (desde Actividad o desde su tarjeta): vuelve a la columna
 * Pedidos con todos sus productos, para seguir su camino de nuevo (RN-189).
 */
export async function recuperarPedido(db: BaseDatos, authUserId: string, datos: { pedidoId: string }): Promise<{ cliente: string; fecha: FechaISO }> {
  return ejecutarComoUsuario(db, authUserId, "pedidos.editar", async (tx, c) => {
    const [p] = await tx
      .select({ id: pedido.id, numero: pedido.numero, estado: pedido.estado, jornadaId: pedido.jornadaId, fecha: jornada.fecha, estadoJornada: jornada.estado, cliente: cliente.nombre })
      .from(pedido)
      .innerJoin(jornada, eq(jornada.id, pedido.jornadaId))
      .innerJoin(cliente, eq(cliente.id, pedido.clienteId))
      .where(eq(pedido.id, datos.pedidoId))
      .for("update", { of: pedido });
    if (!p) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el pedido.");
    if (p.estado !== "CANCELADO") return { cliente: p.cliente, fecha: p.fecha };
    if (p.estadoJornada === "CERRADA") throw new ErrorDeNegocio("JORNADA_CERRADA", "Ese día ya está cerrado: para recuperar un pedido, primero reabrí el día.", { enlace: { href: `/jornadas/${p.fecha}/cierre`, texto: "Reabrir el día" } });
    const { n } = unico(await tx.select({ n: count() }).from(pedidoItem).where(and(eq(pedidoItem.pedidoId, p.id), eq(pedidoItem.cancelado, false))));
    await tx
      .update(pedido)
      .set({ estado: Number(n) > 0 ? "CONFIRMADO" : "BORRADOR", canceladoEn: null, canceladoPor: null, motivoCancelacion: null, actualizadoPor: c.usuarioId })
      .where(eq(pedido.id, p.id));
    const visible = formatearNumeroDocumento("PED-", p.numero);
    await Promise.all([
      auditar(tx, { empresaId: c.empresaId, usuarioId: c.usuarioId, accion: "MODIFICAR", entidad: "pedido", entidadId: p.id, resumen: `${visible} recuperado.`, datosAntes: { estado: "CANCELADO" }, datosDespues: { estado: "CONFIRMADO" } }),
      registrarActividad(tx, c, { accion: "RECUPERAR", entidadTipo: "PEDIDO", entidadId: p.id, jornadaId: p.jornadaId, resumen: `recuperó el pedido ${visible} de ${p.cliente}` }),
    ]);
    return { cliente: p.cliente, fecha: p.fecha };
  });
}
