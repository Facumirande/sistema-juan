import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";

import {
  conciliarFIFO,
  costoRealPonderado,
  diasDeAtraso,
  estadoPagoCompra,
  imputarFIFO,
  indicadoresCredito,
  libroConSaldo,
  resumenVencimientos,
  semaforoPorUso,
  validarImputacionManual,
  verificarLimite,
} from "@/dominio/compras/credito";
import { calcularLineaLista, estadoLineaLista, sugerirProveedor, tildeSigueValiendo, type Candidato } from "@/dominio/compras/lista";
import { dec, sumar } from "@/dominio/dinero/decimal";

const umbrales = { amarilloPct: "70", rojoPct: "90" };

function candidato(proveedorId: string, precio: string, factor: string, opciones: Partial<Candidato> = {}): Candidato {
  return {
    ofertaId: `${proveedorId}-oferta`,
    proveedorId,
    precio,
    factor,
    costoBase: dec(precio).div(factor).toString(),
    sinControlDeCredito: false,
    desactualizada: false,
    fechaActualizacion: new Date("2026-09-23T10:00:00Z"),
    ...opciones,
  };
}

describe("líneas de la lista de compra (04 §5.c.1, RN-046, RN-051)", () => {
  it("redondea hacia arriba a presentaciones completas y calcula el sobrante", () => {
    const papa = calcularLineaLista({ necesidadBase: "265", compradoBase: "0", factor: "25", cantidadManual: null, marcadaNoConseguido: false });
    expect([papa.cantidadPresentaciones.toString(), papa.aComprarBase.toString(), papa.sobrantePrevistoBase.toString(), papa.estado]).toEqual(["11", "275", "10", "PENDIENTE"]);
    const lechuga = calcularLineaLista({ necesidadBase: "98", compradoBase: "0", factor: "12", cantidadManual: null, marcadaNoConseguido: false });
    expect([lechuga.cantidadPresentaciones.toString(), lechuga.sobrantePrevistoBase.toString()]).toEqual(["9", "10"]);
  });

  it("descuenta lo comprado: cebolla 83 kg con 80 comprados → 1 bolsa más (04 §5.c.4)", () => {
    const r = calcularLineaLista({ necesidadBase: "83", compradoBase: "80", factor: "20", cantidadManual: null, marcadaNoConseguido: false });
    expect([r.pendienteBase.toString(), r.cantidadPresentaciones.toString(), r.sobrantePrevistoBase.toString(), r.estado]).toEqual(["3", "1", "17", "PARCIAL"]);
  });

  it("si la necesidad baja por debajo de lo comprado, queda comprado con sobrante", () => {
    const r = calcularLineaLista({ necesidadBase: "60", compradoBase: "80", factor: "20", cantidadManual: null, marcadaNoConseguido: false });
    expect([r.cantidadPresentaciones.toString(), r.sobrantePrevistoBase.toString(), r.estado]).toEqual(["0", "20", "COMPRADO"]);
  });

  it("respeta la cantidad fijada a mano y la marca de no conseguido", () => {
    const r = calcularLineaLista({ necesidadBase: "270", compradoBase: "0", factor: "18", cantidadManual: "16", marcadaNoConseguido: false });
    expect([r.aComprarBase.toString(), r.sobrantePrevistoBase.toString()]).toEqual(["288", "18"]);
    expect(estadoLineaLista("100", "40", true)).toBe("NO_CONSEGUIDO");
    expect(estadoLineaLista("100", "100", true)).toBe("COMPRADO");
    expect(estadoLineaLista("0", "0", false)).toBe("COMPRADO");
  });
});

describe("sugerencia de proveedor: jornada del 24/09 (04 §5.c.3)", () => {
  const disponible = new Map<string, Decimal>([
    ["A", dec("485000")],
    ["B", dec("250000")],
    ["D", dec("90000")],
    ["E", dec("260000")],
  ]);

  it("arma la lista de $646.300 con los proveedores del plan", () => {
    const proyectado = new Map(disponible);
    const linea = (candidatos: Candidato[], pendiente: string, preferidoId: string | null) => {
      const s = sugerirProveedor({ candidatos, estrategia: "PREFERIDO", preferidoId, ultimoProveedorId: null, pendienteBase: pendiente, disponibleProyectado: proyectado });
      const c = s.candidato!;
      const n = calcularLineaLista({ necesidadBase: pendiente, compradoBase: "0", factor: c.factor, cantidadManual: null, marcadaNoConseguido: false }).cantidadPresentaciones;
      const costo = n.times(c.precio);
      const antes = proyectado.get(c.proveedorId);
      if (antes) proyectado.set(c.proveedorId, antes.minus(costo));
      return { proveedor: c.proveedorId, n: n.toString(), costo, alertas: s.alertas, descartados: s.descartados };
    };
    const tomate = linea([candidato("A", "16200", "18"), candidato("B", "17100", "18")], "270", "A");
    const papa = linea([candidato("A", "13000", "25"), candidato("C", "12500", "25", { sinControlDeCredito: true })], "265", null);
    const lechuga = linea([candidato("B", "9600", "12")], "98", null);
    const banana = linea([candidato("D", "24000", "20"), candidato("E", "25000", "20")], "100", "D");
    const cebolla = linea([candidato("A", "12600", "18"), candidato("B", "13600", "20"), candidato("E", "7300", "10")], "73", null);

    expect([tomate, papa, lechuga, banana, cebolla].map((l) => [l.proveedor, l.n, l.costo.toString()])).toEqual([
      ["A", "15", "243000"],
      ["C", "11", "137500"],
      ["B", "9", "86400"],
      ["E", "5", "125000"],
      ["B", "4", "54400"],
    ]);
    expect(sumar([tomate, papa, lechuga, banana, cebolla].map((l) => l.costo)).toString()).toBe("646300");
    expect(banana.alertas).toEqual(["CREDITO_INSUFICIENTE"]);
    expect(banana.descartados.map((d) => [d.proveedorId, d.disponible.toString(), d.costoLinea.toString()])).toEqual([["D", "90000", "120000"]]);
    // Plan por proveedor: disponible después de lo asignado.
    expect(["A", "B", "E"].map((p) => proyectado.get(p)!.toString())).toEqual(["242000", "109200", "135000"]);
  });

  it("MINIMO ignora al preferido; ULTIMO_COSTO_REAL empieza por el de la última compra; sin ofertas no hay sugerencia", () => {
    const candidatos = [candidato("A", "16200", "18"), candidato("B", "15300", "18")];
    const base = { candidatos, preferidoId: "A", ultimoProveedorId: "A", pendienteBase: "18", disponibleProyectado: new Map<string, Decimal>() };
    expect(sugerirProveedor({ ...base, estrategia: "MINIMO" }).candidato?.proveedorId).toBe("B");
    expect(sugerirProveedor({ ...base, estrategia: "ULTIMO_COSTO_REAL" }).candidato?.proveedorId).toBe("A");
    expect(sugerirProveedor({ ...base, candidatos: [], estrategia: "MINIMO" })).toMatchObject({ candidato: null, alertas: ["SIN_PROVEEDOR"] });
  });

  it("empate de costo: gana el preferido y después el precio más reciente; avisa precio desactualizado", () => {
    const viejo = candidato("A", "18000", "18", { fechaActualizacion: new Date("2026-09-01T00:00:00Z"), desactualizada: true });
    const nuevo = candidato("B", "18000", "18");
    const base = { estrategia: "MINIMO" as const, ultimoProveedorId: null, pendienteBase: "18", disponibleProyectado: new Map<string, Decimal>() };
    expect(sugerirProveedor({ ...base, candidatos: [viejo, nuevo], preferidoId: null }).candidato?.proveedorId).toBe("B");
    const conPreferido = sugerirProveedor({ ...base, candidatos: [nuevo, viejo], preferidoId: "A" });
    expect([conPreferido.candidato?.proveedorId, conPreferido.alertas]).toEqual(["A", ["PRECIO_DESACTUALIZADO"]]);
  });

  it("ordena bien sin importar el orden en que llegan las ofertas", () => {
    const base = { ultimoProveedorId: null, pendienteBase: "18", disponibleProyectado: new Map<string, Decimal>() };
    const caro = candidato("A", "20000", "18");
    const barato1 = candidato("B", "18000", "18", { fechaActualizacion: new Date("2026-09-20T00:00:00Z") });
    const barato2 = candidato("C", "18000", "18", { fechaActualizacion: new Date("2026-09-22T00:00:00Z") });
    expect(sugerirProveedor({ ...base, candidatos: [barato1, barato2, caro], estrategia: "PREFERIDO", preferidoId: "A" }).candidato?.proveedorId).toBe("A");
    expect(sugerirProveedor({ ...base, candidatos: [caro, barato1, barato2], estrategia: "PREFERIDO", preferidoId: null }).candidato?.proveedorId).toBe("C");
    expect(sugerirProveedor({ ...base, candidatos: [barato2, barato1], estrategia: "MINIMO", preferidoId: "B" }).candidato?.proveedorId).toBe("B");
    expect(sugerirProveedor({ ...base, candidatos: [barato1, barato2], estrategia: "MINIMO", preferidoId: "C" }).candidato?.proveedorId).toBe("C");
  });

  it("si nadie tiene crédito, sugiere el mejor igual y avisa (con o sin precio viejo)", () => {
    const sinCredito = sugerirProveedor({
      candidatos: [candidato("D", "24000", "20")],
      estrategia: "PREFERIDO",
      preferidoId: "D",
      ultimoProveedorId: null,
      pendienteBase: "100",
      disponibleProyectado: new Map([["D", dec("0")]]),
    });
    expect(sinCredito.alertas).toEqual(["CREDITO_INSUFICIENTE"]);
  });

  it("si nadie tiene crédito, sugiere el mejor igual y avisa", () => {
    const s = sugerirProveedor({
      candidatos: [candidato("D", "24000", "20", { desactualizada: true })],
      estrategia: "PREFERIDO",
      preferidoId: "D",
      ultimoProveedorId: null,
      pendienteBase: "100",
      disponibleProyectado: new Map([["D", dec("0")]]),
    });
    expect([s.candidato?.proveedorId, s.alertas]).toEqual(["D", ["CREDITO_INSUFICIENTE", "PRECIO_DESACTUALIZADO"]]);
  });
});

describe("crédito con proveedores (06 §8 y §9)", () => {
  it("semáforo por uso (RN-104)", () => {
    expect(["69.99", "70", "89.99", "90", "100", "100.01"].map((u) => semaforoPorUso(u, umbrales))).toEqual(["VERDE", "AMARILLO", "AMARILLO", "ROJO", "ROJO", "EXCEDIDO"]);
  });

  it("indicadores: con límite, sin límite, con límite 0 y con saldo a favor", () => {
    const b = indicadoresCredito("290800", "400000", umbrales);
    expect([b.disponible?.toString(), b.usoPct?.toString(), b.semaforo]).toEqual(["109200", "72.7", "AMARILLO"]);
    expect(indicadoresCredito("0", null, umbrales)).toMatchObject({ disponible: null, usoPct: null, semaforo: "SIN_LIMITE" });
    expect(indicadoresCredito("1000", "0", umbrales).semaforo).toBe("EXCEDIDO");
    expect(indicadoresCredito("0", "0", umbrales).semaforo).toBe("VERDE");
    const aFavor = indicadoresCredito("-5000", "100000", umbrales);
    expect([aFavor.saldoAFavor.toString(), aFavor.disponible?.toString(), aFavor.semaforo]).toEqual(["5000", "105000", "VERDE"]);
  });

  it("límite: bloquea con el exceso a pagar; advierte si queda en ROJO; contado no cambia la deuda (RN-063)", () => {
    const bloqueo = verificarLimite({ limite: "500000", saldoActual: "470000", totalCompra: "60000", pagadoEnElActo: "0", rojoPct: "90" });
    expect(bloqueo.resultado === "BLOQUEO" && [bloqueo.exceso.toString(), bloqueo.saldoProyectado.toString()]).toEqual(["30000", "530000"]);
    const mixta = verificarLimite({ limite: "400000", saldoActual: "150000", totalCompra: "228550", pagadoEnElActo: "100000", rojoPct: "90" });
    expect(mixta).toEqual({ resultado: "OK" });
    const rojo = verificarLimite({ limite: "500000", saldoActual: "400000", totalCompra: "60000", pagadoEnElActo: "0", rojoPct: "90" });
    expect(rojo.resultado === "ADVERTENCIA" && rojo.usoProyectadoPct.toString()).toBe("92");
    expect(verificarLimite({ limite: "100", saldoActual: "1000", totalCompra: "500", pagadoEnElActo: "500", rojoPct: "90" })).toEqual({ resultado: "OK" });
    expect(verificarLimite({ limite: null, saldoActual: "1000000", totalCompra: "500", pagadoEnElActo: "0", rojoPct: "90" })).toEqual({ resultado: "OK" });
  });

  it("estado de pago de una compra (RN-099) e imputación FIFO (RN-096, RN-098)", () => {
    expect([estadoPagoCompra("228550", "100000"), estadoPagoCompra("137500", "137500"), estadoPagoCompra("162000", "0")]).toEqual(["PARCIAL", "PAGADA", "PENDIENTE"]);
    const r = imputarFIFO([{ id: "vieja", pendiente: "15000" }, { id: "saldada", pendiente: "0" }, { id: "nueva", pendiente: "162000" }], "100000");
    expect(r.imputaciones.map((i) => [i.id, i.monto.toString()])).toEqual([
      ["vieja", "15000"],
      ["nueva", "85000"],
    ]);
    expect(r.sobrante.toString()).toBe("0");
    expect(imputarFIFO([{ id: "unica", pendiente: "10" }], "25").sobrante.toString()).toBe("15");
    expect(imputarFIFO([{ id: "a", pendiente: "10" }, { id: "b", pendiente: "10" }], "10").imputaciones.map((i) => i.id)).toEqual(["a"]);
  });

  it("costo real ponderado del tomate: $925/kg (05 §4.2)", () => {
    expect(costoRealPonderado([{ cantidadBase: "180", subtotal: "162000" }, { cantidadBase: "90", subtotal: "87750" }])?.toString()).toBe("925");
    expect(costoRealPonderado([])).toBeNull();
  });
});

describe("cuenta corriente: imputaciones, vencimientos y libro (06 §4, §7, §11)", () => {
  it("aplica el saldo a favor por FIFO: PAG-000040 sobra $30.000 y cancela parte de COM-000140 (06 §12 paso 12)", () => {
    const pares = conciliarFIFO(
      [
        { id: "PAG-000040", libre: "30000" },
        { id: "PAG-vacio", libre: "0" },
      ],
      [
        { id: "COM-000101", pendiente: "0" },
        { id: "COM-000140", pendiente: "45000" },
      ],
    );
    expect(pares.map((p) => [p.acreedorId, p.deudorId, p.monto.toString()])).toEqual([["PAG-000040", "COM-000140", "30000"]]);
  });

  it("varios créditos se reparten las deudas sin pasarse de lo pendiente", () => {
    const pares = conciliarFIFO(
      [
        { id: "P1", libre: "70" },
        { id: "P2", libre: "50" },
      ],
      [
        { id: "C1", pendiente: "60" },
        { id: "C2", pendiente: "40" },
      ],
    );
    expect(pares.map((p) => [p.acreedorId, p.deudorId, p.monto.toString()])).toEqual([
      ["P1", "C1", "60"],
      ["P1", "C2", "10"],
      ["P2", "C2", "30"],
    ]);
  });

  it("imputación manual (RN-097): valida importes y devuelve lo que queda a favor", () => {
    const pendientes = [
      { id: "COM-000110", pendiente: "100000" },
      { id: "COM-000118", pendiente: "110000" },
    ];
    expect(validarImputacionManual(pendientes, [{ id: "COM-000118", monto: "110000" }], "150000").toString()).toBe("40000");
    expect(() => validarImputacionManual(pendientes, [{ id: "COM-000118", monto: "120000" }], "150000")).toThrow(/más de lo que tiene pendiente/);
    expect(() => validarImputacionManual(pendientes, [{ id: "COM-000110", monto: "0" }], "150000")).toThrow(/mayor que \$0/);
    expect(() => validarImputacionManual(pendientes, [{ id: "COM-999", monto: "10" }], "150000")).toThrow(/ya no tiene deuda/);
    expect(() =>
      validarImputacionManual(
        pendientes,
        [
          { id: "COM-000110", monto: "100000" },
          { id: "COM-000118", monto: "60000" },
        ],
        "150000",
      ),
    ).toThrow(/supera el monto del pago/);
  });

  it("vencimientos (06 §7): al 13/09 COM-000125 lleva 1 día vencida; lo que vence pronto se avisa", () => {
    expect(diasDeAtraso("2026-09-12", "2026-09-13")).toBe(1);
    expect(diasDeAtraso("2026-09-13", "2026-09-13")).toBeNull();
    expect(diasDeAtraso(null, "2026-09-13")).toBeNull();
    const r = resumenVencimientos(
      [
        { pendiente: "170000", vence: "2026-09-12" },
        { pendiente: "5000", vence: "2026-09-05" },
        { pendiente: "0", vence: "2026-09-01" },
        { pendiente: "20000", vence: null },
        { pendiente: "15000", vence: "2026-09-15" },
        { pendiente: "8000", vence: "2026-09-15" },
        { pendiente: "40000", vence: "2026-09-23" },
      ],
      "2026-09-13",
      3,
    );
    expect([r.vencida.toString(), r.maxDiasAtraso, r.porVencer.toString(), r.proximo?.fecha, r.proximo?.monto.toString()]).toEqual(["175000", 8, "23000", "2026-09-15", "23000"]);
    expect(resumenVencimientos([], "2026-09-13", 3)).toMatchObject({ proximo: null, maxDiasAtraso: null });
  });

  it("libro con Debe, Haber y saldo acumulado (DOC-05)", () => {
    const libro = libroConSaldo("0", [{ importe: "120000" }, { importe: "-120000" }, { importe: "180000" }, { importe: "-200000" }]);
    expect(libro.map((l) => [l.debe.toString(), l.haber.toString(), l.saldo.toString()])).toEqual([
      ["120000", "0", "120000"],
      ["0", "120000", "0"],
      ["180000", "0", "180000"],
      ["0", "200000", "-20000"],
    ]);
  });
});

describe("tilde de comprado sin anotar la compra (tablero y lista)", () => {
  it("un producto tildado cuenta como comprado aunque no haya compras; sin tilde, vale lo comprado", () => {
    expect(estadoLineaLista("100", "0", false, true)).toBe("COMPRADO");
    expect(estadoLineaLista("100", "40", false, true)).toBe("COMPRADO");
    expect(estadoLineaLista("100", "0", false, false)).toBe("PENDIENTE");
    expect(calcularLineaLista({ necesidadBase: "36", compradoBase: "0", factor: "18", cantidadManual: null, marcadaNoConseguido: false, tildada: true }).estado).toBe("COMPRADO");
  });

  it("el tilde vale para lo que hacía falta cuando se puso: si después hace falta más, se pierde", () => {
    expect(tildeSigueValiendo(true, "36", "36")).toBe(true);
    expect(tildeSigueValiendo(true, "36", "20")).toBe(true);
    expect(tildeSigueValiendo(true, "36", "54")).toBe(false);
    expect(tildeSigueValiendo(false, "36", "36")).toBe(false);
  });
});
