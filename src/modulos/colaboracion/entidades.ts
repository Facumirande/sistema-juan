import { eq, inArray } from "drizzle-orm";

import { cliente, compra, entrega, factura, jornada, listaCompra, pagoProveedor, pedido, producto, proveedor, reparto, usuario } from "@/db/esquema";
import type { Transaccion } from "@/db/tipos";
import { ErrorDeNegocio } from "@/dominio/errores";
import type { FechaISO } from "@/dominio/fechas/fechas";
import { formatearNumeroDocumento } from "@/dominio/numeracion/numeracion";
import type { ContextoUsuario } from "@/modulos/seguridad/contexto";
import type { Permiso } from "@/seguridad/catalogo-permisos";

import type { TipoEntidad } from "./registro";

// De qué habla una nota o un registro de actividad: quién la puede ver y cómo se la nombra.

/** Para ver las notas y la actividad de algo hace falta poder ver ese algo. */
export const PERMISO_PARA_VER: Readonly<Record<TipoEntidad, Permiso>> = {
  PEDIDO: "pedidos.ver",
  CLIENTE: "clientes.ver",
  PROVEEDOR: "proveedores.ver",
  PRODUCTO: "productos.ver",
  COMPRA: "compras.ver",
  PAGO: "pagos.ver",
  ENTREGA: "entregas.ver",
  REPARTO: "repartos.ver",
  JORNADA: "jornada.ver",
  LISTA_COMPRA: "lista_compra.ver",
  FACTURA: "facturacion.ver",
  USUARIO: "usuarios.administrar",
};

export interface Referencia {
  tipo: TipoEntidad;
  id: string;
}

export interface EntidadDescripta {
  /** "PED-000012 · Hospital San Martín", "Hnos. García"… */
  etiqueta: string;
  /** Día de trabajo, si corresponde a uno (para armar el enlace). */
  fecha: FechaISO | null;
}

export const claveDeReferencia = (r: Referencia) => `${r.tipo}:${r.id}`;

/** Las etiquetas de muchas referencias con una consulta por tipo. Las que no existen no aparecen. */
export async function describirEntidades(tx: Transaccion, referencias: readonly Referencia[]): Promise<Map<string, EntidadDescripta>> {
  const resultado = new Map<string, EntidadDescripta>();
  const ids = (tipo: TipoEntidad) => [...new Set(referencias.filter((r) => r.tipo === tipo).map((r) => r.id))];
  const poner = (tipo: TipoEntidad, id: string, etiqueta: string, fecha: FechaISO | null = null) => resultado.set(claveDeReferencia({ tipo, id }), { etiqueta, fecha });
  // Cada tipo se busca a la vez: todas las consultas salen juntas, en una sola ida a la base.
  const busquedas: Promise<void>[] = [];
  const buscar = (fn: () => Promise<void>) => void busquedas.push(fn());

  const pedidos = ids("PEDIDO");
  if (pedidos.length) {
    buscar(async () => {
      const filas = await tx
        .select({ id: pedido.id, numero: pedido.numero, cliente: cliente.nombre, fecha: jornada.fecha })
        .from(pedido)
        .innerJoin(cliente, eq(cliente.id, pedido.clienteId))
        .innerJoin(jornada, eq(jornada.id, pedido.jornadaId))
        .where(inArray(pedido.id, pedidos));
      for (const f of filas) poner("PEDIDO", f.id, `${formatearNumeroDocumento("PED-", f.numero)} · ${f.cliente}`, f.fecha);
    });
  }
  const simples: [TipoEntidad, typeof cliente | typeof proveedor | typeof producto][] = [
    ["CLIENTE", cliente],
    ["PROVEEDOR", proveedor],
    ["PRODUCTO", producto],
  ];
  for (const [tipo, tabla] of simples) {
    const lista = ids(tipo);
    if (!lista.length) continue;
    buscar(async () => {
      const filas = await tx.select({ id: tabla.id, nombre: tabla.nombre }).from(tabla).where(inArray(tabla.id, lista));
      for (const f of filas) poner(tipo, f.id, f.nombre);
    });
  }
  const compras = ids("COMPRA");
  if (compras.length) {
    buscar(async () => {
      const filas = await tx
        .select({ id: compra.id, numero: compra.numero, proveedor: proveedor.nombre, fecha: jornada.fecha })
        .from(compra)
        .innerJoin(proveedor, eq(proveedor.id, compra.proveedorId))
        .leftJoin(jornada, eq(jornada.id, compra.jornadaId))
        .where(inArray(compra.id, compras));
      for (const f of filas) poner("COMPRA", f.id, `${formatearNumeroDocumento("COM-", f.numero)} · ${f.proveedor}`, f.fecha);
    });
  }
  const pagos = ids("PAGO");
  if (pagos.length) {
    buscar(async () => {
      const filas = await tx
        .select({ id: pagoProveedor.id, numero: pagoProveedor.numero, proveedor: proveedor.nombre })
        .from(pagoProveedor)
        .innerJoin(proveedor, eq(proveedor.id, pagoProveedor.proveedorId))
        .where(inArray(pagoProveedor.id, pagos));
      for (const f of filas) poner("PAGO", f.id, `${formatearNumeroDocumento("PAG-", f.numero)} · ${f.proveedor}`);
    });
  }
  const entregas = ids("ENTREGA");
  if (entregas.length) {
    buscar(async () => {
      const filas = await tx
        .select({ id: entrega.id, numero: entrega.numero, cliente: cliente.nombre, fecha: jornada.fecha })
        .from(entrega)
        .innerJoin(cliente, eq(cliente.id, entrega.clienteId))
        .innerJoin(jornada, eq(jornada.id, entrega.jornadaId))
        .where(inArray(entrega.id, entregas));
      for (const f of filas) poner("ENTREGA", f.id, `${formatearNumeroDocumento("ENT-", f.numero)} · ${f.cliente}`, f.fecha);
    });
  }
  const repartos = ids("REPARTO");
  if (repartos.length) {
    buscar(async () => {
      const filas = await tx
        .select({ id: reparto.id, numero: reparto.numero, fecha: jornada.fecha })
        .from(reparto)
        .innerJoin(jornada, eq(jornada.id, reparto.jornadaId))
        .where(inArray(reparto.id, repartos));
      for (const f of filas) poner("REPARTO", f.id, formatearNumeroDocumento("REP-", f.numero), f.fecha);
    });
  }
  const jornadas = ids("JORNADA");
  if (jornadas.length) {
    buscar(async () => {
      const filas = await tx.select({ id: jornada.id, fecha: jornada.fecha }).from(jornada).where(inArray(jornada.id, jornadas));
      for (const f of filas) poner("JORNADA", f.id, `el día ${f.fecha.slice(8, 10)}/${f.fecha.slice(5, 7)}`, f.fecha);
    });
  }
  const listas = ids("LISTA_COMPRA");
  if (listas.length) {
    buscar(async () => {
      const filas = await tx
        .select({ id: listaCompra.id, numero: listaCompra.numero, fecha: jornada.fecha })
        .from(listaCompra)
        .innerJoin(jornada, eq(jornada.id, listaCompra.jornadaId))
        .where(inArray(listaCompra.id, listas));
      for (const f of filas) poner("LISTA_COMPRA", f.id, formatearNumeroDocumento("LC-", f.numero), f.fecha);
    });
  }
  const facturas = ids("FACTURA");
  if (facturas.length) {
    buscar(async () => {
      const filas = await tx
        .select({ id: factura.id, numero: factura.numero, cliente: cliente.nombre })
        .from(factura)
        .innerJoin(cliente, eq(cliente.id, factura.clienteId))
        .where(inArray(factura.id, facturas));
      for (const f of filas) poner("FACTURA", f.id, `${formatearNumeroDocumento("FAC-", f.numero)} · ${f.cliente}`);
    });
  }
  const usuarios = ids("USUARIO");
  if (usuarios.length) {
    buscar(async () => {
      const filas = await tx.select({ id: usuario.id, nombre: usuario.nombre }).from(usuario).where(inArray(usuario.id, usuarios));
      for (const f of filas) poner("USUARIO", f.id, f.nombre);
    });
  }
  await Promise.all(busquedas);
  return resultado;
}

/** Que la persona pueda ver eso y que exista (para escribirle o leerle notas). */
export async function exigirEntidadVisible(tx: Transaccion, c: ContextoUsuario, referencia: Referencia): Promise<EntidadDescripta> {
  c.permisos.exigir(PERMISO_PARA_VER[referencia.tipo]);
  const descripta = (await describirEntidades(tx, [referencia])).get(claveDeReferencia(referencia));
  if (!descripta) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró eso.");
  // El repartidor ve solo las entregas de sus repartos (RN-131).
  if (referencia.tipo === "ENTREGA" && !c.permisos.tiene("repartos.ver")) {
    const [e] = await tx.select({ repartidorId: reparto.repartidorId }).from(entrega).leftJoin(reparto, eq(reparto.id, entrega.repartoId)).where(eq(entrega.id, referencia.id));
    if (e?.repartidorId !== c.usuarioId) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró eso.");
  }
  return descripta;
}
