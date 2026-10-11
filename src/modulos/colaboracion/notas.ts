import { and, asc, count, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";

import { jornada, nota, notaLectura, pedido, tipoEntidad, usuario } from "@/db/esquema";
import type { BaseDatos, Transaccion } from "@/db/tipos";
import { ErrorDeNegocio } from "@/dominio/errores";
import type { FechaISO } from "@/dominio/fechas/fechas";
import { ejecutarComoUsuario, type ContextoUsuario } from "@/modulos/seguridad/contexto";
import { textoObligatorio, validar } from "@/modulos/validacion";

import { PERMISO_PARA_VER, claveDeReferencia, describirEntidades, exigirEntidadVisible, type EntidadDescripta, type Referencia } from "./entidades";
import { personasDelNegocio, soloVisible, type PersonaVisible } from "./personas";
import type { TipoEntidad } from "./registro";

// Notas entre las personas del negocio (uso interno, 28/09/2026): se dejan en una tarjeta del
// tablero o en la ficha de un cliente, proveedor o producto, para todos o para alguien en
// particular. Cada uno ve cuáles no leyó; las notas no se editan, las borra quien las escribió.

export interface NotaVisible {
  id: string;
  texto: string;
  en: Date;
  autor: PersonaVisible;
  /** Nulo = para todos. */
  para: PersonaVisible | null;
  /** La escribió quien mira (la puede borrar). */
  mia: boolean;
  /** Quien mira ya la leyó (o la escribió). */
  leida: boolean;
  /** Las otras personas que la leyeron. */
  leidaPor: PersonaVisible[];
}

export interface NotaEnBandeja extends NotaVisible {
  entidad: Referencia & EntidadDescripta;
}

const esquemaNota = z.object({
  entidadTipo: z.enum(tipoEntidad.enumValues),
  entidadId: z.uuid(),
  texto: textoObligatorio("Escribí la nota.", 2000),
  paraUsuarioId: z
    .string()
    .nullish()
    .transform((v) => (v?.trim() ? v.trim() : null))
    .pipe(z.uuid().nullable()),
});

/** Notas que quien mira no escribió, dirigidas a todos o a él, sin marca de leída. */
export const sinLeerPara = (c: ContextoUsuario) =>
  and(
    ne(nota.creadoPor, c.usuarioId),
    or(isNull(nota.paraUsuarioId), eq(nota.paraUsuarioId, c.usuarioId)),
    // Con una sola tabla, Drizzle no escribe el nombre de la tabla: va completo a mano.
    sql`not exists (select 1 from ${notaLectura} l where l.nota_id = nota.id and l.usuario_id = ${c.usuarioId})`,
  );

type FilaDeNota = typeof nota.$inferSelect;
type Lectura = { notaId: string; usuarioId: string };

async function armarNotas(tx: Transaccion, c: ContextoUsuario, filas: FilaDeNota[]): Promise<NotaVisible[]> {
  if (filas.length === 0) return [];
  // Las personas y quién leyó cada nota salen juntas, en una sola ida a la base.
  const [gente, lecturas] = await Promise.all([
    personasDelNegocio(tx),
    tx
      .select({ notaId: notaLectura.notaId, usuarioId: notaLectura.usuarioId })
      .from(notaLectura)
      .where(inArray(notaLectura.notaId, filas.map((f) => f.id))),
  ]);
  return notasParaVer(c, filas, gente, lecturas);
}

/** Las notas listas para mostrar, con las personas y las lecturas ya traídas. */
function notasParaVer(c: ContextoUsuario, filas: FilaDeNota[], gente: readonly PersonaVisible[], lecturas: readonly Lectura[]): NotaVisible[] {
  const personas = new Map(gente.map((p) => [p.id, p]));
  const desconocida = (id: string | null): PersonaVisible => ({ id: id ?? "", nombre: "Alguien", color: "#46505e" });
  return filas.map((f) => {
    const leidaPor = lecturas.filter((l) => l.notaId === f.id);
    return {
      id: f.id,
      texto: f.texto,
      en: f.creadoEn,
      autor: personas.get(f.creadoPor ?? "") ?? desconocida(f.creadoPor),
      para: f.paraUsuarioId ? (personas.get(f.paraUsuarioId) ?? desconocida(f.paraUsuarioId)) : null,
      mia: f.creadoPor === c.usuarioId,
      leida: f.creadoPor === c.usuarioId || leidaPor.some((l) => l.usuarioId === c.usuarioId),
      leidaPor: leidaPor.filter((l) => l.usuarioId !== c.usuarioId).map((l) => personas.get(l.usuarioId) ?? desconocida(l.usuarioId)),
    };
  });
}

/** Las notas de una tarjeta o ficha, de la más vieja a la más nueva (como un chat). */
export async function notasDe(db: BaseDatos, authUserId: string, referencia: Referencia): Promise<{ notas: NotaVisible[]; personas: PersonaVisible[]; yo: string }> {
  return ejecutarComoUsuario(db, authUserId, null, async (tx, c) => {
    const deEso = and(eq(nota.entidadTipo, referencia.tipo), eq(nota.entidadId, referencia.id));
    // Todo sale junto, en una sola ida a la base (las lecturas se buscan por la tarjeta, sin esperar
    // a saber qué notas tiene). Si la tarjeta no se puede ver, falla y no se devuelve nada.
    const [, filas, gente, lecturas] = await Promise.all([
      exigirEntidadVisible(tx, c, referencia),
      tx.select().from(nota).where(deEso).orderBy(asc(nota.creadoEn)),
      personasDelNegocio(tx),
      tx
        .select({ notaId: notaLectura.notaId, usuarioId: notaLectura.usuarioId })
        .from(notaLectura)
        .where(inArray(notaLectura.notaId, tx.select({ id: nota.id }).from(nota).where(deEso))),
    ]);
    return { notas: notasParaVer(c, filas, gente, lecturas), personas: gente.filter((p) => p.activa).map(soloVisible), yo: c.usuarioId };
  });
}

export async function escribirNota(db: BaseDatos, authUserId: string, datos: z.input<typeof esquemaNota>): Promise<string> {
  const d = validar(esquemaNota, datos);
  return ejecutarComoUsuario(db, authUserId, null, async (tx, c) => {
    await exigirEntidadVisible(tx, c, { tipo: d.entidadTipo, id: d.entidadId });
    if (d.paraUsuarioId) {
      const [destino] = await tx.select({ activo: usuario.activo }).from(usuario).where(eq(usuario.id, d.paraUsuarioId));
      if (!destino?.activo) throw new ErrorDeNegocio("VALIDACION", "Esa persona no está habilitada en el sistema.");
    }
    const [nueva] = await tx
      .insert(nota)
      .values({
        empresaId: c.empresaId,
        entidadTipo: d.entidadTipo,
        entidadId: d.entidadId,
        texto: d.texto,
        paraUsuarioId: d.paraUsuarioId,
        creadoPor: c.usuarioId,
        actualizadoPor: c.usuarioId,
      })
      .returning({ id: nota.id });
    return nueva!.id;
  });
}

/** Solo quien la escribió la borra (junto con las marcas de leída). */
export async function borrarNota(db: BaseDatos, authUserId: string, notaId: string): Promise<void> {
  await ejecutarComoUsuario(db, authUserId, null, async (tx, c) => {
    const [n] = await tx.select({ autor: nota.creadoPor }).from(nota).where(eq(nota.id, notaId));
    if (!n) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró la nota.");
    if (n.autor !== c.usuarioId) throw new ErrorDeNegocio("SIN_PERMISO", "Solo quien escribió la nota la puede borrar.");
    await tx.delete(notaLectura).where(eq(notaLectura.notaId, notaId));
    await tx.delete(nota).where(eq(nota.id, notaId));
  });
}

/** Marca como leídas las notas de una tarjeta, o todas las que quien mira tenga sin leer. */
export async function marcarNotasLeidas(db: BaseDatos, authUserId: string, referencia: Referencia | "TODAS"): Promise<number> {
  return ejecutarComoUsuario(db, authUserId, null, async (tx, c) => {
    const filtroEntidad = referencia === "TODAS" ? undefined : and(eq(nota.entidadTipo, referencia.tipo), eq(nota.entidadId, referencia.id));
    const pendientes = await tx.select({ id: nota.id, tipo: nota.entidadTipo }).from(nota).where(and(sinLeerPara(c), filtroEntidad));
    const visibles = pendientes.filter((p) => c.permisos.tiene(PERMISO_PARA_VER[p.tipo]));
    if (visibles.length === 0) return 0;
    await tx
      .insert(notaLectura)
      .values(visibles.map((p) => ({ empresaId: c.empresaId, notaId: p.id, usuarioId: c.usuarioId })))
      .onConflictDoNothing({ target: [notaLectura.notaId, notaLectura.usuarioId] });
    return visibles.length;
  });
}

const tiposVisibles = (c: ContextoUsuario) => (Object.keys(PERMISO_PARA_VER) as TipoEntidad[]).filter((t) => c.permisos.tiene(PERMISO_PARA_VER[t]));

/** Cuántas notas tiene sin leer quien mira (para el aviso de arriba). */
export async function contarNotasSinLeer(db: BaseDatos, authUserId: string): Promise<number> {
  return ejecutarComoUsuario(db, authUserId, null, async (tx, c) => {
    const tipos = tiposVisibles(c);
    if (tipos.length === 0) return 0;
    const [r] = await tx.select({ n: count() }).from(nota).where(and(sinLeerPara(c), inArray(nota.entidadTipo, tipos)));
    return Number(r?.n ?? 0);
  });
}

/** Notas sin leer para quien mira y las últimas del negocio, con lo que las originó. */
export async function bandejaDeNotas(db: BaseDatos, authUserId: string, limite = 15): Promise<{ sinLeer: NotaEnBandeja[]; recientes: NotaEnBandeja[] }> {
  return ejecutarComoUsuario(db, authUserId, null, async (tx, c) => {
    const tipos = tiposVisibles(c);
    if (tipos.length === 0) return { sinLeer: [], recientes: [] };
    // Las sin leer y las recientes salen juntas (el tablero pide solo las sin leer: `limite` 0).
    const [sinLeer, recientes] = await Promise.all([
      tx
        .select()
        .from(nota)
        .where(and(sinLeerPara(c), inArray(nota.entidadTipo, tipos)))
        .orderBy(desc(nota.creadoEn))
        .limit(50),
      limite > 0 ? tx.select().from(nota).where(inArray(nota.entidadTipo, tipos)).orderBy(desc(nota.creadoEn)).limit(limite) : Promise.resolve([] as FilaDeNota[]),
    ]);
    const todas = [...sinLeer, ...recientes];
    if (todas.length === 0) return { sinLeer: [], recientes: [] };
    // De qué es cada nota y quién la leyó, también juntos.
    const [entidades, notasArmadas] = await Promise.all([
      describirEntidades(tx, todas.map((n) => ({ tipo: n.entidadTipo, id: n.entidadId }))),
      armarNotas(tx, c, [...new Map(todas.map((n) => [n.id, n])).values()]),
    ]);
    const armadas = new Map(notasArmadas.map((n) => [n.id, n]));
    const conEntidad = (filas: typeof todas): NotaEnBandeja[] =>
      filas.flatMap((f) => {
        const e = entidades.get(claveDeReferencia({ tipo: f.entidadTipo, id: f.entidadId }));
        return e ? [{ ...armadas.get(f.id)!, entidad: { tipo: f.entidadTipo, id: f.entidadId, ...e } }] : [];
      });
    return { sinLeer: conEntidad(sinLeer), recientes: conEntidad(recientes) };
  });
}

/** Cuántas notas tiene cada tarjeta y cuántas sin leer para quien mira (tablero y cuadrículas). */
export async function contarNotasDe(tx: Transaccion, c: ContextoUsuario, tipo: TipoEntidad, ids: readonly string[]): Promise<Map<string, { total: number; sinLeer: number }>> {
  if (ids.length === 0 || !c.permisos.tiene(PERMISO_PARA_VER[tipo])) return new Map();
  const filas = await tx
    .select({
      id: nota.entidadId,
      total: count(),
      sinLeer: sql<number>`count(*) filter (where ${sinLeerPara(c)})`,
    })
    .from(nota)
    .where(and(eq(nota.entidadTipo, tipo), inArray(nota.entidadId, [...ids])))
    .groupBy(nota.entidadId);
  return new Map(filas.map((f) => [f.id, { total: Number(f.total), sinLeer: Number(f.sinLeer) }]));
}

/** Lo mismo que `contarNotasDe` para los pedidos de un día, sin tener que conocer antes cuáles son (sale junto con el tablero). */
export async function contarNotasDePedidosDelDia(tx: Transaccion, c: ContextoUsuario, fecha: FechaISO): Promise<Map<string, { total: number; sinLeer: number }>> {
  if (!c.permisos.tiene(PERMISO_PARA_VER.PEDIDO)) return new Map();
  const filas = await tx
    .select({
      id: nota.entidadId,
      total: count(),
      sinLeer: sql<number>`count(*) filter (where ${sinLeerPara(c)})`,
    })
    .from(nota)
    .where(and(eq(nota.entidadTipo, "PEDIDO"), inArray(nota.entidadId, tx.select({ id: pedido.id }).from(pedido).innerJoin(jornada, eq(jornada.id, pedido.jornadaId)).where(eq(jornada.fecha, fecha)))))
    .groupBy(nota.entidadId);
  return new Map(filas.map((f) => [f.id, { total: Number(f.total), sinLeer: Number(f.sinLeer) }]));
}
