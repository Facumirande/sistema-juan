import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { compra } from "@/db/esquema";
import { enEmpresa } from "@/db/transaccion";
import { sumar } from "@/dominio/dinero/decimal";
import { hoyEnEmpresa, sumarDias } from "@/dominio/fechas/fechas";
import { guardarCategoria } from "@/modulos/catalogo/categorias";
import { crearProducto, obtenerProducto } from "@/modulos/catalogo/productos";
import { anularCompra, obtenerCompra, registrarCompra } from "@/modulos/compras/compras";
import { saldoNeto } from "@/modulos/compras/cuenta";
import { cuentaCorriente, listarCuentasProveedores } from "@/modulos/compras/cuenta-corriente";
import { partidasAcreedoras, partidasDeudoras } from "@/modulos/compras/imputaciones";
import { anularPago, obtenerPago, registrarAjuste, registrarPago, reimputarPago } from "@/modulos/compras/pagos";
import { guardarProveedor } from "@/modulos/proveedores/proveedores";

import { crearBaseDePrueba, crearEmpresaDePrueba, crearUsuarioDePrueba, type BaseDePrueba } from "./base-de-prueba";

// Ejemplo numérico completo de 06 §12 (Hnos. García: límite $500.000, plazo 7 días) y los casos
// de pagos, reimputación, ajustes y anulaciones de 06 §4 a §6.

let base: BaseDePrueba;
let empresaId: string;
let admin: string;
let administrativo: string;
let hoy: string;
let manana: string;
let garcia: string;
let producto: string;
let bulto: string;
const compras: Record<string, string> = {};
const pagos: Record<string, string> = {};

/** Compra de "Varios" a $1.000 el bulto: el total es la cantidad × 1.000. */
const comprar = (proveedorId: string, condicion: "CONTADO" | "CREDITO" | "MIXTA", total: number, extra: Record<string, unknown> = {}) =>
  registrarCompra(base.db, admin, {
    fecha: manana,
    proveedorId,
    condicion,
    items: [{ productoId: producto, presentacionId: bulto, cantidad: String(total / 1000), precio: "1000" }],
    ...extra,
  });

const pagar = (proveedorId: string, monto: string, extra: Record<string, unknown> = {}) =>
  registrarPago(base.db, administrativo, { proveedorId, fecha: hoy, monto, medio: "TRANSFERENCIA", ...extra });

async function estado(compraId: string) {
  const c = await obtenerCompra(base.db, admin, compraId);
  return [c.estadoPago ?? c.estado, c.pagado];
}

async function saldo(proveedorId = garcia) {
  return enEmpresa(base.db, empresaId, (tx) => saldoNeto(tx, proveedorId));
}

/** Invariante de 06 §2.2: saldo neto = Σ pendiente de las deudas − Σ no imputado de los créditos. */
async function invariante(proveedorId = garcia) {
  const [neto, deudoras, acreedoras] = await enEmpresa(base.db, empresaId, async (tx) => [
    await saldoNeto(tx, proveedorId),
    await partidasDeudoras(tx, proveedorId),
    await partidasAcreedoras(tx, proveedorId),
  ] as const);
  expect(sumar(deudoras.map((d) => d.pendiente)).minus(sumar(acreedoras.map((a) => a.libre))).toString()).toBe(sumar([neto]).toString());
}

const imputaciones = async (pagoId: string) =>
  (await obtenerPago(base.db, admin, pagoId)).imputaciones.filter((i) => i.activa).map((i) => [i.deuda, i.monto]);

beforeAll(async () => {
  base = await crearBaseDePrueba();
  const e = await crearEmpresaDePrueba(base.db, "Frutas Juan");
  empresaId = e.empresaId;
  admin = e.authUserIdAdmin;
  administrativo = await crearUsuarioDePrueba(base.db, empresaId, "Laura", ["ADMINISTRATIVO"]);
  hoy = hoyEnEmpresa(new Date(), "America/Argentina/Buenos_Aires");
  manana = sumarDias(hoy, 1);
  const categoria = await guardarCategoria(base.db, admin, { nombre: "Verduras", grupo: "VERDURA", orden: "1" });
  producto = await crearProducto(base.db, admin, {
    codigo: "VAR",
    nombre: "Varios",
    categoriaId: categoria,
    unidadBase: "UNIDAD",
    admiteFraccion: false,
    presentacionCompraNombre: "Bulto",
    presentacionCompraFactor: "1",
  });
  bulto = (await obtenerProducto(base.db, admin, producto)).presentaciones.find((p) => p.nombre === "Bulto")!.id;
  garcia = await guardarProveedor(base.db, admin, { nombre: "Hnos. García", condicionPagoHabitual: "CREDITO", limiteCredito: "500000", plazoPagoDias: "7" });
});

describe("cuenta corriente de Hnos. García, paso a paso (06 §12)", () => {
  it("1 a 4: contado, crédito y mixta; el saldo y el semáforo siguen al libro", async () => {
    compras[101] = (await comprar(garcia, "CONTADO", 120000)).compraId;
    expect([await saldo(), ...(await estado(compras[101]!))]).toEqual(["0.00", "PAGADA", "120000.00"]);
    compras[102] = (await comprar(garcia, "CREDITO", 180000)).compraId;
    expect(await saldo()).toBe("180000.00");
    const r3 = await comprar(garcia, "MIXTA", 150000, { pagadoEnElActo: "50000", medioPago: "EFECTIVO" });
    compras[110] = r3.compraId;
    expect([r3.credito.saldoNeto.toString(), r3.credito.semaforo]).toEqual(["280000", "VERDE"]);
    const r4 = await comprar(garcia, "CREDITO", 110000);
    compras[118] = r4.compraId;
    expect([r4.credito.saldoNeto.toString(), r4.credito.usoPct?.toString(), r4.credito.semaforo]).toEqual(["390000", "78", "AMARILLO"]);
    await invariante();
  });

  it("5: un pago de $200.000 cancela por FIFO la más vieja y parte de la siguiente", async () => {
    const r = await pagar(garcia, "200000");
    pagos[31] = r.pagoId;
    expect([r.credito.saldoNeto.toString(), r.credito.semaforo]).toEqual(["190000", "VERDE"]);
    expect(await imputaciones(r.pagoId)).toEqual([
      [(await obtenerCompra(base.db, admin, compras[102]!)).numero, "180000.00"],
      [(await obtenerCompra(base.db, admin, compras[110]!)).numero, "20000.00"],
    ]);
    expect(await estado(compras[102]!)).toEqual(["PAGADA", "180000.00"]);
    expect(await estado(compras[110]!)).toEqual(["PARCIAL", "70000.00"]);
    await invariante();
  });

  it("6 a 8: ROJO con aviso, EXCEDIDO solo con permiso y motivo, y la anulación lo devuelve a ROJO", async () => {
    const r6 = await comprar(garcia, "CREDITO", 280000);
    compras[125] = r6.compraId;
    expect([r6.credito.usoPct?.toString(), r6.credito.semaforo, r6.advertencia]).toEqual(["94", "ROJO", "Hnos. García queda en 94,0 % de su límite."]);
    await expect(comprar(garcia, "CREDITO", 60000)).rejects.toThrow(/Supera el límite/);
    const r7 = await comprar(garcia, "CREDITO", 60000, { motivoExceso: "Único puesto con tomate perita" });
    compras[130] = r7.compraId;
    expect([r7.credito.usoPct?.toString(), r7.credito.semaforo]).toEqual(["106", "EXCEDIDO"]);
    await anularCompra(base.db, admin, { compraId: compras[130]!, motivo: "No entregó la mercadería" });
    expect(await saldo()).toBe("470000.00");
    await invariante();
  });

  it("9 y 10: $300.000 en efectivo cancelan tres compras; la que queda vence y se avisa", async () => {
    pagos[35] = (await pagar(garcia, "300000", { medio: "EFECTIVO" })).pagoId;
    expect(await saldo()).toBe("170000.00");
    expect(await estado(compras[110]!)).toEqual(["PAGADA", "150000.00"]);
    expect(await estado(compras[118]!)).toEqual(["PAGADA", "110000.00"]);
    expect(await estado(compras[125]!)).toEqual(["PARCIAL", "110000.00"]);
    await invariante();

    // Simula que pasó el plazo: COM-000125 venció ayer.
    await base.comoSuperusuario(() => base.db.update(compra).set({ fechaVencimiento: sumarDias(hoy, -1) }).where(eq(compra.id, compras[125]!)));
    const { cuentas } = await listarCuentasProveedores(base.db, admin);
    const g = cuentas.find((c) => c.proveedorId === garcia)!;
    expect([g.indicadores.semaforo, g.vencimientos.vencida, g.vencimientos.maxDiasAtraso]).toEqual(["VERDE", "170000.00", 1]);
    expect(g.ultimoPago?.monto).toBe("300000.00");
  });

  it("11 y 12: un pago de más queda a favor y se aplica solo a la compra siguiente (RN-098)", async () => {
    const r = await pagar(garcia, "200000");
    pagos[40] = r.pagoId;
    expect([r.credito.saldoNeto.toString(), r.credito.saldoAFavor.toString(), r.credito.disponible?.toString()]).toEqual(["-30000", "30000", "530000"]);
    expect((await obtenerPago(base.db, admin, r.pagoId)).aFavor).toBe("30000.00");
    const r12 = await comprar(garcia, "CREDITO", 45000);
    compras[140] = r12.compraId;
    expect([r12.credito.saldoNeto.toString(), r12.credito.usoPct?.toString(), r12.credito.semaforo]).toEqual(["15000", "3", "VERDE"]);
    expect(await estado(compras[140]!)).toEqual(["PARCIAL", "30000.00"]);
    expect(await imputaciones(pagos[40]!)).toEqual([
      [(await obtenerCompra(base.db, admin, compras[125]!)).numero, "170000.00"],
      [(await obtenerCompra(base.db, admin, compras[140]!)).numero, "30000.00"],
    ]);
    await invariante();
  });

  it("el estado de cuenta (DOC-05) reconstruye el período desde el libro", async () => {
    const c = await cuentaCorriente(base.db, admin, garcia, { desde: sumarDias(hoy, -1), hasta: hoy });
    expect([c.saldoAlInicio, c.comprado, c.pagado, c.ajustes, c.saldoAlCierre]).toEqual(["0.00", "885000.00", "870000.00", "0.00", "15000.00"]);
    expect([sumar(c.movimientos.map((m) => m.debe)).toString(), sumar(c.movimientos.map((m) => m.haber)).toString()]).toEqual(["945000", "930000"]);
    expect(c.pendientes.map((p) => [p.total, p.pagado, p.pendiente, p.estado])).toEqual([["45000.00", "30000.00", "15000.00", "PARCIAL"]]);
    expect(c.pagos.map((p) => [p.monto, p.imputaciones.length])).toEqual([
      ["120000.00", 1],
      ["50000.00", 1],
      ["200000.00", 2],
      ["300000.00", 3],
      ["200000.00", 2],
    ]);
    // Emitirlo de nuevo da lo mismo.
    expect(await cuentaCorriente(base.db, admin, garcia, { desde: sumarDias(hoy, -1), hasta: hoy })).toEqual(c);
  });
});

describe("reimputación, ajustes y anulaciones (06 §4.5, §5, §6)", () => {
  it("reimputar un pago cambia qué compras figuran pagadas, no el saldo", async () => {
    const pendiente140 = `C:${compras[140]}`;
    await expect(reimputarPago(base.db, admin, { pagoId: pagos[40]!, motivo: "x" })).rejects.toThrow(/motivo/);
    await reimputarPago(base.db, admin, { pagoId: pagos[40]!, motivo: "El proveedor pidió cancelar la del día 16", modo: "MANUAL", asignaciones: [] });
    // Sin asignar, el pago queda todo a favor… y la compra 125 vuelve a deber.
    expect(await estado(compras[125]!)).toEqual(["PARCIAL", "110000.00"]);
    await reimputarPago(base.db, admin, {
      pagoId: pagos[40]!,
      motivo: "Primero la del 16, el resto a la anterior",
      modo: "MANUAL",
      asignaciones: [
        { clave: pendiente140, monto: "45000" },
        { clave: `C:${compras[125]}`, monto: "155000" },
      ],
    });
    expect(await estado(compras[140]!)).toEqual(["PAGADA", "45000.00"]);
    expect(await estado(compras[125]!)).toEqual(["PARCIAL", "265000.00"]);
    await expect(
      reimputarPago(base.db, admin, { pagoId: pagos[40]!, motivo: "Asignación de más", modo: "MANUAL", asignaciones: [{ clave: pendiente140, monto: "50000" }] }),
    ).rejects.toThrow(/más de lo que tiene pendiente/);
    expect(await saldo()).toBe("15000.00");
    await invariante();
  });

  it("un ajuste de crédito con compra relacionada baja lo pendiente de esa compra; uno de débito queda como deuda", async () => {
    await expect(registrarAjuste(base.db, administrativo, { proveedorId: garcia, tipo: "AJUSTE_CREDITO", monto: "5000", motivo: "no" })).rejects.toThrow(/motivo/);
    await registrarAjuste(base.db, administrativo, { proveedorId: garcia, tipo: "AJUSTE_CREDITO", monto: "10000", motivo: "Tomate podrido de la 125", compraId: compras[125] });
    expect(await estado(compras[125]!)).toEqual(["PARCIAL", "275000.00"]);
    expect(await saldo()).toBe("5000.00");
    await registrarAjuste(base.db, administrativo, { proveedorId: garcia, tipo: "AJUSTE_DEBITO", monto: "3000", motivo: "Recargo por pagar tarde", vencimiento: sumarDias(hoy, 5) });
    expect(await saldo()).toBe("8000.00");
    const c = await cuentaCorriente(base.db, admin, garcia, { desde: hoy, hasta: hoy });
    expect(c.pendientes.map((p) => [p.descripcion.startsWith("Ajuste"), p.pendiente])).toEqual([
      [false, "5000.00"],
      [true, "3000.00"],
    ]);
    expect(c.ajustes).toBe("-7000.00");
    await invariante();
  });

  it("un pago cancela también los débitos por FIFO; anularlo vuelve todo a pendiente", async () => {
    const r = await pagar(garcia, "8000");
    expect(r.credito.saldoNeto.toString()).toBe("0");
    expect((await cuentaCorriente(base.db, admin, garcia, { desde: hoy, hasta: hoy })).pendientes).toEqual([]);
    await expect(anularPago(base.db, administrativo, { pagoId: r.pagoId, motivo: "" })).rejects.toThrow(/motivo/);
    await anularPago(base.db, administrativo, { pagoId: r.pagoId, motivo: "Cheque rechazado" });
    expect(await saldo()).toBe("8000.00");
    expect((await obtenerPago(base.db, admin, r.pagoId)).imputaciones.every((i) => !i.activa)).toBe(true);
    await invariante();
  });

  it("anular una compra de contado: si el proveedor devolvió la plata el efecto es cero; si no, queda a favor", async () => {
    const otro = await guardarProveedor(base.db, admin, { nombre: "Papas del Sur", condicionPagoHabitual: "CONTADO", limiteCredito: null });
    const a = (await comprar(otro, "CONTADO", 120000)).compraId;
    await anularCompra(base.db, admin, { compraId: a, motivo: "Se devolvió la mercadería", devolvioDinero: true });
    expect(await saldo(otro)).toBe("0.00");
    const b = (await comprar(otro, "CONTADO", 120000)).compraId;
    await anularCompra(base.db, admin, { compraId: b, motivo: "Se devolvió la mercadería" });
    expect(await saldo(otro)).toBe("-120000.00");
    await invariante(otro);
    // El saldo a favor se usa en la próxima compra a crédito.
    const c = (await comprar(otro, "CREDITO", 45000)).compraId;
    expect(await estado(c)).toEqual(["PAGADA", "45000.00"]);
    expect(await saldo(otro)).toBe("-75000.00");
    await invariante(otro);
  });

  it("el pago no puede ser de una fecha futura y exige permiso (RN-095)", async () => {
    await expect(pagar(garcia, "1000", { fecha: manana })).rejects.toThrow(/futura/);
    const comprador = await crearUsuarioDePrueba(base.db, empresaId, "Pedro", ["COMPRADOR"]);
    await expect(registrarPago(base.db, comprador, { proveedorId: garcia, fecha: hoy, monto: "1000", medio: "EFECTIVO" })).rejects.toThrow();
  });
});
