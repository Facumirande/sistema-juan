import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { usuario } from "@/db/esquema";
import { sumarDias } from "@/dominio/fechas/fechas";
import { listarActividad } from "@/modulos/colaboracion/actividad";
import { bandejaDeNotas, borrarNota, contarNotasSinLeer, escribirNota, marcarNotasLeidas, notasDe } from "@/modulos/colaboracion/notas";
import { cambiarMiPerfil } from "@/modulos/colaboracion/personas";
import { generarListaCompra, obtenerListaCompra, sacarPedidoDeLista } from "@/modulos/compras/lista-compra";
import { registrarCompra } from "@/modulos/compras/compras";
import { iniciarPreparacion, obtenerEntregaParaPreparar, obtenerPreparacion, registrarPreparado } from "@/modulos/entregas/preparacion";
import { armarRepartoConOrden, fijarOrdenDeReparto, obtenerReparto } from "@/modulos/entregas/repartos";
import { buscarDireccion, resolverEnlaceDeMapa, ubicarPuntoDeEntrega, ubicarSalida, viajeDelDia } from "@/modulos/entregas/viaje";
import { diaDeTrabajo } from "@/modulos/jornadas/dia";
import { agregarLinea, asignarResponsable, cambiarPlazo, cambiarPrioridad, confirmarPedido, crearPedido, obtenerPedido } from "@/modulos/pedidos/pedidos";
import { avanceDeTarjeta, tableroDePedidos } from "@/modulos/pedidos/tablero";
import { obtenerCliente } from "@/modulos/clientes/clientes";

import { codigoDeError, crearUsuarioDePrueba } from "./base-de-prueba";
import { prepararJornada2409, type Jornada2409 } from "./escenario-24-09";

// Tablero de pedidos estilo Trello, notas entre las personas, actividad, prioridad con faltantes,
// perfiles y el recorrido del reparto (uso interno, 28/09/2026).

let j: Jornada2409;
let maria: string;
let dia: string;
const pedidos: Record<string, string> = {};

const idDeUsuario = async (authUserId: string) =>
  (await j.base.comoSuperusuario(() => j.base.db.select({ id: usuario.id }).from(usuario).where(eq(usuario.authUserId, authUserId))))[0]!.id;

beforeAll(async () => {
  j = await prepararJornada2409();
  maria = await crearUsuarioDePrueba(j.base.db, j.empresaId, "María Pérez", ["ADMIN"]);
  // Otro día, con pedidos nuevos: el hospital y la verdulería confirmados, el restaurante en borrador.
  dia = sumarDias(j.manana, 1);
  const pedidoDe = async (clave: string, clienteId: string, lineas: [string, string][], confirmar: boolean, quien = j.admin) => {
    const { pedidoId } = await crearPedido(j.base.db, quien, { fecha: dia, clienteId });
    for (const [prod, cantidad] of lineas) await agregarLinea(j.base.db, quien, { pedidoId, productoId: j.ids[prod]!, cantidad });
    if (confirmar) await confirmarPedido(j.base.db, quien, pedidoId);
    pedidos[clave] = pedidoId;
  };
  await pedidoDe("hospital", j.ids.hospital!, [["tomate", "30"], ["papa", "50"]], true);
  await pedidoDe("verduleria", j.ids.verduleria!, [["tomate", "30"]], true, maria);
  await pedidoDe("restaurante", j.ids.restaurante!, [["cebolla", "10"]], false);
});

describe("lista de compra con los pedidos elegidos en el tablero", () => {
  it("solo entran los elegidos; los demás confirmados quedan afuera, sin marcar la lista como desactualizada", async () => {
    const r = await generarListaCompra(j.base.db, j.comprador, dia, { pedidoIds: [pedidos.hospital!] });
    expect([r.agregados, r.fueraDeLista]).toEqual([1, 1]);
    const lista = await obtenerListaCompra(j.base.db, j.admin, dia);
    const lineas = lista!.plan.flatMap((p) => p.lineas).map((l) => [l.producto, l.necesidadBase]);
    expect(lineas).toEqual(expect.arrayContaining([["Tomate redondo", "30.000"], ["Papa", "50.000"]]));
    expect(lista!.desactualizada).toBe(false);
    expect((await obtenerPedido(j.base.db, j.admin, pedidos.verduleria!)).estado).toBe("CONFIRMADO");
    const hoy = await diaDeTrabajo(j.base.db, j.admin, dia);
    expect(hoy.panel.lista.fueraDeLista).toBe(1);
    expect(hoy.pasos.pasos.find((p) => p.clave === "lista")?.estado).toBe("en_curso");
  });

  it("un borrador o un pedido de otro día no se pueden elegir", async () => {
    expect(await codigoDeError(generarListaCompra(j.base.db, j.comprador, dia, { pedidoIds: [pedidos.restaurante!] }))).toBe("VALIDACION");
    expect(await codigoDeError(generarListaCompra(j.base.db, j.comprador, dia, { pedidoIds: [j.ids.pedHospital!] }))).toBe("VALIDACION");
  });

  it("se agrega otro después, y se puede sacar uno de la lista (el último no)", async () => {
    const r = await generarListaCompra(j.base.db, j.comprador, dia, { pedidoIds: [pedidos.verduleria!] });
    expect([r.agregados, r.fueraDeLista]).toEqual([1, 0]);
    const tomate = async () => (await obtenerListaCompra(j.base.db, j.admin, dia))!.plan.flatMap((p) => p.lineas).find((l) => l.producto === "Tomate redondo")!.necesidadBase;
    expect(await tomate()).toBe("60.000");
    await sacarPedidoDeLista(j.base.db, j.comprador, pedidos.verduleria!);
    expect(await tomate()).toBe("30.000");
    expect((await obtenerPedido(j.base.db, j.admin, pedidos.verduleria!)).estado).toBe("CONFIRMADO");
    expect(await codigoDeError(sacarPedidoDeLista(j.base.db, j.comprador, pedidos.hospital!))).toBe("VALIDACION");
    await generarListaCompra(j.base.db, j.comprador, dia, { pedidoIds: [pedidos.verduleria!] });
  });
});

describe("el tablero", () => {
  it("cada pedido en su columna, con su avance de compra", async () => {
    const t = await tableroDePedidos(j.base.db, j.admin, dia);
    const columna = (clave: string) => t.columnas.find((c) => c.clave === clave)!.tarjetas.map((x) => x.cliente);
    expect(columna("pedidos")).toEqual(["Restaurante La Esquina"]);
    expect(columna("en_lista").sort()).toEqual(["Hospital San Martín", "Verdulería Don Pepe"]);
    const hospital = t.columnas.find((c) => c.clave === "en_lista")!.tarjetas.find((x) => x.cliente === "Hospital San Martín")!;
    expect(hospital.avance).toEqual({ que: "comprado", hechos: 0, total: 2 });
    expect(hospital.productos).toMatchObject([
      { nombre: "Tomate redondo", cantidad: "30 kg", grupo: "VERDURA", hecha: false, aviso: null, compra: "PENDIENTE", tildado: false },
      { nombre: "Papa", cantidad: "50 kg", grupo: "VERDURA", hecha: false, aviso: null, compra: "PENDIENTE", tildado: false },
    ]);
    // Cada producto trae su renglón de la lista de compras, para tildarlo desde la tarjeta.
    expect(hospital.productos.every((p) => typeof p.listaItemId === "string")).toBe(true);
  });

  it("prioridad, plazo y quién se encarga; la prioridad alta va primero", async () => {
    expect(await cambiarPrioridad(j.base.db, j.admin, { pedidoIds: [pedidos.verduleria!], prioridad: "ALTA" })).toBe(1);
    await cambiarPlazo(j.base.db, j.admin, { pedidoId: pedidos.hospital!, entregaDesde: "07:00", entregaHasta: "09:00" });
    expect(await codigoDeError(cambiarPlazo(j.base.db, j.admin, { pedidoId: pedidos.hospital!, entregaDesde: "10:00", entregaHasta: "09:00" }))).toBe("VALIDACION");
    await asignarResponsable(j.base.db, j.admin, { pedidoIds: [pedidos.hospital!], usuarioId: await idDeUsuario(maria) });
    const t = await tableroDePedidos(j.base.db, j.admin, dia);
    const enLista = t.columnas.find((c) => c.clave === "en_lista")!.tarjetas;
    expect(enLista.map((x) => x.cliente)).toEqual(["Verdulería Don Pepe", "Hospital San Martín"]);
    expect(enLista[1]).toMatchObject({ plazo: "entre 07:00 y 09:00", responsable: { nombre: "María Pérez" } });
    const avance = await avanceDeTarjeta(j.base.db, j.admin, pedidos.hospital!);
    expect([avance.que, avance.lineas.map((l) => l.producto), avance.responsable?.nombre]).toEqual(["comprado", ["Tomate redondo", "Papa"], "María Pérez"]);
  });

  it("con faltantes, el pedido de prioridad alta se abastece primero", async () => {
    // Se compran solo 2 cajones de tomate (36 kg) para 60 kg pedidos: el hospital tiene más
    // prioridad como cliente, pero la verdulería marcó su pedido como urgente.
    await registrarCompra(j.base.db, j.comprador, {
      fecha: dia,
      proveedorId: j.ids.C!,
      condicion: "CONTADO",
      items: [
        { productoId: j.ids.tomate!, presentacionId: j.presentaciones["tomate:Cajón 18 kg"]!, cantidad: "2", precio: "16.200" },
        { productoId: j.ids.papa!, presentacionId: j.presentaciones["papa:Bolsa 25 kg"]!, cantidad: "2", precio: "12.500" },
      ],
    });
    await iniciarPreparacion(j.base.db, j.admin, dia);
    const entregas = (await obtenerPreparacion(j.base.db, j.admin, dia)).entregas;
    const tomateDe = async (cliente: string) =>
      (await obtenerEntregaParaPreparar(j.base.db, j.admin, entregas.find((e) => e.cliente === cliente)!.id)).lineas.find((l) => l.producto === "Tomate redondo")!.propuesta;
    expect(await tomateDe("Verdulería Don Pepe")).toBe("30.000");
    expect(await tomateDe("Hospital San Martín")).toBe("6.000");
    // Al preparar, cada cliente ve qué separar y lo que no alcanzó, en el tablero y en preparación.
    const hospital = entregas.find((e) => e.cliente === "Hospital San Martín")!;
    expect(hospital.detalle[0]).toMatchObject({ producto: "Tomate redondo", cantidad: "30 kg", hecha: false, aviso: "Alcanza para 6 kg de 30 kg", reemplazo: false });
    const tarjeta = (await tableroDePedidos(j.base.db, j.admin, dia)).columnas.flatMap((c) => c.tarjetas).find((x) => x.cliente === "Hospital San Martín")!;
    expect(tarjeta.productos[0]).toMatchObject({ nombre: "Tomate redondo", hecha: false, aviso: "Alcanza para 6 kg de 30 kg" });
    const tomate = (await obtenerEntregaParaPreparar(j.base.db, j.admin, hospital.id)).lineas.find((l) => l.producto === "Tomate redondo")!;
    await registrarPreparado(j.base.db, j.admin, { itemId: tomate.id, cantidad: "6", motivo: "NO_CONSEGUIDO", confirmar: false });
    const despues = await avanceDeTarjeta(j.base.db, j.admin, pedidos.hospital!);
    expect(despues.lineas[0]).toMatchObject({ hecha: true, aviso: "Va 6 kg de 30 kg · no se consiguió" });
    expect(despues.entregaId).toBe(hospital.id);
  });
});

describe("notas entre las personas", () => {
  let nota: string;

  it("María le deja una nota al administrador en una tarjeta: le aparece sin leer", async () => {
    const admin = await idDeUsuario(j.admin);
    nota = await escribirNota(j.base.db, maria, { entidadTipo: "PEDIDO", entidadId: pedidos.hospital!, texto: "Pidieron que llegue antes de las 8", paraUsuarioId: admin });
    expect(await contarNotasSinLeer(j.base.db, j.admin)).toBe(1);
    expect(await contarNotasSinLeer(j.base.db, maria)).toBe(0);
    const bandeja = await bandejaDeNotas(j.base.db, j.admin);
    expect(bandeja.sinLeer[0]).toMatchObject({ texto: "Pidieron que llegue antes de las 8", autor: { nombre: "María Pérez" }, entidad: { tipo: "PEDIDO", fecha: dia } });
    expect(bandeja.sinLeer[0]!.entidad.etiqueta).toMatch(/^PED-\d+ · Hospital San Martín$/);
    const t = await tableroDePedidos(j.base.db, j.admin, dia);
    expect(t.columnas.flatMap((c) => c.tarjetas).find((x) => x.id === pedidos.hospital)!.notas).toEqual({ total: 1, sinLeer: 1 });
  });

  it("al abrir la tarjeta queda leída, y la autora ve quién la leyó", async () => {
    const antes = await notasDe(j.base.db, j.admin, { tipo: "PEDIDO", id: pedidos.hospital! });
    expect(antes.notas[0]).toMatchObject({ leida: false, mia: false, para: { nombre: expect.stringMatching(/^Admin/) } });
    expect(await marcarNotasLeidas(j.base.db, j.admin, { tipo: "PEDIDO", id: pedidos.hospital! })).toBe(1);
    expect(await contarNotasSinLeer(j.base.db, j.admin)).toBe(0);
    const vista = await notasDe(j.base.db, maria, { tipo: "PEDIDO", id: pedidos.hospital! });
    expect(vista.notas[0]).toMatchObject({ mia: true, leida: true, leidaPor: [{ nombre: expect.stringMatching(/^Admin/) }] });
  });

  it("solo la borra quien la escribió, y quien no ve pedidos no puede escribirles", async () => {
    expect(await codigoDeError(borrarNota(j.base.db, j.admin, nota))).toBe("SIN_PERMISO");
    expect(await codigoDeError(escribirNota(j.base.db, j.comprador, { entidadTipo: "PEDIDO", entidadId: pedidos.hospital!, texto: "hola" }))).toBe("SIN_PERMISO");
    await borrarNota(j.base.db, maria, nota);
    expect((await notasDe(j.base.db, j.admin, { tipo: "PEDIDO", id: pedidos.hospital! })).notas).toEqual([]);
  });
});

describe("la actividad de cada uno", () => {
  it("quién hizo qué, con filtro por persona y un resumen por persona", async () => {
    const todo = await listarActividad(j.base.db, j.admin);
    const frases = todo.entradas.map((e) => `${e.persona.nombre} ${e.resumen}`);
    expect(frases.some((f) => /^María Pérez cargó el pedido PED-\d+ de Verdulería Don Pepe/.test(f))).toBe(true);
    expect(frases.some((f) => /^Pedro armó la lista de compra/.test(f))).toBe(true);
    expect(frases.some((f) => /sacó el pedido PED-\d+ de la lista de compra/.test(f))).toBe(true);
    const deMaria = await listarActividad(j.base.db, j.admin, { usuarioId: await idDeUsuario(maria) });
    expect(deMaria.entradas.every((e) => e.persona.nombre === "María Pérez")).toBe(true);
    expect(todo.personas.find((p) => p.persona.nombre === "María Pérez")!.hoy).toBeGreaterThan(0);
    const delPedido = await listarActividad(j.base.db, j.admin, { entidad: { tipo: "PEDIDO", id: pedidos.hospital! } });
    expect(delPedido.entradas.map((e) => e.accion)).toEqual(expect.arrayContaining(["CREAR", "CONFIRMAR", "PLAZO", "ASIGNAR"]));
  });

  it("el perfil: nombre y color del avatar", async () => {
    await cambiarMiPerfil(j.base.db, maria, { nombre: "Mari", color: "#B0306A" });
    const { personas } = await tableroDePedidos(j.base.db, j.admin, dia);
    expect(personas.find((p) => p.nombre === "Mari")?.color).toBe("#b0306a");
    expect(await codigoDeError(cambiarMiPerfil(j.base.db, maria, { nombre: "Mari", color: "#123456" }))).toBe("VALIDACION");
  });
});

describe("el viaje de entrega", () => {
  it("se marca dónde queda cada lugar y de dónde se sale; el viaje del día trae las paradas con su ubicación", async () => {
    const puntoDe = async (clienteId: string) => (await obtenerCliente(j.base.db, j.admin, clienteId)).puntosEntrega[0]!.id;
    await ubicarPuntoDeEntrega(j.base.db, j.admin, { puntoId: await puntoDe(j.ids.hospital!), coordenada: { lat: -34.6037, lng: -58.3816 } });
    await ubicarPuntoDeEntrega(j.base.db, j.admin, { puntoId: await puntoDe(j.ids.verduleria!), coordenada: { lat: -34.62, lng: -58.4 } });
    await ubicarSalida(j.base.db, j.admin, { coordenada: { lat: -34.66, lng: -58.5 }, direccion: "Mercado Central" });
    expect(await codigoDeError(ubicarPuntoDeEntrega(j.base.db, j.admin, { puntoId: await puntoDe(j.ids.hospital!), coordenada: { lat: 95, lng: 0 } }))).not.toBe("");
    const viaje = await viajeDelDia(j.base.db, j.admin, dia);
    expect(viaje.salida).toEqual({ coordenada: { lat: -34.66, lng: -58.5 }, direccion: "Mercado Central" });
    expect(viaje.paradas.map((p) => [p.cliente, p.coordenada !== null])).toEqual([
      ["Hospital San Martín", true],
      ["Verdulería Don Pepe", true],
    ]);
  });

  it("se arma el reparto con el orden del recorrido y se puede reordenar", async () => {
    const viaje = await viajeDelDia(j.base.db, j.admin, dia);
    const [a, b] = viaje.paradas.map((p) => p.entregaId);
    const repartoId = await armarRepartoConOrden(j.base.db, j.admin, { fecha: dia, entregaIds: [b!, a!] });
    expect((await obtenerReparto(j.base.db, j.admin, repartoId)).paradas.map((p) => p.id)).toEqual([b, a]);
    await fijarOrdenDeReparto(j.base.db, j.admin, { repartoId, orden: [a!, b!] });
    expect((await obtenerReparto(j.base.db, j.admin, repartoId)).paradas.map((p) => p.id)).toEqual([a, b]);
    expect(await codigoDeError(fijarOrdenDeReparto(j.base.db, j.admin, { repartoId, orden: [a!] }))).toBe("VALIDACION");
    expect(await codigoDeError(armarRepartoConOrden(j.base.db, j.admin, { fecha: dia, entregaIds: [a!] }))).toBe("VALIDACION");
  });

  it("buscar una dirección en el mapa y seguir un enlace corto de Google Maps (sin salir a internet)", async () => {
    const mapa = async (url: string) => {
      expect(url).toContain("nominatim.openstreetmap.org");
      return new Response(JSON.stringify([{ display_name: "Av. Corrientes 1234, CABA", lat: "-34.6037", lon: "-58.3816" }, { display_name: "sin lugar" }]));
    };
    expect(await buscarDireccion("Corrientes 1234, CABA", mapa)).toEqual([{ etiqueta: "Av. Corrientes 1234, CABA", coordenada: { lat: -34.6037, lng: -58.3816 } }]);
    expect(await codigoDeError(buscarDireccion("ab", mapa))).toBe("VALIDACION");
    expect(await codigoDeError(buscarDireccion("Corrientes 1234", async () => new Response("", { status: 503 })))).toBe("VALIDACION");
    expect(await codigoDeError(buscarDireccion("Corrientes 1234", async () => Promise.reject(new Error("sin red"))))).toBe("VALIDACION");

    const saltos: Record<string, string> = {
      "https://maps.app.goo.gl/abc": "https://goo.gl/maps/intermedio",
      "https://goo.gl/maps/intermedio": "https://www.google.com/maps/place/X/@-34.60,-58.38,17z/data=!3d-34.603722!4d-58.381592",
    };
    const redireccion = async (url: string) => new Response(null, { status: 302, headers: { location: saltos[url] ?? "" } });
    expect(await resolverEnlaceDeMapa("https://maps.app.goo.gl/abc", redireccion)).toEqual({ lat: -34.603722, lng: -58.381592 });
    expect(await resolverEnlaceDeMapa("-34.6, -58.4", redireccion)).toEqual({ lat: -34.6, lng: -58.4 });
    expect(await resolverEnlaceDeMapa("https://otro.sitio/x", redireccion)).toBeNull();
    const aOtroSitio = async () => new Response(null, { status: 302, headers: { location: "https://malicioso.test/y" } });
    expect(await resolverEnlaceDeMapa("https://maps.app.goo.gl/abc", aOtroSitio)).toBeNull();
    expect(await resolverEnlaceDeMapa("https://maps.app.goo.gl/abc", async () => new Response(null, { status: 200 }))).toBeNull();
    expect(await resolverEnlaceDeMapa("https://maps.app.goo.gl/abc", async () => Promise.reject(new Error("sin red")))).toBeNull();
  });
});
