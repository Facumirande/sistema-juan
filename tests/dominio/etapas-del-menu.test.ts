import { describe, expect, it } from "vitest";

import { etapasDelMenu } from "@/dominio/jornadas/etapas";
import { pasosDelDia, type DatosDelDia } from "@/dominio/jornadas/pasos";

// Las etapas del día en el menú de la izquierda (pedido del usuario, 06/10/2026).

const vacio: DatosDelDia = {
  jornada: "ABIERTA",
  pedidos: { confirmados: 0, borradores: 0 },
  lista: { armada: false, desactualizada: false, lineas: 0, resueltas: 0, fueraDeLista: 0 },
  compras: 0,
  entregas: { total: 0, preparadas: 0, conDocumentos: 0, enCamino: 0, entregadas: 0 },
  repartos: 0,
};
const etapas = (cambios: Partial<DatosDelDia>) => {
  const d = { ...vacio, ...cambios };
  return Object.fromEntries(etapasDelMenu(d, pasosDelDia(d)).map((e) => [e.clave, [e.estado, e.detalle]]));
};

describe("etapas del día en el menú", () => {
  it("con pedidos cargados toca la lista de compras", () => {
    expect(etapas({ pedidos: { confirmados: 1, borradores: 1 } })).toEqual({
      pedidos: ["actual", "2 pedidos"],
      lista: ["pendiente", "sin armar"],
      preparacion: ["pendiente", null],
      remitos: ["pendiente", null],
      viaje: ["pendiente", null],
      cierre: ["pendiente", null],
    });
    expect(etapas({ pedidos: { confirmados: 1, borradores: 0 } })).toMatchObject({ pedidos: ["hecho", "1 pedido"], lista: ["actual", "sin armar"] });
  });

  it("comprando, la lista es la etapa actual con lo comprado", () => {
    const e = etapas({ jornada: "COMPRANDO", pedidos: { confirmados: 3, borradores: 0 }, lista: { armada: true, desactualizada: false, lineas: 5, resueltas: 2, fueraDeLista: 0 }, compras: 1 });
    expect(e.lista).toEqual(["actual", "2 de 5 comprados"]);
  });

  it("preparando: listos, remitos hechos y lo que salió", () => {
    const e = etapas({
      jornada: "REPARTIENDO",
      pedidos: { confirmados: 3, borradores: 0 },
      lista: { armada: true, desactualizada: false, lineas: 5, resueltas: 5, fueraDeLista: 0 },
      compras: 2,
      entregas: { total: 3, preparadas: 3, conDocumentos: 3, enCamino: 2, entregadas: 1 },
      repartos: 1,
    });
    expect(e).toEqual({
      pedidos: ["hecho", "3 pedidos"],
      lista: ["hecho", "5 de 5 comprados"],
      preparacion: ["hecho", "3 de 3 listos"],
      remitos: ["hecho", "3 hechos"],
      viaje: ["actual", "1 en camino · 1 entregado"],
      cierre: ["pendiente", null],
    });
    expect(etapas({ jornada: "PREPARANDO", entregas: { total: 2, preparadas: 1, conDocumentos: 1, enCamino: 0, entregadas: 0 } }).remitos).toEqual(["en_curso", "1 hecho"]);
    expect(etapas({ jornada: "REPARTIENDO", entregas: { total: 2, preparadas: 2, conDocumentos: 2, enCamino: 2, entregadas: 2 } }).viaje).toEqual(["hecho", "2 entregados"]);
    expect(etapas({ jornada: "REPARTIENDO", entregas: { total: 2, preparadas: 2, conDocumentos: 2, enCamino: 2, entregadas: 0 } }).viaje?.[1]).toBe("2 en camino");
  });

  it("lo que quedó a medias antes de la etapa actual queda en curso", () => {
    const e = etapas({
      jornada: "PREPARANDO",
      pedidos: { confirmados: 3, borradores: 0 },
      lista: { armada: true, desactualizada: true, lineas: 5, resueltas: 2, fueraDeLista: 0 },
      compras: 1,
      entregas: { total: 2, preparadas: 0, conDocumentos: 0, enCamino: 0, entregadas: 0 },
    });
    expect([e.lista, e.preparacion]).toEqual([
      ["en_curso", "2 de 5 comprados"],
      ["actual", "0 de 2 listos"],
    ]);
  });

  it("un día cerrado tiene todo hecho", () => {
    expect(Object.values(etapas({ jornada: "CERRADA", entregas: { total: 1, preparadas: 1, conDocumentos: 1, enCamino: 1, entregadas: 1 } })).map((x) => x[0])).toEqual(["hecho", "hecho", "hecho", "hecho", "hecho", "hecho"]);
  });
});
