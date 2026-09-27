import { and, asc, count, eq, ilike, ne, or, sql } from "drizzle-orm";
import { z } from "zod";

import { auditar, diferencias } from "@/db/auditoria";
import { condicionPago, proveedor, proveedorProducto } from "@/db/esquema";
import type { BaseDatos, Transaccion } from "@/db/tipos";
import { dec } from "@/dominio/dinero/decimal";
import { ErrorDeNegocio } from "@/dominio/errores";
import { ejecutarComoUsuario } from "@/modulos/seguridad/contexto";
import { enteroOpcional, numeroOpcional, textoObligatorio, textoOpcional, validar } from "@/modulos/validacion";

// P-20 Proveedores y P-21 Ficha de proveedor (08 §5.4). El límite y el plazo son datos
// financieros: se ven con proveedores.ver_credito y se cambian con proveedores.editar_limite.

export type CondicionPago = (typeof condicionPago.enumValues)[number];

export interface CreditoProveedor {
  /** Nulo = sin límite. */
  limiteCredito: string | null;
  plazoPagoDias: number | null;
  saldoActual: string;
}

export interface ProveedorListado {
  id: string;
  nombre: string;
  ubicacionMercado: string | null;
  telefono: string | null;
  condicionPagoHabitual: CondicionPago;
  ofertas: number;
  activo: boolean;
  /** Solo con `proveedores.ver_credito`. */
  credito: CreditoProveedor | null;
}

export interface FichaProveedor {
  id: string;
  codigo: string | null;
  nombre: string;
  razonSocial: string | null;
  identificacionFiscal: string | null;
  telefono: string | null;
  email: string | null;
  contactoNombre: string | null;
  ubicacionMercado: string | null;
  direccion: string | null;
  datosBancarios: string | null;
  condicionPagoHabitual: CondicionPago;
  observaciones: string | null;
  activo: boolean;
  credito: CreditoProveedor | null;
}

const MENSAJE_LIMITE = "El límite de crédito es un importe (dejalo vacío si no tiene límite).";

const esquemaProveedor = z.object({
  id: z.uuid().optional(),
  codigo: textoOpcional(20).transform((v) => v?.toUpperCase() ?? null),
  nombre: textoObligatorio("Escribí el nombre del proveedor.", 120),
  razonSocial: textoOpcional(160),
  identificacionFiscal: textoOpcional(20),
  telefono: textoOpcional(40),
  email: textoOpcional(120).refine((v) => v === null || z.email().safeParse(v).success, { message: "El correo no es válido." }),
  contactoNombre: textoOpcional(120),
  ubicacionMercado: textoOpcional(120),
  direccion: textoOpcional(200),
  datosBancarios: textoOpcional(300),
  condicionPagoHabitual: z.enum(condicionPago.enumValues, "Elegí la condición de pago habitual."),
  observaciones: textoOpcional(1000),
  /** `undefined` = no se toca (la pantalla no lo muestra sin permiso); `null` = sin límite. */
  limiteCredito: numeroOpcional(MENSAJE_LIMITE)
    .refine((v) => v === null || dec(v).gte(0), { message: MENSAJE_LIMITE })
    .optional(),
  plazoPagoDias: enteroOpcional("El plazo de pago son días enteros (vacío = sin plazo).")
    .transform((v) => (v === null ? null : Number(v)))
    .optional(),
});

function credito(p: { limiteCredito: string | null; plazoPagoDias: number | null; saldoActual: string }): CreditoProveedor {
  return { limiteCredito: p.limiteCredito, plazoPagoDias: p.plazoPagoDias, saldoActual: p.saldoActual };
}

export async function listarProveedores(
  db: BaseDatos,
  authUserId: string,
  filtros: { texto?: string; estado?: "activos" | "inactivos" | "todos" } = {},
): Promise<ProveedorListado[]> {
  return ejecutarComoUsuario(db, authUserId, "proveedores.ver", async (tx, c) => {
    const texto = filtros.texto?.trim();
    const estado = filtros.estado ?? "activos";
    const verCredito = c.permisos.tiene("proveedores.ver_credito");
    const filas = await tx
      .select({
        id: proveedor.id,
        nombre: proveedor.nombre,
        ubicacionMercado: proveedor.ubicacionMercado,
        telefono: proveedor.telefono,
        condicionPagoHabitual: proveedor.condicionPagoHabitual,
        activo: proveedor.activo,
        limiteCredito: proveedor.limiteCredito,
        plazoPagoDias: proveedor.plazoPagoDias,
        saldoActual: proveedor.saldoActual,
        ofertas: count(proveedorProducto.id),
      })
      .from(proveedor)
      .leftJoin(proveedorProducto, and(eq(proveedorProducto.proveedorId, proveedor.id), eq(proveedorProducto.activo, true)))
      .where(
        and(
          estado === "todos" ? undefined : eq(proveedor.activo, estado === "activos"),
          texto ? or(ilike(proveedor.nombre, `%${texto}%`), ilike(proveedor.ubicacionMercado, `%${texto}%`)) : undefined,
        ),
      )
      .groupBy(proveedor.id)
      .orderBy(sql`${proveedor.activo} desc`, asc(proveedor.nombre));
    return filas.map((f) => ({
      id: f.id,
      nombre: f.nombre,
      ubicacionMercado: f.ubicacionMercado,
      telefono: f.telefono,
      condicionPagoHabitual: f.condicionPagoHabitual,
      ofertas: Number(f.ofertas),
      activo: f.activo,
      credito: verCredito ? credito(f) : null,
    }));
  });
}

export async function obtenerProveedor(db: BaseDatos, authUserId: string, id: string): Promise<FichaProveedor> {
  return ejecutarComoUsuario(db, authUserId, "proveedores.ver", async (tx, c) => {
    const [p] = await tx.select().from(proveedor).where(eq(proveedor.id, id));
    if (!p) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el proveedor.");
    return {
      id: p.id,
      codigo: p.codigo,
      nombre: p.nombre,
      razonSocial: p.razonSocial,
      identificacionFiscal: p.identificacionFiscal,
      telefono: p.telefono,
      email: p.email,
      contactoNombre: p.contactoNombre,
      ubicacionMercado: p.ubicacionMercado,
      direccion: p.direccion,
      datosBancarios: p.datosBancarios,
      condicionPagoHabitual: p.condicionPagoHabitual,
      observaciones: p.observaciones,
      activo: p.activo,
      credito: c.permisos.tiene("proveedores.ver_credito") ? credito(p) : null,
    };
  });
}

async function exigirProveedorLibre(tx: Transaccion, nombre: string, codigo: string | null, excluirId?: string) {
  const [repetido] = await tx
    .select({ nombre: proveedor.nombre })
    .from(proveedor)
    .where(
      and(
        or(
          eq(sql`lower(${proveedor.nombre})`, nombre.toLowerCase()),
          codigo ? eq(sql`upper(${proveedor.codigo})`, codigo) : undefined,
        ),
        excluirId ? ne(proveedor.id, excluirId) : undefined,
      ),
    );
  if (repetido) throw new ErrorDeNegocio("VALIDACION", `Ya existe el proveedor "${repetido.nombre}" (mismo nombre o código).`);
}

/** Crea o modifica un proveedor. Los cambios de límite o plazo se auditan aparte (RN-105). */
export async function guardarProveedor(db: BaseDatos, authUserId: string, datos: z.input<typeof esquemaProveedor>): Promise<string> {
  const { id, limiteCredito, plazoPagoDias, ...d } = validar(esquemaProveedor, datos);
  return ejecutarComoUsuario(db, authUserId, "proveedores.editar", async (tx, c) => {
    await exigirProveedorLibre(tx, d.nombre, d.codigo, id);
    const cambiaCredito = limiteCredito !== undefined || plazoPagoDias !== undefined;
    if (cambiaCredito) c.permisos.exigir("proveedores.editar_limite");
    const creditoNuevo = {
      ...(limiteCredito !== undefined && { limiteCredito: limiteCredito === null ? null : dec(limiteCredito).toFixed(2) }),
      ...(plazoPagoDias !== undefined && { plazoPagoDias }),
    };

    if (!id) {
      const [nuevo] = await tx
        .insert(proveedor)
        .values({ ...d, ...creditoNuevo, empresaId: c.empresaId, creadoPor: c.usuarioId, actualizadoPor: c.usuarioId })
        .returning({ id: proveedor.id });
      await auditar(tx, {
        empresaId: c.empresaId,
        usuarioId: c.usuarioId,
        accion: "CREAR",
        entidad: "proveedor",
        entidadId: nuevo!.id,
        resumen: `Alta del proveedor ${d.nombre}.`,
        datosDespues: { ...d, ...creditoNuevo },
      });
      return nuevo!.id;
    }

    const [actual] = await tx.select().from(proveedor).where(eq(proveedor.id, id));
    if (!actual) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el proveedor.");
    const cambiosDatos = diferencias(actual, d);
    const cambiosCredito = diferencias(actual, creditoNuevo);
    if (!cambiosDatos.hayCambios && !cambiosCredito.hayCambios) return id;
    await tx.update(proveedor).set({ ...d, ...creditoNuevo, actualizadoPor: c.usuarioId }).where(eq(proveedor.id, id));
    if (cambiosDatos.hayCambios) {
      await auditar(tx, {
        empresaId: c.empresaId,
        usuarioId: c.usuarioId,
        accion: "MODIFICAR",
        entidad: "proveedor",
        entidadId: id,
        resumen: `Cambios en el proveedor ${d.nombre}.`,
        datosAntes: cambiosDatos.datosAntes,
        datosDespues: cambiosDatos.datosDespues,
      });
    }
    if (cambiosCredito.hayCambios) {
      await auditar(tx, {
        empresaId: c.empresaId,
        usuarioId: c.usuarioId,
        accion: "CAMBIO_LIMITE_CREDITO",
        entidad: "proveedor",
        entidadId: id,
        resumen: `Límite o plazo de pago de ${d.nombre}.`,
        datosAntes: cambiosCredito.datosAntes,
        datosDespues: cambiosCredito.datosDespues,
      });
    }
    return id;
  });
}

/** RN-108: un proveedor desactivado no aparece para comprar; sus ofertas salen de la lista general. */
export async function cambiarEstadoProveedor(db: BaseDatos, authUserId: string, datos: { id: string; activo: boolean }): Promise<void> {
  await ejecutarComoUsuario(db, authUserId, "proveedores.editar", async (tx, c) => {
    const [actual] = await tx.select({ nombre: proveedor.nombre, activo: proveedor.activo }).from(proveedor).where(eq(proveedor.id, datos.id));
    if (!actual) throw new ErrorDeNegocio("NO_ENCONTRADO", "No se encontró el proveedor.");
    if (actual.activo === datos.activo) return;
    await tx.update(proveedor).set({ activo: datos.activo, actualizadoPor: c.usuarioId }).where(eq(proveedor.id, datos.id));
    await auditar(tx, {
      empresaId: c.empresaId,
      usuarioId: c.usuarioId,
      accion: "CAMBIO_ESTADO",
      entidad: "proveedor",
      entidadId: datos.id,
      resumen: `${datos.activo ? "Reactivación" : "Desactivación"} del proveedor ${actual.nombre}.`,
      datosAntes: { activo: actual.activo },
      datosDespues: { activo: datos.activo },
    });
  });
}
