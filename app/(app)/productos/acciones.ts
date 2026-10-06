"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import type { ProductoAImportar } from "@/dominio/catalogo/importacion";
import { ErrorDeNegocio, esErrorDeNegocio, textoParaPersona } from "@/dominio/errores";
import { leerCsv, leerXlsx } from "@/lib/planilla";
import { guardarCategoria, moverProductoDeCategoria, type GrupoProducto } from "@/modulos/catalogo/categorias";
import { importarProductos, previsualizarProductos } from "@/modulos/catalogo/importacion";
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
import { obtenerBaseDatos } from "@/db/cliente";
import { obtenerAuthUserId } from "@/modulos/seguridad/sesion";
import { MENSAJE_ERROR_INESPERADO, ejecutarAccion, tildada } from "@/ui/accion-servidor";
import { UNIDADES_CORTAS } from "@/ui/etiquetas";
import { campo, type EstadoAccion } from "@/ui/estado-accion";

// Acciones de P-10, P-11 y P-12. Los permisos los verifica cada caso de uso.

/**
 * La categoría elegida en un formulario (RN-154): "id:<uuid>" (una que existe), "nombre:<texto>"
 * (preelegida o nueva) o "ninguna". También acepta el campo viejo `categoriaId`.
 */
function categoriaElegida(datos: FormData): { categoriaId: string | null; categoriaNombre: string | null } {
  const valor = campo(datos, "categoria");
  if (valor.startsWith("id:")) return { categoriaId: valor.slice(3), categoriaNombre: null };
  if (valor.startsWith("nombre:")) return { categoriaId: null, categoriaNombre: valor.slice(7) || null };
  if (valor === "ninguna") return { categoriaId: null, categoriaNombre: null };
  return { categoriaId: campo(datos, "categoriaId") || null, categoriaNombre: campo(datos, "categoriaNombre") || null };
}

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

export async function editarProductoAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    await editarProducto(db, authUserId, {
      id: campo(datos, "id"),
      codigo: campo(datos, "codigo"),
      nombre: campo(datos, "nombre"),
      nombreCorto: campo(datos, "nombreCorto"),
      ...categoriaElegida(datos),
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
      ...categoriaElegida(datos),
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

/** Arrastrar la tarjeta de un producto a otra categoría (o a una nueva, o a "Ninguna"). */
export async function moverProductoAccion(_estado: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutarAccion(async ({ db, authUserId }) => {
    const elegida = categoriaElegida(datos);
    const r = await moverProductoDeCategoria(db, authUserId, { productoId: campo(datos, "productoId"), id: elegida.categoriaId, nombre: elegida.categoriaNombre });
    return { ok: true, mensaje: `Listo: ahora está en ${r.categoria}.` };
  });
}

type Respuesta<T> = ({ ok: true } & T) | { ok: false; mensaje: string };

async function responder<T>(fn: (authUserId: string) => Promise<T>): Promise<Respuesta<T>> {
  const authUserId = await obtenerAuthUserId();
  if (!authUserId) return { ok: false, mensaje: "Tu sesión terminó: ingresá de nuevo." };
  try {
    return { ok: true, ...(await fn(authUserId)) };
  } catch (error) {
    if (esErrorDeNegocio(error)) return { ok: false, mensaje: textoParaPersona(error.message) };
    if (error instanceof Error && /no es una planilla/.test(error.message)) return { ok: false, mensaje: `${error.message} Bajá la planilla modelo, completala y subila de nuevo (o un .csv).` };
    console.error("Error inesperado al leer o cargar la planilla:", error);
    return { ok: false, mensaje: MENSAJE_ERROR_INESPERADO };
  }
}

/** Lee la planilla subida (.xlsx o .csv) y dice qué va a pasar con cada fila; todavía no carga nada. */
export async function leerPlanillaDeProductosAccion(datos: FormData): Promise<Respuesta<{ productos: ProductoAImportar[]; categorias: string[]; hoja: string }>> {
  return responder(async (authUserId) => {
    const archivo = datos.get("planilla");
    if (!(archivo instanceof File) || archivo.size === 0) throw new Error("El archivo no es una planilla de Excel (.xlsx).");
    if (archivo.size > 2_000_000) throw new ErrorDeNegocio("VALIDACION", "El archivo es muy grande para una lista de productos (más de 2 MB): dejá solo la hoja Productos.");
    const bytes = new Uint8Array(await archivo.arrayBuffer());
    const hojas = /\.csv$/i.test(archivo.name) || archivo.type === "text/csv" ? [leerCsv(new TextDecoder().decode(bytes))] : leerXlsx(bytes);
    // La hoja "Productos" de la planilla modelo; si no está, la primera que tenga algo.
    const hoja = hojas.find((h) => h.nombre.toLowerCase() === "productos") ?? hojas.find((h) => h.filas.some((f) => f.some((c) => c.trim()))) ?? hojas[0];
    if (!hoja) throw new Error("El archivo no es una planilla de Excel (.xlsx).");
    return { ...(await previsualizarProductos(obtenerBaseDatos(), authUserId, hoja.filas)), hoja: hoja.nombre };
  });
}

/** Carga los productos revisados (los que se dejaron elegidos). */
export async function cargarProductosDePlanillaAccion(filas: Parameters<typeof importarProductos>[2]): Promise<Respuesta<{ creados: number; salteados: string[] }>> {
  const r = await responder((authUserId) => importarProductos(obtenerBaseDatos(), authUserId, filas));
  if (r.ok) refresh();
  return r;
}
