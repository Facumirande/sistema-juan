/** Un parámetro de la URL (`?texto=tom`) como texto; si vino repetido, el primero. */
export function parametro(valor: string | string[] | undefined): string | undefined {
  const v = Array.isArray(valor) ? valor[0] : valor;
  return v?.trim() ? v.trim() : undefined;
}

/** Filtro de estado de los listados de maestros. */
export function estadoFiltro(valor: string | string[] | undefined): "activos" | "inactivos" | "todos" {
  const v = parametro(valor);
  return v === "inactivos" || v === "todos" ? v : "activos";
}

export const OPCIONES_ESTADO = [
  { valor: "activos", etiqueta: "Activos" },
  { valor: "inactivos", etiqueta: "Desactivados" },
  { valor: "todos", etiqueta: "Todos" },
] as const;
