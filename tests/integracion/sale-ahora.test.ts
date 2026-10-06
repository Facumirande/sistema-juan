import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { jornada } from "@/db/esquema";
import { enEmpresa } from "@/db/transaccion";
import { crearProducto } from "@/modulos/catalogo/productos";
import { obtenerEntrega } from "@/modulos/entregas/entregas";
import { iniciarPreparacion, marcarPreparada, obtenerEntregaParaPreparar, obtenerPreparacion, prepararTodoComoPropuesto, sustituirProducto } from "@/modulos/entregas/preparacion";
import { agregarAlReparto, crearReparto, mandarEnCamino, obtenerReparto, salirDeReparto } from "@/modulos/entregas/repartos";
import { obtenerPedido } from "@/modulos/pedidos/pedidos";
import { esErrorDeNegocio } from "@/dominio/errores";

import { prepararJornada2409, type Jornada2409 } from "./escenario-24-09";

// "🚚 Sale ahora" (RN-153, pedido del usuario 06/10/2026): de Preparando a En camino en un paso.

let j: Jornada2409;
const entregas: Record<string, string> = {};

const falla = async (promesa: Promise<unknown>) => {
  try {
    await promesa;
  } catch (e) {
    if (esErrorDeNegocio(e)) return { codigo: e.codigo, mensaje: e.message, detalle: e.detalle };
    throw e;
  }
  throw new Error("Se esperaba un error de negocio");
};

beforeAll(async () => {
  j = await prepararJornada2409();
});

describe("sale ahora (RN-153)", () => {
  it("un pedido que todavía no se empezó a preparar no sale y dice cómo seguir", async () => {
    const r = await falla(mandarEnCamino(j.base.db, j.admin, { pedidoIds: [j.ids.pedRestaurante!] }));
    expect(r.mensaje).toMatch(/Todavía no se empezó a preparar lo de Restaurante La Esquina/);
    expect(r.detalle?.enlace).toEqual({ href: `/preparacion/${j.manana}`, texto: "Ir a preparación" });
  });

  it("con productos sin tildar pide confirmar; confirmado, se prepara, se hace el remito y sale un reparto nuevo", async () => {
    await iniciarPreparacion(j.base.db, j.admin, j.manana);
    for (const e of (await obtenerPreparacion(j.base.db, j.admin, j.manana)).entregas) entregas[e.cliente] = e.id;
    const r = await falla(mandarEnCamino(j.base.db, j.admin, { pedidoIds: [j.ids.pedRestaurante!] }));
    expect(r.detalle?.requiereConfirmacion).toBe(true);
    expect(r.mensaje).toMatch(/Falta tildar lo separado de Restaurante La Esquina \(tomate redondo, papa, lechuga criolla y cebolla\)/);
    // Nada cambió.
    expect((await obtenerEntregaParaPreparar(j.base.db, j.admin, entregas["Restaurante La Esquina"]!)).estado).toBe("BORRADOR");

    const salida = await mandarEnCamino(j.base.db, j.admin, { pedidoIds: [j.ids.pedRestaurante!], confirmar: true });
    expect(salida.fecha).toBe(j.manana);
    expect(salida.repartos).toHaveLength(1);
    expect(salida.repartos[0]!.clientes).toEqual(["Restaurante La Esquina"]);
    const e = await obtenerEntrega(j.base.db, j.admin, entregas["Restaurante La Esquina"]!);
    expect([e.estado, e.documentosAlDia, e.totales?.total]).toEqual(["EN_REPARTO", true, "114400.00"]);
    expect((await obtenerPedido(j.base.db, j.admin, j.ids.pedRestaurante!)).estado).toBe("EN_REPARTO");
    const rep = await obtenerReparto(j.base.db, j.admin, salida.repartos[0]!.id);
    expect([rep.estado, rep.esMio]).toEqual(["EN_CURSO", true]);
    const [jor] = await enEmpresa(j.base.db, j.empresaId, (tx) => tx.select().from(jornada).where(eq(jornada.fecha, j.manana)));
    expect(jor?.estado).toBe("REPARTIENDO");
    // Volver a mandarlo no hace nada.
    expect(await mandarEnCamino(j.base.db, j.admin, { pedidoIds: [j.ids.pedRestaurante!] })).toMatchObject({ repartos: [], yaEnCamino: ["Restaurante La Esquina"] });
  });

  it("sin precio para el remito no sale nada y ofrece ir a ponerlo", async () => {
    const hospital = entregas["Hospital San Martín"]!;
    const kale = await crearProducto(j.base.db, j.admin, { codigo: "KALE", nombre: "Kale", categoriaId: j.ids.verduras!, unidadBase: "KG", admiteFraccion: true });
    const banana = (await obtenerEntregaParaPreparar(j.base.db, j.admin, hospital)).lineas.find((l) => l.producto === "Banana")!;
    await sustituirProducto(j.base.db, j.admin, { itemId: banana.id, productoId: kale, cantidad: "5" });
    const r = await falla(mandarEnCamino(j.base.db, j.admin, { entregaIds: [hospital], confirmar: true }));
    expect(r.codigo).toBe("PRECIO_SIN_COSTO");
    expect(r.mensaje).toMatch(/falta el precio de Kale/);
    expect(r.detalle?.enlace).toEqual({ href: `/productos/${kale}`, texto: "Poner el precio de Kale" });
    expect((await obtenerEntregaParaPreparar(j.base.db, j.admin, hospital)).estado).toBe("EN_PREPARACION");
  });

  it("si está en un reparto armado sale ese reparto, y avisa si otra parada no está lista", async () => {
    const verduleria = entregas["Verdulería Don Pepe"]!;
    const reparto = await crearReparto(j.base.db, j.admin, { fecha: j.manana });
    await agregarAlReparto(j.base.db, j.admin, { repartoId: reparto, entregaId: verduleria });
    await agregarAlReparto(j.base.db, j.admin, { repartoId: reparto, entregaId: entregas["Hospital San Martín"]! });
    const r = await falla(mandarEnCamino(j.base.db, j.admin, { pedidoIds: [j.ids.pedVerduleria!], confirmar: true }));
    expect(r.mensaje).toMatch(/también lleva lo de Hospital San Martín, que todavía no está preparado/);
    expect(r.detalle?.enlace).toMatchObject({ href: `/repartos/${reparto}` });
    // Con "Salir" desde el reparto, sin elegir quién: lo hace quien toca.
    await prepararTodoComoPropuesto(j.base.db, j.admin, verduleria);
    await marcarPreparada(j.base.db, j.admin, { entregaId: verduleria });
    const solo = await crearReparto(j.base.db, j.admin, { fecha: j.manana });
    const { quitarDelReparto } = await import("@/modulos/entregas/repartos");
    await quitarDelReparto(j.base.db, j.admin, { repartoId: reparto, entregaId: verduleria });
    await agregarAlReparto(j.base.db, j.admin, { repartoId: solo, entregaId: verduleria });
    await salirDeReparto(j.base.db, j.admin, solo);
    expect((await obtenerReparto(j.base.db, j.admin, solo)).esMio).toBe(true);
    expect((await obtenerPedido(j.base.db, j.admin, j.ids.pedVerduleria!)).estado).toBe("EN_REPARTO");
  });
});
