import { dec, sumar } from "@/dominio/dinero/decimal";
import { diasEntre, sumarDias, type FechaISO } from "@/dominio/fechas/fechas";

// Balance en el tiempo: agrupa importes por día, semana (de lunes a domingo) o mes, con todos los
// períodos del rango aunque no tengan movimientos (un hueco es un cero, no un punto que falta).

export type Agrupacion = "DIA" | "SEMANA" | "MES";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Día, semana hasta ~2 meses y medio, mes para más. */
export function agrupacionSugerida(desde: FechaISO, hasta: FechaISO): Agrupacion {
  const dias = diasEntre(desde, hasta) + 1;
  if (dias <= 31) return "DIA";
  if (dias <= 91) return "SEMANA";
  return "MES";
}

/** Primer día del período al que pertenece la fecha. */
export function inicioDePeriodo(fecha: FechaISO, agrupacion: Agrupacion): FechaISO {
  if (agrupacion === "DIA") return fecha;
  if (agrupacion === "MES") return `${fecha.slice(0, 7)}-01`;
  const diaSemana = new Date(`${fecha}T12:00:00Z`).getUTCDay(); // 0 = domingo
  return sumarDias(fecha, -((diaSemana + 6) % 7));
}

function siguientePeriodo(inicio: FechaISO, agrupacion: Agrupacion): FechaISO {
  if (agrupacion === "DIA") return sumarDias(inicio, 1);
  if (agrupacion === "SEMANA") return sumarDias(inicio, 7);
  const [a, m] = [Number(inicio.slice(0, 4)), Number(inicio.slice(5, 7))];
  return m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;
}

/** Inicio de cada período que toca el rango, en orden. */
export function periodosEntre(desde: FechaISO, hasta: FechaISO, agrupacion: Agrupacion): FechaISO[] {
  const res: FechaISO[] = [];
  for (let p = inicioDePeriodo(desde, agrupacion); p <= hasta; p = siguientePeriodo(p, agrupacion)) res.push(p);
  return res;
}

/** "28/09", "sem. 22/09" o "sep 2026". */
export function etiquetaDePeriodo(inicio: FechaISO, agrupacion: Agrupacion): string {
  const dm = `${inicio.slice(8, 10)}/${inicio.slice(5, 7)}`;
  if (agrupacion === "DIA") return dm;
  if (agrupacion === "SEMANA") return `sem. ${dm}`;
  return `${MESES[Number(inicio.slice(5, 7)) - 1]} ${inicio.slice(0, 4)}`;
}

export interface Movimiento<C extends string> {
  fecha: FechaISO;
  valores: Partial<Record<C, string>>;
}

export interface Serie<C extends string> {
  periodo: FechaISO;
  etiqueta: string;
  valores: Record<C, string>;
}

/** Suma cada campo por período; los períodos sin movimientos quedan en cero. */
export function agruparPorPeriodo<C extends string>(movimientos: readonly Movimiento<C>[], campos: readonly C[], desde: FechaISO, hasta: FechaISO, agrupacion: Agrupacion): Serie<C>[] {
  const porPeriodo = new Map<FechaISO, Movimiento<C>[]>();
  for (const m of movimientos) {
    if (m.fecha < desde || m.fecha > hasta) continue;
    const p = inicioDePeriodo(m.fecha, agrupacion);
    porPeriodo.set(p, [...(porPeriodo.get(p) ?? []), m]);
  }
  return periodosEntre(desde, hasta, agrupacion).map((periodo) => {
    const del = porPeriodo.get(periodo) ?? [];
    const valores = Object.fromEntries(campos.map((c) => [c, sumar(del.map((m) => m.valores[c] ?? "0")).toFixed(2)])) as Record<C, string>;
    return { periodo, etiqueta: etiquetaDePeriodo(periodo, agrupacion), valores };
  });
}

/**
 * Saldo al final de cada período a partir de un saldo inicial y los movimientos (+ suma, − resta):
 * la deuda con proveedores a lo largo del tiempo.
 */
export function saldoAlFinalDeCadaPeriodo(saldoInicial: string, movimientos: readonly { fecha: FechaISO; importe: string }[], desde: FechaISO, hasta: FechaISO, agrupacion: Agrupacion): Serie<"saldo">[] {
  let saldo = dec(saldoInicial);
  return agruparPorPeriodo(
    movimientos.map((m) => ({ fecha: m.fecha, valores: { saldo: m.importe } })),
    ["saldo"],
    desde,
    hasta,
    agrupacion,
  ).map((s) => {
    saldo = saldo.plus(s.valores.saldo);
    return { ...s, valores: { saldo: saldo.toFixed(2) } };
  });
}
