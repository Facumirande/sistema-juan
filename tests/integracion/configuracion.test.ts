import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { auditoria } from "@/db/esquema";
import { enEmpresa } from "@/db/transaccion";
import { configuracionDeEmpresa, guardarConfiguracion } from "@/modulos/configuracion/empresa";
import { obtenerPedido } from "@/modulos/pedidos/pedidos";

import { codigoDeError } from "./base-de-prueba";
import { prepararJornada2409, type Jornada2409 } from "./escenario-24-09";

// P-95 Configuración del negocio (iteración 8).

let j: Jornada2409;

const base = {
  nombre: "Frutas Juan",
  direccion: "Mercado Central, nave 4",
  telefono: "",
  email: "",
  identificacionFiscal: "",
  redondeo: "CERCANO_1" as const,
  margenMinimoPct: "15",
  variacionBruscaPct: "30",
  diasAlertaPrecioDesactualizado: "7",
  semaforoAmarilloPct: "70",
  semaforoRojoPct: "90",
  diasAvisoVencimiento: "3",
  horaCortePedidos: "",
  toleranciaPesoPct: "3",
};

beforeAll(async () => {
  j = await prepararJornada2409();
});

describe("configuración del negocio", () => {
  it("muestra el redondeo como una de las opciones y los valores guardados", async () => {
    const c = await configuracionDeEmpresa(j.base.db, j.admin);
    // El escenario usa redondeo para arriba a $10.
    expect([c.redondeo, c.margenMinimoPct, c.semaforoAmarilloPct, c.semaforoRojoPct, c.horaCortePedidos]).toEqual(["ARRIBA_10", "15", "70", "90", null]);
  });

  it("guarda los datos, deja la auditoría y recalcula los pedidos pendientes si cambia el redondeo", async () => {
    const antes = (await obtenerPedido(j.base.db, j.admin, j.ids.pedRestaurante!)).totalEstimado;
    const r = await guardarConfiguracion(j.base.db, j.admin, { ...base, horaCortePedidos: "20:00" });
    expect(r.pedidosRecalculados).toBeGreaterThan(0);
    const c = await configuracionDeEmpresa(j.base.db, j.admin);
    expect([c.nombre, c.direccion, c.redondeo, c.horaCortePedidos]).toEqual(["Frutas Juan", "Mercado Central, nave 4", "CERCANO_1", "20:00"]);
    expect((await obtenerPedido(j.base.db, j.admin, j.ids.pedRestaurante!)).totalEstimado).not.toBe(antes);
    const [registro] = await enEmpresa(j.base.db, j.empresaId, (tx) =>
      tx.select().from(auditoria).where(and(eq(auditoria.accion, "CAMBIO_CONFIGURACION"), eq(auditoria.entidadId, j.empresaId))),
    );
    expect(registro).toMatchObject({ datosAntes: { redondeoModo: "ARRIBA" }, datosDespues: { redondeoModo: "CERCANO" } });
    // Sin cambios de precio, no se recalcula nada.
    expect((await guardarConfiguracion(j.base.db, j.admin, { ...base, horaCortePedidos: "20:00" })).pedidosRecalculados).toBe(0);
  });

  it("explica qué corregir si algo no tiene sentido", async () => {
    await expect(guardarConfiguracion(j.base.db, j.admin, { ...base, semaforoAmarilloPct: "95" })).rejects.toThrow("El amarillo del semáforo tiene que ser menor que el rojo");
    await expect(guardarConfiguracion(j.base.db, j.admin, { ...base, horaCortePedidos: "25:00" })).rejects.toThrow("La hora de corte va en formato 24 h");
    await expect(guardarConfiguracion(j.base.db, j.admin, { ...base, nombre: " " })).rejects.toThrow("Escribí el nombre del negocio");
  });

  it("el comprador no la cambia", async () => {
    expect(await codigoDeError(guardarConfiguracion(j.base.db, j.comprador, base))).toBe("SIN_PERMISO");
  });
});
