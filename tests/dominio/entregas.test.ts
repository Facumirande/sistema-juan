import { describe, expect, it } from "vitest";

import {
  distribuirFaltante,
  entregaConDiferencias,
  evaluarPreparado,
  importeLinea,
  ordenarParadas,
  pasoDeReparto,
  totalesEntrega,
  transicionEntregaPermitida,
} from "@/dominio/entregas/entregas";

const lechuga = [
  { id: "hospital", pedida: "48", prioridad: 1, orden: 1 },
  { id: "restaurante", pedida: "20", prioridad: 2, orden: 2 },
  { id: "verduleria", pedida: "30", prioridad: 2, orden: 3 },
];
const comoTexto = (m: Map<string, { toString(): string }> | null) => Object.fromEntries([...(m ?? new Map()).entries()].map(([k, v]) => [k, v.toString()]));

describe("reparto de faltantes (04 §5.e.1, RN-115)", () => {
  it("84 lechugas para 98 pedidas: 48 / 14 / 22 por prioridad y prorrateo", () => {
    expect(comoTexto(distribuirFaltante("84", lechuga, { paso: pasoDeReparto(false), politica: "PRIORIDAD_CLIENTE" }))).toEqual({
      hospital: "48",
      restaurante: "14",
      verduleria: "22",
    });
  });

  it("si alcanza, cada uno recibe lo pedido; si no hay nada, todos 0", () => {
    expect(comoTexto(distribuirFaltante("120", lechuga, { paso: "1", politica: "PRIORIDAD_CLIENTE" }))).toEqual({ hospital: "48", restaurante: "20", verduleria: "30" });
    expect(comoTexto(distribuirFaltante("0", lechuga, { paso: "1", politica: "PRIORIDAD_CLIENTE" }))).toEqual({ hospital: "0", restaurante: "0", verduleria: "0" });
  });

  it("los grupos de menor prioridad quedan en 0 si el primero no se cubre", () => {
    expect(comoTexto(distribuirFaltante("30", lechuga, { paso: "1", politica: "PRIORIDAD_CLIENTE" }))).toEqual({ hospital: "30", restaurante: "0", verduleria: "0" });
  });

  it("PROPORCIONAL reparte entre todos; en kg se reparte de a 0,1", () => {
    const r = distribuirFaltante("49", lechuga, { paso: pasoDeReparto(true), politica: "PROPORCIONAL" })!;
    expect(comoTexto(r)).toEqual({ hospital: "24", restaurante: "10", verduleria: "15" });
    const kg = distribuirFaltante("10", [
      { id: "a", pedida: "7", prioridad: 1, orden: 1 },
      { id: "b", pedida: "7", prioridad: 1, orden: 2 },
      { id: "c", pedida: "7", prioridad: 1, orden: 3 },
    ], { paso: "0.1", politica: "PRIORIDAD_CLIENTE" })!;
    // 3,333… cada uno: 3,3 + 3,3 + 3,3 y la décima que sobra va al pedido más antiguo (empate).
    expect(comoTexto(kg)).toEqual({ a: "3.4", b: "3.3", c: "3.3" });
  });

  it("MANUAL no propone nada", () => {
    expect(distribuirFaltante("84", lechuga, { paso: "1", politica: "MANUAL" })).toBeNull();
  });
});

describe("preparación y entrega (RN-113, RN-127)", () => {
  it("36,4 kg para 36 pedidos es 1,11 %: dentro de la tolerancia del 3 %", () => {
    expect(evaluarPreparado("36", "36.4", "3")).toMatchObject({ dentro: true, menor: false });
    expect(evaluarPreparado("36", "36.4", "3").diferenciaPct?.toString()).toBe("1.11");
    expect(evaluarPreparado("54", "50", "3")).toMatchObject({ dentro: false, menor: true });
    expect(evaluarPreparado("10", "11", "3")).toMatchObject({ dentro: false, menor: false });
    expect(evaluarPreparado("0", "5", "3")).toMatchObject({ diferenciaPct: null, dentro: true });
  });

  it("totales de la lista contable: restaurante $114.400 (04 §5.f.2)", () => {
    const lineas = [
      ["36", "1250"],
      ["50", "680"],
      ["20", "1080"],
      ["15", "920"],
    ].map(([cantidad, precio]) => ({ cantidad: cantidad!, precioUnitario: precio!, costoUnitario: "900", alicuotaIva: "0" }));
    const t = totalesEntrega(lineas, false);
    expect([t.neto.toString(), t.iva.toString(), t.total.toString(), t.costo.toString()]).toEqual(["114400", "0", "114400", "108900"]);
    // Cada importe se lleva al peso, así los totales suman exacto (pesos enteros).
    expect(importeLinea("36.4", "1156.6667").toString()).toBe("42103");
  });

  it("IVA discriminado o incluido en el precio; sin costo no suma costo", () => {
    const sinIva = totalesEntrega([{ cantidad: "10", precioUnitario: "100", costoUnitario: null, alicuotaIva: "21" }], false);
    expect([sinIva.neto.toString(), sinIva.iva.toString(), sinIva.total.toString(), sinIva.costo.toString()]).toEqual(["1000", "210", "1210", "0"]);
    const conIva = totalesEntrega([{ cantidad: "10", precioUnitario: "121", costoUnitario: "50", alicuotaIva: "21" }], true);
    expect([conIva.neto.toString(), conIva.iva.toString(), conIva.total.toString()]).toEqual(["1000", "210", "1210"]);
  });

  it("con diferencias: rechazo, sustitución o fuera de tolerancia", () => {
    const completa = { pedida: "36", preparada: "36.4", entregada: "36.4", esSustitucion: false };
    expect(entregaConDiferencias([completa], "3")).toBe(false);
    expect(entregaConDiferencias([completa, { pedida: "54", preparada: "54", entregada: "50", esSustitucion: false }], "3")).toBe(true);
    expect(entregaConDiferencias([{ pedida: "0", preparada: "10", entregada: "10", esSustitucion: true }], "3")).toBe(true);
    expect(entregaConDiferencias([{ pedida: "60", preparada: "40", entregada: "40", esSustitucion: false }], "3")).toBe(true);
  });

  it("estados de la entrega", () => {
    expect(transicionEntregaPermitida("BORRADOR", "EN_PREPARACION")).toBe(true);
    expect(transicionEntregaPermitida("PREPARADA", "ENTREGADA")).toBe(true);
    expect(transicionEntregaPermitida("ENTREGADA", "ANULADA")).toBe(true);
    expect(transicionEntregaPermitida("ANULADA", "PREPARADA")).toBe(false);
    expect(transicionEntregaPermitida("EN_REPARTO", "ANULADA")).toBe(false);
  });

  it("orden de paradas por franja de recepción y localidad (P-76)", () => {
    const paradas = [
      { id: "esquina", horarioDesde: "09:00", localidad: "CABA" },
      { id: "sin horario", horarioDesde: null, localidad: null },
      { id: "pepe", horarioDesde: "07:00", localidad: "CABA" },
      { id: "hospital", horarioDesde: "06:30", localidad: "CABA" },
      { id: "avellaneda", horarioDesde: "07:00", localidad: "Avellaneda" },
      { id: "sin localidad", horarioDesde: "09:00", localidad: null },
    ];
    expect(ordenarParadas(paradas).map((p) => p.id)).toEqual(["hospital", "avellaneda", "pepe", "sin localidad", "esquina", "sin horario"]);
    expect(ordenarParadas([paradas[5]!, paradas[0]!]).map((p) => p.id)).toEqual(["sin localidad", "esquina"]);
    expect(ordenarParadas([paradas[0]!, paradas[5]!]).map((p) => p.id)).toEqual(["sin localidad", "esquina"]);
  });
});
