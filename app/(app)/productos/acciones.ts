"use server";

import { redirect } from "next/navigation";

import { cambiarEstadoCategoria, guardarCategoria, type GrupoProducto } from "@/modulos/catalogo/categorias";
import {
  agregarPresentacion,
  cambiarEstadoPresentacion,
  cambiarEstadoProducto,
  crearProducto,
  editarPresentacion,
  editarProducto,
  marcarProveedorPreferido,
  type UnidadBase,
} from "@/modulos/catalogo/productos";
import { nombreDePresentacion } from "@/dominio/catalogo/productos";
import { cambiarRecargo } from "@/modulos/precios-venta/reglas";
import { ejecutarAccion, tildada } from "@/ui/accion-servidor";
import { UNIDADES_CORTAS } from "@/ui/etiquetas";
import { campo, type EstadoAccion } from "@/ui/estado-accion";

// Acciones de P-10, P-11 y P-12. Los permisos los verifica cada caso de uso.

export async function guardarCategoriaAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    const id = campo(datos, "id") || undefined;
    await guardarCategoria(db, authUserId, {
      id,
      nombre: campo(datos, "nombre"),
      grupo: campo(datos, "grupo") as GrupoProducto,
      orden: campo(datos, "orden"),
    });
    return { ok: true, mensaje: id ? "Categoría guardada." : "Categoría creada." };
  });
}

export async function cambiarEstadoCategoriaAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    const activo = campo(datos, "activo") === "true";
    await cambiarEstadoCategoria(db, authUserId, { id: campo(datos, "id"), activo });
    return { ok: true, mensaje: activo ? "Categoría reactivada." : "Categoría desactivada." };
  });
}

export async function editarProductoAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await editarProducto(db, authUserId, {
      id: campo(datos, "id"),
      codigo: campo(datos, "codigo"),
      nombre: campo(datos, "nombre"),
      nombreCorto: campo(datos, "nombreCorto"),
      categoriaId: campo(datos, "categoriaId"),
      unidadBase: campo(datos, "unidadBase") as UnidadBase,
      admiteFraccion: tildada(datos, "admiteFraccion"),
      observaciones: campo(datos, "observaciones"),
      presentacionVentaDefaultId: campo(datos, "presentacionVentaDefaultId") || null,
      presentacionCompraDefaultId: campo(datos, "presentacionCompraDefaultId") || null,
    });
    return { ok: true, mensaje: "Cambios guardados." };
  });
}

export async function cambiarEstadoProductoAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    const activo = campo(datos, "activo") === "true";
    await cambiarEstadoProducto(db, authUserId, { id: campo(datos, "id"), activo });
    return { ok: true, mensaje: activo ? "Producto reactivado." : "Producto desactivado." };
  });
}

function datosPresentacion(datos: FormData) {
  return {
    nombre: campo(datos, "nombre"),
    factorABase: campo(datos, "factorABase"),
    usableEnCompra: tildada(datos, "usableEnCompra"),
    usableEnVenta: tildada(datos, "usableEnVenta"),
  };
}

export async function agregarPresentacionAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await agregarPresentacion(db, authUserId, { productoId: campo(datos, "productoId"), ...datosPresentacion(datos) });
    return { ok: true, mensaje: "Presentación agregada." };
  });
}

export async function editarPresentacionAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await editarPresentacion(db, authUserId, { id: campo(datos, "id"), ...datosPresentacion(datos) });
    return { ok: true, mensaje: "Presentación guardada." };
  });
}

export async function cambiarEstadoPresentacionAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    const activo = campo(datos, "activo") === "true";
    await cambiarEstadoPresentacion(db, authUserId, { id: campo(datos, "id"), activo });
    return { ok: true, mensaje: activo ? "Presentación reactivada." : "Presentación desactivada." };
  });
}

export async function marcarPreferidoAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await marcarProveedorPreferido(db, authUserId, { productoId: campo(datos, "productoId"), proveedorId: campo(datos, "proveedorId") || null });
    return { ok: true, mensaje: "Proveedor preferido actualizado." };
  });
}

/**
 * Alta guiada (P-10): nombre y categoría, en qué se cuenta, cómo se compra ("Cajón" de 18 kg) y,
 * si se quiere, cuánto se le gana. El código se arma solo si se deja vacío.
 */
export async function crearProductoGuiadoAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  let id = "";
  const resultado = await ejecutarAccion(async ({ db, authUserId }) => {
    const unidadBase = campo(datos, "unidadBase") as UnidadBase;
    const envase = campo(datos, "envase").trim();
    const cantidad = campo(datos, "cantidadEnvase");
    if (envase && !cantidad.trim()) return { ok: false, mensaje: `Escribí cuántos ${UNIDADES_CORTAS[unidadBase] ?? ""} trae el ${envase.toLowerCase()}.` };
    id = await crearProducto(db, authUserId, {
      codigo: campo(datos, "codigo"),
      nombre: campo(datos, "nombre"),
      nombreCorto: "",
      categoriaId: campo(datos, "categoriaId"),
      unidadBase,
      admiteFraccion: tildada(datos, "admiteFraccion"),
      observaciones: campo(datos, "observaciones"),
      presentacionCompraNombre: envase ? nombreDePresentacion(envase, cantidad, UNIDADES_CORTAS[unidadBase] ?? "") : "",
      presentacionCompraFactor: envase ? cantidad : "",
    });
    const recargo = campo(datos, "recargo").trim();
    if (recargo) {
      try {
        await cambiarRecargo(db, authUserId, { ambito: "PRODUCTO", id, valor: recargo });
      } catch {
        // El producto ya quedó creado: el recargo se puede ajustar en Precios de venta.
      }
    }
    return { ok: true, mensaje: "Producto creado." };
  });
  if (resultado.ok) redirect(`/productos/${id}`);
  return resultado;
}
