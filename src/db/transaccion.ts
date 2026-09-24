import { sql } from "drizzle-orm";

import type { BaseDatos, RolBase, Transaccion } from "./tipos";

const ROLES_PERMITIDOS: readonly RolBase[] = ["app_negocio", "app_operativo", "app_alta"];

/** Cambia el rol de la transacción. Solo acepta los roles conocidos (el nombre no se parametriza en SQL). */
export async function cambiarRol(tx: Transaccion, rol: RolBase): Promise<void> {
  if (!ROLES_PERMITIDOS.includes(rol)) throw new Error(`Rol de base desconocido: ${rol}`);
  await tx.execute(sql.raw(`set local role ${rol}`));
}

/** Fija la empresa de la transacción: todas las políticas RLS filtran por este valor (01 §11). */
export async function fijarEmpresa(tx: Transaccion, empresaId: string): Promise<void> {
  await tx.execute(sql`select set_config('app.empresa_id', ${empresaId}, true)`);
}

/** Fija el usuario de Supabase Auth ya verificado por el servidor. */
export async function fijarUsuarioAuth(tx: Transaccion, authUserId: string): Promise<void> {
  await tx.execute(sql`select set_config('app.auth_user_id', ${authUserId}, true)`);
}

/**
 * Ejecuta `fn` en una transacción con el rol de base indicado y la empresa fijada.
 * Si `fn` lanza un error, no queda nada a medias.
 */
export async function enEmpresa<T>(
  db: BaseDatos,
  empresaId: string,
  fn: (tx: Transaccion) => Promise<T>,
  rol: RolBase = "app_negocio",
): Promise<T> {
  return db.transaction(async (tx) => {
    await cambiarRol(tx, rol);
    await fijarEmpresa(tx, empresaId);
    return fn(tx);
  });
}
