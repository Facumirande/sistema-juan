import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { cliente, destinoFavorito, empresa, entrega, jornada, paradaExtra, puntoEntrega, reparto } from "@/db/esquema";
import type { BaseDatos, Transaccion } from "@/db/tipos";
import { distanciaKm, type Coordenada } from "@/dominio/entregas/recorrido";
import {
  consultasDeRespaldo,
  consultasParaElMapa,
  coordenadaValida,
  enLaZona,
  esEnlaceCortoDeMapa,
  esquinasEntre,
  leerCalleYNumero,
  leerCoordenadas,
  leerEsquina,
  lugaresDePhoton,
  NOTA_ESQUINA,
  ordenarPorNumero,
  parecidoDeCalle,
  tramosDePhoton,
  ZONA_DEL_NEGOCIO,
  type Caja,
  type LugarSugerido,
  type TramoDeCalle,
} from "@/dominio/entregas/ubicacion";
import { ErrorDeNegocio } from "@/dominio/errores";
import type { FechaISO } from "@/dominio/fechas/fechas";
import { registrarActividad } from "@/modulos/colaboracion/registro";
import { ejecutarComoUsuario } from "@/modulos/seguridad/contexto";

import { numeroEntrega, numeroReparto } from "./comun";

// El viaje de entrega (uso interno, 28/09/2026): de dónde se sale, las paradas con su ubicación
// (para calcular el recorrido y abrir el GPS) y cómo se marca la ubicación de cada lugar.

export interface LugarDeSalida {
  coordenada: Coordenada | null;
  direccion: string | null;
}

export interface ParadaDeViaje {
  entregaId: string;
  numero: string;
  estado: string;
  cliente: string;
  puntoId: string;
  punto: string;
  direccion: string;
  localidad: string | null;
  coordenada: Coordenada | null;
  horario: string | null;
  telefono: string | null;
  repartoId: string | null;
  reparto: string | null;
  orden: number | null;
}

/** Un destino del recorrido del día: una entrega que está en camino (o ya se dejó) o un destino extra. */
export interface DestinoDelRecorrido {
  /** "E:<id de la entrega>" o "X:<id del destino extra>": así se guarda el orden de todos juntos. */
  clave: string;
  tipo: "ENTREGA" | "EXTRA";
  id: string;
  /** El cliente, o el nombre que se le puso al destino. */
  nombre: string;
  punto: string | null;
  puntoId: string | null;
  direccion: string;
  localidad: string | null;
  coordenada: Coordenada | null;
  horario: string | null;
  telefono: string | null;
  /** Ya se entregó (o ya se pasó por ahí). */
  hecha: boolean;
  numero: string | null;
  favoritoId: string | null;
}

export interface DestinoFavorito {
  id: string;
  nombre: string;
  direccion: string | null;
  coordenada: Coordenada | null;
}

export interface ViajeDelDia {
  salida: LugarDeSalida;
  /** El día ya se cerró: el recorrido no se cambia. */
  cerrado: boolean;
  /** Las entregas que falta llevar (todavía sin entregar), estén o no en camino. */
  paradas: ParadaDeViaje[];
  /** Lo que está en camino, lo ya entregado y los destinos extra, en el orden del recorrido. */
  recorrido: DestinoDelRecorrido[];
  favoritos: DestinoFavorito[];
}

export const aCoordenada = (lat: string | null, lng: string | null): Coordenada | null => (lat !== null && lng !== null ? { lat: Number(lat), lng: Number(lng) } : null);

export async function lugarDeSalida(tx: Transaccion): Promise<LugarDeSalida> {
  const [e] = await tx.select({ lat: empresa.latitud, lng: empresa.longitud, direccion: empresa.direccion }).from(empresa);
  return { coordenada: aCoordenada(e?.lat ?? null, e?.lng ?? null), direccion: e?.direccion ?? null };
}

/**
 * El viaje de un día: las entregas que falta llevar y el recorrido (lo que está en camino, lo ya
 * entregado y los destinos extra, en el orden guardado; lo que nunca se ordenó va al final).
 */
export async function viajeDelDia(db: BaseDatos, authUserId: string, fecha: FechaISO): Promise<ViajeDelDia> {
  return ejecutarComoUsuario(db, authUserId, "repartos.ver", async (tx) => {
    // Todo sale junto, en una sola ida a la base.
    const [salida, [j], filas, extras, favoritos] = await Promise.all([
      lugarDeSalida(tx),
      tx.select({ estado: jornada.estado }).from(jornada).where(eq(jornada.fecha, fecha)),
      tx
        .select({
          entregaId: entrega.id,
          numero: entrega.numero,
          estado: entrega.estado,
          cliente: cliente.nombre,
          puntoId: puntoEntrega.id,
          punto: puntoEntrega.nombre,
          direccion: puntoEntrega.direccion,
          localidad: puntoEntrega.localidad,
          lat: puntoEntrega.latitud,
          lng: puntoEntrega.longitud,
          desde: puntoEntrega.horarioDesde,
          hasta: puntoEntrega.horarioHasta,
          telefono: puntoEntrega.contactoTelefono,
          repartoId: reparto.id,
          repartoNumero: reparto.numero,
          orden: entrega.ordenEnReparto,
          lugar: entrega.ordenEnRecorrido,
        })
        .from(entrega)
        .innerJoin(jornada, eq(jornada.id, entrega.jornadaId))
        .innerJoin(cliente, eq(cliente.id, entrega.clienteId))
        .innerJoin(puntoEntrega, eq(puntoEntrega.id, entrega.puntoEntregaId))
        .leftJoin(reparto, and(eq(reparto.id, entrega.repartoId), ne(reparto.estado, "ANULADO")))
        .where(and(eq(jornada.fecha, fecha), inArray(entrega.estado, ["BORRADOR", "EN_PREPARACION", "PREPARADA", "EN_REPARTO", "ENTREGADA"])))
        .orderBy(sql`${reparto.numero} nulls last`, sql`${entrega.ordenEnReparto} nulls last`, asc(cliente.nombre)),
      tx
        .select({ x: paradaExtra })
        .from(paradaExtra)
        .innerJoin(jornada, eq(jornada.id, paradaExtra.jornadaId))
        .where(eq(jornada.fecha, fecha))
        .orderBy(asc(paradaExtra.creadoEn)),
      tx.select().from(destinoFavorito).where(eq(destinoFavorito.activo, true)).orderBy(asc(destinoFavorito.nombre)),
    ]);
    const horario = (f: { desde: string | null; hasta: string | null }) => (f.desde || f.hasta ? `${f.desde?.slice(0, 5) ?? "?"}–${f.hasta?.slice(0, 5) ?? "?"}` : null);
    const candidatos: { lugar: number | null; destino: DestinoDelRecorrido }[] = [
      ...filas
        .filter((f) => f.estado === "EN_REPARTO" || f.estado === "ENTREGADA")
        .map((f) => ({
          lugar: f.lugar,
          destino: {
            clave: `E:${f.entregaId}`,
            tipo: "ENTREGA" as const,
            id: f.entregaId,
            nombre: f.cliente,
            punto: f.punto,
            puntoId: f.puntoId,
            direccion: f.direccion,
            localidad: f.localidad,
            coordenada: aCoordenada(f.lat, f.lng),
            horario: horario(f),
            telefono: f.telefono,
            hecha: f.estado === "ENTREGADA",
            numero: numeroEntrega(f.numero),
            favoritoId: null,
          },
        })),
      ...extras.map(({ x }) => ({
        lugar: x.orden,
        destino: {
          clave: `X:${x.id}`,
          tipo: "EXTRA" as const,
          id: x.id,
          nombre: x.nombre,
          punto: null,
          puntoId: null,
          direccion: x.direccion ?? "",
          localidad: null,
          coordenada: aCoordenada(x.latitud, x.longitud),
          horario: null,
          telefono: null,
          hecha: x.hecha,
          numero: null,
          favoritoId: x.favoritoId,
        },
      })),
    ];
    return {
      salida,
      cerrado: j?.estado === "CERRADA",
      paradas: filas
        .filter((f) => f.estado !== "ENTREGADA")
        .map((f) => ({
          entregaId: f.entregaId,
          numero: numeroEntrega(f.numero),
          estado: f.estado,
          cliente: f.cliente,
          puntoId: f.puntoId,
          punto: f.punto,
          direccion: f.direccion,
          localidad: f.localidad,
          coordenada: aCoordenada(f.lat, f.lng),
          horario: horario(f),
          telefono: f.telefono,
          repartoId: f.repartoId,
          reparto: f.repartoNumero ? numeroReparto(f.repartoNumero) : null,
          orden: f.orden,
        })),
      // Lo que ya tiene su lugar va en ese orden; lo que se sumó después, al final, como fue llegando.
      recorrido: candidatos
        .map((c, i) => ({ ...c, i }))
        .sort((a, b) => (a.lugar ?? Number.MAX_SAFE_INTEGER) - (b.lugar ?? Number.MAX_SAFE_INTEGER) || a.i - b.i)
        .map((c) => c.destino),
      favoritos: favoritos.map((f) => ({ id: f.id, nombre: f.nombre, direccion: f.direccion, coordenada: aCoordenada(f.latitud, f.longitud) })),
    };
  });
}

export const esquemaCoordenada = z.object({ lat: z.number(), lng: z.number() }).refine((c) => coordenadaValida(c.lat, c.lng), { message: "Esa ubicación no es válida." });

/**
 * Marca dónde queda un lugar de entrega. Lo puede hacer quien edita clientes o quien entrega
 * ("estoy en la puerta: guardar esta ubicación").
 */
export async function ubicarPuntoDeEntrega(db: BaseDatos, authUserId: string, datos: { puntoId: string; coordenada: Coordenada | null }): Promise<void> {
  const coordenada = datos.coordenada ? esquemaCoordenada.parse(datos.coordenada) : null;
  await ejecutarComoUsuario(db, authUserId, null, async (tx, c) => {
    if (!c.permisos.tiene("clientes.editar") && !c.permisos.tiene("entregas.confirmar")) c.permisos.exigir("clientes.editar");
    const [p] = await tx
      .select({ id: puntoEntrega.id, nombre: puntoEntrega.nombre, cliente: cliente.nombre, clienteId: cliente.id })
      .from(puntoEntrega)
      .innerJoin(cliente, eq(cliente.id, puntoEntrega.clienteId))
      .where(eq(puntoEntrega.id, datos.puntoId));
    if (!p) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el lugar de entrega.");
    await tx
      .update(puntoEntrega)
      .set({ latitud: coordenada ? coordenada.lat.toFixed(6) : null, longitud: coordenada ? coordenada.lng.toFixed(6) : null, actualizadoPor: c.usuarioId })
      .where(eq(puntoEntrega.id, p.id));
    await registrarActividad(tx, c, {
      accion: "UBICAR",
      entidadTipo: "CLIENTE",
      entidadId: p.clienteId,
      resumen: coordenada ? `marcó en el mapa dónde queda ${p.cliente} (${p.nombre})` : `borró la ubicación de ${p.cliente} (${p.nombre})`,
    });
  });
}

/** De dónde salen los repartos (el depósito o el puesto). */
export async function ubicarSalida(db: BaseDatos, authUserId: string, datos: { coordenada: Coordenada | null; direccion?: string | null }): Promise<void> {
  const coordenada = datos.coordenada ? esquemaCoordenada.parse(datos.coordenada) : null;
  await ejecutarComoUsuario(db, authUserId, "configuracion.editar", async (tx, c) => {
    await tx
      .update(empresa)
      .set({
        latitud: coordenada ? coordenada.lat.toFixed(6) : null,
        longitud: coordenada ? coordenada.lng.toFixed(6) : null,
        ...(datos.direccion !== undefined ? { direccion: datos.direccion?.trim() || null } : {}),
        actualizadoPor: c.usuarioId,
      })
      .where(eq(empresa.id, c.empresaId));
  });
}

// ——— Buscar en el mapa (OpenStreetMap) ———

export interface LugarEncontrado {
  etiqueta: string;
  coordenada: Coordenada;
}

type Buscador = (url: string, opciones: RequestInit) => Promise<Response>;

/** Cómo se presenta el sistema ante el servicio de mapas (lo pide su política de uso). */
const AGENTE = "SistemaJuan/1.0 (gestion interna de un distribuidor de frutas y verduras)";

/**
 * Busca una dirección en OpenStreetMap (Nominatim) y devuelve hasta 5 lugares para elegir. Se
 * usa a pedido de la persona (un botón), nunca en lote. Primero busca adentro de la zona del
 * negocio (Tucumán) y, si ahí no encuentra nada, en todo el país.
 */
export async function buscarDireccion(texto: string, buscador: Buscador = fetch): Promise<LugarEncontrado[]> {
  const q = texto.trim();
  if (q.length < 4) throw new ErrorDeNegocio("VALIDACION", "Escribí la dirección con la calle, el número y la localidad.");
  const { caja } = ZONA_DEL_NEGOCIO;
  const enLaZona = await buscarEnNominatim(buscador, { q, viewbox: `${caja.oeste},${caja.norte},${caja.este},${caja.sur}`, bounded: "1" });
  return enLaZona.length > 0 ? enLaZona : buscarEnNominatim(buscador, { q });
}

async function buscarEnNominatim(buscador: Buscador, parametros: Record<string, string>): Promise<LugarEncontrado[]> {
  const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ ...parametros, format: "jsonv2", limit: "5", countrycodes: "ar", "accept-language": "es" }).toString()}`;
  let respuesta: Response;
  try {
    respuesta = await buscador(url, { headers: { "User-Agent": AGENTE, Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
  } catch {
    throw new ErrorDeNegocio("VALIDACION", "No se pudo consultar el mapa (¿hay internet?). Probá con \"Estoy en el lugar\" o pegá la ubicación.");
  }
  if (!respuesta.ok) throw new ErrorDeNegocio("VALIDACION", "El mapa no respondió. Probá de nuevo en un rato o pegá la ubicación.");
  const datos = (await respuesta.json()) as { display_name?: string; lat?: string; lon?: string }[];
  return datos.flatMap((d) => {
    const lat = Number(d.lat);
    const lng = Number(d.lon);
    return d.display_name && coordenadaValida(lat, lng) ? [{ etiqueta: d.display_name, coordenada: { lat, lng } }] : [];
  });
}

/**
 * Lugares que se sugieren mientras se escribe una dirección (pedido del usuario, 10/10/2026: "que se
 * vaya autocompletando mientras escribís", orientado a Tucumán). Usa Photon, el buscador de
 * OpenStreetMap pensado para eso (Nominatim no admite autocompletar): primero adentro de la provincia
 * y, si ahí no aparece nada, en todo el país, siempre cerca de San Miguel de Tucumán. Se consulta
 * desde el servidor, un instante después de que se deja de escribir.
 *
 * Las direcciones se buscan como se dicen (RN-199, 11/10/2026): una esquina ("Muñecas y San Juan")
 * se calcula con los tramos de las dos calles y va arriba de todo; una calle con su número
 * ("24 de septiembre 500", "gral paz 1200") se pregunta también con el nombre que tiene en el mapa
 * y, si el número no está cargado, se lo ubica entre sus vecinos o se ofrece la calle para marcarlo.
 *
 * Si el lugar no figura en el mapa (un country, un local sin cargar), en vez de no devolver nada se
 * ofrece la zona donde queda (11/10/2026): lo que viene después de la coma o las últimas palabras,
 * marcado como aproximado, para abrir el mapa ahí y poner el punto exacto a mano.
 */
export async function sugerirLugares(texto: string, buscador: Buscador = fetch): Promise<LugarSugerido[]> {
  const q = texto.replace(/\s+/g, " ").trim();
  if (q.length < 3) return [];
  const pedir = pedirAPhoton(buscador);
  const esquina = leerEsquina(q);
  if (!esquina) return lugaresComunes(q, pedir);
  // La esquina se calcula a la par de la búsqueda de siempre (lo escrito puede ser un local: "Frutas y Verduras Don José").
  const [calculadas, comunes] = await Promise.allSettled([esquinasEnElMapa(esquina, pedir), lugaresComunes(q, pedir)]);
  if (calculadas.status === "fulfilled" && calculadas.value.length > 0) {
    // Debajo, solo lo de la zona: lo que coincide en otra provincia con una esquina de acá es ruido.
    const otros = comunes.status === "fulfilled" ? comunes.value.filter((l) => !l.aproximado && enLaZona(l.coordenada)) : [];
    return [...calculadas.value, ...otros.slice(0, COMUNES_BAJO_LA_ESQUINA)];
  }
  if (comunes.status === "rejected") throw comunes.reason;
  return comunes.value;
}

/** Cuántos lugares se ofrecen como mucho. */
const SUGERENCIAS = 6;
/** Cuántos se le piden a Photon: junta los repetidos después de cortar, así que pidiendo justo los que se muestran devuelve menos. */
const PEDIDAS = 20;
/** Para una calle con número se piden más: detrás de las calles vienen los locales con su número, que sirven de vecinos. */
const PEDIDAS_CON_NUMERO = 40;
/** Todos los tramos de una calle (Photon no da más de 50 por consulta). */
const TRAMOS_POR_CALLE = 50;
/** Alrededor de una localidad: hasta dónde se buscan sus calles (unos 10 km). */
const ALREDEDOR_DE_LA_LOCALIDAD = 0.09;
/** Los tramos de una calle que cuentan como "los de acá" para volver a buscar la otra a su alrededor. */
const CERCA_DEL_CENTRO_KM = 12;
/** Con la esquina calculada arriba, cuántos lugares comunes se dejan debajo. */
const COMUNES_BAJO_LA_ESQUINA = 3;

type PedirAPhoton = (consulta: string, opciones?: { caja?: Caja | null; cerca?: Coordenada; limite?: number; soloCalles?: boolean }) => Promise<unknown>;

/** Una consulta a Photon: adentro de una caja (la provincia, si no se dice otra; `null` es todo el país) y cerca de un punto. */
const pedirAPhoton =
  (buscador: Buscador): PedirAPhoton =>
  async (consulta, { caja = ZONA_DEL_NEGOCIO.caja, cerca = ZONA_DEL_NEGOCIO.centro, limite = PEDIDAS, soloCalles = false } = {}) => {
    const parametros = new URLSearchParams({ q: consulta, limit: String(limite), lat: String(cerca.lat), lon: String(cerca.lng) });
    if (caja) parametros.set("bbox", `${caja.oeste},${caja.sur},${caja.este},${caja.norte}`);
    if (soloCalles) {
      // Solo calles y sin juntar las que se llaman igual: hacen falta todos los tramos.
      parametros.set("layer", "street");
      parametros.set("dedupe", "0");
    }
    let respuesta: Response;
    try {
      respuesta = await buscador(`https://photon.komoot.io/api/?${parametros.toString()}`, { headers: { "User-Agent": AGENTE, Accept: "application/json" }, signal: AbortSignal.timeout(6000) });
    } catch {
      throw new ErrorDeNegocio("VALIDACION", "No se pudo consultar el mapa (¿hay internet?).");
    }
    if (!respuesta.ok) throw new ErrorDeNegocio("VALIDACION", "El mapa no respondió: probá de nuevo en un rato.");
    return respuesta.json();
  };

/** Lo de siempre: lo escrito tal cual (con sus otras maneras de escribirlo), en Tucumán y después en el país; al final, la zona. */
async function lugaresComunes(q: string, pedir: PedirAPhoton): Promise<LugarSugerido[]> {
  const conNumero = leerCalleYNumero(q);
  const consultas = consultasParaElMapa(q);
  const limite = conNumero ? PEDIDAS_CON_NUMERO : PEDIDAS;
  const armar = (respuestas: unknown[]): LugarSugerido[] => {
    // Un lugar de cada respuesta por vez, sin repetir: ninguna manera de escribirlo tapa a la otra.
    const listas = respuestas.map((r) => lugaresDePhoton(r));
    const vistos = new Set<string>();
    const lugares: LugarSugerido[] = [];
    for (let i = 0; i < Math.max(0, ...listas.map((l) => l.length)); i++) {
      for (const lista of listas) {
        const lugar = lista[i];
        const clave = lugar ? `${lugar.etiqueta}|${lugar.detalle ?? ""}` : null;
        if (!lugar || !clave || vistos.has(clave)) continue;
        vistos.add(clave);
        lugares.push(lugar);
      }
    }
    return (conNumero ? ordenarPorNumero(conNumero, respuestas, lugares) : lugares).slice(0, SUGERENCIAS);
  };
  const enLaZona = armar(await Promise.all(consultas.map((c) => pedir(c, { limite }))));
  if (enLaZona.length > 0) return enLaZona;
  const enElPais = armar(await Promise.all(consultas.map((c) => pedir(c, { limite, caja: null }))));
  if (enElPais.length > 0) return enElPais;
  // No figura: la zona donde queda, para marcarlo a mano.
  for (const respaldo of consultasDeRespaldo(q)) {
    const zonas = lugaresDePhoton(await pedir(respaldo.consulta), { soloZonas: true });
    if (zonas.length > 0) return zonas.slice(0, 3).map((z) => ({ ...z, aproximado: { falta: respaldo.falta } }));
  }
  return [];
}

/**
 * La esquina de dos calles (RN-199): se piden todos los tramos de cada una y se calcula dónde se
 * cruzan. Sin localidad, en la provincia y empezando por San Miguel de Tucumán; con localidad
 * ("…, Tafí Viejo"), alrededor de ella.
 */
async function esquinasEnElMapa(esquina: { a: string; b: string; localidad: string | null }, pedir: PedirAPhoton): Promise<LugarSugerido[]> {
  let cerca: Coordenada = ZONA_DEL_NEGOCIO.centro;
  let caja: Caja = ZONA_DEL_NEGOCIO.caja;
  if (esquina.localidad) {
    const localidad = lugaresDePhoton(await pedir(esquina.localidad), { soloZonas: true })[0];
    if (localidad) {
      cerca = localidad.coordenada;
      caja = { oeste: cerca.lng - ALREDEDOR_DE_LA_LOCALIDAD, este: cerca.lng + ALREDEDOR_DE_LA_LOCALIDAD, norte: cerca.lat + ALREDEDOR_DE_LA_LOCALIDAD, sur: cerca.lat - ALREDEDOR_DE_LA_LOCALIDAD };
    }
  }
  const tramosDe = async (calle: string, donde: Caja) => {
    const respuestas = await Promise.all(consultasParaElMapa(calle).map((c) => pedir(c, { caja: donde, cerca, limite: TRAMOS_POR_CALLE, soloCalles: true })));
    const cuantos = (r: unknown) => ((r as { features?: unknown[] } | null)?.features ?? []).length;
    return { tramos: respuestas.flatMap((r) => tramosDePhoton(r)), cortada: respuestas.some((r) => cuantos(r) >= TRAMOS_POR_CALLE) };
  };
  const [a, b] = await Promise.all([tramosDe(esquina.a, caja), tramosDe(esquina.b, caja)]);
  let esquinas = esquinasEntre(esquina, a.tramos, b.tramos, cerca);
  // Una calle con muchos tramos, o con ese nombre en muchas localidades ("Sarmiento"), no entra entera en
  // una consulta: si no apareció la esquina, se la vuelve a pedir solo alrededor de la otra calle.
  for (const [cortada, otra, calle, escritaOtra] of [
    [a, b, esquina.a, esquina.b],
    [b, a, esquina.b, esquina.a],
  ] as const) {
    if (esquinas.length > 0 || !cortada.cortada) continue;
    const alrededor = cajaAlrededorDe(otra.tramos.filter((t) => parecidoDeCalle(escritaOtra, t.nombre) > 0 && distanciaKm(t.coordenada, cerca) <= CERCA_DEL_CENTRO_KM));
    if (!alrededor) continue;
    cortada.tramos = (await tramosDe(calle, alrededor)).tramos;
    esquinas = esquinasEntre(esquina, a.tramos, b.tramos, cerca);
  }
  return esquinas.map((e) => ({ etiqueta: `${e.a} y ${e.b}`, detalle: e.zona, coordenada: e.coordenada, nota: e.segura ? NOTA_ESQUINA : "cerca de la esquina" }));
}

/** La caja que abarca unos tramos de calle, con un margen de una cuadra; nula si no hay ninguno. */
function cajaAlrededorDe(tramos: readonly TramoDeCalle[]): Caja | null {
  const cajas = tramos.flatMap((t) => (t.caja ? [t.caja] : []));
  if (cajas.length === 0) return null;
  const margen = 0.0015;
  return {
    oeste: Math.min(...cajas.map((c) => c.oeste)) - margen,
    este: Math.max(...cajas.map((c) => c.este)) + margen,
    norte: Math.max(...cajas.map((c) => c.norte)) + margen,
    sur: Math.min(...cajas.map((c) => c.sur)) - margen,
  };
}

/**
 * Sigue un enlace corto de Google Maps (maps.app.goo.gl) hasta el enlace largo, que trae la
 * ubicación. Solo esos dominios: el servidor no abre cualquier dirección que le pasen.
 */
export async function resolverEnlaceDeMapa(enlace: string, buscador: Buscador = fetch): Promise<Coordenada | null> {
  const directa = leerCoordenadas(enlace);
  if (directa) return directa;
  if (!esEnlaceCortoDeMapa(enlace)) return null;
  let actual = enlace.trim();
  for (let salto = 0; salto < 4; salto++) {
    let respuesta: Response;
    try {
      respuesta = await buscador(actual, { redirect: "manual", headers: { "User-Agent": AGENTE }, signal: AbortSignal.timeout(8000) });
    } catch {
      return null;
    }
    const destino = respuesta.headers.get("location");
    if (!destino) return null;
    const coordenada = leerCoordenadas(destino);
    if (coordenada) return coordenada;
    const siguiente = new URL(destino, actual);
    if (siguiente.protocol !== "https:" || !DOMINIOS_DE_MAPA.some((d) => siguiente.hostname === d || siguiente.hostname.endsWith(`.${d}`))) return null;
    actual = siguiente.toString();
  }
  return null;
}

/** Los únicos sitios a los que se sigue un enlace de mapa. */
const DOMINIOS_DE_MAPA = ["goo.gl", "google.com", "google.com.ar"];

/** De dónde salen los repartos (para el planificador de cada reparto). */
export async function salidaDeRepartos(db: BaseDatos, authUserId: string): Promise<LugarDeSalida> {
  return ejecutarComoUsuario(db, authUserId, null, async (tx, c) => {
    if (!c.permisos.tiene("repartos.ver") && !c.permisos.tiene("repartos.ver_propios")) c.permisos.exigir("repartos.ver");
    return lugarDeSalida(tx);
  });
}
