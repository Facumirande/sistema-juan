import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { cliente } from "@/db/esquema";
import { hoyEnEmpresa } from "@/dominio/fechas/fechas";
import { planillaXlsx } from "@/lib/planilla";
import { confirmarEntrega, entregaParaConfirmar, obtenerEntrega } from "@/modulos/entregas/entregas";
import { iniciarPreparacion, marcarPreparada, obtenerPreparacion, prepararTodoComoPropuesto } from "@/modulos/entregas/preparacion";
import { hojasParaElContador } from "@/modulos/facturacion/exportacion";
import { anularComprobante, facturarPeriodo, listarComprobantes, obtenerComprobante, pendientesDeFacturar } from "@/modulos/facturacion/facturacion";
import { cerrarJornada, estadoDelCierre, reabrirJornada } from "@/modulos/jornadas/cierre";
import { crearRegla } from "@/modulos/precios-venta/reglas";
import { reporteCompras, reporteDeuda, reporteDiferencias, reporteVentas } from "@/modulos/reportes/reportes";

import { codigoDeError } from "./base-de-prueba";
import { prepararJornada2409, type Jornada2409 } from "./escenario-24-09";

// Facturación interna, exportación y cierre de la jornada del 24/09 (04 §5.g y §5.h).

let j: Jornada2409;
let hoy: string;
const entregas: Record<string, string> = {};

beforeAll(async () => {
  j = await prepararJornada2409();
  hoy = hoyEnEmpresa(new Date(), "America/Argentina/Buenos_Aires");
  // El hospital compra por licitación (04 §2). El plan da los precios del tomate ($1.150) y la
  // banana ($1.450); los de papa, lechuga y cebolla no figuran: se eligieron para llegar a su total
  // de $469.200 (04 §5.h).
  for (const [producto, valor] of [["banana", "1450"], ["papa", "620"], ["lechuga", "1000"], ["cebolla", "1010"]] as const) {
    await crearRegla(j.base.db, j.admin, { clienteId: j.ids.hospital!, tipo: "PRECIO_FIJO", productoId: j.ids[producto]!, valor });
  }
  // Cómo factura cada uno (04 §2): hospital mensual, restaurante semanal, verdulería por entrega.
  await j.base.comoSuperusuario(async () => {
    await j.base.db.update(cliente).set({ periodicidadFacturacion: "MENSUAL" }).where(eq(cliente.id, j.ids.hospital!));
    await j.base.db.update(cliente).set({ periodicidadFacturacion: "SEMANAL" }).where(eq(cliente.id, j.ids.restaurante!));
  });

  await iniciarPreparacion(j.base.db, j.admin, j.manana);
  for (const e of (await obtenerPreparacion(j.base.db, j.admin, j.manana)).entregas) {
    entregas[e.cliente] = e.id;
    await prepararTodoComoPropuesto(j.base.db, j.admin, e.id);
    await marcarPreparada(j.base.db, j.admin, { entregaId: e.id });
  }
});

describe("venta y comprobantes (04 §5.g, RN-135 a RN-143)", () => {
  it("la verdulería factura por entrega: FAC automático por $222.770 al confirmar con el rechazo", async () => {
    const tomate = (await entregaParaConfirmar(j.base.db, j.admin, entregas["Verdulería Don Pepe"]!)).lineas.find((l) => l.producto === "Tomate redondo")!;
    const r = await confirmarEntrega(j.base.db, j.admin, {
      entregaId: entregas["Verdulería Don Pepe"]!,
      modo: "DIFERENCIAS",
      recibidoPor: "Pepe",
      lineas: [{ itemId: tomate.id, entregada: "50", motivo: "RECHAZO_CALIDAD" }],
    });
    expect(r.factura).toBe("FAC-000001");
    const [fac] = await listarComprobantes(j.base.db, j.admin, { desde: hoy, hasta: hoy });
    const detalle = await obtenerComprobante(j.base.db, j.admin, fac!.id);
    expect([detalle.cliente.nombre, detalle.total, detalle.entregas.map((e) => e.version)]).toEqual(["Verdulería Don Pepe", "222770.00", [2]]);
    expect((await obtenerEntrega(j.base.db, j.admin, entregas["Verdulería Don Pepe"]!)).facturacion).toBe("FACTURADA");
  });

  it("los clientes de período quedan sin facturar hasta que se factura el período", async () => {
    for (const c of ["Restaurante La Esquina", "Hospital San Martín"]) {
      const r = await confirmarEntrega(j.base.db, j.admin, { entregaId: entregas[c]!, modo: "COMPLETA", recibidoPor: "Recepción" });
      expect(r.factura).toBeNull();
    }
    const pendientes = await pendientesDeFacturar(j.base.db, j.admin);
    expect(pendientes.map((p) => [p.cliente, p.periodicidad, p.total])).toEqual([
      ["Hospital San Martín", "MENSUAL", "469200.00"],
      ["Restaurante La Esquina", "SEMANAL", "114400.00"],
    ]);
    expect(pendientes[0]!.sinIdentificacionFiscal).toBe(true);
  });
});

describe("cierre de la jornada (04 §5.h, RN-040, RN-041)", () => {
  it("el resumen coincide con el plan: vendido $806.370, margen $174.780, resultado $153.320, deuda $680.550", async () => {
    const e = await estadoDelCierre(j.base.db, j.admin, j.manana);
    expect(e.bloqueos).toEqual([]);
    const r = e.resumen;
    expect([r.comprado, r.pagadoEnElActo, r.deudaGenerada]).toEqual(["653050.00", "237500.00", "415550.00"]);
    expect([r.vendido, r.costoVendido, r.margen, r.margenPct]).toEqual(["806370.00", "631590.00", "174780.00", "21.67"]);
    expect([r.sobrantesCosto, r.resultado, r.resultadoPct, r.saldoProveedores]).toEqual(["21460.00", "153320.00", "19.01", "680550.00"]);
    expect(r.alertas).toEqual(
      expect.arrayContaining([expect.stringMatching(/^Banana a Hospital San Martín: margen 13,79 %/), expect.stringMatching(/^La Quinta: 69,6 % del límite, a punto de pasar a amarillo/)]),
    );
    expect(r.pedidos).toEqual({ entregados: 3, cancelados: 0 });
  });

  it("cerrada, el resumen queda congelado y la jornada es de solo lectura; se reabre con motivo", async () => {
    await cerrarJornada(j.base.db, j.admin, j.manana);
    const e = await estadoDelCierre(j.base.db, j.admin, j.manana);
    expect([e.estado, e.resumen.vendido, e.resumen.cerradaPor]).toEqual(["CERRADA", "806370.00", "Admin Frutas Juan"]);
    expect(await codigoDeError(iniciarPreparacion(j.base.db, j.admin, j.manana))).toBe("JORNADA_CERRADA");
    await expect(reabrirJornada(j.base.db, j.admin, { fecha: j.manana, motivo: "no" })).rejects.toThrow(/por qué/);
    await reabrirJornada(j.base.db, j.admin, { fecha: j.manana, motivo: "Revisar un precio" });
    expect((await estadoDelCierre(j.base.db, j.admin, j.manana)).estado).toBe("REPARTIENDO");
  });
});

describe("facturar período, anular y exportar (04 §5.g.2 y §5.g.3)", () => {
  it("facturar período: un comprobante por cliente con la suma de sus entregas (RN-137)", async () => {
    const pendientes = await pendientesDeFacturar(j.base.db, j.admin);
    const r = await facturarPeriodo(j.base.db, j.admin, { entregaIds: pendientes.flatMap((p) => p.entregas.map((e) => e.id)), desde: j.manana, hasta: j.manana });
    expect(r.map((x) => x.total).sort()).toEqual(["114400.00", "469200.00"]);
    expect(await pendientesDeFacturar(j.base.db, j.admin)).toEqual([]);
  });

  it("anular un comprobante devuelve sus entregas a sin facturar (RN-139)", async () => {
    const hospital = (await listarComprobantes(j.base.db, j.admin, { desde: hoy, hasta: hoy })).find((f) => f.cliente === "Hospital San Martín")!;
    await expect(anularComprobante(j.base.db, j.admin, { facturaId: hospital.id, motivo: "x" })).rejects.toThrow(/por qué/);
    await anularComprobante(j.base.db, j.admin, { facturaId: hospital.id, motivo: "Falta el número de orden de compra" });
    expect((await obtenerEntrega(j.base.db, j.admin, entregas["Hospital San Martín"]!)).facturacion).toBe("SIN_FACTURAR");
    expect((await obtenerComprobante(j.base.db, j.admin, hospital.id)).estado).toBe("ANULADA");
  });

  it("la exportación trae las seis hojas, marca lo anulado y da el mismo archivo dos veces (RN-142)", async () => {
    const periodo = { desde: hoy, hasta: j.manana };
    const hojas = await hojasParaElContador(j.base.db, j.admin, periodo, true);
    expect(hojas.map((h) => [h.nombre, h.filas.length])).toEqual([
      ["Ventas", 3],
      ["Ventas detalle", 9],
      ["Entregas sin facturar", 1],
      ["Compras", 4],
      ["Pagos a proveedores", 2],
      ["Saldos de proveedores", 4],
    ]);
    expect(hojas[0]!.filas.map((f) => [f[1], f[2], f[7]])).toEqual([
      ["FAC-000001", "Verdulería Don Pepe", "Emitida"],
      ["FAC-000002", "Hospital San Martín", "ANULADA: Falta el número de orden de compra"],
      ["FAC-000003", "Restaurante La Esquina", "Emitida"],
    ]);
    expect(hojas[5]!.filas.map((f) => [f[0], f[2]])).toEqual([
      ["Frutas Tropicales", { numero: "60000.00" }],
      ["Hnos. García", { numero: "177000.00" }],
      ["La Quinta", { numero: "278550.00" }],
      ["Mayorista Norte", { numero: "165000.00" }],
    ]);
    const otraVez = await hojasParaElContador(j.base.db, j.admin, periodo, true);
    expect(planillaXlsx(otraVez)).toEqual(planillaXlsx(hojas));
  });
});

describe("reportes (P-90)", () => {
  it("ventas y margen del período coinciden con el cierre; compras por proveedor; diferencias con motivo", async () => {
    const periodo = { desde: j.manana, hasta: j.manana };
    const v = await reporteVentas(j.base.db, j.admin, periodo);
    expect([v.total.venta, v.total.costo, v.total.margenPct]).toEqual(["806370.00", "631590.00", "21.67"]);
    expect(v.porProducto.find((p) => p.producto === "Tomate redondo")).toMatchObject({ cantidad: "266.000", costo: "246050.00" });
    const c = await reporteCompras(j.base.db, j.admin, periodo);
    expect(c.porProducto.find((p) => p.producto === "Tomate redondo")).toMatchObject({ total: "249750.00", costoPromedio: "925.00" });
    const d = await reporteDiferencias(j.base.db, j.admin, periodo);
    expect(d.map((x) => [x.cliente, x.producto, x.motivoDiferencia, x.rechazo])).toEqual([["Verdulería Don Pepe", "Tomate redondo", "RECHAZO_CALIDAD", "4.000"]]);
    const deuda = await reporteDeuda(j.base.db, j.admin);
    expect(deuda.filas.map((f) => [f.proveedor, f.total])).toEqual([
      ["Frutas Tropicales", "60000.00"],
      ["Hnos. García", "177000.00"],
      ["La Quinta", "278550.00"],
      ["Mayorista Norte", "165000.00"],
    ]);
  });
});
