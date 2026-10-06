import { and, asc, eq, gte, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";

import { auditar } from "@/db/auditoria";
import { categoria, cliente, empresa, presentacion, producto, reglaPrecio, tipoReglaPrecio } from "@/db/esquema";
import type { BaseDatos, Transaccion } from "@/db/tipos";
import { aNumeric, dec } from "@/dominio/dinero/decimal";
import { formatearPorcentaje } from "@/dominio/dinero/formato";
import { ErrorDeNegocio } from "@/dominio/errores";
import { sumarDias, type FechaISO } from "@/dominio/fechas/fechas";
import type { PrecioVenta } from "@/dominio/precios/venta";
import { hoyYSugerida } from "@/modulos/pedidos/jornadas";
import { recalcularPedidosPendientes } from "@/modulos/pedidos/pedidos";
import { registrarActividad } from "@/modulos/colaboracion/registro";
import { ejecutarComoUsuario, type ContextoUsuario } from "@/modulos/seguridad/contexto";
import { numeroObligatorio, numeroOpcional, textoOpcional, validar } from "@/modulos/validacion";

import { calcularPrecios } from "./calculo";

// Reglas de precio del cliente (P-33) y recargos de los niveles 4 a 7 (05 §5.2). RN-079, RN-084, RN-091.

export type TipoRegla = (typeof tipoReglaPrecio.enumValues)[number];
export type EstadoRegla = "VIGENTE" | "PROGRAMADA" | "VENCIDA" | "DESACTIVADA";

export interface ReglaListada {
  id: string;
  tipo: TipoRegla;
  productoId: string | null;
  producto: string | null;
  unidadBase: string | null;
  categoriaId: string | null;
  categoria: string | null;
  valor: string;
  vigenteDesde: FechaISO;
  vigenteHasta: FechaISO | null;
  referencia: string | null;
  estado: EstadoRegla;
}

/** Recargos fuera de 0 % a 300 % piden confirmación (RN-084). */
const RECARGO_MINIMO_SIN_CONFIRMAR = 0;
const RECARGO_MAXIMO_SIN_CONFIRMAR = 300;

function exigirRecargoRazonable(valor: string, confirmar: boolean) {
  const v = dec(valor);
  if (v.lte(-100)) throw new ErrorDeNegocio("VALIDACION", "El recargo tiene que ser mayor que -100 %.");
  if (!confirmar && (v.lt(RECARGO_MINIMO_SIN_CONFIRMAR) || v.gt(RECARGO_MAXIMO_SIN_CONFIRMAR))) {
    throw new ErrorDeNegocio("VALIDACION", `Un recargo de ${formatearPorcentaje(v, 1)} es poco común. Si está bien, tocá "Confirmar" (RN-084).`, {
      requiereConfirmacion: true,
    });
  }
}

function estadoDe(r: { activo: boolean; vigenteDesde: string; vigenteHasta: string | null }, hoy: FechaISO): EstadoRegla {
  if (!r.activo) return "DESACTIVADA";
  if (r.vigenteDesde > hoy) return "PROGRAMADA";
  if (r.vigenteHasta !== null && r.vigenteHasta < hoy) return "VENCIDA";
  return "VIGENTE";
}

export async function listarReglasCliente(db: BaseDatos, authUserId: string, clienteId: string): Promise<{ reglas: ReglaListada[]; recargoCliente: string | null }> {
  return ejecutarComoUsuario(db, authUserId, "precios.ver_margenes", async (tx) => {
    const { hoy } = await hoyYSugerida(tx);
    const [cli] = await tx.select({ recargo: cliente.recargoDefault }).from(cliente).where(eq(cliente.id, clienteId));
    if (!cli) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el cliente.");
    const filas = await tx
      .select({ regla: reglaPrecio, producto: producto.nombre, unidadBase: producto.unidadBase, categoria: categoria.nombre })
      .from(reglaPrecio)
      .leftJoin(producto, eq(producto.id, reglaPrecio.productoId))
      .leftJoin(categoria, eq(categoria.id, reglaPrecio.categoriaId))
      .where(eq(reglaPrecio.clienteId, clienteId))
      .orderBy(sql`${reglaPrecio.activo} desc`, asc(sql`coalesce(${producto.nombre}, ${categoria.nombre})`), asc(reglaPrecio.vigenteDesde));
    return {
      recargoCliente: cli.recargo,
      reglas: filas.map((f) => ({
        id: f.regla.id,
        tipo: f.regla.tipo,
        productoId: f.regla.productoId,
        producto: f.producto,
        unidadBase: f.unidadBase,
        categoriaId: f.regla.categoriaId,
        categoria: f.categoria,
        valor: f.regla.valor,
        vigenteDesde: f.regla.vigenteDesde,
        vigenteHasta: f.regla.vigenteHasta,
        referencia: f.regla.referencia,
        estado: estadoDe(f.regla, hoy),
      })),
    };
  });
}

const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const fechaOpcional = z
  .string()
  .nullish()
  .transform((v) => (v?.trim() ? v.trim() : null))
  .refine((v) => v === null || PATRON_FECHA.test(v), { message: "Fecha inválida." });

const esquemaRegla = z
  .object({
    clienteId: z.uuid(),
    tipo: z.enum(tipoReglaPrecio.enumValues),
    productoId: z.uuid().nullish(),
    categoriaId: z.uuid().nullish(),
    valor: numeroObligatorio("Escribí el valor: el % de recargo o el precio pactado."),
    /** Precio fijo cargado por presentación: se convierte a unidad base (05 §5.5). */
    presentacionId: z.uuid().nullish(),
    vigenteDesde: fechaOpcional,
    vigenteHasta: fechaOpcional,
    referencia: textoOpcional(120),
    confirmar: z.boolean().default(false),
  })
  .refine((d) => (d.productoId ? 1 : 0) + (d.categoriaId ? 1 : 0) === 1, { message: "Elegí un producto o una categoría." })
  .refine((d) => d.tipo !== "PRECIO_FIJO" || d.productoId, { message: "Un precio fijo es para un producto." });

async function auditarRegla(tx: Transaccion, c: ContextoUsuario, reglaId: string, resumen: string, antes: Record<string, unknown> | null, despues: Record<string, unknown> | null) {
  await auditar(tx, { empresaId: c.empresaId, usuarioId: c.usuarioId, accion: "CAMBIO_REGLA_PRECIO", entidad: "regla_precio", entidadId: reglaId, resumen, datosAntes: antes, datosDespues: despues });
}

/**
 * Nueva regla (P-33). Si ya hay una del mismo tipo vigente sin fin que empezó antes, se cierra el
 * día anterior ("Nuevo precio desde…", 05 §5.4); cualquier otra superposición se rechaza (RN-079).
 */
export async function crearRegla(db: BaseDatos, authUserId: string, datos: z.input<typeof esquemaRegla>): Promise<string> {
  const d = validar(esquemaRegla, datos);
  return ejecutarComoUsuario(db, authUserId, "precios.editar_reglas", async (tx, c) => {
    const { hoy } = await hoyYSugerida(tx);
    const desde = d.vigenteDesde ?? hoy;
    if (d.vigenteHasta && d.vigenteHasta < desde) throw new ErrorDeNegocio("VALIDACION", "La vigencia termina antes de empezar.");
    const [cli] = await tx.select({ nombre: cliente.nombre }).from(cliente).where(eq(cliente.id, d.clienteId)).for("update");
    if (!cli) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el cliente.");

    let valor = dec(d.valor);
    if (d.tipo === "RECARGO") exigirRecargoRazonable(d.valor, d.confirmar);
    if (d.tipo === "PRECIO_FIJO") {
      if (valor.lt(0)) throw new ErrorDeNegocio("VALIDACION", "El precio no puede ser negativo.");
      if (d.presentacionId) {
        const [pr] = await tx
          .select({ factor: presentacion.factorABase })
          .from(presentacion)
          .where(and(eq(presentacion.id, d.presentacionId), eq(presentacion.productoId, d.productoId!)));
        if (!pr) throw new ErrorDeNegocio("VALIDACION", "La presentación no es de ese producto.");
        valor = valor.div(pr.factor);
      }
    }

    const mismoObjetivo = d.productoId ? eq(reglaPrecio.productoId, d.productoId) : eq(reglaPrecio.categoriaId, d.categoriaId!);
    const superpuestas = await tx
      .select()
      .from(reglaPrecio)
      .where(
        and(
          eq(reglaPrecio.clienteId, d.clienteId),
          eq(reglaPrecio.tipo, d.tipo),
          eq(reglaPrecio.activo, true),
          mismoObjetivo,
          or(isNull(reglaPrecio.vigenteHasta), gte(reglaPrecio.vigenteHasta, desde)),
          d.vigenteHasta ? sql`${reglaPrecio.vigenteDesde} <= ${d.vigenteHasta}` : undefined,
        ),
      );
    for (const r of superpuestas) {
      if (r.vigenteDesde < desde) {
        const hasta = sumarDias(desde, -1);
        await tx.update(reglaPrecio).set({ vigenteHasta: hasta, actualizadoPor: c.usuarioId }).where(eq(reglaPrecio.id, r.id));
        await auditarRegla(tx, c, r.id, `Regla cerrada el ${hasta} por una nueva desde el ${desde}.`, { vigenteHasta: r.vigenteHasta }, { vigenteHasta: hasta });
      } else {
        throw new ErrorDeNegocio("VALIDACION", `Ya hay una regla igual para esas fechas (desde el ${r.vigenteDesde}): cerrala o desactivala primero (RN-079).`);
      }
    }

    const [nueva] = await tx
      .insert(reglaPrecio)
      .values({
        empresaId: c.empresaId,
        clienteId: d.clienteId,
        productoId: d.productoId ?? null,
        categoriaId: d.categoriaId ?? null,
        tipo: d.tipo,
        valor: aNumeric(valor, 4),
        vigenteDesde: desde,
        vigenteHasta: d.vigenteHasta,
        referencia: d.referencia,
        creadoPor: c.usuarioId,
        actualizadoPor: c.usuarioId,
      })
      .returning({ id: reglaPrecio.id });
    await auditarRegla(tx, c, nueva!.id, `Nueva regla ${d.tipo === "RECARGO" ? "de recargo" : "de precio fijo"} para ${cli.nombre}.`, null, {
      tipo: d.tipo,
      productoId: d.productoId,
      categoriaId: d.categoriaId,
      valor: aNumeric(valor, 4),
      vigenteDesde: desde,
      vigenteHasta: d.vigenteHasta,
    });
    await recalcularPedidosPendientes(tx, { clienteId: d.clienteId });
    return nueva!.id;
  });
}

/** Quitar una regla: se cierra ayer si ya estaba en uso; si todavía no empezó, se desactiva. No se borra. */
export async function cerrarRegla(db: BaseDatos, authUserId: string, reglaId: string): Promise<void> {
  await ejecutarComoUsuario(db, authUserId, "precios.editar_reglas", async (tx, c) => {
    const { hoy } = await hoyYSugerida(tx);
    const [r] = await tx.select().from(reglaPrecio).where(eq(reglaPrecio.id, reglaId)).for("update");
    if (!r) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró la regla.");
    if (!r.activo) return;
    const ayer = sumarDias(hoy, -1);
    if (r.vigenteDesde > ayer) {
      await tx.update(reglaPrecio).set({ activo: false, actualizadoPor: c.usuarioId }).where(eq(reglaPrecio.id, r.id));
      await auditarRegla(tx, c, r.id, "Regla desactivada antes de empezar a regir.", { activo: true }, { activo: false });
    } else if (r.vigenteHasta === null || r.vigenteHasta > ayer) {
      await tx.update(reglaPrecio).set({ vigenteHasta: ayer, actualizadoPor: c.usuarioId }).where(eq(reglaPrecio.id, r.id));
      await auditarRegla(tx, c, r.id, `Regla cerrada el ${ayer}.`, { vigenteHasta: r.vigenteHasta }, { vigenteHasta: ayer });
    }
    await recalcularPedidosPendientes(tx, { clienteId: r.clienteId });
  });
}

export type AmbitoRecargo = "GLOBAL" | "CATEGORIA" | "PRODUCTO" | "CLIENTE";

const esquemaRecargo = z.object({
  ambito: z.enum(["GLOBAL", "CATEGORIA", "PRODUCTO", "CLIENTE"]),
  id: z.uuid().nullish(),
  /** Vacío = sin recargo propio (usa el nivel siguiente); el global es obligatorio. */
  valor: numeroOpcional("El recargo es un porcentaje (ej. 30)."),
  confirmar: z.boolean().default(false),
});

/** Recargos de los niveles 4 a 7 (05 §5.2): sin vigencia, auditados (RN-091). Recalcula los pedidos pendientes. */
export async function cambiarRecargo(db: BaseDatos, authUserId: string, datos: z.input<typeof esquemaRecargo>): Promise<void> {
  const d = validar(esquemaRecargo, datos);
  await ejecutarComoUsuario(db, authUserId, "precios.editar_reglas", async (tx, c) => {
    if (d.valor !== null) exigirRecargoRazonable(d.valor, d.confirmar);
    const valor = d.valor === null ? null : aNumeric(d.valor, 3);
    let antes: string | null;
    let descripcion: string;
    let filtro: { productoIds?: string[]; clienteId?: string } = {};

    if (d.ambito === "GLOBAL") {
      if (valor === null) throw new ErrorDeNegocio("VALIDACION", "El recargo global es obligatorio.");
      const [e] = await tx.select({ id: empresa.id, recargo: empresa.recargoGlobal }).from(empresa);
      antes = e!.recargo;
      descripcion = "global";
      await tx.update(empresa).set({ recargoGlobal: valor, actualizadoPor: c.usuarioId }).where(eq(empresa.id, e!.id));
    } else if (!d.id) {
      throw new ErrorDeNegocio("VALIDACION", "Falta indicar a qué se aplica el recargo.");
    } else if (d.ambito === "CATEGORIA") {
      const [x] = await tx.select({ nombre: categoria.nombre, recargo: categoria.recargoDefault }).from(categoria).where(eq(categoria.id, d.id));
      if (!x) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró la categoría.");
      antes = x.recargo;
      descripcion = `de la categoría ${x.nombre}`;
      await tx.update(categoria).set({ recargoDefault: valor, actualizadoPor: c.usuarioId }).where(eq(categoria.id, d.id));
      filtro = { productoIds: (await tx.select({ id: producto.id }).from(producto).where(eq(producto.categoriaId, d.id))).map((p) => p.id) };
    } else if (d.ambito === "PRODUCTO") {
      const [x] = await tx.select({ nombre: producto.nombre, recargo: producto.recargoDefault }).from(producto).where(eq(producto.id, d.id));
      if (!x) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el producto.");
      antes = x.recargo;
      descripcion = `del producto ${x.nombre}`;
      await tx.update(producto).set({ recargoDefault: valor, actualizadoPor: c.usuarioId }).where(eq(producto.id, d.id));
      filtro = { productoIds: [d.id] };
    } else {
      const [x] = await tx.select({ nombre: cliente.nombre, recargo: cliente.recargoDefault }).from(cliente).where(eq(cliente.id, d.id));
      if (!x) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el cliente.");
      antes = x.recargo;
      descripcion = `del cliente ${x.nombre}`;
      await tx.update(cliente).set({ recargoDefault: valor, actualizadoPor: c.usuarioId }).where(eq(cliente.id, d.id));
      filtro = { clienteId: d.id };
    }

    if ((antes === null ? null : dec(antes).toString()) === (valor === null ? null : dec(valor).toString())) return;
    await auditar(tx, {
      empresaId: c.empresaId,
      usuarioId: c.usuarioId,
      accion: "CAMBIO_RECARGO",
      entidad: d.ambito.toLowerCase(),
      entidadId: d.id ?? null,
      resumen: `Recargo ${descripcion}: ${antes === null ? "sin recargo" : formatearPorcentaje(antes, 1)} → ${valor === null ? "sin recargo" : formatearPorcentaje(valor, 1)}.`,
      datosAntes: { recargo: antes },
      datosDespues: { recargo: valor },
    });
    await registrarActividad(tx, c, d.ambito === "CLIENTE" && d.id ? { accion: "PRECIO", entidadTipo: "CLIENTE", entidadId: d.id, resumen: `cambió la ganancia ${descripcion}` } : d.ambito === "PRODUCTO" && d.id ? { accion: "PRECIO", entidadTipo: "PRODUCTO", entidadId: d.id, resumen: `cambió la ganancia ${descripcion}` } : { accion: "PRECIO", entidadTipo: "PRODUCTO", resumen: `cambió la ganancia ${descripcion}` });
    if (d.ambito === "GLOBAL" || filtro.clienteId || filtro.productoIds?.length) await recalcularPedidosPendientes(tx, filtro);
  });
}

export interface RecargosActuales {
  global: string;
  categorias: { id: string; nombre: string; recargo: string | null }[];
  productos: { id: string; nombre: string; categoria: string; recargo: string | null }[];
  clientes: { id: string; nombre: string; recargo: string | null; reglas: number }[];
}

/** Datos de la pantalla de precios de venta (P-32 simplificada). */
export async function recargosActuales(db: BaseDatos, authUserId: string): Promise<RecargosActuales> {
  return ejecutarComoUsuario(db, authUserId, "precios.ver_margenes", async (tx) => {
    const { hoy } = await hoyYSugerida(tx);
    const [e] = await tx.select({ global: empresa.recargoGlobal }).from(empresa);
    const categorias = await tx
      .select({ id: categoria.id, nombre: categoria.nombre, recargo: categoria.recargoDefault })
      .from(categoria)
      .where(eq(categoria.activo, true))
      .orderBy(asc(categoria.orden), asc(categoria.nombre));
    const productos = await tx
      .select({ id: producto.id, nombre: producto.nombre, categoria: categoria.nombre, recargo: producto.recargoDefault })
      .from(producto)
      .innerJoin(categoria, eq(categoria.id, producto.categoriaId))
      .where(eq(producto.activo, true))
      .orderBy(asc(categoria.orden), asc(categoria.nombre), asc(producto.nombre));
    const clientes = await tx
      .select({
        id: cliente.id,
        nombre: cliente.nombre,
        recargo: cliente.recargoDefault,
        reglas: sql<number>`(select count(*) from ${reglaPrecio} r where r.cliente_id = cliente.id and r.activo and (r.vigente_hasta is null or r.vigente_hasta >= ${hoy}))`,
      })
      .from(cliente)
      .where(eq(cliente.activo, true))
      .orderBy(asc(cliente.nombre));
    return { global: e!.global, categorias, productos, clientes: clientes.map((x) => ({ ...x, reglas: Number(x.reglas) })) };
  });
}

export interface PrecioDeLista {
  productoId: string;
  producto: string;
  categoria: string;
  unidadBase: string;
  presentacion: string | null;
  resultado: PrecioVenta;
}

/**
 * Lista de precios de un cliente para una fecha (vista "Por cliente" de P-32 y simulador
 * P-34): todos los productos activos en su presentación de venta por defecto.
 */
export async function listaDePreciosCliente(db: BaseDatos, authUserId: string, datos: { clienteId: string; fecha?: FechaISO }): Promise<{ fecha: FechaISO; precios: PrecioDeLista[] }> {
  return ejecutarComoUsuario(db, authUserId, "precios.ver_venta", async (tx) => {
    const fecha = datos.fecha ?? (await hoyYSugerida(tx)).sugerida;
    const productos = await tx
      .select({
        id: producto.id,
        nombre: producto.nombre,
        categoria: categoria.nombre,
        unidadBase: producto.unidadBase,
        presentacionId: producto.presentacionVentaDefaultId,
        presentacion: presentacion.nombre,
        esBase: presentacion.esUnidadBase,
      })
      .from(producto)
      .innerJoin(categoria, eq(categoria.id, producto.categoriaId))
      .leftJoin(presentacion, and(eq(presentacion.id, producto.presentacionVentaDefaultId), eq(presentacion.activo, true)))
      .where(eq(producto.activo, true))
      .orderBy(asc(categoria.orden), asc(categoria.nombre), asc(producto.nombre));
    const lineas = productos.map((p) => ({ productoId: p.id, presentacionId: p.presentacion && !p.esBase ? p.presentacionId : null }));
    const resultados = await calcularPrecios(tx, { clienteId: datos.clienteId, fecha, lineas });
    return {
      fecha,
      precios: productos.map((p, n) => ({
        productoId: p.id,
        producto: p.nombre,
        categoria: p.categoria,
        unidadBase: p.unidadBase,
        presentacion: lineas[n]!.presentacionId ? p.presentacion : null,
        resultado: resultados[n]!,
      })),
    };
  });
}
