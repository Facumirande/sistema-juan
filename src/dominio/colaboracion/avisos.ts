// Avisos de la campanita (06/10/2026): lo que hicieron las otras personas desde la última vez que
// se miró, y las notas sin leer. Acá, las reglas que no dependen de la base.

export interface AvisoAgrupable {
  clase: "ACTIVIDAD" | "NOTA";
  accion: string;
  personaId: string;
  /** "LISTA_COMPRA:<id>": de qué habla. */
  entidad: string | null;
  resumen: string;
  nuevo: boolean;
}

/** Los tildes de la lista de compras son muchos y chicos: seguidos y de la misma persona, cuentan como uno. */
const seAgrupa = (a: AvisoAgrupable) => a.clase === "ACTIVIDAD" && a.accion === "TILDAR" && a.entidad !== null && a.entidad.startsWith("LISTA_COMPRA:");

/**
 * Junta los avisos seguidos de la misma persona sobre la misma lista de compras ("tildó como
 * comprado: Tomate", "…: Papa") en uno solo ("marcó 2 productos en la lista de compras"). Vienen
 * del más nuevo al más viejo; el grupo queda en el lugar del más nuevo.
 */
export function agruparAvisos<T extends AvisoAgrupable>(avisos: readonly T[]): (T & { veces: number })[] {
  const grupos: (T & { veces: number })[] = [];
  for (const a of avisos) {
    const ultimo = grupos.at(-1);
    if (ultimo && seAgrupa(a) && seAgrupa(ultimo) && ultimo.personaId === a.personaId && ultimo.entidad === a.entidad) {
      ultimo.veces++;
      ultimo.nuevo = ultimo.nuevo || a.nuevo;
      ultimo.resumen = `marcó ${ultimo.veces} productos en la lista de compras`;
    } else grupos.push({ ...a, veces: 1 });
  }
  return grupos;
}

/** El texto del cartelito que aparece cuando llega algo nuevo: lo que pasó, o cuántas cosas si son varias. */
export function textoDeNovedades(novedades: readonly { persona: string; resumen: string }[]): string | null {
  if (novedades.length === 0) return null;
  const primerNombre = (n: string) => n.trim().split(" ", 1).join("");
  if (novedades.length === 1) return `${primerNombre(novedades[0]!.persona)} ${novedades[0]!.resumen}`;
  const personas = [...new Set(novedades.map((n) => primerNombre(n.persona)))];
  const quienes = personas.length === 1 ? personas[0]! : `${personas.slice(0, -1).join(", ")} y ${personas.at(-1)}`;
  return `${quienes} ${personas.length === 1 ? "hizo" : "hicieron"} ${novedades.length} cosas nuevas`;
}
