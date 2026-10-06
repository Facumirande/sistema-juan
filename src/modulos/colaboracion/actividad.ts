import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";

import { actividad, nota } from "@/db/esquema";
import type { BaseDatos, Transaccion } from "@/db/tipos";
import { hoyEnEmpresa, sumarDias, type FechaISO } from "@/dominio/fechas/fechas";
import { ejecutarComoUsuario, type ContextoUsuario } from "@/modulos/seguridad/contexto";

import { PERMISO_PARA_VER, claveDeReferencia, describirEntidades, type EntidadDescripta, type Referencia } from "./entidades";
import { personasDelNegocio, type PersonaVisible } from "./personas";
import type { TipoEntidad } from "./registro";

// "Actividad": lo que hizo cada persona y las notas que dejó, de lo más nuevo a lo más viejo,
// con un resumen por persona (cuánto hizo hoy y en la semana, y cuándo fue lo último).

export interface EntradaActividad {
  id: string;
  clase: "ACTIVIDAD" | "NOTA";
  en: Date;
  persona: PersonaVisible;
  accion: string;
  /** Sin el nombre: "confirmó el pedido PED-000012 de Hospital San Martín". */
  resumen: string;
  /** El texto de la nota. */
  texto: string | null;
  para: PersonaVisible | null;
  entidad: (Referencia & EntidadDescripta) | null;
}

export interface ResumenPersona {
  persona: PersonaVisible;
  activa: boolean;
  hoy: number;
  semana: number;
  ultima: Date | null;
}

/** Lo que se muestra: los tipos que la persona puede ver (el repartidor, sin entregas ni repartos ajenos). */
export function tiposVisibles(c: ContextoUsuario): TipoEntidad[] {
  return (Object.keys(PERMISO_PARA_VER) as TipoEntidad[]).filter(
    (t) => c.permisos.tiene(PERMISO_PARA_VER[t]) && !((t === "ENTREGA" || t === "REPARTO") && !c.permisos.tiene("repartos.ver")),
  );
}

/** Día local en la zona de la empresa, escrito en la consulta (para usarlo también en el filtro). */
function diaLocal(columna: typeof actividad.ocurridaEn | typeof nota.creadoEn, zona: string) {
  if (!/^[A-Za-z0-9_/+-]+$/.test(zona)) throw new Error(`Zona horaria inválida: ${zona}`);
  return sql<string>`(${columna} at time zone ${sql.raw(`'${zona}'`)})::date`;
}

async function resumenPorPersona(tx: Transaccion, c: ContextoUsuario, tipos: TipoEntidad[]): Promise<ResumenPersona[]> {
  const hoy: FechaISO = hoyEnEmpresa(new Date(), c.zonaHoraria);
  const semana = sumarDias(hoy, -6);
  const cuentas = new Map<string, { hoy: number; semana: number; ultima: Date | null }>();
  const sumar = (id: string, f: { hoy: number; semana: number; ultima: Date | null }) => {
    const previo = cuentas.get(id) ?? { hoy: 0, semana: 0, ultima: null };
    cuentas.set(id, {
      hoy: previo.hoy + f.hoy,
      semana: previo.semana + f.semana,
      ultima: previo.ultima && f.ultima ? (previo.ultima > f.ultima ? previo.ultima : f.ultima) : (previo.ultima ?? f.ultima),
    });
  };
  if (tipos.length > 0) {
    const diaA = diaLocal(actividad.ocurridaEn, c.zonaHoraria);
    const acciones = await tx
      .select({
        id: actividad.usuarioId,
        hoy: sql<number>`count(*) filter (where ${diaA} = ${hoy})`,
        semana: sql<number>`count(*) filter (where ${diaA} >= ${semana})`,
        ultima: sql<Date | null>`max(${actividad.ocurridaEn})`.mapWith((v: string | Date | null) => (v === null ? null : new Date(v))),
      })
      .from(actividad)
      .where(inArray(actividad.entidadTipo, tipos))
      .groupBy(actividad.usuarioId);
    for (const a of acciones) sumar(a.id, { hoy: Number(a.hoy), semana: Number(a.semana), ultima: a.ultima });
    const diaN = diaLocal(nota.creadoEn, c.zonaHoraria);
    const notas = await tx
      .select({
        id: nota.creadoPor,
        hoy: sql<number>`count(*) filter (where ${diaN} = ${hoy})`,
        semana: sql<number>`count(*) filter (where ${diaN} >= ${semana})`,
        ultima: sql<Date | null>`max(${nota.creadoEn})`.mapWith((v: string | Date | null) => (v === null ? null : new Date(v))),
      })
      .from(nota)
      .where(inArray(nota.entidadTipo, tipos))
      .groupBy(nota.creadoPor);
    for (const n of notas) if (n.id) sumar(n.id, { hoy: Number(n.hoy), semana: Number(n.semana), ultima: n.ultima });
  }
  const personas = await personasDelNegocio(tx);
  return personas
    .filter((p) => p.activa || cuentas.has(p.id))
    .map(({ activa, ...persona }) => ({ persona, activa, hoy: 0, semana: 0, ultima: null, ...cuentas.get(persona.id) }));
}

export async function listarActividad(
  db: BaseDatos,
  authUserId: string,
  filtros: { usuarioId?: string | null; soloNotas?: boolean; entidad?: Referencia | null; antesDe?: Date | null; limite?: number } = {},
): Promise<{ entradas: EntradaActividad[]; hayMas: boolean; personas: ResumenPersona[] }> {
  return ejecutarComoUsuario(db, authUserId, null, async (tx, c) => {
    const tipos = tiposVisibles(c).filter((t) => !filtros.entidad || t === filtros.entidad.tipo);
    const limite = filtros.limite ?? 60;
    const personas = await resumenPorPersona(tx, c, tiposVisibles(c));
    if (tipos.length === 0) return { entradas: [], hayMas: false, personas };
    const porId = new Map(personas.map((p) => [p.persona.id, p.persona]));
    const persona = (id: string | null): PersonaVisible => porId.get(id ?? "") ?? { id: id ?? "", nombre: "Alguien", color: "#46505e" };

    const acciones = filtros.soloNotas
      ? []
      : await tx
          .select()
          .from(actividad)
          .where(
            and(
              inArray(actividad.entidadTipo, tipos),
              filtros.usuarioId ? eq(actividad.usuarioId, filtros.usuarioId) : undefined,
              filtros.entidad ? eq(actividad.entidadId, filtros.entidad.id) : undefined,
              filtros.antesDe ? lt(actividad.ocurridaEn, filtros.antesDe) : undefined,
            ),
          )
          .orderBy(desc(actividad.ocurridaEn))
          .limit(limite + 1);
    const notas = await tx
      .select()
      .from(nota)
      .where(
        and(
          inArray(nota.entidadTipo, tipos),
          filtros.usuarioId ? eq(nota.creadoPor, filtros.usuarioId) : undefined,
          filtros.entidad ? eq(nota.entidadId, filtros.entidad.id) : undefined,
          filtros.antesDe ? lt(nota.creadoEn, filtros.antesDe) : undefined,
        ),
      )
      .orderBy(desc(nota.creadoEn))
      .limit(limite + 1);

    const referencias: Referencia[] = [];
    const mezcla: { entrada: Omit<EntradaActividad, "entidad">; ref: Referencia | null }[] = [
      ...acciones.map((a) => ({
        entrada: { id: a.id, clase: "ACTIVIDAD" as const, en: a.ocurridaEn, persona: persona(a.usuarioId), accion: a.accion, resumen: a.resumen, texto: null, para: null },
        ref: a.entidadId ? { tipo: a.entidadTipo, id: a.entidadId } : null,
      })),
      ...notas.map((n) => ({
        entrada: {
          id: n.id,
          clase: "NOTA" as const,
          en: n.creadoEn,
          persona: persona(n.creadoPor),
          accion: "NOTA",
          resumen: n.paraUsuarioId ? `le dejó una nota a ${persona(n.paraUsuarioId).nombre}` : "dejó una nota",
          texto: n.texto,
          para: n.paraUsuarioId ? persona(n.paraUsuarioId) : null,
        },
        ref: { tipo: n.entidadTipo, id: n.entidadId },
      })),
    ].sort((a, b) => b.entrada.en.getTime() - a.entrada.en.getTime());
    const pagina = mezcla.slice(0, limite);
    for (const m of pagina) if (m.ref) referencias.push(m.ref);
    const entidades = await describirEntidades(tx, referencias);
    return {
      entradas: pagina.map((m) => {
        const e = m.ref ? entidades.get(claveDeReferencia(m.ref)) : undefined;
        return { ...m.entrada, entidad: m.ref && e ? { ...m.ref, ...e } : null };
      }),
      hayMas: mezcla.length > limite,
      personas,
    };
  });
}
