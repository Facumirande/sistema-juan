import { and, asc, eq, gte, lte, ne, or, sql, sum } from "drizzle-orm";

import { compra, entrega, jornada, pedido } from "@/db/esquema";
import type { BaseDatos, Transaccion } from "@/db/tipos";
import { sumarDias, type FechaISO } from "@/dominio/fechas/fechas";
import { etapasDelMenu, type EtapaDelMenu } from "@/dominio/jornadas/etapas";
import { pasosDelDia, type DatosDelDia, type PasosDelDia } from "@/dominio/jornadas/pasos";
import type { ResumenBalance } from "@/dominio/reportes/resumen-balance";
import type { EstadoJornada } from "@/dominio/precios/venta";
import { panelEnTransaccion, type PanelJornada } from "@/modulos/entregas/panel";
import { hoyYSugeridaDe } from "@/modulos/pedidos/jornadas";
import { tableroEnTransaccion, type TableroDePedidos } from "@/modulos/pedidos/tablero";
import { ejecutarComoUsuario } from "@/modulos/seguridad/contexto";

import { resumenBalanceDelDia } from "./caja";

// Pantalla "Hoy": el día de trabajo paso a paso (pedidos → lista → compras → preparación →
// remitos → reparto y entrega → cierre) y los días cercanos para cambiar de jornada.

export interface DiaCercano {
  fecha: FechaISO;
  estado: EstadoJornada | null;
  /** Pedidos confirmados (o más avanzados). */
  pedidos: number;
}

export interface DiaDeTrabajo {
  fecha: FechaISO;
  hoy: FechaISO;
  /** El día de entrega para el que se toman pedidos ahora (mañana, o pasado después del corte). */
  sugerida: FechaISO;
  panel: PanelJornada;
  pasos: PasosDelDia;
  /** El tablero de pedidos de ese día, si se pidió junto (y la persona puede ver pedidos). */
  tablero: TableroDePedidos | null;
  /** Solo con los permisos de precios y en el paso a paso: lo pedido y lo entregado a precio de venta, y lo comprado. */
  plata: { pedido: string | null; comprado: string | null; entregado: string | null };
  /** El resumen balance del tablero: gastos (pagado y crédito) y caja inicial del día (con los permisos de costos y de pagos). */
  resumen: ResumenBalance | null;
  dias: DiaCercano[];
}

const suma = (o: Record<string, number>, ...claves: string[]) => claves.reduce((s, k) => s + (o[k] ?? 0), 0);

/** Los datos del paso a paso a partir del panel de la jornada (P-46). */
export function datosDelPanel(p: PanelJornada): DatosDelDia {
  const e = p.entregas;
  return {
    jornada: p.estado,
    pedidos: { confirmados: suma(p.pedidos, "CONFIRMADO", "EN_COMPRA", "EN_PREPARACION", "PREPARADO", "EN_REPARTO", "ENTREGADO"), borradores: suma(p.pedidos, "BORRADOR") },
    sinPreparar: suma(p.pedidos, "CONFIRMADO", "EN_COMPRA"),
    lista: { armada: p.lista.armada, desactualizada: p.lista.desactualizada, lineas: p.lista.lineas, resueltas: p.lista.compradas, fueraDeLista: p.lista.fueraDeLista },
    compras: p.compras,
    entregas: {
      total: Object.values(e).reduce((s, n) => s + n, 0),
      preparadas: suma(e, "PREPARADA", "EN_REPARTO", "ENTREGADA"),
      conDocumentos: p.conDocumentos,
      enCamino: suma(e, "EN_REPARTO", "ENTREGADA"),
      entregadas: suma(e, "ENTREGADA"),
    },
    repartos: suma(p.repartos, "PLANIFICADO", "EN_CURSO", "FINALIZADO"),
  };
}

/**
 * El día que se trabaja si no se elige otro: la jornada más temprana desde ayer hasta el día de
 * pedidos que ya arrancó o tiene pedidos confirmados y no está cerrada; si no hay, el día para el
 * que se toman pedidos.
 */
async function diaParaTrabajar(tx: Transaccion, hoy: FechaISO, sugerida: FechaISO): Promise<FechaISO> {
  const [j] = await tx
    .select({ fecha: jornada.fecha })
    .from(jornada)
    .where(
      and(
        gte(jornada.fecha, sumarDias(hoy, -1)),
        lte(jornada.fecha, sugerida),
        ne(jornada.estado, "CERRADA"),
        or(
          ne(jornada.estado, "ABIERTA"),
          // Con una sola tabla, Drizzle no pone el nombre de la tabla: va escrito completo.
          sql`exists (select 1 from ${pedido} p where p.jornada_id = jornada.id and p.estado not in ('BORRADOR', 'CANCELADO'))`,
        ),
      ),
    )
    .orderBy(asc(jornada.fecha))
    .limit(1);
  return j?.fecha ?? sugerida;
}

/** Cuántos días por venir se ofrecen siempre para elegir (con pedidos o sin). */
const DIAS_POR_VENIR = 7;

/**
 * Los días para elegir: hoy y los próximos siete (siempre, aunque no tengan pedidos), el que se está
 * viendo, ayer si tiene algo, las jornadas sin cerrar de antes y las que tienen pedidos más adelante.
 */
async function diasCercanos(tx: Transaccion, hoy: FechaISO, sugerida: FechaISO, fecha: FechaISO): Promise<DiaCercano[]> {
  const filas = await tx
    .select({
      fecha: jornada.fecha,
      estado: jornada.estado,
      pedidos: sql<number>`count(${pedido.id}) filter (where ${pedido.estado} not in ('BORRADOR', 'CANCELADO'))`,
      cargados: sql<number>`count(${pedido.id})`,
    })
    .from(jornada)
    .leftJoin(pedido, eq(pedido.jornadaId, jornada.id))
    .where(or(gte(jornada.fecha, sumarDias(hoy, -1)), ne(jornada.estado, "CERRADA"), eq(jornada.fecha, fecha)))
    .groupBy(jornada.id)
    .orderBy(asc(jornada.fecha));
  // Un día que ya pasó y quedó sin empezar y sin ningún pedido (solo se le cargó la caja inicial, o
  // se le sacó todo) no tiene nada para hacer: no se ofrece.
  const vacioDeAntes = new Set(filas.filter((f) => f.fecha < hoy && f.estado === "ABIERTA" && Number(f.cargados) === 0).map((f) => f.fecha));
  const dias = new Map<FechaISO, DiaCercano>(filas.map((f) => [f.fecha, { fecha: f.fecha, estado: f.estado, pedidos: Number(f.pedidos) }]));
  const siempre = [...Array.from({ length: DIAS_POR_VENIR + 1 }, (_, i) => sumarDias(hoy, i)), sugerida, fecha];
  for (const f of siempre) if (!dias.has(f)) dias.set(f, { fecha: f, estado: null, pedidos: 0 });
  const todos = [...dias.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
  // Ayer, solo si tuvo algo; los días viejos, solo si quedaron sin cerrar (o es el que se mira).
  const cercanos = todos.filter((d) => d.fecha >= hoy || d.fecha === fecha || (d.estado !== "CERRADA" && !vacioDeAntes.has(d.fecha)) || (d.fecha === sumarDias(hoy, -1) && d.pedidos > 0));
  return cercanos.slice(0, 16);
}

/** Los días de un mes (`AAAA-MM`) que tienen jornada, con su estado y sus pedidos: para el calendario. */
export async function diasDelMes(db: BaseDatos, authUserId: string, mes: string): Promise<DiaCercano[]> {
  if (!/^\d{4}-\d{2}$/.test(mes)) return [];
  return ejecutarComoUsuario(db, authUserId, null, async (tx) => {
    const filas = await tx
      .select({
        fecha: jornada.fecha,
        estado: jornada.estado,
        pedidos: sql<number>`count(${pedido.id}) filter (where ${pedido.estado} not in ('BORRADOR', 'CANCELADO'))`,
      })
      .from(jornada)
      .leftJoin(pedido, eq(pedido.jornadaId, jornada.id))
      .where(and(gte(jornada.fecha, `${mes}-01`), lte(jornada.fecha, `${mes}-31`)))
      .groupBy(jornada.id)
      .orderBy(asc(jornada.fecha));
    return filas.map((f) => ({ fecha: f.fecha, estado: f.estado, pedidos: Number(f.pedidos) }));
  });
}

/**
 * El día de trabajo. Con `conTablero` trae también el tablero de pedidos en la misma transacción:
 * así toda la pantalla principal sale con pocas idas a la base.
 */
export async function diaDeTrabajo(db: BaseDatos, authUserId: string, pedida?: string | null, opciones: { conTablero?: boolean } = {}): Promise<DiaDeTrabajo> {
  return ejecutarComoUsuario(db, authUserId, "jornada.ver", async (tx, c) => {
    const { hoy, sugerida } = hoyYSugeridaDe(c);
    const fecha = pedida && /^\d{4}-\d{2}-\d{2}$/.test(pedida) ? pedida : await diaParaTrabajar(tx, hoy, sugerida);
    const verVenta = c.permisos.tiene("precios.ver_venta");
    const verCostos = c.permisos.tiene("precios.ver_costos");
    const nada = Promise.resolve([] as { total: string | null }[]);
    // En el tablero va el resumen balance (gastos y caja inicial): necesita ver costos y pagos. La
    // plata de cada paso solo se muestra en el paso a paso: en el tablero no se pide.
    const conTablero = Boolean(opciones.conTablero);
    const conResumen = conTablero && verCostos && c.permisos.tiene("pagos.ver");
    // Lo que no depende entre sí sale junto: el panel, la plata del día, los días cercanos y el tablero.
    const [panel, [p], [e], [k], dias, tablero, resumen] = await Promise.all([
      panelEnTransaccion(tx, fecha),
      verVenta && !conTablero
        ? tx
            .select({ total: sum(pedido.totalEstimado) })
            .from(pedido)
            .innerJoin(jornada, eq(jornada.id, pedido.jornadaId))
            .where(and(eq(jornada.fecha, fecha), ne(pedido.estado, "CANCELADO"), ne(pedido.estado, "BORRADOR")))
        : nada,
      verVenta && !conTablero
        ? tx
            .select({ total: sum(entrega.importeTotal) })
            .from(entrega)
            .innerJoin(jornada, eq(jornada.id, entrega.jornadaId))
            .where(and(eq(jornada.fecha, fecha), eq(entrega.estado, "ENTREGADA")))
        : nada,
      verCostos && !conTablero
        ? tx
            .select({ total: sum(compra.total) })
            .from(compra)
            .innerJoin(jornada, eq(jornada.id, compra.jornadaId))
            .where(and(eq(jornada.fecha, fecha), eq(compra.estado, "REGISTRADA")))
        : nada,
      diasCercanos(tx, hoy, sugerida, fecha),
      conTablero && c.permisos.tiene("pedidos.ver") ? tableroEnTransaccion(tx, c, fecha) : Promise.resolve(null),
      conResumen ? resumenBalanceDelDia(tx, fecha) : Promise.resolve(null),
    ]);
    const plata: DiaDeTrabajo["plata"] =
      panel.estado && !conTablero
        ? { pedido: verVenta ? (p?.total ?? "0") : null, entregado: verVenta ? (e?.total ?? "0") : null, comprado: verCostos ? (k?.total ?? "0") : null }
        : { pedido: null, comprado: null, entregado: null };
    return { fecha, hoy, sugerida, panel, pasos: pasosDelDia(datosDelPanel(panel)), plata, resumen, dias, tablero };
  });
}

/** Los días para elegir en una pantalla del día (lista de compras): hoy, el de pedidos, el elegido y los que están sin cerrar. */
export async function diasParaElegir(db: BaseDatos, authUserId: string, pedida?: string | null): Promise<{ fecha: FechaISO; hoy: FechaISO; dias: DiaCercano[] }> {
  return ejecutarComoUsuario(db, authUserId, null, async (tx, c) => {
    const { hoy, sugerida } = hoyYSugeridaDe(c);
    const fecha = pedida && /^\d{4}-\d{2}-\d{2}$/.test(pedida) ? pedida : await diaParaTrabajar(tx, hoy, sugerida);
    return { fecha, hoy, dias: await diasCercanos(tx, hoy, sugerida, fecha) };
  });
}

export interface ProcesoEnCurso {
  fecha: FechaISO;
  /** Es el día que eligió la persona (en el tablero o en otra pantalla del día), no el que se calcula solo. */
  elegido: boolean;
  hoy: FechaISO;
  etapas: EtapaDelMenu[];
}

/**
 * El día para las etapas del menú de la izquierda (pedido del usuario, 06/10/2026). Si la persona
 * eligió un día (en el tablero o en otra pantalla del día, 08/10/2026), las etapas son las de ese
 * día, siempre. Si no, el mismo día que abre el tablero, si ya arrancó (tiene pedidos confirmados
 * o pasó de ABIERTA) y no está cerrado; nulo si no hay ningún proceso en curso.
 */
export async function procesoEnCurso(db: BaseDatos, authUserId: string, elegida?: string | null): Promise<ProcesoEnCurso | null> {
  return ejecutarComoUsuario(db, authUserId, "jornada.ver", async (tx, c) => {
    const { hoy, sugerida } = hoyYSugeridaDe(c);
    const elegido = Boolean(elegida && /^\d{4}-\d{2}-\d{2}$/.test(elegida));
    const fecha = elegido ? elegida! : await diaParaTrabajar(tx, hoy, sugerida);
    const panel = await panelEnTransaccion(tx, fecha);
    const datos = datosDelPanel(panel);
    if (!elegido && (!panel.estado || panel.estado === "CERRADA" || (panel.estado === "ABIERTA" && datos.pedidos.confirmados === 0))) return null;
    return { fecha, hoy, elegido, etapas: etapasDelMenu(datos, pasosDelDia(datos)) };
  });
}
