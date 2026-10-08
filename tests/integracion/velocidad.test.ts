import { beforeAll, describe, expect, it } from "vitest";

import { avisosPara } from "@/modulos/colaboracion/avisos";
import { personasDelNegocio } from "@/modulos/colaboracion/personas";
import { comprarDeLaLista } from "@/modulos/compras/compra-desde-lista";
import { generarListaCompra, marcarNoConseguido, marcarPedidoComprado, obtenerListaCompra, tildarLinea } from "@/modulos/compras/lista-compra";
import { entregarPedido } from "@/modulos/entregas/entregas";
import { iniciarPreparacion, marcarPreparada, obtenerPreparacion, separarLinea } from "@/modulos/entregas/preparacion";
import { guardarOrdenDelRecorrido } from "@/modulos/entregas/recorrido";
import { mandarEnCamino } from "@/modulos/entregas/repartos";
import { viajeDelDia } from "@/modulos/entregas/viaje";
import { diaDeTrabajo, diasParaElegir, procesoEnCurso } from "@/modulos/jornadas/dia";
import { datosParaCargarPedido } from "@/modulos/pedidos/carga";
import { cargarPedido } from "@/modulos/pedidos/pedidos";
import { avanceDeTarjeta, tableroDePedidos } from "@/modulos/pedidos/tablero";
import { ejecutarComoUsuario } from "@/modulos/seguridad/contexto";

import { crearUsuarioDePrueba, medirIdas } from "./base-de-prueba";
import { prepararJornada2409, type Jornada2409 } from "./escenario-24-09";

// La velocidad de la aplicación depende de cuántas idas a la base hace cada pantalla y cada botón
// (cada ida son unos 50 ms desde la oficina; pedido del usuario, 07/10/2026). Estas pruebas fijan el
// máximo de cada paso del día: si un cambio vuelve a poner consultas una detrás de otra, fallan acá.
// Las consultas que salen juntas (`Promise.all`) cuentan como una sola ida.

let j: Jornada2409;

beforeAll(async () => {
  j = await prepararJornada2409();
});

/** Mide `fn` y exige que no pase de `maximo` idas a la base. */
async function hasta<T>(maximo: number, que: string, fn: () => Promise<T>): Promise<T> {
  const r = await medirIdas(fn);
  expect(r.idas, `${que}: ${r.idas} idas a la base (el máximo es ${maximo})`).toBeLessThanOrEqual(maximo);
  return r.resultado;
}

describe("idas a la base de cada pantalla", () => {
  it("abrir una transacción con su contexto es una sola ida", async () => {
    await hasta(1, "transacción vacía", () => ejecutarComoUsuario(j.base.db, j.admin, null, async () => null));
  });

  it("las pantallas del día salen en dos o tres idas", async () => {
    const { db } = j.base;
    await hasta(2, "tablero con el paso a paso", () => diaDeTrabajo(db, j.admin, j.manana, { conTablero: true }));
    await hasta(2, "tablero solo", () => tableroDePedidos(db, j.admin, j.manana));
    await hasta(2, "tarjeta abierta", () => avanceDeTarjeta(db, j.admin, j.ids.pedRestaurante!));
    await hasta(3, "etapas del menú", () => procesoEnCurso(db, j.admin));
    await hasta(3, "avisos de la campanita", () => avisosPara(db, j.admin));
    await hasta(2, "días para elegir", () => diasParaElegir(db, j.admin, j.manana));
    await hasta(3, "lista de compras", () => obtenerListaCompra(db, j.admin, j.manana));
    await hasta(2, "nuevo pedido", () => datosParaCargarPedido(db, j.admin));
    await hasta(2, "recorrido del día", () => viajeDelDia(db, j.admin, j.manana));
  });
});

describe("idas a la base de cada botón del tablero", () => {
  it("un pedido recorre todo el día sin pasar del máximo en ningún paso", async () => {
    const { db } = j.base;
    const a = j.admin;
    const nuevo = await hasta(5, "guardar un pedido nuevo", () =>
      cargarPedido(db, a, {
        fecha: j.manana,
        clienteId: j.ids.restaurante!,
        puntoEntregaId: null,
        lineas: [
          { productoId: j.ids.tomate!, presentacionId: null, cantidad: "3", observaciones: null },
          { productoId: j.ids.papa!, presentacionId: null, cantidad: "5", observaciones: null },
        ],
        prioridad: "NORMAL",
        entregaDesde: "",
        entregaHasta: "",
        observaciones: "",
        confirmar: true,
      }),
    );
    expect(nuevo.estado).toBe("CONFIRMADO");
    await hasta(7, "mandarlo a la lista de compras", () => generarListaCompra(db, a, j.manana, { pedidoIds: [nuevo.pedidoId] }));

    // Un producto que todavía falta comprar (lo que ya tiene la compra anotada no se tilda a mano).
    const renglon = (await obtenerListaCompra(db, a, j.manana))!.plan.flatMap((p) => p.lineas).find((l) => l.estado === "PENDIENTE" || l.estado === "PARCIAL")!;
    await hasta(4, "tildar un producto", () => tildarLinea(db, a, { itemId: renglon.id, tildado: true }));
    await hasta(4, "destildarlo", () => tildarLinea(db, a, { itemId: renglon.id, tildado: false }));
    await hasta(4, "marcar que no se consiguió", () => marcarNoConseguido(db, a, { itemId: renglon.id, motivo: "No se consiguió en el mercado" }));
    await hasta(4, "volver a buscarlo", () => marcarNoConseguido(db, a, { itemId: renglon.id, motivo: null }));
    // "💲 Precio y puesto" en un renglón de la lista: la compra con su precio, en el puesto que ya lo vende.
    const otro = (await obtenerListaCompra(db, a, j.manana, { paraComprar: true }))!.plan.flatMap((p) => p.lineas).find((l) => l.id === renglon.id)!;
    await hasta(18, "anotar la compra de un producto (precio y puesto)", () =>
      comprarDeLaLista(db, a, { itemId: otro.id, ofertaId: otro.ofertas[0]!.ofertaId, cantidad: "1", precio: otro.ofertas[0]!.precio, pagado: true, confirmarVariacion: true }),
    );
    await hasta(5, "pasar la tarjeta a Comprado", () => marcarPedidoComprado(db, a, nuevo.pedidoId));

    await hasta(9, "empezar a preparar un pedido", () => iniciarPreparacion(db, a, j.manana, { pedidoIds: [nuevo.pedidoId] }));
    await hasta(9, "empezar a preparar el día entero", () => iniciarPreparacion(db, a, j.manana));
    const preparacion = await hasta(3, "pantalla de preparación", () => obtenerPreparacion(db, a, j.manana));
    const tarjetas = (await tableroDePedidos(db, a, j.manana)).columnas.flatMap((c) => c.tarjetas);
    const verduleria = tarjetas.find((t) => t.id === j.ids.pedVerduleria)!;
    await hasta(4, "tildar un producto separado", () => separarLinea(db, a, { itemId: verduleria.productos[0]!.entregaItemId!, separado: true }));
    await hasta(4, "destildarlo", () => separarLinea(db, a, { itemId: verduleria.productos[0]!.entregaItemId!, separado: false }));

    await hasta(17, "sale ahora (con productos sin tildar)", () => mandarEnCamino(db, a, { pedidoIds: [j.ids.pedVerduleria!], confirmar: true }));
    await hasta(12, "marcarlo entregado", () => entregarPedido(db, a, j.ids.pedVerduleria!));

    const hospital = tarjetas.find((t) => t.id === j.ids.pedHospital)!;
    for (const p of hospital.productos) await separarLinea(db, a, { itemId: p.entregaItemId!, separado: true });
    const entregaHospital = preparacion.entregas.find((e) => e.cliente === "Hospital San Martín")!;
    await hasta(11, "marcar preparado (hace el remito)", () => marcarPreparada(db, a, { entregaId: entregaHospital.id }));
    await hasta(10, "sale ahora (ya preparado)", () => mandarEnCamino(db, a, { pedidoIds: [j.ids.pedHospital!] }));

    const viaje = await hasta(2, "recorrido con lo que está en camino", () => viajeDelDia(db, a, j.manana));
    expect(viaje.recorrido.length).toBeGreaterThan(1);
    await hasta(4, "guardar el orden del recorrido", () => guardarOrdenDelRecorrido(db, a, { fecha: j.manana, orden: viaje.recorrido.map((d) => d.clave).reverse() }));
  });
});

describe("el orden de las consultas que salen juntas", () => {
  it("el color de cada persona se calcula con todo el negocio a la vista (no solo con su propia fila)", async () => {
    // Las consultas del contexto salen juntas: la de los colores tiene que salir después de fijar la
    // empresa, o cada persona vería solo su fila y a todas les tocaría el primer color.
    const { db } = j.base;
    const otra = await crearUsuarioDePrueba(db, j.empresaId, "Otra persona", ["ADMIN"]);
    const colorDe = (auth: string) => ejecutarComoUsuario(db, auth, null, async (tx, c) => ({ propio: c.color, id: c.usuarioId, todos: await personasDelNegocio(tx) }));
    const [una, dos] = [await colorDe(j.admin), await colorDe(otra)];
    expect(una.propio).not.toBe(dos.propio);
    // El color con el que se ve a sí misma es el mismo con el que la ven los demás.
    expect(una.todos.find((p) => p.id === una.id)?.color).toBe(una.propio);
    expect(dos.todos.find((p) => p.id === dos.id)?.color).toBe(dos.propio);
    expect(una.todos.find((p) => p.id === dos.id)?.color).toBe(dos.propio);
  });
});
