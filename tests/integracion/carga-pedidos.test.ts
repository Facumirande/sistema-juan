import { beforeAll, describe, expect, it } from "vitest";

import { esErrorDeNegocio, textoParaPersona } from "@/dominio/errores";
import { sumarDias } from "@/dominio/fechas/fechas";
import { listarActividad } from "@/modulos/colaboracion/actividad";
import { generarListaCompra, obtenerListaCompra } from "@/modulos/compras/lista-compra";
import { crearProducto } from "@/modulos/catalogo/productos";
import { avisosPara } from "@/modulos/colaboracion/avisos";
import { crearRegla } from "@/modulos/precios-venta/reglas";
import { datosParaCargarPedido, historialDeCliente, marcarPedidoFrecuente } from "@/modulos/pedidos/carga";
import { cambiarProductosDePedido, cancelarPedido, cargarPedido, confirmarPedido, crearPedido, obtenerPedido } from "@/modulos/pedidos/pedidos";
import { tableroDePedidos } from "@/modulos/pedidos/tablero";

import { codigoDeError } from "./base-de-prueba";
import { prepararJornada2409, type Jornada2409 } from "./escenario-24-09";

// Carga visual de pedidos (28/09/2026): el pedido se guarda completo de una vez (nunca vacío) y
// sus productos se cambian desde la misma pantalla.

let j: Jornada2409;
let dia: string;
const pedidos: Record<string, string> = {};

const errorDe = async (promesa: Promise<unknown>) => {
  try {
    await promesa;
  } catch (e) {
    if (esErrorDeNegocio(e)) return e;
    throw e;
  }
  throw new Error("Se esperaba un error de negocio.");
};
const lineasDe = async (pedidoId: string) =>
  (await obtenerPedido(j.base.db, j.admin, pedidoId)).lineas.map((l) => [l.producto, l.presentacion, l.cantidadBase, l.cancelado ? l.motivoCancelacion : "ok"]);
const tarjetasDelDia = async () => (await tableroDePedidos(j.base.db, j.admin, dia)).columnas.flatMap((c) => c.tarjetas).length;

beforeAll(async () => {
  j = await prepararJornada2409();
  dia = sumarDias(j.manana, 2);
});

describe("lo que muestra la pantalla para cargar", () => {
  it("clientes con lo que suelen pedir, su último pedido y lo que ya tienen; productos con sus envases de venta", async () => {
    const d = await datosParaCargarPedido(j.base.db, j.admin);
    const hospital = d.clientes.find((c) => c.nombre === "Hospital San Martín")!;
    expect(hospital.puntos).toEqual([expect.objectContaining({ nombre: "Local", esPrincipal: true })]);
    expect(hospital.habituales).toEqual(expect.arrayContaining([j.ids.tomate, j.ids.papa, j.ids.lechuga, j.ids.banana, j.ids.cebolla]));
    expect(hospital.ultimo?.lineas.map((l) => [l.productoId, l.cantidad])).toEqual([
      [j.ids.tomate, "180"],
      [j.ids.papa, "140"],
      [j.ids.lechuga, "48"],
      [j.ids.banana, "60"],
      [j.ids.cebolla, "40"],
    ]);
    expect(hospital.abiertos.map((a) => a.fecha)).toEqual([j.manana]);
    const cebolla = d.productos.find((p) => p.nombre === "Cebolla")!;
    expect(cebolla.presentaciones.map((p) => p.nombre)).toContain("Bolsa 20 kg");
    expect(cebolla.presentaciones.map((p) => p.nombre)).not.toContain("Bolsa 10 kg");
    expect(cebolla.presentaciones.filter((p) => p.esUnidadBase)).toHaveLength(1);
    expect([cebolla.categoria, cebolla.grupo, cebolla.unidadBase]).toEqual(["Verduras", "VERDURA", "KG"]);
    expect(d.pedido).toBeNull();
    expect(d.sugerida >= d.hoy).toBe(true);
  });

  it("quien no carga pedidos no la abre", async () => {
    expect(await codigoDeError(datosParaCargarPedido(j.base.db, j.comprador))).toBe("SIN_PERMISO");
  });
});

describe("cargar un pedido de una vez", () => {
  it("crea el pedido con sus productos, la prioridad, el plazo y la nota, y lo confirma", async () => {
    const r = await cargarPedido(j.base.db, j.admin, {
      fecha: dia,
      clienteId: j.ids.restaurante!,
      lineas: [
        { productoId: j.ids.tomate!, presentacionId: null, cantidad: "10" },
        { productoId: j.ids.cebolla!, presentacionId: j.presentaciones["cebolla:Bolsa 20 kg"]!, cantidad: "2", observaciones: "chicas" },
        { productoId: j.ids.tomate!, presentacionId: null, cantidad: "2,5" },
      ],
      prioridad: "ALTA",
      entregaDesde: "",
      entregaHasta: "09:00",
      observaciones: "Tocar timbre",
      confirmar: true,
    });
    expect(r).toMatchObject({ cliente: "Restaurante La Esquina", fecha: dia, estado: "CONFIRMADO", duplicadoDe: null });
    expect(r.numero).toMatch(/^PED-\d{6}$/);
    expect(r.totalEstimado).not.toBeNull();
    expect(await lineasDe(r.pedidoId)).toEqual([
      ["Tomate redondo", null, "12.500", "ok"],
      ["Cebolla", "Bolsa 20 kg", "40.000", "ok"],
    ]);
    const p = await obtenerPedido(j.base.db, j.admin, r.pedidoId);
    expect([p.prioridad, p.entregaDesde, p.entregaHasta, p.observaciones]).toEqual(["ALTA", null, "09:00", "Tocar timbre"]);
    pedidos.restaurante = r.pedidoId;
  });

  it("si algo está mal no guarda nada y dice cómo arreglarlo", async () => {
    const antes = await tarjetasDelDia();
    const enteros = await errorDe(
      cargarPedido(j.base.db, j.admin, {
        fecha: dia,
        clienteId: j.ids.verduleria!,
        lineas: [
          { productoId: j.ids.tomate!, presentacionId: null, cantidad: "5" },
          { productoId: j.ids.lechuga!, presentacionId: null, cantidad: "2,5" },
        ],
        entregaDesde: "",
        entregaHasta: "",
      }),
    );
    expect(textoParaPersona(enteros.message)).toBe("Lechuga criolla se pide en unidades enteras: poné una cantidad sin coma, por ejemplo 2 o 3.");
    const vacio = await errorDe(cargarPedido(j.base.db, j.admin, { fecha: dia, clienteId: j.ids.verduleria!, lineas: [], entregaDesde: "", entregaHasta: "" }));
    expect(vacio.message).toBe("Elegí al menos un producto: tocá los recuadros de lo que lleva.");
    const plazo = await errorDe(
      cargarPedido(j.base.db, j.admin, {
        fecha: dia,
        clienteId: j.ids.verduleria!,
        lineas: [{ productoId: j.ids.tomate!, presentacionId: null, cantidad: "5" }],
        entregaDesde: "10:00",
        entregaHasta: "09:00",
      }),
    );
    expect(plazo.message).toContain("El plazo termina antes de empezar");
    const pasado = await errorDe(
      cargarPedido(j.base.db, j.admin, { fecha: sumarDias(j.manana, -5), clienteId: j.ids.verduleria!, lineas: [{ productoId: j.ids.tomate!, presentacionId: null, cantidad: "5" }], entregaDesde: "", entregaHasta: "" }),
    );
    expect(textoParaPersona(pasado.message)).toBe("Ese día ya pasó: los pedidos se cargan para hoy o para un día siguiente.");
    expect(await tarjetasDelDia()).toBe(antes);
  });

  it("avisa si el cliente ya tenía un pedido ese día; sin confirmar queda en borrador", async () => {
    const r = await cargarPedido(j.base.db, j.admin, {
      fecha: dia,
      clienteId: j.ids.restaurante!,
      lineas: [{ productoId: j.ids.papa!, presentacionId: null, cantidad: "5" }],
      entregaDesde: "",
      entregaHasta: "",
    });
    expect([r.estado, r.duplicadoDe]).toEqual(["BORRADOR", (await obtenerPedido(j.base.db, j.admin, pedidos.restaurante!)).numero]);
    pedidos.borrador = r.pedidoId;
  });

  it("el comprador no carga pedidos", async () => {
    expect(
      await codigoDeError(
        cargarPedido(j.base.db, j.comprador, { fecha: dia, clienteId: j.ids.hospital!, lineas: [{ productoId: j.ids.papa!, presentacionId: null, cantidad: "1" }], entregaDesde: "", entregaHasta: "" }),
      ),
    ).toBe("SIN_PERMISO");
  });
});

describe("cambiar los productos de un pedido", () => {
  it("en borrador: agrega, cambia y borra lo que se saca, y lo confirma", async () => {
    const d = await datosParaCargarPedido(j.base.db, j.admin, { pedidoId: pedidos.borrador! });
    expect(d.pedido).toMatchObject({ estado: "BORRADOR", fecha: dia, clienteId: j.ids.restaurante, lineas: [{ productoId: j.ids.papa, presentacionId: null, cantidad: "5", observaciones: null }] });
    // Lo que ya tiene el cliente, sin contar el pedido que se está cambiando: el de pasado mañana y el de la jornada de mañana.
    expect(d.clientes.find((c) => c.id === j.ids.restaurante)!.abiertos.map((a) => [a.id, a.fecha])).toEqual([
      [j.ids.pedRestaurante, j.manana],
      [pedidos.restaurante, dia],
    ]);
    const r = await cambiarProductosDePedido(j.base.db, j.admin, {
      pedidoId: pedidos.borrador!,
      lineas: [
        { productoId: j.ids.banana!, presentacionId: null, cantidad: "3" },
        { productoId: j.ids.lechuga!, presentacionId: null, cantidad: "12" },
      ],
      prioridad: "BAJA",
      entregaDesde: "",
      entregaHasta: "",
      confirmar: true,
    });
    expect(r.estado).toBe("CONFIRMADO");
    expect(await lineasDe(pedidos.borrador!)).toEqual([
      ["Banana", null, "3.000", "ok"],
      ["Lechuga criolla", null, "12.000", "ok"],
    ]);
  });

  it("en la lista de compra: lo que se saca queda cancelado con el motivo y la lista queda desactualizada", async () => {
    await generarListaCompra(j.base.db, j.comprador, dia, { pedidoIds: [pedidos.restaurante!] });
    await cambiarProductosDePedido(j.base.db, j.admin, {
      pedidoId: pedidos.restaurante!,
      lineas: [
        { productoId: j.ids.tomate!, presentacionId: null, cantidad: "15" },
        { productoId: j.ids.papa!, presentacionId: j.presentaciones["papa:Bolsa 25 kg"] ?? null, cantidad: "1" },
      ],
      prioridad: "ALTA",
      entregaDesde: "",
      entregaHasta: "09:00",
      observaciones: "Tocar timbre",
    });
    const lineas = await lineasDe(pedidos.restaurante!);
    expect(lineas.find((l) => l[0] === "Tomate redondo")).toEqual(["Tomate redondo", null, "15.000", "ok"]);
    expect(lineas.find((l) => l[0] === "Cebolla")).toEqual(["Cebolla", "Bolsa 20 kg", "40.000", "Se sacó al cambiar los productos del pedido."]);
    expect((await obtenerListaCompra(j.base.db, j.admin, dia))!.desactualizada).toBe(true);
    const actividad = await listarActividad(j.base.db, j.admin, { entidad: { tipo: "PEDIDO", id: pedidos.restaurante! }, limite: 10 });
    expect(actividad.entradas.map((e) => e.resumen)).toContain(`cambió los productos del pedido ${(await obtenerPedido(j.base.db, j.admin, pedidos.restaurante!)).numero} de Restaurante La Esquina`);
  });

  it("no se pasa a otro día un pedido que ya está en la lista de compra", async () => {
    const e = await errorDe(
      cambiarProductosDePedido(j.base.db, j.admin, {
        pedidoId: pedidos.restaurante!,
        fecha: sumarDias(dia, 1),
        lineas: [{ productoId: j.ids.tomate!, presentacionId: null, cantidad: "15" }],
        entregaDesde: "",
        entregaHasta: "",
      }),
    );
    expect(e.message).toContain("primero sacalo de la lista desde el tablero");
  });

  it("un pedido cancelado ya no se cambia, y lo dice en palabras", async () => {
    await cancelarPedido(j.base.db, j.admin, { pedidoId: pedidos.borrador!, motivo: "El cliente se arrepintió" });
    const e = await errorDe(
      cambiarProductosDePedido(j.base.db, j.admin, { pedidoId: pedidos.borrador!, lineas: [{ productoId: j.ids.tomate!, presentacionId: null, cantidad: "1" }], entregaDesde: "", entregaHasta: "" }),
    );
    expect(textoParaPersona(e.message)).toBe("Este pedido ya está cancelado y no se puede cambiar. Si hace falta mandar algo más, cargá un pedido nuevo para el cliente.");
  });
});

describe("confirmar un pedido vacío", () => {
  it("explica qué hacer y ofrece el botón para agregar productos", async () => {
    const { pedidoId } = await crearPedido(j.base.db, j.admin, { fecha: dia, clienteId: j.ids.verduleria! });
    const e = await errorDe(confirmarPedido(j.base.db, j.admin, pedidoId));
    expect(textoParaPersona(e.message)).toBe("Este pedido todavía no tiene productos: agregale al menos uno.");
    expect(e.detalle?.enlace).toEqual({ href: `/pedidos/${pedidoId}/cambiar`, texto: "Agregar productos" });
  });
});

describe("historial de pedidos, pedidos frecuentes y lo que se sugiere", () => {
  it("el historial trae los pedidos del cliente del más nuevo al más viejo, y la estrella define las sugerencias", async () => {
    const restaurante = j.ids.restaurante!;
    const historial = await historialDeCliente(j.base.db, j.admin, restaurante);
    expect(historial.length).toBeGreaterThan(0);
    expect(historial.every((h) => h.lineas.length > 0 && !h.frecuente && h.estado !== "CANCELADO")).toBe(true);
    expect([...historial].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.numero.localeCompare(a.numero))).toEqual(historial);

    // Sin ninguno marcado, se sugiere lo que más pide.
    const antes = (await datosParaCargarPedido(j.base.db, j.admin)).clientes.find((c) => c.id === restaurante)!;
    expect([antes.deFrecuentes, antes.habituales.length > 0]).toEqual([false, true]);

    // Con un pedido marcado con la estrella, las sugerencias salen de ese pedido.
    const elegido = historial.at(-1)!;
    await marcarPedidoFrecuente(j.base.db, j.admin, { pedidoId: elegido.id, frecuente: true });
    expect((await historialDeCliente(j.base.db, j.admin, restaurante)).find((h) => h.id === elegido.id)!.frecuente).toBe(true);
    const despues = (await datosParaCargarPedido(j.base.db, j.admin)).clientes.find((c) => c.id === restaurante)!;
    expect(despues.deFrecuentes).toBe(true);
    expect([...despues.habituales].sort()).toEqual([...new Set(elegido.lineas.map((l) => l.productoId))].sort());

    // Sacarle la estrella vuelve a lo de siempre; un pedido que no existe se avisa.
    await marcarPedidoFrecuente(j.base.db, j.admin, { pedidoId: elegido.id, frecuente: false });
    expect((await datosParaCargarPedido(j.base.db, j.admin)).clientes.find((c) => c.id === restaurante)!.deFrecuentes).toBe(false);
    expect((await errorDe(marcarPedidoFrecuente(j.base.db, j.admin, { pedidoId: "00000000-0000-4000-8000-00000000abcd", frecuente: true }))).codigo).toBe("NO_ENCONTRADO");
  });

  it("los productos se listan con cuándo se pidieron por última vez", async () => {
    const { productos } = await datosParaCargarPedido(j.base.db, j.admin);
    expect(productos.find((p) => p.id === j.ids.tomate)!.ultimaVez).not.toBeNull();
  });
});

describe("avisos de productos para revisar", () => {
  it("un producto sin precio de compra, o vendido por debajo de lo que cuesta, aparece en la campanita con su enlace", async () => {
    const sinPrecio = await crearProducto(j.base.db, j.admin, { nombre: "Rabanito de prueba", categoriaId: j.ids.verduras!, unidadBase: "ATADO", admiteFraccion: false });
    let avisos = (await avisosPara(j.base.db, j.admin)).paraRevisar;
    expect(avisos.find((a) => a.id === sinPrecio)).toMatchObject({ producto: "Rabanito de prueba", href: `/productos/${sinPrecio}`, problemas: [expect.stringContaining("Le falta el precio de compra")] });
    // Los que están bien no aparecen.
    expect(avisos.some((a) => a.id === j.ids.tomate)).toBe(false);

    // Un precio pactado por debajo del costo se avisa con el cliente y los dos importes.
    await crearRegla(j.base.db, j.admin, { clienteId: j.ids.restaurante!, tipo: "PRECIO_FIJO", productoId: j.ids.tomate!, valor: "1", confirmar: true });
    avisos = (await avisosPara(j.base.db, j.admin)).paraRevisar;
    expect(avisos.find((a) => a.id === j.ids.tomate)!.problemas[0]).toMatch(/A Restaurante La Esquina se le vende a \$1 y cuesta \$[\d.]+: se pierde plata/);
  });
});

