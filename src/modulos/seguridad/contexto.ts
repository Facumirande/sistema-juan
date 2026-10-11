import { and, eq, sql } from "drizzle-orm";

import { ErrorDeNegocio } from "@/dominio/errores";
import { empresa, rol, usuario, usuarioRol } from "@/db/esquema";
import { cambiarRol, enOrden, fijarUsuarioAuth } from "@/db/transaccion";
import { coloresDelNegocio } from "@/modulos/colaboracion/colores";
import type { BaseDatos, Transaccion } from "@/db/tipos";
import type { Permiso } from "@/seguridad/catalogo-permisos";
import { PermisosEfectivos } from "@/seguridad/permisos";
import { leerResponsables, type Responsables } from "@/dominio/pedidos/responsables";

/** Quién hace la acción y en qué empresa. Se arma en cada pedido al servidor (02 §10.3, regla 6). */
export interface ContextoUsuario {
  usuarioId: string;
  empresaId: string;
  nombre: string;
  /** Color de su avatar (elegido en "Mi cuenta" o asignado). */
  color: string;
  email: string;
  zonaHoraria: string;
  /** Hora a partir de la cual los pedidos pasan al día siguiente (nula = sin corte). */
  horaCortePedidos: string | null;
  /** Quién se encarga de cada parte del proceso (para avisarle cuando le toca). */
  responsables: Responsables;
  roles: string[];
  permisos: PermisosEfectivos;
  /** Entró con una clave provisoria: antes de usar el sistema elige la suya (02 §10.2). */
  debeCambiarClave: boolean;
}

const SESION_INVALIDA = "Tu sesión no es válida o tu usuario está desactivado. Ingresá de nuevo.";

/**
 * Resuelve el usuario de la aplicación a partir del usuario de Supabase Auth ya verificado
 * y fija su empresa en la transacción. Falla con NO_AUTENTICADO si no existe o está
 * desactivado, o si la empresa está inactiva (caso 11 de 02 §12).
 */
export async function resolverContexto(tx: Transaccion, authUserId: string): Promise<ContextoUsuario> {
  // Todo sale junto, en una sola ida y vuelta a la base: en la misma conexión las consultas se
  // ejecutan en el orden en que se piden (por eso `enOrden`), así que cuando llegan las que dependen
  // de la empresa ya está fijada (se toma de la fila del propio usuario, la única que puede leer
  // hasta ese momento).
  const [, , [u], [e], roles, colores] = await Promise.all([
    fijarUsuarioAuth(tx, authUserId),
    enOrden(tx.execute(sql`select set_config('app.empresa_id', coalesce((select u.empresa_id::text from usuario u where u.auth_user_id = ${authUserId}::uuid), ''), true)`)),
    tx
      .select({
        id: usuario.id,
        empresaId: usuario.empresaId,
        nombre: usuario.nombre,
        email: usuario.email,
        activo: usuario.activo,
        debeCambiarClave: usuario.debeCambiarClave,
      })
      .from(usuario)
      .where(eq(usuario.authUserId, authUserId)),
    tx.select({ activa: empresa.activa, zonaHoraria: empresa.zonaHoraria, horaCortePedidos: empresa.horaCortePedidos, responsables: empresa.responsablesEtapa }).from(empresa),
    tx
      .select({ codigo: rol.codigo, permisos: rol.permisos, activo: rol.activo })
      .from(usuarioRol)
      .innerJoin(rol, and(eq(rol.id, usuarioRol.rolId), eq(rol.empresaId, usuarioRol.empresaId)))
      .innerJoin(usuario, eq(usuario.id, usuarioRol.usuarioId))
      .where(eq(usuario.authUserId, authUserId)),
    coloresDelNegocio(tx),
  ]);
  if (!u || !u.activo) throw new ErrorDeNegocio("NO_AUTENTICADO", SESION_INVALIDA);
  if (!e?.activa) throw new ErrorDeNegocio("NO_AUTENTICADO", SESION_INVALIDA);

  return {
    usuarioId: u.id,
    empresaId: u.empresaId,
    nombre: u.nombre,
    color: colores.get(u.id)!,
    email: u.email,
    zonaHoraria: e.zonaHoraria,
    horaCortePedidos: e.horaCortePedidos,
    responsables: leerResponsables(e.responsables),
    roles: roles.filter((r) => r.activo).map((r) => r.codigo),
    permisos: new PermisosEfectivos(roles),
    debeCambiarClave: u.debeCambiarClave,
  };
}

/**
 * Una acción de negocio: transacción con rol `app_negocio`, contexto del usuario resuelto
 * y, si se indica, permiso verificado antes de ejecutar (01 §10.2: validar → autorizar →
 * transacción → dominio → grabar → auditar).
 */
export async function ejecutarComoUsuario<T>(
  db: BaseDatos,
  authUserId: string,
  permiso: Permiso | null,
  fn: (tx: Transaccion, contexto: ContextoUsuario) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    const [, contexto] = await Promise.all([cambiarRol(tx, "app_negocio"), resolverContexto(tx, authUserId)]);
    if (permiso) contexto.permisos.exigir(permiso);
    return fn(tx, contexto);
  });
}
