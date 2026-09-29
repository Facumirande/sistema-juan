import { and, eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { auditoria, empresa, jornada, pedidoItem } from "@/db/esquema";
import { enEmpresa } from "@/db/transaccion";
import { hoyEnEmpresa, sumarDias } from "@/dominio/fechas/fechas";
import { guardarCategoria } from "@/modulos/catalogo/categorias";
import { crearProducto, marcarProveedorPreferido, obtenerProducto } from "@/modulos/catalogo/productos";
import { guardarCliente } from "@/modulos/clientes/clientes";
import { listarJornadas } from "@/modulos/pedidos/jornadas";
import {
  agregarLinea,
  cambiarDatosPedido,
  cambiarLinea,
  cancelarPedido,
  confirmarPedido,
  crearPedido,
  duplicarPedido,
  fijarPrecioManual,
  listarPedidos,
  obtenerPedido,
  quitarLinea,
} from "@/modulos/pedidos/pedidos";
import { actualizarPrecioOferta, crearOferta } from "@/modulos/precios-compra/ofertas";
import { cambiarRecargo, cerrarRegla, crearRegla, listaDePreciosCliente, listarReglasCliente, recargosActuales } from "@/modulos/precios-venta/reglas";
import { guardarProveedor } from "@/modulos/proveedores/proveedores";

import { codigoDeError, crearBaseDePrueba, crearEmpresaDePrueba, crearUsuarioDePrueba, type BaseDePrueba } from "./base-de-prueba";

// Escenario de 04 §2 y ejemplo del tomate de 05 §10 (paso 1): costo $900/kg del preferido A,
// redondeo $10 hacia arriba.

let base: BaseDePrueba;
let empresaId: string;
let admin: string;
let vendedor: string;
const ids: Record<string, string> = {};
let manana: string;

const mensajeDeError = async (promesa: Promise<unknown>) => {
  try {
    await promesa;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  return "SIN_ERROR";
};

const precioDe = async (clienteId: string, producto = "Tomate redondo") =>
  (await listaDePreciosCliente(base.db, admin, { clienteId, fecha: manana })).precios.find((p) => p.producto === producto)!.resultado;

beforeAll(async () => {
  base = await crearBaseDePrueba();
  const e = await crearEmpresaDePrueba(base.db, "Frutas Juan");
  empresaId = e.empresaId;
  admin = e.authUserIdAdmin;
  vendedor = await crearUsuarioDePrueba(base.db, empresaId, "Vale", ["VENDEDOR"]);
  await base.comoSuperusuario(() => base.db.update(empresa).set({ redondeoModo: "ARRIBA", redondeoMultiplo: "10.0000" }).where(eq(empresa.id, empresaId)));
  manana = sumarDias(hoyEnEmpresa(new Date(), "America/Argentina/Buenos_Aires"), 1);

  ids.verduras = await guardarCategoria(base.db, admin, { nombre: "Verduras", grupo: "VERDURA", orden: "1" });
  const producto = (codigo: string, nombre: string, compra: [string, string], unidadBase: "KG" | "UNIDAD" = "KG") =>
    crearProducto(base.db, admin, {
      codigo,
      nombre,
      categoriaId: ids.verduras!,
      unidadBase,
      admiteFraccion: unidadBase === "KG",
      presentacionCompraNombre: compra[0],
      presentacionCompraFactor: compra[1],
    });
  ids.tomate = await producto("TOM", "Tomate redondo", ["Cajón 18 kg", "18"]);
  ids.lechuga = await producto("LEC", "Lechuga criolla", ["Jaula 12 u", "12"], "UNIDAD");
  ids.A = await guardarProveedor(base.db, admin, { nombre: "Hnos. García", condicionPagoHabitual: "CREDITO" });
  ids.B = await guardarProveedor(base.db, admin, { nombre: "La Quinta", condicionPagoHabitual: "CREDITO" });
  const cajon = (await obtenerProducto(base.db, admin, ids.tomate)).presentaciones.find((p) => p.nombre === "Cajón 18 kg")!.id;
  ids.cajon = cajon;
  ids.ofertaA = await crearOferta(base.db, admin, { proveedorId: ids.A, productoId: ids.tomate, presentacionId: cajon, precio: "16.200" });
  await crearOferta(base.db, admin, { proveedorId: ids.B, productoId: ids.tomate, presentacionId: cajon, precio: "17.100" });
  await marcarProveedorPreferido(base.db, admin, { productoId: ids.tomate, proveedorId: ids.A });

  const cliente = (nombre: string, extra: Record<string, unknown> = {}) =>
    guardarCliente(base.db, admin, {
      nombre,
      tipoCliente: "OTRO",
      prioridadFaltantes: 3,
      periodicidadFacturacion: "POR_ENTREGA",
      requiereOrdenCompra: false,
      aceptaSustituciones: true,
      requiereFirma: false,
      primerPunto: { nombre: "Local", direccion: `${nombre} 123` },
      ...extra,
    });
  ids.hospital = await cliente("Hospital San Martín", { requiereOrdenCompra: true });
  ids.restaurante = await cliente("Restaurante La Esquina");
  ids.verduleria = await cliente("Verdulería Don Pepe");
  ids.sinPunto = await cliente("Cliente sin dirección", { primerPunto: null });
});

describe("precios de venta: reglas y recargos (05 §5, RN-076 a RN-091)", () => {
  it("recargo del producto y del cliente, auditados", async () => {
    await cambiarRecargo(base.db, admin, { ambito: "PRODUCTO", id: ids.tomate!, valor: "25" });
    await cambiarRecargo(base.db, admin, { ambito: "CLIENTE", id: ids.restaurante!, valor: "35" });
    const registros = await enEmpresa(base.db, empresaId, (tx) => tx.select().from(auditoria).where(eq(auditoria.accion, "CAMBIO_RECARGO")));
    expect(registros.map((r) => r.resumen).sort()).toEqual([
      "Recargo del cliente Restaurante La Esquina: sin recargo → 35,0 %.",
      "Recargo del producto Tomate redondo: sin recargo → 25,0 %.",
    ]);
  });

  it("precio fijo de la licitación del hospital", async () => {
    ids.reglaHospital = await crearRegla(base.db, admin, {
      clienteId: ids.hospital!,
      tipo: "PRECIO_FIJO",
      productoId: ids.tomate!,
      valor: "1.150",
      referencia: "Licitación 2026",
    });
    const { reglas } = await listarReglasCliente(base.db, admin, ids.hospital!);
    expect(reglas).toMatchObject([{ tipo: "PRECIO_FIJO", producto: "Tomate redondo", valor: "1150.0000", estado: "VIGENTE" }]);
    // La pantalla de recargos cuenta las reglas vigentes de cada cliente.
    const { clientes } = await recargosActuales(base.db, admin);
    expect(clientes.map((c) => [c.nombre, c.reglas])).toContainEqual(["Hospital San Martín", 1]);
  });

  it("paso 1 del tomate: hospital $1.150, restaurante $1.220, verdulería $1.130 (05 §10)", async () => {
    const hospital = await precioDe(ids.hospital!);
    const restaurante = await precioDe(ids.restaurante!);
    const verduleria = await precioDe(ids.verduleria!);
    expect([hospital.precioUnitario?.toString(), hospital.nivel, hospital.margenPct?.toString()]).toEqual(["1150", 1, "21.74"]);
    expect([restaurante.precioUnitario?.toString(), restaurante.nivel, restaurante.margenPct?.toString()]).toEqual(["1220", 4, "26.23"]);
    expect([verduleria.precioUnitario?.toString(), verduleria.nivel, verduleria.origenCosto]).toEqual(["1130", 5, "PREFERIDO"]);
  });

  it("un precio nuevo desde una fecha cierra el anterior el día antes; no se superponen (RN-079)", async () => {
    const desde = sumarDias(manana, 10);
    await crearRegla(base.db, admin, { clienteId: ids.hospital!, tipo: "PRECIO_FIJO", productoId: ids.tomate!, valor: "1200", vigenteDesde: desde });
    const { reglas } = await listarReglasCliente(base.db, admin, ids.hospital!);
    expect(reglas.map((r) => [r.valor, r.vigenteHasta, r.estado])).toEqual([
      ["1150.0000", sumarDias(desde, -1), "VIGENTE"],
      ["1200.0000", null, "PROGRAMADA"],
    ]);
    const choca = crearRegla(base.db, admin, { clienteId: ids.hospital!, tipo: "PRECIO_FIJO", productoId: ids.tomate!, valor: "1300", vigenteDesde: manana });
    expect(await mensajeDeError(choca)).toMatch(/RN-079/);
    expect((await precioDe(ids.hospital!)).precioUnitario?.toString()).toBe("1150");
  });

  it("la base también impide la superposición aunque se saltee la validación", async () => {
    const directo = enEmpresa(base.db, empresaId, (tx) =>
      tx.execute(sql`insert into regla_precio (empresa_id, cliente_id, producto_id, tipo, valor, vigente_desde)
                     values (${empresaId}, ${ids.hospital}, ${ids.tomate}, 'PRECIO_FIJO', 1, ${manana})`),
    );
    expect(await codigoDeError(directo)).toMatch(/regla_precio_sin_superposicion_fijo/);
  });

  it("un recargo fuera de 0 % a 300 % pide confirmación (RN-084); quitar una regla la cierra ayer", async () => {
    const raro = { clienteId: ids.verduleria!, tipo: "RECARGO" as const, categoriaId: ids.verduras!, valor: "-10" };
    expect(await mensajeDeError(crearRegla(base.db, admin, raro))).toMatch(/Confirmar/);
    const id = await crearRegla(base.db, admin, { ...raro, confirmar: true });
    expect((await precioDe(ids.verduleria!)).nivel).toBe(3);
    await cerrarRegla(base.db, admin, id);
    const { reglas } = await listarReglasCliente(base.db, admin, ids.verduleria!);
    expect(reglas[0]?.estado).toBe("DESACTIVADA");
    expect((await precioDe(ids.verduleria!)).nivel).toBe(5);
  });

  it("el VENDEDOR ve precios de venta pero no edita reglas ni ve recargos", async () => {
    expect((await listaDePreciosCliente(base.db, vendedor, { clienteId: ids.restaurante!, fecha: manana })).precios.length).toBe(2);
    expect(await codigoDeError(listarReglasCliente(base.db, vendedor, ids.hospital!))).toBe("SIN_PERMISO");
    expect(await codigoDeError(cambiarRecargo(base.db, vendedor, { ambito: "GLOBAL", valor: "40" }))).toBe("SIN_PERMISO");
  });
});

describe("pedidos (04 §5.b, RN-017 a RN-035)", () => {
  it("crea el pedido para mañana y la jornada de esa fecha (RN-035); no para fechas pasadas (RN-031)", async () => {
    const r = await crearPedido(base.db, vendedor, { fecha: manana, clienteId: ids.restaurante!, canal: "WHATSAPP" });
    ids.pedido = r.pedidoId;
    expect(r).toMatchObject({ numero: "PED-000001", duplicadoDe: null });
    const js = await enEmpresa(base.db, empresaId, (tx) => tx.select().from(jornada));
    expect(js.map((j) => [j.fecha, j.estado])).toEqual([[manana, "ABIERTA"]]);

    const ayer = sumarDias(manana, -2);
    expect(await mensajeDeError(crearPedido(base.db, vendedor, { fecha: ayer, clienteId: ids.restaurante! }))).toMatch(/RN-031/);
    expect(await mensajeDeError(crearPedido(base.db, vendedor, { fecha: manana, clienteId: ids.sinPunto! }))).toMatch(/RN-010/);
  });

  it("agrega líneas con precio estimado; el mismo producto se suma en su línea (RN-021)", async () => {
    await agregarLinea(base.db, vendedor, { pedidoId: ids.pedido!, productoId: ids.tomate!, cantidad: "20" });
    const r = await agregarLinea(base.db, vendedor, { pedidoId: ids.pedido!, productoId: ids.tomate!, cantidad: "16", observaciones: "bien maduro" });
    expect(r.sumada).toBe(true);
    await agregarLinea(base.db, vendedor, { pedidoId: ids.pedido!, productoId: ids.lechuga!, cantidad: "20" });

    const p = await obtenerPedido(base.db, vendedor, ids.pedido!);
    expect(p.lineas.map((l) => [l.producto, l.cantidad, l.cantidadBase, l.observaciones])).toEqual([
      ["Tomate redondo", "36.000", "36.000", "bien maduro"],
      ["Lechuga criolla", "20.000", "20.000", null],
    ]);
    expect(p.lineas[0]!.precio).toMatchObject({ precio: "1220.0000", subtotal: "43920.00", origen: "RECARGO_CLIENTE", costo: null });
    expect(p.lineas[1]!.precio).toMatchObject({ precio: null, subtotal: null });
    expect(p.totalEstimado).toBe("43920.00");
  });

  it("valida cantidades: lechuga en unidades enteras (RN-009) y presentaciones de venta (RN-019)", async () => {
    expect(await mensajeDeError(agregarLinea(base.db, vendedor, { pedidoId: ids.pedido!, productoId: ids.lechuga!, cantidad: "2,5" }))).toMatch(/RN-009/);
    const otroProducto = agregarLinea(base.db, vendedor, { pedidoId: ids.pedido!, productoId: ids.lechuga!, presentacionId: ids.cajon!, cantidad: "1" });
    expect(await mensajeDeError(otroProducto)).toMatch(/RN-019/);
  });

  it("por cajón de 18 kg va en otra línea, con el precio redondeado por cajón (RN-082)", async () => {
    await agregarLinea(base.db, vendedor, { pedidoId: ids.pedido!, productoId: ids.tomate!, presentacionId: ids.cajon!, cantidad: "1" });
    const linea = (await obtenerPedido(base.db, vendedor, ids.pedido!)).lineas[2]!;
    // 900 × 1,35 × 18 = 21.870 → 21.870 el cajón (ya múltiplo de 10) → 1.215/kg
    expect([linea.presentacion, linea.cantidadBase, linea.precio?.precio, linea.precio?.subtotal]).toEqual(["Cajón 18 kg", "18.000", "1215.0000", "21870.00"]);
  });

  it("en BORRADOR las líneas se borran; confirmar exige al menos una (RN-018)", async () => {
    const vacio = await crearPedido(base.db, vendedor, { fecha: manana, clienteId: ids.verduleria! });
    expect(await mensajeDeError(confirmarPedido(base.db, vendedor, vacio.pedidoId))).toMatch(/RN-018/);
    await agregarLinea(base.db, vendedor, { pedidoId: vacio.pedidoId, productoId: ids.tomate!, cantidad: "54" });
    const [item] = (await obtenerPedido(base.db, vendedor, vacio.pedidoId)).lineas;
    await quitarLinea(base.db, vendedor, { itemId: item!.id });
    expect((await obtenerPedido(base.db, vendedor, vacio.pedidoId)).lineas).toEqual([]);
    await cancelarPedido(base.db, vendedor, { pedidoId: vacio.pedidoId });
  });

  it("el hospital trabaja con orden de compra: sin número no se confirma (RN-017)", async () => {
    const r = await crearPedido(base.db, vendedor, { fecha: manana, clienteId: ids.hospital! });
    await agregarLinea(base.db, vendedor, { pedidoId: r.pedidoId, productoId: ids.tomate!, cantidad: "180" });
    expect(await mensajeDeError(confirmarPedido(base.db, vendedor, r.pedidoId))).toMatch(/orden de compra/);
    await cambiarDatosPedido(base.db, vendedor, { pedidoId: r.pedidoId, referenciaCliente: "OC 4512" });
    await confirmarPedido(base.db, vendedor, r.pedidoId);
    const p = await obtenerPedido(base.db, vendedor, r.pedidoId);
    expect([p.estado, p.lineas[0]!.precio?.precio, p.totalEstimado]).toEqual(["CONFIRMADO", "1150.0000", "207000.00"]);
    ids.pedidoHospital = r.pedidoId;
  });

  it("confirmado: la línea ya no se borra, se cancela con motivo (también en la base)", async () => {
    await confirmarPedido(base.db, vendedor, ids.pedido!);
    const [tomate] = (await obtenerPedido(base.db, vendedor, ids.pedido!)).lineas;
    const borrar = enEmpresa(base.db, empresaId, (tx) => tx.delete(pedidoItem).where(eq(pedidoItem.id, tomate!.id)));
    expect(await codigoDeError(borrar)).toMatch(/Solo se borran líneas de pedidos en BORRADOR/);
    expect(await mensajeDeError(quitarLinea(base.db, vendedor, { itemId: tomate!.id }))).toMatch(/por qué/);
    await cambiarLinea(base.db, vendedor, { itemId: tomate!.id, cantidad: "40", observaciones: "bien maduro" });
    expect((await obtenerPedido(base.db, vendedor, ids.pedido!)).lineas[0]!.precio?.subtotal).toBe("48800.00");
  });

  it("avisa si el cliente ya tiene pedido para ese día (RN-022)", async () => {
    const r = await crearPedido(base.db, vendedor, { fecha: manana, clienteId: ids.restaurante! });
    expect(r.duplicadoDe).toBe("PED-000001");
    expect((await obtenerPedido(base.db, vendedor, r.pedidoId)).otrosDelMismoDia.map((o) => o.numero)).toEqual(["PED-000001"]);
    await cancelarPedido(base.db, vendedor, { pedidoId: r.pedidoId });
  });

  it("un cambio de precio de compra recalcula los pedidos pendientes (RN-088)", async () => {
    await actualizarPrecioOferta(base.db, admin, { ofertaId: ids.ofertaA!, precio: "18.000" }); // $1.000/kg
    const p = await obtenerPedido(base.db, vendedor, ids.pedido!);
    expect(p.lineas[0]!.precio?.precio).toBe("1350.0000"); // 1.000 × 1,35
    expect((await obtenerPedido(base.db, vendedor, ids.pedidoHospital!)).lineas[0]!.precio?.precio).toBe("1150.0000"); // precio fijo
  });

  it("precio manual con motivo: los recálculos lo respetan (RN-090); el VENDEDOR no puede", async () => {
    const [tomate] = (await obtenerPedido(base.db, admin, ids.pedido!)).lineas;
    expect(await codigoDeError(fijarPrecioManual(base.db, vendedor, { itemId: tomate!.id, precio: "1000", motivo: "Promo" }))).toBe("SIN_PERMISO");
    expect(await mensajeDeError(fijarPrecioManual(base.db, admin, { itemId: tomate!.id, precio: "1000" }))).toMatch(/por qué/);
    await fijarPrecioManual(base.db, admin, { itemId: tomate!.id, precio: "1.300", motivo: "Precio acordado por teléfono" });
    await actualizarPrecioOferta(base.db, admin, { ofertaId: ids.ofertaA!, precio: "16.200" });
    const linea = (await obtenerPedido(base.db, admin, ids.pedido!)).lineas[0]!;
    expect(linea.precio).toMatchObject({ precio: "1300.0000", origen: "MANUAL", manual: true });
    const [registro] = await enEmpresa(base.db, empresaId, (tx) =>
      tx.select().from(auditoria).where(and(eq(auditoria.accion, "OVERRIDE_PRECIO"), eq(auditoria.entidadId, tomate!.id))),
    );
    expect(registro?.motivo).toBe("Precio acordado por teléfono");
  });

  it("cancelar un pedido confirmado pide motivo (RN-028); duplicar crea un borrador con precios nuevos (RN-033)", async () => {
    const copia = await duplicarPedido(base.db, vendedor, { pedidoId: ids.pedido!, fecha: sumarDias(manana, 1) });
    const p = await obtenerPedido(base.db, vendedor, copia.pedidoId);
    expect([p.estado, p.fecha, p.lineas.length, p.lineas[0]!.precio?.origen]).toEqual(["BORRADOR", sumarDias(manana, 1), 3, "RECARGO_CLIENTE"]);

    expect(await mensajeDeError(cancelarPedido(base.db, vendedor, { pedidoId: ids.pedidoHospital! }))).toMatch(/por qué/);
    await cancelarPedido(base.db, vendedor, { pedidoId: ids.pedidoHospital!, motivo: "El hospital suspendió la entrega" });
    expect((await obtenerPedido(base.db, vendedor, ids.pedidoHospital!)).estado).toBe("CANCELADO");
    expect(await mensajeDeError(confirmarPedido(base.db, vendedor, ids.pedidoHospital!))).toMatch(/no se puede cambiar/);
  });

  it("lista los pedidos de la jornada y las jornadas con sus totales", async () => {
    const { pedidos } = await listarPedidos(base.db, vendedor, { fecha: manana });
    expect(pedidos.map((p) => [p.numero, p.cliente, p.estado])).toEqual([
      ["PED-000001", "Restaurante La Esquina", "CONFIRMADO"],
      ["PED-000003", "Hospital San Martín", "CANCELADO"],
      ["PED-000004", "Restaurante La Esquina", "CANCELADO"],
      ["PED-000002", "Verdulería Don Pepe", "CANCELADO"],
    ]);
    const { jornadas } = await listarJornadas(base.db, vendedor);
    expect(jornadas.map((j) => [j.fecha, j.confirmados, j.borradores])).toEqual([
      [manana, 1, 0],
      [sumarDias(manana, 1), 0, 1],
    ]);
  });

  it("el PREPARADOR no ve pedidos con precios ni los carga", async () => {
    const preparador = await crearUsuarioDePrueba(base.db, empresaId, "Marta", ["PREPARADOR"]);
    expect(await codigoDeError(listarPedidos(base.db, preparador, { fecha: manana }))).toBe("SIN_PERMISO");
    expect(await codigoDeError(crearPedido(base.db, preparador, { fecha: manana, clienteId: ids.restaurante! }))).toBe("SIN_PERMISO");
  });
});
