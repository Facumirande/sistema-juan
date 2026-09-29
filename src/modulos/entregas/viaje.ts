import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { cliente, empresa, entrega, jornada, puntoEntrega, reparto } from "@/db/esquema";
import type { BaseDatos, Transaccion } from "@/db/tipos";
import type { Coordenada } from "@/dominio/entregas/recorrido";
import { coordenadaValida, esEnlaceCortoDeMapa, leerCoordenadas } from "@/dominio/entregas/ubicacion";
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

const aCoordenada = (lat: string | null, lng: string | null): Coordenada | null => (lat !== null && lng !== null ? { lat: Number(lat), lng: Number(lng) } : null);

export async function lugarDeSalida(tx: Transaccion): Promise<LugarDeSalida> {
  const [e] = await tx.select({ lat: empresa.latitud, lng: empresa.longitud, direccion: empresa.direccion }).from(empresa);
  return { coordenada: aCoordenada(e?.lat ?? null, e?.lng ?? null), direccion: e?.direccion ?? null };
}

/** Las entregas del día que falta llevar (sin anuladas ni entregadas), con su ubicación. */
export async function viajeDelDia(db: BaseDatos, authUserId: string, fecha: FechaISO): Promise<{ salida: LugarDeSalida; paradas: ParadaDeViaje[] }> {
  return ejecutarComoUsuario(db, authUserId, "repartos.ver", async (tx) => {
    const salida = await lugarDeSalida(tx);
    const [j] = await tx.select({ id: jornada.id }).from(jornada).where(eq(jornada.fecha, fecha));
    if (!j) return { salida, paradas: [] };
    const filas = await tx
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
      })
      .from(entrega)
      .innerJoin(cliente, eq(cliente.id, entrega.clienteId))
      .innerJoin(puntoEntrega, eq(puntoEntrega.id, entrega.puntoEntregaId))
      .leftJoin(reparto, and(eq(reparto.id, entrega.repartoId), ne(reparto.estado, "ANULADO")))
      .where(and(eq(entrega.jornadaId, j.id), inArray(entrega.estado, ["BORRADOR", "EN_PREPARACION", "PREPARADA", "EN_REPARTO"])))
      .orderBy(sql`${reparto.numero} nulls last`, sql`${entrega.ordenEnReparto} nulls last`, asc(cliente.nombre));
    return {
      salida,
      paradas: filas.map((f) => ({
        entregaId: f.entregaId,
        numero: numeroEntrega(f.numero),
        estado: f.estado,
        cliente: f.cliente,
        puntoId: f.puntoId,
        punto: f.punto,
        direccion: f.direccion,
        localidad: f.localidad,
        coordenada: aCoordenada(f.lat, f.lng),
        horario: f.desde || f.hasta ? `${f.desde?.slice(0, 5) ?? "?"}–${f.hasta?.slice(0, 5) ?? "?"}` : null,
        telefono: f.telefono,
        repartoId: f.repartoId,
        reparto: f.repartoNumero ? numeroReparto(f.repartoNumero) : null,
        orden: f.orden,
      })),
    };
  });
}

const esquemaCoordenada = z.object({ lat: z.number(), lng: z.number() }).refine((c) => coordenadaValida(c.lat, c.lng), { message: "Esa ubicación no es válida." });

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
 * usa a pedido de la persona (un botón), nunca en lote.
 */
export async function buscarDireccion(texto: string, buscador: Buscador = fetch): Promise<LugarEncontrado[]> {
  const q = texto.trim();
  if (q.length < 4) throw new ErrorDeNegocio("VALIDACION", "Escribí la dirección con la calle, el número y la localidad.");
  const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q, format: "jsonv2", limit: "5", countrycodes: "ar", "accept-language": "es" }).toString()}`;
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
