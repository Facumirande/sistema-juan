import { describe, expect, it } from "vitest";

import { resumenDelDia } from "@/dominio/jornadas/resumen";

describe("resumen del día (04 §5.h, jornada del 24/09)", () => {
  const r = resumenDelDia({
    compras: [
      { proveedor: "Hnos. García", total: "162000", pagadoEnElActo: "0" },
      { proveedor: "La Quinta", total: "228550", pagadoEnElActo: "100000" },
      { proveedor: "Papas del Sur", total: "137500", pagadoEnElActo: "137500" },
      { proveedor: "Mayorista Norte", total: "125000", pagadoEnElActo: "0" },
    ],
    entregas: [
      { cliente: "Hospital San Martín", total: "469200", costo: "0", conDiferencias: false },
      { cliente: "Restaurante La Esquina", total: "114400", costo: "0", conDiferencias: false },
      { cliente: "Verdulería Don Pepe", total: "222770", costo: "631590", conDiferencias: true },
    ],
    productos: [
      { producto: "Tomate redondo", unidad: "KG", comprado: "270", entregado: "266", costoUnitario: "925" },
      { producto: "Papa", unidad: "KG", comprado: "275", entregado: "265", costoUnitario: "500" },
      { producto: "Lechuga criolla", unidad: "UNIDAD", comprado: "108", entregado: "98", costoUnitario: "800" },
      { producto: "Banana", unidad: "KG", comprado: "100", entregado: "100", costoUnitario: "1250" },
      { producto: "Cebolla", unidad: "KG", comprado: "80", entregado: "73", costoUnitario: "680" },
      { producto: "Kale", unidad: "KG", comprado: "0", entregado: "10", costoUnitario: null },
      { producto: "Rúcula", unidad: "KG", comprado: "2", entregado: "0", costoUnitario: null },
    ],
    saldos: [
      { proveedor: "Hnos. García", saldo: "177000" },
      { proveedor: "La Quinta", saldo: "278550" },
      { proveedor: "Papas del Sur", saldo: "0" },
      { proveedor: "Frutas Tropicales", saldo: "60000" },
      { proveedor: "Mayorista Norte", saldo: "165000" },
      { proveedor: "Con saldo a favor", saldo: "-3000" },
    ],
  });

  it("comprado $653.050: pagado en el momento $237.500 y deuda generada $415.550", () => {
    expect([r.comprado, r.pagadoEnElActo, r.deudaGenerada]).toEqual(["653050.00", "237500.00", "415550.00"]);
    expect(r.comprasPorProveedor.find((c) => c.proveedor === "La Quinta")).toEqual({ proveedor: "La Quinta", total: "228550.00", pagado: "100000.00" });
  });

  it("vendido $806.370, costo $631.590, margen $174.780 (21,67 %)", () => {
    expect([r.vendido, r.costoVendido, r.margen, r.margenPct]).toEqual(["806370.00", "631590.00", "174780.00", "21.67"]);
    expect(r.ventasPorCliente.map((v) => v.cliente)).toEqual(["Hospital San Martín", "Restaurante La Esquina", "Verdulería Don Pepe"]);
  });

  it("sobrantes y devoluciones $21.460 y resultado $153.320 (19,01 %)", () => {
    expect(r.sobrantes.map((s) => [s.producto, s.cantidad, s.costo])).toEqual([
      ["Tomate redondo", "4.000", "3700.00"],
      ["Papa", "10.000", "5000.00"],
      ["Lechuga criolla", "10.000", "8000.00"],
      ["Cebolla", "7.000", "4760.00"],
      ["Rúcula", "2.000", "0.00"],
    ]);
    expect([r.sobrantesCosto, r.resultado, r.resultadoPct]).toEqual(["21460.00", "153320.00", "19.01"]);
  });

  it("saldo con proveedores al cierre $680.550", () => {
    expect(r.saldoProveedores).toBe("680550.00");
    expect(r.saldosPorProveedor.map((s) => s.proveedor)).toEqual(["Frutas Tropicales", "Hnos. García", "La Quinta", "Mayorista Norte"]);
    expect(r.entregasConDiferencias).toBe(1);
  });

  it("un día sin ventas no tiene porcentajes", () => {
    expect(resumenDelDia({ compras: [], entregas: [], productos: [], saldos: [] })).toMatchObject({ vendido: "0.00", margenPct: null, resultadoPct: null });
  });
});
