import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { actividad, compra, entrega, proveedor, usuario } from "@/db/esquema";
import { crearProducto } from "@/modulos/catalogo/productos";
import { avisosPara } from "@/modulos/colaboracion/avisos";
import { comprarDeLaLista, destildarConCompra } from "@/modulos/compras/compra-desde-lista";
import { elegirPuestoDeLinea, generarListaCompra, obtenerListaCompra, tildarLinea } from "@/modulos/compras/lista-compra";
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
});
