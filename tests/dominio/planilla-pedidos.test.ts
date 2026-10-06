import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { filasDePedidos, interpretarPedidos, leerFechaDePlanilla, type CatalogoParaPlanilla } from "@/dominio/pedidos/planilla";
import { planillaXlsx } from "@/lib/planilla";
import { PlanillaIlegible, leerPlanilla } from "@/lib/planilla-lectura";

const catalogo: CatalogoParaPlanilla = {
  hoy: "2026-10-06",
  fechaPorDefecto: "2026-10-07",
  cerrados: ["2026-10-09"],
  clientes: [
    { id: "c-hospital", nombre: "Hospital San Martín", conLugar: true },
    { id: "c-resto", nombre: "Restaurante La Esquina", conLugar: true },
    { id: "c-nuevo", nombre: "Kiosco Sin Dirección", conLugar: false },
  ],
  productos: [
    { id: "p-tomate", codigo: "TOMA-R", nombre: "Tomate redondo", unidadBase: "KG", admiteFraccion: true, presentaciones: [{ id: "pr-kg", nombre: "kg", factor: "1", esUnidadBase: true }, { id: "pr-cajon", nombre: "Cajón 18 kg", factor: "18", esUnidadBase: false }] },
    { id: "p-lechuga", codigo: "LECH", nombre: "Lechuga criolla", unidadBase: "UNIDAD", admiteFraccion: false, presentaciones: [{ id: "pr-u", nombre: "unidad", factor: "1", esUnidadBase: true }] },
  ],
};

const TITULOS = ["Fecha de entrega", "Cliente", "Código", "Producto", "Cantidad", "Unidad o envase", "Nota"];

describe("leer una planilla (.xlsx o .csv)", () => {
  it("lo que se baja a Excel se vuelve a leer igual, con los números como texto corto", () => {
    const archivo = planillaXlsx([{ nombre: "Pedidos", columnas: TITULOS, filas: [["07/10/2026", "Hospital & \"Cía\"", "TOMA-R", "Tomate redondo", { numero: "2.500" }, "kg", null]] }]);
    expect(leerPlanilla(archivo)).toEqual([TITULOS, ["07/10/2026", 'Hospital & "Cía"', "TOMA-R", "Tomate redondo", "2.5", "kg"]]);
  });

  it("un Excel de verdad: textos compartidos, celdas salteadas, filas vacías y la primera hoja del libro", () => {
    const xml = (cuerpo: string) => strToU8(`<?xml version="1.0" encoding="UTF-8"?>${cuerpo}`);
    const archivo = zipSync({
      "xl/workbook.xml": xml('<workbook xmlns:r="x"><sheets><sheet name="Pedidos" sheetId="7" r:id="rId3"/><sheet name="Otra" sheetId="1" r:id="rId1"/></sheets></workbook>'),
      "xl/_rels/workbook.xml.rels": xml('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId3" Target="worksheets/sheet2.xml"/></Relationships>'),
      "xl/sharedStrings.xml": xml("<sst><si><t>Cliente</t></si><si><r><t>Canti</t></r><r><t>dad</t></r></si><si><t xml:space=\"preserve\"> Ñandú &amp; Cía </t></si></sst>"),
      "xl/worksheets/sheet1.xml": xml('<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>no es esta</t></is></c></row></sheetData></worksheet>'),
      "xl/worksheets/sheet2.xml": xml(
        '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="3"><c r="A3" t="s"><v>2</v></c><c r="B3"/><c r="C3" s="4"><v>2.5000000000000004</v></c></row></sheetData></worksheet>',
      ),
    });
    expect(leerPlanilla(archivo)).toEqual([["Cliente", "", "Cantidad"], [], ["Ñandú & Cía", "", "2.5"]]);
  });

  it("CSV separado por punto y coma o por comas, con comillas y acentos", () => {
    expect(leerPlanilla(strToU8('﻿Cliente;Cantidad\r\n"Pérez; Hnos";2,5\r\n'))).toEqual([["Cliente", "Cantidad"], ["Pérez; Hnos", "2,5"]]);
    expect(leerPlanilla(strToU8('Cliente,Producto,Cantidad\n"Don ""Pepe""",Papa,3\n'))).toEqual([["Cliente", "Producto", "Cantidad"], ['Don "Pepe"', "Papa", "3"]]);
  });

  it("lo que no se puede leer dice qué hacer", () => {
    expect(() => leerPlanilla(new Uint8Array())).toThrow(PlanillaIlegible);
    expect(() => leerPlanilla(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]))).toThrow(/guardalo como/);
    expect(() => leerPlanilla(new Uint8Array([0x50, 0x4b, 1, 2, 3]))).toThrow(/dañado/);
  });
});

describe("las filas de pedidos de una planilla", () => {
  it("encuentra los títulos aunque haya filas arriba y en otro orden; el cliente vacío es el de arriba", () => {
    const { filas, problema } = filasDePedidos([
      ["Pedidos de la semana"],
      ["Cantidad", "PRODUCTO", "Cliente", "Fecha"],
      ["36", "Tomate redondo", "Hospital San Martín", "7/10"],
      ["12", "Lechuga criolla", "", ""],
      ["", "", "", ""],
      ["2", "Tomate redondo", "Restaurante La Esquina", ""],
      // Una fila más corta que los títulos, y una que cambia la fecha del mismo cliente.
      ["3", "Lechuga criolla"],
      ["1", "Tomate redondo", "Restaurante La Esquina", "9/10"],
    ]);
    expect(problema).toBeNull();
    expect(filas.map((f) => [f.fila, f.cliente, f.fecha, f.producto, f.cantidad])).toEqual([
      [3, "Hospital San Martín", "7/10", "Tomate redondo", "36"],
      [4, "Hospital San Martín", "7/10", "Lechuga criolla", "12"],
      // Otro cliente sin fecha: no hereda la del pedido de arriba.
      [6, "Restaurante La Esquina", "", "Tomate redondo", "2"],
      [7, "Restaurante La Esquina", "", "Lechuga criolla", "3"],
      [8, "Restaurante La Esquina", "9/10", "Tomate redondo", "1"],
    ]);
    // Sin columna de código, de envase ni de nota, esos datos quedan vacíos.
    expect(filas[0]).toMatchObject({ codigo: "", envase: "", nota: "" });
  });

  it("sin títulos o sin pedidos, explica cómo tiene que ser", () => {
    expect(filasDePedidos([["Hospital", "Tomate", "3"]]).problema).toMatch(/títulos/);
    expect(filasDePedidos([TITULOS]).problema).toMatch(/ningún pedido/);
  });
});

describe("la fecha de una planilla", () => {
  it("como la escribe la persona o como la guarda Excel", () => {
    expect(leerFechaDePlanilla("07/10/2026", "2026-10-06")).toBe("2026-10-07");
    expect(leerFechaDePlanilla("7-10-26", "2026-10-06")).toBe("2026-10-07");
    expect(leerFechaDePlanilla("2026-10-07", "2026-10-06")).toBe("2026-10-07");
    expect(leerFechaDePlanilla("7/10", "2026-10-06")).toBe("2026-10-07");
    // Excel guarda las fechas como días desde el 30/12/1899.
    expect(leerFechaDePlanilla("46302", "2026-10-06")).toBe("2026-10-07");
  });

  it("“5/1” escrito en diciembre es del año que viene; una fecha imposible no vale", () => {
    expect(leerFechaDePlanilla("5/1", "2026-12-28")).toBe("2027-01-05");
    expect(leerFechaDePlanilla("31/02/2026", "2026-10-06")).toBeNull();
    expect(leerFechaDePlanilla("31/02", "2026-10-06")).toBeNull();
    // Un número que no puede ser una fecha de Excel.
    expect(leerFechaDePlanilla("1000", "2026-10-06")).toBeNull();
    expect(leerFechaDePlanilla("mañana", "2026-10-06")).toBeNull();
  });
});

describe("armar los pedidos de la planilla", () => {
  const fila = (n: number, datos: Partial<{ fecha: string; cliente: string; codigo: string; producto: string; cantidad: string; envase: string; nota: string }>) => ({ fila: n, fecha: "", cliente: "", codigo: "", producto: "", cantidad: "", envase: "", nota: "", ...datos });

  it("las filas del mismo cliente y día forman un pedido; el producto va por código o por nombre", () => {
    const { pedidos, problemas } = interpretarPedidos(
      [
        fila(2, { cliente: "hospital san martin", codigo: "toma-r", cantidad: "2", envase: "Cajon 18 kg" }),
        fila(3, { cliente: "Hospital San Martín", producto: "lechuga criolla", cantidad: "12", nota: "bien verdes" }),
        fila(4, { cliente: "Hospital San Martín", codigo: "TOMA-R", cantidad: "1", envase: "cajón 18 KG" }),
        fila(5, { cliente: "Restaurante La Esquina", fecha: "08/10/2026", codigo: "TOMA-R", cantidad: "2,5", envase: "kilos" }),
        fila(6, { cliente: "Restaurante La Esquina", codigo: "LECH", cantidad: "4", envase: "Unidades" }),
      ],
      catalogo,
    );
    expect(problemas).toEqual([]);
    expect(pedidos.map((p) => [p.cliente, p.fecha, p.lineas.map((l) => `${l.producto}: ${l.texto}`)])).toEqual([
      // Sin fecha vale el día elegido; el tomate repetido se suma.
      ["Hospital San Martín", "2026-10-07", ["Tomate redondo: 3 × Cajón 18 kg", "Lechuga criolla: 12 u"]],
      // El mismo cliente en dos días son dos pedidos; a igual día, por orden alfabético.
      ["Restaurante La Esquina", "2026-10-07", ["Lechuga criolla: 4 u"]],
      ["Restaurante La Esquina", "2026-10-08", ["Tomate redondo: 2,5 kg"]],
    ]);
    expect(pedidos[0]!.lineas[0]).toMatchObject({ productoId: "p-tomate", presentacionId: "pr-cajon", cantidad: "3" });
    expect(pedidos[0]!.lineas[1]).toMatchObject({ presentacionId: null, observaciones: "bien verdes" });
  });

  it("cada fila que no se entiende dice qué pasa y cómo arreglarlo", () => {
    const { pedidos, problemas } = interpretarPedidos(
      [
        fila(2, { cliente: "Hospital", codigo: "TOMA-R", cantidad: "1" }),
        fila(3, { cliente: "Hospital San Martín", codigo: "TOM", producto: "Tomate redondo", cantidad: "1" }),
        fila(4, { cliente: "Hospital San Martín", producto: "Tomate", cantidad: "1" }),
        fila(5, { cliente: "Hospital San Martín", codigo: "LECH", cantidad: "2,5" }),
        fila(6, { cliente: "Hospital San Martín", codigo: "TOMA-R", cantidad: "mucho" }),
        fila(7, { cliente: "Hospital San Martín", codigo: "TOMA-R", cantidad: "1", envase: "Bolsa" }),
        fila(8, { cliente: "Hospital San Martín", fecha: "01/10/2026", codigo: "TOMA-R", cantidad: "1" }),
        fila(9, { cliente: "Hospital San Martín", fecha: "09/10/2026", codigo: "TOMA-R", cantidad: "1" }),
        fila(10, { cliente: "Kiosco Sin Dirección", codigo: "TOMA-R", cantidad: "1" }),
        fila(11, { codigo: "TOMA-R", cantidad: "1" }),
        fila(12, { cliente: "Almacén Nuevo", codigo: "TOMA-R", cantidad: "1" }),
        fila(13, { cliente: "Ho", codigo: "TOMA-R", cantidad: "1" }),
        fila(14, { cliente: "Hospital San Martín", codigo: "ZAPA", cantidad: "1" }),
        fila(15, { cliente: "Hospital San Martín", producto: "Zapallo", cantidad: "1" }),
        fila(16, { cliente: "Hospital San Martín", cantidad: "1" }),
        fila(17, { cliente: "Hospital San Martín", codigo: "TOMA-R" }),
        fila(18, { cliente: "Hospital San Martín", codigo: "LECH", cantidad: "2", envase: "Jaula" }),
        fila(19, { cliente: "Hospital San Martín", fecha: "pasado mañana", codigo: "TOMA-R", cantidad: "1" }),
      ],
      catalogo,
    );
    expect(pedidos).toEqual([]);
    expect(problemas.map((p) => p.fila)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    const de = (n: number) => problemas.find((p) => p.fila === n)!.mensaje;
    expect(de(2)).toContain("¿Quisiste decir “Hospital San Martín”?");
    expect(de(3)).toContain("Tomate redondo tiene el código TOMA-R");
    expect(de(4)).toContain("¿Quisiste decir “Tomate redondo”?");
    expect(de(5)).toContain("unidades enteras");
    expect(de(6)).toContain("no es una cantidad");
    expect(de(7)).toContain("Cajón 18 kg");
    expect(de(8)).toContain("ya pasó");
    expect(de(9)).toContain("cerrado");
    expect(de(10)).toContain("dónde se le entrega");
    expect(de(11)).toBe("Falta el cliente.");
    // Sin nada parecido no hay sugerencia; con dos letras tampoco se adivina.
    expect(de(12)).toBe("No hay ningún cliente que se llame “Almacén Nuevo”. Escribilo igual que en Clientes, o crealo antes.");
    expect(de(13)).not.toContain("Quisiste");
    expect(de(14)).toContain("Fijate el código en Productos");
    expect(de(15)).toBe("No hay ningún producto que se llame “Zapallo”. Usá su código o escribilo igual que en Productos.");
    expect(de(16)).toBe("Falta el producto: escribí su código o su nombre.");
    expect(de(17)).toBe("Tomate redondo: falta la cantidad.");
    // Un producto sin envases solo se pide en su unidad.
    expect(de(18)).toBe("Lechuga criolla: “Jaula” no es una forma de pedirlo. Poné u, o dejá la columna vacía.");
    expect(de(19)).toContain("No entiendo la fecha “pasado mañana”");
  });
});
