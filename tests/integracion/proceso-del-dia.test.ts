import { and, eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { actividad, compra, compraItem, entrega, proveedor, usuario } from "@/db/esquema";
import { costoDeLaLista } from "@/dominio/compras/costo-de-la-lista";
import { dec } from "@/dominio/dinero/decimal";
import { crearProducto } from "@/modulos/catalogo/productos";
import { avisosPara } from "@/modulos/colaboracion/avisos";
import { comprarDeLaLista, destildarConCompra, quitarCompraDeLaLista } from "@/modulos/compras/compra-desde-lista";
import { circuitosDeCompra, guardarCircuitos, ordenarParadas } from "@/modulos/compras/circuitos";
import { elegirPuestoDeLinea, elegirPuestoDeLineas, generarListaCompra, obtenerListaCompra, tildarLinea } from "@/modulos/compras/lista-compra";
import { guardarResponsables, responsablesDelNegocio } from "@/modulos/configuracion/empresa";
import { iniciarPreparacion } from "@/modulos/entregas/preparacion";
import { eliminarPedido, recuperarPedido } from "@/modulos/entregas/volver-atras";
import { sugerirLugares } from "@/modulos/entregas/viaje";
import { agregarLinea, confirmarPedido, crearPedido, obtenerPedido, ponerPrecioALinea } from "@/modulos/pedidos/pedidos";

import { codigoDeError, crearUsuarioDePrueba } from "./base-de-prueba";
import { prepararJornada2409, type Jornada2409 } from "./escenario-24-09";

// Lo que se agregó al proceso del día el 10/10/2026: elegir el puesto en la lista, comprar sin
// puesto, destildar una compra anotada, ponerle precio sobre la marcha a un producto, eliminar y
// recuperar un pedido en proceso, quién se encarga de cada paso y las sugerencias de lugares.

let j: Jornada2409;
const linea = async (nombre: string) => (await obtenerListaCompra(j.base.db, j.admin, j.manana))!.plan.flatMap((p) => p.lineas).find((l) => l.producto === nombre)!;

beforeAll(async () => {
  j = await prepararJornada2409();
});

describe("lista de compras: el puesto de cada renglón, sin puesto y destildar", () => {
  it("el puesto elegido a mano queda, también al rearmar la lista (RN-187)", async () => {
    const banana = await linea("Banana");
    await elegirPuestoDeLinea(j.base.db, j.admin, { itemId: banana.id, proveedorId: j.ids.C! });
    expect((await linea("Banana")).proveedorId).toBe(j.ids.C);
    await generarListaCompra(j.base.db, j.comprador, j.manana);
    expect((await linea("Banana")).proveedorId).toBe(j.ids.C);
    // Sin puesto: se compra en efectivo donde sea.
    await elegirPuestoDeLinea(j.base.db, j.admin, { itemId: banana.id, proveedorId: null });
    expect((await linea("Banana")).proveedorId).toBeNull();
  });

  it("lo que se compra sin decir el puesto va al puesto genérico y queda pagado (en efectivo)", async () => {
    const banana = await linea("Banana");
    const r = await comprarDeLaLista(j.base.db, j.comprador, { itemId: banana.id, sinPuesto: true, presentacionId: j.presentaciones["banana:Caja 20 kg"]!, cantidad: "1", precio: "20000", pagado: false });
    expect(r.proveedor).toBe("Sin puesto (efectivo)");
    const [k] = await j.base.comoSuperusuario(() => j.base.db.select({ condicion: compra.condicionPago }).from(compra).where(eq(compra.id, r.compraId)));
    expect(k?.condicion).toBe("CONTADO");
    // La segunda vez usa el mismo puesto genérico.
    const otra = await comprarDeLaLista(j.base.db, j.comprador, { itemId: banana.id, sinPuesto: true, presentacionId: j.presentaciones["banana:Caja 20 kg"]!, cantidad: "1", precio: "20000", pagado: true });
    expect(otra.proveedor).toBe(r.proveedor);
    const genericos = await j.base.comoSuperusuario(() => j.base.db.select({ id: proveedor.id }).from(proveedor).where(eq(proveedor.nombre, "Sin puesto (efectivo)")));
    expect(genericos).toHaveLength(1);
  });

  it("destildar algo con la compra anotada pide confirmar y la anula; si la compra tiene otros productos, se explica (RN-186)", async () => {
    const papa = await linea("Papa");
    expect(papa.estado).toBe("COMPRADO");
    expect(await codigoDeError(tildarLinea(j.base.db, j.admin, { itemId: papa.id, tildado: false }))).toBe("VALIDACION");
    expect((await destildarConCompra(j.base.db, j.admin, { itemId: papa.id })).anuladas).toBe(1);
    expect((await linea("Papa")).estado).toBe("PENDIENTE");
    // El tomate se compró en parte junto con lechuga y cebolla: esa compra no se toca desde acá.
    const tomate = await linea("Tomate redondo");
    expect(await codigoDeError(destildarConCompra(j.base.db, j.admin, { itemId: tomate.id }))).toBe("VALIDACION");
  });

  it("corregir el precio de una compra anotada la reemplaza: no se suma (RN-200)", async () => {
    const paraComprar = async (nombre: string) => (await obtenerListaCompra(j.base.db, j.admin, j.manana, { paraComprar: true }))!.plan.flatMap((p) => p.lineas).find((l) => l.producto === nombre)!;
    const vigentes = (productoId: string) => j.base.comoSuperusuario(() => j.base.db.select({ id: compra.id, total: compra.total }).from(compra).innerJoin(compraItem, eq(compraItem.compraId, compra.id)).where(and(eq(compra.estado, "REGISTRADA"), eq(compraItem.productoId, productoId))));
    const papa = await paraComprar("Papa");
    expect(papa.estado).toBe("PENDIENTE");
    const oferta = papa.ofertas[0]!;
    // Los envases que hacen falta para cubrir todo lo pedido.
    const cantidad = String(Math.ceil(Number(papa.pendienteBase) / Number(oferta.factor)));
    // Se anota a cuenta, con un precio mal escrito.
    const primera = await comprarDeLaLista(j.base.db, j.comprador, { itemId: papa.id, ofertaId: oferta.ofertaId, cantidad, precio: "10000", pagado: false, confirmarVariacion: true });
    const anotada = await paraComprar("Papa");
    expect(anotada.estado).toBe("COMPRADO");
    expect(anotada.compras).toMatchObject([{ compraId: primera.compraId, proveedorId: oferta.proveedorId, presentacionId: oferta.presentacionId, aCuenta: true, sola: true }]);
    // Corregir anula la compra anterior: hace falta también ese permiso (quien solo compra no lo tiene).
    expect(await codigoDeError(comprarDeLaLista(j.base.db, j.comprador, { itemId: papa.id, ofertaId: oferta.ofertaId, cantidad, precio: "10500", pagado: false, reemplazaCompraId: primera.compraId }))).toBe("SIN_PERMISO");
    // Un precio que cambia mucho pide confirmar; mientras tanto no se tocó nada: sigue la compra anterior.
    expect(await codigoDeError(comprarDeLaLista(j.base.db, j.admin, { itemId: papa.id, ofertaId: oferta.ofertaId, cantidad, precio: "20000", pagado: true, reemplazaCompraId: primera.compraId }))).toBe("VALIDACION");
    expect((await vigentes(papa.productoId)).map((k) => k.id)).toEqual([primera.compraId]);
    // Confirmado: la nueva reemplaza a la anterior. Sigue habiendo una sola compra y lo comprado no se duplica.
    const clave = "7b0c1f0e-52a7-4c0e-9d3a-0f4b9f1c2a11";
    const corregida = await comprarDeLaLista(j.base.db, j.admin, { itemId: papa.id, ofertaId: oferta.ofertaId, cantidad, precio: "20000", pagado: true, reemplazaCompraId: primera.compraId, confirmarVariacion: true, claveIdempotencia: clave });
    expect(corregida.compraId).not.toBe(primera.compraId);
    const despues = await paraComprar("Papa");
    expect(despues.compras).toMatchObject([{ compraId: corregida.compraId, aCuenta: false }]);
    expect(Number(despues.compras[0]!.precio)).toBe(20000);
    expect(despues.compradoBase).toBe(anotada.compradoBase);
    expect(despues.estado).toBe("COMPRADO");
    expect((await vigentes(papa.productoId)).map((k) => k.id)).toEqual([corregida.compraId]);
    const [vieja] = await j.base.comoSuperusuario(() => j.base.db.select({ estado: compra.estado, motivo: compra.motivoAnulacion }).from(compra).where(eq(compra.id, primera.compraId)));
    expect(vieja).toEqual({ estado: "ANULADA", motivo: "Se corrigió la compra de Papa en la lista de compras" });
    // El mismo toque mandado dos veces no hace nada más.
    const repetida = await comprarDeLaLista(j.base.db, j.admin, { itemId: papa.id, ofertaId: oferta.ofertaId, cantidad, precio: "20000", pagado: true, reemplazaCompraId: primera.compraId, confirmarVariacion: true, claveIdempotencia: clave });
    expect(repetida.compraId).toBe(corregida.compraId);
    expect(await vigentes(papa.productoId)).toHaveLength(1);
    // Anotar otra compra (sin decir que corrige) sí se suma; y la que se anotó de más se quita.
    const deMas = await comprarDeLaLista(j.base.db, j.comprador, { itemId: papa.id, ofertaId: oferta.ofertaId, cantidad: "1", precio: "20000", pagado: true });
    expect((await paraComprar("Papa")).compras).toHaveLength(2);
    expect(await quitarCompraDeLaLista(j.base.db, j.admin, { itemId: papa.id, compraId: deMas.compraId })).toMatchObject({ producto: "Papa" });
    expect((await paraComprar("Papa")).compras.map((k) => k.compraId)).toEqual([corregida.compraId]);
    // Una compra con varios productos no se corrige ni se quita desde un renglón; ni la de otro producto.
    const tomate = await paraComprar("Tomate redondo");
    const conVarios = tomate.compras.find((k) => !k.sola)!;
    expect(await codigoDeError(comprarDeLaLista(j.base.db, j.admin, { itemId: tomate.id, ofertaId: tomate.ofertas[0]!.ofertaId, cantidad: "1", precio: tomate.ofertas[0]!.precio, pagado: true, reemplazaCompraId: conVarios.compraId }))).toBe("VALIDACION");
    expect(await codigoDeError(quitarCompraDeLaLista(j.base.db, j.admin, { itemId: tomate.id, compraId: conVarios.compraId }))).toBe("VALIDACION");
    expect(await codigoDeError(quitarCompraDeLaLista(j.base.db, j.admin, { itemId: tomate.id, compraId: corregida.compraId }))).toBe("NO_ENCONTRADO");
  });
});

describe("el costo de la compra del día (RN-204)", () => {
  it("lo anotado coincide con las compras del día y con lo que ya se les pagó; lo que falta va en efectivo si no tiene puesto", async () => {
    const lista = (await obtenerListaCompra(j.base.db, j.admin, j.manana))!;
    const lineas = lista.plan.flatMap((p) => p.lineas);
    const costo = costoDeLaLista(lineas.map((l) => ({ ...l, compras: l.compras.map((k) => ({ subtotal: k.subtotal!, pagado: k.pagado! })) })));
    const [enLaBase] = await j.base.comoSuperusuario(() =>
      j.base.db
        .select({
          total: sql<string>`coalesce(sum(${compra.total}), 0)`,
          pagado: sql<string>`coalesce(sum((select coalesce(sum(i.monto), 0) from imputacion_pago_proveedor i where i.compra_id = "compra"."id" and i.activa)), 0)`,
        })
        .from(compra)
        .where(and(eq(compra.estado, "REGISTRADA"), eq(compra.jornadaId, lista.jornadaId))),
    );
    expect(dec(enLaBase!.total).gt(0)).toBe(true);
    expect(dec(enLaBase!.pagado).gt(0)).toBe(true);
    // Lo anotado: el total de las compras vigentes, lo ya pagado en efectivo y el resto a crédito, sin perder un peso.
    expect(costo.total.anotado.toFixed(2)).toBe(dec(enLaBase!.total).toFixed(2));
    expect(costo.efectivo.anotado.toFixed(2)).toBe(dec(enLaBase!.pagado).toFixed(2));
    expect(costo.credito.anotado.toFixed(2)).toBe(dec(enLaBase!.total).minus(enLaBase!.pagado).toFixed(2));
    expect(costo.total.total.toFixed(2)).toBe(costo.efectivo.total.plus(costo.credito.total).toFixed(2));
    // Cada compra dice lo que salió su producto y cuánto de eso está pagado.
    const papa = lineas.find((l) => l.producto === "Papa")!;
    expect(papa.compras).toMatchObject([{ aCuenta: false, subtotal: papa.compras[0]!.pagado }]);
    expect(papa.enEfectivo).toBe(false);
    // La banana quedó sin puesto: lo que le falte se paga en efectivo.
    expect(lineas.find((l) => l.producto === "Banana")).toMatchObject({ proveedorId: null, enEfectivo: true });
  });
});

describe("estar ordenado en la compra: circuitos y preselección (RN-201, RN-202)", () => {
  const MERCOFRUT = "5d1e0f3a-8b2c-4d7e-9a61-0c2b4e6f8a10";
  const CORTA = "6e2f1a4b-9c3d-4e8f-8b72-1d3c5f7a9b21";

  it("se arman con su nombre y sus puestos en orden; la lista de compras los trae", async () => {
    const antes = await circuitosDeCompra(j.base.db, j.admin);
    expect(antes.circuitos).toEqual([]);
    expect(antes.puestos.map((p) => p.id)).toEqual(expect.arrayContaining([j.ids.A!, j.ids.B!, j.ids.C!]));
    const guardados = await guardarCircuitos(j.base.db, j.admin, [
      { id: MERCOFRUT, nombre: "  Mercofrut de siempre ", paradas: [j.ids.C!, j.ids.A!, j.ids.C!, "0b9f6c1e-3f5a-4d2b-9c1a-7e8d6f5a4b3c"] },
      { id: CORTA, nombre: "Vuelta corta", paradas: [j.ids.B!] },
    ]);
    // Un puesto repetido cuenta una vez y uno que no existe se saca solo.
    expect(guardados).toEqual([
      { id: MERCOFRUT, nombre: "Mercofrut de siempre", paradas: [j.ids.C!, j.ids.A!] },
      { id: CORTA, nombre: "Vuelta corta", paradas: [j.ids.B!] },
    ]);
    expect((await obtenerListaCompra(j.base.db, j.admin, j.manana))!.circuitos).toEqual(guardados);
    expect((await circuitosDeCompra(j.base.db, j.comprador)).circuitos).toEqual(guardados);
    // Lo que no se puede guardar dice por qué, y lo guardado queda como estaba.
    expect(await codigoDeError(guardarCircuitos(j.base.db, j.admin, [{ id: MERCOFRUT, nombre: "", paradas: [j.ids.A!] }]))).toBe("VALIDACION");
    expect(await codigoDeError(guardarCircuitos(j.base.db, j.admin, [{ id: MERCOFRUT, nombre: "Sin puestos", paradas: [] }]))).toBe("VALIDACION");
    expect((await circuitosDeCompra(j.base.db, j.admin)).circuitos).toEqual(guardados);
    // Guardar la lista sin uno lo quita.
    expect(await guardarCircuitos(j.base.db, j.admin, [guardados[0]!])).toHaveLength(1);
    const registro = await j.base.comoSuperusuario(() => j.base.db.select({ resumen: actividad.resumen }).from(actividad).where(eq(actividad.entidadTipo, "LISTA_COMPRA")));
    expect(registro.some((r) => r.resumen.includes("circuito de compra “Mercofrut de siempre”"))).toBe(true);
  });

  it("acomodar las paradas desde el recorrido guarda el orden en el circuito, o crea uno (RN-203)", async () => {
    // En el circuito elegido: los puestos de hoy pasan adelante, en el orden nuevo; los demás quedan detrás.
    const [mercofrut] = await ordenarParadas(j.base.db, j.admin, { circuitoId: MERCOFRUT, paradas: [j.ids.B!, j.ids.A!] });
    expect(mercofrut).toEqual({ id: MERCOFRUT, nombre: "Mercofrut de siempre", paradas: [j.ids.B!, j.ids.A!, j.ids.C!] });
    // Sin circuito todavía (un id nuevo): se crea "Mi recorrido" con ese orden.
    const NUEVO = "7f3a2b1c-0d9e-4f8a-9b7c-6d5e4f3a2b1c";
    const todos = await ordenarParadas(j.base.db, j.admin, { circuitoId: NUEVO, paradas: [j.ids.C!, j.ids.B!] });
    expect(todos.at(-1)).toEqual({ id: NUEVO, nombre: "Mi recorrido", paradas: [j.ids.C!, j.ids.B!] });
    expect(await codigoDeError(ordenarParadas(j.base.db, j.admin, { circuitoId: "8a4b3c2d-1e0f-4a9b-8c7d-5e4f3a2b1c0d", paradas: [] }))).toBe("VALIDACION");
    await guardarCircuitos(j.base.db, j.admin, [mercofrut!]);
  });

  it("varios productos se mandan juntos a un puesto: toman su precio si ya lo vende", async () => {
    const lineas = (await obtenerListaCompra(j.base.db, j.admin, j.manana))!.plan.flatMap((p) => p.lineas);
    const tres = lineas.slice(0, 3);
    expect(tres).toHaveLength(3);
    expect(await elegirPuestoDeLineas(j.base.db, j.admin, { itemIds: tres.map((l) => l.id), proveedorId: j.ids.C! })).toBe(3);
    const despues = (await obtenerListaCompra(j.base.db, j.admin, j.manana, { paraComprar: true }))!.plan.flatMap((p) => p.lineas).filter((l) => tres.some((t) => t.id === l.id));
    expect(despues.map((l) => l.proveedorId)).toEqual([j.ids.C, j.ids.C, j.ids.C]);
    expect(despues.every((l) => l.asignacionManual)).toBe(true);
    for (const l of despues) {
      // Con precio en ese puesto, queda calculado lo que sale; si todavía no lo vende, sin precio.
      const suya = l.ofertas.find((o) => o.proveedorId === j.ids.C);
      expect(l.precioSugerido === null).toBe(!suya);
      if (suya) expect(Number(l.precioSugerido)).toBe(Number(suya.precio));
    }
    // Queda a mano: al rearmar la lista se respeta. Y sin puesto, para todos juntos.
    await generarListaCompra(j.base.db, j.comprador, j.manana);
    expect((await linea(tres[0]!.producto)).proveedorId).toBe(j.ids.C);
    await elegirPuestoDeLineas(j.base.db, j.admin, { itemIds: tres.map((l) => l.id), proveedorId: null });
    expect((await linea(tres[1]!.producto)).proveedorId).toBeNull();
    // Nada elegido, o un puesto que no existe: se avisa.
    expect(await codigoDeError(elegirPuestoDeLineas(j.base.db, j.admin, { itemIds: [], proveedorId: j.ids.C! }))).toBe("VALIDACION");
    expect(await codigoDeError(elegirPuestoDeLineas(j.base.db, j.admin, { itemIds: [tres[0]!.id], proveedorId: "0b9f6c1e-3f5a-4d2b-9c1a-7e8d6f5a4b3c" }))).toBe("NO_ENCONTRADO");
    const avisos = await j.base.comoSuperusuario(() => j.base.db.select({ resumen: actividad.resumen }).from(actividad).where(eq(actividad.entidadTipo, "LISTA_COMPRA")));
    expect(avisos.some((r) => r.resumen.startsWith("eligió comprar 3 productos en "))).toBe(true);
  });
});

describe("pedidos en proceso", () => {
  it("a un producto sin precio se le pone sobre la marcha (RN-188)", async () => {
    const productoId = await crearProducto(j.base.db, j.admin, { codigo: "JENG", nombre: "Jengibre", categoriaId: j.ids.verduras!, unidadBase: "KG", admiteFraccion: true, presentacionCompraNombre: "", presentacionCompraFactor: "" });
    const { pedidoId } = await crearPedido(j.base.db, j.admin, { fecha: j.manana, clienteId: j.ids.hospital! });
    await agregarLinea(j.base.db, j.admin, { pedidoId, productoId, cantidad: "2" });
    await confirmarPedido(j.base.db, j.admin, pedidoId);
    const antes = (await obtenerPedido(j.base.db, j.admin, pedidoId)).lineas[0]!;
    expect(antes.precio?.precio).toBeNull();
    expect(await codigoDeError(ponerPrecioALinea(j.base.db, j.admin, { itemId: antes.id, precio: "0" }))).toBe("VALIDACION");
    await ponerPrecioALinea(j.base.db, j.admin, { itemId: antes.id, precio: "3500" });
    const despues = (await obtenerPedido(j.base.db, j.admin, pedidoId)).lineas[0]!;
    expect(Number(despues.precio?.precio)).toBe(3500);
    expect(despues.precio?.manual).toBe(true);
  });

  it("un pedido que ya se está preparando se elimina con lo que se hizo, y se recupera (RN-189)", async () => {
    await iniciarPreparacion(j.base.db, j.admin, j.manana, { pedidoIds: [j.ids.pedRestaurante!] });
    const armadas = await j.base.comoSuperusuario(() => j.base.db.select({ estado: entrega.estado }).from(entrega).where(eq(entrega.clienteId, j.ids.restaurante!)));
    expect(armadas.some((e) => e.estado !== "ANULADA")).toBe(true);
    await eliminarPedido(j.base.db, j.admin, { pedidoId: j.ids.pedRestaurante! });
    expect((await obtenerPedido(j.base.db, j.admin, j.ids.pedRestaurante!)).estado).toBe("CANCELADO");
    const entregas = await j.base.comoSuperusuario(() => j.base.db.select({ estado: entrega.estado }).from(entrega).where(eq(entrega.clienteId, j.ids.restaurante!)));
    expect(entregas.every((e) => e.estado === "ANULADA")).toBe(true);
    const registro = await j.base.comoSuperusuario(() => j.base.db.select({ accion: actividad.accion }).from(actividad).where(eq(actividad.entidadId, j.ids.pedRestaurante!)));
    expect(registro.map((r) => r.accion)).toContain("ELIMINAR");
    await recuperarPedido(j.base.db, j.admin, { pedidoId: j.ids.pedRestaurante! });
    expect((await obtenerPedido(j.base.db, j.admin, j.ids.pedRestaurante!)).estado).toBe("CONFIRMADO");
  });
});

describe("quién se encarga de cada paso (RN-190)", () => {
  it("se elige una persona por etapa y le llega el aviso cuando le toca", async () => {
    const maria = await crearUsuarioDePrueba(j.base.db, j.empresaId, "María Compras", ["ADMIN"]);
    const [m] = await j.base.comoSuperusuario(() => j.base.db.select({ id: usuario.id }).from(usuario).where(eq(usuario.authUserId, maria)));
    await guardarResponsables(j.base.db, j.admin, { en_lista: m!.id, preparando: null });
    expect((await responsablesDelNegocio(j.base.db, j.admin)).responsables).toEqual({ en_lista: m!.id });
    await generarListaCompra(j.base.db, j.admin, j.manana);
    const bandeja = await avisosPara(j.base.db, maria, 40);
    expect(bandeja.avisos.some((a) => a.paraMi && a.resumen.includes("lista de compras"))).toBe(true);
    expect(await codigoDeError(guardarResponsables(j.base.db, j.admin, { pedidos: "0b9f6c1e-3f5a-4d2b-9c1a-7e8d6f5a4b3c" }))).toBe("VALIDACION");
  });
});

describe("sugerencias de lugares mientras se escribe (sin salir a internet)", () => {
  it("primero en Tucumán y, si ahí no aparece nada, en todo el país", async () => {
    const pedidas: string[] = [];
    const photon = async (url: string) => {
      pedidas.push(url);
      const enTucuman = new URL(url).searchParams.has("bbox");
      const lugar = { geometry: { coordinates: enTucuman ? [-65.2141, -26.8236] : [-58.38, -34.6] }, properties: { street: "Avenida Mitre", housenumber: "450", city: enTucuman ? "San Miguel de Tucumán" : "Buenos Aires", countrycode: "AR" } };
      return new Response(JSON.stringify({ features: url.includes("Mitre") || !enTucuman ? [lugar] : [] }));
    };
    expect((await sugerirLugares("Mitre 450", photon))[0]?.detalle).toBe("San Miguel de Tucumán");
    expect(new URL(pedidas[0]!).searchParams.get("bbox")).toBe("-66.25,-28.05,-64.45,-26.05");
    expect((await sugerirLugares("Corrientes 1234", photon))[0]?.detalle).toBe("Buenos Aires");
    expect(pedidas).toHaveLength(3);
    expect(await sugerirLugares("ab", photon)).toEqual([]);
    expect(await codigoDeError(sugerirLugares("Mitre 450", async () => new Response("", { status: 503 })))).toBe("VALIDACION");
    expect(await codigoDeError(sugerirLugares("Mitre 450", async () => Promise.reject(new Error("sin red"))))).toBe("VALIDACION");
  });

  it("si el lugar no figura en el mapa, ofrece la zona donde queda para marcarlo a mano", async () => {
    const pedidas: string[] = [];
    // Un mapa donde no está el country, pero sí la ciudad (y una estación con el mismo nombre, que no sirve de zona).
    const photon = async (url: string) => {
      const q = new URL(url).searchParams.get("q")!;
      pedidas.push(q);
      const features =
        q === "tafi viejo"
          ? [
              { geometry: { coordinates: [-65.26, -26.73] }, properties: { name: "Tafi Viejo", street: "Alsina", city: "Tafí Viejo", state: "Tucumán", osm_key: "railway" } },
              { geometry: { coordinates: [-65.2592, -26.7343] }, properties: { name: "Tafí Viejo", county: "Departamento Tafí Viejo", state: "Tucumán", osm_key: "place" } },
            ]
          : [];
      return new Response(JSON.stringify({ features }));
    };
    expect(await sugerirLugares("country pinar II, tafi viejo", photon)).toEqual([
      { etiqueta: "Tafí Viejo", detalle: "Departamento Tafí Viejo, Tucumán", coordenada: { lat: -26.7343, lng: -65.2592 }, aproximado: { falta: "country pinar II" } },
    ]);
    // Primero lo escrito tal cual (en Tucumán y en el país) y recién después la zona.
    expect(pedidas).toEqual(["country pinar II, tafi viejo", "country pinar II, tafi viejo", "tafi viejo"]);
    // Si tampoco aparece la zona, no hay nada para ofrecer.
    expect(await sugerirLugares("quinta los nogales, paraje perdido", photon)).toEqual([]);
  });
});

describe("las direcciones como se dicen: la esquina y la calle con su número (sin salir a internet)", () => {
  /** Un tramo de calle como lo devuelve Photon: el punto va [lat, lng] y la caja [oeste, norte, este, sur]. */
  const calle = (nombre: string, punto: [number, number], caja: [number, number, number, number], barrio?: string) => ({
    geometry: { coordinates: [punto[1], punto[0]] },
    properties: { name: nombre, osm_key: "highway", extent: caja, district: barrio, city: "San Miguel de Tucumán", state: "Tucumán", countrycode: "AR" },
  });
  const local = (nombre: string | undefined, enCalle: string, numero: string, punto: [number, number], ciudad = "San Miguel de Tucumán") => ({
    geometry: { coordinates: [punto[1], punto[0]] },
    properties: { name: nombre, street: enCalle, housenumber: numero, osm_key: nombre ? "shop" : "place", city: ciudad, state: ciudad === "San Miguel de Tucumán" ? "Tucumán" : "Jujuy", countrycode: "AR" },
  });
  const responder = (features: unknown[]) => new Response(JSON.stringify({ features }));
  const PROVINCIA = "-66.25,-28.05,-64.45,-26.05";

  it("una esquina se calcula con los tramos de las dos calles y va arriba de todo, en tres consultas al mapa", async () => {
    const pedidas: { q: string; soloCalles: boolean }[] = [];
    const photon = async (url: string) => {
      const p = new URL(url).searchParams;
      const q = p.get("q")!;
      pedidas.push({ q, soloCalles: p.get("layer") === "street" && p.get("dedupe") === "0" });
      if (p.get("layer") !== "street") return responder([local("Tienda San Juan", "Muñecas", "354", [-26.82593, -65.20555]), local("Panadería San Juan", "Muñecas", "10", [-24.25, -65.2], "Palpalá")]);
      if (q === "muñecas")
        return responder([
          calle("Ildefonso de las Muñecas", [-26.82599, -65.20495], [-65.20515, -26.8253, -65.20476, -26.82668], "Centro"),
          calle("Peatonal Muñecas", [-26.82804, -65.20552], [-65.20591, -26.82668, -65.20515, -26.8294], "Centro"),
        ]);
      return responder([calle("San Juan", [-26.82563, -65.20336], [-65.20476, -26.8253, -65.20196, -26.82593], "Centro"), calle("San Juan", [-26.82476, -65.20715], [-65.20953, -26.8242, -65.20476, -26.8253], "Centro")]);
    };
    expect(await sugerirLugares("  muñecas  y san juan ", photon)).toEqual([
      { etiqueta: "Ildefonso de las Muñecas y San Juan", detalle: "Centro, San Miguel de Tucumán", coordenada: { lat: -26.8253, lng: -65.20476 }, nota: "esquina" },
      // Debajo, lo que coincide de la zona (lo de otra provincia no).
      { etiqueta: "Tienda San Juan", detalle: "Muñecas 354, San Miguel de Tucumán, Tucumán", coordenada: { lat: -26.82593, lng: -65.20555 } },
    ]);
    expect(pedidas).toHaveLength(3);
    expect(pedidas.filter((p) => p.soloCalles).map((p) => p.q).sort()).toEqual(["muñecas", "san juan"]);
  });

  it("si las calles no se cruzan, o el mapa no las devuelve, quedan las sugerencias de siempre", async () => {
    const comun = local("Frutas y Verduras Don José", "Lavalle", "500", [-26.83, -65.21]);
    // Dos calles paralelas.
    const paralelas = async (url: string) => {
      const p = new URL(url).searchParams;
      if (p.get("layer") !== "street") return responder([comun]);
      return responder([p.get("q") === "frutas" ? calle("Frutas", [-26.83, -65.205], [-65.21, -26.82995, -65.2, -26.83005]) : calle("Verduras Don José", [-26.84, -65.205], [-65.21, -26.83995, -65.2, -26.84005])]);
    };
    expect((await sugerirLugares("frutas y verduras don josé", paralelas)).map((l) => l.etiqueta)).toEqual(["Frutas y Verduras Don José"]);
    // El mapa falla solo al pedir las calles: no se pierde lo demás.
    const sinCalles = async (url: string) => (new URL(url).searchParams.get("layer") === "street" ? new Response("", { status: 503 }) : responder([comun]));
    expect((await sugerirLugares("frutas y verduras don josé", sinCalles)).map((l) => l.etiqueta)).toEqual(["Frutas y Verduras Don José"]);
    // Si falla todo, se avisa como siempre.
    expect(await codigoDeError(sugerirLugares("muñecas y san juan", async () => new Response("", { status: 503 })))).toBe("VALIDACION");
  });

  it("una calle con muchos tramos se vuelve a pedir solo alrededor de la otra", async () => {
    const cajas: string[] = [];
    const photon = async (url: string) => {
      const p = new URL(url).searchParams;
      const q = p.get("q")!;
      if (p.get("layer") !== "street") return responder([]);
      if (q === "catamarca") return responder([calle("Catamarca", [-26.815, -65.2094], [-65.20945, -26.81, -65.20935, -26.82])]);
      cajas.push(p.get("bbox")!);
      // En toda la provincia: cincuenta tramos de otras localidades, que llenan la consulta.
      if (p.get("bbox") === PROVINCIA) return responder(Array.from({ length: 50 }, (_, i) => calle("Sarmiento", [-27 - i * 0.01, -65.3], [-65.31, -27 - i * 0.01 + 0.00005, -65.29, -27 - i * 0.01 - 0.00005])));
      return responder([calle("Avenida Sarmiento", [-26.8172, -65.209], [-65.215, -26.81715, -65.2, -26.81725], "Barrio Norte")]);
    };
    const [esquina] = await sugerirLugares("sarmiento y catamarca", photon);
    expect(esquina).toMatchObject({ etiqueta: "Avenida Sarmiento y Catamarca", detalle: "Barrio Norte, San Miguel de Tucumán", nota: "esquina" });
    expect(esquina!.coordenada.lat).toBeCloseTo(-26.8172, 4);
    expect(esquina!.coordenada.lng).toBeCloseTo(-65.2094, 4);
    // La segunda vez, en una caja chica alrededor de Catamarca.
    expect(cajas).toHaveLength(2);
    expect(cajas[0]).toBe(PROVINCIA);
    const [oeste, sur, este, norte] = cajas[1]!.split(",").map(Number);
    expect(este! - oeste!).toBeLessThan(0.01);
    expect(norte! - sur!).toBeLessThan(0.02);
  });

  it("la calle con su número se pregunta también con su otro nombre; si el número no está, se ofrece la calle para marcarlo", async () => {
    const pedidas: string[] = [];
    const photon = async (url: string) => {
      const q = new URL(url).searchParams.get("q")!;
      pedidas.push(q);
      if (q === "24 de septiembre 500") return responder([{ geometry: { coordinates: [-65.14094, -26.81571] }, properties: { name: "24 de Septiembre", osm_key: "highway", city: "Alderetes", state: "Tucumán", countrycode: "AR" } }]);
      if (q === "24 de setiembre 500") return responder([local(undefined, "24 de Setiembre de 1812", "500", [-26.83109, -65.20453])]);
      if (q === "General paz 9000") return responder([calle("General Paz", [-26.834, -65.215], [-65.23, -26.8339, -65.2, -26.8341], "Ciudadela"), local("Kiosco", "General Paz", "1200", [-26.83429, -65.21671])]);
      return responder([]);
    };
    // "septiembre" y "setiembre": la dirección exacta va primero, aunque haya venido en la segunda respuesta.
    expect((await sugerirLugares("24 de septiembre 500", photon)).map((l) => l.etiqueta)).toEqual(["24 de Setiembre de 1812 500", "24 de Septiembre"]);
    expect(pedidas).toEqual(["24 de septiembre 500", "24 de setiembre 500"]);
    // "gral" va completo; el 9000 no existe: la calle con ese número, como lugar aproximado.
    pedidas.length = 0;
    expect(await sugerirLugares("gral paz 9000", photon)).toEqual([
      { etiqueta: "General Paz 9000", detalle: "Ciudadela, San Miguel de Tucumán", coordenada: { lat: -26.83429, lng: -65.21671 }, aproximado: { falta: "el número 9000" } },
      { etiqueta: "Kiosco", detalle: "General Paz 1200, San Miguel de Tucumán, Tucumán", coordenada: { lat: -26.83429, lng: -65.21671 } },
    ]);
    expect(pedidas).toEqual(["General paz 9000"]);
  });
});
