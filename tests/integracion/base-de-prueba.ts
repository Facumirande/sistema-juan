import { randomUUID } from "node:crypto";

import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import * as esquema from "@/db/esquema";
import { rol, usuario, usuarioRol } from "@/db/esquema";
import { esDeLectura } from "@/db/conexion";
import { conLiterales } from "@/db/literales";
import { enEmpresa } from "@/db/transaccion";
import type { BaseDatos } from "@/db/tipos";
import { esErrorDeNegocio } from "@/dominio/errores";
import { darDeAltaEmpresa } from "@/modulos/configuracion/alta-empresa";

export interface BaseDePrueba {
  pg: PGlite;
  db: BaseDatos;
  /** Ejecuta SQL como superusuario (para inspeccionar el catálogo o preparar datos). */
  comoSuperusuario<T>(fn: () => Promise<T>): Promise<T>;
}

type ConConsultas = { query: (consulta: string, parametros?: unknown[], opciones?: unknown) => unknown };

// Reloj lógico de las idas a la base: cada consulta sale cuando terminó la que esperaba y tarda
// una ida; las que salen juntas (Promise.all) cuentan una sola. Como en producción
// (`src/db/conexion.ts`), abrir la transacción no cuesta una ida y cerrarla cuesta una solo si se
// escribió algo. Es lo que tarda de verdad una pantalla o un botón: cada ida son unos 50 ms desde
// la oficina.
const reloj = { ahora: 0, consultas: 0 };

/** Una ida a la base (o varias juntas): empieza cuando el que la pide ya recibió lo anterior. */
async function ida<T>(fn: () => T | Promise<T>): Promise<T> {
  const fin = reloj.ahora + 1;
  reloj.consultas++;
  try {
    return await fn();
  } finally {
    reloj.ahora = Math.max(reloj.ahora, fin);
  }
}

/**
 * Cuántas idas a la base hace `fn` (el camino más largo: lo que sale junto cuenta una vez) y cuántas
 * consultas manda. Sirve para cuidar la velocidad: ver `tests/integracion/velocidad.test.ts`.
 */
export async function medirIdas<T>(fn: () => Promise<T>): Promise<{ idas: number; consultas: number; resultado: T }> {
  const antes = { ...reloj };
  const resultado = await fn();
  return { idas: reloj.ahora - antes.ahora, consultas: reloj.consultas - antes.consultas, resultado };
}

/**
 * En las pruebas los valores también van escritos dentro de cada consulta, igual que en producción
 * (`src/db/cliente.ts`): así todas las pruebas ejercitan ese mismo camino.
 */
function usarLiterales(pg: PGlite): void {
  const envolver = (cliente: ConConsultas, marca?: { escribio: boolean }) => {
    const original = cliente.query.bind(cliente);
    cliente.query = (consulta, parametros, opciones) => {
      if (marca && !esDeLectura(consulta)) marca.escribio = true;
      return ida(() => original(conLiterales(consulta, parametros ?? []), [], opciones));
    };
  };
  envolver(pg as unknown as ConConsultas);
  const base = pg as unknown as { transaction: (fn: (tx: ConConsultas) => unknown, ...resto: unknown[]) => unknown };
  const transaccion = base.transaction.bind(base);
  base.transaction = (fn, ...resto) =>
    transaccion(async (tx) => {
      const marca = { escribio: false };
      envolver(tx, marca);
      const resultado = await fn(tx);
      // El "commit" se espera solo si hay algo que guardar.
      if (marca.escribio) await ida(() => undefined);
      return resultado;
    }, ...resto);
}

/**
 * PostgreSQL en memoria con las migraciones aplicadas. La sesión queda como `app_servidor`
 * (LOGIN, NOINHERIT, sin BYPASSRLS), igual que la aplicación en producción.
 */
export async function crearBaseDePrueba(): Promise<BaseDePrueba> {
  const pg = new PGlite({ extensions: { btree_gist } });
  usarLiterales(pg);
  const db = drizzle(pg, { schema: esquema });
  await migrate(db, { migrationsFolder: "src/db/migraciones" });
  await pg.exec(`
    create role app_servidor login noinherit nobypassrls;
    grant app_negocio, app_operativo, app_alta to app_servidor;
    grant execute on function public.pulso_de_cambios() to app_servidor;
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

/** Resultado de una promesa como código corto: el código de negocio o el tipo de error de la base. */
export async function codigoDeError(promesa: Promise<unknown>): Promise<string> {
  try {
    await promesa;
  } catch (e) {
    if (esErrorDeNegocio(e)) return e.codigo;
    const mensaje = e instanceof Error ? `${e.message} ${String((e as { cause?: unknown }).cause ?? "")}` : String(e);
    if (/row-level security/i.test(mensaje)) return "RLS";
    if (/permission denied/i.test(mensaje)) return "PERMISO_BD";
    if (/registro inmutable/i.test(mensaje)) return "INMUTABLE";
    if (/check constraint/i.test(mensaje)) return "CHECK";
    return `OTRO: ${mensaje}`;
  }
  return "SIN_ERROR";
}

/** Usuario con uno o más roles de sistema en la empresa; devuelve su id de Supabase Auth. */
export async function crearUsuarioDePrueba(db: BaseDatos, empresaId: string, nombre: string, roles: string[]): Promise<string> {
  const authUserId = randomUUID();
  await enEmpresa(db, empresaId, async (tx) => {
    const [u] = await tx
      .insert(usuario)
      .values({ empresaId, authUserId, nombre, email: `${authUserId}@prueba.test` })
      .returning({ id: usuario.id });
    const filas = await tx.select({ id: rol.id }).from(rol).where(inArray(rol.codigo, roles));
    await tx.insert(usuarioRol).values(filas.map((r) => ({ empresaId, usuarioId: u!.id, rolId: r.id })));
  });
  return authUserId;
}
