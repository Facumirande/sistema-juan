import { beforeAll, describe, expect, it } from "vitest";

import { dec, sumar } from "@/dominio/dinero/decimal";
import { hoyEnEmpresa } from "@/dominio/fechas/fechas";
import { anularCobro, cuentaDeCliente, guardarSaldoInicialDeCliente, listarCuentasClientes, registrarCobro } from "@/modulos/cuentas-clientes/cuentas";
import { entregarPedido } from "@/modulos/entregas/entregas";
import { iniciarPreparacion } from "@/modulos/entregas/preparacion";
import { mandarEnCamino } from "@/modulos/entregas/repartos";
import { RUBROS_PREDEFINIDOS, anularMovimientoExtra, cambiarEstadoDeRubro, gastosEIngresos, guardarRubro, registrarMovimientoExtra } from "@/modulos/gastos/gastos";
import { balance } from "@/modulos/reportes/balance";
import { libroDelMes } from "@/modulos/reportes/balance-mensual";

import { codigoDeError, crearEmpresaDePrueba, crearUsuarioDePrueba } from "./base-de-prueba";
import { prepararJornada2409, type Jornada2409 } from "./escenario-24-09";

// La plata que no pasa por las compras (07/10/2026): lo que pagan los clientes ("A cobrar"), los
// gastos e ingresos generales y el balance del dinero real, el pendiente y el total.

let j: Jornada2409;
let hoy: string;
const cuenta = async (clienteId: string) => cuentaDeCliente(j.base.db, j.admin, clienteId);
const aCobrarDe = async (clienteId: string) => (await cuenta(clienteId)).aCobrar;

beforeAll(async () => {
  j = await prepararJornada2409();
  hoy = hoyEnEmpresa(new Date(), "America/Argentina/Buenos_Aires");
  // Se prepara todo el día y se entregan el restaurante y la verdulería; el hospital queda sin entregar.
  await iniciarPreparacion(j.base.db, j.admin, j.manana);
  await mandarEnCamino(j.base.db, j.admin, { pedidoIds: [j.ids.pedRestaurante!, j.ids.pedVerduleria!], confirmar: true });
  await entregarPedido(j.base.db, j.admin, j.ids.pedRestaurante!);
  await entregarPedido(j.base.db, j.admin, j.ids.pedVerduleria!);
});

describe("a cobrar: la cuenta de cada cliente", () => {
  it("lo entregado es lo que debe cada cliente; lo que no se entregó todavía no se debe", async () => {
    const { cuentas, total } = await listarCuentasClientes(j.base.db, j.admin);
    expect(cuentas.map((c) => [c.cliente, c.aCobrar, c.entregasSinCobrar, c.desde])).toEqual([
      ["Verdulería Don Pepe", "227410.00", 1, j.manana],
      ["Restaurante La Esquina", "114400.00", 1, j.manana],
    ]);
    expect(total).toEqual({ aCobrar: "341810.00", aFavor: "0.00", clientes: 2 });
  });

  it("“pagó todo” es un toque: cobra lo que debe, y un segundo toque no cobra dos veces", async () => {
    const r = await registrarCobro(j.base.db, j.admin, { clienteId: j.ids.restaurante!, medioPago: "EFECTIVO" });
    expect([r.cliente, r.monto, r.aCobrar, r.numero]).toEqual(["Restaurante La Esquina", "114400.00", "0.00", "COB-000001"]);
    expect(await aCobrarDe(j.ids.restaurante!)).toBe("0.00");
    await expect(registrarCobro(j.base.db, j.admin, { clienteId: j.ids.restaurante!, medioPago: "EFECTIVO" })).rejects.toThrow(/no debe nada/);
    const c = await cuenta(j.ids.restaurante!);
    expect(c.entregas.map((e) => [e.estado, e.cobrado, e.pendiente])).toEqual([["COBRADA", "114400.00", "0.00"]]);
    expect(c.cobros.map((k) => [k.numero, k.monto, k.medioPago, k.anulado])).toEqual([["COB-000001", "114400.00", "EFECTIVO", false]]);
  });

  it("un pago parcial cancela lo más viejo: primero lo que debía de antes, después la entrega", async () => {
    await registrarCobro(j.base.db, j.admin, { clienteId: j.ids.verduleria!, monto: "100.000", medioPago: "TRANSFERENCIA", observaciones: "pagó una parte" });
    let c = await cuenta(j.ids.verduleria!);
    expect([c.aCobrar, c.entregas[0]!.estado, c.entregas[0]!.pendiente]).toEqual(["127410.00", "PARCIAL", "127410.00"]);

    await guardarSaldoInicialDeCliente(j.base.db, j.admin, { clienteId: j.ids.verduleria!, monto: "50.000" });
    c = await cuenta(j.ids.verduleria!);
    // Los $100.000 ahora cubren los $50.000 de antes y $50.000 de la entrega.
    expect([c.saldoInicial, c.saldoInicialPendiente, c.aCobrar, c.entregas[0]!.pendiente]).toEqual(["50000.00", "0.00", "177410.00", "177410.00"]);
  });

  it("“cobrada” en una entrega cobra lo que le falta a esa entrega", async () => {
    const entrega = (await cuenta(j.ids.verduleria!)).entregas[0]!;
    const r = await registrarCobro(j.base.db, j.admin, { clienteId: j.ids.verduleria!, entregaId: entrega.id, medioPago: "EFECTIVO" });
    expect([r.monto, r.aCobrar]).toEqual(["177410.00", "0.00"]);
    await expect(registrarCobro(j.base.db, j.admin, { clienteId: j.ids.verduleria!, entregaId: entrega.id })).rejects.toThrow(/ya figura cobrada/);
    // Una entrega de otro cliente no se cobra en esta cuenta.
    await expect(registrarCobro(j.base.db, j.admin, { clienteId: j.ids.restaurante!, entregaId: entrega.id })).rejects.toThrow(/no es de Restaurante La Esquina/);
  });

  it("un cobro se anula con motivo y lo que cancelaba vuelve a quedar por cobrar", async () => {
    const c = await cuenta(j.ids.verduleria!);
    const ultimo = c.cobros[0]!;
    await expect(anularCobro(j.base.db, j.admin, { cobroId: ultimo.id, motivo: " " })).rejects.toThrow(/por qué se anula/);
    await anularCobro(j.base.db, j.admin, { cobroId: ultimo.id, motivo: "se anotó dos veces" });
    await expect(anularCobro(j.base.db, j.admin, { cobroId: ultimo.id, motivo: "otra vez" })).rejects.toThrow(/ya estaba anulado/);
    const despues = await cuenta(j.ids.verduleria!);
    expect(despues.aCobrar).toBe("177410.00");
    expect(despues.cobros.map((k) => [k.anulado, k.motivoAnulacion])).toEqual([
      [true, "se anotó dos veces"],
      [false, null],
    ]);
  });

  it("se puede cobrar de más (queda a favor), pero no importes inválidos ni fechas futuras", async () => {
    await expect(registrarCobro(j.base.db, j.admin, { clienteId: j.ids.restaurante!, monto: "0" })).rejects.toThrow(/mayor que \$0/);
    await expect(registrarCobro(j.base.db, j.admin, { clienteId: j.ids.restaurante!, monto: "abc" })).rejects.toThrow(/cuánto cobraste/);
    await expect(registrarCobro(j.base.db, j.admin, { clienteId: j.ids.restaurante!, monto: "100", fecha: "2999-01-01" })).rejects.toThrow(/posterior a hoy/);
    await registrarCobro(j.base.db, j.admin, { clienteId: j.ids.restaurante!, monto: "600", observaciones: "adelanto" });
    const { cuentas } = await listarCuentasClientes(j.base.db, j.admin);
    expect(cuentas.find((c) => c.cliente === "Restaurante La Esquina")).toMatchObject({ aCobrar: "0.00", aFavor: "600.00" });
  });

  it("otra empresa no ve estas cuentas, y sin permiso no se entra", async () => {
    const otra = await crearEmpresaDePrueba(j.base.db, "Otra Plata");
    expect((await listarCuentasClientes(j.base.db, otra.authUserIdAdmin)).cuentas).toEqual([]);
    expect(await codigoDeError(registrarCobro(j.base.db, otra.authUserIdAdmin, { clienteId: j.ids.restaurante!, monto: "10" }))).toBe("NO_ENCONTRADO");
    expect(await codigoDeError(cuentaDeCliente(j.base.db, otra.authUserIdAdmin, j.ids.restaurante!))).toBe("NO_ENCONTRADO");
    const preparador = await crearUsuarioDePrueba(j.base.db, j.empresaId, "Prepara", ["PREPARADOR"]);
    expect(await codigoDeError(listarCuentasClientes(j.base.db, preparador))).toBe("SIN_PERMISO");
    expect(await codigoDeError(gastosEIngresos(j.base.db, preparador, { desde: hoy, hasta: hoy }))).toBe("SIN_PERMISO");
  });
});

describe("gastos e ingresos generales", () => {
  const periodo = () => ({ desde: hoy, hasta: hoy });

  it("la primera vez quedan creados los rubros predefinidos, con la nafta contada en litros", async () => {
    const g = await gastosEIngresos(j.base.db, j.admin, periodo());
    expect(g.rubros.map((r) => r.nombre)).toEqual(RUBROS_PREDEFINIDOS.map((r) => r.nombre));
    expect(g.rubros[0]).toMatchObject({ nombre: "Nafta", dibujo: "⛽", tipo: "GASTO", unidad: "litros", activo: true });
    expect([g.movimientos, g.totales]).toEqual([[], { gastos: "0.00", ingresos: "0.00" }]);
    // No se vuelven a crear.
    expect((await gastosEIngresos(j.base.db, j.admin, periodo())).rubros).toHaveLength(RUBROS_PREDEFINIDOS.length);
  });

  it("se anota un gasto con su cantidad y un ingreso, y se suman por rubro", async () => {
    const { rubros } = await gastosEIngresos(j.base.db, j.admin, periodo());
    const nafta = rubros.find((r) => r.nombre === "Nafta")!;
    const peajes = rubros.find((r) => r.nombre === "Peajes y estacionamiento")!;
    const otros = rubros.find((r) => r.nombre === "Otros ingresos")!;
    await registrarMovimientoExtra(j.base.db, j.admin, { rubroId: nafta.id, monto: "35.000", cantidad: "40", detalle: "tanque lleno", medioPago: "EFECTIVO" });
    await registrarMovimientoExtra(j.base.db, j.admin, { rubroId: nafta.id, monto: "15.000", cantidad: "17,5" });
    // Un rubro que no se cuenta en nada no guarda cantidad.
    await registrarMovimientoExtra(j.base.db, j.admin, { rubroId: peajes.id, monto: "2.400", cantidad: "3" });
    await registrarMovimientoExtra(j.base.db, j.admin, { rubroId: otros.id, monto: "5.000", medioPago: "TRANSFERENCIA" });
    const g = await gastosEIngresos(j.base.db, j.admin, periodo());
    expect(g.totales).toEqual({ gastos: "52400.00", ingresos: "5000.00" });
    expect(g.porRubro.map((r) => [r.rubro, r.tipo, r.total, r.cantidad, r.unidad, r.veces])).toEqual([
      ["Nafta", "GASTO", "50000.00", "57.5", "litros", 2],
      ["Otros ingresos", "INGRESO", "5000.00", null, null, 1],
      ["Peajes y estacionamiento", "GASTO", "2400.00", null, null, 1],
    ]);
    expect(g.movimientos).toHaveLength(4);
    expect(g.movimientos.find((m) => m.detalle === "tanque lleno")).toMatchObject({ rubro: "Nafta", dibujo: "⛽", monto: "35000.00", cantidad: "40", unidad: "litros", medioPago: "EFECTIVO", anulado: false });
  });

  it("lo que no vale no se anota", async () => {
    const { rubros } = await gastosEIngresos(j.base.db, j.admin, periodo());
    const nafta = rubros.find((r) => r.nombre === "Nafta")!;
    await expect(registrarMovimientoExtra(j.base.db, j.admin, { rubroId: nafta.id, monto: "" })).rejects.toThrow(/cuánto fue/);
    await expect(registrarMovimientoExtra(j.base.db, j.admin, { rubroId: nafta.id, monto: "0" })).rejects.toThrow(/mayor que \$0/);
    await expect(registrarMovimientoExtra(j.base.db, j.admin, { rubroId: nafta.id, monto: "10", cantidad: "-1" })).rejects.toThrow(/mayor que 0/);
    await expect(registrarMovimientoExtra(j.base.db, j.admin, { rubroId: nafta.id, monto: "10", fecha: "2999-01-01" })).rejects.toThrow(/posterior a hoy/);
  });

  it("un gasto se anula con motivo y deja de contar", async () => {
    const antes = await gastosEIngresos(j.base.db, j.admin, periodo());
    const peaje = antes.movimientos.find((m) => m.rubro === "Peajes y estacionamiento")!;
    await expect(anularMovimientoExtra(j.base.db, j.admin, { movimientoId: peaje.id, motivo: "x" })).rejects.toThrow(/por qué se anula/);
    await anularMovimientoExtra(j.base.db, j.admin, { movimientoId: peaje.id, motivo: "se anotó dos veces" });
    await expect(anularMovimientoExtra(j.base.db, j.admin, { movimientoId: peaje.id, motivo: "otra vez" })).rejects.toThrow(/ya estaba anulada/);
    const g = await gastosEIngresos(j.base.db, j.admin, periodo());
    expect(g.totales.gastos).toBe("50000.00");
    expect(g.movimientos.find((m) => m.id === peaje.id)).toMatchObject({ anulado: true, motivoAnulacion: "se anotó dos veces" });
  });

  it("los rubros se crean libremente con su dibujo y su título, se cambian y se dan de baja", async () => {
    const id = await guardarRubro(j.base.db, j.admin, { nombre: "Lavado del camión", dibujo: "🧽", tipo: "GASTO", unidad: "" });
    await expect(guardarRubro(j.base.db, j.admin, { nombre: "lavado del camión", dibujo: "🚿", tipo: "GASTO" })).rejects.toThrow(/Ya hay un rubro/);
    await expect(guardarRubro(j.base.db, j.admin, { nombre: " ", tipo: "GASTO" })).rejects.toThrow(/nombre del rubro/);
    await guardarRubro(j.base.db, j.admin, { rubroId: id, nombre: "Lavado", dibujo: "🚿", tipo: "GASTO", unidad: "veces" });
    let rubros = (await gastosEIngresos(j.base.db, j.admin, periodo())).rubros;
    expect(rubros.find((r) => r.id === id)).toMatchObject({ nombre: "Lavado", dibujo: "🚿", unidad: "veces", activo: true });

    await cambiarEstadoDeRubro(j.base.db, j.admin, { rubroId: id, activo: false });
    await expect(registrarMovimientoExtra(j.base.db, j.admin, { rubroId: id, monto: "100" })).rejects.toThrow(/dado de baja/);
    await expect(guardarRubro(j.base.db, j.admin, { nombre: "Lavado", tipo: "GASTO" })).rejects.toThrow(/dado de baja/);
    await cambiarEstadoDeRubro(j.base.db, j.admin, { rubroId: id, activo: true });
    await registrarMovimientoExtra(j.base.db, j.admin, { rubroId: id, monto: "8.000", cantidad: "1" });
    rubros = (await gastosEIngresos(j.base.db, j.admin, periodo())).rubros;
    expect(rubros.at(-1)).toMatchObject({ nombre: "Lavado", activo: true });
  });
});

describe("el balance del dinero: real, pendiente y total", () => {
  it("lo real es lo que entró y salió; lo pendiente, lo que falta cobrar y pagar; el total, la suma", async () => {
    const b = await balance(j.base.db, j.admin, { desde: hoy, hasta: j.manana, agrupacion: "DIA" });
    const d = b.dinero!;
    // Cobros vigentes: $114.400 + $100.000 + $600 (el de $177.410 se anuló).
    expect(d.cobrado).toBe("215000.00");
    expect([d.ingresos, d.gastos]).toEqual(["5000.00", "58000.00"]);
    expect(d.pagado).toBe(b.totales.pagado);
    expect(d.entro).toBe(dec(d.cobrado).plus(d.ingresos).toFixed(2));
    expect(d.salio).toBe(dec(d.pagado).plus(d.gastos).toFixed(2));
    expect(d.real).toBe(dec(d.entro).minus(d.salio).toFixed(2));
    // A cobrar: lo de la verdulería ($227.410 + $50.000 de antes − $100.000).
    expect(d.aCobrar).toBe("177410.00");
    expect(d.aPagar).toBe(b.totales.deuda);
    expect(d.pendiente).toBe(dec(d.aCobrar).minus(d.aPagar).toFixed(2));
    expect(d.total).toBe(dec(d.real).plus(d.pendiente).toFixed(2));
    expect(b.aCobrarPorCliente).toEqual([{ clienteId: j.ids.verduleria, cliente: "Verdulería Don Pepe", saldo: "177410.00", desde: j.manana }]);
    expect(sumar(b.aPagarPorProveedor.map((p) => p.saldo)).gte(d.aPagar)).toBe(true);
    // Lo que entró y salió cada día suma lo mismo que el total.
    expect(sumar(b.series.map((s) => s.valores.entro)).toFixed(2)).toBe(d.entro);
    expect(sumar(b.series.map((s) => s.valores.salio)).toFixed(2)).toBe(d.salio);
  });

  it("las compras son lo pagado más lo que quedó a pagar; las ventas, lo cobrado más lo que falta cobrar", async () => {
    const b = await balance(j.base.db, j.admin, { desde: hoy, hasta: j.manana, agrupacion: "DIA" });
    const k = b.compras!;
    expect(k.total).toBe(b.totales.comprado);
    expect(dec(k.pagado).plus(k.aPagar).toFixed(2)).toBe(k.total);
    expect(k.pctPagado + k.pctAPagar).toBe(100);
    expect(sumar(k.porProveedor.map((p) => p.total)).toFixed(2)).toBe(k.total);
    for (const p of k.porProveedor) expect(dec(p.pagado).plus(p.aPagar).toFixed(2)).toBe(p.total);

    const v = b.ventas!;
    expect(v.total).toBe(b.totales.vendido);
    expect([v.total, v.cobrado, v.aCobrar]).toEqual(["341810.00", "164400.00", "177410.00"]);
    expect(v.porCliente.map((c) => [c.cliente, c.total, c.cobrado, c.aCobrar])).toEqual([
      ["Verdulería Don Pepe", "227410.00", "50000.00", "177410.00"],
      ["Restaurante La Esquina", "114400.00", "114400.00", "0.00"],
    ]);
    expect(b.gastosPorRubro.map((r) => [r.rubro, r.total])).toEqual([
      ["Nafta", "50000.00"],
      ["Lavado", "8000.00"],
      ["Otros ingresos", "5000.00"],
    ]);
  });

  it("quien no ve las cuentas no ve el balance del dinero", async () => {
    const vendedor = await crearUsuarioDePrueba(j.base.db, j.empresaId, "Vende", ["VENDEDOR"]);
    expect(await codigoDeError(balance(j.base.db, vendedor, { desde: hoy, hasta: j.manana, agrupacion: "DIA" }))).toBe("SIN_PERMISO");
    const administrativo = await crearUsuarioDePrueba(j.base.db, j.empresaId, "Administra", ["ADMINISTRATIVO"]);
    const b = await balance(j.base.db, administrativo, { desde: hoy, hasta: j.manana, agrupacion: "DIA" });
    expect(b.dinero === null || b.ver.dinero).toBe(true);
  });

  it("el Excel del mes trae el dinero, lo que falta cobrar y pagar y los gastos por rubro", async () => {
    const libro = await libroDelMes(j.base.db, j.admin, hoy.slice(0, 7), hoy);
    const resumen = Object.fromEntries(libro.hojas[0]!.filas.map((f) => [f[0], f[1]]));
    expect(resumen["DINERO REAL · salió: gastos generales"]).toEqual({ numero: "58000" });
    expect(resumen["DINERO PENDIENTE · a cobrar a los clientes (hoy)"]).toEqual({ numero: "177410" });
    expect(Object.keys(resumen)).toContain("BALANCE TOTAL (real + pendiente)");
    const hoja = (nombre: string) => libro.hojas.find((h) => h.nombre === nombre)!;
    expect(hoja("A cobrar").filas).toEqual([["Verdulería Don Pepe", { numero: "177410" }, expect.any(String)]]);
    expect(hoja("Gastos e ingresos").filas.map((f) => [f[0], f[1], f[2]])).toEqual([
      ["⛽ Nafta", { numero: "50000" }, "Gasto"],
      ["🚿 Lavado", { numero: "8000" }, "Gasto"],
      ["💵 Otros ingresos", { numero: "5000" }, "Ingreso"],
    ]);
  });
});
