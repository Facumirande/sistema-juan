"use server";

import { redirect } from "next/navigation";

import {
  cambiarEstadoCliente,
  cambiarEstadoPuntoEntrega,
  guardarCliente,
  guardarPuntoEntrega,
  marcarPuntoPrincipal,
  type PeriodicidadFacturacion,
  type TipoCliente,
} from "@/modulos/clientes/clientes";
import { ejecutarAccion, tildada } from "@/ui/accion-servidor";
import { campo, type EstadoAccion } from "@/ui/estado-accion";

// Acciones de P-15 y P-16. Los permisos los verifica cada caso de uso.

function datosCliente(datos: FormData) {
  return {
    id: campo(datos, "id") || undefined,
    codigo: campo(datos, "codigo"),
    nombre: campo(datos, "nombre"),
    tipoCliente: (campo(datos, "tipoCliente") || "OTRO") as TipoCliente,
    razonSocial: campo(datos, "razonSocial"),
    identificacionFiscal: campo(datos, "identificacionFiscal"),
    condicionFiscal: campo(datos, "condicionFiscal"),
    direccionFiscal: campo(datos, "direccionFiscal"),
    telefono: campo(datos, "telefono"),
    email: campo(datos, "email"),
    emailContable: campo(datos, "emailContable"),
    contactoNombre: campo(datos, "contactoNombre"),
    prioridadFaltantes: campo(datos, "prioridadFaltantes") || "3",
    periodicidadFacturacion: (campo(datos, "periodicidadFacturacion") || "POR_ENTREGA") as PeriodicidadFacturacion,
    requiereOrdenCompra: tildada(datos, "requiereOrdenCompra"),
    aceptaSustituciones: tildada(datos, "aceptaSustituciones"),
    requiereFirma: tildada(datos, "requiereFirma"),
    observaciones: campo(datos, "observaciones"),
  };
}

function datosPunto(datos: FormData, prefijo = "") {
  return {
    nombre: campo(datos, `${prefijo}nombre`),
    direccion: campo(datos, `${prefijo}direccion`),
    localidad: campo(datos, `${prefijo}localidad`),
    referencias: campo(datos, `${prefijo}referencias`),
    contactoNombre: campo(datos, `${prefijo}contactoNombre`),
    contactoTelefono: campo(datos, `${prefijo}contactoTelefono`),
    horarioDesde: campo(datos, `${prefijo}horarioDesde`),
    horarioHasta: campo(datos, `${prefijo}horarioHasta`),
    diasEntrega: datos.getAll(`${prefijo}diasEntrega`).map(String),
    instruccionesEntrega: campo(datos, `${prefijo}instruccionesEntrega`),
    coordenada: coordenadaDe(datos, prefijo),
  };
}

/** La ubicación elegida al escribir la dirección (si se eligió). */
function coordenadaDe(datos: FormData, prefijo: string): { lat: number; lng: number } | null {
  const lat = Number(campo(datos, `${prefijo}lat`));
  const lng = Number(campo(datos, `${prefijo}lng`));
  return campo(datos, `${prefijo}lat`) && campo(datos, `${prefijo}lng`) && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

export async function crearClienteAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  let id = "";
  const resultado = await ejecutarAccion(async ({ db, authUserId }) => {
    const conPunto = campo(datos, "punto_direccion").trim() !== "";
    id = await guardarCliente(db, authUserId, {
      ...datosCliente(datos),
      id: undefined,
      primerPunto: conPunto ? { ...datosPunto(datos, "punto_"), nombre: campo(datos, "punto_nombre") || "Principal" } : null,
    });
    return { ok: true, mensaje: "Cliente creado." };
  });
  if (resultado.ok) redirect(`/clientes/${id}`);
  return resultado;
}

export async function editarClienteAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await guardarCliente(db, authUserId, datosCliente(datos));
    return { ok: true, mensaje: "Cambios guardados." };
  });
}

export async function cambiarEstadoClienteAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    const activo = campo(datos, "activo") === "true";
    await cambiarEstadoCliente(db, authUserId, { id: campo(datos, "id"), activo });
    return { ok: true, mensaje: activo ? "Cliente reactivado." : "Cliente desactivado." };
  });
}

export async function guardarPuntoAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    const id = campo(datos, "id") || undefined;
    await guardarPuntoEntrega(db, authUserId, { clienteId: campo(datos, "clienteId"), id, ...datosPunto(datos) });
    return { ok: true, mensaje: id ? "Punto de entrega guardado." : "Punto de entrega agregado." };
  });
}

export async function marcarPrincipalAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await marcarPuntoPrincipal(db, authUserId, campo(datos, "id"));
    return { ok: true, mensaje: "Ahora es el punto principal." };
  });
}

export async function cambiarEstadoPuntoAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    const activo = campo(datos, "activo") === "true";
    await cambiarEstadoPuntoEntrega(db, authUserId, { id: campo(datos, "id"), activo });
    return { ok: true, mensaje: activo ? "Punto reactivado." : "Punto desactivado." };
  });
}
