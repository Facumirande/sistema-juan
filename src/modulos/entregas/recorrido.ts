import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { destinoFavorito, entrega, jornada, paradaExtra, reparto } from "@/db/esquema";
import type { BaseDatos, Transaccion } from "@/db/tipos";
import { enOrden } from "@/db/transaccion";
import type { Coordenada } from "@/dominio/entregas/recorrido";
import { ErrorDeNegocio } from "@/dominio/errores";
import type { FechaISO } from "@/dominio/fechas/fechas";
import { registrarActividad } from "@/modulos/colaboracion/registro";
import { ejecutarComoUsuario, type ContextoUsuario } from "@/modulos/seguridad/contexto";
import { textoOpcional, validar } from "@/modulos/validacion";

import { PATRON_FECHA } from "./comun";
import { esquemaCoordenada } from "./viaje";

// El recorrido del día (07/10/2026): una sola lista con las entregas que están en camino y los
// destinos extra (pasar por el banco, por un proveedor), en el orden en que se va a ir. El orden se
// guarda entero cada vez que se arrastra un destino o se calcula el mejor recorrido. Los destinos
// que se usan seguido se guardan como favoritos, con el nombre que se les quiera dar.

/** "E:<id de la entrega>" o "X:<id del destino extra>". */
const CLAVE = /^([EX]):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

const DIA_CERRADO = "Ese día ya está cerrado: para cambiar el recorrido, primero reabrilo desde el tablero.";

const nombreDeDestino = (mensaje: string) => z.string(mensaje).trim().min(1, mensaje).max(60, "El nombre es muy largo: usá hasta 60 letras.");
const lugarEnBase = (c: Coordenada | null | undefined) => ({ latitud: c ? c.lat.toFixed(6) : null, longitud: c ? c.lng.toFixed(6) : null });

/** El día del recorrido (se crea si todavía no tenía nada cargado); no se toca un día cerrado. */
async function diaDelRecorrido(tx: Transaccion, c: ContextoUsuario, fecha: string) {
  if (!PATRON_FECHA.test(fecha)) throw new ErrorDeNegocio("VALIDACION", "Elegí el día del recorrido.");
  const [, [j]] = await Promise.all([
    enOrden(
      tx
        .insert(jornada)
        .values({ empresaId: c.empresaId, fecha, creadoPor: c.usuarioId, actualizadoPor: c.usuarioId })
        .onConflictDoNothing({ target: [jornada.empresaId, jornada.fecha] }),
    ),
    enOrden(tx.select({ id: jornada.id, estado: jornada.estado }).from(jornada).where(eq(jornada.fecha, fecha))),
  ]);
  if (!j) throw new Error("No se pudo crear la jornada.");
  if (j.estado === "CERRADA") throw new ErrorDeNegocio("JORNADA_CERRADA", DIA_CERRADO);
  return j;
}

/** Un destino extra con su día (no se toca si el día está cerrado). */
async function destinoExtra(tx: Transaccion, id: string) {
  const [f] = await tx.select({ x: paradaExtra, estado: jornada.estado }).from(paradaExtra).innerJoin(jornada, eq(jornada.id, paradaExtra.jornadaId)).where(eq(paradaExtra.id, id));
  if (!f) throw new ErrorDeNegocio("NO_ENCONTRADO", "Ese destino ya no está en el recorrido.");
  if (f.estado === "CERRADA") throw new ErrorDeNegocio("JORNADA_CERRADA", DIA_CERRADO);
  return f.x;
}

/**
 * Guarda el orden del recorrido del día, con las entregas y los destinos extra mezclados como se
 * los dejó (arrastrando o al calcular el mejor recorrido). La hoja de ruta de cada reparto que
 * está en la calle queda en ese mismo orden.
 */
export async function guardarOrdenDelRecorrido(db: BaseDatos, authUserId: string, datos: { fecha: FechaISO; orden: readonly string[] }): Promise<void> {
  const d = validar(z.object({ fecha: z.string().regex(PATRON_FECHA, "Elegí el día del recorrido."), orden: z.array(z.string().regex(CLAVE, "Ese destino no es válido.")).min(1).max(500) }), datos);
  await ejecutarComoUsuario(db, authUserId, "repartos.gestionar", async (tx, c) => {
    const [j] = await tx.select({ id: jornada.id, estado: jornada.estado }).from(jornada).where(eq(jornada.fecha, d.fecha));
    if (!j) throw new ErrorDeNegocio("NO_ENCONTRADO", "Ese día todavía no tiene nada para llevar.");
    if (j.estado === "CERRADA") throw new ErrorDeNegocio("JORNADA_CERRADA", DIA_CERRADO);
    // Todos los cambios salen juntos (una ida a la base) y, al final, se acomodan las hojas de ruta.
    await Promise.all([
      ...[...new Set(d.orden)].map((clave, i) => {
        const [, tipo, id] = CLAVE.exec(clave)!;
        return tipo!.toUpperCase() === "E"
          ? enOrden(tx.update(entrega).set({ ordenEnRecorrido: i + 1, actualizadoPor: c.usuarioId }).where(and(eq(entrega.id, id!), eq(entrega.jornadaId, j.id))))
          : enOrden(tx.update(paradaExtra).set({ orden: i + 1, actualizadoPor: c.usuarioId }).where(and(eq(paradaExtra.id, id!), eq(paradaExtra.jornadaId, j.id))));
      }),
      enOrden(
        tx.execute(sql`
          update ${entrega} set orden_en_reparto = n.lugar::smallint
          from (
            select en.id, row_number() over (partition by en.reparto_id order by en.orden_en_recorrido nulls last, en.orden_en_reparto nulls last, en.numero) as lugar
            from ${entrega} en
            inner join ${reparto} r on r.id = en.reparto_id
            where en.jornada_id = ${j.id} and en.estado <> 'ANULADA' and r.estado = 'EN_CURSO'
          ) n
          where ${entrega.id} = n.id and ${entrega.ordenEnReparto} is distinct from n.lugar
        `),
      ),
    ]);
  });
}

const esquemaDestino = z.object({
  fecha: z.string(),
  favoritoId: z.uuid().nullish(),
  nombre: z.string().nullish(),
  direccion: textoOpcional(200),
  coordenada: esquemaCoordenada.nullish(),
  guardarFavorito: z.boolean().optional(),
});

/** Guarda un lugar como favorito. Dos favoritos no llevan el mismo nombre. */
async function crearFavorito(tx: Transaccion, c: ContextoUsuario, lugar: { nombre: string; direccion: string | null; latitud: string | null; longitud: string | null }): Promise<string> {
  const [repetido] = await tx
    .select({ id: destinoFavorito.id })
    .from(destinoFavorito)
    .where(and(eq(destinoFavorito.activo, true), sql`lower(${destinoFavorito.nombre}) = lower(${lugar.nombre})`));
  if (repetido) throw new ErrorDeNegocio("VALIDACION", `Ya hay un favorito que se llama “${lugar.nombre}”: elegilo de la lista o ponele otro nombre.`);
  const [f] = await tx
    .insert(destinoFavorito)
    .values({ empresaId: c.empresaId, ...lugar, creadoPor: c.usuarioId, actualizadoPor: c.usuarioId })
    .returning({ id: destinoFavorito.id });
  return f!.id;
}

/**
 * Suma un destino al recorrido del día: uno de los favoritos, o un lugar nuevo con su nombre (que
 * además se puede guardar como favorito). Queda al final de la lista; después se lo arrastra.
 */
export async function agregarDestino(db: BaseDatos, authUserId: string, datos: z.input<typeof esquemaDestino>): Promise<string> {
  const d = validar(esquemaDestino, datos);
  return ejecutarComoUsuario(db, authUserId, "repartos.gestionar", async (tx, c) => {
    const j = await diaDelRecorrido(tx, c, d.fecha);
    let lugar: { nombre: string; direccion: string | null; latitud: string | null; longitud: string | null };
    let favoritoId: string | null = null;
    if (d.favoritoId) {
      const [f] = await tx.select().from(destinoFavorito).where(and(eq(destinoFavorito.id, d.favoritoId), eq(destinoFavorito.activo, true)));
      if (!f) throw new ErrorDeNegocio("NO_ENCONTRADO", "Ese favorito ya no está: elegí otro o escribí el lugar.");
      lugar = { nombre: f.nombre, direccion: f.direccion, latitud: f.latitud, longitud: f.longitud };
      favoritoId = f.id;
    } else {
      const nombre = validar(nombreDeDestino("Ponele un nombre al destino (por ejemplo: Banco, Taller)."), d.nombre ?? "");
      if (!d.direccion && !d.coordenada) throw new ErrorDeNegocio("VALIDACION", "Escribí la dirección o marcá dónde queda, así el GPS sabe a dónde ir.");
      lugar = { nombre, direccion: d.direccion, ...lugarEnBase(d.coordenada) };
      if (d.guardarFavorito) favoritoId = await crearFavorito(tx, c, lugar);
    }
    const [x] = await tx
      .insert(paradaExtra)
      .values({ empresaId: c.empresaId, jornadaId: j.id, favoritoId, ...lugar, creadoPor: c.usuarioId, actualizadoPor: c.usuarioId })
      .returning({ id: paradaExtra.id });
    await registrarActividad(tx, c, { accion: "MODIFICAR", entidadTipo: "JORNADA", entidadId: j.id, jornadaId: j.id, resumen: `sumó “${lugar.nombre}” al recorrido` });
    return x!.id;
  });
}

/** Saca un destino extra del recorrido (no es un documento: se borra). */
export async function quitarDestino(db: BaseDatos, authUserId: string, id: string): Promise<void> {
  await ejecutarComoUsuario(db, authUserId, "repartos.gestionar", async (tx) => {
    const x = await destinoExtra(tx, id);
    await tx.delete(paradaExtra).where(eq(paradaExtra.id, x.id));
  });
}

/** Marca que ya se pasó por un destino extra (o lo desmarca). */
export async function marcarDestino(db: BaseDatos, authUserId: string, datos: { id: string; hecha: boolean }): Promise<void> {
  await ejecutarComoUsuario(db, authUserId, "repartos.gestionar", async (tx, c) => {
    const x = await destinoExtra(tx, datos.id);
    await tx.update(paradaExtra).set({ hecha: datos.hecha, actualizadoPor: c.usuarioId }).where(eq(paradaExtra.id, x.id));
  });
}

/** Guarda como favorito un destino que ya está en el recorrido, con el nombre que se le quiera dar. */
export async function guardarComoFavorito(db: BaseDatos, authUserId: string, datos: { id: string; nombre?: string | null }): Promise<string> {
  return ejecutarComoUsuario(db, authUserId, "repartos.gestionar", async (tx, c) => {
    const x = await destinoExtra(tx, datos.id);
    const nombre = validar(nombreDeDestino("Ponele un nombre al favorito."), datos.nombre?.trim() || x.nombre);
    const favoritoId = await crearFavorito(tx, c, { nombre, direccion: x.direccion, latitud: x.latitud, longitud: x.longitud });
    await tx.update(paradaExtra).set({ favoritoId, nombre, actualizadoPor: c.usuarioId }).where(eq(paradaExtra.id, x.id));
    return favoritoId;
  });
}

/** Le cambia el nombre a un favorito. */
export async function renombrarFavorito(db: BaseDatos, authUserId: string, datos: { id: string; nombre: string }): Promise<void> {
  const nombre = validar(nombreDeDestino("Ponele un nombre al favorito."), datos.nombre);
  await ejecutarComoUsuario(db, authUserId, "repartos.gestionar", async (tx, c) => {
    const [repetido] = await tx
      .select({ id: destinoFavorito.id })
      .from(destinoFavorito)
      .where(and(eq(destinoFavorito.activo, true), sql`lower(${destinoFavorito.nombre}) = lower(${nombre})`, sql`${destinoFavorito.id} <> ${datos.id}`));
    if (repetido) throw new ErrorDeNegocio("VALIDACION", `Ya hay otro favorito que se llama “${nombre}”: ponele otro nombre.`);
    const cambiados = await tx.update(destinoFavorito).set({ nombre, actualizadoPor: c.usuarioId }).where(and(eq(destinoFavorito.id, datos.id), eq(destinoFavorito.activo, true))).returning({ id: destinoFavorito.id });
    if (cambiados.length === 0) throw new ErrorDeNegocio("NO_ENCONTRADO", "Ese favorito ya no está.");
  });
}

/** Saca un lugar de los favoritos (los recorridos donde ya se usó no cambian). */
export async function quitarFavorito(db: BaseDatos, authUserId: string, id: string): Promise<void> {
  await ejecutarComoUsuario(db, authUserId, "repartos.gestionar", async (tx, c) => {
    await tx.update(destinoFavorito).set({ activo: false, actualizadoPor: c.usuarioId }).where(eq(destinoFavorito.id, id));
  });
}
