import { and, count, desc, eq, gt, inArray, ne, sql } from "drizzle-orm";

import { actividad, nota, usuario } from "@/db/esquema";
import type { BaseDatos } from "@/db/tipos";
import { agruparAvisos } from "@/dominio/colaboracion/avisos";
import { ejecutarComoUsuario } from "@/modulos/seguridad/contexto";

import { tiposVisibles } from "./actividad";
import { claveDeReferencia, describirEntidades, type Referencia } from "./entidades";
import { sinLeerPara } from "./notas";
import { personasDelNegocio, soloVisible, type PersonaVisible } from "./personas";
import type { TipoEntidad } from "./registro";

// La campanita (06/10/2026): cada vez que otra persona carga o cambia algo queda un aviso para los
// demás, y lo que va dirigido a uno (una nota "para vos", un pedido que te pasaron) se destaca.
// "Nuevo" es lo que pasó después de la última vez que la persona abrió la campanita; las notas
// siguen contando hasta que se leen.

export interface AvisoVisible {
  id: string;
  clase: "ACTIVIDAD" | "NOTA";
  /** En texto ISO: viaja igual al dibujar la página y en la consulta periódica. */
  en: string;
  persona: PersonaVisible;
  /** Sin el nombre: "cargó el pedido PED-000012 de Hospital San Martín", "te dejó una nota". */
  resumen: string;
  /** El texto de la nota. */
  texto: string | null;
  /** Va dirigido a quien mira (una nota para él, un pedido que le pasaron). */
  paraMi: boolean;
  nuevo: boolean;
  /** Cuántas cosas iguales junta (varios tildes seguidos de la lista de compras). */
  veces: number;
  entidad: { tipo: TipoEntidad; id: string; etiqueta: string; fecha: string | null } | null;
}

export interface BandejaDeAvisos {
  /** Lo que la persona todavía no vio: actividad de los demás desde que abrió la campanita + notas sin leer. */
  nuevos: number;
  notasSinLeer: number;
  avisos: AvisoVisible[];
  /** Las demás personas, para dejarles un aviso. */
  personas: PersonaVisible[];
}

/** Sin haber abierto nunca la campanita, es nuevo lo de las últimas 24 horas (no todo lo que pasó antes de entrar). */
const PRIMERA_VEZ_MS = 24 * 60 * 60 * 1000;

export async function avisosPara(db: BaseDatos, authUserId: string, limite = 15): Promise<BandejaDeAvisos> {
  return ejecutarComoUsuario(db, authUserId, null, async (tx, c) => {
    const tipos = tiposVisibles(c);
    const personas = await personasDelNegocio(tx);
    const otras = personas.filter((p) => p.activa && p.id !== c.usuarioId).map(soloVisible);
    if (tipos.length === 0) return { nuevos: 0, notasSinLeer: 0, avisos: [], personas: otras };
    const porId = new Map(personas.map((p) => [p.id, soloVisible(p)]));
    const persona = (id: string | null): PersonaVisible => porId.get(id ?? "") ?? { id: id ?? "", nombre: "Alguien", color: "#46505e" };

    const [yo] = await tx.select({ vistos: usuario.avisosVistosEn }).from(usuario).where(eq(usuario.id, c.usuarioId));
    const desde = yo?.vistos ?? new Date(Date.now() - PRIMERA_VEZ_MS);
    const deOtros = and(ne(actividad.usuarioId, c.usuarioId), inArray(actividad.entidadTipo, tipos));

    const [acciones, [actividadNueva], notas, [notasNuevas]] = await Promise.all([
      tx.select().from(actividad).where(deOtros).orderBy(desc(actividad.ocurridaEn)).limit(limite * 3),
      tx.select({ n: count() }).from(actividad).where(and(deOtros, gt(actividad.ocurridaEn, desde))),
      tx.select().from(nota).where(and(sinLeerPara(c), inArray(nota.entidadTipo, tipos))).orderBy(desc(nota.creadoEn)).limit(limite),
      tx.select({ n: count() }).from(nota).where(and(sinLeerPara(c), inArray(nota.entidadTipo, tipos))),
    ]);

    const mezcla = [
      ...acciones.map((a) => ({
        id: `A:${a.id}`,
        clase: "ACTIVIDAD" as const,
        accion: a.accion,
        en: a.ocurridaEn,
        personaId: a.usuarioId,
        resumen: a.resumen,
        texto: null as string | null,
        paraMi: a.paraUsuarioId === c.usuarioId,
        nuevo: a.ocurridaEn > desde,
        ref: (a.entidadId ? { tipo: a.entidadTipo, id: a.entidadId } : null) as Referencia | null,
      })),
      ...notas.map((n) => ({
        id: `N:${n.id}`,
        clase: "NOTA" as const,
        accion: "NOTA",
        en: n.creadoEn,
        personaId: n.creadoPor ?? "",
        resumen: n.paraUsuarioId === c.usuarioId ? "te dejó una nota" : "dejó una nota para todos",
        texto: n.texto as string | null,
        paraMi: n.paraUsuarioId === c.usuarioId,
        nuevo: true,
        ref: { tipo: n.entidadTipo, id: n.entidadId } as Referencia | null,
      })),
    ].sort((a, b) => b.en.getTime() - a.en.getTime());

    const agrupados = agruparAvisos(mezcla.map((m) => ({ ...m, entidad: m.ref ? claveDeReferencia(m.ref) : null }))).slice(0, limite);
    const entidades = await describirEntidades(tx, agrupados.flatMap((m) => (m.ref ? [m.ref] : [])));
    return {
      nuevos: Number(actividadNueva?.n ?? 0) + Number(notasNuevas?.n ?? 0),
      notasSinLeer: Number(notasNuevas?.n ?? 0),
      personas: otras,
      avisos: agrupados.map((m) => {
        const e = m.ref ? entidades.get(claveDeReferencia(m.ref)) : undefined;
        return {
          id: m.id,
          clase: m.clase,
          en: m.en.toISOString(),
          persona: persona(m.personaId),
          resumen: m.resumen,
          texto: m.texto,
          paraMi: m.paraMi,
          nuevo: m.nuevo,
          veces: m.veces,
          entidad: m.ref && e ? { tipo: m.ref.tipo, id: m.ref.id, etiqueta: e.etiqueta, fecha: e.fecha } : null,
        };
      }),
    };
  });
}

/** Al abrir la campanita: lo que hicieron los demás hasta ahora ya está visto (las notas se leen aparte). */
export async function marcarAvisosVistos(db: BaseDatos, authUserId: string): Promise<void> {
  await ejecutarComoUsuario(db, authUserId, null, async (tx, c) => {
    await tx.update(usuario).set({ avisosVistosEn: sql`now()` }).where(eq(usuario.id, c.usuarioId));
  });
}
