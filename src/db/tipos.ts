import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import type * as esquema from "./esquema";

/** Base de datos con el esquema completo; sirve tanto para postgres-js (servidor) como para PGlite (pruebas). */
export type BaseDatos = PgDatabase<PgQueryResultHKT, typeof esquema>;

/** Transacción abierta sobre `BaseDatos`. Una acción de negocio = una transacción (01 §10.2). */
export type Transaccion = Parameters<Parameters<BaseDatos["transaction"]>[0]>[0];

/** Roles de base sin login a los que cambia cada transacción (0001_seguridad_rls.sql). */
export type RolBase = "app_negocio" | "app_operativo" | "app_alta";
