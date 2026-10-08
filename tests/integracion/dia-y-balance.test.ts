import { strFromU8, unzipSync } from "fflate";
import { beforeAll, describe, expect, it } from "vitest";

import { dec } from "@/dominio/dinero/decimal";
import { esErrorDeNegocio } from "@/dominio/errores";
import { sumarDias } from "@/dominio/fechas/fechas";
import { planillaXlsx } from "@/lib/planilla";
import { confirmarEntrega, listarEntregas } from "@/modulos/entregas/entregas";
import { iniciarPreparacion, marcarPreparada, obtenerPreparacion, prepararTodoComoPropuesto } from "@/modulos/entregas/preparacion";
import { emitirDocumentosDelDia } from "@/modulos/entregas/repartos";
import { cerrarJornada } from "@/modulos/jornadas/cierre";
import { diaDeTrabajo } from "@/modulos/jornadas/dia";
import { crearRegla } from "@/modulos/precios-venta/reglas";
import { balance, registroDeMovimientos } from "@/modulos/reportes/balance";
import { balancesPorMes, libroDelMes } from "@/modulos/reportes/balance-mensual";

import { prepararJornada2409, type Jornada2409 } from "./escenario-24-09";

// La pantalla "Hoy" recorre la jornada del 24/09 paso a paso, y el balance y el registro de
// movimientos la muestran después.

/** Revisa que un XML abra y cierre bien todas sus etiquetas (Excel no abre un archivo mal armado). */
function bienFormado(texto: string): boolean {
  const pila: string[] = [];
  for (const [, cierre, nombre, , solo] of texto.replace(/<\?xml[^>]*\?>/, "").matchAll(/<(\/?)([\w:]+)((?:\s+[\w:]+="[^"<]*")*)\s*(\/?)>/g)) {
    if (solo) continue;
    if (!cierre) pila.push(nombre!);
    else if (pila.pop() !== nombre) return false;
  }
  return pila.length === 0 && !/<(?![\w/?])/.test(texto);
}

let j: Jornada2409;
const estados = async (fecha?: string) => {
  const d = await diaDeTrabajo(j.base.db, j.admin, fecha);
  return { fecha: d.fecha, actual: d.pasos.actual, hechos: d.pasos.hechos, pasos: Object.fromEntries(d.pasos.pasos.map((p) => [p.clave, p.estado])), d };
};

beforeAll(async () => {
  j = await prepararJornada2409();
  // Precios del hospital (licitación, 04 §2) para que todas las entregas tengan precio.
  for (const [producto, valor] of [["banana", "1450"], ["papa", "620"], ["lechuga", "1000"], ["cebolla", "1010"]] as const) {
    await crearRegla(j.base.db, j.admin, { clienteId: j.ids.hospital!, tipo: "PRECIO_FIJO", productoId: j.ids[producto]!, valor });
  }
});

describe("el día de trabajo paso a paso", () => {
  it("sin elegir el día, muestra la jornada que se está comprando, con pedidos, lista y compras", async () => {
    const e = await estados();
    expect(e.fecha).toBe(j.manana);
    expect(e.pasos).toMatchObject({ pedidos: "hecho", lista: "hecho" });
    expect(e.d.panel.pedidos.EN_COMPRA ?? e.d.panel.pedidos.CONFIRMADO).toBe(3);
    expect(e.d.plata.comprado).toBe("653050.00");
    expect(dec(e.d.plata.pedido!).gt(0)).toBe(true);
    expect(e.d.dias.map((x) => x.fecha)).toContain(j.manana);
  });

  it("un día sin pedidos arranca por los pedidos", async () => {
    const e = await estados(sumarDias(j.manana, 3));
    expect([e.actual, e.hechos, e.d.panel.estado]).toEqual(["pedidos", 0, null]);
    expect(e.d.dias.map((x) => x.fecha)).toContain(sumarDias(j.manana, 3));
  });

  it("preparación (con sus remitos), entrega y cierre", async () => {
    await iniciarPreparacion(j.base.db, j.admin, j.manana);
    expect((await estados(j.manana)).actual).toBe("preparacion");
    const entregas = (await obtenerPreparacion(j.base.db, j.admin, j.manana)).entregas;
    for (const e of entregas) await prepararTodoComoPropuesto(j.base.db, j.admin, e.id);
    for (const e of entregas) await marcarPreparada(j.base.db, j.admin, { entregaId: e.id });
    // Al marcar preparada se emiten los remitos: no queda ninguno por emitir.
    expect(await emitirDocumentosDelDia(j.base.db, j.admin, j.manana)).toEqual({ emitidas: 0, problemas: [] });
    const preparado = await estados(j.manana);
    expect(preparado.pasos).toMatchObject({ preparacion: "hecho" });
    expect([preparado.actual, preparado.d.panel.conDocumentos, preparado.d.panel.sinReparto]).toEqual(["entregas", 3, 3]);

    for (const e of entregas) await confirmarEntrega(j.base.db, j.admin, { entregaId: e.id, modo: "COMPLETA", recibidoPor: "Recepción" });
    const entregado = await estados(j.manana);
    expect([entregado.actual, entregado.pasos.entregas]).toEqual(["cierre", "hecho"]);
    const vendido = (await listarEntregas(j.base.db, j.admin, j.manana)).reduce((s, e) => s.plus(e.total ?? "0"), dec(0));
    expect(entregado.d.plata.entregado).toBe(vendido.toFixed(2));

    await cerrarJornada(j.base.db, j.admin, j.manana);
    expect(await estados(j.manana)).toMatchObject({ actual: null, hechos: 6 });
  });
});

describe("balance y registro de movimientos", () => {
  it("lo vendido, lo comprado y la ganancia del día coinciden con las entregas y las compras", async () => {
    const b = await balance(j.base.db, j.admin, { desde: sumarDias(j.manana, -2), hasta: j.manana, agrupacion: "DIA" });
    const dia = b.series.find((s) => s.periodo === j.manana)!;
    expect(b.series).toHaveLength(3);
    expect(dia.valores.comprado).toBe("653050.00");
    expect(dia.valores.vendido).toBe(b.totales.vendido);
    expect(dec(b.totales.vendido!).minus(b.totales.costoVendido!).toFixed(2)).toBe(b.totales.ganancia);
    expect(b.totales.entregas).toBe(3);
    expect(b.clientes.map((c) => c.cliente)).toHaveLength(3);
    // Todo quedó sin facturar salvo la verdulería, que factura por entrega.
    expect(dec(b.totales.sinFacturar!).lt(b.totales.vendido!)).toBe(true);
    // La deuda al final del último día es la deuda de hoy.
    expect(b.deuda.at(-1)!.valores.saldo).toBe(b.totales.deuda);
  });

  it("agrupado por mes, un solo período con los mismos totales", async () => {
    const b = await balance(j.base.db, j.admin, { desde: `${j.manana.slice(0, 7)}-01`, hasta: j.manana, agrupacion: "MES" });
    expect(b.series).toHaveLength(1);
    expect(b.series[0]!.valores.comprado).toBe("653050.00");
  });

  it("el registro lista entregas, compras y pagos del período, y filtra por tipo", async () => {
    const periodo = { desde: sumarDias(j.manana, -2), hasta: j.manana };
    const todo = await registroDeMovimientos(j.base.db, j.admin, { ...periodo, tipos: [] });
    expect(todo.totales.VENTA?.cantidad).toBe(3);
    expect(todo.totales.COMPRA).toEqual({ cantidad: 4, importe: "653050.00" });
    expect(todo.totales.PAGO?.cantidad).toBeGreaterThan(0);
    expect(todo.movimientos.every((m) => m.fecha <= j.manana)).toBe(true);
    const compras = await registroDeMovimientos(j.base.db, j.admin, { ...periodo, tipos: ["COMPRA"] });
    expect(new Set(compras.movimientos.map((m) => m.tipo))).toEqual(new Set(["COMPRA"]));
    expect(compras.movimientos[0]!.enlace).toMatch(/^\/compras\//);
  });

  it("quien no ve precios de venta no ve lo vendido", async () => {
    const b = await balance(j.base.db, j.comprador, { desde: j.manana, hasta: j.manana, agrupacion: "DIA" }).catch((e: Error) => e);
    // El comprador no tiene reportes: la pantalla no se abre.
    expect(b).toBeInstanceOf(Error);
    const d = await diaDeTrabajo(j.base.db, j.comprador, j.manana);
    expect([d.plata.pedido, d.plata.entregado, d.plata.comprado]).toEqual([null, null, "653050.00"]);
  });

  it("el balance de cada mes se lista y se baja en Excel, con sus gráficos", async () => {
    const mes = j.manana.slice(0, 7);
    const meses = await balancesPorMes(j.base.db, j.admin, j.manana);
    expect(meses[0]).toMatchObject({ mes, desde: `${mes}-01`, hasta: j.manana, enCurso: true, comprado: "653050.00" });
    expect(meses.length).toBeLessThanOrEqual(24);

    const libro = await libroDelMes(j.base.db, j.admin, mes, j.manana);
    expect(libro.hojas.map((h) => h.nombre)).toEqual(["Resumen", "Gráficos", "Por día", "Clientes", "Productos", "A cobrar", "A pagar", "Gastos e ingresos"]);
    const [resumen, graficos, porDia, clientes] = libro.hojas;
    expect(resumen!.filas.find((x) => x[0] === "Compras (mercadería retirada)")![1]).toEqual({ numero: "653050" });
    expect(resumen!.filas.find((x) => x[0] === "Se vendió")![1]).toEqual({ numero: dec(meses[0]!.vendido!).toString() });
    // Un renglón por día del mes, hasta hoy, y de esas columnas salen los tres gráficos.
    expect(porDia!.columnas).toEqual(["Día", "Vendido", "Comprado", "Ganancia", "A pagar", "Entró", "Salió"]);
    expect(porDia!.filas).toHaveLength(Number(j.manana.slice(8, 10)));
    expect(porDia!.filas.at(-1)![2]).toEqual({ numero: "653050" });
    expect(graficos!.graficos!.map((g) => g.series.map((x) => x.columna))).toEqual([[1, 2], [3], [4], [5, 6]]);
    expect(clientes!.filas).toHaveLength(3);

    const archivos = unzipSync(planillaXlsx(libro.hojas));
    expect(Object.keys(archivos).filter((n) => n.startsWith("xl/charts/")).sort()).toEqual(Array.from({ length: 8 }, (_, n) => `xl/charts/chart${n + 1}.xml`));
    const grafico = strFromU8(archivos["xl/charts/chart1.xml"]!);
    expect(grafico).toContain(`'Por día'!$B$2:$B$${porDia!.filas.length + 1}`);
    expect(grafico).toContain("<c:v>Vendido</c:v>");
    expect(strFromU8(archivos["xl/worksheets/sheet2.xml"]!)).toContain('<drawing r:id="rId1"/>');
    expect(strFromU8(archivos["xl/worksheets/sheet1.xml"]!)).not.toContain("<drawing");
    expect(bienFormado("<a><b x=\"1\"/></a>") && !bienFormado("<a><b></a>")).toBe(true);
    for (const [nombre, bytes] of Object.entries(archivos)) expect([nombre, bienFormado(strFromU8(bytes))]).toEqual([nombre, true]);
    // Cada parte del archivo está declarada y enlazada: el gráfico, su dibujo y la hoja que lo muestra.
    expect(strFromU8(archivos["[Content_Types].xml"]!).match(/drawingml\.chart\+xml/g)).toHaveLength(8);
    expect(strFromU8(archivos["xl/worksheets/_rels/sheet2.xml.rels"]!)).toContain("../drawings/drawing2.xml");
    expect(strFromU8(archivos["xl/drawings/_rels/drawing2.xml.rels"]!).match(/charts\/chart\d\.xml/g)).toEqual(["charts/chart1.xml", "charts/chart2.xml", "charts/chart3.xml", "charts/chart4.xml"]);
    // El mismo mes da siempre el mismo archivo.
    expect(planillaXlsx((await libroDelMes(j.base.db, j.admin, mes, j.manana)).hojas)).toEqual(planillaXlsx(libro.hojas));

    // Un mes que todavía no llegó o más viejo que los que se guardan: se explica, no se arma nada.
    for (const otro of [sumarDias(j.manana, 40).slice(0, 7), "2019-01", "cualquiera"]) {
      const error = await libroDelMes(j.base.db, j.admin, otro, j.manana).catch((e: unknown) => e);
      expect(esErrorDeNegocio(error, "VALIDACION")).toBe(true);
    }
  });
});
