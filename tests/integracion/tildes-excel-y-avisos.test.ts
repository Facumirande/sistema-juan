import { count, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { pedido, producto, usuario } from "@/db/esquema";
import { formatearFecha, sumarDias } from "@/dominio/fechas/fechas";
import { COLUMNAS_DE_PRODUCTOS } from "@/dominio/catalogo/planilla";
import { COLUMNAS_DE_PEDIDOS } from "@/dominio/pedidos/planilla";
import { planillaXlsx, type Celda } from "@/lib/planilla";
import { hojaDeProductos, importarProductos, planillaModeloDeProductos, revisarPlanillaDeProductos } from "@/modulos/catalogo/planilla";
import { crearProducto, editarProducto, listarProductos, obtenerProducto } from "@/modulos/catalogo/productos";
import { avisosPara, marcarAvisosVistos } from "@/modulos/colaboracion/avisos";
import { escribirNota, marcarNotasLeidas } from "@/modulos/colaboracion/notas";
import { registrarCompra } from "@/modulos/compras/compras";
import { desmarcarPedidoComprado, generarListaCompra, hojaDeListaDeCompras, marcarNoConseguido, marcarPedidoComprado, obtenerListaCompra, tildarLinea } from "@/modulos/compras/lista-compra";
import { iniciarPreparacion, obtenerEntregaParaPreparar, obtenerPreparacion } from "@/modulos/entregas/preparacion";
import { datosParaCargarPedido } from "@/modulos/pedidos/carga";
import { asignarResponsable, cargarPedido, obtenerPedido } from "@/modulos/pedidos/pedidos";
import { hojaDePedidos, importarPedidos, planillaModelo, revisarPlanillaDePedidos } from "@/modulos/pedidos/planilla";
import { tableroDePedidos } from "@/modulos/pedidos/tablero";

import { codigoDeError, crearUsuarioDePrueba } from "./base-de-prueba";
import { prepararJornada2409, type Jornada2409 } from "./escenario-24-09";

// Pedidos y productos en Excel, tildes de compra en las tarjetas del tablero, código de cada producto
// y avisos de la campanita (06/10/2026).

let j: Jornada2409;
let maria: string;
let dia: string;
const pedidos: Record<string, string> = {};

const idDeUsuario = async (authUserId: string) =>
  (await j.base.comoSuperusuario(() => j.base.db.select({ id: usuario.id }).from(usuario).where(eq(usuario.authUserId, authUserId))))[0]!.id;
const cuantosPedidos = async () => Number((await j.base.comoSuperusuario(() => j.base.db.select({ n: count() }).from(pedido)))[0]!.n);
const planilla = (filas: Celda[][]) => planillaXlsx([{ nombre: "Pedidos", columnas: [...COLUMNAS_DE_PEDIDOS], filas }]);
const tarjeta = async (cliente: string) => {
  const t = await tableroDePedidos(j.base.db, j.admin, dia);
  const x = t.columnas.flatMap((c) => c.tarjetas).find((y) => y.cliente === cliente)!;
  return { ...x, producto: (nombre: string) => x.productos.find((p) => p.nombre === nombre)! };
};

beforeAll(async () => {
  j = await prepararJornada2409();
  maria = await crearUsuarioDePrueba(j.base.db, j.empresaId, "María Pérez", ["ADMIN"]);
  dia = sumarDias(j.manana, 2);
});

describe("pedidos en Excel", () => {
  it("subir una planilla: primero se revisa y después se cargan todos juntos", async () => {
    const bytes = planilla([
      [formatearFecha(dia), "Hospital San Martín", "TOMATE", "Tomate redondo", { numero: "36" }, "kg", "maduros"],
      // Cliente y fecha vacíos: los de la fila de arriba. Por envase y solo con el código.
      [null, null, "papa", null, { numero: "2" }, "Bolsa 25 kg", null],
      // Otro cliente sin fecha (vale el día elegido), por nombre del producto y con tres decimales.
      [null, "verdulería don pepe", null, "Cebolla", { numero: "1.125" }, null, null],
    ]);
    const r = await revisarPlanillaDePedidos(j.base.db, maria, { bytes, fecha: dia });
    expect(r.problemas).toEqual([]);
    expect(r.avisos).toEqual([]);
    expect(r.pedidos.map((p) => [p.cliente, p.fecha, p.lineas.map((l) => `${l.producto}: ${l.texto}`)])).toEqual([
      ["Hospital San Martín", dia, ["Tomate redondo: 36 kg", "Papa: 2 × Bolsa 25 kg"]],
      ["Verdulería Don Pepe", dia, ["Cebolla: 1,125 kg"]],
    ]);
    // Revisar no carga nada.
    const antes = await cuantosPedidos();
    const cargados = await importarPedidos(j.base.db, maria, r.pedidos);
    expect(await cuantosPedidos()).toBe(antes + 2);
    expect(cargados.map((c) => [c.cliente, c.estado, c.fecha])).toEqual([
      ["Hospital San Martín", "CONFIRMADO", dia],
      ["Verdulería Don Pepe", "CONFIRMADO", dia],
    ]);
    pedidos.hospital = cargados[0]!.pedidoId;
    pedidos.verduleria = cargados[1]!.pedidoId;
    const t = await tableroDePedidos(j.base.db, j.admin, dia);
    expect(t.columnas.find((c) => c.clave === "pedidos")!.tarjetas.map((x) => x.cliente).sort()).toEqual(["Hospital San Martín", "Verdulería Don Pepe"]);
    // 1,125 kg son un kilo y un octavo, no mil ciento veinticinco.
    const verduleria = await obtenerPedido(j.base.db, j.admin, pedidos.verduleria);
    expect(verduleria.lineas.map((l) => [l.producto, l.cantidadBase])).toEqual([["Cebolla", "1.125"]]);
    const hospital = await obtenerPedido(j.base.db, j.admin, pedidos.hospital);
    expect(hospital.lineas.map((l) => [l.producto, l.cantidadBase, l.observaciones])).toEqual([
      ["Tomate redondo", "36.000", "maduros"],
      ["Papa", "50.000", null],
    ]);
  });

  it("una planilla con errores no carga nada y dice qué fila corregir", async () => {
    const r = await revisarPlanillaDePedidos(j.base.db, maria, {
      bytes: planilla([
        [null, "Hospital San Martín", "TOMATE", null, { numero: "5" }, null, null],
        [null, "Hospital San Martin SA", "PAPA", null, { numero: "5" }, null, null],
        [null, "Verdulería Don Pepe", "ZAPALLO", null, { numero: "5" }, null, null],
      ]),
      fecha: dia,
    });
    expect(r.pedidos).toEqual([]);
    expect(r.problemas.map((p) => p.fila)).toEqual([3, 4]);
    expect(r.problemas[0]!.mensaje).toContain("¿Quisiste decir “Hospital San Martín”?");
    // Un archivo cualquiera se lee como texto: no tiene los títulos y lo dice.
    expect((await revisarPlanillaDePedidos(j.base.db, maria, { bytes: new Uint8Array([65, 66, 67]), fecha: dia })).problemas[0]!.mensaje).toContain("títulos");
    // Un archivo que no es una planilla: mensaje claro, no un error del sistema.
    expect(await codigoDeError(revisarPlanillaDePedidos(j.base.db, maria, { bytes: new Uint8Array([0x50, 0x4b, 9, 9]), fecha: dia }))).toBe("VALIDACION");
  });

  it("si un pedido no se puede cargar, no queda ninguno a medias", async () => {
    const antes = await cuantosPedidos();
    const lineas = [{ productoId: j.ids.tomate!, presentacionId: null, cantidad: "3", observaciones: null }];
    const intento = importarPedidos(j.base.db, maria, [
      { fecha: dia, clienteId: j.ids.restaurante!, lineas },
      { fecha: dia, clienteId: "00000000-0000-4000-8000-00000000dead", lineas },
    ]);
    expect(await codigoDeError(intento)).toBe("NO_ENCONTRADO");
    expect(await cuantosPedidos()).toBe(antes);
  });

  it("lo cargado se baja a Excel con las mismas columnas, y volver a subirlo avisa que ya están", async () => {
    const hoja = await hojaDePedidos(j.base.db, j.admin, dia);
    expect(hoja.columnas).toEqual([...COLUMNAS_DE_PEDIDOS, "Pedido", "Estado"]);
    expect(hoja.filas.map((f) => f.slice(0, 7))).toEqual([
      [formatearFecha(dia), "Hospital San Martín", "TOMATE", "Tomate redondo", { numero: "36" }, "kg", "maduros"],
      [formatearFecha(dia), "Hospital San Martín", "PAPA", "Papa", { numero: "2" }, "Bolsa 25 kg", null],
      [formatearFecha(dia), "Verdulería Don Pepe", "CEBOLLA", "Cebolla", { numero: "1.125" }, "kg", null],
    ]);
    expect(hoja.filas[0]!.slice(7)).toEqual([expect.stringMatching(/^PED-/), "En Pedidos"]);
    const r = await revisarPlanillaDePedidos(j.base.db, maria, { bytes: planillaXlsx([hoja]) });
    expect(r.problemas).toEqual([]);
    expect(r.pedidos.map((p) => p.lineas.map((l) => l.texto))).toEqual([["36 kg", "2 × Bolsa 25 kg"], ["1,125 kg"]]);
    expect(r.avisos).toHaveLength(2);
    expect(r.avisos[0]).toContain("Hospital San Martín ya tiene el pedido PED-");
  });

  it("la planilla modelo trae los títulos y, en otras hojas, los productos con su código y los clientes", async () => {
    const hojas = await planillaModelo(j.base.db, maria);
    expect(hojas.map((h) => h.nombre)).toEqual(["Pedidos", "Cómo llenarla", "Productos", "Clientes"]);
    expect(hojas[2]!.filas).toContainEqual(["CEBOLLA", "Cebolla", "kg", "Cajón 18 kg · Bolsa 20 kg"]);
    expect(hojas[3]!.filas.map((f) => f[0])).toContain("Hospital San Martín");
    // Subirla sin llenar explica qué falta.
    const r = await revisarPlanillaDePedidos(j.base.db, maria, { bytes: planillaXlsx(hojas) });
    expect(r.problemas).toEqual([{ fila: 0, mensaje: "La planilla no tiene ningún pedido debajo de los títulos." }]);
  });
});

describe("tildar la compra en las tarjetas del tablero", () => {
  it("se tilda lo comprado y lo que no se consiguió; con todo resuelto la tarjeta pasa a Comprado", async () => {
    await generarListaCompra(j.base.db, j.comprador, dia);
    let hospital = await tarjeta("Hospital San Martín");
    expect([hospital.columna, hospital.avance]).toEqual(["en_lista", { que: "comprado", hechos: 0, total: 2 }]);

    await tildarLinea(j.base.db, j.comprador, { itemId: hospital.producto("Tomate redondo").listaItemId!, tildado: true });
    hospital = await tarjeta("Hospital San Martín");
    expect(hospital.producto("Tomate redondo")).toMatchObject({ hecha: true, compra: "COMPRADO", tildado: true });
    expect([hospital.columna, hospital.avance?.hechos]).toEqual(["en_lista", 1]);
    // En la lista de compras se ve tildado, sin compra anotada.
    const lista = await obtenerListaCompra(j.base.db, j.admin, dia);
    expect(lista!.plan.flatMap((p) => p.lineas).find((l) => l.producto === "Tomate redondo")).toMatchObject({ estado: "COMPRADO", tildado: true, compradoBase: "0.000" });

    await marcarNoConseguido(j.base.db, j.comprador, { itemId: hospital.producto("Papa").listaItemId!, motivo: "No se consiguió en el mercado" });
    hospital = await tarjeta("Hospital San Martín");
    expect(hospital.columna).toBe("comprados");
    expect(hospital.producto("Papa")).toMatchObject({ hecha: true, compra: "NO_CONSEGUIDO", tildado: false, aviso: "No se consiguió en el mercado" });

    // Destildar lo vuelve a dejar por comprar.
    await tildarLinea(j.base.db, j.comprador, { itemId: hospital.producto("Tomate redondo").listaItemId!, tildado: false });
    hospital = await tarjeta("Hospital San Martín");
    expect([hospital.columna, hospital.producto("Tomate redondo").compra]).toEqual(["en_lista", "PENDIENTE"]);
  });

  it("la tarjeta se pasa a Comprado sin tildar todo, y se puede devolver", async () => {
    expect(await marcarPedidoComprado(j.base.db, j.comprador, pedidos.verduleria!)).toBe(1);
    expect((await tarjeta("Verdulería Don Pepe")).columna).toBe("comprados");
    expect(await desmarcarPedidoComprado(j.base.db, j.comprador, pedidos.verduleria!)).toBe(1);
    expect((await tarjeta("Verdulería Don Pepe")).columna).toBe("en_lista");

    // Lo que ya estaba marcado "no se consiguió" queda así: solo se tilda lo que faltaba.
    expect(await marcarPedidoComprado(j.base.db, j.comprador, pedidos.hospital!)).toBe(1);
    const hospital = await tarjeta("Hospital San Martín");
    expect([hospital.columna, hospital.producto("Tomate redondo").tildado, hospital.producto("Papa").compra]).toEqual(["comprados", true, "NO_CONSEGUIDO"]);
    // Pasarla de nuevo no hace nada; una tarjeta que no está en la lista no se puede pasar.
    expect(await marcarPedidoComprado(j.base.db, j.comprador, pedidos.hospital!)).toBe(0);
    const suelto = await cargarPedido(j.base.db, maria, { fecha: sumarDias(dia, 1), clienteId: j.ids.restaurante!, lineas: [{ productoId: j.ids.papa!, cantidad: "5" }], confirmar: true });
    expect(await codigoDeError(marcarPedidoComprado(j.base.db, j.comprador, suelto.pedidoId))).toBe("TRANSICION_INVALIDA");
  });

  it("si después hace falta más, el tilde deja de valer y el producto vuelve a quedar por comprar", async () => {
    await marcarPedidoComprado(j.base.db, j.comprador, pedidos.verduleria!);
    const cebolla = async () => (await obtenerListaCompra(j.base.db, j.admin, dia))!.plan.flatMap((p) => p.lineas).find((l) => l.producto === "Cebolla")!;
    expect(await cebolla()).toMatchObject({ estado: "COMPRADO", tildado: true });
    // Entra otro pedido con cebolla: ahora hace falta más que cuando se tildó.
    const restaurante = await cargarPedido(j.base.db, maria, { fecha: dia, clienteId: j.ids.restaurante!, lineas: [{ productoId: j.ids.cebolla!, cantidad: "10" }], confirmar: true });
    pedidos.restaurante = restaurante.pedidoId;
    await generarListaCompra(j.base.db, j.comprador, dia, { pedidoIds: [restaurante.pedidoId] });
    expect(await cebolla()).toMatchObject({ estado: "PENDIENTE", tildado: false, necesidadModificada: true, necesidadBase: "11.125" });
    expect((await tarjeta("Verdulería Don Pepe")).columna).toBe("en_lista");
  });

  it("al preparar, lo tildado cuenta como comprado aunque no tenga la compra anotada", async () => {
    // La papa sí se consiguió y se anota la compra; el tomate quedó solo tildado; la cebolla, sin comprar.
    const hospital = await tarjeta("Hospital San Martín");
    await marcarNoConseguido(j.base.db, j.comprador, { itemId: hospital.producto("Papa").listaItemId!, motivo: null });
    await registrarCompra(j.base.db, j.comprador, {
      fecha: dia,
      proveedorId: j.ids.C!,
      condicion: "CONTADO",
      items: [{ productoId: j.ids.papa!, presentacionId: j.presentaciones["papa:Bolsa 25 kg"]!, cantidad: "2", precio: "12.500" }],
    });
    await iniciarPreparacion(j.base.db, j.admin, dia);
    const entregas = (await obtenerPreparacion(j.base.db, j.admin, dia)).entregas;
    const propuesta = async (cliente: string, producto: string) =>
      (await obtenerEntregaParaPreparar(j.base.db, j.admin, entregas.find((e) => e.cliente === cliente)!.id)).lineas.find((l) => l.producto === producto)!.propuesta;
    expect(await propuesta("Hospital San Martín", "Tomate redondo")).toBe("36.000");
    expect(await propuesta("Hospital San Martín", "Papa")).toBe("50.000");
    expect(await propuesta("Verdulería Don Pepe", "Cebolla")).toBe("0.000");
  });
});

describe("la lista de compras explica para quién es cada cosa y se baja a Excel", () => {
  it("cada producto dice para qué clientes es y la lista cuántos pedidos tiene adentro", async () => {
    const lista = (await obtenerListaCompra(j.base.db, j.admin, dia))!;
    expect(lista.pedidos).toBe(3);
    const de = (producto: string) => lista.plan.flatMap((p) => p.lineas).find((l) => l.producto === producto)!;
    expect(de("Cebolla").paraQuien).toEqual([
      { cliente: "Restaurante La Esquina", cantidadBase: "10" },
      { cliente: "Verdulería Don Pepe", cantidadBase: "1.125" },
    ]);
    expect(de("Tomate redondo")).toMatchObject({ codigo: "TOMATE", paraQuien: [{ cliente: "Hospital San Martín", cantidadBase: "36" }] });
  });

  it("la planilla trae una fila por producto con cuánto comprar, para quién y cómo va; sin lista no hay planilla", async () => {
    const hoja = (await hojaDeListaDeCompras(j.base.db, j.admin, dia))!;
    expect(hoja.nombre).toBe(`Lista de compras ${dia.slice(8, 10)}-${dia.slice(5, 7)}`);
    expect(hoja.columnas).toEqual(["Puesto", "Código", "Producto", "Comprar", "Envase", "Se necesita", "Unidad", "Para quién", "Precio del envase", "Se calcula gastar", "Cómo va", "Ya comprado", "Notas"]);
    const fila = (producto: string) => hoja.filas.find((f) => f[2] === producto)!;
    // El tomate quedó tildado a mano; la papa, con la compra anotada; la cebolla, sin comprar.
    expect([fila("Tomate redondo")[1], fila("Tomate redondo")[7], fila("Tomate redondo")[10], fila("Tomate redondo")[12]]).toEqual(["TOMATE", "Hospital San Martín (36)", "Tildado como comprado", "maduros"]);
    expect([fila("Papa")[10], fila("Papa")[11]]).toEqual(["Comprado", { numero: "50" }]);
    expect([fila("Cebolla")[5], fila("Cebolla")[7], fila("Cebolla")[10]]).toEqual([{ numero: "11.125" }, "Restaurante La Esquina (10) · Verdulería Don Pepe (1,125)", "Falta comprar"]);
    // Un día sin lista de compras no tiene planilla.
    expect(await hojaDeListaDeCompras(j.base.db, j.admin, sumarDias(dia, 30))).toBeNull();
  });
});

describe("productos: el código se arma solo y se cargan desde una planilla de Excel", () => {
  const planillaDeProductos = (filas: Celda[][]) => planillaXlsx([{ nombre: "Productos", columnas: [...COLUMNAS_DE_PRODUCTOS], filas }]);
  const cuantosProductos = async () => Number((await j.base.comoSuperusuario(() => j.base.db.select({ n: count() }).from(producto)))[0]!.n);

  it("el código se arma solo y sirve para buscar", async () => {
    const id = await crearProducto(j.base.db, j.admin, { nombre: "Champiñón blanco", categoriaId: j.ids.verduras!, unidadBase: "BANDEJA", admiteFraccion: false });
    const p = await obtenerProducto(j.base.db, j.admin, id);
    expect([p.codigo, p.grupo]).toEqual(["CHAM-B", "VERDURA"]);
    expect((await listarProductos(j.base.db, j.admin, { texto: "cham-b" })).map((x) => x.nombre)).toEqual(["Champiñón blanco"]);
    expect((await datosParaCargarPedido(j.base.db, j.admin)).productos.find((x) => x.id === id)!.codigo).toBe("CHAM-B");
    await editarProducto(j.base.db, j.admin, { id, codigo: p.codigo, nombre: p.nombre, categoriaId: p.categoriaId, unidadBase: p.unidadBase, admiteFraccion: false, observaciones: "Elegir los más blancos", presentacionVentaDefaultId: p.presentacionVentaDefaultId });
    expect((await obtenerProducto(j.base.db, j.admin, id)).observaciones).toBe("Elegir los más blancos");
  });

  it("subir una planilla: se revisa, se crean todos juntos con sus categorías nuevas y los que ya estaban se saltean", async () => {
    const bytes = planillaDeProductos([
      [null, "Zapallito verde", "Verduras", "kg", "Cajón", { numero: "15" }, null, { numero: "35" }, "tiernos"],
      ["RUC", "Rúcula", "Verduras de hoja", "atado", null, null, null, null, null],
      [null, "Huevo blanco", "Granja", "maple", "Caja", { numero: "12" }, "no", null, null],
      [null, "Tomate redondo", "Verduras", null, null, null, null, null, null],
    ]);
    const antes = await cuantosProductos();
    const r = await revisarPlanillaDeProductos(j.base.db, j.admin, bytes);
    expect(r.problemas).toEqual([]);
    expect(r.yaEstan).toEqual(["Tomate redondo"]);
    expect(r.categoriasNuevas).toEqual([{ nombre: "Verduras de hoja", grupo: "VERDURA" }, { nombre: "Granja", grupo: "OTRO" }]);
    expect(r.nuevos.map((p) => [p.nombre, p.categoria, p.unidadBase, p.envase?.nombre ?? null, p.admiteFraccion, p.ganancia])).toEqual([
      ["Zapallito verde", "Verduras", "KG", "Cajón 15 kg", true, "35"],
      ["Rúcula", "Verduras de hoja", "ATADO", null, false, null],
      ["Huevo blanco", "Granja", "MAPLE", "Caja 12 maple", false, null],
    ]);
    // Revisar no carga nada.
    expect(await cuantosProductos()).toBe(antes);

    const creado = await importarProductos(j.base.db, j.admin, r.nuevos);
    expect(creado.productos.map((p) => [p.nombre, p.codigo])).toEqual([["Zapallito verde", "ZAPA-V"], ["Rúcula", "RUC"], ["Huevo blanco", "HUEV-B"]]);
    expect(creado.categoriasCreadas).toEqual(["Verduras de hoja", "Granja"]);
    const zapallito = await obtenerProducto(j.base.db, j.admin, creado.productos[0]!.id);
    expect([zapallito.categoria, zapallito.observaciones, zapallito.presentaciones.map((x) => `${x.nombre}=${x.factorABase}`).sort()]).toEqual(["Verduras", "tiernos", ["Cajón 15 kg=15.000", "kg=1.000"]]);
    const [guardado] = await j.base.comoSuperusuario(() => j.base.db.select({ recargo: producto.recargoDefault }).from(producto).where(eq(producto.id, zapallito.id)));
    expect(guardado!.recargo).toBe("35.000");
    expect((await obtenerProducto(j.base.db, j.admin, creado.productos[1]!.id)).categoria).toBe("Verduras de hoja");

    // Volver a subir la misma planilla no duplica nada: ya están todos.
    const otraVez = await revisarPlanillaDeProductos(j.base.db, j.admin, bytes);
    expect([otraVez.nuevos.length, otraVez.yaEstan.length, otraVez.problemas.length]).toEqual([0, 4, 0]);
  });

  it("con errores no se carga nada, y sin permiso para las ganancias no se pueden subir", async () => {
    const r = await revisarPlanillaDeProductos(
      j.base.db,
      j.admin,
      planillaDeProductos([
        [null, "Acelga", "Verduas", null, null, null, null, null, null],
        [null, "Perejil", "Verduras", "ramito", null, null, null, null, null],
        [null, "Naranja", "Frutas", "kg", "Cajón", null, null, null, null],
        [null, "Pera", "Frutas", null, null, null, null, null, null],
      ]),
    );
    expect([r.nuevos, r.categoriasNuevas]).toEqual([[], []]);
    expect(r.problemas.map((p) => p.fila)).toEqual([2, 3, 4]);
    expect(r.problemas[0]!.mensaje).toContain("¿Quisiste decir “Verduras”?");

    // Pedro (comprador) puede cargar productos pero no cambiar ganancias.
    const conGanancia = planillaDeProductos([[null, "Pera", "Frutas", null, null, null, null, { numero: "40" }, null]]);
    expect((await revisarPlanillaDeProductos(j.base.db, j.comprador, conGanancia)).problemas).toEqual([{ fila: 0, mensaje: expect.stringContaining("tu usuario no puede cambiarlas") }]);
    expect((await revisarPlanillaDeProductos(j.base.db, j.admin, conGanancia)).nuevos).toHaveLength(1);
    // Un archivo que no es una planilla: mensaje claro.
    expect(await codigoDeError(revisarPlanillaDeProductos(j.base.db, j.admin, new Uint8Array([0x50, 0x4b, 9, 9])))).toBe("VALIDACION");

    // Si uno no se puede crear (ya hay una Papa), no queda ninguno a medias.
    const antes = await cuantosProductos();
    const comun = { codigo: null, categoria: "Frutas", categoriaId: j.ids.frutas!, unidadBase: "KG" as const, admiteFraccion: true, envase: null, ganancia: null, notas: null };
    expect(await codigoDeError(importarProductos(j.base.db, j.admin, [{ ...comun, nombre: "Kiwi" }, { ...comun, nombre: "Papa" }]))).toBe("VALIDACION");
    expect(await cuantosProductos()).toBe(antes);
  });

  it("la lista de productos se baja a Excel con las mismas columnas, y la planilla modelo trae las categorías", async () => {
    const hoja = await hojaDeProductos(j.base.db, j.admin);
    expect(hoja.columnas).toEqual([...COLUMNAS_DE_PRODUCTOS, "Estado"]);
    expect(hoja.filas.find((f) => f[1] === "Zapallito verde")).toEqual(["ZAPA-V", "Zapallito verde", "Verduras", "kg", "Cajón 15 kg", { numero: "15" }, "sí", { numero: "35" }, "tiernos", "Activo"]);
    expect(hoja.filas.find((f) => f[1] === "Rúcula")).toEqual(["RUC", "Rúcula", "Verduras de hoja", "atado", null, null, "no", null, null, "Activo"]);
    // Quien no ve márgenes (Pedro) la baja sin las ganancias.
    expect((await hojaDeProductos(j.base.db, j.comprador)).filas.find((f) => f[1] === "Zapallito verde")![7]).toBeNull();
    // Lo bajado se puede volver a subir: no hay nada nuevo.
    const vuelta = await revisarPlanillaDeProductos(j.base.db, j.admin, planillaXlsx([hoja]));
    expect([vuelta.nuevos.length, vuelta.problemas.length, vuelta.yaEstan.length]).toEqual([0, 0, hoja.filas.length]);

    const modelo = await planillaModeloDeProductos(j.base.db, j.admin);
    expect(modelo.map((h) => h.nombre)).toEqual(["Productos", "Cómo llenarla", "Categorías"]);
    expect(modelo[0]!.columnas).toEqual([...COLUMNAS_DE_PRODUCTOS]);
    expect(modelo[2]!.filas.map((f) => f[0])).toEqual(expect.arrayContaining(["Verduras", "Frutas", "Verduras de hoja", "Granja"]));
    expect((await revisarPlanillaDeProductos(j.base.db, j.admin, planillaXlsx(modelo))).problemas).toEqual([{ fila: 0, mensaje: "La planilla no tiene ningún producto debajo de los títulos." }]);
  });
});

describe("avisos de la campanita", () => {
  it("lo que carga o cambia otra persona es un aviso; lo propio no", async () => {
    const b = await avisosPara(j.base.db, j.admin, 40);
    expect(b.nuevos).toBeGreaterThan(0);
    expect(b.avisos.some((a) => a.persona.nombre === "María Pérez" && a.resumen.startsWith("cargó el pedido") && a.entidad?.tipo === "PEDIDO")).toBe(true);
    expect(b.avisos.some((a) => a.persona.nombre === "Pedro" && a.resumen.startsWith("pasó a Comprado el pedido"))).toBe(true);
    // El admin editó un producto recién: a él no le avisa, a María sí.
    expect(b.avisos.every((a) => a.persona.nombre !== "Admin Frutas Juan")).toBe(true);
    expect((await avisosPara(j.base.db, maria, 40)).avisos.some((a) => a.resumen === "cambió los datos del producto Champiñón blanco")).toBe(true);
    expect(b.personas.map((p) => p.nombre).sort()).toEqual(["María Pérez", "Pedro"]);

    // Al abrir la campanita queda todo visto.
    await marcarAvisosVistos(j.base.db, j.admin);
    const despues = await avisosPara(j.base.db, j.admin, 40);
    expect([despues.nuevos, despues.avisos.some((a) => a.nuevo)]).toEqual([0, false]);
  });

  it("lo que va dirigido a uno se destaca: un pedido que le pasaron y un aviso que le dejaron", async () => {
    const admin = await idDeUsuario(j.admin);
    await asignarResponsable(j.base.db, maria, { pedidoIds: [pedidos.restaurante!], usuarioId: admin });
    await escribirNota(j.base.db, maria, { entidadTipo: "USUARIO", entidadId: admin, texto: "¿Llamás al hospital por lo de mañana?", paraUsuarioId: admin });
    const b = await avisosPara(j.base.db, j.admin);
    expect([b.nuevos, b.notasSinLeer]).toEqual([2, 1]);
    expect(b.avisos.filter((a) => a.paraMi).map((a) => [a.clase, a.resumen, a.texto])).toEqual([
      ["NOTA", "te dejó una nota", "¿Llamás al hospital por lo de mañana?"],
      ["ACTIVIDAD", expect.stringContaining("le pasó el pedido"), null],
    ]);
    // A Pedro (comprador) no le llega lo que es para otra persona como "para vos".
    expect((await avisosPara(j.base.db, j.comprador)).avisos.some((a) => a.paraMi)).toBe(false);

    // Abrir la campanita no lee las notas: siguen contando hasta que se leen.
    await marcarAvisosVistos(j.base.db, j.admin);
    expect((await avisosPara(j.base.db, j.admin)).nuevos).toBe(1);
    await marcarNotasLeidas(j.base.db, j.admin, "TODAS");
    expect((await avisosPara(j.base.db, j.admin)).nuevos).toBe(0);
  });

  it("varios tildes seguidos de la lista llegan como un solo aviso", async () => {
    const lista = (await obtenerListaCompra(j.base.db, j.admin, dia))!.plan.flatMap((p) => p.lineas);
    const cebolla = lista.find((l) => l.producto === "Cebolla")!;
    await tildarLinea(j.base.db, maria, { itemId: cebolla.id, tildado: true });
    await tildarLinea(j.base.db, maria, { itemId: cebolla.id, tildado: false });
    await tildarLinea(j.base.db, maria, { itemId: cebolla.id, tildado: true });
    const b = await avisosPara(j.base.db, j.admin);
    expect(b.nuevos).toBe(3);
    expect(b.avisos[0]).toMatchObject({ resumen: "marcó 3 productos en la lista de compras", veces: 3, nuevo: true, entidad: { tipo: "LISTA_COMPRA" } });
  });
});
