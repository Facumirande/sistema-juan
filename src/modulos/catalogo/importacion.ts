import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { categoria, producto } from "@/db/esquema";
import type { BaseDatos } from "@/db/tipos";
import { CATEGORIAS_PREELEGIDAS, normalizar } from "@/dominio/catalogo/categorias";
import { COLUMNAS_PLANILLA, filasDePlanilla, interpretarProductos, type ProductoAImportar } from "@/dominio/catalogo/importacion";
import { UNIDADES_EN_PALABRAS } from "@/dominio/catalogo/productos";
import { ErrorDeNegocio } from "@/dominio/errores";
import type { Hoja } from "@/lib/planilla";
import { registrarActividad } from "@/modulos/colaboracion/registro";
import { ejecutarComoUsuario } from "@/modulos/seguridad/contexto";
import { validar } from "@/modulos/validacion";

import { crearProductoEnTransaccion, NOMBRE_UNIDAD } from "./productos";

// Planilla modelo de productos y su carga (pedido del usuario, 06/10/2026, RN-155): se baja una
// planilla con listas para elegir (categoría, cómo se vende, envase; todas con "Ninguna"), se
// completa (alcanza con los nombres uno debajo del otro), se sube, se revisa lo que va a pasar con
// cada fila y se cargan todos juntos.

/** Hasta cuántos productos se cargan de una vez (una planilla de un negocio chico tiene decenas). */
export const MAXIMO_POR_PLANILLA = 500;
const FILAS_CON_LISTAS = MAXIMO_POR_PLANILLA + 1;
const ENVASES = ["Cajón", "Bolsa", "Caja", "Jaula", "Bandeja", "Paquete", "Bulto", "Bidón", "Suelto"];

async function contexto(db: BaseDatos, authUserId: string) {
  return ejecutarComoUsuario(db, authUserId, "productos.ver", async (tx) => {
    const productos = await tx.select({ codigo: producto.codigo, nombre: producto.nombre }).from(producto);
    const categorias = await tx
      .select({
        nombre: categoria.nombre,
        // Con una sola tabla, Drizzle no pone el nombre de la tabla: va escrito completo.
        conProductos: sql<boolean>`exists (select 1 from ${producto} p where p.categoria_id = categoria.id and p.activo)`,
      })
      .from(categoria)
      .orderBy(asc(categoria.orden), asc(categoria.nombre));
    return {
      codigos: productos.map((p) => p.codigo),
      nombres: productos.map((p) => p.nombre),
      categorias: categorias.map((c) => c.nombre),
      // Las que se ven: con algún producto activo (RN-154).
      categoriasVisibles: categorias.filter((c) => c.conProductos).map((c) => c.nombre),
    };
  });
}

/**
 * La planilla modelo para bajar: la hoja "Productos" con los títulos y las listas para elegir, la
 * hoja "Cómo llenarla" con un ejemplo, y las listas (oculta). Las categorías son las preelegidas,
 * las del negocio y "Ninguna".
 */
export async function planillaModeloDeProductos(db: BaseDatos, authUserId: string): Promise<Hoja[]> {
  const ctx = await contexto(db, authUserId);
  const categorias = [...new Set([...CATEGORIAS_PREELEGIDAS.map((c) => c.nombre), ...ctx.categoriasVisibles.filter((n) => normalizar(n) !== "sin categoria")])];
  /** El rango de una columna de la hoja "Listas" (A, B, C) con sus opciones. */
  const rango = (columna: number, opciones: readonly string[]) => {
    const letra = String.fromCharCode(65 + columna);
    return `Listas!$${letra}$2:$${letra}$${opciones.length + 1}`;
  };
  const opcionesCategoria = [...categorias, "Ninguna"];
  const opcionesUnidad = [...Object.values(UNIDADES_EN_PALABRAS), "Ninguna"];
  const opcionesEnvase = [...ENVASES, "Ninguno"];
  const largo = Math.max(opcionesCategoria.length, opcionesUnidad.length, opcionesEnvase.length);
  return [
    {
      nombre: "Productos",
      columnas: [...COLUMNAS_PLANILLA],
      filas: [],
      anchos: [32, 20, 16, 24, 22, 14, 18],
      listas: [
        { columna: 1, filas: [2, FILAS_CON_LISTAS], opciones: rango(0, opcionesCategoria), estricta: false, ayuda: { titulo: "Categoría", texto: "Elegí una de la lista (o Ninguna). Si la dejás vacía, el sistema propone una según el producto. Podés escribir otra." } },
        { columna: 2, filas: [2, FILAS_CON_LISTAS], opciones: rango(1, opcionesUnidad), estricta: true, ayuda: { titulo: "Se vende por", texto: "Cómo se anotan los pedidos: kilo, unidad, atado… Es importante: si falta, el sistema avisa." } },
        { columna: 3, filas: [2, FILAS_CON_LISTAS], opciones: rango(2, opcionesEnvase), estricta: false, ayuda: { titulo: "Envase", texto: "En qué se compra en el mercado (opcional). Si ponés uno, escribí al lado cuánto trae." } },
      ],
    },
    {
      nombre: "Cómo llenarla",
      columnas: ["Cómo llenar la planilla de productos"],
      anchos: [110],
      filas: [
        ["1. En la hoja “Productos”, escribí un producto por fila en la columna Producto. Con eso alcanza."],
        ["2. Lo demás es opcional: Categoría, Se vende por y Envase tienen listas para elegir; en todas se puede elegir Ninguna."],
        ["3. El código se crea solo al cargar la planilla (si querés uno propio, escribilo en la columna Código)."],
        ["4. Al subirla, el sistema elige el dibujo de cada producto, propone la categoría y cómo se vende si quedaron vacías,"],
        ["   y te avisa lo importante que falta antes de cargar. Los productos que ya existen no se repiten."],
        [""],
        ["Ejemplo:"],
        ["Producto: Papa · Categoría: Duras · Se vende por: Kilo · Envase: Bolsa · Cuánto trae: 25"],
        ["Producto: Lechuga criolla · Categoría: De hoja · Se vende por: Unidad · Envase: Jaula · Cuánto trae: 12"],
        ["Producto: Frutilla (y nada más: el sistema propone Frágiles y Kilo, y te avisa que revises cómo se vende)"],
        [""],
        ["Categorías: Duras va abajo del cajón, Blandas arriba, De hoja y Aromáticas separadas, Frágiles arriba de todo."],
      ],
    },
    {
      nombre: "Listas",
      columnas: ["Categorías", "Se vende por", "Envases"],
      oculta: true,
      filas: Array.from({ length: largo }, (_, i) => [opcionesCategoria[i] ?? null, opcionesUnidad[i] ?? null, opcionesEnvase[i] ?? null]),
    },
  ];
}

/** Lo que va a pasar con cada fila de la planilla subida (todavía no se carga nada). */
export async function previsualizarProductos(db: BaseDatos, authUserId: string, celdas: readonly (readonly string[])[]): Promise<{ productos: ProductoAImportar[]; categorias: string[] }> {
  const filas = filasDePlanilla(celdas);
  if (filas.length === 0) throw new ErrorDeNegocio("VALIDACION", "La planilla no tiene productos: escribí un producto por fila en la columna Producto.");
  if (filas.length > MAXIMO_POR_PLANILLA) throw new ErrorDeNegocio("VALIDACION", `La planilla tiene ${filas.length} productos: cargá hasta ${MAXIMO_POR_PLANILLA} por vez.`);
  const ctx = await contexto(db, authUserId);
  const categorias = [...new Set([...CATEGORIAS_PREELEGIDAS.map((c) => c.nombre), ...ctx.categoriasVisibles])];
  return { productos: interpretarProductos(filas, ctx), categorias };
}

const UNIDADES = Object.keys(NOMBRE_UNIDAD) as [keyof typeof NOMBRE_UNIDAD, ...(keyof typeof NOMBRE_UNIDAD)[]];

const esquemaFila = z.object({
  nombre: z.string().trim().min(1).max(120),
  codigo: z.string().trim().min(1).max(20),
  categoria: z.string().trim().max(80).nullable(),
  unidad: z.enum(UNIDADES),
  admiteFraccion: z.boolean(),
  envase: z.object({ nombre: z.string().trim().min(1).max(60), factor: z.string().regex(/^\d+(\.\d+)?$/) }).nullable(),
  ganancia: z
    .string()
    .regex(/^-?\d+(\.\d+)?$/)
    .nullable(),
});

export interface ResultadoImportacion {
  creados: number;
  /** Nombres que no se cargaron porque ya existían. */
  salteados: string[];
}

/**
 * Carga los productos revisados, todos juntos en una transacción (si uno falla no queda ninguno a
 * medias). Los que ya existen se saltean; las categorías se crean o reaparecen solas (RN-154).
 */
export async function importarProductos(db: BaseDatos, authUserId: string, filas: readonly z.input<typeof esquemaFila>[]): Promise<ResultadoImportacion> {
  const d = validar(z.array(esquemaFila).min(1, "No hay productos para cargar.").max(MAXIMO_POR_PLANILLA, `Cargá hasta ${MAXIMO_POR_PLANILLA} productos por vez.`), filas);
  return ejecutarComoUsuario(db, authUserId, "productos.editar", async (tx, c) => {
    const existentes = new Set((await tx.select({ nombre: producto.nombre }).from(producto)).map((p) => normalizar(p.nombre)));
    const ocupados = new Set((await tx.select({ codigo: producto.codigo }).from(producto)).map((p) => p.codigo.toUpperCase()));
    let creados = 0;
    const salteados: string[] = [];
    for (const f of d) {
      if (existentes.has(normalizar(f.nombre))) {
        salteados.push(f.nombre);
        continue;
      }
      existentes.add(normalizar(f.nombre));
      await crearProductoEnTransaccion(tx, c, {
        codigo: ocupados.has(f.codigo.toUpperCase()) ? null : f.codigo.toUpperCase(),
        nombre: f.nombre,
        nombreCorto: null,
        categoriaId: null,
        categoriaNombre: f.categoria,
        unidadBase: f.unidad,
        admiteFraccion: f.admiteFraccion,
        observaciones: null,
        presentacionCompraNombre: f.envase?.nombre ?? null,
        presentacionCompraFactor: f.envase?.factor ?? null,
        recargo: f.ganancia,
        actividad: false,
      });
      ocupados.add(f.codigo.toUpperCase());
      creados++;
    }
    if (creados > 0) {
      const [primero] = await tx.select({ id: producto.id }).from(producto).where(eq(producto.nombre, d.find((f) => !salteados.includes(f.nombre))!.nombre));
      await registrarActividad(tx, c, { accion: "IMPORTAR", entidadTipo: "PRODUCTO", entidadId: primero?.id ?? null, resumen: `cargó ${creados === 1 ? "1 producto" : `${creados} productos`} desde la planilla` });
    }
    return { creados, salteados };
  });
}
