"use server";

import { redirect } from "next/navigation";

import { cambiarEstadoProveedor, guardarProveedor, type CondicionPago } from "@/modulos/proveedores/proveedores";
import { ejecutarAccion } from "@/ui/accion-servidor";
import { campo, type EstadoAccion } from "@/ui/estado-accion";

// Acciones de P-20 y P-21. Los permisos los verifica cada caso de uso.

function datosProveedor(datos: FormData) {
  return {
    id: campo(datos, "id") || undefined,
    codigo: campo(datos, "codigo"),
    nombre: campo(datos, "nombre"),
    razonSocial: campo(datos, "razonSocial"),
    identificacionFiscal: campo(datos, "identificacionFiscal"),
    telefono: campo(datos, "telefono"),
    email: campo(datos, "email"),
    contactoNombre: campo(datos, "contactoNombre"),
    ubicacionMercado: campo(datos, "ubicacionMercado"),
    direccion: campo(datos, "direccion"),
    aliasTransferencia: campo(datos, "aliasTransferencia"),
    cbu: campo(datos, "cbu"),
    titularCuenta: campo(datos, "titularCuenta"),
    condicionPagoHabitual: (campo(datos, "condicionPagoHabitual") || "CREDITO") as CondicionPago,
    observaciones: campo(datos, "observaciones"),
    // Los campos de crédito solo vienen si la pantalla los mostró (proveedores.editar_limite).
    limiteCredito: datos.has("limiteCredito") ? campo(datos, "limiteCredito") : undefined,
    plazoPagoDias: datos.has("plazoPagoDias") ? campo(datos, "plazoPagoDias") : undefined,
  };
}

export async function crearProveedorAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  let id = "";
  const resultado = await ejecutarAccion(async ({ db, authUserId }) => {
    id = await guardarProveedor(db, authUserId, { ...datosProveedor(datos), id: undefined });
    return { ok: true, mensaje: "Proveedor creado." };
  });
  if (resultado.ok) redirect(`/proveedores/${id}`);
  return resultado;
}

export async function editarProveedorAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await guardarProveedor(db, authUserId, datosProveedor(datos));
    return { ok: true, mensaje: "Cambios guardados." };
  });
}

export async function cambiarEstadoProveedorAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    const activo = campo(datos, "activo") === "true";
    await cambiarEstadoProveedor(db, authUserId, { id: campo(datos, "id"), activo });
    return { ok: true, mensaje: activo ? "Proveedor reactivado." : "Proveedor desactivado." };
  });
}
