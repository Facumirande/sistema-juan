import { randomUUID } from "node:crypto";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import * as esquema from "@/db/esquema";
import type { BaseDatos } from "@/db/tipos";
import { darDeAltaEmpresa } from "@/modulos/configuracion/alta-empresa";

export interface BaseDePrueba {
  pg: PGlite;
  db: BaseDatos;
  /** Ejecuta SQL como superusuario (para inspeccionar el catálogo o preparar datos). */
  comoSuperusuario<T>(fn: () => Promise<T>): Promise<T>;
}

/**
 * PostgreSQL en memoria con las migraciones aplicadas. La sesión queda como `app_servidor`
 * (LOGIN, NOINHERIT, sin BYPASSRLS), igual que la aplicación en producción.
 */
export async function crearBaseDePrueba(): Promise<BaseDePrueba> {
  const pg = new PGlite();
  const db = drizzle(pg, { schema: esquema });
  await migrate(db, { migrationsFolder: "src/db/migraciones" });
  await pg.exec(`
    create role app_servidor login noinherit nobypassrls;
    grant app_negocio, app_operativo, app_alta to app_servidor;
    set role app_servidor;
  `);
  return {
    pg,
    db: db as unknown as BaseDatos,
    async comoSuperusuario(fn) {
      await pg.exec("reset role");
      try {
        return await fn();
      } finally {
        await pg.exec("set role app_servidor");
      }
    },
  };
}

export async function crearEmpresaDePrueba(db: BaseDatos, nombre: string) {
  const authUserId = randomUUID();
  const resultado = await darDeAltaEmpresa(db, {
    nombre,
    administrador: { authUserId, nombre: `Admin ${nombre}`, email: `admin@${nombre.toLowerCase().replace(/\W+/g, "")}.test` },
  });
  return { ...resultado, authUserIdAdmin: authUserId };
}
