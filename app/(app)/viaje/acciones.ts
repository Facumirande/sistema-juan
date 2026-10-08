"use server";

import { redirect } from "next/navigation";

import type { Coordenada } from "@/dominio/entregas/recorrido";
import { esErrorDeNegocio } from "@/dominio/errores";
import { agregarDestino, guardarComoFavorito, guardarOrdenDelRecorrido, marcarDestino, quitarDestino, quitarFavorito, renombrarFavorito } from "@/modulos/entregas/recorrido";
import { armarRepartoConOrden, fijarOrdenDeReparto } from "@/modulos/entregas/repartos";
import { buscarDireccion, resolverEnlaceDeMapa, ubicarPuntoDeEntrega, ubicarSalida, type LugarEncontrado } from "@/modulos/entregas/viaje";
import { obtenerAuthUserId } from "@/modulos/seguridad/sesion";
import { ejecutarAccion } from "@/ui/accion-servidor";
import { campo, type EstadoAccion } from "@/ui/estado-accion";

// El viaje de entrega: ubicaciones en el mapa, el recorrido del día (su orden, los destinos que se
// le suman y los favoritos) y armar un reparto con el orden calculado.

const coordenadaDe = (datos: FormData): Coordenada | null => {
  const lat = campo(datos, "lat");
  const lng = campo(datos, "lng");
  return lat && lng ? { lat: Number(lat), lng: Number(lng) } : null;
};

export async function ubicarPuntoAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    const coordenada = coordenadaDe(datos);
    await ubicarPuntoDeEntrega(db, authUserId, { puntoId: campo(datos, "puntoId"), coordenada });
    return { ok: true, mensaje: coordenada ? "Ubicación guardada." : "Ubicación borrada." };
  });
}

export async function ubicarSalidaAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    const coordenada = coordenadaDe(datos);
    const direccion = campo(datos, "direccion");
    await ubicarSalida(db, authUserId, direccion ? { coordenada, direccion } : { coordenada });
    return { ok: true, mensaje: coordenada ? "Punto de salida guardado." : "Punto de salida borrado." };
  });
}

/** Busca una dirección en el mapa (a pedido, con el botón). */
export async function buscarEnMapaAccion(texto: string): Promise<{ lugares: LugarEncontrado[]; mensaje: string | null }> {
  if (!(await obtenerAuthUserId())) return { lugares: [], mensaje: "Tu sesión terminó: ingresá de nuevo." };
  try {
    const lugares = await buscarDireccion(texto);
    return { lugares, mensaje: lugares.length ? null : "No se encontró esa dirección: probá con la calle, el número y la localidad, o marcala estando en el lugar." };
  } catch (error) {
    if (esErrorDeNegocio(error)) return { lugares: [], mensaje: error.message };
    throw error;
  }
}

/** Lee un enlace de Google Maps (también los cortos de WhatsApp) o unas coordenadas pegadas. */
export async function leerEnlaceAccion(texto: string): Promise<Coordenada | null> {
  if (!(await obtenerAuthUserId())) return null;
  return resolverEnlaceDeMapa(texto);
}

const paradas = (datos: FormData) => datos.getAll("parada").filter((v): v is string => typeof v === "string" && v !== "");

export async function guardarOrdenAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await fijarOrdenDeReparto(db, authUserId, { repartoId: campo(datos, "repartoId"), orden: paradas(datos) });
    return { ok: true, mensaje: null };
  });
}

export async function armarRepartoAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  let id = "";
  const r = await ejecutarAccion(async ({ db, authUserId }) => {
    id = await armarRepartoConOrden(db, authUserId, { fecha: campo(datos, "fecha"), entregaIds: paradas(datos) });
    return { ok: true, mensaje: null };
  });
  if (r.ok) redirect(`/repartos/${id}`);
  return r;
}

// ——— El recorrido del día ———

/** El orden del recorrido como quedó en la pantalla (arrastrando o al calcular el mejor). */
export async function guardarRecorridoAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await guardarOrdenDelRecorrido(db, authUserId, { fecha: campo(datos, "fecha"), orden: paradas(datos) });
    return { ok: true, mensaje: null };
  });
}

/** Suma un destino al recorrido: un favorito, o un lugar nuevo (que se puede guardar como favorito). */
export async function agregarDestinoAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await agregarDestino(db, authUserId, {
      fecha: campo(datos, "fecha"),
      favoritoId: campo(datos, "favoritoId") || null,
      nombre: campo(datos, "nombre"),
      direccion: campo(datos, "direccion"),
      coordenada: coordenadaDe(datos),
      guardarFavorito: campo(datos, "favorito") === "si",
    });
    return { ok: true, mensaje: null };
  });
}

export async function quitarDestinoAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await quitarDestino(db, authUserId, campo(datos, "id"));
    return { ok: true, mensaje: null };
  });
}

export async function marcarDestinoAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await marcarDestino(db, authUserId, { id: campo(datos, "id"), hecha: campo(datos, "hecha") === "si" });
    return { ok: true, mensaje: null };
  });
}

/** Un destino del recorrido pasa a ser favorito, con el nombre que se le ponga. */
export async function guardarFavoritoAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await guardarComoFavorito(db, authUserId, { id: campo(datos, "id"), nombre: campo(datos, "nombre") });
    return { ok: true, mensaje: null };
  });
}

export async function renombrarFavoritoAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await renombrarFavorito(db, authUserId, { id: campo(datos, "id"), nombre: campo(datos, "nombre") });
    return { ok: true, mensaje: null };
  });
}

export async function quitarFavoritoAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await quitarFavorito(db, authUserId, campo(datos, "id"));
    return { ok: true, mensaje: null };
  });
}
