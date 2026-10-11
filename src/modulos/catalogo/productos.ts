import { and, asc, count, eq, ilike, ne, or, sql } from "drizzle-orm";
import { z } from "zod";

import { auditar, diferencias } from "@/db/auditoria";
import { categoria, empresa, presentacion, producto, proveedor, proveedorProducto, unidadMedida } from "@/db/esquema";
import type { BaseDatos, Transaccion } from "@/db/tipos";
import { codigoSugerido } from "@/dominio/catalogo/productos";
import { dec } from "@/dominio/dinero/decimal";
import { ErrorDeNegocio } from "@/dominio/errores";
import type { ContextoUsuario } from "@/modulos/seguridad/contexto";
import { registrarActividad } from "@/modulos/colaboracion/registro";
import { ocultarCategoriasVacias, resolverCategoria } from "./categorias";
import { ejecutarComoUsuario } from "@/modulos/seguridad/contexto";
import { recalcularPedidosPendientes } from "@/modulos/pedidos/pedidos";
import { numeroObligatorio, numeroOpcional, textoObligatorio, textoOpcional, validar } from "@/modulos/validacion";

// P-10 Productos y P-11 Ficha de producto (08 §5.2), reglas RN-001 a RN-009 y RN-073.

export type UnidadBase = (typeof unidadMedida.enumValues)[number];

/** Nombre de la presentación de unidad base que se crea con cada producto (03 §5.3). */
export const NOMBRE_UNIDAD: Readonly<Record<UnidadBase, string>> = {
  KG: "kg",
  UNIDAD: "unidad",
  ATADO: "atado",
  MAPLE: "maple",
  BANDEJA: "bandeja",
  DOCENA: "docena",
  PAQUETE: "paquete",
  LITRO: "litro",
  CAJON: "cajón",
  CAJA: "caja",
  BOLSA: "bolsa",
  JAULA: "jaula",
  BOLSON: "bolsón",
  RISTRA: "ristra",
};

export interface ProductoListado {
  id: string;
  codigo: string;
  nombre: string;
  categoriaId: string;
  categoria: string;
  /** VERDURA, FRUTA u OTRO: para el dibujo cuando el nombre no lo dice. */
  grupo: string;
  /** Envase con el que se compra habitualmente ("Cajón 18 kg"). */
  presentacionCompra: string | null;
  /** Solo con `precios.ver_costos`: el costo por unidad base más barato entre los proveedores. */
  mejorCosto: string | null;
  unidadBase: UnidadBase;
  presentaciones: number;
  ofertas: number;
  proveedorPreferido: string | null;
  activo: boolean;
}

export interface PresentacionDeProducto {
  id: string;
  nombre: string;
  factorABase: string;
  usableEnCompra: boolean;
  usableEnVenta: boolean;
  esUnidadBase: boolean;
  activo: boolean;
  /** Tiene ofertas (o, más adelante, pedidos y compras): su factor ya no se cambia (RN-003). */
  enUso: boolean;
}

export interface FichaProducto {
  id: string;
  codigo: string;
  nombre: string;
  nombreCorto: string | null;
  categoriaId: string;
  categoria: string;
  grupo: string;
  unidadBase: UnidadBase;
  admiteFraccion: boolean;
  alicuotaIva: string;
  observaciones: string | null;
  proveedorPreferidoId: string | null;
  proveedorPreferido: string | null;
  presentacionVentaDefaultId: string | null;
  presentacionCompraDefaultId: string | null;
  activo: boolean;
  presentaciones: PresentacionDeProducto[];
  /** Se puede cambiar la unidad base: todavía no tiene otras presentaciones ni ofertas (RN-001). */
  unidadBaseEditable: boolean;
  /** La ganancia propia del producto (%), la de su categoría y la general: se aplica la primera que haya. */
  ganancia: { propia: string | null; categoria: string | null; general: string };
}

const MENSAJE_FACTOR = "El factor es cuántas unidades base trae la presentación (ej. 18 para un cajón de 18 kg).";

const camposProducto = {
  codigo: textoObligatorio("Escribí un código corto (ej. TOM-R).", 20).transform((v) => v.toUpperCase()),
  nombre: textoObligatorio("Escribí el nombre del producto.", 120),
  nombreCorto: textoOpcional(40),
  /** Una categoría que existe; si no se da, `categoriaNombre` (una nueva o preelegida; vacío = "Sin categoría"). RN-154. */
  categoriaId: z
    .string()
    .nullish()
    .transform((v) => (v?.trim() ? v.trim() : null))
    .pipe(z.uuid("Elegí la categoría.").nullable()),
  categoriaNombre: textoOpcional(80),
  unidadBase: z.enum(unidadMedida.enumValues, "Elegí la unidad base."),
  admiteFraccion: z.boolean(),
  observaciones: textoOpcional(500),
};

const esquemaNuevoProducto = z
  .object({
    ...camposProducto,
    /** Vacío = se arma solo con el nombre ("Tomate redondo" → "TOMA-R"). */
    codigo: textoOpcional(20).transform((v) => v?.toUpperCase() ?? null),
    /** Presentación de compra opcional al crear (ej. "Cajón 18 kg", 18). */
    presentacionCompraNombre: textoOpcional(60),
    presentacionCompraFactor: numeroOpcional(MENSAJE_FACTOR),
  })
  .refine((d) => !d.presentacionCompraNombre || d.presentacionCompraFactor !== null, {
    message: "Indicá cuántas unidades base trae la presentación de compra.",
  });

const esquemaEdicionProducto = z.object({
  id: z.uuid(),
  ...camposProducto,
  presentacionVentaDefaultId: z.uuid().nullish(),
  presentacionCompraDefaultId: z.uuid().nullish(),
});

const esquemaPresentacion = z
  .object({
    nombre: textoObligatorio("Escribí el nombre de la presentación (ej. Cajón 18 kg).", 60),
    factorABase: numeroObligatorio(MENSAJE_FACTOR).refine((v) => dec(v).gt(0), { message: MENSAJE_FACTOR }),
    usableEnCompra: z.boolean(),
    usableEnVenta: z.boolean(),
  })
  .refine((d) => d.usableEnCompra || d.usableEnVenta, { message: "La presentación tiene que servir para comprar, para vender o para las dos cosas (RN-002)." });

// ——— Consultas ———

export async function listarProductos(
  db: BaseDatos,
  authUserId: string,
  filtros: { texto?: string; categoriaId?: string; estado?: "activos" | "inactivos" | "todos" } = {},
): Promise<ProductoListado[]> {
  return ejecutarComoUsuario(db, authUserId, "productos.ver", async (tx, c) => {
    const texto = filtros.texto?.trim();
    const estado = filtros.estado ?? "activos";
    const verCostos = c.permisos.tiene("precios.ver_costos");
    const presentaciones = tx
      .select({ productoId: presentacion.productoId, n: count().as("n_presentaciones") })
      .from(presentacion)
      .where(eq(presentacion.activo, true))
      .groupBy(presentacion.productoId)
      .as("pres");
    const ofertas = tx
      .select({ productoId: proveedorProducto.productoId, n: count().as("n_ofertas") })
      .from(proveedorProducto)
      .where(eq(proveedorProducto.activo, true))
      .groupBy(proveedorProducto.productoId)
      .as("ofer");
    const filas = await tx
      .select({
        id: producto.id,
        codigo: producto.codigo,
        nombre: producto.nombre,
        categoriaId: categoria.id,
        categoria: categoria.nombre,
        grupo: categoria.grupo,
        presentacionCompra: sql<string | null>`(select pr.nombre from ${presentacion} pr where pr.id = producto.presentacion_compra_default_id)`,
        mejorCosto: sql<string | null>`(select min(pp.costo_base) from ${proveedorProducto} pp where pp.producto_id = producto.id and pp.activo and pp.disponible and pp.precio_vigente > 0)`,
        unidadBase: producto.unidadBase,
        presentaciones: presentaciones.n,
        ofertas: ofertas.n,
        proveedorPreferido: proveedor.nombre,
        activo: producto.activo,
      })
      .from(producto)
      .innerJoin(categoria, eq(categoria.id, producto.categoriaId))
      .leftJoin(proveedor, eq(proveedor.id, producto.proveedorPreferidoId))
      .leftJoin(presentaciones, eq(presentaciones.productoId, producto.id))
      .leftJoin(ofertas, eq(ofertas.productoId, producto.id))
      .where(
        and(
          estado === "todos" ? undefined : eq(producto.activo, estado === "activos"),
          filtros.categoriaId ? eq(producto.categoriaId, filtros.categoriaId) : undefined,
          texto ? or(ilike(producto.nombre, `%${texto}%`), ilike(producto.codigo, `%${texto}%`)) : undefined,
        ),
      )
      .orderBy(asc(categoria.orden), asc(categoria.nombre), asc(producto.nombre));
    return filas.map((f) => ({ ...f, mejorCosto: verCostos ? f.mejorCosto : null, presentaciones: Number(f.presentaciones ?? 0), ofertas: Number(f.ofertas ?? 0) }));
  });
}

/** Ids de las presentaciones que ya no pueden cambiar su factor (RN-003). */
async function presentacionesEnUso(tx: Transaccion, productoId: string): Promise<Set<string>> {
  // Se amplía con pedido_item, compra_item y entrega_item cuando existan (iteraciones 3, 4 y 6).
  const filas = await tx
    .selectDistinct({ id: proveedorProducto.presentacionId })
    .from(proveedorProducto)
    .where(eq(proveedorProducto.productoId, productoId));
  return new Set(filas.map((f) => f.id));
}

export async function obtenerProducto(db: BaseDatos, authUserId: string, id: string): Promise<FichaProducto> {
  return ejecutarComoUsuario(db, authUserId, "productos.ver", async (tx) => {
    const [p] = await tx
      .select({
        producto,
        categoria: categoria.nombre,
        grupo: categoria.grupo,
        recargoCategoria: categoria.recargoDefault,
        proveedorPreferido: proveedor.nombre,
      })
      .from(producto)
      .innerJoin(categoria, eq(categoria.id, producto.categoriaId))
      .leftJoin(proveedor, eq(proveedor.id, producto.proveedorPreferidoId))
      .where(eq(producto.id, id));
    if (!p) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el producto.");

    const presentaciones = await tx
      .select()
      .from(presentacion)
      .where(eq(presentacion.productoId, id))
      .orderBy(sql`${presentacion.activo} desc`, sql`${presentacion.esUnidadBase} desc`, asc(presentacion.factorABase));
    const enUso = await presentacionesEnUso(tx, id);
    const [e] = await tx.select({ recargo: empresa.recargoGlobal }).from(empresa);

    return {
      ganancia: { propia: p.producto.recargoDefault, categoria: p.recargoCategoria, general: e?.recargo ?? "0" },
      id: p.producto.id,
      codigo: p.producto.codigo,
      nombre: p.producto.nombre,
      nombreCorto: p.producto.nombreCorto,
      categoriaId: p.producto.categoriaId,
      categoria: p.categoria,
      grupo: p.grupo,
      unidadBase: p.producto.unidadBase,
      admiteFraccion: p.producto.admiteFraccion,
      alicuotaIva: p.producto.alicuotaIva,
      observaciones: p.producto.observaciones,
      proveedorPreferidoId: p.producto.proveedorPreferidoId,
      proveedorPreferido: p.proveedorPreferido,
      presentacionVentaDefaultId: p.producto.presentacionVentaDefaultId,
      presentacionCompraDefaultId: p.producto.presentacionCompraDefaultId,
      activo: p.producto.activo,
      presentaciones: presentaciones.map((pr) => ({
        id: pr.id,
        nombre: pr.nombre,
        factorABase: pr.factorABase,
        usableEnCompra: pr.usableEnCompra,
        usableEnVenta: pr.usableEnVenta,
        esUnidadBase: pr.esUnidadBase,
        activo: pr.activo,
        enUso: enUso.has(pr.id),
      })),
      unidadBaseEditable: presentaciones.length === 1 && enUso.size === 0,
    };
  });
}

// ——— Altas y cambios ———

async function exigirProductoLibre(tx: Transaccion, codigo: string, nombre: string, excluirId?: string) {
  const [repetido] = await tx
    .select({ codigo: producto.codigo, nombre: producto.nombre })
    .from(producto)
    .where(
      and(
        or(eq(sql`upper(${producto.codigo})`, codigo.toUpperCase()), eq(sql`lower(${producto.nombre})`, nombre.toLowerCase())),
        excluirId ? ne(producto.id, excluirId) : undefined,
      ),
    );
  if (repetido) {
    const campo = repetido.codigo.toUpperCase() === codigo.toUpperCase() ? `el código ${codigo}` : `el nombre "${nombre}"`;
    throw new ErrorDeNegocio("VALIDACION", `Ya hay un producto con ${campo} (RN-004).`);
  }
}

async function exigirNombrePresentacionLibre(tx: Transaccion, productoId: string, nombre: string, excluirId?: string) {
  const [repetida] = await tx
    .select({ id: presentacion.id })
    .from(presentacion)
    .where(
      and(
        eq(presentacion.productoId, productoId),
        eq(sql`lower(${presentacion.nombre})`, nombre.toLowerCase()),
        excluirId ? ne(presentacion.id, excluirId) : undefined,
      ),
    );
  if (repetida) throw new ErrorDeNegocio("VALIDACION", `El producto ya tiene una presentación "${nombre}".`);
}

export async function crearProducto(db: BaseDatos, authUserId: string, datos: z.input<typeof esquemaNuevoProducto>): Promise<string> {
  const d = validar(esquemaNuevoProducto, datos);
  return ejecutarComoUsuario(db, authUserId, "productos.editar", (tx, c) => crearProductoEnTransaccion(tx, c, d));
}

/**
 * Alta de un producto dentro de una transacción (la usan el alta guiada y la carga desde la
 * planilla): con su presentación de unidad base, la de compra si se dio, y la ganancia propia si
 * se dio. La categoría se resuelve antes (RN-154).
 */
export async function crearProductoEnTransaccion(
  tx: Transaccion,
  c: ContextoUsuario,
  d: z.output<typeof esquemaNuevoProducto> & { recargo?: string | null; actividad?: boolean },
): Promise<string> {
  const codigo = d.codigo ?? codigoSugerido(d.nombre, new Set((await tx.select({ codigo: producto.codigo }).from(producto)).map((p) => p.codigo)));
  await exigirProductoLibre(tx, codigo, d.nombre);
  const categoriaId = await resolverCategoria(tx, c, { id: d.categoriaId, nombre: d.categoriaNombre });
  const [e] = await tx.select({ alicuota: empresa.alicuotaIvaDefault }).from(empresa);

  const [nuevo] = await tx
    .insert(producto)
    .values({
      empresaId: c.empresaId,
      codigo,
      nombre: d.nombre,
      nombreCorto: d.nombreCorto,
      categoriaId,
      unidadBase: d.unidadBase,
      admiteFraccion: d.admiteFraccion,
      recargoDefault: d.recargo ?? null,
      alicuotaIva: e?.alicuota ?? "0.000", // RN-006
      observaciones: d.observaciones,
      creadoPor: c.usuarioId,
      actualizadoPor: c.usuarioId,
    })
    .returning({ id: producto.id });
  const productoId = nuevo!.id;
  const comunes = { empresaId: c.empresaId, productoId, creadoPor: c.usuarioId, actualizadoPor: c.usuarioId };

  const [base] = await tx
    .insert(presentacion)
    .values({ ...comunes, nombre: NOMBRE_UNIDAD[d.unidadBase], factorABase: "1", esUnidadBase: true })
    .returning({ id: presentacion.id });
  let compraId: string | null = null;
  if (d.presentacionCompraNombre && d.presentacionCompraFactor) {
    await exigirNombrePresentacionLibre(tx, productoId, d.presentacionCompraNombre);
    const [pc] = await tx
      .insert(presentacion)
      .values({ ...comunes, nombre: d.presentacionCompraNombre, factorABase: d.presentacionCompraFactor })
      .returning({ id: presentacion.id });
    compraId = pc!.id;
  }
  await tx
    .update(producto)
    .set({ presentacionVentaDefaultId: base!.id, presentacionCompraDefaultId: compraId })
    .where(eq(producto.id, productoId));

  await auditar(tx, {
    empresaId: c.empresaId,
    usuarioId: c.usuarioId,
    accion: "CREAR",
    entidad: "producto",
    entidadId: productoId,
    resumen: `Alta del producto ${codigo} · ${d.nombre}.`,
    datosDespues: { codigo, nombre: d.nombre, unidadBase: d.unidadBase, categoriaId, recargoDefault: d.recargo ?? null },
  });
  if (d.actividad !== false) await registrarActividad(tx, c, { accion: "CREAR", entidadTipo: "PRODUCTO", entidadId: productoId, resumen: `agregó el producto ${d.nombre}` });
  return productoId;
}

async function productoParaEditar(tx: Transaccion, id: string) {
  const [p] = await tx.select().from(producto).where(eq(producto.id, id));
  if (!p) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el producto.");
  return p;
}

async function auditarCambioProducto(
  tx: Transaccion,
  c: ContextoUsuario,
  antes: Record<string, unknown> & { nombre: string },
  despues: Record<string, unknown>,
  resumen: string,
) {
  const cambios = diferencias(antes, despues);
  if (!cambios.hayCambios) return false;
  await auditar(tx, {
    empresaId: c.empresaId,
    usuarioId: c.usuarioId,
    accion: "MODIFICAR",
    entidad: "producto",
    entidadId: antes.id as string,
    resumen,
    datosAntes: cambios.datosAntes,
    datosDespues: cambios.datosDespues,
  });
  return true;
}

export async function editarProducto(db: BaseDatos, authUserId: string, datos: z.input<typeof esquemaEdicionProducto>): Promise<void> {
  const d = validar(esquemaEdicionProducto, datos);
  await ejecutarComoUsuario(db, authUserId, "productos.editar", async (tx, c) => {
    const actual = await productoParaEditar(tx, d.id);
    await exigirProductoLibre(tx, d.codigo, d.nombre, d.id);
    const categoriaId = d.categoriaId === actual.categoriaId ? actual.categoriaId : await resolverCategoria(tx, c, { id: d.categoriaId, nombre: d.categoriaNombre });

    const presentaciones = await tx.select().from(presentacion).where(eq(presentacion.productoId, d.id));
    if (d.unidadBase !== actual.unidadBase) {
      const enUso = await presentacionesEnUso(tx, d.id);
      if (presentaciones.length > 1 || enUso.size > 0) {
        throw new ErrorDeNegocio(
          "VALIDACION",
          "La unidad base ya no se puede cambiar: el producto tiene presentaciones u ofertas cargadas en esa unidad (RN-001). Creá un producto nuevo.",
        );
      }
      await tx
        .update(presentacion)
        .set({ nombre: NOMBRE_UNIDAD[d.unidadBase], actualizadoPor: c.usuarioId })
        .where(and(eq(presentacion.productoId, d.id), eq(presentacion.esUnidadBase, true)));
    }

    for (const [idPresentacion, uso] of [
      [d.presentacionVentaDefaultId, "usableEnVenta"],
      [d.presentacionCompraDefaultId, "usableEnCompra"],
    ] as const) {
      if (!idPresentacion) continue;
      const pr = presentaciones.find((x) => x.id === idPresentacion);
      if (!pr?.activo || !pr[uso]) {
        throw new ErrorDeNegocio("VALIDACION", `La presentación por defecto tiene que estar activa y servir para ${uso === "usableEnVenta" ? "vender" : "comprar"}.`);
      }
    }

    const valores = {
      codigo: d.codigo,
      nombre: d.nombre,
      nombreCorto: d.nombreCorto,
      categoriaId,
      unidadBase: d.unidadBase,
      admiteFraccion: d.admiteFraccion,
      observaciones: d.observaciones,
      presentacionVentaDefaultId: d.presentacionVentaDefaultId ?? null,
      presentacionCompraDefaultId: d.presentacionCompraDefaultId ?? null,
    };
    if (!(await auditarCambioProducto(tx, c, actual, valores, `Cambios en el producto ${d.codigo} · ${d.nombre}.`))) return;
    await tx.update(producto).set({ ...valores, actualizadoPor: c.usuarioId }).where(eq(producto.id, d.id));
    await registrarActividad(tx, c, { accion: "MODIFICAR", entidadTipo: "PRODUCTO", entidadId: d.id, resumen: `cambió los datos del producto ${d.nombre}` });
    if (categoriaId !== actual.categoriaId) await ocultarCategoriasVacias(tx, c, [actual.categoriaId]);
  });
}

/** RN-007: un producto desactivado no se ofrece en pedidos ni compras nuevas; su historia queda. */
export async function cambiarEstadoProducto(db: BaseDatos, authUserId: string, datos: { id: string; activo: boolean }): Promise<void> {
  await ejecutarComoUsuario(db, authUserId, "productos.editar", async (tx, c) => {
    const actual = await productoParaEditar(tx, datos.id);
    if (actual.activo === datos.activo) return;
    // Su categoría vuelve a verse con él (RN-154).
    if (datos.activo) await resolverCategoria(tx, c, { id: actual.categoriaId });
    await tx.update(producto).set({ activo: datos.activo, actualizadoPor: c.usuarioId }).where(eq(producto.id, datos.id));
    if (!datos.activo) await ocultarCategoriasVacias(tx, c, [actual.categoriaId]);
    await auditar(tx, {
      empresaId: c.empresaId,
      usuarioId: c.usuarioId,
      accion: "CAMBIO_ESTADO",
      entidad: "producto",
      entidadId: datos.id,
      resumen: `${datos.activo ? "Reactivación" : "Desactivación"} del producto ${actual.codigo} · ${actual.nombre}.`,
      datosAntes: { activo: actual.activo },
      datosDespues: { activo: datos.activo },
    });
    await registrarActividad(tx, c, { accion: "MODIFICAR", entidadTipo: "PRODUCTO", entidadId: datos.id, resumen: `${datos.activo ? "reactivó" : "dio de baja"} el producto ${actual.nombre}` });
  });
}

export async function agregarPresentacion(
  db: BaseDatos,
  authUserId: string,
  datos: { productoId: string } & z.input<typeof esquemaPresentacion>,
): Promise<string> {
  const d = validar(esquemaPresentacion, datos);
  return ejecutarComoUsuario(db, authUserId, "productos.editar", async (tx, c) => {
    const p = await productoParaEditar(tx, datos.productoId);
    await exigirNombrePresentacionLibre(tx, p.id, d.nombre);
    const [nueva] = await tx
      .insert(presentacion)
      .values({ empresaId: c.empresaId, productoId: p.id, ...d, creadoPor: c.usuarioId, actualizadoPor: c.usuarioId })
      .returning({ id: presentacion.id });
    await auditar(tx, {
      empresaId: c.empresaId,
      usuarioId: c.usuarioId,
      accion: "CREAR",
      entidad: "presentacion",
      entidadId: nueva!.id,
      resumen: `Nueva presentación "${d.nombre}" (${d.factorABase} ${NOMBRE_UNIDAD[p.unidadBase]}) de ${p.nombre}.`,
      datosDespues: { productoId: p.id, ...d },
    });
    return nueva!.id;
  });
}

async function presentacionParaEditar(tx: Transaccion, id: string) {
  const [pr] = await tx
    .select({ presentacion, producto: { id: producto.id, nombre: producto.nombre, vta: producto.presentacionVentaDefaultId, cpa: producto.presentacionCompraDefaultId } })
    .from(presentacion)
    .innerJoin(producto, eq(producto.id, presentacion.productoId))
    .where(eq(presentacion.id, id));
  if (!pr) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró la presentación.");
  return pr;
}

/** El factor de una presentación en uso no cambia (RN-003): se crea otra y se desactiva esta. */
export async function editarPresentacion(
  db: BaseDatos,
  authUserId: string,
  datos: { id: string } & z.input<typeof esquemaPresentacion>,
): Promise<void> {
  const d = validar(esquemaPresentacion, datos);
  await ejecutarComoUsuario(db, authUserId, "productos.editar", async (tx, c) => {
    const { presentacion: actual, producto: p } = await presentacionParaEditar(tx, datos.id);
    await exigirNombrePresentacionLibre(tx, p.id, d.nombre, actual.id);
    const cambiaFactor = !dec(actual.factorABase).eq(dec(d.factorABase));
    if (cambiaFactor && actual.esUnidadBase) throw new ErrorDeNegocio("VALIDACION", "La presentación de unidad base siempre vale 1.");
    if (cambiaFactor && (await presentacionesEnUso(tx, p.id)).has(actual.id)) {
      throw new ErrorDeNegocio(
        "VALIDACION",
        "Esta presentación ya tiene ofertas: su factor no se cambia (RN-003). Creá una presentación nueva y desactivá esta.",
      );
    }
    if ((p.vta === actual.id && !d.usableEnVenta) || (p.cpa === actual.id && !d.usableEnCompra)) {
      throw new ErrorDeNegocio("VALIDACION", "Es la presentación por defecto del producto: elegí otra por defecto antes de quitarle ese uso.");
    }
    const valores = { nombre: d.nombre, factorABase: dec(d.factorABase).toFixed(3), usableEnCompra: d.usableEnCompra, usableEnVenta: d.usableEnVenta };
    const cambios = diferencias({ ...actual, factorABase: dec(actual.factorABase).toFixed(3) }, valores);
    if (!cambios.hayCambios) return;
    await tx.update(presentacion).set({ ...valores, actualizadoPor: c.usuarioId }).where(eq(presentacion.id, actual.id));
    await auditar(tx, {
      empresaId: c.empresaId,
      usuarioId: c.usuarioId,
      accion: "MODIFICAR",
      entidad: "presentacion",
      entidadId: actual.id,
      resumen: `Cambios en la presentación "${d.nombre}" de ${p.nombre}.`,
      datosAntes: cambios.datosAntes,
      datosDespues: cambios.datosDespues,
    });
  });
}

export async function cambiarEstadoPresentacion(db: BaseDatos, authUserId: string, datos: { id: string; activo: boolean }): Promise<void> {
  await ejecutarComoUsuario(db, authUserId, "productos.editar", async (tx, c) => {
    const { presentacion: actual, producto: p } = await presentacionParaEditar(tx, datos.id);
    if (actual.activo === datos.activo) return;
    if (!datos.activo) {
      if (actual.esUnidadBase) throw new ErrorDeNegocio("VALIDACION", "La presentación de unidad base no se desactiva.");
      const [oferta] = await tx
        .select({ id: proveedorProducto.id })
        .from(proveedorProducto)
        .where(and(eq(proveedorProducto.presentacionId, actual.id), eq(proveedorProducto.activo, true)))
        .limit(1);
      if (oferta) throw new ErrorDeNegocio("VALIDACION", "Hay proveedores que la cotizan: desactivá esas ofertas primero.");
      await tx
        .update(producto)
        .set({
          presentacionVentaDefaultId: p.vta === actual.id ? null : p.vta,
          presentacionCompraDefaultId: p.cpa === actual.id ? null : p.cpa,
        })
        .where(eq(producto.id, p.id));
    }
    await tx.update(presentacion).set({ activo: datos.activo, actualizadoPor: c.usuarioId }).where(eq(presentacion.id, actual.id));
    await auditar(tx, {
      empresaId: c.empresaId,
      usuarioId: c.usuarioId,
      accion: "CAMBIO_ESTADO",
      entidad: "presentacion",
      entidadId: actual.id,
      resumen: `${datos.activo ? "Reactivación" : "Desactivación"} de la presentación "${actual.nombre}" de ${p.nombre}.`,
      datosAntes: { activo: actual.activo },
      datosDespues: { activo: datos.activo },
    });
  });
}

/** RN-073: un solo proveedor preferido por producto, que tiene que ofrecerlo. */
export async function marcarProveedorPreferido(
  db: BaseDatos,
  authUserId: string,
  datos: { productoId: string; proveedorId: string | null },
): Promise<void> {
  await ejecutarComoUsuario(db, authUserId, "productos.editar", async (tx, c) => {
    const actual = await productoParaEditar(tx, datos.productoId);
    if (actual.proveedorPreferidoId === datos.proveedorId) return;
    if (datos.proveedorId) {
      const [oferta] = await tx
        .select({ id: proveedorProducto.id })
        .from(proveedorProducto)
        .innerJoin(proveedor, eq(proveedor.id, proveedorProducto.proveedorId))
        .where(
          and(
            eq(proveedorProducto.productoId, actual.id),
            eq(proveedorProducto.proveedorId, datos.proveedorId),
            eq(proveedorProducto.activo, true),
            eq(proveedor.activo, true),
          ),
        )
        .limit(1);
      if (!oferta) throw new ErrorDeNegocio("VALIDACION", "El preferido tiene que ser un proveedor activo que ofrezca este producto.");
    }
    await tx.update(producto).set({ proveedorPreferidoId: datos.proveedorId, actualizadoPor: c.usuarioId }).where(eq(producto.id, actual.id));
    await auditar(tx, {
      empresaId: c.empresaId,
      usuarioId: c.usuarioId,
      accion: "MODIFICAR",
      entidad: "producto",
      entidadId: actual.id,
      resumen: `Proveedor preferido de ${actual.nombre}.`,
      datosAntes: { proveedorPreferidoId: actual.proveedorPreferidoId },
      datosDespues: { proveedorPreferidoId: datos.proveedorId },
    });
    await recalcularPedidosPendientes(tx, { productoIds: [actual.id] });
  });
}

/** Presentaciones de compra activas de productos activos, para elegir al cargar una oferta desde el proveedor. */
export async function listarPresentacionesDeCompra(
  db: BaseDatos,
  authUserId: string,
): Promise<{ productoId: string; producto: string; presentacionId: string; presentacion: string }[]> {
  return ejecutarComoUsuario(db, authUserId, "productos.ver", async (tx) =>
    tx
      .select({ productoId: producto.id, producto: producto.nombre, presentacionId: presentacion.id, presentacion: presentacion.nombre })
      .from(presentacion)
      .innerJoin(producto, eq(producto.id, presentacion.productoId))
      .where(and(eq(producto.activo, true), eq(presentacion.activo, true), eq(presentacion.usableEnCompra, true)))
      .orderBy(asc(producto.nombre), asc(presentacion.factorABase)),
  );
}

/** Para el ejemplo del alta guiada: el recargo general y el de cada categoría (el que se usaría si el producto no tiene uno). */
export async function recargosParaAlta(db: BaseDatos, authUserId: string): Promise<{ global: string; porCategoria: Record<string, string | null>; codigos: string[] }> {
  return ejecutarComoUsuario(db, authUserId, "productos.ver", async (tx) => {
    const [e] = await tx.select({ recargo: empresa.recargoGlobal }).from(empresa);
    const categorias = await tx.select({ id: categoria.id, recargo: categoria.recargoDefault }).from(categoria);
    const codigos = await tx.select({ codigo: producto.codigo }).from(producto);
    return { global: e?.recargo ?? "30", porCategoria: Object.fromEntries(categorias.map((x) => [x.id, x.recargo])), codigos: codigos.map((x) => x.codigo) };
  });
}

