// "🚚 Sale ahora" (pedido del usuario, 06/10/2026): pasar pedidos de "Preparando" a "En camino" en
// un solo paso. Decide qué repartos salen con las entregas elegidas: las que ya están en un reparto
// armado salen con ese reparto (y todas sus paradas); las sueltas se suman a ese reparto si hay uno
// solo, o salen juntas en un reparto nuevo.

export interface EntregaParaSalir {
  id: string;
  /** Reparto armado (PLANIFICADO) en el que está; nulo si está suelta. */
  repartoPlanificado: string | null;
  /** Ya salió o se entregó: no se toca. */
  yaSalio: boolean;
}

export interface PlanDeSalida {
  /** Repartos armados que salen (con todas sus paradas). */
  repartos: string[];
  /** Entregas sueltas que se suman a un reparto armado antes de salir. */
  agregar: { repartoId: string; entregaIds: string[] } | null;
  /** Entregas sueltas que salen juntas en un reparto nuevo. */
  nuevo: string[];
  /** Elegidas que ya estaban en camino o entregadas. */
  yaSalieron: string[];
}

export function planDeSalida(elegidas: readonly EntregaParaSalir[]): PlanDeSalida {
  const pendientes = elegidas.filter((e) => !e.yaSalio);
  const repartos = [...new Set(pendientes.map((e) => e.repartoPlanificado).filter((r): r is string => r !== null))];
  const sueltas = pendientes.filter((e) => e.repartoPlanificado === null).map((e) => e.id);
  const unico = repartos.length === 1 ? repartos[0]! : null;
  return {
    repartos,
    agregar: unico && sueltas.length > 0 ? { repartoId: unico, entregaIds: sueltas } : null,
    nuevo: unico ? [] : sueltas,
    yaSalieron: elegidas.filter((e) => e.yaSalio).map((e) => e.id),
  };
}

/** Cómo se dicen los clientes de una lista: "A", "A y B", "A, B y C". */
export function enumerar(nombres: readonly string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? "";
  return `${nombres.slice(0, -1).join(", ")} y ${nombres.at(-1)}`;
}
