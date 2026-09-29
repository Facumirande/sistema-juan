import { and, count, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { auditar } from "@/db/auditoria";
import { rol, usuario, usuarioRol } from "@/db/esquema";
import { cambiarRol, enEmpresa, fijarUsuarioAuth } from "@/db/transaccion";
import type { BaseDatos } from "@/db/tipos";
import { ErrorDeNegocio } from "@/dominio/errores";
import { configuracionInicialPendiente, EMPRESA_PRINCIPAL_ID } from "@/modulos/configuracion/configuracion-inicial";
import { registrarActividad } from "@/modulos/colaboracion/registro";
import { ejecutarComoUsuario } from "@/modulos/seguridad/contexto";
import type { ServicioCuentas } from "@/modulos/seguridad/cuentas";
import { validar } from "@/modulos/validacion";
import { interpretarIdentificador, LARGO_MINIMO_CLAVE, MENSAJE_IDENTIFICADOR_INVALIDO } from "@/seguridad/identificacion";

// Pedidos de acceso (decisión del 26/09/2026): cada persona entra por su cuenta, con Google o
// creándose un usuario en la app, y queda esperando hasta que un administrador la habilita.
// Como la app está en internet, nadie ve datos sin esa aprobación.

export type EstadoDeAcceso = "ACTIVO" | "PENDIENTE" | "SIN_ACCESO" | "SIN_PEDIDO";

/** Máximo de pedidos esperando respuesta: evita que alguien llene la lista creando cuentas. */
export const MAXIMO_PEDIDOS_PENDIENTES = 5;

const esPendiente = and(eq(usuario.activo, false), isNotNull(usuario.accesoPedidoEn), isNull(usuario.accesoAprobadoEn));

/** Qué le pasa a una cuenta de Supabase Auth en el sistema (lee solo su propia fila, política `usuario_propio`). */
export async function estadoDeAcceso(db: BaseDatos, authUserId: string): Promise<EstadoDeAcceso> {
  return db.transaction(async (tx) => {
    await cambiarRol(tx, "app_negocio");
    await fijarUsuarioAuth(tx, authUserId);
    const [u] = await tx
      .select({ activo: usuario.activo, pedido: usuario.accesoPedidoEn, aprobado: usuario.accesoAprobadoEn })
      .from(usuario)
      .where(eq(usuario.authUserId, authUserId));
    if (!u) return "SIN_PEDIDO";
    if (u.activo) return "ACTIVO";
    return u.pedido && !u.aprobado ? "PENDIENTE" : "SIN_ACCESO";
  });
}

export interface DatosPedido {
  authUserId: string;
  nombre: string;
  /** Correo de la cuenta (el de Google, o el interno si se creó con nombre de usuario). */
  email: string;
  nombreUsuario?: string | null;
}

/**
 * Registra el pedido de acceso de una cuenta ya verificada por Supabase Auth (el servidor la
 * obtuvo de la sesión, nunca del navegador). Si ya tiene fila, no hace nada y devuelve su estado.
 */
export async function pedirAcceso(db: BaseDatos, datos: DatosPedido): Promise<EstadoDeAcceso> {
  const actual = await estadoDeAcceso(db, datos.authUserId);
  if (actual !== "SIN_PEDIDO") return actual;
  if (await configuracionInicialPendiente(db)) throw new ErrorDeNegocio("VALIDACION", "El sistema todavía no está configurado.");

  return enEmpresa(db, EMPRESA_PRINCIPAL_ID, async (tx) => {
    const [fila] = await tx.select({ n: count() }).from(usuario).where(esPendiente);
    if (Number(fila?.n ?? 0) >= MAXIMO_PEDIDOS_PENDIENTES) {
      throw new ErrorDeNegocio("VALIDACION", "Hay demasiados pedidos de acceso sin responder. Avisale a quien administra el sistema.");
    }
    const nombre = datos.nombre.trim() || datos.email.split("@")[0]!;
    const [nuevo] = await tx
      .insert(usuario)
      .values({
        empresaId: EMPRESA_PRINCIPAL_ID,
        authUserId: datos.authUserId,
        nombre,
        email: datos.email.toLowerCase(),
        nombreUsuario: datos.nombreUsuario ?? null,
        activo: false,
        accesoPedidoEn: sql`now()`,
      })
      .returning({ id: usuario.id });
    await auditar(tx, {
      empresaId: EMPRESA_PRINCIPAL_ID,
      usuarioId: null,
      accion: "CREAR",
      entidad: "usuario",
      entidadId: nuevo!.id,
      resumen: `Pedido de acceso de ${nombre} (${datos.nombreUsuario ?? datos.email}).`,
    });
    return "PENDIENTE" as const;
  });
}

const esquemaCuentaPropia = z.object({
  nombre: z.string().trim().min(2, "Escribí tu nombre.").max(120),
  identificador: z.string(),
  clave: z.string().min(LARGO_MINIMO_CLAVE, `La contraseña tiene que tener al menos ${LARGO_MINIMO_CLAVE} caracteres.`).max(72),
});

/**
 * "Crear una cuenta" desde la app: crea la cuenta con usuario y contraseña y deja el pedido de
 * acceso. Devuelve el correo de la cuenta para iniciar la sesión.
 */
export async function crearCuentaPropia(db: BaseDatos, cuentas: ServicioCuentas, datos: z.input<typeof esquemaCuentaPropia>): Promise<{ email: string }> {
  const d = validar(esquemaCuentaPropia, datos);
  const identificador = interpretarIdentificador(d.identificador);
  if (!identificador) throw new ErrorDeNegocio("VALIDACION", MENSAJE_IDENTIFICADOR_INVALIDO);
  if (await configuracionInicialPendiente(db)) throw new ErrorDeNegocio("VALIDACION", "El sistema todavía no está configurado.");

  const pendientes = await enEmpresa(db, EMPRESA_PRINCIPAL_ID, (tx) => tx.select({ n: count() }).from(usuario).where(esPendiente));
  if (Number(pendientes[0]?.n ?? 0) >= MAXIMO_PEDIDOS_PENDIENTES) {
    throw new ErrorDeNegocio("VALIDACION", "Hay demasiados pedidos de acceso sin responder. Avisale a quien administra el sistema.");
  }

  let authUserId: string;
  try {
    authUserId = await cuentas.crear(identificador.email, d.clave);
  } catch (error) {
    if (error instanceof ErrorDeNegocio && error.detalle?.motivo === "CUENTA_EXISTENTE") {
      throw new ErrorDeNegocio("VALIDACION", "Ese usuario ya existe: elegí otro, o entrá con él si es tuyo.");
    }
    throw error;
  }
  try {
    await pedirAcceso(db, { authUserId, nombre: d.nombre, email: identificador.email, nombreUsuario: identificador.nombreUsuario });
  } catch (error) {
    await cuentas.eliminar(authUserId).catch(() => undefined);
    throw error;
  }
  return { email: identificador.email };
}

/** Pedidos esperando respuesta (para avisarle al administrador en el inicio). */
export async function contarPedidosPendientes(db: BaseDatos, authUserId: string): Promise<number> {
  return ejecutarComoUsuario(db, authUserId, "usuarios.administrar", async (tx) => {
    const [fila] = await tx.select({ n: count() }).from(usuario).where(esPendiente);
    return Number(fila?.n ?? 0);
  });
}

/**
 * Habilitar (queda ADMIN, como todos los que usan el sistema) o rechazar un pedido. Rechazar
 * bloquea la cuenta en Supabase Auth; si después se le devuelve el acceso, entra como ADMIN.
 */
export async function responderPedidoDeAcceso(
  db: BaseDatos,
  cuentas: ServicioCuentas,
  authUserId: string,
  datos: { usuarioId: string; aprobar: boolean },
): Promise<void> {
  await ejecutarComoUsuario(db, authUserId, "usuarios.administrar", async (tx, c) => {
    const [u] = await tx
      .select({ id: usuario.id, nombre: usuario.nombre, authUserId: usuario.authUserId })
      .from(usuario)
      .where(and(eq(usuario.id, datos.usuarioId), esPendiente))
      .for("update");
    if (!u) throw new ErrorDeNegocio("NO_ENCONTRADO", "Ese pedido ya no está pendiente.");

    if (datos.aprobar) {
      const [admin] = await tx.select({ id: rol.id }).from(rol).where(eq(rol.codigo, "ADMIN"));
      if (!admin) throw new Error("No existe el rol ADMIN.");
      await tx.update(usuario).set({ activo: true, accesoAprobadoEn: sql`now()`, actualizadoPor: c.usuarioId }).where(eq(usuario.id, u.id));
      await tx.insert(usuarioRol).values({ empresaId: c.empresaId, usuarioId: u.id, rolId: admin.id, creadoPor: c.usuarioId, actualizadoPor: c.usuarioId });
    } else {
      await tx.update(usuario).set({ accesoPedidoEn: null, actualizadoPor: c.usuarioId }).where(eq(usuario.id, u.id));
    }
    await auditar(tx, {
      empresaId: c.empresaId,
      usuarioId: c.usuarioId,
      accion: "CAMBIO_PERMISOS",
      entidad: "usuario",
      entidadId: u.id,
      resumen: `${datos.aprobar ? "Acceso habilitado" : "Pedido de acceso rechazado"}: ${u.nombre}.`,
    });
    if (datos.aprobar) await registrarActividad(tx, c, { accion: "HABILITAR", entidadTipo: "USUARIO", entidadId: u.id, resumen: `habilitó a ${u.nombre} para usar el sistema` });
    if (!datos.aprobar) await cuentas.bloquear(u.authUserId, true);
  });
}
