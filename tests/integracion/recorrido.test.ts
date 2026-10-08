import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { jornada } from "@/db/esquema";
import { esErrorDeNegocio } from "@/dominio/errores";
import { sumarDias } from "@/dominio/fechas/fechas";
import { confirmarEntrega, entregaParaConfirmar, entregarPedido } from "@/modulos/entregas/entregas";
import { iniciarPreparacion, obtenerPreparacion } from "@/modulos/entregas/preparacion";
import { agregarDestino, guardarComoFavorito, guardarOrdenDelRecorrido, marcarDestino, quitarDestino, quitarFavorito, renombrarFavorito } from "@/modulos/entregas/recorrido";
import { fijarOrdenDeReparto, mandarEnCamino, obtenerReparto } from "@/modulos/entregas/repartos";
import { viajeDelDia } from "@/modulos/entregas/viaje";
import { agregarLinea, confirmarPedido, crearPedido } from "@/modulos/pedidos/pedidos";

import { prepararJornada2409, type Jornada2409 } from "./escenario-24-09";

// El recorrido del día (pedido del usuario, 07/10/2026): una sola lista con lo que está en camino y
// los destinos que se le suman, en el orden en que se la deja; los destinos favoritos; y quién
// recibió las otras veces en cada cliente.

let j: Jornada2409;
let restaurante = "";
let verduleria = "";
let repartoId = "";

const falla = async (promesa: Promise<unknown>) => {
  try {
    await promesa;
  } catch (e) {
    if (esErrorDeNegocio(e)) return { codigo: e.codigo, mensaje: e.message };
    throw e;
  }
  throw new Error("Se esperaba un error de negocio");
};
const viaje = () => viajeDelDia(j.base.db, j.admin, j.manana);
const nombres = async () => (await viaje()).recorrido.map((d) => d.nombre);
const entregaDe = async (cliente: string, salvo: string[] = []) => (await obtenerPreparacion(j.base.db, j.admin, j.manana)).entregas.find((e) => e.cliente === cliente && !salvo.includes(e.id))!.id;

beforeAll(async () => {
  j = await prepararJornada2409();
  await iniciarPreparacion(j.base.db, j.admin, j.manana, { pedidoIds: [j.ids.pedRestaurante!, j.ids.pedVerduleria!] });
  restaurante = await entregaDe("Restaurante La Esquina");
  verduleria = await entregaDe("Verdulería Don Pepe");
});

describe("el recorrido del día", () => {
  it("antes de salir no hay nada en el recorrido; al salir aparecen las entregas en el orden del reparto", async () => {
    expect((await viaje()).recorrido).toEqual([]);
    await mandarEnCamino(j.base.db, j.admin, { pedidoIds: [j.ids.pedRestaurante!, j.ids.pedVerduleria!], confirmar: true });
    const v = await viaje();
    expect(v.cerrado).toBe(false);
    expect(v.recorrido.map((d) => [d.tipo, d.hecha, d.clave.slice(0, 2)])).toEqual([
      ["ENTREGA", false, "E:"],
      ["ENTREGA", false, "E:"],
    ]);
    expect(v.recorrido.map((d) => d.id).sort()).toEqual([restaurante, verduleria].sort());
    repartoId = v.paradas.find((p) => p.entregaId === restaurante)!.repartoId!;
    expect((await obtenerReparto(j.base.db, j.admin, repartoId)).paradas.map((p) => p.id)).toEqual(v.recorrido.map((d) => d.id));
  });

  it("se le suma un destino con su nombre (queda al final) y se puede guardar como favorito", async () => {
    await agregarDestino(j.base.db, j.admin, { fecha: j.manana, nombre: "  Banco  ", direccion: "San Martín 100", coordenada: { lat: -34.6, lng: -58.4 }, guardarFavorito: true });
    const v = await viaje();
    expect(v.recorrido.map((d) => d.tipo)).toEqual(["ENTREGA", "ENTREGA", "EXTRA"]);
    expect(v.recorrido[2]).toMatchObject({ nombre: "Banco", direccion: "San Martín 100", coordenada: { lat: -34.6, lng: -58.4 }, hecha: false });
    expect(v.recorrido[2]!.favoritoId).not.toBeNull();
    expect(v.favoritos).toMatchObject([{ nombre: "Banco", direccion: "San Martín 100" }]);
  });

  it("hace falta el nombre y la dirección o la ubicación", async () => {
    expect((await falla(agregarDestino(j.base.db, j.admin, { fecha: j.manana, nombre: " ", direccion: "Belgrano 20" }))).mensaje).toMatch(/nombre/);
    expect((await falla(agregarDestino(j.base.db, j.admin, { fecha: j.manana, nombre: "Taller" }))).mensaje).toMatch(/dirección o marcá/);
    expect((await falla(agregarDestino(j.base.db, j.admin, { fecha: j.manana, nombre: "Taller", coordenada: { lat: 120, lng: 0 } }))).codigo).toBe("VALIDACION");
    expect((await falla(agregarDestino(j.base.db, j.comprador, { fecha: j.manana, nombre: "Taller", direccion: "Belgrano 20" }))).codigo).toBe("SIN_PERMISO");
  });

  it("el orden se guarda con las entregas y los destinos mezclados, y la hoja de ruta del reparto lo sigue", async () => {
    const banco = (await viaje()).recorrido[2]!.clave;
    await guardarOrdenDelRecorrido(j.base.db, j.admin, { fecha: j.manana, orden: [banco, `E:${verduleria}`, `E:${restaurante}`] });
    expect(await nombres()).toEqual(["Banco", "Verdulería Don Pepe", "Restaurante La Esquina"]);
    expect((await obtenerReparto(j.base.db, j.admin, repartoId)).paradas.map((p) => p.id)).toEqual([verduleria, restaurante]);

    // Lo que se suma después de ordenar queda al final, hasta que se lo acomode.
    await agregarDestino(j.base.db, j.admin, { fecha: j.manana, nombre: "Taller", direccion: "Belgrano 20" });
    expect(await nombres()).toEqual(["Banco", "Verdulería Don Pepe", "Restaurante La Esquina", "Taller"]);

    // Y al revés: ordenar el reparto acomoda el recorrido del día, sin mover lo demás.
    await fijarOrdenDeReparto(j.base.db, j.admin, { repartoId, orden: [restaurante, verduleria] });
    expect(await nombres()).toEqual(["Banco", "Restaurante La Esquina", "Verdulería Don Pepe", "Taller"]);

    expect((await falla(guardarOrdenDelRecorrido(j.base.db, j.admin, { fecha: j.manana, orden: ["cualquiera"] }))).codigo).toBe("VALIDACION");
    expect((await falla(guardarOrdenDelRecorrido(j.base.db, j.comprador, { fecha: j.manana, orden: [banco] }))).codigo).toBe("SIN_PERMISO");
  });

  it("un destino se marca como hecho, se desmarca y se quita", async () => {
    const taller = (await viaje()).recorrido.find((d) => d.nombre === "Taller")!;
    await marcarDestino(j.base.db, j.admin, { id: taller.id, hecha: true });
    expect((await viaje()).recorrido.find((d) => d.id === taller.id)?.hecha).toBe(true);
    await marcarDestino(j.base.db, j.admin, { id: taller.id, hecha: false });
    expect((await viaje()).recorrido.find((d) => d.id === taller.id)?.hecha).toBe(false);
    await quitarDestino(j.base.db, j.admin, taller.id);
    expect(await nombres()).toEqual(["Banco", "Restaurante La Esquina", "Verdulería Don Pepe"]);
    expect((await falla(quitarDestino(j.base.db, j.admin, taller.id))).codigo).toBe("NO_ENCONTRADO");
  });
});

describe("los destinos favoritos", () => {
  it("un favorito se suma con un toque, se renombra y dos no llevan el mismo nombre", async () => {
    const [banco] = (await viaje()).favoritos;
    await agregarDestino(j.base.db, j.admin, { fecha: j.manana, favoritoId: banco!.id });
    expect((await nombres()).filter((n) => n === "Banco")).toHaveLength(2);

    expect((await falla(agregarDestino(j.base.db, j.admin, { fecha: j.manana, nombre: "banco", direccion: "Otra 1", guardarFavorito: true }))).mensaje).toMatch(/Ya hay un favorito/);
    await renombrarFavorito(j.base.db, j.admin, { id: banco!.id, nombre: "Banco Nación" });
    expect((await viaje()).favoritos.map((f) => f.nombre)).toEqual(["Banco Nación"]);
    // Lo que ya estaba en el recorrido conserva el nombre con el que se sumó.
    expect(await nombres()).toContain("Banco");
  });

  it("un destino del recorrido pasa a ser favorito, y un favorito se quita sin tocar los recorridos", async () => {
    const id = await agregarDestino(j.base.db, j.admin, { fecha: j.manana, nombre: "Mercado", direccion: "Ruta 9 km 12" });
    const favoritoId = await guardarComoFavorito(j.base.db, j.admin, { id });
    expect((await viaje()).favoritos.map((f) => f.nombre)).toEqual(["Banco Nación", "Mercado"]);
    expect((await viaje()).recorrido.find((d) => d.id === id)?.favoritoId).toBe(favoritoId);
    expect((await falla(renombrarFavorito(j.base.db, j.admin, { id: favoritoId, nombre: "banco nación" }))).mensaje).toMatch(/otro favorito/);

    await quitarFavorito(j.base.db, j.admin, favoritoId);
    expect((await viaje()).favoritos.map((f) => f.nombre)).toEqual(["Banco Nación"]);
    expect(await nombres()).toContain("Mercado");
    expect((await falla(agregarDestino(j.base.db, j.admin, { fecha: j.manana, favoritoId }))).codigo).toBe("NO_ENCONTRADO");
  });

  it("un día sin nada cargado también puede tener destinos; un día cerrado no se toca", async () => {
    const otroDia = sumarDias(j.manana, 3);
    const id = await agregarDestino(j.base.db, j.admin, { fecha: otroDia, nombre: "Gomería", direccion: "Mitre 50" });
    expect((await viajeDelDia(j.base.db, j.admin, otroDia)).recorrido.map((d) => d.nombre)).toEqual(["Gomería"]);

    await j.base.comoSuperusuario(() => j.base.db.update(jornada).set({ estado: "CERRADA" }).where(eq(jornada.fecha, otroDia)));
    expect((await viajeDelDia(j.base.db, j.admin, otroDia)).cerrado).toBe(true);
    expect((await falla(agregarDestino(j.base.db, j.admin, { fecha: otroDia, nombre: "Otro", direccion: "Mitre 60" }))).codigo).toBe("JORNADA_CERRADA");
    expect((await falla(quitarDestino(j.base.db, j.admin, id))).codigo).toBe("JORNADA_CERRADA");
    expect((await falla(guardarOrdenDelRecorrido(j.base.db, j.admin, { fecha: otroDia, orden: [`X:${id}`] }))).codigo).toBe("JORNADA_CERRADA");
  });
});

describe("quién recibió las otras veces", () => {
  it("al entregar, lo ya entregado queda hecho en el recorrido y se recuerda quién recibió en ese cliente", async () => {
    expect((await entregaParaConfirmar(j.base.db, j.admin, restaurante)).recibieronAntes).toEqual([]);
    await confirmarEntrega(j.base.db, j.admin, { entregaId: restaurante, modo: "COMPLETA", recibidoPor: "Marta", recibidoCargo: "Encargada" });
    // Marcada desde el tablero, sin decir quién recibió: no sirve como historial.
    await entregarPedido(j.base.db, j.admin, j.ids.pedVerduleria!);
    expect((await viaje()).recorrido.filter((d) => d.tipo === "ENTREGA").map((d) => d.hecha)).toEqual([true, true]);

    // Otro pedido de cada uno el mismo día: va en otra entrega.
    const otroPedido = async (clienteId: string) => {
      const { pedidoId } = await crearPedido(j.base.db, j.admin, { fecha: j.manana, clienteId });
      await agregarLinea(j.base.db, j.admin, { pedidoId, productoId: j.ids.papa!, cantidad: "5" });
      await confirmarPedido(j.base.db, j.admin, pedidoId);
      return pedidoId;
    };
    await iniciarPreparacion(j.base.db, j.admin, j.manana, { pedidoIds: [await otroPedido(j.ids.restaurante!), await otroPedido(j.ids.verduleria!)] });
    const [otraDelRestaurante, otraDeLaVerduleria] = [await entregaDe("Restaurante La Esquina", [restaurante]), await entregaDe("Verdulería Don Pepe", [verduleria])];
    expect((await entregaParaConfirmar(j.base.db, j.admin, otraDelRestaurante)).recibieronAntes).toEqual([{ nombre: "Marta", cargo: "Encargada" }]);
    expect((await entregaParaConfirmar(j.base.db, j.admin, otraDeLaVerduleria)).recibieronAntes).toEqual([]);
  });
});
