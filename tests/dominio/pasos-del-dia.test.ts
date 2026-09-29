import { describe, expect, it } from "vitest";

import { pasosDelDia, type DatosDelDia } from "@/dominio/jornadas/pasos";

const vacio: DatosDelDia = {
  jornada: null,
  pedidos: { confirmados: 0, borradores: 0 },
  lista: { armada: false, desactualizada: false, lineas: 0, resueltas: 0, fueraDeLista: 0 },
  compras: 0,
  entregas: { total: 0, preparadas: 0, conDocumentos: 0, enCamino: 0, entregadas: 0 },
  repartos: 0,
};
const con = (cambios: Partial<DatosDelDia>): DatosDelDia => ({ ...vacio, ...cambios });
const estados = (d: DatosDelDia) => Object.fromEntries(pasosDelDia(d).pasos.map((p) => [p.clave, p.estado]));

const confirmados = { confirmados: 3, borradores: 0 };
const listaArmada = { armada: true, desactualizada: false, lineas: 5, resueltas: 0, fueraDeLista: 0 };
const comprado = { ...listaArmada, resueltas: 5 };

describe("el día de trabajo paso a paso", () => {
  it("sin pedidos, lo primero es cargarlos; un borrador deja los pedidos en curso", () => {
    expect(pasosDelDia(vacio)).toMatchObject({ actual: "pedidos", hechos: 0 });
    expect(estados(con({ jornada: "ABIERTA", pedidos: { confirmados: 0, borradores: 1 } })).pedidos).toBe("en_curso");
  });

  it("con los pedidos confirmados toca armar la lista, y después comprar", () => {
    expect(pasosDelDia(con({ jornada: "ABIERTA", pedidos: confirmados }))).toMatchObject({ actual: "lista", hechos: 1 });
    expect(pasosDelDia(con({ jornada: "COMPRANDO", pedidos: confirmados, lista: listaArmada }))).toMatchObject({ actual: "compras", hechos: 2 });
  });

  it("un pedido nuevo después de armar la lista: la lista queda desactualizada y es lo que toca", () => {
    const d = con({ jornada: "COMPRANDO", pedidos: confirmados, lista: { ...listaArmada, desactualizada: true, resueltas: 2 }, compras: 2 });
    expect(estados(d)).toMatchObject({ lista: "en_curso", compras: "en_curso" });
    expect(pasosDelDia(d).actual).toBe("lista");
  });

  it("un pedido confirmado que no se agregó a la lista la deja en curso", () => {
    const d = con({ jornada: "COMPRANDO", pedidos: { confirmados: 4, borradores: 0 }, lista: { ...listaArmada, fueraDeLista: 1 } });
    expect(estados(d).lista).toBe("en_curso");
    expect(pasosDelDia(d).actual).toBe("lista");
  });

  it("un borrador que quedó colgado no frena el día si la lista ya está armada", () => {
    const d = con({ jornada: "COMPRANDO", pedidos: { confirmados: 3, borradores: 1 }, lista: listaArmada });
    expect(estados(d).pedidos).toBe("en_curso");
    expect(pasosDelDia(d).actual).toBe("compras");
  });

  it("compras en curso y terminadas", () => {
    const d = con({ jornada: "COMPRANDO", pedidos: confirmados, lista: { ...listaArmada, resueltas: 2 }, compras: 2 });
    expect(pasosDelDia(d).actual).toBe("compras");
    expect(pasosDelDia({ ...d, lista: comprado }).actual).toBe("preparacion");
  });

  it("preparación, remitos, reparto y entrega, cierre", () => {
    const d = con({
      jornada: "PREPARANDO",
      pedidos: confirmados,
      lista: comprado,
      compras: 4,
      entregas: { total: 3, preparadas: 1, conDocumentos: 1, enCamino: 0, entregadas: 0 },
    });
    // Se preparan y se emiten remitos de a un cliente: toca seguir preparando.
    expect(estados(d)).toMatchObject({ preparacion: "en_curso", remitos: "en_curso", entregas: "pendiente" });
    expect(pasosDelDia(d).actual).toBe("preparacion");
    const preparado = { ...d, entregas: { ...d.entregas, preparadas: 3 } };
    expect(pasosDelDia(preparado).actual).toBe("remitos");
    const enCamino = { ...d, jornada: "REPARTIENDO", repartos: 1, entregas: { total: 3, preparadas: 3, conDocumentos: 3, enCamino: 3, entregadas: 1 } };
    expect(pasosDelDia(enCamino)).toMatchObject({ actual: "entregas", hechos: 5 });
    const entregado = { ...enCamino, entregas: { ...enCamino.entregas, entregadas: 3 } };
    expect(pasosDelDia(entregado)).toMatchObject({ actual: "cierre", hechos: 6 });
    expect(pasosDelDia({ ...entregado, jornada: "CERRADA" })).toMatchObject({ actual: null, hechos: 7 });
  });

  it("lo que no se compró no traba el día una vez que se preparó todo", () => {
    const d = con({
      jornada: "PREPARANDO",
      pedidos: confirmados,
      lista: { ...listaArmada, resueltas: 4 },
      compras: 3,
      entregas: { total: 2, preparadas: 2, conDocumentos: 0, enCamino: 0, entregadas: 0 },
    });
    expect(estados(d).compras).toBe("en_curso");
    expect(pasosDelDia(d).actual).toBe("remitos");
  });

  it("si se preparó sin armar la lista ni comprar, esos pasos quedan salteados", () => {
    const d = con({ jornada: "PREPARANDO", pedidos: { confirmados: 2, borradores: 0 }, entregas: { total: 2, preparadas: 0, conDocumentos: 0, enCamino: 0, entregadas: 0 } });
    expect(estados(d)).toMatchObject({ pedidos: "hecho", lista: "salteado", compras: "salteado", preparacion: "en_curso" });
    expect(pasosDelDia(d).actual).toBe("preparacion");
  });
});
