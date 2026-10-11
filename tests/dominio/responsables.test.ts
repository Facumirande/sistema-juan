import { describe, expect, it } from "vitest";

import { ETAPAS_CON_RESPONSABLE, ETAPAS_PARA_ELEGIR, leerResponsables } from "@/dominio/pedidos/responsables";
import { COLUMNAS_A_LA_VISTA } from "@/dominio/pedidos/tablero";

// Quién se encarga de cada parte del proceso (pedido del usuario, 10/10/2026, RN-190).

const ID = "0b9f6c1e-3f5a-4d2b-9c1a-7e8d6f5a4b3c";

describe("responsables por etapa", () => {
  it("una persona por columna del tablero, salvo Entregados", () => {
    expect(ETAPAS_CON_RESPONSABLE.map((e) => e.clave)).toEqual(["pedidos", "en_lista", "comprados", "preparando", "en_camino"]);
  });

  it("para elegir se ofrecen solo las etapas de las columnas que el tablero muestra", () => {
    const aLaVista = COLUMNAS_A_LA_VISTA.map((c) => c.clave as string);
    expect(ETAPAS_PARA_ELEGIR.map((e) => e.clave)).toEqual(ETAPAS_CON_RESPONSABLE.map((e) => e.clave).filter((c) => aLaVista.includes(c)));
  });

  it("de lo guardado se toma solo lo válido", () => {
    expect(leerResponsables({ en_lista: ID, preparando: ID })).toEqual({ en_lista: ID, preparando: ID });
    expect(leerResponsables({ en_lista: "no-es-un-id", entregados: ID, otra: ID, pedidos: 5 })).toEqual({});
    expect(leerResponsables(null)).toEqual({});
    expect(leerResponsables([ID])).toEqual({});
    expect(leerResponsables("x")).toEqual({});
  });
});
