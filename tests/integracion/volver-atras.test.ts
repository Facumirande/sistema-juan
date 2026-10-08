import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { entrega, factura, facturaEntrega, jornada, reparto } from "@/db/esquema";
import { enEmpresa } from "@/db/transaccion";
import { esErrorDeNegocio } from "@/dominio/errores";
import { anularCobro, listarCuentasClientes, registrarCobro } from "@/modulos/cuentas-clientes/cuentas";
import { entregarPedido, obtenerEntrega } from "@/modulos/entregas/entregas";
import { iniciarPreparacion, obtenerPreparacion, separarLinea } from "@/modulos/entregas/preparacion";
import { mandarEnCamino } from "@/modulos/entregas/repartos";
import { volverAtras } from "@/modulos/entregas/volver-atras";
import { reabrirJornada } from "@/modulos/jornadas/cierre";
import { obtenerPedido } from "@/modulos/pedidos/pedidos";
import { tableroDePedidos } from "@/modulos/pedidos/tablero";

import { prepararJornada2409, type Jornada2409 } from "./escenario-24-09";

// Volver una tarjeta un paso atrás (pedido del usuario, 07/10/2026): una tarjeta se puede pasar de
// columna por accidente. Cada paso deshace exactamente el anterior.

let j: Jornada2409;

const falla = async (promesa: Promise<unknown>) => {
  try {
    await promesa;
  } catch (e) {
    if (esErrorDeNegocio(e)) return { codigo: e.codigo, mensaje: e.message, detalle: e.detalle };
    throw e;
  }
  throw new Error("Se esperaba un error de negocio");
};

const estadoDe = async (pedidoId: string) => (await obtenerPedido(j.base.db, j.admin, pedidoId)).estado;
const columnaDe = async (pedidoId: string) => (await tableroDePedidos(j.base.db, j.admin, j.manana)).columnas.find((c) => c.tarjetas.some((t) => t.id === pedidoId))?.clave ?? null;
const entregaDe = async (cliente: string) => (await obtenerPreparacion(j.base.db, j.admin, j.manana)).entregas.find((e) => e.cliente === cliente) ?? null;
const enLaBase = <T>(fn: Parameters<typeof enEmpresa<T>>[2]) => enEmpresa(j.base.db, j.empresaId, fn);

beforeAll(async () => {
  j = await prepararJornada2409();
});

describe("volver una tarjeta un paso atrás", () => {
  it("lo que todavía no se empezó a preparar no tiene nada que deshacer", async () => {
    const r = await falla(volverAtras(j.base.db, j.admin, { pedidoId: j.ids.pedRestaurante!, paso: "DEJAR_DE_PREPARAR" }));
    expect(r.mensaje).toMatch(/todavía no se empezó a preparar/);
  });

  it("de Preparando vuelve a la compra: la preparación se anula y se puede volver a empezar", async () => {
    const antes = await estadoDe(j.ids.pedRestaurante!);
    await iniciarPreparacion(j.base.db, j.admin, j.manana, { pedidoIds: [j.ids.pedRestaurante!] });
    const armada = (await entregaDe("Restaurante La Esquina"))!;
    await separarLinea(j.base.db, j.admin, { itemId: armada.detalle[0]!.id, separado: true });
    expect([await estadoDe(j.ids.pedRestaurante!), await columnaDe(j.ids.pedRestaurante!)]).toEqual(["EN_PREPARACION", "preparando"]);

    const r = await volverAtras(j.base.db, j.admin, { pedidoId: j.ids.pedRestaurante!, paso: "DEJAR_DE_PREPARAR" });
    expect(r).toEqual({ cliente: "Restaurante La Esquina", fecha: j.manana });
    expect(antes).toBe("EN_COMPRA");
    expect(await estadoDe(j.ids.pedRestaurante!)).toBe("EN_COMPRA");
    expect(["en_lista", "comprados"]).toContain(await columnaDe(j.ids.pedRestaurante!));
    expect(await entregaDe("Restaurante La Esquina")).toBeNull();
    const [anulada] = await enLaBase((tx) => tx.select({ estado: entrega.estado, motivo: entrega.motivoAnulacion }).from(entrega).where(eq(entrega.id, armada.id)));
    expect(anulada).toMatchObject({ estado: "ANULADA" });
    expect(anulada?.motivo).toMatch(/por error/);

    // Se puede volver a empezar: se arma otra preparación con todo lo suyo.
    const otra = await iniciarPreparacion(j.base.db, j.admin, j.manana, { pedidoIds: [j.ids.pedRestaurante!] });
    expect(otra.lineasNuevas).toBe(4);
    expect((await entregaDe("Restaurante La Esquina"))?.id).not.toBe(armada.id);
  });

  it("de En camino vuelve a Preparando: queda preparada con su remito, y el reparto que quedó vacío se anula", async () => {
    const salida = await mandarEnCamino(j.base.db, j.admin, { pedidoIds: [j.ids.pedRestaurante!], confirmar: true });
    const e = (await entregaDe("Restaurante La Esquina"))!;
    expect(await columnaDe(j.ids.pedRestaurante!)).toBe("en_camino");
    // De En camino no se salta a "dejar de preparar": se vuelve de a un paso.
    expect((await falla(volverAtras(j.base.db, j.admin, { pedidoId: j.ids.pedRestaurante!, paso: "DEJAR_DE_PREPARAR" }))).mensaje).toMatch(/ya salió a entregar/);

    await volverAtras(j.base.db, j.admin, { pedidoId: j.ids.pedRestaurante!, paso: "VOLVER_DE_CAMINO" });
    const despues = await obtenerEntrega(j.base.db, j.admin, e.id);
    expect([despues.estado, despues.documentosAlDia, await estadoDe(j.ids.pedRestaurante!), await columnaDe(j.ids.pedRestaurante!)]).toEqual(["PREPARADA", true, "PREPARADO", "preparando"]);
    const [rep] = await enLaBase((tx) => tx.select({ estado: reparto.estado }).from(reparto).where(eq(reparto.id, salida.repartos[0]!.id)));
    expect(rep?.estado).toBe("ANULADO");
    expect((await falla(volverAtras(j.base.db, j.admin, { pedidoId: j.ids.pedRestaurante!, paso: "VOLVER_DE_CAMINO" }))).mensaje).toMatch(/no está en camino/);
  });

  it("de Entregados vuelve a En camino: deja de figurar entregada, se anula su comprobante y ya no está a cobrar", async () => {
    await mandarEnCamino(j.base.db, j.admin, { pedidoIds: [j.ids.pedRestaurante!] });
    await entregarPedido(j.base.db, j.admin, j.ids.pedRestaurante!);
    const e = (await entregaDe("Restaurante La Esquina"))!;
    expect(await columnaDe(j.ids.pedRestaurante!)).toBe("entregados");
    expect((await listarCuentasClientes(j.base.db, j.admin)).cuentas.map((c) => c.cliente)).toContain("Restaurante La Esquina");
    const comprobantes = () => enLaBase((tx) => tx.select({ estado: factura.estado, activa: facturaEntrega.activa }).from(facturaEntrega).innerJoin(factura, eq(factura.id, facturaEntrega.facturaId)).where(eq(facturaEntrega.entregaId, e.id)));
    expect(await comprobantes()).toEqual([{ estado: "EMITIDA", activa: true }]);

    // Con un cobro anotado por esa entrega, primero hay que anular el cobro.
    const cobro = await registrarCobro(j.base.db, j.admin, { clienteId: j.ids.restaurante!, entregaId: e.id, medioPago: "EFECTIVO" });
    const conCobro = await falla(volverAtras(j.base.db, j.admin, { pedidoId: j.ids.pedRestaurante!, paso: "DESHACER_ENTREGA" }));
    expect(conCobro.mensaje).toMatch(/Ya se anotó un cobro de esta entrega \(COB-/);
    expect(conCobro.detalle?.enlace).toEqual({ href: `/cuentas-clientes/${j.ids.restaurante}`, texto: "Ir a la cuenta del cliente" });
    await anularCobro(j.base.db, j.admin, { cobroId: cobro.cobroId, motivo: "Se anotó por error" });

    await volverAtras(j.base.db, j.admin, { pedidoId: j.ids.pedRestaurante!, paso: "DESHACER_ENTREGA" });
    const despues = await obtenerEntrega(j.base.db, j.admin, e.id);
    expect([despues.estado, despues.recibidoPor, await estadoDe(j.ids.pedRestaurante!), await columnaDe(j.ids.pedRestaurante!)]).toEqual(["EN_REPARTO", null, "EN_REPARTO", "en_camino"]);
    expect(despues.lineas.every((l) => l.cantidadEntregada === null)).toBe(true);
    expect(await comprobantes()).toEqual([{ estado: "ANULADA", activa: false }]);
    expect((await listarCuentasClientes(j.base.db, j.admin)).cuentas.map((c) => c.cliente)).not.toContain("Restaurante La Esquina");
    const [rep] = await enLaBase((tx) => tx.select({ estado: reparto.estado }).from(reparto).innerJoin(entrega, eq(entrega.repartoId, reparto.id)).where(eq(entrega.id, e.id)));
    expect(rep?.estado).toBe("EN_CURSO");
    // Y se puede volver a marcar entregado.
    await entregarPedido(j.base.db, j.admin, j.ids.pedRestaurante!);
    expect(await columnaDe(j.ids.pedRestaurante!)).toBe("entregados");
  });

  it("con el día cerrado no se vuelve atrás: primero se reabre", async () => {
    await enLaBase((tx) => tx.update(jornada).set({ estado: "CERRADA" }).where(eq(jornada.fecha, j.manana)));
    const r = await falla(volverAtras(j.base.db, j.admin, { pedidoId: j.ids.pedRestaurante!, paso: "DESHACER_ENTREGA" }));
    expect(r.codigo).toBe("JORNADA_CERRADA");
    expect(r.detalle?.enlace).toEqual({ href: `/jornadas/${j.manana}/cierre`, texto: "Reabrir el día" });
    await reabrirJornada(j.base.db, j.admin, { fecha: j.manana, motivo: "Reabierto desde el tablero." });
    await volverAtras(j.base.db, j.admin, { pedidoId: j.ids.pedRestaurante!, paso: "DESHACER_ENTREGA" });
    expect(await columnaDe(j.ids.pedRestaurante!)).toBe("en_camino");
  });
});
