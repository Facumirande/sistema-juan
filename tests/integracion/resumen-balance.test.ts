import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { jornada } from "@/db/esquema";
import { dec } from "@/dominio/dinero/decimal";
import { sumarDias } from "@/dominio/fechas/fechas";
import type { ResumenBalance } from "@/dominio/reportes/resumen-balance";
import { avisosPara } from "@/modulos/colaboracion/avisos";
import { listarCompras } from "@/modulos/compras/compras";
import { pagarDeuda } from "@/modulos/compras/pagos";
import { listarCuentasClientes, registrarCobro } from "@/modulos/cuentas-clientes/cuentas";
import { entregarPedido } from "@/modulos/entregas/entregas";
import { iniciarPreparacion } from "@/modulos/entregas/preparacion";
import { mandarEnCamino } from "@/modulos/entregas/repartos";
import { gastosEIngresos, registrarMovimientoExtra } from "@/modulos/gastos/gastos";
import { guardarCajaInicial } from "@/modulos/jornadas/caja";
import { diaDeTrabajo } from "@/modulos/jornadas/dia";

import { codigoDeError, crearUsuarioDePrueba } from "./base-de-prueba";
import { prepararJornada2409, type Jornada2409 } from "./escenario-24-09";

// El resumen balance del tablero (pedido del usuario, 10 y 11/10/2026; RN-180 y RN-194): lo pagado y
// lo que quedó a crédito de las compras del día, la ganancia (lo ya cobrado menos lo pagado), lo que
// falta cobrar, y la caja inicial que se carga por día, con su aviso cuando los gastos la superan.
// Las compras del escenario: $162.000 a cuenta, $228.550 con $100.000 pagados, $137.500 de contado
// y $125.000 a cuenta (total $653.050).

let j: Jornada2409;

beforeAll(async () => {
  j = await prepararJornada2409();
});

const texto = (r: ResumenBalance | null) =>
  r && { pagado: r.pagado.toString(), credito: r.credito.toString(), ganancia: r.ganancia.toString(), aCobrar: r.aCobrar.toString(), caja: r.cajaInicial?.toString() ?? null, exceso: r.exceso?.toString() ?? null };
const resumen = async (fecha = j.manana, auth = j.admin) => texto((await diaDeTrabajo(j.base.db, auth, fecha, { conTablero: true })).resumen);
const superadas = async () => (await avisosPara(j.base.db, j.admin, 5)).cajaSuperada;

describe("el resumen balance del tablero (RN-180)", () => {
  it("lo pagado y lo que quedó a crédito de las compras del día; sin cobrar nada, la ganancia es lo que salió", async () => {
    expect(await resumen()).toEqual({ pagado: "237500", credito: "415550", ganancia: "-237500", aCobrar: "0", caja: null, exceso: null });
  });

  it("un gasto anotado con la fecha de un día suma a lo pagado de ese día (aunque no tenga pedidos)", async () => {
    // Los gastos se anotan con la fecha en que se hicieron (hoy o antes): el escenario compra para mañana.
    const hoy = sumarDias(j.manana, -1);
    const { rubros } = await gastosEIngresos(j.base.db, j.admin, { desde: hoy, hasta: hoy });
    await registrarMovimientoExtra(j.base.db, j.admin, { rubroId: rubros.find((r) => r.nombre === "Nafta")!.id, monto: "20.000", cantidad: "", fecha: hoy, detalle: "", medioPago: "EFECTIVO" });
    expect(await resumen(hoy)).toEqual({ pagado: "20000", credito: "0", ganancia: "-20000", aCobrar: "0", caja: null, exceso: null });
    // Con la caja de hoy en $15.000, ese gasto solo ya la supera.
    await guardarCajaInicial(j.base.db, j.admin, { fecha: hoy, monto: "15.000" });
    expect(await resumen(hoy)).toMatchObject({ caja: "15000", exceso: "5000" });
    expect(await superadas()).toMatchObject([{ fecha: hoy, exceso: "5000" }]);
    await guardarCajaInicial(j.base.db, j.admin, { fecha: hoy, monto: "" });
    // El día de mañana no cambia.
    expect(await resumen()).toMatchObject({ pagado: "237500", credito: "415550" });
  });

  it("pagar una compra que estaba a cuenta la pasa de crédito a pagado", async () => {
    const aCuenta = (await listarCompras(j.base.db, j.admin, { fecha: j.manana })).find((c) => c.total === "125000.00")!;
    await pagarDeuda(j.base.db, j.admin, { proveedorId: aCuenta.proveedorId, clave: `C:${aCuenta.id}`, medio: "EFECTIVO" });
    expect(await resumen()).toMatchObject({ pagado: "362500", credito: "290550", ganancia: "-362500" });
  });

  it("lo entregado queda a cobrar; al cobrarlo pasa a la ganancia (lo cobrado menos lo pagado)", async () => {
    await iniciarPreparacion(j.base.db, j.admin, j.manana);
    await mandarEnCamino(j.base.db, j.admin, { pedidoIds: [j.ids.pedRestaurante!], confirmar: true });
    // En camino todavía no se debe nada: la deuda nace al entregar.
    expect(await resumen()).toMatchObject({ aCobrar: "0", ganancia: "-362500" });
    await entregarPedido(j.base.db, j.admin, j.ids.pedRestaurante!);
    const debe = dec((await listarCuentasClientes(j.base.db, j.admin)).cuentas.find((c) => c.clienteId === j.ids.restaurante)!.aCobrar);
    expect(debe.gt(100000)).toBe(true);
    expect(await resumen()).toMatchObject({ aCobrar: debe.toFixed(0), ganancia: "-362500" });

    // Paga una parte: eso ya es plata que volvió.
    await registrarCobro(j.base.db, j.admin, { clienteId: j.ids.restaurante!, monto: "100.000", medioPago: "EFECTIVO" });
    expect(await resumen()).toMatchObject({ aCobrar: debe.minus(100000).toFixed(0), ganancia: "-262500", pagado: "362500", credito: "290550" });
    // Paga el resto: no queda nada a cobrar de lo entregado.
    await registrarCobro(j.base.db, j.admin, { clienteId: j.ids.restaurante!, medioPago: "EFECTIVO" });
    expect(await resumen()).toMatchObject({ aCobrar: "0", ganancia: debe.minus(362500).toFixed(0) });
  });

  it("la caja inicial se carga por día; si los gastos la superan, lo avisan el resumen y la campanita", async () => {
    expect(await guardarCajaInicial(j.base.db, j.admin, { fecha: j.manana, monto: "700.000" })).toEqual({ cajaInicial: "700000.00" });
    expect(await resumen()).toMatchObject({ caja: "700000", exceso: null });
    expect(await superadas()).toEqual([]);

    // Los gastos del día son lo pagado más lo que quedó a crédito: $653.050.
    await guardarCajaInicial(j.base.db, j.admin, { fecha: j.manana, monto: "500000" });
    expect(await resumen()).toMatchObject({ caja: "500000", exceso: "153050" });
    expect(await superadas()).toMatchObject([{ fecha: j.manana, gastos: "653050", cajaInicial: "500000", exceso: "153050", href: `/inicio?fecha=${j.manana}` }]);

    // Vacía, queda sin cargar: no hay con qué comparar y no se avisa nada.
    expect(await guardarCajaInicial(j.base.db, j.admin, { fecha: j.manana, monto: "" })).toEqual({ cajaInicial: null });
    expect(await resumen()).toMatchObject({ caja: null, exceso: null });
    expect(await superadas()).toEqual([]);
  });

  it("se le puede cargar la caja a un día que todavía no tiene nada", async () => {
    const otro = sumarDias(j.manana, 5);
    await guardarCajaInicial(j.base.db, j.admin, { fecha: otro, monto: "$ 100.000" });
    expect(await resumen(otro)).toEqual({ pagado: "0", credito: "0", ganancia: "0", aCobrar: "0", caja: "100000", exceso: null });
    const d = await diaDeTrabajo(j.base.db, j.admin, otro, { conTablero: true });
    expect([d.panel.estado, d.tablero?.columnas.flatMap((c) => c.tarjetas).length]).toEqual(["ABIERTA", 0]);
  });

  it("no acepta un importe que no es un número ni uno negativo, ni cambia la caja de un día cerrado", async () => {
    expect(await codigoDeError(guardarCajaInicial(j.base.db, j.admin, { fecha: j.manana, monto: "mucha" }))).toBe("VALIDACION");
    expect(await codigoDeError(guardarCajaInicial(j.base.db, j.admin, { fecha: j.manana, monto: "-5" }))).toBe("VALIDACION");
    expect(await codigoDeError(guardarCajaInicial(j.base.db, j.admin, { fecha: "mañana", monto: "100" }))).toBe("VALIDACION");

    const cerrado = sumarDias(j.manana, 5);
    await j.base.comoSuperusuario(() => j.base.db.update(jornada).set({ estado: "CERRADA" }).where(eq(jornada.fecha, cerrado)));
    expect(await codigoDeError(guardarCajaInicial(j.base.db, j.admin, { fecha: cerrado, monto: "900.000" }))).toBe("JORNADA_CERRADA");
    expect(await resumen(cerrado)).toMatchObject({ caja: "100000" });
  });

  it("quien no puede ver los pagos no ve el resumen ni carga la caja", async () => {
    const vendedora = await crearUsuarioDePrueba(j.base.db, j.empresaId, "Vera Ventas", ["VENDEDOR"]);
    expect(await resumen(j.manana, vendedora)).toBeNull();
    expect(await codigoDeError(guardarCajaInicial(j.base.db, vendedora, { fecha: j.manana, monto: "100" }))).toBe("SIN_PERMISO");
  });
});
